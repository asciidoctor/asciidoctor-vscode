import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildResourceIds,
  findAntoraResourceMacroPrefix,
} from '../../features/antora/antoraResourceId.js'

const current = { component: 'docs', version: '1.0', module: 'ROOT' }

describe('buildResourceIds', () => {
  test('Should offer the relative, module, component and version forms within the same module', () => {
    const ids = buildResourceIds(
      {
        component: 'cli',
        version: '2.0',
        module: 'commands',
        family: 'image',
        relative: 'seaswell.png',
      },
      { component: 'cli', version: '2.0', module: 'commands' },
      'image',
    )
    assert.deepStrictEqual(ids, [
      'seaswell.png',
      'commands:seaswell.png',
      'cli:commands:seaswell.png',
      '2.0@cli:commands:seaswell.png',
    ])
  })

  test('Should offer module-qualified forms for another module of the same component', () => {
    const ids = buildResourceIds(
      { ...current, module: 'ui', family: 'image', relative: 'button.png' },
      current,
      'image',
    )
    assert.deepStrictEqual(ids, [
      'ui:button.png',
      'docs:ui:button.png',
      '1.0@docs:ui:button.png',
    ])
  })

  test('Should use an empty module segment for the ROOT module', () => {
    const ids = buildResourceIds(
      { ...current, family: 'image', relative: 'logo.png' },
      { component: 'docs', version: '1.0', module: 'ui' },
      'image',
    )
    assert.deepStrictEqual(ids, [
      ':logo.png',
      'docs::logo.png',
      '1.0@docs::logo.png',
    ])
  })

  test('Should only offer component/version forms for another component', () => {
    const ids = buildResourceIds(
      {
        component: 'api',
        version: '1.0',
        module: 'auth',
        family: 'page',
        relative: 'page3.adoc',
      },
      current,
      'page',
    )
    assert.deepStrictEqual(ids, [
      'api:auth:page3.adoc',
      '1.0@api:auth:page3.adoc',
    ])
  })

  test('Should prefix the family when it is not the default of the macro', () => {
    const ids = buildResourceIds(
      { ...current, family: 'partial', relative: 'intro.adoc' },
      current,
      'page',
    )
    assert.deepStrictEqual(ids, [
      'partial$intro.adoc',
      'docs::partial$intro.adoc',
      '1.0@docs::partial$intro.adoc',
    ])
  })

  test('Should omit the version forms when the target has no version', () => {
    const ids = buildResourceIds(
      {
        component: 'docs',
        version: '',
        module: 'ROOT',
        family: 'page',
        relative: 'index.adoc',
      },
      { component: 'docs', version: '', module: 'ROOT' },
      'page',
    )
    assert.deepStrictEqual(ids, ['index.adoc', 'docs::index.adoc'])
  })
})

describe('findAntoraResourceMacroPrefix', () => {
  test('Should detect a block image macro', () => {
    const context = findAntoraResourceMacroPrefix('image::')
    assert.strictEqual(context?.macro, 'image')
    assert.strictEqual(context?.targetStart, 7)
  })

  test('Should detect an inline image macro', () => {
    const context = findAntoraResourceMacroPrefix('image:')
    assert.strictEqual(context?.macro, 'image')
    assert.strictEqual(context?.targetStart, 6)
  })

  test('Should detect a macro preceded by text and a partial target', () => {
    const context = findAntoraResourceMacroPrefix('see image::ui:but')
    assert.strictEqual(context?.macro, 'image')
    assert.strictEqual(context?.targetStart, 11)
  })

  test('Should only suggest pages for xref', () => {
    const context = findAntoraResourceMacroPrefix('xref:')
    assert.strictEqual(context?.macro, 'xref')
    assert.deepStrictEqual(context?.families, ['page'])
    assert.strictEqual(context?.defaultFamily, 'page')
  })

  test('Should suggest partials, examples and pages for include', () => {
    const context = findAntoraResourceMacroPrefix('include::')
    assert.deepStrictEqual(context?.families, ['partial', 'example', 'page'])
  })

  test('Should return undefined outside of a resource macro', () => {
    assert.strictEqual(
      findAntoraResourceMacroPrefix('just some text'),
      undefined,
    )
  })

  test('Should return undefined when the macro is not anchored at the cursor', () => {
    // The id is already terminated by `[`, so the cursor is no longer typing it.
    assert.strictEqual(
      findAntoraResourceMacroPrefix('image::logo.png['),
      undefined,
    )
  })
})
