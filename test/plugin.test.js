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
const DURATION_SETTING_KEYS = [
  'wordPartyHitDurationSeconds',
  'wordPartyHit2DurationSeconds',
  'wordPartyBonusDurationSeconds',
  'wordPartyMiss1DurationSeconds',
  'wordPartyMiss2DurationSeconds',
  'wordPartyMiss3DurationSeconds',
  'wordPartyMiss4DurationSeconds',
  'wordPartyMiss5DurationSeconds',
  'wordPartyMiss6DurationSeconds',
  'wordPartyMiss7DurationSeconds',
  'wordPartyMiss8DurationSeconds'
]
const DELAY_SETTING_KEYS = [
  'delaySeconds',
  'hitDelaySeconds',
  'hit2DelaySeconds',
  'bonusFirstDelaySeconds',
  'bonusSecondDelaySeconds'
]

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
  const result = JSON.parse(JSON.stringify(plugin.defaultState.settings))
  const group = result.amountGroups[0]
  result.pavlokEnabled = false
  result.wordPartyEnabled = false
  Object.assign(group, {
    delaySeconds: 0,
    hitDelaySeconds: 0,
    hit2DelaySeconds: 0,
    bonusFirstDelaySeconds: 0,
    bonusSecondDelaySeconds: 0,
    wordPartyHitDurationSeconds: 0,
    wordPartyHit2DurationSeconds: 0,
    wordPartyBonusDurationSeconds: 0,
    wordPartyMiss1DurationSeconds: 0,
    wordPartyMiss2DurationSeconds: 0,
    wordPartyMiss3DurationSeconds: 0,
    wordPartyMiss4DurationSeconds: 0,
    wordPartyMiss5DurationSeconds: 0,
    wordPartyMiss6DurationSeconds: 0,
    wordPartyMiss7DurationSeconds: 0,
    wordPartyMiss8DurationSeconds: 0,
    targetAmount: 500,
    outputMode: 'fixed',
    fixedOutput: 20,
    randomMin: 20,
    randomMax: 20
  })
  for (const [key, value] of Object.entries(overrides)) {
    if (['pavlokEnabled', 'wordPartyEnabled', 'ignoreInitialHistory', 'amountGroups'].includes(key)) result[key] = value
    else group[key] = value
  }
  return result
}

function groupedSettings(groupOverrides, rootOverrides = {}) {
  const result = settings(rootOverrides)
  groupOverrides.forEach((overrides, index) => Object.assign(result.amountGroups[index], overrides))
  return result
}

function baseWordPartyIds(prefix) {
  return {
    wordPartyHitId: `${prefix}HIT0001`,
    wordPartyBonusId: `${prefix}BON0001`,
    wordPartyMiss1Id: `${prefix}MIS0001`,
    wordPartyMiss2Id: `${prefix}MIS0002`,
    wordPartyMiss3Id: `${prefix}MIS0003`,
    wordPartyMiss4Id: `${prefix}MIS0004`
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
  await t.test('4金額枠を安全な初期設定として保持する', () => {
    const defaults = plugin.defaultState.settings
    assert.equal(defaults.pavlokEnabled, false)
    assert.equal(defaults.wordPartyEnabled, false)
    assert.equal(defaults.ignoreInitialHistory, true)
    assert.equal(defaults.amountGroups.length, 4)
    assert.deepEqual(defaults.amountGroups.map(group => group.enabled), [true, false, false, false])
    assert.deepEqual(defaults.amountGroups.map(group => group.groupName), ['金額枠1', '金額枠2', '金額枠3', '金額枠4'])
    assert.deepEqual(defaults.amountGroups.map(group => group.targetAmount), [304, 500, 1000, 2000])
    for (const group of defaults.amountGroups) {
      assert.equal(group.slotHitEnabled, true)
      assert.equal(group.slotBonusEnabled, true)
      assert.equal(group.slotMiss2Enabled, true)
      assert.equal(group.slotMiss3Enabled, true)
      assert.equal(group.slotMiss4Enabled, true)
      assert.equal(group.slotHit2Enabled, false)
      assert.equal(group.slotMiss5Enabled, false)
      assert.equal(group.slotMiss6Enabled, false)
      assert.equal(group.slotMiss7Enabled, false)
      assert.equal(group.slotMiss8Enabled, false)
      assert.equal(group.fixedOutput, 50)
      assert.equal(group.slotHitWeight, 1)
      assert.equal(group.slotMiss8Weight, 1)
      for (const key of Object.keys(group).filter(key => key.startsWith('wordParty') && key.endsWith('Id'))) {
        assert.equal(group[key], '')
      }
    }
  })

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
      assert.deepEqual(results.map(result => result.name), [
        'ビリビリタイム',
        'スーパービリビリタイム',
        'ハズレ～',
        '残念でした',
        'あたりませーん',
        'ビリビリするなんてさいあく'
      ])
      assert.deepEqual(results.map(result => result.stimulusCount), [1, 2, 0, 0, 0, 0])
      assert(results.every(result => result.totalSlots === 6))
    } finally {
      Math.random = originalRandom
    }
  })

  await t.test('追加枠をONにするとあたり2枠・確変1枠・はずれ8枠の11枠均等になる', async () => {
    initialize()
    await save(settings({
      slotHit2Enabled: true,
      slotMiss5Enabled: true,
      slotMiss6Enabled: true,
      slotMiss7Enabled: true,
      slotMiss8Enabled: true
    }))
    const originalRandom = Math.random
    try {
      const results = []
      for (let index = 0; index < 11; index += 1) {
        Math.random = () => (index + 0.5) / 11
        results.push(originalDrawLottery.call(plugin))
      }
      assert.deepEqual(results.map(result => result.slot), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      assert.deepEqual(results.map(result => result.stimulusCount), [1, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0])
      assert(results.every(result => result.totalSlots === 11))
    } finally {
      Math.random = originalRandom
    }
  })

  await t.test('追加カードごとのチェックがONの枠だけを重み1で抽選する', async () => {
    initialize()
    await save(settings({ slotHit2Enabled: true, slotMiss8Enabled: true }))
    const originalRandom = Math.random
    try {
      const results = []
      for (let index = 0; index < 8; index += 1) {
        Math.random = () => (index + 0.5) / 8
        results.push(originalDrawLottery.call(plugin))
      }
      assert.deepEqual(results.map(result => result.slot), [1, 2, 3, 4, 5, 6, 7, 11])
      assert.deepEqual(results.map(result => result.position), [1, 2, 3, 4, 5, 6, 7, 8])
      assert(results.every(result => result.totalSlots === 8))
    } finally {
      Math.random = originalRandom
    }
  })

  await t.test('はずれ1以外を個別にOFFにし重み1～10で抽選する', async () => {
    initialize()
    await save(settings({
      slotHitEnabled: true,
      slotHitWeight: 10,
      slotBonusEnabled: false,
      slotMiss1Weight: 1,
      slotMiss2Enabled: false,
      slotMiss3Enabled: false,
      slotMiss4Enabled: false
    }))
    assert.deepEqual(plugin.activeLotterySlots(), [1, 3])
    const originalRandom = Math.random
    try {
      const results = []
      for (const value of [0, 9.999 / 11, 10 / 11, 0.999]) {
        Math.random = () => value
        results.push(originalDrawLottery.call(plugin))
      }
      assert.deepEqual(results.map(result => result.slot), [1, 1, 3, 3])
      assert.deepEqual(results.map(result => result.totalWeight), [11, 11, 11, 11])
      assert.deepEqual(results.map(result => result.weight), [10, 10, 1, 1])
    } finally {
      Math.random = originalRandom
    }

    await save(settings({
      slotHitEnabled: false,
      slotBonusEnabled: false,
      slotMiss2Enabled: false,
      slotMiss3Enabled: false,
      slotMiss4Enabled: false
    }))
    assert.deepEqual(plugin.activeLotterySlots(), [3])
    assert.equal(originalDrawLottery.call(plugin).slot, 3)
  })

  await t.test('全11枠の重みは1～10の整数だけを受け付ける', async () => {
    initialize()
    const weightKeys = [
      'slotHitWeight',
      'slotBonusWeight',
      'slotMiss1Weight',
      'slotMiss2Weight',
      'slotMiss3Weight',
      'slotMiss4Weight',
      'slotHit2Weight',
      'slotMiss5Weight',
      'slotMiss6Weight',
      'slotMiss7Weight',
      'slotMiss8Weight'
    ]
    for (const key of weightKeys) {
      for (const value of [0, 11, 1.5, 'abc']) {
        const result = await plugin.request({ method: 'PUT', body: { settings: settings({ [key]: value }) } })
        assert.equal(result.code, 400)
        assert.match(result.response.error, /重みは1～10の整数/)
      }
    }
    const maximumWeights = settings(Object.fromEntries(weightKeys.map(key => [key, 10])))
    const saved = await plugin.request({ method: 'PUT', body: { settings: maximumWeights } })
    assert.equal(saved.code, 200)
    assert(weightKeys.every(key => saved.response.settings.amountGroups[0][key] === 10))
  })

  await t.test('4金額枠の名前・対象金額・出力設定を独立して使用する', async () => {
    initialize()
    await save(groupedSettings([
      { groupName: '通常枠', targetAmount: 500, delaySeconds: 0, fixedOutput: 20, slotHitName: '通常あたり' },
      { enabled: true, groupName: '中額枠', targetAmount: 700, delaySeconds: 0, fixedOutput: 40, slotHitName: '中額あたり' },
      { enabled: true, groupName: '高額枠', targetAmount: 900, delaySeconds: 0, fixedOutput: 60, slotHitName: '高額あたり' },
      { enabled: false, groupName: '予備枠', targetAmount: 500, delaySeconds: 0, fixedOutput: 80 }
    ]))
    plugin.drawLottery = group => plugin.lotteryForSlot(1, group)
    await start()
    plugin.subscribe('comments', [
      comment('group-1', { price: 500 }),
      comment('group-2', { price: 700 }),
      comment('group-3', { price: 900 })
    ])
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 3)
    const lotteries = plugin.logs.filter(line => line.includes('[LOTTERY]'))
    const outputs = plugin.logs.filter(line => line.includes('[OUTPUT]'))
    assert(lotteries.some(line => line.includes('通常枠') && line.includes('通常あたり')))
    assert(lotteries.some(line => line.includes('中額枠') && line.includes('中額あたり')))
    assert(lotteries.some(line => line.includes('高額枠') && line.includes('高額あたり')))
    assert(outputs.some(line => line.endsWith('固定 20')))
    assert(outputs.some(line => line.endsWith('固定 40')))
    assert(outputs.some(line => line.endsWith('固定 60')))
    stop()
  })

  await t.test('追加金額枠の手動実行はその枠の名前と出力を使用する', async () => {
    initialize()
    await save(groupedSettings([
      { targetAmount: 500 },
      { enabled: true, groupName: '手動確認枠', targetAmount: 700, fixedOutput: 77, slotHitName: '別設定あたり' }
    ]))
    const result = await plugin.request({ method: 'POST', body: { action: 'manual-slot', groupIndex: 1, slot: 1 } })
    assert.equal(result.code, 200)
    assert(plugin.logs.some(line => line.includes('[MANUAL]') && line.includes('手動確認枠') && line.includes('別設定あたり')))
    assert(plugin.logs.some(line => line.includes('[OUTPUT]') && line.endsWith('固定 77')))
    assert(plugin.logs.some(line => line.includes('[DRY-RUN]') && line.includes('output=77')))

    await save(groupedSettings([{ targetAmount: 500 }, { enabled: false, targetAmount: 700 }]))
    const disabled = await plugin.request({ method: 'POST', body: { action: 'manual-slot', groupIndex: 1, slot: 1 } })
    assert.equal(disabled.code, 400)
    assert.match(disabled.response.error, /無効な金額枠/)
  })

  await t.test('有効な金額枠の対象金額重複を拒否する', async () => {
    initialize()
    const duplicate = await plugin.request({
      method: 'PUT',
      body: { settings: groupedSettings([{ targetAmount: 500 }, { enabled: true, targetAmount: 500 }]) }
    })
    assert.equal(duplicate.code, 400)
    assert.match(duplicate.response.error, /別々のびりびり対象金額/)

    const disabledDuplicate = await plugin.request({
      method: 'PUT',
      body: { settings: groupedSettings([{ targetAmount: 500 }, { enabled: false, targetAmount: 500 }]) }
    })
    assert.equal(disabledDuplicate.code, 200)
  })

  await t.test('金額枠名は各枠で変更でき1～40文字に制限する', async () => {
    initialize()
    const saved = await plugin.request({
      method: 'PUT',
      body: { settings: groupedSettings([{ groupName: '通常' }, { groupName: '追加A' }, { groupName: '追加B' }, { groupName: '追加C' }]) }
    })
    assert.equal(saved.code, 200)
    assert.deepEqual(saved.response.settings.amountGroups.map(group => group.groupName), ['通常', '追加A', '追加B', '追加C'])
    for (const groupName of ['', 'a'.repeat(41), '改行\n不可']) {
      const result = await plugin.request({
        method: 'PUT',
        body: { settings: groupedSettings([{ groupName }]) }
      })
      assert.equal(result.code, 400)
      assert.match(result.response.error, /金額枠1の名前は1～40文字/)
    }
  })

  await t.test('金額枠ごとに別のWordParty演出IDを使用する', async () => {
    initialize()
    const zeroDurations = Object.fromEntries(DURATION_SETTING_KEYS.map(key => [key, 0]))
    await save(groupedSettings([
      { targetAmount: 500, delaySeconds: 0, ...zeroDurations, ...baseWordPartyIds('A') },
      { enabled: true, targetAmount: 700, delaySeconds: 0, ...zeroDurations, ...baseWordPartyIds('B') }
    ], { wordPartyEnabled: true }))
    const calls = []
    global.fetch = async url => {
      calls.push(url)
      return { status: 204 }
    }
    plugin.drawLottery = group => plugin.lotteryForSlot(3, group)
    await start()
    plugin.subscribe('comments', [comment('wordparty-a', { price: 500 }), comment('wordparty-b', { price: 700 })])
    await waitUntil(() => calls.length === 2)
    assert(calls.some(url => url.endsWith('/AMIS0001')))
    assert(calls.some(url => url.endsWith('/BMIS0001')))
    stop()
  })

  await t.test('11枠の名前を個別に変更できる', async () => {
    initialize()
    const names = ['大当たり', '連続電撃', 'セーフA', 'セーフB', 'セーフC', 'セーフD', '追加当たり', 'セーフE', 'セーフF', 'セーフG', 'セーフH']
    await save(settings({
      slotHit2Enabled: true,
      slotMiss5Enabled: true,
      slotMiss6Enabled: true,
      slotMiss7Enabled: true,
      slotMiss8Enabled: true,
      slotHitName: names[0],
      slotBonusName: names[1],
      slotMiss1Name: names[2],
      slotMiss2Name: names[3],
      slotMiss3Name: names[4],
      slotMiss4Name: names[5],
      slotHit2Name: names[6],
      slotMiss5Name: names[7],
      slotMiss6Name: names[8],
      slotMiss7Name: names[9],
      slotMiss8Name: names[10]
    }))
    const originalRandom = Math.random
    try {
      const results = []
      for (let index = 0; index < 11; index += 1) {
        Math.random = () => (index + 0.5) / 11
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
    const outcomes = [1, 2, 3].map(slot => plugin.lotteryForSlot(slot))
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
    assert(lotteries[0].includes('1/6・重み1/6'))
    assert(lotteries[0].includes('（電撃1回）'))
    assert(lotteries[1].includes('2/6・重み1/6'))
    assert(lotteries[1].includes('（電撃2回）'))
    assert(lotteries[2].includes('3/6・重み1/6'))
    assert(lotteries[2].includes('（電撃なし）'))
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

  await t.test('追加枠ONでは11枠それぞれのWordParty演出を1回実行する', async () => {
    initialize()
    const calls = []
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      return { status: 204 }
    }
    await save(settings({
      slotHit2Enabled: true,
      slotMiss5Enabled: true,
      slotMiss6Enabled: true,
      slotMiss7Enabled: true,
      slotMiss8Enabled: true,
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004',
      wordPartyHit2Id: 'HIT00002',
      wordPartyMiss5Id: 'MISS0005',
      wordPartyMiss6Id: 'MISS0006',
      wordPartyMiss7Id: 'MISS0007',
      wordPartyMiss8Id: 'MISS0008'
    }))
    let slot = 1
    plugin.drawLottery = () => plugin.lotteryForSlot(slot++)
    await start()
    plugin.subscribe('comments', Array.from({ length: 11 }, (_, index) => comment(`wordparty-11-${index + 1}`)))
    await waitUntil(() => plugin.queue.length === 0 && !plugin.processing, 3000)
    assert.equal(calls.length, 11)
    assert.deepEqual(calls.map(call => call.url), [
      'http://localhost:11180/api/wordparty/HIT00001',
      'http://localhost:11180/api/wordparty/BONUS001',
      'http://localhost:11180/api/wordparty/MISS0001',
      'http://localhost:11180/api/wordparty/MISS0002',
      'http://localhost:11180/api/wordparty/MISS0003',
      'http://localhost:11180/api/wordparty/MISS0004',
      'http://localhost:11180/api/wordparty/HIT00002',
      'http://localhost:11180/api/wordparty/MISS0005',
      'http://localhost:11180/api/wordparty/MISS0006',
      'http://localhost:11180/api/wordparty/MISS0007',
      'http://localhost:11180/api/wordparty/MISS0008'
    ])
    assert(calls.every(call => call.options.method === 'POST'))
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
    assert(plugin.logs.some(line => line.includes(`${plugin.settings.amountGroups[0].slotMiss1Name}の演出時間 0.08s`)))
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

  await t.test('チェックOFFの追加カードも手動実行で事前確認できる', async () => {
    initialize()
    await save(settings({ slotMiss8Name: '追加はずれ確認' }))
    const result = await plugin.request({ method: 'POST', body: { action: 'manual-slot', slot: 11 } })
    assert.equal(result.code, 200)
    assert(plugin.logs.some(line => line.includes('[MANUAL]') && line.includes('追加はずれ確認')))
    assert(plugin.logs.some(line => line.includes('枠11（抽選OFF）')))
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

  await t.test('追加あたりは個別の待機秒数を使って電撃を1回実行する', async () => {
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
      slotHit2Enabled: true,
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyHit2Id: 'HIT00002',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004',
      hit2DelaySeconds: 0.08
    }))
    plugin.drawLottery = () => plugin.lotteryForSlot(7)
    await start()
    plugin.subscribe('comments', [comment('hit-2-wordparty-delay')])
    await waitUntil(() => plugin.logs.filter(line => line.includes('[DRY-RUN]')).length === 1)
    assert.notEqual(wordPartyCalledAt, null)
    assert(Date.now() - wordPartyCalledAt >= 65, '追加あたりの電撃が設定した待機時間より前に実行されました。')
    assert(plugin.logs.some(line => line.includes('[LOTTERY]') && line.includes('7/7')))
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

  await t.test('最大許容値を保存し出力100をDRY-RUNで実行できる', async () => {
    initialize()
    const maximums = settings({
      targetAmount: Number.MAX_SAFE_INTEGER,
      fixedOutput: 100,
      randomMin: 100,
      randomMax: 100,
      ...Object.fromEntries([...DURATION_SETTING_KEYS, ...DELAY_SETTING_KEYS].map(key => [key, 86400]))
    })
    const saved = await plugin.request({ method: 'PUT', body: { settings: maximums } })
    assert.equal(saved.code, 200, saved.response && saved.response.error)
    const group = plugin.settings.amountGroups[0]
    assert.equal(group.targetAmount, Number.MAX_SAFE_INTEGER)
    assert.equal(group.fixedOutput, 100)
    assert.equal(group.randomMin, 100)
    assert.equal(group.randomMax, 100)
    for (const key of [...DURATION_SETTING_KEYS, ...DELAY_SETTING_KEYS]) assert.equal(group[key], 86400)

    let fetchCount = 0
    global.fetch = async () => {
      fetchCount += 1
      throw new Error('DRY-RUNでfetchが呼ばれました。')
    }
    const manual = await plugin.request({ method: 'POST', body: { action: 'manual', output: 100 } })
    assert.equal(manual.code, 200)
    assert(plugin.logs.some(line => line.includes('[DRY-RUN] #MANUAL 電撃 output=100')))
    assert.equal(fetchCount, 0)
  })

  await t.test('最大許容値を超える設定と手動出力を拒否する', async () => {
    initialize()
    const invalidSettings = [
      { targetAmount: Number.MAX_SAFE_INTEGER + 1 },
      { fixedOutput: 101 },
      { randomMin: 101 },
      { randomMax: 101 },
      ...DURATION_SETTING_KEYS.map(key => ({ [key]: 86400.1 })),
      ...DELAY_SETTING_KEYS.map(key => ({ [key]: 86400.1 }))
    ]
    for (const overrides of invalidSettings) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings(overrides) } })
      assert.equal(result.code, 400)
    }
    for (const output of [101, Number.MAX_SAFE_INTEGER, Infinity]) {
      const result = await plugin.request({ method: 'POST', body: { action: 'manual', output } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, /1～100の整数/)
    }
  })

  await t.test('極端に大きい値と小さい値を安全に検証する', async () => {
    initialize()
    const timeKeys = [...DURATION_SETTING_KEYS, ...DELAY_SETTING_KEYS]
    const tinySettings = settings({
      ...Object.fromEntries(timeKeys.map(key => [key, Number.MIN_VALUE]))
    })
    const tinySaved = await plugin.request({ method: 'PUT', body: { settings: tinySettings } })
    assert.equal(tinySaved.code, 200, tinySaved.response && tinySaved.response.error)
    for (const key of timeKeys) assert.equal(plugin.settings.amountGroups[0][key], Number.MIN_VALUE)

    const invalidSettings = [
      ...[Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE].map(targetAmount => ({ targetAmount })),
      ...['fixedOutput', 'randomMin', 'randomMax'].flatMap(key => [
        { [key]: Number.MAX_VALUE },
        { [key]: Number.MIN_VALUE },
        { [key]: -Number.MAX_VALUE }
      ]),
      ...timeKeys.flatMap(key => [
        { [key]: Number.MAX_VALUE },
        { [key]: -Number.MAX_VALUE },
        { [key]: -Number.MIN_VALUE }
      ]),
      { targetAmount: '9'.repeat(1000) },
      { fixedOutput: '9'.repeat(1000) },
      { delaySeconds: '9'.repeat(1000) }
    ]
    for (const overrides of invalidSettings) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings(overrides) } })
      assert.equal(result.code, 400)
    }
    for (const output of [Number.MAX_VALUE, Number.MIN_VALUE, -Number.MAX_VALUE, -Number.MIN_VALUE, '9'.repeat(1000)]) {
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

  await t.test('認証応答にruntime tokenがない環境でも保存済みAPIキーで電撃を送信する', async () => {
    initialize()
    const calls = []
    plugin.loadInitialToken = () => 'direct-api-key'
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      if (url.includes('/api/v5/user/')) {
        return { status: 200, json: async () => ({ user: { id: 'other-streamer' } }) }
      }
      return { status: 200, json: async () => ({}) }
    }
    const enabled = settings({ pavlokEnabled: true })
    plugin.store.set('settings', enabled)
    plugin.settings = enabled
    const result = await plugin.request({ method: 'POST', body: { action: 'manual', output: 25 } })
    assert.equal(result.code, 200)
    const stimulusCalls = calls.filter(call => call.url.includes('/stimulus/send'))
    assert.equal(stimulusCalls.length, 1)
    assert.equal(stimulusCalls[0].options.headers.Authorization, 'Bearer direct-api-key')
    assert.equal(plugin.runtimeToken, 'direct-api-key')
    assert(plugin.logs.some(line => line.includes('保存済みAPIキーを使用します')))
    assert(!plugin.logs.some(line => line.includes('direct-api-key')))
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
      ['hit2DelaySeconds', 86400.1],
      ['bonusFirstDelaySeconds', 86400.1],
      ['bonusSecondDelaySeconds', 'abc']
    ]) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings({ [key]: value }) } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, /0～86400/)
    }
  })

  await t.test('11枠のWordParty演出時間は0～86400秒だけを受け付ける', async () => {
    initialize()
    for (const [key, value, label] of [
      ['wordPartyHitDurationSeconds', -0.1, 'あたり'],
      ['wordPartyHit2DurationSeconds', -0.1, '追加あたり'],
      ['wordPartyBonusDurationSeconds', 86400.1, '確変'],
      ['wordPartyMiss1DurationSeconds', 'abc', 'はずれ1'],
      ['wordPartyMiss2DurationSeconds', -1, 'はずれ2'],
      ['wordPartyMiss3DurationSeconds', Infinity, 'はずれ3'],
      ['wordPartyMiss4DurationSeconds', 86401, 'はずれ4'],
      ['wordPartyMiss8DurationSeconds', 86401, 'はずれ8']
    ]) {
      const result = await plugin.request({ method: 'PUT', body: { settings: settings({ [key]: value }) } })
      assert.equal(result.code, 400)
      assert.match(result.response.error, new RegExp(`${label}の演出時間は0～86400`))
    }
  })

  await t.test('11枠の名前は制御文字を含まない1～40文字だけを受け付ける', async () => {
    initialize()
    for (const [key, value, label] of [
      ['slotHitName', '', 'あたり'],
      ['slotHit2Name', '', '追加あたり'],
      ['slotBonusName', 'a'.repeat(41), '確変'],
      ['slotMiss1Name', '改行\n不可', 'はずれ1'],
      ['slotMiss8Name', 'a'.repeat(41), 'はずれ8']
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
          wordPartyMiss3Id: 'MISS0003',
          wordPartyMiss4Id: ''
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

  await t.test('WordParty連携ONではチェックした追加カードだけ演出IDを必須にする', async () => {
    initialize()
    const common = {
      wordPartyEnabled: true,
      wordPartyHitId: 'HIT00001',
      wordPartyBonusId: 'BONUS001',
      wordPartyMiss1Id: 'MISS0001',
      wordPartyMiss2Id: 'MISS0002',
      wordPartyMiss3Id: 'MISS0003',
      wordPartyMiss4Id: 'MISS0004'
    }
    const missing = await plugin.request({
      method: 'PUT',
      body: { settings: settings({ ...common, slotHit2Enabled: true, wordPartyHit2Id: '' }) }
    })
    assert.equal(missing.code, 400)
    assert.match(missing.response.error, /追加あたり演出ID/)

    const selected = await plugin.request({
      method: 'PUT',
      body: {
        settings: settings({
          ...common,
          slotHit2Enabled: true,
          slotMiss8Enabled: true,
          wordPartyHit2Id: 'HIT00002',
          wordPartyMiss8Id: 'MISS0008'
        })
      }
    })
    assert.equal(selected.code, 200, selected.response && selected.response.error)
    assert.equal(selected.response.settings.amountGroups[0].wordPartyMiss5Id, '')

    const duplicate = await plugin.request({
      method: 'PUT',
      body: {
        settings: settings({
          ...common,
          slotHit2Enabled: true,
          wordPartyHit2Id: 'HIT00001'
        })
      }
    })
    assert.equal(duplicate.code, 400)
    assert.match(duplicate.response.error, /使用中の7枠には別々の演出ID/)
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
    const group = plugin.settings.amountGroups[0]
    assert.equal(group.targetAmount, 700)
    assert.equal(group.outputMode, 'random')
    assert.equal(group.fixedOutput, 30)
    assert.equal(group.randomMin, 25)
    assert.equal(group.randomMax, 35)
    assert.equal(group.delaySeconds, 4)
    assert.equal(group.slotHit2Enabled, false)
    assert.equal(group.slotMiss5Enabled, false)
    assert.equal(group.slotMiss6Enabled, false)
    assert.equal(group.slotMiss7Enabled, false)
    assert.equal(group.slotMiss8Enabled, false)
    assert.equal(group.hitDelaySeconds, 5)
    assert.equal(group.hit2DelaySeconds, 5)
    assert.equal(group.bonusFirstDelaySeconds, 7)
    assert.equal(group.bonusSecondDelaySeconds, 5)
    assert.equal(group.wordPartyHitDurationSeconds, 7)
    assert.equal(group.wordPartyHit2DurationSeconds, 7)
    assert.equal(group.wordPartyBonusDurationSeconds, 11)
    assert.equal(group.wordPartyMiss1DurationSeconds, 9)
    assert.equal(group.wordPartyMiss2DurationSeconds, 8)
    assert.equal(group.wordPartyMiss3DurationSeconds, 7)
    assert.equal(group.wordPartyMiss4DurationSeconds, 6)
    assert.equal(group.wordPartyMiss8DurationSeconds, 2)
    assert.equal(group.slotHitName, 'ビリビリタイム')
    assert.equal(group.slotHit2Name, 'ビリビリタイム2')
    assert.equal(group.slotBonusName, 'スーパービリビリタイム')
    assert.equal(group.slotMiss1Name, 'ハズレ～')
    assert.equal(group.slotMiss2Name, '残念でした')
    assert.equal(group.slotMiss3Name, 'あたりませーん')
    assert.equal(group.slotMiss4Name, 'ビリビリするなんてさいあく')
    assert.equal(group.slotMiss8Name, 'はずれ8')
    assert.equal(group.cooldownSeconds, undefined)
  })

  await t.test('v1.5.0の単一金額設定を金額枠1へ移行する', () => {
    const legacySettings = {
      pavlokEnabled: false,
      wordPartyEnabled: false,
      ignoreInitialHistory: false,
      targetAmount: 1234,
      delaySeconds: 3,
      outputMode: 'random',
      fixedOutput: 45,
      randomMin: 40,
      randomMax: 50,
      slotHit2Enabled: true,
      slotMiss5Enabled: true,
      slotHitName: '旧あたり',
      wordPartyHitId: 'OLDHIT01',
      wordPartyHitDurationSeconds: 12,
      hitDelaySeconds: 6,
      hit2DelaySeconds: 7,
      bonusFirstDelaySeconds: 8,
      bonusSecondDelaySeconds: 9
    }
    initialize([], legacySettings)
    const [group1, group2, group3, group4] = plugin.settings.amountGroups
    assert.equal(plugin.settings.ignoreInitialHistory, false)
    assert.equal(group1.enabled, true)
    assert.equal(group1.targetAmount, 1234)
    assert.equal(group1.delaySeconds, 3)
    assert.equal(group1.outputMode, 'random')
    assert.equal(group1.fixedOutput, 45)
    assert.equal(group1.randomMin, 40)
    assert.equal(group1.randomMax, 50)
    assert.equal(group1.slotHit2Enabled, true)
    assert.equal(group1.slotMiss5Enabled, true)
    assert.equal(group1.slotHitName, '旧あたり')
    assert.equal(group1.wordPartyHitId, 'OLDHIT01')
    assert.equal(group1.wordPartyHitDurationSeconds, 12)
    assert.equal(group1.hitDelaySeconds, 6)
    assert.equal(group1.hit2DelaySeconds, 7)
    assert.equal(group1.bonusFirstDelaySeconds, 8)
    assert.equal(group1.bonusSecondDelaySeconds, 9)
    assert.equal(group1.slotHitWeight, 1)
    assert.equal(group1.slotBonusEnabled, true)
    assert.equal(group1.slotMiss2Enabled, true)
    assert.deepEqual([group2.enabled, group3.enabled, group4.enabled], [false, false, false])
  })
})
