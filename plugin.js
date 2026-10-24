'use strict'

const fs = require('fs')
const path = require('path')

let safeStorage = null
try {
  safeStorage = require('electron').safeStorage
} catch (_) {
  safeStorage = null
}

const VERSION = '1.4.0'
const UID = 'com.kaz.pavlok-superchat'
const PAVLOK_USER_URL = 'https://api.pavlok.com/api/v5/user/'
const PAVLOK_STIMULUS_URL = 'https://api.pavlok.com/api/v5/stimulus/send'
const WORD_PARTY_API_BASE = 'http://localhost:11180/api/wordparty/'
const MAX_RECENT_COMMENTS = 10000
const MAX_RECENT_SUPERCHATS = 5000
const MAX_LOG_LINES = 500
const MAX_LOG_BYTES = 1024 * 1024

const DEFAULT_SETTINGS = Object.freeze({
  pavlokEnabled: false,
  wordPartyEnabled: false,
  wordPartyHitId: '',
  wordPartyBonusId: '',
  wordPartyMiss1Id: '',
  wordPartyMiss2Id: '',
  wordPartyMiss3Id: '',
  wordPartyMiss4Id: '',
  slotHitName: 'あたり',
  slotBonusName: '確変',
  slotMiss1Name: 'はずれ1',
  slotMiss2Name: 'はずれ2',
  slotMiss3Name: 'はずれ3',
  slotMiss4Name: 'はずれ4',
  wordPartyHitDurationSeconds: 0,
  wordPartyBonusDurationSeconds: 0,
  wordPartyMiss1DurationSeconds: 0,
  wordPartyMiss2DurationSeconds: 0,
  wordPartyMiss3DurationSeconds: 0,
  wordPartyMiss4DurationSeconds: 0,
  delaySeconds: 3,
  hitDelaySeconds: 0,
  bonusFirstDelaySeconds: 0,
  bonusSecondDelaySeconds: 3,
  ignoreInitialHistory: true,
  targetAmount: 500,
  outputMode: 'fixed',
  fixedOutput: 20,
  randomMin: 20,
  randomMax: 20
})

function copyDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
}

function normalizeToken(value) {
  const token = String(value || '').trim().replace(/^Bearer\s*/i, '').replace(/\s+/g, '')
  if (!token) return ''
  if (token.length > 8192 || !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error('Pavlok初期トークンには半角英数字の値を貼り付けてください。')
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

function migrateLegacySettings(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.groups)) return input
  const group = input.groups.find(item => item && item.enabled === true) || input.groups.find(Boolean) || {}
  const amount = String(group.amounts || '').split(',').map(item => item.trim()).find(item => /^\d+$/.test(item) && Number(item) > 0)
  return {
    ...input,
    targetAmount: Number(amount || DEFAULT_SETTINGS.targetAmount),
    outputMode: group.outputMode || DEFAULT_SETTINGS.outputMode,
    fixedOutput: group.fixedOutput == null ? DEFAULT_SETTINGS.fixedOutput : group.fixedOutput,
    randomMin: group.randomMin == null ? DEFAULT_SETTINGS.randomMin : group.randomMin,
    randomMax: group.randomMax == null ? DEFAULT_SETTINGS.randomMax : group.randomMax
  }
}

function validateSettings(rawInput) {
  const input = migrateLegacySettings(rawInput)
  if (!input || typeof input !== 'object') throw new Error('設定が不正です。')
  const targetAmount = Number(input.targetAmount)
  if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) {
    throw new Error('びりびり対象金額は1以上の整数で指定してください。')
  }
  const outputMode = input.outputMode === 'random' ? 'random' : input.outputMode === 'fixed' ? 'fixed' : null
  if (!outputMode) throw new Error('出力方法が不正です。')
  const randomMin = outputNumber(input.randomMin, 'ランダム下限')
  const randomMax = outputNumber(input.randomMax, 'ランダム上限')
  if (randomMin > randomMax) throw new Error('ランダム下限は上限以下にしてください。')
  const wordPartyEnabled = input.wordPartyEnabled === true
  const wordPartyHitId = wordPartyId(input.wordPartyHitId, 'あたり演出ID', wordPartyEnabled)
  const wordPartyBonusId = wordPartyId(input.wordPartyBonusId, '確変演出ID', wordPartyEnabled)
  const wordPartyMiss1Id = wordPartyId(input.wordPartyMiss1Id, 'はずれ1演出ID', wordPartyEnabled)
  const wordPartyMiss2Id = wordPartyId(input.wordPartyMiss2Id, 'はずれ2演出ID', wordPartyEnabled)
  const wordPartyMiss3Id = wordPartyId(input.wordPartyMiss3Id, 'はずれ3演出ID', wordPartyEnabled)
  const wordPartyMiss4Id = wordPartyId(input.wordPartyMiss4Id, 'はずれ4演出ID', wordPartyEnabled)
  const wordPartyIds = [wordPartyHitId, wordPartyBonusId, wordPartyMiss1Id, wordPartyMiss2Id, wordPartyMiss3Id, wordPartyMiss4Id]
  if (wordPartyEnabled && new Set(wordPartyIds).size !== wordPartyIds.length) {
    throw new Error('WordPartyの6枠には別々の演出IDを指定してください。')
  }
  const bonusSecondDelaySource = input.bonusSecondDelaySeconds == null
    ? (input.cooldownSeconds == null ? DEFAULT_SETTINGS.bonusSecondDelaySeconds : input.cooldownSeconds)
    : input.bonusSecondDelaySeconds
  return {
    pavlokEnabled: input.pavlokEnabled === true,
    wordPartyEnabled,
    wordPartyHitId,
    wordPartyBonusId,
    wordPartyMiss1Id,
    wordPartyMiss2Id,
    wordPartyMiss3Id,
    wordPartyMiss4Id,
    slotHitName: slotName(input.slotHitName, 'あたり枠名', DEFAULT_SETTINGS.slotHitName),
    slotBonusName: slotName(input.slotBonusName, '確変枠名', DEFAULT_SETTINGS.slotBonusName),
    slotMiss1Name: slotName(input.slotMiss1Name, 'はずれ1枠名', DEFAULT_SETTINGS.slotMiss1Name),
    slotMiss2Name: slotName(input.slotMiss2Name, 'はずれ2枠名', DEFAULT_SETTINGS.slotMiss2Name),
    slotMiss3Name: slotName(input.slotMiss3Name, 'はずれ3枠名', DEFAULT_SETTINGS.slotMiss3Name),
    slotMiss4Name: slotName(input.slotMiss4Name, 'はずれ4枠名', DEFAULT_SETTINGS.slotMiss4Name),
    wordPartyHitDurationSeconds: finiteNumber(input.wordPartyHitDurationSeconds == null ? DEFAULT_SETTINGS.wordPartyHitDurationSeconds : input.wordPartyHitDurationSeconds, 'あたりの演出時間', 0, 86400),
    wordPartyBonusDurationSeconds: finiteNumber(input.wordPartyBonusDurationSeconds == null ? DEFAULT_SETTINGS.wordPartyBonusDurationSeconds : input.wordPartyBonusDurationSeconds, '確変の演出時間', 0, 86400),
    wordPartyMiss1DurationSeconds: finiteNumber(input.wordPartyMiss1DurationSeconds == null ? DEFAULT_SETTINGS.wordPartyMiss1DurationSeconds : input.wordPartyMiss1DurationSeconds, 'はずれ1の演出時間', 0, 86400),
    wordPartyMiss2DurationSeconds: finiteNumber(input.wordPartyMiss2DurationSeconds == null ? DEFAULT_SETTINGS.wordPartyMiss2DurationSeconds : input.wordPartyMiss2DurationSeconds, 'はずれ2の演出時間', 0, 86400),
    wordPartyMiss3DurationSeconds: finiteNumber(input.wordPartyMiss3DurationSeconds == null ? DEFAULT_SETTINGS.wordPartyMiss3DurationSeconds : input.wordPartyMiss3DurationSeconds, 'はずれ3の演出時間', 0, 86400),
    wordPartyMiss4DurationSeconds: finiteNumber(input.wordPartyMiss4DurationSeconds == null ? DEFAULT_SETTINGS.wordPartyMiss4DurationSeconds : input.wordPartyMiss4DurationSeconds, 'はずれ4の演出時間', 0, 86400),
    delaySeconds: finiteNumber(input.delaySeconds, '検出後の待機秒数', 0, 86400),
    hitDelaySeconds: finiteNumber(input.hitDelaySeconds == null ? DEFAULT_SETTINGS.hitDelaySeconds : input.hitDelaySeconds, 'あたりのWordParty呼び出し後から電撃までの秒数', 0, 86400),
    bonusFirstDelaySeconds: finiteNumber(input.bonusFirstDelaySeconds == null ? DEFAULT_SETTINGS.bonusFirstDelaySeconds : input.bonusFirstDelaySeconds, '確変のWordParty呼び出し後から1撃目までの秒数', 0, 86400),
    bonusSecondDelaySeconds: finiteNumber(bonusSecondDelaySource, '確変の1撃目から2撃目までの秒数', 0, 86400),
    ignoreInitialHistory: input.ignoreInitialHistory !== false,
    targetAmount,
    outputMode,
    fixedOutput: outputNumber(input.fixedOutput, '固定出力'),
    randomMin,
    randomMax
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
    if (event.price !== this.settings.targetAmount) {
      this.record('INFO', `[SKIP] ${event.paidText}は発火対象外`)
      return
    }
    this.jobNumber += 1
    this.queue.push({
      number: this.jobNumber,
      event,
      readyAt: Date.now() + this.settings.delaySeconds * 1000
    })
    this.record('INFO', `[QUEUE] #${this.jobNumber} ${event.paidText} 予約 (delay=${this.settings.delaySeconds}s)`)
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

  selectOutput() {
    if (this.settings.outputMode === 'fixed') return this.settings.fixedOutput
    return Math.floor(Math.random() * (this.settings.randomMax - this.settings.randomMin + 1)) + this.settings.randomMin
  },

  drawLottery() {
    const slot = Math.floor(Math.random() * 6) + 1
    return this.lotteryForSlot(slot)
  },

  lotteryForSlot(slot) {
    if (slot === 1) return { slot, name: this.settings.slotHitName, stimulusCount: 1 }
    if (slot === 2) return { slot, name: this.settings.slotBonusName, stimulusCount: 2 }
    const missNames = [this.settings.slotMiss1Name, this.settings.slotMiss2Name, this.settings.slotMiss3Name, this.settings.slotMiss4Name]
    return { slot, name: missNames[slot - 3], stimulusCount: 0 }
  },

  wordPartyEffect(lottery) {
    const effects = [
      null,
      { name: this.settings.slotHitName, id: this.settings.wordPartyHitId, durationSeconds: this.settings.wordPartyHitDurationSeconds },
      { name: this.settings.slotBonusName, id: this.settings.wordPartyBonusId, durationSeconds: this.settings.wordPartyBonusDurationSeconds },
      { name: this.settings.slotMiss1Name, id: this.settings.wordPartyMiss1Id, durationSeconds: this.settings.wordPartyMiss1DurationSeconds },
      { name: this.settings.slotMiss2Name, id: this.settings.wordPartyMiss2Id, durationSeconds: this.settings.wordPartyMiss2DurationSeconds },
      { name: this.settings.slotMiss3Name, id: this.settings.wordPartyMiss3Id, durationSeconds: this.settings.wordPartyMiss3DurationSeconds },
      { name: this.settings.slotMiss4Name, id: this.settings.wordPartyMiss4Id, durationSeconds: this.settings.wordPartyMiss4DurationSeconds }
    ]
    return effects[lottery.slot]
  },

  async triggerWordParty(job, lottery) {
    if (!this.settings.wordPartyEnabled) return true
    const effect = this.wordPartyEffect(lottery)
    const prefix = `[WORDPARTY] #${job.number}`
    if (!effect || !effect.id) {
      this.record('WARN', `${prefix} ${lottery.slot}/6の演出IDがありません。`)
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

  async reserveWordPartyDuration(job, lottery, generation, startedAt, allowManual = false) {
    if (!this.settings.wordPartyEnabled) return true
    const effect = this.wordPartyEffect(lottery)
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

  async executeLottery(job, lottery, generation, allowManual = false) {
    this.record('INFO', `[LOTTERY] #${job.number} ${lottery.slot}/6 ${lottery.name}${lottery.stimulusCount ? `（電撃${lottery.stimulusCount}回）` : '（電撃なし）'}`)
    const wordPartyStartedAt = Date.now()
    const wordPartyPromise = this.triggerWordParty(job, lottery)
    const wordPartyDurationPromise = this.reserveWordPartyDuration(job, lottery, generation, wordPartyStartedAt, allowManual)
    if (!lottery.stimulusCount) {
      await Promise.all([wordPartyPromise, wordPartyDurationPromise])
      return
    }
    const output = this.selectOutput()
    this.record('INFO', `[OUTPUT] #${job.number} ${this.settings.outputMode === 'fixed' ? '固定' : 'ランダム'} ${output}`)
    const firstDelaySeconds = this.settings.wordPartyEnabled
      ? (lottery.slot === 1 ? this.settings.hitDelaySeconds : this.settings.bonusFirstDelaySeconds)
      : 0
    await Promise.all([
      wordPartyPromise,
      wordPartyDurationPromise,
      this.runLotteryStimuli(job, lottery.stimulusCount, output, generation, firstDelaySeconds, this.settings.bonusSecondDelaySeconds, allowManual)
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
        const lottery = job.manualSlot ? this.lotteryForSlot(job.manualSlot) : this.drawLottery()
        if (job.manualSlot) this.record('INFO', `[MANUAL] #${job.number} ${lottery.name} 手動実行`)
        else this.record('INFO', `[MATCH] #${job.number} ${job.event.price}円`)
        await this.executeLottery(job, lottery, generation)
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
    if (!initialToken) throw new Error('Pavlok初期トークンが未設定です。')
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
      throw new Error('Pavlok認証応答がJSONではありません。')
    }
    const token = normalizeToken(data && data.user && data.user.token)
    if (!token) throw new Error('Pavlok認証応答にuser.tokenがありません。')
    this.runtimeToken = token
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

  async runSlotManual(value) {
    const slot = Number(value)
    if (!Number.isInteger(slot) || slot < 1 || slot > 6) throw new Error('手動実行の抽選枠が不正です。')
    if (this.starting) throw new Error('監視の開始処理中は手動実行できません。')
    const lottery = this.lotteryForSlot(slot)
    if (this.monitoring) {
      this.jobNumber += 1
      this.queue.push({ number: this.jobNumber, manualSlot: slot, readyAt: Date.now() })
      this.record('INFO', `[QUEUE] #${this.jobNumber} ${lottery.name} 手動実行予約`)
      this.processQueue()
      return
    }
    if (this.manualRunning) throw new Error('手動実行中です。完了までお待ちください。')
    this.manualRunning = true
    const generation = this.generation
    try {
      if (this.settings.pavlokEnabled) await this.refreshRuntimeToken()
      this.record('INFO', `[MANUAL] #MANUAL ${lottery.name} 手動実行`)
      await this.executeLottery({ number: 'MANUAL', manualSlot: slot }, lottery, generation, true)
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
          throw new Error('実機送信をONにするにはPavlok初期トークンが必要です。')
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
        await this.runSlotManual(body.slot)
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
