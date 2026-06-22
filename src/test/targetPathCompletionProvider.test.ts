import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { Registry } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { Position } from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfigProvider } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensionsProvider } from '../features/asciidoctor/asciidoctorExtensions.js'
import { TargetPathCompletionProvider } from '../features/completion/targetPathCompletionProvider.js'
import { extensionContext } from './helper.js'
import {
  createDirectories,
  createDirectory,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

let asciidocLoader: AsciidocLoader

describe('Target path completion provider', () => {
  beforeEach(() => {
    asciidocLoader = new AsciidocLoader(
      new (class implements AsciidoctorConfigProvider {
        activate(_: Registry, __: vscode.Uri): Promise<void> {
          return Promise.resolve()
        }
      })(),
      new (class implements AsciidoctorExtensionsProvider {
        activate(_: Registry): Promise<void> {
          return Promise.resolve()
        }
      })(),
      new AsciidoctorDiagnostic('test'),
      extensionContext,
    )
  })

  test('Should return completion items relative to imagesdir', async () => {
    const testDirectory = await createDirectory('target-path-completion')
    try {
      const provider = new TargetPathCompletionProvider(asciidocLoader)
      await createDirectories('target-path-completion', 'src', 'asciidoc')
      await createDirectories('target-path-completion', 'src', 'images')
      const asciidocFile = await createFile(
        `= Lanzarote
:imagesdir: ../images/

image::`,
        'target-path-completion',
        'src',
        'asciidoc',
        'index.adoc',
      )
      await createFile(
        '',
        'target-path-completion',
        'src',
        'images',
        'wilderness-map.jpg',
      )
      await createFile(
        '',
        'target-path-completion',
        'src',
        'images',
        'skyline.jpg',
      )
      const file = await vscode.workspace.openTextDocument(asciidocFile)
      const completionsItems = await provider.provideCompletionItems(
        file,
        new Position(3, 7),
      )
      assert.ok(
        completionsItems?.some(
          (item) =>
            item.label === 'wilderness-map.jpg' &&
            item.kind === 16 &&
            item.sortText === '10_wilderness-map.jpg' &&
            item.insertText === 'wilderness-map.jpg[]',
        ),
        'Expected completionsItems to include wilderness-map.jpg',
      )
      assert.ok(
        completionsItems?.some(
          (item) =>
            item.label === 'skyline.jpg' &&
            item.kind === 16 &&
            item.sortText === '10_skyline.jpg' &&
            item.insertText === 'skyline.jpg[]',
        ),
        'Expected completionsItems to include skyline.jpg',
      )
    } finally {
      await removeFiles([testDirectory])
    }
  })

  test('Should not propose bogus attribute variables from resource ids on an Antora page', async () => {
    const createdFiles = []
    try {
      const provider = new TargetPathCompletionProvider(asciidocLoader)
      createdFiles.push(await createDirectory('modules'))
      await createDirectories('modules', 'ROOT', 'pages')
      const asciidocFile = await createFile(
        // The resource id on the first line would, without the Antora guard,
        // be mistaken for an attribute and proposed as `{2.0@clicommands}`.
        'image::2.0@cli:commands:logo.png[]\nimage::',
        'modules',
        'ROOT',
        'pages',
        'index.adoc',
      )
      createdFiles.push(asciidocFile)
      createdFiles.push(
        await createFile('', 'modules', 'ROOT', 'images', 'logo.png'),
      )
      createdFiles.push(
        await createFile(`name: docs\nversion: '1.0'\n`, 'antora.yml'),
      )
      await enableAntoraSupport()
      const file = await vscode.workspace.openTextDocument(asciidocFile)
      const completionsItems = await provider.provideCompletionItems(
        file,
        new Position(1, 7),
      )
      const bogusItems = completionsItems.filter((item) =>
        (item.label as string).startsWith('{'),
      )
      assert.deepStrictEqual(
        bogusItems,
        [],
        'No attribute-variable items must be proposed on an Antora page',
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})
