import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  getIdsFromContent,
  getLabelsFromLegacyBlock,
  getLabelsFromLonghandNotation,
  getLabelsFromShorthandNotation,
} from '../../features/completion/xrefIdExtractor.js'

describe('getLabelsFromLegacyBlock', () => {
  test('Should extract every legacy double-bracket anchor', () => {
    const content = '[[first]]\nsome text\n[[second]]'
    assert.deepStrictEqual(getLabelsFromLegacyBlock(content), [
      'first',
      'second',
    ])
  })

  test('Should return an empty array when there is no legacy anchor', () => {
    assert.deepStrictEqual(getLabelsFromLegacyBlock('no anchors here'), [])
  })

  test('Should not match the shorthand or longhand syntaxes', () => {
    assert.deepStrictEqual(
      getLabelsFromLegacyBlock('[#shorthand]\n[id=longhand]'),
      [],
    )
  })
})

describe('getLabelsFromShorthandNotation', () => {
  test('Should extract every shorthand anchor', () => {
    const content = '[#intro]\n== Title\n[#summary]'
    assert.deepStrictEqual(getLabelsFromShorthandNotation(content), [
      'intro',
      'summary',
    ])
  })

  test('Should return an empty array when there is no shorthand anchor', () => {
    assert.deepStrictEqual(getLabelsFromShorthandNotation('[[legacy]]'), [])
  })
})

describe('getLabelsFromLonghandNotation', () => {
  test('Should extract every longhand anchor', () => {
    const content = '[id=intro]\n== Title\n[id=summary]'
    assert.deepStrictEqual(getLabelsFromLonghandNotation(content), [
      'intro',
      'summary',
    ])
  })

  test('Should return an empty array when there is no longhand anchor', () => {
    assert.deepStrictEqual(getLabelsFromLonghandNotation('[[legacy]]'), [])
  })
})

describe('getIdsFromContent', () => {
  test('Should collect ids across the legacy, shorthand and longhand syntaxes', () => {
    const content = '[[legacy]]\n[#shorthand]\n[id=longhand]'
    assert.deepStrictEqual(getIdsFromContent(content), [
      'legacy',
      'shorthand',
      'longhand',
    ])
  })

  test('Should return an empty array for a document without anchors', () => {
    assert.deepStrictEqual(getIdsFromContent('= Title\n\nA paragraph.'), [])
  })
})
