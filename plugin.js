'use strict'

const fs = require('fs')
const path = require('path')

let safeStorage = null
try {
  safeStorage = require('electron').safeStorage
} catch (_) {
  safeStorage = null
}

const VERSION = '1.0.0'
const UID = 'com.kaz.pavlok-superchat'
const PAVLOK_USER_URL = 'https://api.pavlok.com/api/v5/user/'
const PAVLOK_STIMULUS_URL = 'https://api.pavlok.com/api/v5/stimulus/send'
const MAX_RECENT_COMMENTS = 10000
const MAX_RECENT_SUPERCHATS = 5000
const MAX_LOG_LINES = 500
const MAX_LOG_BYTES = 1024 * 1024

const DEFAULT_SETTINGS = Object.freeze({
  pavlokEnabled: false,
  delaySeconds: 3,
  cooldownSeconds: 3,
  ignoreInitialHistory: true,
  groups: [
    { enabled: true, amounts: '200,500', outputMode: 'fixed', fixedOutput: 20, randomMin: 20, randomMax: 20 },
    { enabled: true, amounts: '1000', outputMode: 'fixed', fixedOutput: 20, randomMin: 20, randomMax: 20 },
    { enabled: false, amounts: '3000', outputMode: 'random', fixedOutput: 20, randomMin: 20, randomMax: 40 },
    { enabled: false, amounts: '5000', outputMode: 'random', fixedOutput: 20, randomMin: 20, randomMax: 40 }
  ]
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

function validateSettings(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.groups) || input.groups.length !== 4) {
    throw new Error('4つの金額グループ設定が必要です。')
  }
  const usedAmounts = new Set()
  let enabledCount = 0
  const groups = input.groups.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`グループ${index + 1}の設定が不正です。`)
    const enabled = raw.enabled === true
    const amountText = String(raw.amounts || '').trim()
    const amountParts = amountText ? amountText.split(',').map(item => item.trim()) : []
    if (enabled && (!amountParts.length || amountParts.some(item => !/^\d+$/.test(item) || Number(item) <= 0))) {
      throw new Error(`グループ${index + 1}の対象金額は1以上の整数をカンマ区切りで指定してください。`)
    }
    const amounts = amountParts.map(Number)
    if (enabled) {
      enabledCount += 1
      for (const amount of amounts) {
        if (usedAmounts.has(amount)) throw new Error(`対象金額${amount}円が複数の有効グループで重複しています。`)
        usedAmounts.add(amount)
      }
    }
    const outputMode = raw.outputMode === 'random' ? 'random' : raw.outputMode === 'fixed' ? 'fixed' : null
    if (!outputMode) throw new Error(`グループ${index + 1}の出力方法が不正です。`)
    return {
      enabled,
      amounts: amountText,
      outputMode,
      fixedOutput: outputNumber(raw.fixedOutput, `グループ${index + 1}の固定値`),
      randomMin: outputNumber(raw.randomMin, `グループ${index + 1}のランダム下限`),
      randomMax: outputNumber(raw.randomMax, `グループ${index + 1}のランダム上限`)
    }
  })
  if (!enabledCount) throw new Error('少なくとも1つの金額グループをONにしてください。')
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index].randomMin > groups[index].randomMax) {
      throw new Error(`グループ${index + 1}のランダム下限は上限以下にしてください。`)
    }
  }
  return {
    pavlokEnabled: input.pavlokEnabled === true,
    delaySeconds: finiteNumber(input.delaySeconds, '検出後の待機秒数', 0, 86400),
    cooldownSeconds: finiteNumber(input.cooldownSeconds, 'クールダウン秒数', 0, 86400),
    ignoreInitialHistory: input.ignoreInitialHistory !== false,
    groups
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
  author: 'kaz-project',
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
    this.manualRunning = false
    this.queue = []
    this.processing = false
    this.generation = 0
    this.jobNumber = 0
    this.lastAttemptAt = null
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
      const id = String((item && item.id) || (data && data.id) || '')
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
    if (type === 'comments') this.captureComments(args[0])
  },

  markHandled(id) {
    return this.rememberBounded(this.handledIds, this.handledOrder, id, MAX_RECENT_COMMENTS)
  },

  groupForAmount(amount) {
    return this.settings.groups.find(group => group.enabled && group.amounts.split(',').map(Number).includes(amount)) || null
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
    const group = this.groupForAmount(event.price)
    if (!group) {
      this.record('INFO', `[SKIP] ${event.paidText}は発火対象外`)
      return
    }
    this.jobNumber += 1
    this.queue.push({
      number: this.jobNumber,
      event,
      groupNumber: this.settings.groups.indexOf(group) + 1,
      group,
      readyAt: Date.now() + this.settings.delaySeconds * 1000
    })
    this.record('INFO', `[QUEUE] #${this.jobNumber} ${event.paidText} 予約 (delay=${this.settings.delaySeconds}s)`)
    this.processQueue()
  },

  async waitWhileRunning(milliseconds, generation) {
    let remaining = milliseconds
    while (remaining > 0) {
      if (!this.monitoring || this.generation !== generation) return false
      const interval = Math.min(remaining, 250)
      await new Promise(resolve => setTimeout(resolve, interval))
      remaining -= interval
    }
    return this.monitoring && this.generation === generation
  },

  selectOutput(group) {
    if (group.outputMode === 'fixed') return group.fixedOutput
    return Math.floor(Math.random() * (group.randomMax - group.randomMin + 1)) + group.randomMin
  },

  async processQueue() {
    if (this.processing) return
    this.processing = true
    const generation = this.generation
    try {
      while (this.monitoring && this.generation === generation && this.queue.length) {
        const job = this.queue[0]
        const cooldownAt = this.lastAttemptAt == null ? 0 : this.lastAttemptAt + this.settings.cooldownSeconds * 1000
        const wait = Math.max(job.readyAt, cooldownAt) - Date.now()
        if (wait > 0 && !(await this.waitWhileRunning(wait, generation))) return
        if (!this.monitoring || this.generation !== generation) return
        this.queue.shift()
        const output = this.selectOutput(job.group)
        this.record('INFO', `[MATCH] #${job.number} グループ${job.groupNumber} / ${job.event.price}円`)
        this.record('INFO', `[OUTPUT] #${job.number} ${job.group.outputMode === 'fixed' ? '固定' : 'ランダム'} ${output}`)
        this.lastAttemptAt = Date.now()
        if (!this.settings.pavlokEnabled) {
          this.record('INFO', `[DRY-RUN] #${job.number} zap output=${output}（Pavlokには送信していません）`)
          continue
        }
        await this.sendZap(job, output)
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

  async sendZap(job, output) {
    this.record('INFO', `[PAVLOK] #${job.number} zap output=${output} 送信`)
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
    if (this.manualRunning) throw new Error('手動実行の完了後に監視を開始してください。')
    this.settings = validateSettings(this.store.get('settings') || copyDefaults())
    if (this.settings.pavlokEnabled) await this.refreshRuntimeToken()
    this.generation += 1
    this.monitoring = true
    this.lastAttemptAt = null
    const pending = this.recentSuperChats.filter(event => !this.handledIds.has(event.id))
    if (this.settings.ignoreInitialHistory) {
      pending.forEach(event => this.markHandled(event.id))
      this.record('INFO', `[INIT] Super Chat ${pending.length} 件を既読として処理しました。`)
    } else {
      pending.forEach(event => this.handleSuperChat(event))
    }
    this.record('INFO', `[START] 監視開始 / ${this.settings.pavlokEnabled ? '実送信ON' : 'DRY-RUN'}`)
  },

  stopMonitoring() {
    const discarded = this.queue.length
    this.monitoring = false
    this.generation += 1
    this.queue = []
    this.runtimeToken = ''
    this.record('INFO', `[STOP] 監視停止 / 未処理予約 ${discarded} 件を破棄しました。`)
  },

  async runManualZap(value) {
    if (this.monitoring) throw new Error('手動実行するには先に監視を停止してください。')
    if (this.manualRunning) throw new Error('手動実行中です。完了までお待ちください。')
    const output = outputNumber(value, '手動実行の出力値')
    this.manualRunning = true
    try {
      this.record('INFO', `[MANUAL] zap output=${output} 手動実行`)
      if (!this.settings.pavlokEnabled) {
        this.record('INFO', `[DRY-RUN] #MANUAL zap output=${output}（Pavlokには送信していません）`)
        return
      }
      await this.refreshRuntimeToken()
      const result = await this.sendZap({ number: 'MANUAL' }, output)
      if (!result.ok) {
        const detail = result.status == null ? '通信失敗' : `HTTP ${result.status}`
        throw new Error(`手動Zap送信に失敗しました (${detail})。同じZapは再送していません。`)
      }
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
        await this.runManualZap(body.output)
        return { code: 200, response: this.publicState() }
      }
      return { code: 405, response: { error: '対応していない操作です。' } }
    } catch (error) {
      this.record('ERROR', error.message)
      return { code: 400, response: { error: error.message, state: this.publicState() } }
    }
  },

  destroy() {
    if (this.monitoring || this.queue.length) this.stopMonitoring()
    this.record('INFO', 'プラグイン終了')
  }
}

module.exports = plugin
