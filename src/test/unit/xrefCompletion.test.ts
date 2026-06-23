import assert from 'node:assert/strict'
import * as path from 'node:path'
import { describe, test } from 'node:test'
import {
  buildCrossRefLabel,
  matchesCrossRefQuery,
  parseCrossRefQuery,
  parseInternalRefQuery,
  shouldProvideCompletion,
} from '../../features/completion/xrefCompletion.js'

describe('shouldProvideCompletion', () => {
  test('Should detect the keyword ending exactly at the cursor', () => {
    // `xref:` typed, cursor right after the colon.
    assert.strictEqual(shouldProvideCompletion('xref:', 5, 'xref:'), true)
    assert.strictEqual(shouldProvideCompletion('<<', 2, '<<'), true)
  })

  test('Should not provide when the keyword does not end at the cursor', () => {
    assert.strictEqual(shouldProvideCompletion('xref:foo', 8, 'xref:'), false)
    assert.strictEqual(
      shouldProvideCompletion('hello world here', 10, 'xref:'),
      false,
    )
  })
})

describe('parseCrossRefQuery', () => {
  test('Should return an empty search and no bracket right after "xref:"', () => {
    assert.deepStrictEqual(parseCrossRefQuery('xref:', 5), {
      search: '',
      hasBracket: false,
    })
  })

  test('Should extract the id fragment typed before the bracket', () => {
    assert.deepStrictEqual(parseCrossRefQuery('xref:anchor[]', 5), {
      search: 'anchor',
      hasBracket: true,
    })
  })

  test('Should stop the search at the first whitespace', () => {
    assert.deepStrictEqual(parseCrossRefQuery('xref:anchor more', 5), {
      search: 'anchor',
      hasBracket: false,
    })
  })
})

describe('matchesCrossRefQuery', () => {
  test('Should match anything when the search is empty', () => {
    assert.strictEqual(matchesCrossRefQuery('anchor', ''), true)
  })

  test('Should match when the label contains the search', () => {
    assert.strictEqual(matchesCrossRefQuery('myAnchor', 'Anchor'), true)
  })

  test('Should not match when the label does not contain the search', () => {
    assert.strictEqual(matchesCrossRefQuery('myAnchor', 'other'), false)
  })
})

describe('buildCrossRefLabel', () => {
  const currentFilePath = path.join('docs', 'current.adoc')

  test('Should use the bare id within the same file and append the brackets', () => {
    assert.strictEqual(
      buildCrossRefLabel('anchor', false, {
        currentFilePath,
        targetFilePath: currentFilePath,
      }),
      'anchor[]',
    )
  })

  test('Should not append the brackets when they are already typed', () => {
    assert.strictEqual(
      buildCrossRefLabel('anchor', true, {
        currentFilePath,
        targetFilePath: currentFilePath,
      }),
      'anchor',
    )
  })

  test('Should prefix the relative path of the target file for other files', () => {
    const targetFilePath = path.join('docs', 'other.adoc')
    assert.strictEqual(
      buildCrossRefLabel('anchor', false, {
        currentFilePath,
        targetFilePath,
      }),
      'other.adoc#anchor[]',
    )
  })
})

describe('parseInternalRefQuery', () => {
  test('Should extract the id fragment typed after "<<"', () => {
    assert.strictEqual(parseInternalRefQuery('<<anchor', 8), 'anchor')
  })

  test('Should return an empty string right after "<<"', () => {
    assert.strictEqual(parseInternalRefQuery('<<', 2), '')
  })

  test('Should stop at the next whitespace', () => {
    assert.strictEqual(parseInternalRefQuery('<<anchor and more', 2), 'anchor')
  })
})
