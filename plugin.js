'use strict'

const fs = require('fs')
const path = require('path')

let safeStorage = null
try {
  safeStorage = require('electron').safeStorage
} catch (_) {
  safeStorage = null
}

const VERSION = '1.6.0'
const UID = 'com.kaz.pavlok-superchat'
const PAVLOK_USER_URL = 'https://api.pavlok.com/api/v5/user/'
const PAVLOK_STIMULUS_URL = 'https://api.pavlok.com/api/v5/stimulus/send'
const WORD_PARTY_API_BASE = 'http://localhost:11180/api/wordparty/'
const MAX_RECENT_COMMENTS = 10000
const MAX_RECENT_SUPERCHATS = 5000
const MAX_LOG_LINES = 500
const MAX_LOG_BYTES = 1024 * 1024

const SLOT_DEFINITIONS = Object.freeze([
  { slot: 1, label: 'あたり', enabledField: 'slotHitEnabled', weightField: 'slotHitWeight', nameField: 'slotHitName', idField: 'wordPartyHitId', durationField: 'wordPartyHitDurationSeconds', stimulusCount: 1, firstDelayField: 'hitDelaySeconds' },
  { slot: 2, label: '確変', enabledField: 'slotBonusEnabled', weightField: 'slotBonusWeight', nameField: 'slotBonusName', idField: 'wordPartyBonusId', durationField: 'wordPartyBonusDurationSeconds', stimulusCount: 2, firstDelayField: 'bonusFirstDelaySeconds', secondDelayField: 'bonusSecondDelaySeconds' },
  { slot: 3, label: 'はずれ1', enabledField: null, weightField: 'slotMiss1Weight', nameField: 'slotMiss1Name', idField: 'wordPartyMiss1Id', durationField: 'wordPartyMiss1DurationSeconds', stimulusCount: 0 },
  { slot: 4, label: 'はずれ2', enabledField: 'slotMiss2Enabled', weightField: 'slotMiss2Weight', nameField: 'slotMiss2Name', idField: 'wordPartyMiss2Id', durationField: 'wordPartyMiss2DurationSeconds', stimulusCount: 0 },
  { slot: 5, label: 'はずれ3', enabledField: 'slotMiss3Enabled', weightField: 'slotMiss3Weight', nameField: 'slotMiss3Name', idField: 'wordPartyMiss3Id', durationField: 'wordPartyMiss3DurationSeconds', stimulusCount: 0 },
  { slot: 6, label: 'はずれ4', enabledField: 'slotMiss4Enabled', weightField: 'slotMiss4Weight', nameField: 'slotMiss4Name', idField: 'wordPartyMiss4Id', durationField: 'wordPartyMiss4DurationSeconds', stimulusCount: 0 },
  { slot: 7, label: '追加あたり', enabledField: 'slotHit2Enabled', weightField: 'slotHit2Weight', nameField: 'slotHit2Name', idField: 'wordPartyHit2Id', durationField: 'wordPartyHit2DurationSeconds', stimulusCount: 1, firstDelayField: 'hit2DelaySeconds', additionalHit: true },
  { slot: 8, label: 'はずれ5', enabledField: 'slotMiss5Enabled', weightField: 'slotMiss5Weight', nameField: 'slotMiss5Name', idField: 'wordPartyMiss5Id', durationField: 'wordPartyMiss5DurationSeconds', stimulusCount: 0 },
  { slot: 9, label: 'はずれ6', enabledField: 'slotMiss6Enabled', weightField: 'slotMiss6Weight', nameField: 'slotMiss6Name', idField: 'wordPartyMiss6Id', durationField: 'wordPartyMiss6DurationSeconds', stimulusCount: 0 },
  { slot: 10, label: 'はずれ7', enabledField: 'slotMiss7Enabled', weightField: 'slotMiss7Weight', nameField: 'slotMiss7Name', idField: 'wordPartyMiss7Id', durationField: 'wordPartyMiss7DurationSeconds', stimulusCount: 0 },
  { slot: 11, label: 'はずれ8', enabledField: 'slotMiss8Enabled', weightField: 'slotMiss8Weight', nameField: 'slotMiss8Name', idField: 'wordPartyMiss8Id', durationField: 'wordPartyMiss8DurationSeconds', stimulusCount: 0 }
])

const DEFAULT_TARGET_AMOUNTS = Object.freeze([304, 500, 1000, 2000])

function createDefaultGroup(index) {
  return {
    enabled: index === 0,
    groupName: `金額枠${index + 1}`,
    targetAmount: DEFAULT_TARGET_AMOUNTS[index],
    outputMode: 'fixed',
    fixedOutput: 50,
    randomMin: 30,
    randomMax: 90,
    delaySeconds: 1,
    slotHitEnabled: true,
    slotBonusEnabled: true,
    slotMiss2Enabled: true,
    slotMiss3Enabled: true,
    slotMiss4Enabled: true,
    slotHit2Enabled: false,
    slotMiss5Enabled: false,
    slotMiss6Enabled: false,
    slotMiss7Enabled: false,
    slotMiss8Enabled: false,
    slotHitWeight: 1,
    slotBonusWeight: 1,
    slotMiss1Weight: 1,
    slotMiss2Weight: 1,
    slotMiss3Weight: 1,
    slotMiss4Weight: 1,
    slotHit2Weight: 1,
    slotMiss5Weight: 1,
    slotMiss6Weight: 1,
    slotMiss7Weight: 1,
    slotMiss8Weight: 1,
    wordPartyHitId: '',
    wordPartyHit2Id: '',
    wordPartyBonusId: '',
    wordPartyMiss1Id: '',
    wordPartyMiss2Id: '',
    wordPartyMiss3Id: '',
    wordPartyMiss4Id: '',
    wordPartyMiss5Id: '',
    wordPartyMiss6Id: '',
    wordPartyMiss7Id: '',
    wordPartyMiss8Id: '',
    slotHitName: 'ビリビリタイム',
    slotHit2Name: 'ビリビリタイム2',
    slotBonusName: 'スーパービリビリタイム',
    slotMiss1Name: 'ハズレ～',
    slotMiss2Name: '残念でした',
    slotMiss3Name: 'あたりませーん',
    slotMiss4Name: 'ビリビリするなんてさいあく',
    slotMiss5Name: 'はずれ5',
    slotMiss6Name: 'はずれ6',
    slotMiss7Name: 'はずれ7',
    slotMiss8Name: 'はずれ8',
    wordPartyHitDurationSeconds: 7,
    wordPartyHit2DurationSeconds: 7,
    wordPartyBonusDurationSeconds: 11,
    wordPartyMiss1DurationSeconds: 9,
    wordPartyMiss2DurationSeconds: 8,
    wordPartyMiss3DurationSeconds: 7,
    wordPartyMiss4DurationSeconds: 6,
    wordPartyMiss5DurationSeconds: 5,
    wordPartyMiss6DurationSeconds: 4,
    wordPartyMiss7DurationSeconds: 3,
    wordPartyMiss8DurationSeconds: 2,
    hitDelaySeconds: 5,
    hit2DelaySeconds: 5,
    bonusFirstDelaySeconds: 7,
    bonusSecondDelaySeconds: 2
  }
}

const DEFAULT_SETTINGS = Object.freeze({
  pavlokEnabled: false,
  wordPartyEnabled: false,
  ignoreInitialHistory: true,
  amountGroups: DEFAULT_TARGET_AMOUNTS.map((_, index) => createDefaultGroup(index))
})

function copyDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
}

function normalizeToken(value) {
  const token = String(value || '').trim().replace(/^Bearer\s*/i, '').replace(/\s+/g, '')
  if (!token) return ''
  if (token.length > 8192 || !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error('Pavlok APIキー / 初期トークンには半角英数字の値を貼り付けてください。')
  }
  return token
}

function finiteNumber(value, label, minimum, maximum) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label}は${minimum}～${maximum}で指定してください。`)
  }
  return number
}

function outputNumber(value, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 100) {
    throw new Error(`${label}は1～100の整数で指定してください。`)
  }
  return number
}

function weightNumber(value, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error(`${label}は1～10の整数で指定してください。`)
  }
  return number
}

function wordPartyId(value, label, required) {
  const id = String(value == null ? '' : value).trim()
  if (!id) {
    if (required) throw new Error(`WordParty連携をONにするには${label}を入力してください。`)
    return ''
  }
  if (!/^[\x21-\x7e]{8}$/.test(id)) {
    throw new Error(`${label}は8文字の半角英数記号で指定してください。`)
  }
  return id
}

function slotName(value, label, fallback) {
  const name = String(value == null ? fallback : value).trim()
  if (!name || Array.from(name).length > 40 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(`${label}は1～40文字で指定してください。`)
  }
  return name
}

function migrateOldAmountSettings(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.groups)) return input
  const defaults = createDefaultGroup(0)
  const group = input.groups.find(item => item && item.enabled === true) || input.groups.find(Boolean) || {}
  const amount = String(group.amounts || '').split(',').map(item => item.trim()).find(item => /^\d+$/.test(item) && Number(item) > 0)
  return {
    ...input,
    targetAmount: Number(amount || defaults.targetAmount),
    outputMode: group.outputMode || defaults.outputMode,
    fixedOutput: group.fixedOutput == null ? defaults.fixedOutput : group.fixedOutput,
    randomMin: group.randomMin == null ? defaults.randomMin : group.randomMin,
    randomMax: group.randomMax == null ? defaults.randomMax : group.randomMax
  }
}

function migrateLegacySettings(rawInput) {
  if (!rawInput || typeof rawInput !== 'object') return rawInput
  if (Array.isArray(rawInput.amountGroups)) return rawInput
  const input = migrateOldAmountSettings(rawInput)
  const amountGroups = DEFAULT_TARGET_AMOUNTS.map((_, index) => createDefaultGroup(index))
  amountGroups[0] = { ...amountGroups[0], ...input, enabled: true }
  if (input.bonusSecondDelaySeconds == null && input.cooldownSeconds != null) {
    amountGroups[0].bonusSecondDelaySeconds = input.cooldownSeconds
  }
  return {
    pavlokEnabled: input.pavlokEnabled === true,
    wordPartyEnabled: input.wordPartyEnabled === true,
    ignoreInitialHistory: input.ignoreInitialHistory !== false,
    amountGroups
  }
}

function validateAmountGroup(rawGroup, index, wordPartyEnabled) {
  const defaults = createDefaultGroup(index)
  const input = { ...defaults, ...(rawGroup && typeof rawGroup === 'object' ? rawGroup : {}) }
  const groupLabel = `金額枠${index + 1}`
  const groupName = slotName(input.groupName, `${groupLabel}の名前`, defaults.groupName)
  const enabled = index === 0 || input.enabled === true
  const targetAmount = Number(input.targetAmount)
  if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
    throw new Error(`${groupLabel}のびりびり対象金額は1以上の整数で指定してください。`)
  }
  const outputMode = input.outputMode === 'random' ? 'random' : input.outputMode === 'fixed' ? 'fixed' : null
  if (!outputMode) throw new Error(`${groupLabel}の出力方法が不正です。`)
  const randomMin = outputNumber(input.randomMin, `${groupLabel}のランダム下限`)
  const randomMax = outputNumber(input.randomMax, `${groupLabel}のランダム上限`)
  if (randomMin > randomMax) throw new Error(`${groupLabel}のランダム下限は上限以下にしてください。`)
  const bonusSecondDelaySource = input.bonusSecondDelaySeconds == null
    ? (input.cooldownSeconds == null ? defaults.bonusSecondDelaySeconds : input.cooldownSeconds)
    : input.bonusSecondDelaySeconds
  const group = {
    enabled,
    groupName,
    targetAmount,
    outputMode,
    fixedOutput: outputNumber(input.fixedOutput, `${groupLabel}の固定出力`),
    randomMin,
    randomMax,
    delaySeconds: finiteNumber(input.delaySeconds, `${groupLabel}の検出後の待機秒数`, 0, 86400),
    hitDelaySeconds: finiteNumber(input.hitDelaySeconds, `${groupLabel}のあたりのWordParty呼び出し後から電撃までの秒数`, 0, 86400),
    hit2DelaySeconds: finiteNumber(input.hit2DelaySeconds, `${groupLabel}の追加あたりのWordParty呼び出し後から電撃までの秒数`, 0, 86400),
    bonusFirstDelaySeconds: finiteNumber(input.bonusFirstDelaySeconds, `${groupLabel}の確変のWordParty呼び出し後から1撃目までの秒数`, 0, 86400),
    bonusSecondDelaySeconds: finiteNumber(bonusSecondDelaySource, `${groupLabel}の確変の1撃目から2撃目までの秒数`, 0, 86400)
  }
  const activeWordPartyIds = []
  for (const definition of SLOT_DEFINITIONS) {
    const slotEnabled = definition.enabledField == null || input[definition.enabledField] === true
    if (definition.enabledField) group[definition.enabledField] = slotEnabled
    group[definition.weightField] = weightNumber(input[definition.weightField], `${groupLabel}の${definition.label}の重み`)
    group[definition.nameField] = slotName(input[definition.nameField], `${groupLabel}の${definition.label}枠名`, defaults[definition.nameField])
    group[definition.idField] = wordPartyId(input[definition.idField], `${groupLabel}の${definition.label}演出ID`, wordPartyEnabled && enabled && slotEnabled)
    group[definition.durationField] = finiteNumber(input[definition.durationField], `${groupLabel}の${definition.label}の演出時間`, 0, 86400)
    if (enabled && slotEnabled) activeWordPartyIds.push(group[definition.idField])
  }
  if (wordPartyEnabled && enabled && new Set(activeWordPartyIds).size !== activeWordPartyIds.length) {
    throw new Error(`${groupLabel}で使用中の${activeWordPartyIds.length}枠には別々の演出IDを指定してください。`)
  }
  return group
}

function validateSettings(rawInput) {
  const input = migrateLegacySettings(rawInput)
  if (!input || typeof input !== 'object' || !Array.isArray(input.amountGroups) || input.amountGroups.length > 4) {
    throw new Error('設定が不正です。')
  }
  const wordPartyEnabled = input.wordPartyEnabled === true
  const amountGroups = DEFAULT_TARGET_AMOUNTS.map((_, index) => validateAmountGroup(input.amountGroups[index], index, wordPartyEnabled))
  const activeAmounts = amountGroups.filter(group => group.enabled).map(group => group.targetAmount)
  if (new Set(activeAmounts).size !== activeAmounts.length) {
    throw new Error('有効な金額枠には別々のびりびり対象金額を指定してください。')
  }
  return {
    pavlokEnabled: input.pavlokEnabled === true,
    wordPartyEnabled,
    ignoreInitialHistory: input.ignoreInitialHistory !== false,
    amountGroups
  }
}

function parseBody(req) {
  if (!req || req.body == null || req.body === '') return {}
  if (typeof req.body === 'object') return req.body
  try {
    return JSON.parse(String(req.body))
  } catch (_) {
    throw new Error('リクエストのJSONが不正です。')
  }
}

const plugin = {
  name: 'Pavlok Super Chat Controller',
  uid: UID,
  version: VERSION,
  author: 'kaz',
  url: `http://localhost:11180/plugins/${UID}/index.html`,
  permissions: ['comments'],
  defaultState: {
    settings: copyDefaults(),
    pavlokTokenEncrypted: ''
  },

  init({ dir, store }, initialData) {
    this.dir = dir
    this.store = store
    this.monitoring = false
    this.starting = false
    this.manualRunning = false
    this.queue = []
    this.processing = false
    this.generation = 0
    this.jobNumber = 0
    this.runtimeToken = ''
    this.logs = []
    this.recentCommentIds = new Set()
    this.recentCommentOrder = []
    this.recentSuperChats = []
    this.handledIds = new Set()
    this.handledOrder = []
    this.prepareLogFile()
    try {
      const stored = this.store.get('settings') || copyDefaults()
      this.settings = validateSettings(stored)
      this.store.set('settings', this.settings)
    } catch (error) {
      this.settings = copyDefaults()
      this.store.set('settings', this.settings)
      this.record('ERROR', `保存設定を初期値へ戻しました: ${error.message}`)
    }
    this.captureComments(initialData && initialData.comments)
    this.record('INFO', `プラグイン v${VERSION} 起動`)
    this.startMonitoring().catch(error => {
      this.record('ERROR', `[AUTO START] 監視を開始できませんでした: ${error.message}`)
    })
  },

  prepareLogFile() {
    try {
      const directory = path.join(this.dir, 'logs')
      fs.mkdirSync(directory, { recursive: true })
      const now = new Date()
      const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
      this.logPath = path.join(directory, `session-${stamp}-${Math.random().toString(16).slice(2, 10)}.log`)
      fs.writeFileSync(this.logPath, '', { flag: 'wx' })
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      const files = fs.readdirSync(directory)
        .filter(name => /^session-\d{14}-[0-9a-f]{8}\.log$/.test(name))
        .map(name => ({ name, full: path.join(directory, name), stat: fs.statSync(path.join(directory, name)) }))
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      files.forEach((file, index) => {
        if (index >= 10 || file.stat.mtimeMs < cutoff) fs.unlinkSync(file.full)
      })
    } catch (_) {
      this.logPath = ''
    }
  },

  record(level, message) {
    const line = `[${new Date().toLocaleTimeString('ja-JP', { hour12: false })}] [${level}] ${message}`
    this.logs.push(line)
    if (this.logs.length > MAX_LOG_LINES) this.logs.shift()
    if (level === 'ERROR') console.error(`[PavlokOneComme] ${message}`)
    else if (level === 'WARN') console.warn(`[PavlokOneComme] ${message}`)
    else console.info(`[PavlokOneComme] ${message}`)
    if (!this.logPath) return
    try {
      if (fs.statSync(this.logPath).size < MAX_LOG_BYTES) fs.appendFileSync(this.logPath, `${line}\n`, 'utf8')
    } catch (_) {
      this.logPath = ''
    }
  },

  rememberBounded(set, order, id, maximum) {
    if (set.has(id)) return false
    set.add(id)
    order.push(id)
    if (order.length > maximum) set.delete(order.shift())
    return true
  },

  captureComments(comments) {
    if (!Array.isArray(comments)) return
    for (const item of comments) {
      const data = item && item.data
      const id = String((data && data.id) || (item && item.id) || '')
      if (!id || !this.rememberBounded(this.recentCommentIds, this.recentCommentOrder, id, MAX_RECENT_COMMENTS)) continue
      if (!data || item.service !== 'youtube' || data.hasGift !== true || data.giftType !== 'superchat') continue
      if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0) {
        this.record('WARN', '金額が不正なSuper Chatを無視しました。')
        continue
      }
      const currency = data.currency || data.unit
      if (typeof currency !== 'string' || !currency) {
        this.record('WARN', '通貨がないSuper Chatを無視しました。')
        continue
      }
      const event = {
        id,
        price: data.price,
        currency,
        paidText: String(data.paidText || data.price).slice(0, 100),
        author: String(item.name || data.displayName || data.name || 'Unknown').slice(0, 200),
        timestamp: String(data.timestamp || '').slice(0, 100)
      }
      this.recentSuperChats.push(event)
      if (this.recentSuperChats.length > MAX_RECENT_SUPERCHATS) this.recentSuperChats.shift()
      if (this.monitoring) this.handleSuperChat(event)
    }
  },

  subscribe(type, ...args) {
    if (type !== 'comments') return
    const payload = args[0]
    const comments = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.comments) ? payload.comments : []
    this.captureComments(comments)
  },

  markHandled(id) {
    return this.rememberBounded(this.handledIds, this.handledOrder, id, MAX_RECENT_COMMENTS)
  },

  handleSuperChat(event) {
    if (!this.markHandled(event.id)) return
    this.record('INFO', `[SUPERCHAT] ${event.author} ${event.paidText} / ${event.currency}`)
    if (event.currency !== 'JPY') {
      this.record('INFO', '[SKIP] JPY以外のため対象外')
      return
    }
    if (!Number.isInteger(event.price)) {
      this.record('INFO', '[SKIP] 整数円でないため対象外')
      return
    }
    const groupIndex = this.settings.amountGroups.findIndex(group => group.enabled && group.targetAmount === event.price)
    if (groupIndex < 0) {
      this.record('INFO', `[SKIP] ${event.paidText}は発火対象外`)
      return
    }
    const group = this.settings.amountGroups[groupIndex]
    this.jobNumber += 1
    this.queue.push({
      number: this.jobNumber,
      event,
      groupIndex,
      readyAt: Date.now() + group.delaySeconds * 1000
    })
    this.record('INFO', `[QUEUE] #${this.jobNumber} ${group.groupName} / ${event.paidText} 予約 (delay=${group.delaySeconds}s)`)
    this.processQueue()
  },

  async waitWhileRunning(milliseconds, generation, allowManual = false) {
    const active = () => this.generation === generation && (this.monitoring || (allowManual && this.manualRunning))
    let remaining = milliseconds
    while (remaining > 0) {
      if (!active()) return false
      const interval = Math.min(remaining, 250)
      await new Promise(resolve => setTimeout(resolve, interval))
      remaining -= interval
    }
    return active()
  },

  selectOutput(group = this.settings.amountGroups[0]) {
    if (group.outputMode === 'fixed') return group.fixedOutput
    return Math.floor(Math.random() * (group.randomMax - group.randomMin + 1)) + group.randomMin
  },

  activeLotterySlots(group = this.settings.amountGroups[0]) {
    return SLOT_DEFINITIONS
      .filter(definition => definition.enabledField == null || group[definition.enabledField])
      .map(definition => definition.slot)
  },

  drawLottery(group = this.settings.amountGroups[0]) {
    const activeDefinitions = SLOT_DEFINITIONS.filter(definition => definition.enabledField == null || group[definition.enabledField])
    const totalWeight = activeDefinitions.reduce((total, definition) => total + group[definition.weightField], 0)
    const selectedWeight = Math.random() * totalWeight
    let cumulativeWeight = 0
    for (const definition of activeDefinitions) {
      cumulativeWeight += group[definition.weightField]
      if (selectedWeight < cumulativeWeight) return this.lotteryForSlot(definition.slot, group)
    }
    return this.lotteryForSlot(activeDefinitions[activeDefinitions.length - 1].slot, group)
  },

  lotteryForSlot(slot, group = this.settings.amountGroups[0]) {
    const definition = SLOT_DEFINITIONS.find(item => item.slot === slot)
    if (!definition) throw new Error('抽選枠が不正です。')
    const activeSlots = this.activeLotterySlots(group)
    const activeIndex = activeSlots.indexOf(slot)
    const totalWeight = activeSlots.reduce((total, activeSlot) => {
      const activeDefinition = SLOT_DEFINITIONS.find(item => item.slot === activeSlot)
      return total + group[activeDefinition.weightField]
    }, 0)
    return {
      slot,
      position: activeIndex < 0 ? null : activeIndex + 1,
      totalSlots: activeSlots.length,
      totalWeight,
      weight: group[definition.weightField],
      active: activeIndex >= 0,
      name: group[definition.nameField],
      stimulusCount: definition.stimulusCount,
      additionalHit: definition.additionalHit === true,
      firstDelaySeconds: definition.firstDelayField ? group[definition.firstDelayField] : 0,
      secondDelaySeconds: definition.secondDelayField ? group[definition.secondDelayField] : 0
    }
  },

  lotterySlotLabel(lottery) {
    if (lottery.active === false) return `枠${lottery.slot}（抽選OFF）`
    const position = lottery.position || lottery.slot
    return `${position}/${lottery.totalSlots}・重み${lottery.weight}/${lottery.totalWeight}`
  },

  wordPartyEffect(lottery, group) {
    const definition = SLOT_DEFINITIONS.find(item => item.slot === lottery.slot)
    if (!definition) return null
    return { name: group[definition.nameField], id: group[definition.idField], durationSeconds: group[definition.durationField] }
  },

  async triggerWordParty(job, lottery, group) {
    if (!this.settings.wordPartyEnabled) return true
    const effect = this.wordPartyEffect(lottery, group)
    const prefix = `[WORDPARTY] #${job.number}`
    if (!effect || !effect.id) {
      this.record('WARN', `${prefix} ${this.lotterySlotLabel(lottery)}の演出IDがありません。`)
      return false
    }
    this.record('INFO', `${prefix} ${effect.name} 演出実行`)
    let response
    try {
      response = await this.fetchWithTimeout(`${WORD_PARTY_API_BASE}${encodeURIComponent(effect.id)}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        redirect: 'manual'
      }, 5000)
    } catch (_) {
      this.record('WARN', `${prefix} ${effect.name} 通信失敗。再実行しません。`)
      return false
    }
    if (response.status >= 200 && response.status < 300) {
      this.record('INFO', `${prefix} ${effect.name} OK (HTTP ${response.status})`)
      return true
    }
    this.record('WARN', `${prefix} ${effect.name} ERROR (HTTP ${response.status})。再実行しません。`)
    return false
  },

  async reserveWordPartyDuration(job, lottery, group, generation, startedAt, allowManual = false) {
    if (!this.settings.wordPartyEnabled) return true
    const effect = this.wordPartyEffect(lottery, group)
    if (!effect || effect.durationSeconds <= 0) return true
    this.record('INFO', `[WAIT] #${job.number} ${effect.name}の演出時間 ${effect.durationSeconds}s`)
    const remaining = effect.durationSeconds * 1000 - (Date.now() - startedAt)
    if (remaining <= 0) return true
    return this.waitWhileRunning(remaining, generation, allowManual)
  },

  async runLotteryStimuli(job, count, output, generation, firstDelaySeconds, secondDelaySeconds, allowManual = false) {
    for (let index = 1; index <= count; index += 1) {
      const delaySeconds = index === 1 ? firstDelaySeconds : secondDelaySeconds
      if (delaySeconds > 0) {
        const sequence = count > 1 ? ` ${index}/${count}` : ''
        this.record('INFO', `[WAIT] #${job.number} 電撃${sequence}まで ${delaySeconds}s`)
        if (!(await this.waitWhileRunning(delaySeconds * 1000, generation, allowManual))) return false
      }
      if (this.generation !== generation || (!this.monitoring && !(allowManual && this.manualRunning))) return false
      const sequence = count > 1 ? ` ${index}/${count}` : ''
      if (!this.settings.pavlokEnabled) {
        this.record('INFO', `[DRY-RUN] #${job.number} 電撃${sequence} output=${output}（Pavlokには送信していません）`)
        continue
      }
      const result = await this.sendStimulus(job, output, index, count)
      if (!result.ok) return false
    }
    return true
  },

  async executeLottery(job, lottery, group, generation, allowManual = false) {
    this.record('INFO', `[LOTTERY] #${job.number} ${group.groupName} / ${this.lotterySlotLabel(lottery)} ${lottery.name}${lottery.stimulusCount ? `（電撃${lottery.stimulusCount}回）` : '（電撃なし）'}`)
    const wordPartyStartedAt = Date.now()
    const wordPartyPromise = this.triggerWordParty(job, lottery, group)
    const wordPartyDurationPromise = this.reserveWordPartyDuration(job, lottery, group, generation, wordPartyStartedAt, allowManual)
    if (!lottery.stimulusCount) {
      await Promise.all([wordPartyPromise, wordPartyDurationPromise])
      return
    }
    const output = this.selectOutput(group)
    this.record('INFO', `[OUTPUT] #${job.number} ${group.outputMode === 'fixed' ? '固定' : 'ランダム'} ${output}`)
    const definition = SLOT_DEFINITIONS.find(item => item.slot === lottery.slot)
    const firstDelaySeconds = this.settings.wordPartyEnabled
      ? (Number.isFinite(lottery.firstDelaySeconds) ? lottery.firstDelaySeconds : definition && definition.firstDelayField ? group[definition.firstDelayField] : 0)
      : 0
    const secondDelaySeconds = Number.isFinite(lottery.secondDelaySeconds)
      ? lottery.secondDelaySeconds
      : definition && definition.secondDelayField ? group[definition.secondDelayField] : 0
    await Promise.all([
      wordPartyPromise,
      wordPartyDurationPromise,
      this.runLotteryStimuli(job, lottery.stimulusCount, output, generation, firstDelaySeconds, secondDelaySeconds, allowManual)
    ])
  },

  async processQueue() {
    if (this.processing) return
    this.processing = true
    const generation = this.generation
    try {
      while (this.monitoring && this.generation === generation && this.queue.length) {
        const job = this.queue[0]
        const wait = job.readyAt - Date.now()
        if (wait > 0 && !(await this.waitWhileRunning(wait, generation))) return
        if (!this.monitoring || this.generation !== generation) return
        this.queue.shift()
        const group = this.settings.amountGroups[job.groupIndex]
        if (!group || !group.enabled) {
          this.record('ERROR', `[QUEUE] #${job.number} 対象の金額枠が無効なため破棄しました。`)
          continue
        }
        const lottery = job.manualSlot ? this.lotteryForSlot(job.manualSlot, group) : this.drawLottery(group)
        if (job.manualSlot) this.record('INFO', `[MANUAL] #${job.number} ${lottery.name} 手動実行`)
        else this.record('INFO', `[MATCH] #${job.number} ${group.groupName} / ${job.event.price}円`)
        await this.executeLottery(job, lottery, group, generation)
      }
    } finally {
      this.processing = false
      if (this.monitoring && this.queue.length) this.processQueue()
    }
  },

  encryptionAvailable() {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable())
  },

  saveInitialToken(token) {
    const normalized = normalizeToken(token)
    if (!normalized) return
    if (!this.encryptionAvailable()) throw new Error('Windowsの暗号化機能を利用できないため、Pavlokトークンを保存できません。')
    const encrypted = safeStorage.encryptString(normalized).toString('base64')
    this.store.set('pavlokTokenEncrypted', encrypted)
  },

  loadInitialToken() {
    const encrypted = this.store.get('pavlokTokenEncrypted') || ''
    if (!encrypted) return ''
    if (!this.encryptionAvailable()) throw new Error('保存済みPavlokトークンをWindowsで復号できません。')
    try {
      return normalizeToken(safeStorage.decryptString(Buffer.from(encrypted, 'base64')))
    } catch (_) {
      throw new Error('保存済みPavlokトークンを復号できません。削除して再設定してください。')
    }
  },

  async fetchWithTimeout(url, options, timeout = 15000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  },

  async refreshRuntimeToken() {
    const initialToken = this.loadInitialToken()
    if (!initialToken) throw new Error('Pavlok APIキー / 初期トークンが未設定です。')
    this.runtimeToken = initialToken
    let response
    try {
      response = await this.fetchWithTimeout(PAVLOK_USER_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${initialToken}`, Accept: 'application/json' },
        redirect: 'manual'
      })
    } catch (_) {
      throw new Error('Pavlok runtime tokenを取得できませんでした。接続を確認してください。')
    }
    if (response.status !== 200) throw new Error(`Pavlok認証に失敗しました (HTTP ${response.status})。`)
    let data
    try {
      data = await response.json()
    } catch (_) {
      this.record('WARN', '[PAVLOK AUTH] 認証応答がJSONではないため、保存済みAPIキーを使用します。')
      return true
    }
    const responseToken = normalizeToken(
      (data && data.user && data.user.token) ||
      (data && data.token) ||
      (data && data.access_token)
    )
    if (responseToken) {
      this.runtimeToken = responseToken
      this.record('INFO', '[PAVLOK AUTH] 認証確認 OK / 認証応答のtokenを使用します。')
    } else {
      this.record('INFO', '[PAVLOK AUTH] 認証確認 OK / 保存済みAPIキーを使用します。')
    }
    return true
  },

  async sendStimulus(job, output, sequence = 1, total = 1) {
    const label = total > 1 ? ` ${sequence}/${total}` : ''
    this.record('INFO', `[PAVLOK] #${job.number} 電撃${label} output=${output} 送信`)
    let response
    try {
      response = await this.fetchWithTimeout(PAVLOK_STIMULUS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.runtimeToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ stimulus: { stimulusType: 'zap', stimulusValue: output } }),
        redirect: 'manual'
      })
    } catch (_) {
      this.record('ERROR', `[PAVLOK] #${job.number} 通信失敗。再送しません。`)
      return { ok: false, status: null }
    }
    if (response.status >= 200 && response.status < 300) {
      this.record('INFO', `[PAVLOK] #${job.number} OK (HTTP ${response.status})`)
      return { ok: true, status: response.status }
    }
    this.record('ERROR', `[PAVLOK] #${job.number} ERROR (HTTP ${response.status})。再送しません。`)
    if (response.status === 401 || response.status === 403) {
      try {
        await this.refreshRuntimeToken()
        this.record('INFO', '[PAVLOK AUTH] token更新済み。次の予約から使用します。')
      } catch (error) {
        this.record('ERROR', `[PAVLOK AUTH] token更新失敗: ${error.message}`)
      }
    }
    return { ok: false, status: response.status }
  },

  async startMonitoring() {
    if (this.monitoring) return
    if (this.starting) throw new Error('監視の開始処理中です。完了までお待ちください。')
    if (this.manualRunning) throw new Error('手動実行の完了後に監視を開始してください。')
    this.starting = true
    const startGeneration = this.generation
    try {
      this.settings = validateSettings(this.store.get('settings') || copyDefaults())
      if (this.settings.pavlokEnabled) await this.refreshRuntimeToken()
      if (this.generation !== startGeneration) {
        this.runtimeToken = ''
        return
      }
      this.generation += 1
      this.monitoring = true
      const pending = this.recentSuperChats.filter(event => !this.handledIds.has(event.id))
      if (this.settings.ignoreInitialHistory) {
        pending.forEach(event => this.markHandled(event.id))
        this.record('INFO', `[INIT] Super Chat ${pending.length} 件を既読として処理しました。`)
      } else {
        pending.forEach(event => this.handleSuperChat(event))
      }
      this.record('INFO', `[START] 監視開始 / Pavlok:${this.settings.pavlokEnabled ? '実送信ON' : 'DRY-RUN'} / WordParty:${this.settings.wordPartyEnabled ? 'ON' : 'OFF'}`)
    } finally {
      this.starting = false
    }
  },

  stopMonitoring() {
    const discarded = this.queue.length
    this.monitoring = false
    this.generation += 1
    this.queue = []
    this.runtimeToken = ''
    this.record('INFO', `[STOP] 監視停止 / 未処理予約 ${discarded} 件を破棄しました。`)
  },

  async runManualStimulus(value) {
    if (this.monitoring) throw new Error('手動実行するには先に監視を停止してください。')
    if (this.starting) throw new Error('監視の開始処理中は手動実行できません。')
    if (this.manualRunning) throw new Error('手動実行中です。完了までお待ちください。')
    const output = outputNumber(value, '手動実行の出力値')
    this.manualRunning = true
    try {
      this.record('INFO', `[MANUAL] 電撃 output=${output} 手動実行`)
      if (!this.settings.pavlokEnabled) {
        this.record('INFO', `[DRY-RUN] #MANUAL 電撃 output=${output}（Pavlokには送信していません）`)
        return
      }
      await this.refreshRuntimeToken()
      const result = await this.sendStimulus({ number: 'MANUAL' }, output)
      if (!result.ok) {
        const detail = result.status == null ? '通信失敗' : `HTTP ${result.status}`
        throw new Error(`手動電撃送信に失敗しました (${detail})。同じ電撃は再送していません。`)
      }
    } finally {
      this.manualRunning = false
    }
  },

  async runSlotManual(groupValue, value) {
    const groupIndex = groupValue == null ? 0 : Number(groupValue)
    if (!Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= this.settings.amountGroups.length) {
      throw new Error('手動実行の金額枠が不正です。')
    }
    const group = this.settings.amountGroups[groupIndex]
    if (!group.enabled) throw new Error('無効な金額枠は手動実行できません。')
    const slot = Number(value)
    if (!Number.isInteger(slot) || slot < 1 || slot > 11) throw new Error('手動実行の抽選枠が不正です。')
    if (this.starting) throw new Error('監視の開始処理中は手動実行できません。')
    const lottery = this.lotteryForSlot(slot, group)
    if (this.monitoring) {
      this.jobNumber += 1
      this.queue.push({ number: this.jobNumber, groupIndex, manualSlot: slot, readyAt: Date.now() })
      this.record('INFO', `[QUEUE] #${this.jobNumber} ${group.groupName} / ${lottery.name} 手動実行予約`)
      this.processQueue()
      return
    }
    if (this.manualRunning) throw new Error('手動実行中です。完了までお待ちください。')
    this.manualRunning = true
    const generation = this.generation
    try {
      if (this.settings.pavlokEnabled) await this.refreshRuntimeToken()
      this.record('INFO', `[MANUAL] #MANUAL ${group.groupName} / ${lottery.name} 手動実行`)
      await this.executeLottery({ number: 'MANUAL', groupIndex, manualSlot: slot }, lottery, group, generation, true)
    } finally {
      this.manualRunning = false
    }
  },

  publicState() {
    return {
      version: VERSION,
      settings: this.settings,
      tokenConfigured: Boolean(this.store.get('pavlokTokenEncrypted')),
      encryptionAvailable: this.encryptionAvailable(),
      monitoring: this.monitoring,
      starting: this.starting,
      manualRunning: this.manualRunning,
      queueLength: this.queue.length,
      logs: this.logs
    }
  },

  async request(req) {
    try {
      if (req.method === 'GET') return { code: 200, response: this.publicState() }
      const body = parseBody(req)
      if (req.method === 'PUT') {
        if (this.monitoring) throw new Error('監視中は設定を変更できません。先に停止してください。')
        if (this.starting) throw new Error('監視の開始処理中は設定を変更できません。')
        if (this.manualRunning) throw new Error('手動実行中は設定を変更できません。完了までお待ちください。')
        const settings = validateSettings(body.settings)
        if (body.clearToken === true) this.store.set('pavlokTokenEncrypted', '')
        if (body.pavlokToken) this.saveInitialToken(body.pavlokToken)
        if (settings.pavlokEnabled && !this.store.get('pavlokTokenEncrypted')) {
          throw new Error('実機送信をONにするにはPavlok APIキー / 初期トークンが必要です。')
        }
        this.settings = settings
        this.store.set('settings', settings)
        this.record('INFO', '設定を保存しました。')
        return { code: 200, response: this.publicState() }
      }
      if (req.method === 'POST' && body.action === 'start') {
        await this.startMonitoring()
        return { code: 200, response: this.publicState() }
      }
      if (req.method === 'POST' && body.action === 'stop') {
        this.stopMonitoring()
        return { code: 200, response: this.publicState() }
      }
      if (req.method === 'POST' && body.action === 'manual') {
        await this.runManualStimulus(body.output)
        return { code: 200, response: this.publicState() }
      }
      if (req.method === 'POST' && body.action === 'manual-slot') {
        await this.runSlotManual(body.groupIndex, body.slot)
        return { code: 200, response: this.publicState() }
      }
      return { code: 405, response: { error: '対応していない操作です。' } }
    } catch (error) {
      this.record('ERROR', error.message)
      return { code: 400, response: { error: error.message, state: this.publicState() } }
    }
  },

  destroy() {
    if (this.monitoring || this.starting || this.queue.length) this.stopMonitoring()
    this.record('INFO', 'プラグイン終了')
  }
}

module.exports = plugin
