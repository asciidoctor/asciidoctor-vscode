import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { findImagesDirBeforeCursor } from '../../features/imagesDir.js'

/**
 * Resolve `:imagesdir:` as if the cursor sat at the `|` marker in `fixture`
 * (the marker is removed before scanning).
 */
function imagesDirAt(fixture: string): string | undefined {
  const cursorOffset = fixture.indexOf('|')
  assert.notStrictEqual(cursorOffset, -1, 'the fixture must contain a | marker')
  return findImagesDirBeforeCursor(fixture.replace('|', ''), cursorOffset)
}

describe('findImagesDirBeforeCursor', () => {
  test('Should read the imagesdir defined in the document header', () => {
    assert.strictEqual(
      imagesDirAt('= Title\n:imagesdir: assets/images\n\n|'),
      'assets/images',
    )
  })

  test('Should return undefined when no imagesdir is defined', () => {
    assert.strictEqual(imagesDirAt('= Title\n\nsome text\n\n|'), undefined)
  })

  test('Should resolve the nearest imagesdir declared above the cursor', () => {
    assert.strictEqual(
      imagesDirAt(
        '= Title\n:imagesdir: foo\n\nbefore\n\n:imagesdir: bar\n\n|\n\n:imagesdir: baz',
      ),
      'bar',
    )
  })

  test('Should ignore an imagesdir that only appears inside a listing block (#879)', () => {
    assert.strictEqual(
      imagesDirAt('= Title\n\n----\n:imagesdir: new/path/to/images\n----\n\n|'),
      undefined,
    )
  })

  test('Should ignore an imagesdir inside a comment block', () => {
    assert.strictEqual(
      imagesDirAt('= Title\n\n////\n:imagesdir: secret\n////\n\n|'),
      undefined,
    )
  })

  test('Should still see a header imagesdir when a later one hides in a block', () => {
    assert.strictEqual(
      imagesDirAt(
        '= Title\n:imagesdir: real\n\n----\n:imagesdir: fake\n----\n\n|',
      ),
      'real',
    )
  })

  test('Should let a bare imagesdir entry reset a previous value', () => {
    assert.strictEqual(
      imagesDirAt('= Title\n:imagesdir: foo\n\n:imagesdir:\n\n|'),
      undefined,
    )
  })

  test('Should let an unset (!) imagesdir entry reset a previous value', () => {
    assert.strictEqual(
      imagesDirAt('= Title\n:imagesdir: foo\n\n:imagesdir!:\n\n|'),
      undefined,
    )
  })

  test('Should ignore an imagesdir declared after the cursor', () => {
    assert.strictEqual(
      imagesDirAt('= Title\n\n|\n\n:imagesdir: later'),
      undefined,
    )
  })

  test('Should trim a trailing carriage return (CRLF)', () => {
    assert.strictEqual(
      imagesDirAt('= Title\r\n:imagesdir: assets/images\r\n\r\n|'),
      'assets/images',
    )
  })
})
