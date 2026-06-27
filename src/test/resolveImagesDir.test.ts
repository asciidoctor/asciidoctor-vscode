import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { resolveImagesDir } from '../features/imageInsertion.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'

const testFileName = vscode.Uri.file('test.adoc')

function createLoader(): AsciidocLoader {
  return new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
    new AsciidoctorDiagnostic('test'),
    extensionContext,
  )
}

/**
 * Resolve `:imagesdir:` as if the cursor sat at the `|` marker in `contents`
 * (the marker is removed before parsing).
 */
async function imagesDirAtCursor(contents: string): Promise<string> {
  const cursorOffset = contents.indexOf('|')
  assert.notStrictEqual(cursorOffset, -1, 'the fixture must contain a | marker')
  const doc = new InMemoryDocument(testFileName, contents.replace('|', ''))
  return resolveImagesDir(createLoader(), doc, cursorOffset)
}

describe('asciidoc imageInsertion resolveImagesDir', () => {
  test('Should read the imagesdir defined in the document header', async () => {
    const imagesDir = await imagesDirAtCursor(`= Document Title
:imagesdir: assets/images

|`)
    assert.strictEqual(imagesDir, 'assets/images')
  })

  test('Should ignore an imagesdir that only appears inside a delimited block (#879)', async () => {
    const imagesDir = await imagesDirAtCursor(`= Document Title

----
:imagesdir: new/path/to/images
----

|`)
    assert.strictEqual(imagesDir, '')
  })

  test('Should resolve the nearest imagesdir declared above the cursor', async () => {
    const imagesDir = await imagesDirAtCursor(`= Document Title
:imagesdir: foo

before

:imagesdir: bar

|

:imagesdir: baz`)
    assert.strictEqual(imagesDir, 'bar')
  })
})
