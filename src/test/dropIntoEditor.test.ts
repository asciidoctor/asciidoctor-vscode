import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
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
import {
  createDirectories,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

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

describe('asciidoc.DropImageIntoEditorProvider (Antora)', () => {
  const createdFiles: vscode.Uri[] = []
  let page: vscode.Uri
  let externalImage: vscode.Uri
  let moduleImage: vscode.Uri

  before(async () => {
    await createDirectories('modules', 'ROOT', 'pages')
    await createDirectories('modules', 'ROOT', 'images')
    createdFiles.push(
      await createFile(`name: doc\nversion: '1.0'\n`, 'antora.yml'),
    )
    page = await createFile(
      '= Page\n\n',
      'modules',
      'ROOT',
      'pages',
      'index.adoc',
    )
    createdFiles.push(page)
    externalImage = await createFile('PNG', 'external', 'pic.png')
    createdFiles.push(externalImage)
    moduleImage = await createFile(
      'PNG',
      'modules',
      'ROOT',
      'images',
      'diagram.png',
    )
    createdFiles.push(moduleImage)
    // Enable support *before* the page is opened so the one-shot activation
    // prompt sees a decision already made and stays out of the way.
    await enableAntoraSupport()
  })

  after(async () => {
    await removeFiles(createdFiles)
    createdFiles.length = 0
    await resetAntoraSupport()
  })

  test('Should offer only a copy edit (no broken link) for an external image', async () => {
    const edits = await provideDrop(
      await vscode.workspace.openTextDocument(page),
      externalImage,
    )
    // The relative-path link is suppressed under Antora; only the copy-into-
    // module edit remains, targeting the image by its bare name.
    assert.strictEqual(edits?.length, 1)
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::pic.png[]',
    )
    assert.ok(edits[0].additionalEdit, 'the copy edit must carry a file copy')
  })

  test('Should insert the bare name (no link) for an image already in the module images', async () => {
    const edits = await provideDrop(
      await vscode.workspace.openTextDocument(page),
      moduleImage,
    )
    assert.strictEqual(edits?.length, 1)
    assert.strictEqual(
      (edits[0].insertText as vscode.SnippetString).value,
      'image::diagram.png[]',
    )
  })
})
