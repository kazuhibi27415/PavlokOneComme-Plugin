'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const plugin = require('../plugin')

const TEST_ROOT = path.join(__dirname, '.tmp')
const originalConsole = {
  info: console.info,
  warn: console.warn,
  error: console.error
}
const originalLoadInitialToken = plugin.loadInitialToken
const originalDrawLottery = plugin.drawLottery
const originalFetch = global.fetch

class MemoryStore {
  constructor() {
    this.values = JSON.parse(JSON.stringify(plugin.defaultState))
  }

  get(key) {
    return this.values[key]
  }

  set(key, value) {
    this.values[key] = value
  }
}

function settings(overrides = {}) {
  return {
    ...JSON.parse(JSON.stringify(plugin.defaultState.settings)),
    delaySeconds: 0,
    cooldownSeconds: 0,
    ...overrides
  }
}

function comment(id, options = {}) {
  return {
    id,
    service: options.service || 'youtube',
    name: options.name || 'テスト視聴者',
    data: {
      hasGift: options.hasGift === undefined ? true : options.hasGift,
      giftType: options.giftType || 'superchat',
      price: options.price === undefined ? 500 : options.price,
      currency: options.currency === undefined ? 'JPY' : options.currency,
      paidText: options.paidText || `${options.price === undefined ? 500 : options.price}円`
    }
  }
}

function initialize(initialComments = [], storedSettings = null) {
  fs.mkdirSync(TEST_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TEST_ROOT, 'case-'))
  const store = new MemoryStore()
  if (storedSettings) store.set('settings', storedSettings)
  plugin.loadInitialToken = originalLoadInitialToken
  plugin.drawLottery = originalDrawLottery
  global.fetch = originalFetch
  plugin.init({ dir, store }, { comments: initialComments })
  return { dir, store }
}

async function waitUntil(predicate, timeout = 1000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('条件待機がタイムアウトしました。')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

async function save(nextSettings) {
  const result = await plugin.request({ method: 'PUT', body: { settings: nextSettings } })
  assert.equal(result.code, 200, result.response && result.response.error)
}

async function start() {
  const result = await plugin.request({ method: 'POST', body: { action: 'start' } })
  assert.equal(result.code, 200, result.response && result.response.error)
}

function stop() {
  plugin.stopMonitoring()
}

test.before(() => {
  console.info = () => {}
  console.warn = () => {}
  console.error = () => {}
  fs.rmSync(TEST_ROOT, { recursive: true, force: true })
})

test.after(() => {
  if (plugin.monitoring || plugin.queue.length) plugin.stopMonitoring()
  plugin.loadInitialToken = originalLoadInitialToken
  plugin.drawLottery = originalDrawLottery
  global.fetch = originalFetch
  console.info = originalConsole.info
  console.warn = originalConsole.warn
  console.error = originalConsole.error
  fs.rmSync(TEST_ROOT, { recursive: true, force: true })
})

test('Pavlok OneComme plugin', async t => {
  await t.test('YouTube Super Chatだけを初期既読件数へ数える', async () => {
    initialize([
      comment('sc-jpy'),
      comment('sc-usd', { currency: 'USD' }),
      comment('sticker', { giftType: 'supersticker' }),
      comment('membership', { giftType: 'subscribe' }),
      comment('normal', { hasGift: false, giftType: 'none' }),
      comment('twitch', { service: 'twitch' })
    ])
    await start()
    assert(plugin.logs.some(line => line.includes('[INIT] Super Chat 2 件を既読')))
    assert.equal(plugin.handledIds.size, 2)
    assert.equal(plugin.queue.length, 0)
    stop()
  })

  await t.test('6枠はあたり1枠・確変1枠・はずれ4枠になる', () => {
    const originalRandom = Math.random
    try {
      const results = []
      for (let index = 0; index < 6; index += 1) {
        Math.random = () => (index + 0.5) / 6
        results.push(originalDrawLottery.call(plugin))
      }
      assert.deepEqual(results.map(result => result.name), ['あたり', '確変', 'はずれ', 'はずれ', 'はずれ', 'はずれ'])
      assert.deepEqual(results.map(result => result.stimulusCount), [1, 2, 0, 0, 0, 0])
    } finally {
      Math.random = originalRandom
    }
  })

  await t.test('単一金額の完全一致だけをFIFOで6枠抽選する', async () => {
    initialize()
    await save(settings())
    const outcomes = [
      { slot: 1, name: 'あたり', stimulusCount: 1 },
      { slot: 2, name: '確変', stimulusCount: 2 },
      { slot: 3, name: 'はずれ', stimulusCount: 0 }
    ]
    plugin.drawLottery = () => outcomes.shift()
    await start()
    plugin.subscribe('comments', [
      comment('hit-500', { price: 500 }),
      comment('fraction', { price: 500.5 }),
      comment('bonus-500', { price: 500 }),
      comment('unmatched', { price: 1000 }),
      comment('foreign', { price: 500, currency: 'USD' }),
      comment('miss-500', { price: 500 }),
      comment('miss-500', { price: 500 })
    ])
    await waitUntil(() => plugin.logs.filter(line => line.includes('[LOTTERY]')).length === 3)
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 3)
    const matches = plugin.logs.filter(line => line.includes('[MATCH]'))
    assert.equal(matches.length, 3)
    assert(matches.every(line => line.includes('500円')))
    const lotteries = plugin.logs.filter(line => line.includes('[LOTTERY]'))
    assert(lotteries[0].includes('1/6 あたり（電撃1回）'))
    assert(lotteries[1].includes('2/6 確変（電撃2回）'))
    assert(lotteries[2].includes('3/6 はずれ（電撃なし）'))
    assert.equal(plugin.logs.filter(line => line.includes('[DRY-RUN]')).length, 3)
    stop()
  })

  await t.test('確変の電撃2回に共通クールダウンを適用する', async () => {
    initialize()
    await save(settings({ cooldownSeconds: 0.08 }))
    plugin.drawLottery = () => ({ slot: 2, name: '確変', stimulusCount: 2 })
    await start()
    const startedAt = Date.now()
    plugin.subscribe('comments', [comment('bonus-cooldown')])
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 2)
    assert(Date.now() - startedAt >= 65, '確変の2回目がクールダウン前に実行されました。')
    stop()
  })

  await t.test('停止時は待機中の予約を破棄する', async () => {
    initialize()
    await save(settings({ delaySeconds: 0.2 }))
    await start()
    plugin.subscribe('comments', [comment('delayed')])
    assert.equal(plugin.queue.length, 1)
    stop()
    await new Promise(resolve => setTimeout(resolve, 230))
    assert.equal(plugin.queue.length, 0)
    assert.equal(plugin.logs.filter(line => line.includes('[DRY-RUN]')).length, 0)
  })

  await t.test('手動実行は停止中だけ動作しDRY-RUNでは送信しない', async () => {
    initialize()
    await save(settings())
    let fetchCount = 0
    global.fetch = async () => {
      fetchCount += 1
      throw new Error('DRY-RUNでfetchが呼ばれました。')
    }
    const manual = await plugin.request({ method: 'POST', body: { action: 'manual', output: 37 } })
    assert.equal(manual.code, 200)
    assert(plugin.logs.some(line => line.includes('[DRY-RUN] #MANUAL 電撃 output=37')))
    assert.equal(fetchCount, 0)
    await start()
    const blocked = await plugin.request({ method: 'POST', body: { action: 'manual', output: 37 } })
    assert.equal(blocked.code, 400)
    assert.match(blocked.response.error, /先に監視を停止/)
    stop()
  })

  await t.test('手動出力は1～100の整数だけを受け付ける', async () => {
    initialize()
    for (const output of [0, 101, 1.5, 'abc']) {
      const result = await plugin.request({ method: 'POST', body: { action: 'manual', output } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, /1～100の整数/)
    }
  })

  await t.test('確変はPavlokへ電撃を2回送信する', async () => {
    initialize()
    let stimulusCount = 0
    plugin.loadInitialToken = () => 'initial-token'
    global.fetch = async url => {
      if (url.includes('/api/v5/user/')) {
        return { status: 200, json: async () => ({ user: { token: 'runtime-token' } }) }
      }
      stimulusCount += 1
      return { status: 200, json: async () => ({}) }
    }
    const enabled = settings({ pavlokEnabled: true })
    plugin.store.set('settings', enabled)
    plugin.settings = enabled
    plugin.drawLottery = () => ({ slot: 2, name: '確変', stimulusCount: 2 })
    await start()
    plugin.subscribe('comments', [comment('bonus-live')])
    await waitUntil(() => stimulusCount === 2)
    assert.equal(stimulusCount, 2)
    stop()
  })

  await t.test('確変の1回目が401ならtokenだけ更新して残りを送信しない', async () => {
    initialize()
    const calls = []
    let userTokenNumber = 0
    plugin.loadInitialToken = () => 'initial-token'
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      if (url.includes('/api/v5/user/')) {
        userTokenNumber += 1
        return { status: 200, json: async () => ({ user: { token: `runtime-${userTokenNumber}` } }) }
      }
      return { status: 401, json: async () => ({}) }
    }
    const enabled = settings({ pavlokEnabled: true })
    plugin.store.set('settings', enabled)
    plugin.settings = enabled
    plugin.drawLottery = () => ({ slot: 2, name: '確変', stimulusCount: 2 })
    await start()
    plugin.subscribe('comments', [comment('unauthorized')])
    await waitUntil(() => plugin.logs.some(line => line.includes('token更新済み')))
    const stimulusCalls = calls.filter(call => call.url.includes('/stimulus/send'))
    const userCalls = calls.filter(call => call.url.includes('/api/v5/user/'))
    assert.equal(stimulusCalls.length, 1)
    assert.equal(userCalls.length, 2)
    assert.equal(stimulusCalls[0].options.headers.Authorization, 'Bearer runtime-1')
    assert.equal(plugin.runtimeToken, 'runtime-2')
    stop()
  })

  await t.test('手動電撃のHTTP失敗を画面へ返して再送しない', async () => {
    initialize()
    let stimulusCount = 0
    plugin.loadInitialToken = () => 'initial-token'
    global.fetch = async url => {
      if (url.includes('/api/v5/user/')) {
        return { status: 200, json: async () => ({ user: { token: 'runtime-token' } }) }
      }
      stimulusCount += 1
      return { status: 500, json: async () => ({}) }
    }
    const enabled = settings({ pavlokEnabled: true })
    plugin.store.set('settings', enabled)
    plugin.settings = enabled
    const result = await plugin.request({ method: 'POST', body: { action: 'manual', output: 25 } })
    assert.equal(result.code, 400)
    assert.match(result.response.error, /HTTP 500/)
    assert.equal(stimulusCount, 1)
  })

  await t.test('びりびり対象金額は1以上の整数だけを受け付ける', async () => {
    initialize()
    for (const targetAmount of [0, 1.5, 'abc']) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings({ targetAmount }) } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, /1以上の整数/)
    }
  })

  await t.test('旧金額グループ設定を単一金額へ移行する', () => {
    const legacySettings = {
      pavlokEnabled: false,
      delaySeconds: 4,
      cooldownSeconds: 5,
      ignoreInitialHistory: true,
      groups: [
        { enabled: false, amounts: '200', outputMode: 'fixed', fixedOutput: 10, randomMin: 10, randomMax: 10 },
        { enabled: true, amounts: '700,900', outputMode: 'random', fixedOutput: 30, randomMin: 25, randomMax: 35 }
      ]
    }
    initialize([], legacySettings)
    assert.equal(plugin.settings.targetAmount, 700)
    assert.equal(plugin.settings.outputMode, 'random')
    assert.equal(plugin.settings.fixedOutput, 30)
    assert.equal(plugin.settings.randomMin, 25)
    assert.equal(plugin.settings.randomMax, 35)
    assert.equal(plugin.settings.delaySeconds, 4)
    assert.equal(plugin.settings.cooldownSeconds, 5)
  })
})
