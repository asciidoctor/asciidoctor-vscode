import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { Position } from 'vscode'
// Note: the pure helpers `buildResourceIds` and `findAntoraResourceMacroPrefix`
// are unit-tested in `test/unit/antoraResourceId.test.ts`; this suite only
// covers the provider's integration with the extension host.
import { AntoraResourceCompletionProvider } from '../features/antora/antoraResourceCompletionProvider.js'
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
    const createdFiles: vscode.Uri[] = []
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
      assert.ok(logoItem, 'Must suggest the logo.png completion item')
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
    const createdFiles: vscode.Uri[] = []
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
      assert.ok(logoItem, 'Must suggest the logo.png completion item')
      assert.strictEqual(logoItem.insertText, 'logo.png')
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should suggest pages after "xref:"', async () => {
    const createdFiles: vscode.Uri[] = []
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

  test('Should suggest the anchors of the referenced page after "xref:<page>#"', async () => {
    const createdFiles: vscode.Uri[] = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const page = await createFile(
        'xref:target.adoc#',
        'modules',
        'ROOT',
        'pages',
        'source.adoc',
      )
      createdFiles.push(page)
      createdFiles.push(
        await createFile(
          '= Target\n\n[#oauth]\n== OAuth\n',
          'modules',
          'ROOT',
          'pages',
          'target.adoc',
        ),
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
        new Position(0, 17), // right after the "#"
      )
      const labels = items.map((item) => item.label)
      assert.strictEqual(
        labels.includes('oauth'),
        true,
        'Must suggest the anchor declared in the referenced page',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })

  test('Should not suggest anything when Antora support is disabled', async () => {
    const createdFiles: vscode.Uri[] = []
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

  function buildSiteManifest() {
    return {
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
        // Same component/version as the local workspace fixture (`docs@1.0`):
        // the local copy must win, so no completion item should ever be
        // sourced from this entry.
        docs: {
          title: 'Docs',
          latest: '1.0',
          versions: {
            '1.0': {
              url: '/docs/1.0/index.html',
              pages: [
                {
                  path: 'stale.adoc',
                  url: '/docs/1.0/stale.html',
                  title: 'Stale (must not be suggested)',
                },
              ],
            },
          },
        },
      },
    }
  }

  test('Should suggest pages of a remote component after "xref:"', async () => {
    const createdFiles: vscode.Uri[] = []
    try {
      const page = await createComponent(createdFiles)
      createdFiles.push(
        await createFile(
          JSON.stringify(buildSiteManifest()),
          'site-manifest.json',
        ),
      )
      await setSiteManifestPath('site-manifest.json')
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
        labels.includes('1.0@other::index.adoc'),
        true,
        'Must suggest the page of the remote-only component',
      )
      assert.strictEqual(
        labels.some((label) => String(label).includes('stale')),
        false,
        'Must not suggest a remote page for a component/version already present locally',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
      await setSiteManifestPath('')
    }
  })

  test('Should not suggest remote pages after "image::" or "include::"', async () => {
    const createdFiles: vscode.Uri[] = []
    try {
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const page = await createFile(
        'image::\ninclude::',
        'modules',
        'ROOT',
        'pages',
        'no-remote.adoc',
      )
      createdFiles.push(page)
      createdFiles.push(
        await createFile(`name: docs\nversion: '1.0'\n`, 'antora.yml'),
      )
      createdFiles.push(
        await createFile(
          JSON.stringify(buildSiteManifest()),
          'site-manifest.json',
        ),
      )
      await setSiteManifestPath('site-manifest.json')
      await enableAntoraSupport()
      const provider = new AntoraResourceCompletionProvider(
        extensionContext.workspaceState,
      )
      const document = await vscode.workspace.openTextDocument(page)
      const imageItems = await provider.provideCompletionItems(
        document,
        new Position(0, 7), // after "image::"
      )
      const includeItems = await provider.provideCompletionItems(
        document,
        new Position(1, 9), // after "include::"
      )
      assert.strictEqual(
        [...imageItems, ...includeItems].some((item) =>
          String(item.label).includes('other'),
        ),
        false,
        'A remote page has no contents, so it must not be offered for image:: or include::',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
      await setSiteManifestPath('')
    }
  })
})
