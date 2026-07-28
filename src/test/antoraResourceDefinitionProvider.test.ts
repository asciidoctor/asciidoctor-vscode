import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { CancellationTokenSource, Position } from 'vscode'
// Note: the pure `findAntoraResourceMacroAt` matching logic is unit-tested in
// `test/unit/antoraResourceMacro.test.ts`; this suite only covers the provider's
// integration with the extension host.
import { AntoraResourceDefinitionProvider } from '../features/antora/antoraResourceDefinitionProvider.js'
import { extensionContext } from './helper.js'
import {
  createDirectories,
  createDirectory,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
  setSiteManifestPath,
} from './workspaceHelper.js'

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

  test('Should open the published page when a page resource id only resolves against the remote site manifest', async () => {
    const createdFiles: vscode.Uri[] = []
    const openExternal = sinon.stub(vscode.env, 'openExternal')
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const page = await createFile(
        'xref:other::index.adoc[]',
        'modules',
        'ROOT',
        'pages',
        'remote-source.adoc',
      )
      createdFiles.push(page)
      createdFiles.push(
        await createFile(`name: docs\nversion: '1.0'\n`, 'antora.yml'),
      )
      createdFiles.push(
        await createFile(
          JSON.stringify({
            url: 'https://docs.example.org',
            components: {
              other: {
                title: 'Other',
                latest: '1.0',
                versions: {
                  '1.0': {
                    url: '/other/1.0/index.html',
                    pages: [
                      {
                        path: 'index.adoc',
                        url: '/other/1.0/index.html',
                        title: 'Other Home',
                      },
                    ],
                  },
                },
              },
            },
          }),
          'site-manifest.json',
        ),
      )
      await setSiteManifestPath('site-manifest.json')
      await enableAntoraSupport()
      const provider = new AntoraResourceDefinitionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const definition = await provider.provideDefinition(
        document,
        new Position(0, 10), // inside the "other::index.adoc" resource id
        new CancellationTokenSource().token,
      )
      assert.strictEqual(
        definition,
        undefined,
        'There is no local file to navigate to for a remote-only resource id',
      )
      assert.strictEqual(openExternal.calledOnce, true)
      assert.strictEqual(
        openExternal.firstCall.args[0].toString(),
        'https://docs.example.org/other/1.0/index.html',
      )
    } finally {
      openExternal.restore()
      await removeFiles(createdFiles)
      await resetAntoraSupport()
      await setSiteManifestPath('')
    }
  })
})
