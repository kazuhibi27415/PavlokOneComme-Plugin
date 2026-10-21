'use strict'

const UID = 'com.kaz.pavlok-superchat'
const API = `/api/plugins/${UID}`
let loaded = false
let monitoring = false
let manualRunning = false

const byId = id => document.getElementById(id)

async function api(method, body) {
  const options = { method }
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  const response = await fetch(API, options)
  const payload = await response.json()
  const result = payload.response === undefined ? payload : payload.response
  if (!response.ok || (result && result.error)) throw new Error((result && result.error) || `HTTP ${response.status}`)
  return result
}

function showMessage(text, type = 'success') {
  const element = byId('message')
  element.textContent = text
  element.className = type
}

function makeInput(type, value, className) {
  const input = document.createElement('input')
  input.type = type
  input.value = value
  input.className = `setting-input ${className}`
  if (type === 'number') {
    input.min = '1'
    input.max = '100'
    input.step = '1'
  }
  return input
}

function renderGroups(groups) {
  const body = byId('group-rows')
  body.replaceChildren()
  groups.forEach((group, index) => {
    const row = document.createElement('tr')
    row.dataset.group = String(index)
    const enabledCell = document.createElement('td')
    const enabled = document.createElement('input')
    enabled.type = 'checkbox'
    enabled.checked = group.enabled
    enabled.className = 'setting-input group-enabled'
    enabled.setAttribute('aria-label', `グループ${index + 1}を使用`)
    enabledCell.append(enabled)
    const amountCell = document.createElement('td')
    amountCell.append(makeInput('text', group.amounts, 'group-amounts'))
    const modeCell = document.createElement('td')
    const mode = document.createElement('select')
    mode.className = 'setting-input group-mode'
    ;[['fixed', '固定'], ['random', 'ランダム']].forEach(([value, label]) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      option.selected = group.outputMode === value
      mode.append(option)
    })
    modeCell.append(mode)
    const fixedCell = document.createElement('td')
    fixedCell.append(makeInput('number', group.fixedOutput, 'group-fixed'))
    const minCell = document.createElement('td')
    minCell.append(makeInput('number', group.randomMin, 'group-min'))
    const maxCell = document.createElement('td')
    maxCell.append(makeInput('number', group.randomMax, 'group-max'))
    row.append(enabledCell, amountCell, modeCell, fixedCell, minCell, maxCell)
    body.append(row)
  })
}

function renderSettings(state) {
  const settings = state.settings
  byId('pavlok-enabled').checked = settings.pavlokEnabled
  byId('ignore-initial').checked = settings.ignoreInitialHistory
  byId('delay-seconds').value = settings.delaySeconds
  byId('cooldown-seconds').value = settings.cooldownSeconds
  renderGroups(settings.groups)
  byId('token-state').textContent = state.tokenConfigured
    ? 'PavlokトークンはOS暗号化で保存済みです。変更しない場合は入力不要です。'
    : state.encryptionAvailable
      ? 'Pavlokトークンは未設定です。実機送信を使う場合だけ入力してください。'
      : 'OS暗号化を利用できないため、この環境ではトークンを保存できません。'
}

function renderRuntime(state) {
  monitoring = state.monitoring
  manualRunning = state.manualRunning === true
  const badge = byId('monitor-badge')
  badge.textContent = monitoring ? '監視中' : '停止中'
  badge.className = `badge ${monitoring ? 'running' : 'stopped'}`
  byId('queue-state').textContent = `予約 ${state.queueLength}件`
  byId('start-button').disabled = monitoring
  byId('stop-button').disabled = !monitoring
  byId('save-button').disabled = monitoring
  byId('manual-button').disabled = monitoring || manualRunning
  byId('manual-output').disabled = monitoring || manualRunning
  document.querySelectorAll('.setting-input').forEach(control => { control.disabled = monitoring })
  const logs = byId('logs')
  const atBottom = logs.scrollTop + logs.clientHeight >= logs.scrollHeight - 12
  logs.textContent = (state.logs || []).join('\n')
  if (atBottom) logs.scrollTop = logs.scrollHeight
}

function collectSettings() {
  const groups = [...document.querySelectorAll('#group-rows tr')].map(row => ({
    enabled: row.querySelector('.group-enabled').checked,
    amounts: row.querySelector('.group-amounts').value.trim(),
    outputMode: row.querySelector('.group-mode').value,
    fixedOutput: Number(row.querySelector('.group-fixed').value),
    randomMin: Number(row.querySelector('.group-min').value),
    randomMax: Number(row.querySelector('.group-max').value)
  }))
  return {
    pavlokEnabled: byId('pavlok-enabled').checked,
    ignoreInitialHistory: byId('ignore-initial').checked,
    delaySeconds: Number(byId('delay-seconds').value),
    cooldownSeconds: Number(byId('cooldown-seconds').value),
    groups
  }
}

async function saveSettings(showSuccess = true) {
  const token = byId('pavlok-token').value
  const state = await api('PUT', {
    settings: collectSettings(),
    pavlokToken: token,
    clearToken: byId('clear-token').checked
  })
  byId('pavlok-token').value = ''
  byId('clear-token').checked = false
  renderSettings(state)
  renderRuntime(state)
  if (showSuccess) showMessage('設定を保存しました。')
  return state
}

async function run(action) {
  try {
    if (action === 'start') await saveSettings(false)
    const state = await api('POST', { action })
    renderRuntime(state)
    showMessage(action === 'start' ? '監視を開始しました。' : '監視を停止しました。')
  } catch (error) {
    showMessage(error.message, 'error')
  }
}

async function runManual() {
  const output = Number(byId('manual-output').value)
  if (!Number.isInteger(output) || output < 1 || output > 100) {
    showMessage('手動実行の出力値は1～100の整数で指定してください。', 'error')
    return
  }
  manualRunning = true
  byId('manual-button').disabled = true
  byId('manual-output').disabled = true
  try {
    await saveSettings(false)
    const state = await api('POST', { action: 'manual', output })
    renderRuntime(state)
    showMessage(state.settings.pavlokEnabled ? `出力${output}でZapを手動実行しました。` : `出力${output}のDRY-RUNを実行しました。`)
  } catch (error) {
    showMessage(error.message, 'error')
  } finally {
    manualRunning = false
    await refresh()
  }
}

async function refresh() {
  try {
    const state = await api('GET')
    if (!loaded) {
      renderSettings(state)
      loaded = true
    }
    renderRuntime(state)
  } catch (error) {
    showMessage(`プラグインへ接続できません: ${error.message}`, 'error')
  }
}

byId('save-button').addEventListener('click', async () => {
  try { await saveSettings(true) } catch (error) { showMessage(error.message, 'error') }
})
byId('start-button').addEventListener('click', () => run('start'))
byId('stop-button').addEventListener('click', () => run('stop'))
byId('manual-button').addEventListener('click', runManual)

refresh()
setInterval(refresh, 1000)
