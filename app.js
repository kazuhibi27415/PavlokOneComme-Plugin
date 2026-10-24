'use strict'

const UID = 'com.kaz.pavlok-superchat'
const API = `/api/plugins/${UID}`
let loaded = false
let monitoring = false
let starting = false
let manualRunning = false

const byId = id => document.getElementById(id)
const EXTRA_SLOT_CONTROLS = [
  { slot: 7, checkboxId: 'slot-hit-2-enabled', cardId: 'slot-hit-2-card' },
  { slot: 8, checkboxId: 'slot-miss-5-enabled', cardId: 'slot-miss-5-card' },
  { slot: 9, checkboxId: 'slot-miss-6-enabled', cardId: 'slot-miss-6-card' },
  { slot: 10, checkboxId: 'slot-miss-7-enabled', cardId: 'slot-miss-7-card' },
  { slot: 11, checkboxId: 'slot-miss-8-enabled', cardId: 'slot-miss-8-card' }
]

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

function updateLotteryDisplay() {
  const activeSlots = [1, 2, 3, 4, 5, 6]
  for (const control of EXTRA_SLOT_CONTROLS) {
    if (byId(control.checkboxId).checked) activeSlots.push(control.slot)
  }
  const slotCount = activeSlots.length
  byId('lottery-summary').textContent = `対象金額は1つだけです。完全一致したSuper Chatごとに、使用中の${slotCount}枠を重み1で均等に抽選します。`
  byId('wordparty-slot-summary').textContent = `演出IDと演出時間は、下の「びりびり設定」にある${slotCount}つの使用枠ごとに設定します。`
  document.querySelectorAll('.slot-odds').forEach(element => {
    const slot = Number(element.dataset.position)
    const activeIndex = activeSlots.indexOf(slot)
    const label = activeIndex < 0 ? '追加枠・未使用' : `${activeIndex + 1}枠目・1/${slotCount}`
    element.textContent = `${label}・${element.dataset.stimulus}`
  })
  for (const control of EXTRA_SLOT_CONTROLS) {
    byId(control.cardId).classList.toggle('inactive', !byId(control.checkboxId).checked)
  }
}

function renderSettings(state) {
  const settings = state.settings
  byId('pavlok-enabled').checked = settings.pavlokEnabled
  byId('wordparty-enabled').checked = settings.wordPartyEnabled
  byId('slot-hit-2-enabled').checked = settings.slotHit2Enabled
  byId('slot-miss-5-enabled').checked = settings.slotMiss5Enabled
  byId('slot-miss-6-enabled').checked = settings.slotMiss6Enabled
  byId('slot-miss-7-enabled').checked = settings.slotMiss7Enabled
  byId('slot-miss-8-enabled').checked = settings.slotMiss8Enabled
  byId('wordparty-hit-id').value = settings.wordPartyHitId
  byId('wordparty-hit-2-id').value = settings.wordPartyHit2Id
  byId('wordparty-bonus-id').value = settings.wordPartyBonusId
  byId('wordparty-miss-1-id').value = settings.wordPartyMiss1Id
  byId('wordparty-miss-2-id').value = settings.wordPartyMiss2Id
  byId('wordparty-miss-3-id').value = settings.wordPartyMiss3Id
  byId('wordparty-miss-4-id').value = settings.wordPartyMiss4Id
  byId('wordparty-miss-5-id').value = settings.wordPartyMiss5Id
  byId('wordparty-miss-6-id').value = settings.wordPartyMiss6Id
  byId('wordparty-miss-7-id').value = settings.wordPartyMiss7Id
  byId('wordparty-miss-8-id').value = settings.wordPartyMiss8Id
  byId('slot-hit-name').value = settings.slotHitName
  byId('slot-hit-2-name').value = settings.slotHit2Name
  byId('slot-bonus-name').value = settings.slotBonusName
  byId('slot-miss-1-name').value = settings.slotMiss1Name
  byId('slot-miss-2-name').value = settings.slotMiss2Name
  byId('slot-miss-3-name').value = settings.slotMiss3Name
  byId('slot-miss-4-name').value = settings.slotMiss4Name
  byId('slot-miss-5-name').value = settings.slotMiss5Name
  byId('slot-miss-6-name').value = settings.slotMiss6Name
  byId('slot-miss-7-name').value = settings.slotMiss7Name
  byId('slot-miss-8-name').value = settings.slotMiss8Name
  byId('slot-hit-title').textContent = settings.slotHitName
  byId('slot-hit-2-title').textContent = settings.slotHit2Name
  byId('slot-bonus-title').textContent = settings.slotBonusName
  byId('slot-miss-1-title').textContent = settings.slotMiss1Name
  byId('slot-miss-2-title').textContent = settings.slotMiss2Name
  byId('slot-miss-3-title').textContent = settings.slotMiss3Name
  byId('slot-miss-4-title').textContent = settings.slotMiss4Name
  byId('slot-miss-5-title').textContent = settings.slotMiss5Name
  byId('slot-miss-6-title').textContent = settings.slotMiss6Name
  byId('slot-miss-7-title').textContent = settings.slotMiss7Name
  byId('slot-miss-8-title').textContent = settings.slotMiss8Name
  byId('wordparty-hit-duration-seconds').value = settings.wordPartyHitDurationSeconds
  byId('wordparty-hit-2-duration-seconds').value = settings.wordPartyHit2DurationSeconds
  byId('wordparty-bonus-duration-seconds').value = settings.wordPartyBonusDurationSeconds
  byId('wordparty-miss-1-duration-seconds').value = settings.wordPartyMiss1DurationSeconds
  byId('wordparty-miss-2-duration-seconds').value = settings.wordPartyMiss2DurationSeconds
  byId('wordparty-miss-3-duration-seconds').value = settings.wordPartyMiss3DurationSeconds
  byId('wordparty-miss-4-duration-seconds').value = settings.wordPartyMiss4DurationSeconds
  byId('wordparty-miss-5-duration-seconds').value = settings.wordPartyMiss5DurationSeconds
  byId('wordparty-miss-6-duration-seconds').value = settings.wordPartyMiss6DurationSeconds
  byId('wordparty-miss-7-duration-seconds').value = settings.wordPartyMiss7DurationSeconds
  byId('wordparty-miss-8-duration-seconds').value = settings.wordPartyMiss8DurationSeconds
  byId('ignore-initial').checked = settings.ignoreInitialHistory
  byId('delay-seconds').value = settings.delaySeconds
  byId('hit-delay-seconds').value = settings.hitDelaySeconds
  byId('hit-2-delay-seconds').value = settings.hit2DelaySeconds
  byId('bonus-first-delay-seconds').value = settings.bonusFirstDelaySeconds
  byId('bonus-second-delay-seconds').value = settings.bonusSecondDelaySeconds
  byId('target-amount').value = settings.targetAmount
  byId('output-mode').value = settings.outputMode
  byId('fixed-output').value = settings.fixedOutput
  byId('random-min').value = settings.randomMin
  byId('random-max').value = settings.randomMax
  updateLotteryDisplay()
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
  document.querySelectorAll('.slot-manual-button').forEach(button => { button.disabled = starting || manualRunning })
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
    slotHit2Enabled: byId('slot-hit-2-enabled').checked,
    slotMiss5Enabled: byId('slot-miss-5-enabled').checked,
    slotMiss6Enabled: byId('slot-miss-6-enabled').checked,
    slotMiss7Enabled: byId('slot-miss-7-enabled').checked,
    slotMiss8Enabled: byId('slot-miss-8-enabled').checked,
    wordPartyHitId: byId('wordparty-hit-id').value.trim(),
    wordPartyHit2Id: byId('wordparty-hit-2-id').value.trim(),
    wordPartyBonusId: byId('wordparty-bonus-id').value.trim(),
    wordPartyMiss1Id: byId('wordparty-miss-1-id').value.trim(),
    wordPartyMiss2Id: byId('wordparty-miss-2-id').value.trim(),
    wordPartyMiss3Id: byId('wordparty-miss-3-id').value.trim(),
    wordPartyMiss4Id: byId('wordparty-miss-4-id').value.trim(),
    wordPartyMiss5Id: byId('wordparty-miss-5-id').value.trim(),
    wordPartyMiss6Id: byId('wordparty-miss-6-id').value.trim(),
    wordPartyMiss7Id: byId('wordparty-miss-7-id').value.trim(),
    wordPartyMiss8Id: byId('wordparty-miss-8-id').value.trim(),
    slotHitName: byId('slot-hit-name').value.trim(),
    slotHit2Name: byId('slot-hit-2-name').value.trim(),
    slotBonusName: byId('slot-bonus-name').value.trim(),
    slotMiss1Name: byId('slot-miss-1-name').value.trim(),
    slotMiss2Name: byId('slot-miss-2-name').value.trim(),
    slotMiss3Name: byId('slot-miss-3-name').value.trim(),
    slotMiss4Name: byId('slot-miss-4-name').value.trim(),
    slotMiss5Name: byId('slot-miss-5-name').value.trim(),
    slotMiss6Name: byId('slot-miss-6-name').value.trim(),
    slotMiss7Name: byId('slot-miss-7-name').value.trim(),
    slotMiss8Name: byId('slot-miss-8-name').value.trim(),
    wordPartyHitDurationSeconds: Number(byId('wordparty-hit-duration-seconds').value),
    wordPartyHit2DurationSeconds: Number(byId('wordparty-hit-2-duration-seconds').value),
    wordPartyBonusDurationSeconds: Number(byId('wordparty-bonus-duration-seconds').value),
    wordPartyMiss1DurationSeconds: Number(byId('wordparty-miss-1-duration-seconds').value),
    wordPartyMiss2DurationSeconds: Number(byId('wordparty-miss-2-duration-seconds').value),
    wordPartyMiss3DurationSeconds: Number(byId('wordparty-miss-3-duration-seconds').value),
    wordPartyMiss4DurationSeconds: Number(byId('wordparty-miss-4-duration-seconds').value),
    wordPartyMiss5DurationSeconds: Number(byId('wordparty-miss-5-duration-seconds').value),
    wordPartyMiss6DurationSeconds: Number(byId('wordparty-miss-6-duration-seconds').value),
    wordPartyMiss7DurationSeconds: Number(byId('wordparty-miss-7-duration-seconds').value),
    wordPartyMiss8DurationSeconds: Number(byId('wordparty-miss-8-duration-seconds').value),
    ignoreInitialHistory: byId('ignore-initial').checked,
    delaySeconds: Number(byId('delay-seconds').value),
    hitDelaySeconds: Number(byId('hit-delay-seconds').value),
    hit2DelaySeconds: Number(byId('hit-2-delay-seconds').value),
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

async function runSlotManual(slot) {
  document.querySelectorAll('.slot-manual-button').forEach(button => { button.disabled = true })
  try {
    if (!monitoring) await saveSettings(false)
    const state = await api('POST', { action: 'manual-slot', slot })
    renderRuntime(state)
    const names = [
      state.settings.slotHitName,
      state.settings.slotBonusName,
      state.settings.slotMiss1Name,
      state.settings.slotMiss2Name,
      state.settings.slotMiss3Name,
      state.settings.slotMiss4Name,
      state.settings.slotHit2Name,
      state.settings.slotMiss5Name,
      state.settings.slotMiss6Name,
      state.settings.slotMiss7Name,
      state.settings.slotMiss8Name
    ]
    showMessage(state.monitoring ? `${names[slot - 1]}の手動実行を監視キューへ予約しました。` : `${names[slot - 1]}を手動実行しました。`)
  } catch (error) {
    showMessage(error.message, 'error')
  } finally {
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
document.querySelectorAll('.slot-manual-button').forEach(button => {
  button.addEventListener('click', () => runSlotManual(Number(button.dataset.slot)))
})
for (const [inputId, titleId] of [
  ['slot-hit-name', 'slot-hit-title'],
  ['slot-hit-2-name', 'slot-hit-2-title'],
  ['slot-bonus-name', 'slot-bonus-title'],
  ['slot-miss-1-name', 'slot-miss-1-title'],
  ['slot-miss-2-name', 'slot-miss-2-title'],
  ['slot-miss-3-name', 'slot-miss-3-title'],
  ['slot-miss-4-name', 'slot-miss-4-title'],
  ['slot-miss-5-name', 'slot-miss-5-title'],
  ['slot-miss-6-name', 'slot-miss-6-title'],
  ['slot-miss-7-name', 'slot-miss-7-title'],
  ['slot-miss-8-name', 'slot-miss-8-title']
]) {
  byId(inputId).addEventListener('input', event => {
    byId(titleId).textContent = event.target.value.trim() || '未設定'
  })
}
for (const control of EXTRA_SLOT_CONTROLS) {
  byId(control.checkboxId).addEventListener('change', updateLotteryDisplay)
}

refresh()
setInterval(refresh, 1000)
