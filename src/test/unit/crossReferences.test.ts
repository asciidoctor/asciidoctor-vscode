import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getReferencesFromContent } from '../../features/completion/crossReferences.js'

describe('getReferencesFromContent', () => {
  test('Should include auto-generated section ids and their title as reftext', async () => {
    const references = await getReferencesFromContent(`= Document

== Getting Started

Some text.
`)
    const gettingStarted = references.find(
      (reference) => reference.id === '_getting_started',
    )
    assert.deepStrictEqual(gettingStarted, {
      id: '_getting_started',
      reftext: 'Getting Started',
    })
  })

  test('Should honor a custom idprefix/idseparator set in the header', async () => {
    const references = await getReferencesFromContent(`= Document
:idprefix:
:idseparator: -

== Getting Started
`)
    const ids = references.map((reference) => reference.id)
    assert.ok(
      ids.includes('getting-started'),
      `expected getting-started, got: ${ids.join(', ')}`,
    )
  })

  test('Should include explicit ids declared on sections and blocks', async () => {
    const references = await getReferencesFromContent(`= Document

[#custom-section]
== A Section

[[block-anchor]]
A paragraph with a block anchor.
`)
    const ids = references.map((reference) => reference.id)
    assert.ok(ids.includes('custom-section'))
    assert.ok(ids.includes('block-anchor'))
  })

  test('Should include inline and bibliography anchors', async () => {
    const references = await getReferencesFromContent(`= Document

A paragraph with an [[inline-anchor]]inline anchor.

[bibliography]
== References

* [[[citation]]] A reference entry.
`)
    const ids = references.map((reference) => reference.id)
    assert.ok(ids.includes('inline-anchor'))
    assert.ok(ids.includes('citation'))
  })

  test('Should return an empty array when there is no anchor', async () => {
    const references = await getReferencesFromContent('Just a paragraph.\n')
    assert.deepStrictEqual(references, [])
  })
})
