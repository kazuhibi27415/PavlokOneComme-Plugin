'use strict'

const UID = 'com.kaz.pavlok-superchat'
const API = `/api/plugins/${UID}`
const SLOT_DEFINITIONS = [
  { slot: 1, label: 'あたり', className: 'hit', enabledField: 'slotHitEnabled', weightField: 'slotHitWeight', nameField: 'slotHitName', idField: 'wordPartyHitId', durationField: 'wordPartyHitDurationSeconds', stimulus: '電撃1回', delays: [{ field: 'hitDelaySeconds', label: 'WordParty呼び出し後から電撃まで（秒）' }] },
  { slot: 2, label: '確変', className: 'bonus', enabledField: 'slotBonusEnabled', weightField: 'slotBonusWeight', nameField: 'slotBonusName', idField: 'wordPartyBonusId', durationField: 'wordPartyBonusDurationSeconds', stimulus: '電撃2回', delays: [{ field: 'bonusFirstDelaySeconds', label: 'WordParty呼び出し後から1撃目まで（秒）' }, { field: 'bonusSecondDelaySeconds', label: '1撃目から2撃目まで（秒）' }] },
  { slot: 3, label: 'はずれ1', className: '', enabledField: null, weightField: 'slotMiss1Weight', nameField: 'slotMiss1Name', idField: 'wordPartyMiss1Id', durationField: 'wordPartyMiss1DurationSeconds', stimulus: '電撃なし', delays: [] },
  { slot: 4, label: 'はずれ2', className: '', enabledField: 'slotMiss2Enabled', weightField: 'slotMiss2Weight', nameField: 'slotMiss2Name', idField: 'wordPartyMiss2Id', durationField: 'wordPartyMiss2DurationSeconds', stimulus: '電撃なし', delays: [] },
  { slot: 5, label: 'はずれ3', className: '', enabledField: 'slotMiss3Enabled', weightField: 'slotMiss3Weight', nameField: 'slotMiss3Name', idField: 'wordPartyMiss3Id', durationField: 'wordPartyMiss3DurationSeconds', stimulus: '電撃なし', delays: [] },
  { slot: 6, label: 'はずれ4', className: '', enabledField: 'slotMiss4Enabled', weightField: 'slotMiss4Weight', nameField: 'slotMiss4Name', idField: 'wordPartyMiss4Id', durationField: 'wordPartyMiss4DurationSeconds', stimulus: '電撃なし', delays: [] },
  { slot: 7, label: '追加あたり', className: 'hit', enabledField: 'slotHit2Enabled', weightField: 'slotHit2Weight', nameField: 'slotHit2Name', idField: 'wordPartyHit2Id', durationField: 'wordPartyHit2DurationSeconds', stimulus: '電撃1回', delays: [{ field: 'hit2DelaySeconds', label: 'WordParty呼び出し後から電撃まで（秒）' }] },
  { slot: 8, label: 'はずれ5', className: '', enabledField: 'slotMiss5Enabled', weightField: 'slotMiss5Weight', nameField: 'slotMiss5Name', idField: 'wordPartyMiss5Id', durationField: 'wordPartyMiss5DurationSeconds', stimulus: '電撃なし', delays: [] },
  { slot: 9, label: 'はずれ6', className: '', enabledField: 'slotMiss6Enabled', weightField: 'slotMiss6Weight', nameField: 'slotMiss6Name', idField: 'wordPartyMiss6Id', durationField: 'wordPartyMiss6DurationSeconds', stimulus: '電撃なし', delays: [] },
  { slot: 10, label: 'はずれ7', className: '', enabledField: 'slotMiss7Enabled', weightField: 'slotMiss7Weight', nameField: 'slotMiss7Name', idField: 'wordPartyMiss7Id', durationField: 'wordPartyMiss7DurationSeconds', stimulus: '電撃なし', delays: [] },
  { slot: 11, label: 'はずれ8', className: '', enabledField: 'slotMiss8Enabled', weightField: 'slotMiss8Weight', nameField: 'slotMiss8Name', idField: 'wordPartyMiss8Id', durationField: 'wordPartyMiss8DurationSeconds', stimulus: '電撃なし', delays: [] }
]
let loaded = false
let monitoring = false
let starting = false
let manualRunning = false

const byId = id => document.getElementById(id)
const field = (groupElement, name) => groupElement.querySelector(`[data-field="${name}"]`)

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

function inputMarkup(name, type, attributes = '', extraClass = '') {
  return `<input class="setting-input${extraClass ? ` ${extraClass}` : ''}" data-field="${name}" type="${type}" ${attributes}>`
}

function slotMarkup(definition) {
  const enabled = definition.enabledField
    ? `<label class="check">${inputMarkup(definition.enabledField, 'checkbox')} この枠を抽選に使用</label>`
    : '<span class="always-on">常に抽選で使用</span>'
  const delays = definition.delays.map(item => `
    <label>${item.label}
      ${inputMarkup(item.field, 'number', 'min="0" max="86400" step="0.1"')}
    </label>`).join('')
  return `
    <article class="slot-card ${definition.className}" data-slot="${definition.slot}">
      <h4><span class="slot-title">${definition.label}</span> <small class="slot-odds">${definition.stimulus}</small></h4>
      ${enabled}
      <label>抽選の重み（1～10）
        ${inputMarkup(definition.weightField, 'number', 'min="1" max="10" step="1"')}
      </label>
      <label>枠名
        ${inputMarkup(definition.nameField, 'text', 'maxlength="40" autocomplete="off"', 'slot-name-input')}
      </label>
      <label>WordParty演出ID
        ${inputMarkup(definition.idField, 'text', 'minlength="8" maxlength="8" autocomplete="off" placeholder="8文字のID"')}
      </label>
      <label>演出時間（秒）
        ${inputMarkup(definition.durationField, 'number', 'min="0" max="86400" step="0.1"')}
      </label>
      ${delays}
      <button class="slot-manual-button" type="button" data-slot="${definition.slot}">手動実行</button>
    </article>`
}

function groupMarkup(index) {
  const enabledControl = index === 0
    ? '<span class="always-on group-required">常に有効</span>'
    : `<label class="check group-enabled-check">${inputMarkup('enabled', 'checkbox')} この金額枠を使用</label>`
  return `
    <article class="amount-group" data-group-index="${index}">
      <div class="amount-group-header">
        <div>
          <h3><span class="amount-group-name">金額枠${index + 1}</span></h3>
          <p class="amount-group-meta hint"></p>
        </div>
        ${enabledControl}
      </div>
      <div class="amount-group-body">
        <div class="grid lottery-settings">
          <label>金額枠の名前
            ${inputMarkup('groupName', 'text', 'maxlength="40" autocomplete="off"')}
          </label>
          <label>びりびり対象金額（円）
            ${inputMarkup('targetAmount', 'number', 'min="1" step="1"')}
          </label>
          <label>検出後の待機秒数
            ${inputMarkup('delaySeconds', 'number', 'min="0" max="86400" step="0.1"')}
          </label>
          <label>出力方法
            <select class="setting-input" data-field="outputMode">
              <option value="fixed">固定</option>
              <option value="random">ランダム</option>
            </select>
          </label>
          <label>固定出力（1～100）
            ${inputMarkup('fixedOutput', 'number', 'min="1" max="100" step="1"')}
          </label>
          <label>ランダム下限（1～100）
            ${inputMarkup('randomMin', 'number', 'min="1" max="100" step="1"')}
          </label>
          <label>ランダム上限（1～100）
            ${inputMarkup('randomMax', 'number', 'min="1" max="100" step="1"')}
          </label>
        </div>
        <p class="lottery-summary hint"></p>
        <div class="slot-cards" aria-label="金額枠${index + 1}の抽選枠設定">
          ${SLOT_DEFINITIONS.map(slotMarkup).join('')}
        </div>
      </div>
    </article>`
}

function buildAmountGroups() {
  byId('amount-groups').innerHTML = [0, 1, 2, 3].map(groupMarkup).join('')
}

function groupEnabled(groupElement) {
  const index = Number(groupElement.dataset.groupIndex)
  return index === 0 || field(groupElement, 'enabled').checked
}

function updateGroupDisplay(groupElement) {
  const index = Number(groupElement.dataset.groupIndex)
  const enabled = groupEnabled(groupElement)
  const name = field(groupElement, 'groupName').value.trim() || `金額枠${index + 1}`
  const amount = field(groupElement, 'targetAmount').value || '未設定'
  groupElement.querySelector('.amount-group-name').textContent = name
  groupElement.querySelector('.amount-group-meta').textContent = enabled ? `${amount}円・使用中` : `${amount}円・未使用`
  groupElement.querySelector('.amount-group-body').hidden = !enabled
  groupElement.classList.toggle('inactive', !enabled)

  const activeDefinitions = SLOT_DEFINITIONS.filter(definition => definition.enabledField == null || field(groupElement, definition.enabledField).checked)
  const totalWeight = activeDefinitions.reduce((total, definition) => {
    const weight = Number(field(groupElement, definition.weightField).value)
    return total + (Number.isInteger(weight) && weight >= 1 && weight <= 10 ? weight : 0)
  }, 0)
  groupElement.querySelector('.lottery-summary').textContent = `使用中${activeDefinitions.length}枠・重み合計${totalWeight}で抽選します。`
  for (const definition of SLOT_DEFINITIONS) {
    const card = groupElement.querySelector(`[data-slot="${definition.slot}"]`)
    const activeIndex = activeDefinitions.indexOf(definition)
    const weight = Number(field(groupElement, definition.weightField).value)
    const probability = activeIndex >= 0 && totalWeight > 0 && Number.isFinite(weight) ? `${(weight / totalWeight * 100).toFixed(1)}%` : ''
    card.querySelector('.slot-odds').textContent = activeIndex < 0
      ? `抽選OFF・${definition.stimulus}`
      : `${activeIndex + 1}枠目・重み${weight}/${totalWeight}（${probability}）・${definition.stimulus}`
    card.classList.toggle('inactive', activeIndex < 0)
  }
}

function renderSettings(state) {
  const settings = state.settings
  byId('pavlok-enabled').checked = settings.pavlokEnabled
  byId('wordparty-enabled').checked = settings.wordPartyEnabled
  byId('ignore-initial').checked = settings.ignoreInitialHistory
  settings.amountGroups.forEach((group, index) => {
    const groupElement = document.querySelector(`[data-group-index="${index}"]`)
    if (index > 0) field(groupElement, 'enabled').checked = group.enabled
    for (const name of ['groupName', 'targetAmount', 'delaySeconds', 'outputMode', 'fixedOutput', 'randomMin', 'randomMax']) {
      field(groupElement, name).value = group[name]
    }
    for (const definition of SLOT_DEFINITIONS) {
      if (definition.enabledField) field(groupElement, definition.enabledField).checked = group[definition.enabledField]
      field(groupElement, definition.weightField).value = group[definition.weightField]
      field(groupElement, definition.nameField).value = group[definition.nameField]
      field(groupElement, definition.idField).value = group[definition.idField]
      field(groupElement, definition.durationField).value = group[definition.durationField]
      for (const delay of definition.delays) field(groupElement, delay.field).value = group[delay.field]
      groupElement.querySelector(`[data-slot="${definition.slot}"] .slot-title`).textContent = group[definition.nameField]
    }
    updateGroupDisplay(groupElement)
  })
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

function collectGroup(groupElement) {
  const index = Number(groupElement.dataset.groupIndex)
  const group = {
    enabled: index === 0 || field(groupElement, 'enabled').checked,
    groupName: field(groupElement, 'groupName').value.trim(),
    targetAmount: Number(field(groupElement, 'targetAmount').value),
    delaySeconds: Number(field(groupElement, 'delaySeconds').value),
    outputMode: field(groupElement, 'outputMode').value,
    fixedOutput: Number(field(groupElement, 'fixedOutput').value),
    randomMin: Number(field(groupElement, 'randomMin').value),
    randomMax: Number(field(groupElement, 'randomMax').value)
  }
  for (const definition of SLOT_DEFINITIONS) {
    if (definition.enabledField) group[definition.enabledField] = field(groupElement, definition.enabledField).checked
    group[definition.weightField] = Number(field(groupElement, definition.weightField).value)
    group[definition.nameField] = field(groupElement, definition.nameField).value.trim()
    group[definition.idField] = field(groupElement, definition.idField).value.trim()
    group[definition.durationField] = Number(field(groupElement, definition.durationField).value)
    for (const delay of definition.delays) group[delay.field] = Number(field(groupElement, delay.field).value)
  }
  return group
}

function collectSettings() {
  return {
    pavlokEnabled: byId('pavlok-enabled').checked,
    wordPartyEnabled: byId('wordparty-enabled').checked,
    ignoreInitialHistory: byId('ignore-initial').checked,
    amountGroups: Array.from(document.querySelectorAll('.amount-group')).map(collectGroup)
  }
}

async function saveSettings(showSuccess = true) {
  const state = await api('PUT', {
    settings: collectSettings(),
    pavlokToken: byId('pavlok-token').value,
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

async function runSlotManual(groupIndex, slot) {
  document.querySelectorAll('.slot-manual-button').forEach(button => { button.disabled = true })
  try {
    if (!monitoring) await saveSettings(false)
    const state = await api('POST', { action: 'manual-slot', groupIndex, slot })
    renderRuntime(state)
    const group = state.settings.amountGroups[groupIndex]
    const definition = SLOT_DEFINITIONS.find(item => item.slot === slot)
    const name = group[definition.nameField]
    showMessage(state.monitoring ? `${group.groupName}の${name}を監視キューへ予約しました。` : `${group.groupName}の${name}を手動実行しました。`)
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

buildAmountGroups()
byId('save-button').addEventListener('click', async () => {
  try { await saveSettings(true) } catch (error) { showMessage(error.message, 'error') }
})
byId('start-button').addEventListener('click', () => run('start'))
byId('stop-button').addEventListener('click', () => run('stop'))
byId('manual-button').addEventListener('click', runManual)
byId('amount-groups').addEventListener('click', event => {
  const button = event.target.closest('.slot-manual-button')
  if (!button) return
  const groupElement = button.closest('.amount-group')
  runSlotManual(Number(groupElement.dataset.groupIndex), Number(button.dataset.slot))
})
byId('amount-groups').addEventListener('input', event => {
  const groupElement = event.target.closest('.amount-group')
  if (!groupElement) return
  if (event.target.classList.contains('slot-name-input')) {
    event.target.closest('.slot-card').querySelector('.slot-title').textContent = event.target.value.trim() || '未設定'
  }
  updateGroupDisplay(groupElement)
})
byId('amount-groups').addEventListener('change', event => {
  const groupElement = event.target.closest('.amount-group')
  if (groupElement) updateGroupDisplay(groupElement)
})

refresh()
setInterval(refresh, 1000)
