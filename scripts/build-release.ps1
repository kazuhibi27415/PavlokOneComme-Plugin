[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$packageName = 'pavlok-onecomme-plugin'
$packageDirectory = [System.IO.Path]::GetFullPath((Join-Path $distRoot $packageName))

if ([System.IO.Path]::GetDirectoryName($packageDirectory).TrimEnd('\') -ne $distRoot.TrimEnd('\')) {
  throw 'The package directory must be directly under dist.'
}

$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'VERSION.txt') -Encoding utf8 -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Invalid VERSION.txt value: $version"
}

$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Encoding utf8 -Raw | ConvertFrom-Json
if ([string]$packageJson.version -ne $version) {
  throw "package.json version ($($packageJson.version)) does not match VERSION.txt ($version)."
}

$historyFile = -join @([char]0x66F4, [char]0x65B0, [char]0x5C65, [char]0x6B74, '.md')
$releaseFiles = @(
  'app.js'
  'index.html'
  'LICENSE'
  'package.json'
  'plugin.js'
  'README.md'
  'style.css'
  'VERSION.txt'
  $historyFile
)

foreach ($file in $releaseFiles) {
  $source = Join-Path $projectRoot $file
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Missing release file: $file"
  }
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pavlok-release-" + [System.Guid]::NewGuid().ToString('N'))
$stagedPackage = Join-Path $tempRoot $packageName
$archiveName = "PavlokOneComme-Plugin-v$version.zip"
$stagedArchive = Join-Path $tempRoot $archiveName
$archivePath = [System.IO.Path]::GetFullPath((Join-Path $distRoot $archiveName))

try {
  New-Item -ItemType Directory -Path $stagedPackage -Force | Out-Null
  foreach ($file in $releaseFiles) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stagedPackage $file)
  }

  $actualFiles = @(Get-ChildItem -LiteralPath $stagedPackage -File | ForEach-Object Name | Sort-Object)
  $expectedFiles = @($releaseFiles | Sort-Object)
  $difference = @(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles)
  if ($difference.Count -ne 0) {
    throw 'Staged files do not match the release allowlist.'
  }

  Compress-Archive -LiteralPath $stagedPackage -DestinationPath $stagedArchive -CompressionLevel Optimal

  if (Test-Path -LiteralPath $packageDirectory) {
    Remove-Item -LiteralPath $packageDirectory -Recurse -Force
  }
  Copy-Item -LiteralPath $stagedPackage -Destination $packageDirectory -Recurse

  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  Copy-Item -LiteralPath $stagedArchive -Destination $archivePath
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

Write-Output "Release directory: $packageDirectory"
Write-Output "Release archive: $archivePath"
