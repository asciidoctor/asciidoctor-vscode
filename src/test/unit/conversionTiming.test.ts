import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ConversionTiming,
  describeSize,
  formatDuration,
} from '../../lib/conversionTiming.js'

describe('ConversionTiming', () => {
  test('records the duration of each phase and the total', () => {
    let now = 100
    const timing = new ConversionTiming(() => now)
    now = 110.4
    timing.phase('setup')
    now = 160.6
    timing.phase('load')
    now = 190
    timing.phase('convert')
    assert.equal(
      timing.format('Converted for the preview', 'file:///a.adoc', 'a\nb\n'),
      'Converted for the preview file:///a.adoc (2 lines, 4 chars) in 90 ms (setup: 10 ms, load: 50 ms, convert: 29 ms)',
    )
  })

  test('omits the phases when none was recorded', () => {
    let now = 0
    const timing = new ConversionTiming(() => now)
    now = 12
    assert.equal(
      timing.format('Parsed', 'file:///a.adoc', ''),
      'Parsed file:///a.adoc (0 lines, 0 chars) in 12 ms',
    )
  })

  test('uses performance.now() by default', () => {
    const timing = new ConversionTiming()
    assert.ok(timing.total >= 0)
  })
})

describe('describeSize', () => {
  test('counts the lines, with or without a trailing line feed', () => {
    assert.equal(describeSize('a'), '1 line, 1 chars')
    assert.equal(describeSize('a\nb'), '2 lines, 3 chars')
    assert.equal(describeSize('a\nb\n'), '2 lines, 4 chars')
    assert.equal(describeSize('a\n\nb'), '3 lines, 4 chars')
  })

  test('displays large sizes in thousands of characters', () => {
    assert.equal(describeSize('x'.repeat(2048)), '1 line, 2.0 K chars')
  })
})

describe('formatDuration', () => {
  test('rounds to the millisecond', () => {
    assert.equal(formatDuration(0.4), '0 ms')
    assert.equal(formatDuration(1234.5), '1235 ms')
  })
})
