import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { matchAntoraResourceMacroAt } from '../../features/antora/antoraResourceMacro.js'

describe('matchAntoraResourceMacroAt', () => {
  test('Should detect an inline image resource id under the cursor', () => {
    const line = 'image:commands:output.png[]'
    const macro = matchAntoraResourceMacroAt(line, 10)
    assert.strictEqual(macro?.id, 'commands:output.png')
    assert.strictEqual(macro?.family, 'image')
    assert.strictEqual(macro?.idStart, 6)
    assert.strictEqual(macro?.idEnd, 25)
  })

  test('Should detect a block image resource id with version and component', () => {
    const line = 'image::2.0@cli:commands:output.png[]'
    const macro = matchAntoraResourceMacroAt(line, 12)
    assert.strictEqual(macro?.id, '2.0@cli:commands:output.png')
    assert.strictEqual(macro?.family, 'image')
  })

  test('Should drop the fragment of an xref resource id', () => {
    const line = 'xref:page.adoc#anchor[text]'
    const macro = matchAntoraResourceMacroAt(line, 8)
    assert.strictEqual(macro?.id, 'page.adoc')
    assert.strictEqual(macro?.family, 'page')
    // The id range stops before the `#fragment`.
    assert.strictEqual(macro?.idStart, 5)
    assert.strictEqual(macro?.idEnd, 14)
  })

  test('Should ignore a plain relative include path', () => {
    const line = 'include::intro.adoc[]'
    assert.strictEqual(matchAntoraResourceMacroAt(line, 12), undefined)
  })

  test('Should detect a partial include resource id', () => {
    const line = 'include::partial$intro.adoc[]'
    const macro = matchAntoraResourceMacroAt(line, 15)
    assert.strictEqual(macro?.id, 'partial$intro.adoc')
    assert.strictEqual(macro?.family, 'page')
  })

  test('Should return undefined when the cursor is outside the target', () => {
    const line = 'image::output.png[]'
    // cursor on the `image` keyword, before the target
    assert.strictEqual(matchAntoraResourceMacroAt(line, 2), undefined)
  })

  test('Should pick the macro under the cursor when several appear on the line', () => {
    const line = 'image:first.png[] and image:second.png[]'
    const macro = matchAntoraResourceMacroAt(line, 30)
    assert.strictEqual(macro?.id, 'second.png')
  })
})
