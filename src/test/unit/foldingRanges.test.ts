import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  classifyDelimiter,
  FoldKind,
  getBlockFoldingRanges,
  type SimpleFoldingRange,
} from '../../features/foldingRanges.js'

function foldsForDocument(contents: string): SimpleFoldingRange[] {
  return getBlockFoldingRanges(contents.split('\n'))
}

function findFold(
  folds: readonly SimpleFoldingRange[],
  start: number,
): SimpleFoldingRange | undefined {
  return folds.find((fold) => fold.start === start)
}

describe('classifyDelimiter', () => {
  test('Should treat a four-or-more hyphen run as a verbatim listing block', () => {
    assert.deepStrictEqual(classifyDelimiter('----'), {
      verbatim: true,
      kind: FoldKind.Region,
    })
    assert.deepStrictEqual(classifyDelimiter('--------'), {
      verbatim: true,
      kind: FoldKind.Region,
    })
  })

  test('Should treat exactly two hyphens as a non-verbatim open block', () => {
    assert.deepStrictEqual(classifyDelimiter('--'), {
      verbatim: false,
      kind: FoldKind.Region,
    })
  })

  test('Should treat a comment delimiter as a verbatim comment block', () => {
    assert.deepStrictEqual(classifyDelimiter('////'), {
      verbatim: true,
      kind: FoldKind.Comment,
    })
  })

  test('Should treat example/sidebar/quote as compound (non-verbatim) blocks', () => {
    for (const delimiter of ['====', '****', '____']) {
      assert.deepStrictEqual(classifyDelimiter(delimiter), {
        verbatim: false,
        kind: FoldKind.Region,
      })
    }
  })

  test('Should treat literal/passthrough as verbatim blocks', () => {
    for (const delimiter of ['....', '++++']) {
      assert.deepStrictEqual(classifyDelimiter(delimiter), {
        verbatim: true,
        kind: FoldKind.Region,
      })
    }
  })

  test('Should treat table delimiters as verbatim blocks', () => {
    for (const delimiter of ['|===', ',===', ':===', '!===']) {
      assert.deepStrictEqual(classifyDelimiter(delimiter), {
        verbatim: true,
        kind: FoldKind.Region,
      })
    }
  })

  test('Should not classify three hyphens or ordinary text as a delimiter', () => {
    assert.strictEqual(classifyDelimiter('---'), undefined)
    assert.strictEqual(classifyDelimiter('not a delimiter'), undefined)
    assert.strictEqual(classifyDelimiter(''), undefined)
  })
})

describe('getBlockFoldingRanges', () => {
  test('Should fold a listing block', () => {
    const folds = foldsForDocument(`before

----
line 1
line 2
----

after`)
    assert.deepStrictEqual(findFold(folds, 2), {
      start: 2,
      end: 5,
      kind: FoldKind.Region,
    })
  })

  test('Should fold literal, example, sidebar, quote and passthrough blocks', () => {
    for (const delimiter of ['....', '====', '****', '____', '++++']) {
      const folds = foldsForDocument(`${delimiter}\ncontent\n${delimiter}`)
      assert.deepStrictEqual(
        findFold(folds, 0),
        { start: 0, end: 2, kind: FoldKind.Region },
        `failed for ${delimiter}`,
      )
    }
  })

  test('Should fold a comment block with the comment kind', () => {
    const folds = foldsForDocument(`////\ncomment\nmore\n////`)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 3,
      kind: FoldKind.Comment,
    })
  })

  test('Should fold a table', () => {
    const folds = foldsForDocument(`|===\n| a | b\n| c | d\n|===`)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 3,
      kind: FoldKind.Region,
    })
  })

  test('Should tolerate trailing whitespace on the delimiter lines', () => {
    const folds = foldsForDocument(`----  \ncode\n----\t`)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 2,
      kind: FoldKind.Region,
    })
  })

  test('Should treat delimiter-looking lines inside a listing block as content', () => {
    const folds = foldsForDocument(`----\n====\nnot an example\n----`)
    // Only the listing block folds; the inner `====` is verbatim content.
    assert.strictEqual(folds.length, 1)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 3,
      kind: FoldKind.Region,
    })
  })

  test('Should fold a block nested inside a compound block', () => {
    const folds = foldsForDocument(`====
before
----
code
----
after
====`)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 6,
      kind: FoldKind.Region,
    })
    assert.deepStrictEqual(findFold(folds, 2), {
      start: 2,
      end: 4,
      kind: FoldKind.Region,
    })
  })

  test('Should fold two consecutive blocks of the same type independently', () => {
    const folds = foldsForDocument(`----\na\n----\n----\nb\n----`)
    assert.strictEqual(folds.length, 2)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 2,
      kind: FoldKind.Region,
    })
    assert.deepStrictEqual(findFold(folds, 3), {
      start: 3,
      end: 5,
      kind: FoldKind.Region,
    })
  })

  test('Should fold an unterminated block to the end of the document', () => {
    const folds = foldsForDocument(`----\ncode\nmore`)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 2,
      kind: FoldKind.Region,
    })
  })

  test('Should return nothing when there are no delimited blocks', () => {
    assert.deepStrictEqual(foldsForDocument(`a\nb\nc`), [])
  })

  test('Should fold a run of consecutive single-line comments', () => {
    const folds = foldsForDocument(
      `// comment 1\n// comment 2\n// comment 3\ntext`,
    )
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 2,
      kind: FoldKind.Comment,
    })
  })

  test('Should not fold a single isolated comment line', () => {
    assert.deepStrictEqual(foldsForDocument(`// lonely\ntext`), [])
  })

  test('Should fold a run of consecutive document attributes', () => {
    const folds = foldsForDocument(`:a: 1\n:b: 2\n:c: 3\ntext`)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 2,
      kind: FoldKind.Region,
    })
  })

  // Regression: a `//` comment run preceding a `////` comment block used to be
  // conflated, folding from the first `//` line down to the block's closing
  // `////`. The two must now fold as two distinct ranges.
  test('Should not merge a comment run into a following comment block', () => {
    const folds = foldsForDocument(`// preceding comment 1
// preceding comment 2
////
inside the comment block
////`)
    // The preceding `//` lines fold on their own…
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 1,
      kind: FoldKind.Comment,
    })
    // …and the comment block folds separately, from its opening delimiter.
    assert.deepStrictEqual(findFold(folds, 2), {
      start: 2,
      end: 4,
      kind: FoldKind.Comment,
    })
  })

  test('Should not treat a comment block delimiter as a single-line comment', () => {
    // A lone `////` opening with no matching close still folds as one block to
    // the end of the document, not as a `//` comment run.
    const folds = foldsForDocument(`////\nstill a comment`)
    assert.deepStrictEqual(folds, [
      { start: 0, end: 1, kind: FoldKind.Comment },
    ])
  })

  test('Should not fold `//` content lines inside a verbatim listing block', () => {
    const folds = foldsForDocument(
      `----\n// not a comment\n// still code\n----`,
    )
    assert.deepStrictEqual(folds, [{ start: 0, end: 3, kind: FoldKind.Region }])
  })

  test('Should fold comments nested inside a compound block', () => {
    const folds = foldsForDocument(`--\n// c1\n// c2\ntext\n--`)
    assert.deepStrictEqual(findFold(folds, 0), {
      start: 0,
      end: 4,
      kind: FoldKind.Region,
    })
    assert.deepStrictEqual(findFold(folds, 1), {
      start: 1,
      end: 2,
      kind: FoldKind.Comment,
    })
  })
})
