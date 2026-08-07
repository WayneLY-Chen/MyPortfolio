// 語音選項的契約測試。
//
//   cd frontend && node --test src/components/interview/ttsOptions.test.js

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SPEED_OPTIONS,
  DEFAULT_SPEED,
  VOICE_BY_LANGUAGE,
  resolveVoice,
  normalizeSpeed,
} from './ttsOptions.js'
import { RATE_OPTIONS } from './interviewReducer.js'

describe('D-16: 語速三段', () => {
  it('SPEED_OPTIONS 就是 0.75 / 1 / 1.25,預設 1', () => {
    assert.deepStrictEqual(SPEED_OPTIONS, [0.75, 1, 1.25])
    assert.equal(DEFAULT_SPEED, 1)
  })

  it('與狀態機的 RATE_OPTIONS 是同一份清單(防止兩處漂移)', () => {
    assert.deepStrictEqual(SPEED_OPTIONS, RATE_OPTIONS)
  })

  it('三個語速原樣通過', () => {
    for (const v of SPEED_OPTIONS) assert.equal(normalizeSpeed(v), v)
  })

  it('0.5 / 2 / 字串 / undefined / null / NaN 一律退回 1', () => {
    for (const bad of [0.5, 2, '1.25', 'fast', undefined, null, NaN, {}, []]) {
      assert.equal(normalizeSpeed(bad), DEFAULT_SPEED)
    }
  })

  it('原型上的鍵不會被誤判為合法語速', () => {
    assert.equal(normalizeSpeed('constructor'), DEFAULT_SPEED)
    assert.equal(normalizeSpeed('__proto__'), DEFAULT_SPEED)
  })
})

describe('D-15: 中英文各自的聲線', () => {
  it('中文沿用與 Wobot 同一聲線', () => {
    assert.equal(VOICE_BY_LANGUAGE.zh, 'zh-CN-XiaoxiaoNeural')
    assert.equal(resolveVoice('zh'), 'zh-CN-XiaoxiaoNeural')
  })

  it('英文換英文聲線', () => {
    assert.equal(resolveVoice('en'), 'en-US-AriaNeural')
    assert.notEqual(resolveVoice('en'), resolveVoice('zh'))
  })

  it('未知語言退回中文聲線', () => {
    for (const bad of ['jp', '', undefined, null, 'constructor', '__proto__']) {
      assert.equal(resolveVoice(bad), VOICE_BY_LANGUAGE.zh)
    }
  })
})
