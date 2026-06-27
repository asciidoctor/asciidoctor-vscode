import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { DropImageIntoEditorProvider } from '../features/dropIntoEditor.js'
import {
  computeImageMacroTarget,
  isWithinDirectory,
} from '../features/imageInsertion.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'

function createProvider(): DropImageIntoEditorProvider {
  return new DropImageIntoEditorProvider(
    new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(
        AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
      ),
      new AsciidoctorDiagnostic('test'),
      extensionContext,
    ),
    extensionContext.workspaceState,
  )
}

async function provideDrop(
  document: vscode.TextDocument,
  imageUri: vscode.Uri,
) {
  const dataTransfer = new vscode.DataTransfer()
  dataTransfer.set(
    'text/uri-list',
    new vscode.DataTransferItem(imageUri.toString()),
  )
  return createProvider().provideDocumentDropEdits(
    document,
    document.positionAt(document.getText().length),
    dataTransfer,
    new vscode.CancellationTokenSource().token,
  )
}

describe('asciidoc.DropImageIntoEditorProvider helpers', () => {
  const docUri = vscode.Uri.file('/project/docs/guide.adoc')

  test('computeImageMacroTarget makes a same-filesystem path relative to the document', () => {
    const target = computeImageMacroTarget(
      docUri,
      vscode.Uri.file('/project/docs/diagram.png'),
      '',
    )
    assert.strictEqual(target, 'diagram.png')
  })

  test('computeImageMacroTarget strips the imagesdir prefix', () => {
    const target = computeImageMacroTarget(
      docUri,
      vscode.Uri.file('/project/docs/images/diagram.png'),
      'images',
    )
    assert.strictEqual(target, 'diagram.png')
  })

  test('computeImageMacroTarget keeps a foreign URI untouched', () => {
    const target = computeImageMacroTarget(
      docUri,
      vscode.Uri.parse('https://example.com/a%20b.png'),
      'images',
    )
    assert.strictEqual(target, 'https://example.com/a%20b.png')
  })

  test('isWithinDirectory recognises nested and sibling paths', () => {
    const dir = vscode.Uri.file('/project/docs/images')
    assert.ok(
      isWithinDirectory(vscode.Uri.file('/project/docs/images/a.png'), dir),
    )
    assert.ok(!isWithinDirectory(vscode.Uri.file('/project/docs/a.png'), dir))
  })
})

describe('asciidoc.DropImageIntoEditorProvider', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoc-drop-'))
  })
  afterEach(() => {
    fs.rmSync(workspaceDir, { recursive: true, force: true })
  })

  function document(contents: string): InMemoryDocument {
    return new InMemoryDocument(
      vscode.Uri.file(path.join(workspaceDir, 'docs', 'guide.adoc')),
      contents,
    )
  }

  test('Should offer a single link edit when the image is already under imagesdir', async () => {
    const imageUri = vscode.Uri.file(
      path.join(workspaceDir, 'docs', 'images', 'diagram.png'),
    )
    const edits = await provideDrop(
      document(':imagesdir: images\n\n'),
      imageUri,
    )
    assert.strictEqual(edits?.length, 1)
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::diagram.png[]',
    )
  })

  test('Should offer copy (default) then link when the image sits outside imagesdir', async () => {
    const source = path.join(workspaceDir, 'external', 'pic.png')
    fs.mkdirSync(path.dirname(source), { recursive: true })
    fs.writeFileSync(source, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const edits = await provideDrop(
      document(':imagesdir: images\n\n'),
      vscode.Uri.file(source),
    )
    assert.strictEqual(edits?.length, 2)

    // The first edit is the default: copy into imagesdir, targeting the bare name.
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::pic.png[]',
    )
    assert.ok(
      edits[0].additionalEdit,
      'copy edit should carry a workspace edit',
    )

    // The second edit links the image where it currently is.
    assert.strictEqual(
      (edits[1].insertText as vscode.SnippetString).value,
      'image::../external/pic.png[]',
    )
    assert.strictEqual(edits[1].additionalEdit, undefined)
  })

  test('Should not offer a copy edit for an unreadable external image', async () => {
    const edits = await provideDrop(
      document(':imagesdir: images\n\n'),
      vscode.Uri.file(path.join(workspaceDir, 'does-not-exist', 'ghost.png')),
    )
    assert.strictEqual(edits?.length, 1)
    assert.strictEqual(edits[0].additionalEdit, undefined)
  })
})
