'use strict'

const UID = 'com.kaz.pavlok-superchat'
const API = `/api/plugins/${UID}`
let loaded = false
let monitoring = false
let starting = false
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

function renderSettings(state) {
  const settings = state.settings
  byId('pavlok-enabled').checked = settings.pavlokEnabled
  byId('wordparty-enabled').checked = settings.wordPartyEnabled
  byId('wordparty-hit-id').value = settings.wordPartyHitId
  byId('wordparty-bonus-id').value = settings.wordPartyBonusId
  byId('wordparty-miss-1-id').value = settings.wordPartyMiss1Id
  byId('wordparty-miss-2-id').value = settings.wordPartyMiss2Id
  byId('wordparty-miss-3-id').value = settings.wordPartyMiss3Id
  byId('wordparty-miss-4-id').value = settings.wordPartyMiss4Id
  byId('ignore-initial').checked = settings.ignoreInitialHistory
  byId('delay-seconds').value = settings.delaySeconds
  byId('hit-delay-seconds').value = settings.hitDelaySeconds
  byId('bonus-first-delay-seconds').value = settings.bonusFirstDelaySeconds
  byId('bonus-second-delay-seconds').value = settings.bonusSecondDelaySeconds
  byId('target-amount').value = settings.targetAmount
  byId('output-mode').value = settings.outputMode
  byId('fixed-output').value = settings.fixedOutput
  byId('random-min').value = settings.randomMin
  byId('random-max').value = settings.randomMax
  byId('token-state').textContent = state.tokenConfigured
    ? 'PavlokトークンはOS暗号化で保存済みです。変更しない場合は入力不要です。'
    : state.encryptionAvailable
      ? 'Pavlokトークンは未設定です。実機送信を使う場合だけ入力してください。'
      : 'OS暗号化を利用できないため、この環境ではトークンを保存できません。'
}

function renderRuntime(state) {
  monitoring = state.monitoring
  starting = state.starting === true
  manualRunning = state.manualRunning === true
  const badge = byId('monitor-badge')
  badge.textContent = starting ? '開始中' : monitoring ? '監視中' : '停止中'
  badge.className = `badge ${starting ? 'starting' : monitoring ? 'running' : 'stopped'}`
  byId('queue-state').textContent = `予約 ${state.queueLength}件`
  byId('start-button').disabled = monitoring || starting
  byId('stop-button').disabled = !monitoring || starting
  byId('save-button').disabled = monitoring || starting
  byId('manual-button').disabled = monitoring || starting || manualRunning
  byId('manual-output').disabled = monitoring || starting || manualRunning
  document.querySelectorAll('.setting-input').forEach(control => { control.disabled = monitoring || starting })
  const logs = byId('logs')
  const atBottom = logs.scrollTop + logs.clientHeight >= logs.scrollHeight - 12
  logs.textContent = (state.logs || []).join('\n')
  if (atBottom) logs.scrollTop = logs.scrollHeight
}

function collectSettings() {
  return {
    pavlokEnabled: byId('pavlok-enabled').checked,
    wordPartyEnabled: byId('wordparty-enabled').checked,
    wordPartyHitId: byId('wordparty-hit-id').value.trim(),
    wordPartyBonusId: byId('wordparty-bonus-id').value.trim(),
    wordPartyMiss1Id: byId('wordparty-miss-1-id').value.trim(),
    wordPartyMiss2Id: byId('wordparty-miss-2-id').value.trim(),
    wordPartyMiss3Id: byId('wordparty-miss-3-id').value.trim(),
    wordPartyMiss4Id: byId('wordparty-miss-4-id').value.trim(),
    ignoreInitialHistory: byId('ignore-initial').checked,
    delaySeconds: Number(byId('delay-seconds').value),
    hitDelaySeconds: Number(byId('hit-delay-seconds').value),
    bonusFirstDelaySeconds: Number(byId('bonus-first-delay-seconds').value),
    bonusSecondDelaySeconds: Number(byId('bonus-second-delay-seconds').value),
    targetAmount: Number(byId('target-amount').value),
    outputMode: byId('output-mode').value,
    fixedOutput: Number(byId('fixed-output').value),
    randomMin: Number(byId('random-min').value),
    randomMax: Number(byId('random-max').value)
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
    showMessage(state.settings.pavlokEnabled ? `出力${output}で電撃を手動実行しました。` : `出力${output}のDRY-RUNを実行しました。`)
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
