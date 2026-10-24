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
    hitDelaySeconds: 0,
    bonusFirstDelaySeconds: 0,
    bonusSecondDelaySeconds: 0,
    wordPartyHitDurationSeconds: 0,
    wordPartyBonusDurationSeconds: 0,
    wordPartyMiss1DurationSeconds: 0,
    wordPartyMiss2DurationSeconds: 0,
    wordPartyMiss3DurationSeconds: 0,
    wordPartyMiss4DurationSeconds: 0,
    ...overrides
  }
}

function comment(id, options = {}) {
  return {
    id,
    service: options.service || 'youtube',
    name: options.name || 'テスト視聴者',
    data: {
      id: options.dataId,
      hasGift: options.hasGift === undefined ? true : options.hasGift,
      giftType: options.giftType || 'superchat',
      price: options.price === undefined ? 500 : options.price,
      currency: options.currency === undefined ? 'JPY' : options.currency,
      paidText: options.paidText || `${options.price === undefined ? 500 : options.price}円`
    }
  }
}

function initialize(initialComments = [], storedSettings = null, keepMonitoring = false) {
  fs.mkdirSync(TEST_ROOT, { recursive: true })
  const dir = fs.mkdtempSync(path.join(TEST_ROOT, 'case-'))
  const store = new MemoryStore()
  if (storedSettings) store.set('settings', storedSettings)
  plugin.loadInitialToken = originalLoadInitialToken
  plugin.drawLottery = originalDrawLottery
  global.fetch = originalFetch
  plugin.init({ dir, store }, { comments: initialComments })
  if (!keepMonitoring && plugin.monitoring) plugin.stopMonitoring()
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
  await t.test('プラグイン起動時に自動で監視を開始する', async () => {
    initialize([], null, true)
    const state = await plugin.request({ method: 'GET' })
    assert.equal(state.code, 200)
    assert.equal(state.response.monitoring, true)
    assert.equal(state.response.starting, false)
    assert(plugin.logs.some(line => line.includes('[START] 監視開始')))
    stop()
  })

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

  await t.test('外側IDが同じでも固有のdata.idを持つSuper Chatは別々に処理する', async () => {
    initialize()
    await save(settings())
    plugin.drawLottery = () => ({ slot: 3, name: 'はずれ', stimulusCount: 0 })
    await start()
    plugin.subscribe('comments', {
      comments: [
        comment('comment-tester', { dataId: 'tester-event-1' }),
        comment('comment-tester', { dataId: 'tester-event-2' }),
        comment('comment-tester', { dataId: 'tester-event-2' })
      ]
    })
    await waitUntil(() => plugin.logs.filter(line => line.includes('[LOTTERY]')).length === 2)
    assert.equal(plugin.logs.filter(line => line.includes('[SUPERCHAT]')).length, 2)
    assert.equal(plugin.logs.filter(line => line.includes('[MATCH]')).length, 2)
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
      assert.deepEqual(results.map(result => result.slot), [1, 2, 3, 4, 5, 6])
      assert.deepEqual(results.map(result => result.name), ['あたり', '確変', 'はずれ1', 'はずれ2', 'はずれ3', 'はずれ4'])
      assert.deepEqual(results.map(result => result.stimulusCount), [1, 2, 0, 0, 0, 0])
    } finally {
      Math.random = originalRandom
    }
  })

  await t.test('6枠の名前を個別に変更できる', async () => {
    initialize()
    const names = ['大当たり', '連続電撃', 'セーフA', 'セーフB', 'セーフC', 'セーフD']
    await save(settings({
      slotHitName: names[0],
      slotBonusName: names[1],
      slotMiss1Name: names[2],
      slotMiss2Name: names[3],
      slotMiss3Name: names[4],
      slotMiss4Name: names[5]
    }))
    const originalRandom = Math.random
    try {
      const results = []
      for (let index = 0; index < 6; index += 1) {
        Math.random = () => (index + 0.5) / 6
        results.push(originalDrawLottery.call(plugin))
      }
      assert.deepEqual(results.map(result => result.name), names)
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
    plugin.subscribe('comments', {
      comments: [
        comment('hit-500', { price: 500 }),
        comment('fraction', { price: 500.5 }),
        comment('bonus-500', { price: 500 }),
        comment('unmatched', { price: 1000 }),
        comment('foreign', { price: 500, currency: 'USD' }),
        comment('miss-500', { price: 500 }),
        comment('miss-500', { price: 500 })
      ],
      userNameMap: {},
      options: {}
    })
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

  await t.test('6つの抽選枠ごとに対応するWordParty演出を1回実行する', async () => {
    initialize()
    const calls = []
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      return { status: 204 }
    }
    await save(settings({
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004'
    }))
    const outcomes = [
      { slot: 1, name: 'あたり', stimulusCount: 1 },
      { slot: 2, name: '確変', stimulusCount: 2 },
      { slot: 3, name: 'はずれ', stimulusCount: 0 },
      { slot: 4, name: 'はずれ', stimulusCount: 0 },
      { slot: 5, name: 'はずれ', stimulusCount: 0 },
      { slot: 6, name: 'はずれ', stimulusCount: 0 }
    ]
    plugin.drawLottery = () => outcomes.shift()
    await start()
    plugin.subscribe('comments', [
      comment('wordparty-hit'),
      comment('wordparty-bonus'),
      comment('wordparty-miss-1'),
      comment('wordparty-miss-2'),
      comment('wordparty-miss-3'),
      comment('wordparty-miss-4')
    ])
    await waitUntil(() => calls.length === 6)
    assert.deepEqual(calls.map(call => call.url), [
      'http://localhost:11180/api/wordparty/HIT00001',
      'http://localhost:11180/api/wordparty/BONUS001',
      'http://localhost:11180/api/wordparty/MISS0001',
      'http://localhost:11180/api/wordparty/MISS0002',
      'http://localhost:11180/api/wordparty/MISS0003',
      'http://localhost:11180/api/wordparty/MISS0004'
    ])
    assert(calls.every(call => call.options.method === 'POST'))
    assert.equal(plugin.logs.filter(line => line.includes('[WORDPARTY]') && line.includes('演出実行')).length, 6)
    stop()
  })

  await t.test('WordParty連携OFFでは抽選時にWordParty APIへ送信しない', async () => {
    initialize()
    let fetchCount = 0
    global.fetch = async () => {
      fetchCount += 1
      throw new Error('WordParty連携OFFでfetchが呼ばれました。')
    }
    await save(settings())
    plugin.drawLottery = () => ({ slot: 3, name: 'はずれ', stimulusCount: 0 })
    await start()
    plugin.subscribe('comments', [comment('wordparty-disabled')])
    await waitUntil(() => plugin.logs.some(line => line.includes('[LOTTERY]')))
    assert.equal(fetchCount, 0)
    stop()
  })

  await t.test('選ばれたWordParty演出の設定時間を確保してから次の演出へ進む', async () => {
    initialize()
    const calledAt = []
    global.fetch = async url => {
      if (!url.includes('/api/wordparty/')) throw new Error('想定外のfetchです。')
      calledAt.push(Date.now())
      return { status: 204 }
    }
    await save(settings({
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004',
      wordPartyMiss1DurationSeconds: 0.08
    }))
    const outcomes = [
      { slot: 3, name: 'はずれ', stimulusCount: 0 },
      { slot: 4, name: 'はずれ', stimulusCount: 0 }
    ]
    plugin.drawLottery = () => outcomes.shift()
    await start()
    plugin.subscribe('comments', [comment('duration-first'), comment('duration-second')])
    await waitUntil(() => calledAt.length === 2)
    assert(calledAt[1] - calledAt[0] >= 65, '演出時間が終わる前に次のWordParty演出が開始されました。')
    assert(plugin.logs.some(line => line.includes('はずれ1の演出時間 0.08s')))
    stop()
  })

  await t.test('各枠の手動実行は監視中もFIFOでWordPartyと電撃を実行する', async () => {
    initialize()
    let wordPartyCount = 0
    let stimulusCount = 0
    plugin.loadInitialToken = () => 'initial-token'
    global.fetch = async url => {
      if (url.includes('/api/v5/user/')) {
        return { status: 200, json: async () => ({ user: { token: 'runtime-token' } }) }
      }
      if (url.includes('/api/wordparty/')) {
        wordPartyCount += 1
        return { status: 204 }
      }
      stimulusCount += 1
      return { status: 200, json: async () => ({}) }
    }
    const enabled = settings({
      pavlokEnabled: true,
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004',
      slotBonusName: '連続電撃'
    })
    plugin.store.set('settings', enabled)
    plugin.settings = enabled
    await start()
    const result = await plugin.request({ method: 'POST', body: { action: 'manual-slot', slot: 2 } })
    assert.equal(result.code, 200)
    assert.equal(result.response.monitoring, true)
    await waitUntil(() => wordPartyCount === 1 && stimulusCount === 2)
    assert(plugin.logs.some(line => line.includes('[MANUAL]') && line.includes('連続電撃')))
    assert(plugin.logs.some(line => line.includes('[LOTTERY]') && line.includes('電撃2回')))
    stop()
  })

  await t.test('停止中の枠手動実行は設定時間を確保しDRY-RUNする', async () => {
    initialize()
    let wordPartyCount = 0
    global.fetch = async url => {
      if (!url.includes('/api/wordparty/')) throw new Error('DRY-RUNでPavlok APIが呼ばれました。')
      wordPartyCount += 1
      return { status: 204 }
    }
    await save(settings({
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004',
      wordPartyHitDurationSeconds: 0.08
    }))
    const startedAt = Date.now()
    const result = await plugin.request({ method: 'POST', body: { action: 'manual-slot', slot: 1 } })
    assert.equal(result.code, 200)
    assert(Date.now() - startedAt >= 65, '設定した演出時間より前に手動実行が完了しました。')
    assert.equal(wordPartyCount, 1)
    assert.equal(plugin.logs.filter(line => line.includes('[DRY-RUN] #MANUAL')).length, 1)
  })

  await t.test('WordPartyのHTTP失敗でもPavlokの電撃を止めず再実行しない', async () => {
    initialize()
    let wordPartyCount = 0
    let stimulusCount = 0
    plugin.loadInitialToken = () => 'initial-token'
    global.fetch = async url => {
      if (url.includes('/api/v5/user/')) {
        return { status: 200, json: async () => ({ user: { token: 'runtime-token' } }) }
      }
      if (url.includes('/api/wordparty/')) {
        wordPartyCount += 1
        return { status: 500 }
      }
      stimulusCount += 1
      return { status: 200, json: async () => ({}) }
    }
    const enabled = settings({
      pavlokEnabled: true,
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004'
    })
    plugin.store.set('settings', enabled)
    plugin.settings = enabled
    plugin.drawLottery = () => ({ slot: 1, name: 'あたり', stimulusCount: 1 })
    await start()
    plugin.subscribe('comments', [comment('wordparty-failure')])
    await waitUntil(() => stimulusCount === 1 && plugin.logs.some(line => line.includes('[WORDPARTY]') && line.includes('HTTP 500')))
    assert.equal(wordPartyCount, 1)
    assert.equal(stimulusCount, 1)
    stop()
  })

  await t.test('あたりはWordParty呼び出し後から設定秒数を待って電撃を実行する', async () => {
    initialize()
    let wordPartyCalledAt = null
    global.fetch = async url => {
      if (url.includes('/api/wordparty/')) {
        wordPartyCalledAt = Date.now()
        return { status: 204 }
      }
      throw new Error('想定外のfetchです。')
    }
    await save(settings({
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004',
      hitDelaySeconds: 0.08
    }))
    plugin.drawLottery = () => ({ slot: 1, name: 'あたり', stimulusCount: 1 })
    await start()
    plugin.subscribe('comments', [comment('hit-wordparty-delay')])
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 1)
    assert.notEqual(wordPartyCalledAt, null)
    assert(Date.now() - wordPartyCalledAt >= 65, 'あたりの電撃が設定した待機時間より前に実行されました。')
    stop()
  })

  await t.test('WordParty連携OFFではあたりの最初の電撃待機を適用しない', async () => {
    initialize()
    await save(settings({ hitDelaySeconds: 10 }))
    plugin.drawLottery = () => ({ slot: 1, name: 'あたり', stimulusCount: 1 })
    await start()
    plugin.subscribe('comments', [comment('hit-no-wordparty-delay')])
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 1)
    assert.equal(plugin.logs.filter(line => line.includes('[WAIT]')).length, 0)
    stop()
  })

  await t.test('確変はWordParty後の1撃目と1撃目後の2撃目に個別待機を適用する', async () => {
    initialize()
    let wordPartyCalledAt = null
    global.fetch = async url => {
      if (url.includes('/api/wordparty/')) {
        wordPartyCalledAt = Date.now()
        return { status: 204 }
      }
      throw new Error('想定外のfetchです。')
    }
    await save(settings({
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004',
      bonusFirstDelaySeconds: 0.08,
      bonusSecondDelaySeconds: 0.08
    }))
    plugin.drawLottery = () => ({ slot: 2, name: '確変', stimulusCount: 2 })
    await start()
    plugin.subscribe('comments', [comment('bonus-wordparty-delay')])
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 1)
    const firstStimulusAt = Date.now()
    assert.notEqual(wordPartyCalledAt, null)
    assert(firstStimulusAt - wordPartyCalledAt >= 65, '確変の1撃目が設定した待機時間より前に実行されました。')
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 2)
    assert(Date.now() - firstStimulusAt >= 65, '確変の2撃目が設定した待機時間より前に実行されました。')
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

  await t.test('出力値指定の手動電撃は停止中だけ動作しDRY-RUNでは送信しない', async () => {
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

  await t.test('電撃までの待機時間は0～86400秒だけを受け付ける', async () => {
    initialize()
    for (const [key, value] of [
      ['hitDelaySeconds', -0.1],
      ['bonusFirstDelaySeconds', 86400.1],
      ['bonusSecondDelaySeconds', 'abc']
    ]) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings({ [key]: value }) } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, /0～86400/)
    }
  })

  await t.test('6枠のWordParty演出時間は0～86400秒だけを受け付ける', async () => {
    initialize()
    for (const [key, value, label] of [
      ['wordPartyHitDurationSeconds', -0.1, 'あたり'],
      ['wordPartyBonusDurationSeconds', 86400.1, '確変'],
      ['wordPartyMiss1DurationSeconds', 'abc', 'はずれ1'],
      ['wordPartyMiss2DurationSeconds', -1, 'はずれ2'],
      ['wordPartyMiss3DurationSeconds', Infinity, 'はずれ3'],
      ['wordPartyMiss4DurationSeconds', 86401, 'はずれ4']
    ]) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings({ [key]: value }) } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, new RegExp(`${label}の演出時間は0～86400`))
    }
  })

  await t.test('6枠の名前は制御文字を含まない1～40文字だけを受け付ける', async () => {
    initialize()
    for (const [key, value, label] of [
      ['slotHitName', '', 'あたり'],
      ['slotBonusName', 'a'.repeat(41), '確変'],
      ['slotMiss1Name', '改行\n不可', 'はずれ1']
    ]) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings({ [key]: value }) } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, new RegExp(`${label}枠名は1～40文字`))
    }
  })

  await t.test('WordParty連携ONでは6枠分の8文字演出IDを必須にする', async () => {
    initialize()
    const missing = await plugin.request({
      method: 'PUT',
      body: {
        settings: settings({
          wordPartyEnabled: true,
          wordPartyHitId: 'HIT00001',
          wordPartyBonusId: 'BONUS001',
          wordPartyMiss1Id: 'MISS0001',
          wordPartyMiss2Id: 'MISS0002',
          wordPartyMiss3Id: 'MISS0003'
        })
      }
    })
    assert.equal(missing.code, 400)
    assert.match(missing.response.error, /はずれ4演出ID/)

    const invalid = await plugin.request({
      method: 'PUT',
      body: { settings: settings({ wordPartyMiss1Id: 'short' }) }
    })
    assert.equal(invalid.code, 400)
    assert.match(invalid.response.error, /8文字の半角英数記号/)

    const duplicate = await plugin.request({
      method: 'PUT',
      body: {
        settings: settings({
          wordPartyEnabled: true,
          wordPartyHitId: 'SAME0001',
          wordPartyBonusId: 'SAME0001',
          wordPartyMiss1Id: 'MISS0001',
          wordPartyMiss2Id: 'MISS0002',
          wordPartyMiss3Id: 'MISS0003',
          wordPartyMiss4Id: 'MISS0004'
        })
      }
    })
    assert.equal(duplicate.code, 400)
    assert.match(duplicate.response.error, /別々の演出ID/)
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
    assert.equal(plugin.settings.hitDelaySeconds, 0)
    assert.equal(plugin.settings.bonusFirstDelaySeconds, 0)
    assert.equal(plugin.settings.bonusSecondDelaySeconds, 5)
    assert.equal(plugin.settings.wordPartyHitDurationSeconds, 0)
    assert.equal(plugin.settings.wordPartyBonusDurationSeconds, 0)
    assert.equal(plugin.settings.wordPartyMiss1DurationSeconds, 0)
    assert.equal(plugin.settings.wordPartyMiss2DurationSeconds, 0)
    assert.equal(plugin.settings.wordPartyMiss3DurationSeconds, 0)
    assert.equal(plugin.settings.wordPartyMiss4DurationSeconds, 0)
    assert.equal(plugin.settings.slotHitName, 'あたり')
    assert.equal(plugin.settings.slotBonusName, '確変')
    assert.equal(plugin.settings.slotMiss1Name, 'はずれ1')
    assert.equal(plugin.settings.slotMiss2Name, 'はずれ2')
    assert.equal(plugin.settings.slotMiss3Name, 'はずれ3')
    assert.equal(plugin.settings.slotMiss4Name, 'はずれ4')
    assert.equal(plugin.settings.cooldownSeconds, undefined)
  })
})
