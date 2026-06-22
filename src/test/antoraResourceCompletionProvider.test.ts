import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { Position } from 'vscode'
import {
  AntoraResourceCompletionProvider,
  buildResourceIds,
  findAntoraResourceMacroPrefix,
} from '../features/antora/antoraResourceCompletionProvider.js'
import { extensionContext } from './helper.js'
import {
  createDirectories,
  createDirectory,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

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
})

describe('AntoraResourceCompletionProvider', () => {
  async function createComponent(createdFiles: vscode.Uri[]) {
    createdFiles.push(await createDirectory('modules'))
    await createDirectories('modules', 'ROOT', 'pages')
    const page = await createFile(
      'image::\nxref:',
      'modules',
      'ROOT',
      'pages',
      'index.adoc',
    )
    createdFiles.push(page)
    createdFiles.push(
      await createFile('= Other', 'modules', 'ROOT', 'pages', 'other.adoc'),
    )
    createdFiles.push(
      await createFile('', 'modules', 'ROOT', 'images', 'logo.png'),
    )
    createdFiles.push(
      await createFile('', 'modules', 'ui', 'images', 'button.png'),
    )
    createdFiles.push(
      await createFile(`name: docs\nversion: '1.0'\n`, 'antora.yml'),
    )
    return page
  }

  test('Should suggest images of the same and other modules after "image::"', async () => {
    const createdFiles = []
    try {
      const page = await createComponent(createdFiles)
      await enableAntoraSupport()
      const provider = new AntoraResourceCompletionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const items = await provider.provideCompletionItems(
        document,
        new Position(0, 7), // after "image::"
      )
      const labels = items.map((item) => item.label)
      assert.strictEqual(
        labels.includes('logo.png'),
        true,
        'Must suggest the image of the same module with its relative path',
      )
      assert.strictEqual(
        labels.includes('ui:button.png'),
        true,
        'Must suggest the image of another module qualified with its module',
      )
      const logoItem = items.find((item) => item.label === 'logo.png')
      assert.strictEqual(
        logoItem.insertText instanceof vscode.SnippetString,
        true,
        'The macro must be completed with a snippet',
      )
      assert.strictEqual(
        (logoItem.insertText as vscode.SnippetString).value,
        'logo.png[$0]',
        'The macro brackets must be appended automatically',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should not append brackets when the macro already has them', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const page = await createFile(
        'image::[]',
        'modules',
        'ROOT',
        'pages',
        'bracket.adoc',
      )
      createdFiles.push(page)
      createdFiles.push(
        await createFile('', 'modules', 'ROOT', 'images', 'logo.png'),
      )
      createdFiles.push(
        await createFile(`name: docs\nversion: '1.0'\n`, 'antora.yml'),
      )
      await enableAntoraSupport()
      const provider = new AntoraResourceCompletionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const items = await provider.provideCompletionItems(
        document,
        new Position(0, 7), // between "image::" and "[]"
      )
      const logoItem = items.find((item) => item.label === 'logo.png')
      assert.strictEqual(logoItem.insertText, 'logo.png')
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should suggest pages after "xref:"', async () => {
    const createdFiles = []
    try {
      const page = await createComponent(createdFiles)
      await enableAntoraSupport()
      const provider = new AntoraResourceCompletionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const items = await provider.provideCompletionItems(
        document,
        new Position(1, 5), // after "xref:"
      )
      const labels = items.map((item) => item.label)
      assert.strictEqual(
        labels.includes('other.adoc'),
        true,
        'Must suggest the other page of the same module',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should not suggest anything when Antora support is disabled', async () => {
    const createdFiles = []
    try {
      const page = await createComponent(createdFiles)
      await resetAntoraSupport()
      const provider = new AntoraResourceCompletionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const items = await provider.provideCompletionItems(
        document,
        new Position(0, 7),
      )
      assert.strictEqual(items.length, 0)
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})
