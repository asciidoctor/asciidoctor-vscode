import { Asciidoctor } from '@asciidoctor/core'
import chai from 'chai'
import vscode, { Position } from 'vscode'
import { AsciidocLoader } from '../asciidocLoader'
import { AsciidoctorConfigProvider } from '../features/asciidoctorConfig'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'
import { AsciidoctorExtensionsProvider } from '../features/asciidoctorExtensions'
import { TargetPathCompletionProvider } from '../providers/asciidoc.provider'
import { extensionContext } from './helper'
import {
  createDirectories,
  createDirectory,
  createFile,
  removeFiles,
} from './workspaceHelper'

const expect = chai.expect

let asciidocLoader
suite('Target path completion provider', () => {
  setup(() => {
    asciidocLoader = new AsciidocLoader(
      new (class implements AsciidoctorConfigProvider {
        activate(
          _: Asciidoctor.Extensions.Registry,
          __: vscode.Uri,
        ): Promise<void> {
          return Promise.resolve()
        }
      })(),
      new (class implements AsciidoctorExtensionsProvider {
        activate(_: Asciidoctor.Extensions.Registry): Promise<void> {
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
      expect(completionsItems).to.deep.include({
        label: 'wilderness-map.jpg',
        kind: 16,
        sortText: '10_wilderness-map.jpg',
        insertText: 'wilderness-map.jpg[]',
      })
      expect(completionsItems).to.deep.include({
        label: 'skyline.jpg',
        kind: 16,
        sortText: '10_skyline.jpg',
        insertText: 'skyline.jpg[]',
      })
    } finally {
      await removeFiles([testDirectory])
    }
  })
})
