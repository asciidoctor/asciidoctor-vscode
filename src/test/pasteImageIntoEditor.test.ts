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
import { PasteImageIntoEditorProvider } from '../features/pasteImageIntoEditor.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'

function createProvider(): PasteImageIntoEditorProvider {
  return new PasteImageIntoEditorProvider(
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

async function providePaste(
  document: vscode.TextDocument,
  dataTransfer: vscode.DataTransfer,
) {
  const end = document.positionAt(document.getText().length)
  return createProvider().provideDocumentPasteEdits(
    document,
    [new vscode.Range(end, end)],
    dataTransfer,
    {
      only: undefined,
      triggerKind: vscode.DocumentPasteTriggerKind.Automatic,
    },
    new vscode.CancellationTokenSource().token,
  )
}

/** Minimal DataTransfer carrying a single pasted bitmap, since the public API
 * cannot build a file-backed DataTransferItem. */
function bitmapDataTransfer(
  mime: string,
  name: string,
  data: Uint8Array,
): vscode.DataTransfer {
  const file: vscode.DataTransferFile = {
    name,
    uri: undefined,
    data: async () => data,
  }
  const item = { asFile: () => file } as unknown as vscode.DataTransferItem
  return {
    get: () => undefined,
    *[Symbol.iterator]() {
      yield [mime, item] as [string, vscode.DataTransferItem]
    },
  } as unknown as vscode.DataTransfer
}

describe('asciidoc.PasteImageIntoEditorProvider', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoc-paste-'))
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

  function uriListTransfer(uri: vscode.Uri): vscode.DataTransfer {
    const dataTransfer = new vscode.DataTransfer()
    dataTransfer.set(
      'text/uri-list',
      new vscode.DataTransferItem(uri.toString()),
    )
    return dataTransfer
  }

  test('Should insert a single link when pasting an image file already under imagesdir', async () => {
    const edits = await providePaste(
      document(':imagesdir: images\n\n'),
      uriListTransfer(
        vscode.Uri.file(path.join(workspaceDir, 'docs', 'images', 'a.png')),
      ),
    )
    assert.strictEqual(edits?.length, 1)
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::a.png[]',
    )
  })

  test('Should offer copy then link when pasting an external image file', async () => {
    const source = path.join(workspaceDir, 'external', 'pic.png')
    fs.mkdirSync(path.dirname(source), { recursive: true })
    fs.writeFileSync(source, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const edits = await providePaste(
      document(':imagesdir: images\n\n'),
      uriListTransfer(vscode.Uri.file(source)),
    )
    assert.strictEqual(edits?.length, 2)
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::pic.png[]',
    )
    assert.ok(edits[0].additionalEdit)
    assert.strictEqual(
      (edits[1].insertText as vscode.SnippetString).value,
      'image::../external/pic.png[]',
    )
  })

  test('Should copy a pasted bitmap into imagesdir', async () => {
    const edits = await providePaste(
      document(':imagesdir: images\n\n'),
      bitmapDataTransfer(
        'image/png',
        'screenshot.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      ),
    )
    assert.strictEqual(edits?.length, 1)
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::screenshot.png[]',
    )
    assert.ok(edits[0].additionalEdit, 'a bitmap paste must carry a file copy')
  })

  test('Should copy a pasted bitmap into the document directory when no imagesdir is set', async () => {
    const edits = await providePaste(
      document(''),
      bitmapDataTransfer('image/png', 'x.png', Buffer.from([0x89])),
    )
    assert.strictEqual(edits?.length, 1)
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::x.png[]',
    )
    assert.ok(edits[0].additionalEdit)
  })
})
