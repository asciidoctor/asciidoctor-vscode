import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { CancellationTokenSource, Position } from 'vscode'
import {
  AntoraResourceDefinitionProvider,
  findAntoraResourceMacroAt,
} from '../features/antora/antoraResourceDefinitionProvider.js'
import { extensionContext } from './helper.js'
import {
  createDirectories,
  createDirectory,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

describe('findAntoraResourceMacroAt', () => {
  test('Should detect an inline image resource id under the cursor', () => {
    const line = 'image:commands:output.png[]'
    const macro = findAntoraResourceMacroAt(line, 0, 10)
    assert.strictEqual(macro?.id, 'commands:output.png')
    assert.strictEqual(macro?.family, 'image')
  })

  test('Should detect a block image resource id with version and component', () => {
    const line = 'image::2.0@cli:commands:output.png[]'
    const macro = findAntoraResourceMacroAt(line, 0, 12)
    assert.strictEqual(macro?.id, '2.0@cli:commands:output.png')
    assert.strictEqual(macro?.family, 'image')
  })

  test('Should drop the fragment of an xref resource id', () => {
    const line = 'xref:page.adoc#anchor[text]'
    const macro = findAntoraResourceMacroAt(line, 0, 8)
    assert.strictEqual(macro?.id, 'page.adoc')
    assert.strictEqual(macro?.family, 'page')
  })

  test('Should ignore a plain relative include path', () => {
    const line = 'include::intro.adoc[]'
    const macro = findAntoraResourceMacroAt(line, 0, 12)
    assert.strictEqual(macro, undefined)
  })

  test('Should detect a partial include resource id', () => {
    const line = 'include::partial$intro.adoc[]'
    const macro = findAntoraResourceMacroAt(line, 0, 15)
    assert.strictEqual(macro?.id, 'partial$intro.adoc')
    assert.strictEqual(macro?.family, 'page')
  })

  test('Should return undefined when the cursor is outside the target', () => {
    const line = 'image::output.png[]'
    // cursor on the `image` keyword, before the target
    assert.strictEqual(findAntoraResourceMacroAt(line, 0, 2), undefined)
  })
})

describe('AntoraResourceDefinitionProvider', () => {
  test('Should resolve an image resource id to its file', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const page = await createFile(
        'image::mountain.jpeg[]',
        'modules',
        'ROOT',
        'pages',
        'landscape.adoc',
      )
      createdFiles.push(page)
      const image = await createFile(
        '',
        'modules',
        'ROOT',
        'images',
        'mountain.jpeg',
      )
      createdFiles.push(image)
      createdFiles.push(
        await createFile(`name: ROOT\nversion: ~\n`, 'antora.yml'),
      )
      await enableAntoraSupport()
      const provider = new AntoraResourceDefinitionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const definition = await provider.provideDefinition(
        document,
        new Position(0, 10), // inside "mountain.jpeg"
        new CancellationTokenSource().token,
      )
      assert.strictEqual(
        definition !== undefined,
        true,
        'A definition must be found for the image resource id',
      )
      const location = definition as vscode.Location
      assert.strictEqual(location.uri.fsPath, image.fsPath)
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should not resolve when Antora support is disabled', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const page = await createFile(
        'image::mountain.jpeg[]',
        'modules',
        'ROOT',
        'pages',
        'landscape.adoc',
      )
      createdFiles.push(page)
      createdFiles.push(
        await createFile('', 'modules', 'ROOT', 'images', 'mountain.jpeg'),
      )
      createdFiles.push(
        await createFile(`name: ROOT\nversion: ~\n`, 'antora.yml'),
      )
      // Antora support intentionally left disabled.
      await resetAntoraSupport()
      const provider = new AntoraResourceDefinitionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const definition = await provider.provideDefinition(
        document,
        new Position(0, 10),
        new CancellationTokenSource().token,
      )
      assert.strictEqual(definition, undefined)
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})
