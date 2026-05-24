import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import AsciidocFoldingProvider from '../features/foldingProvider.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'

const testFileName = vscode.Uri.file('test.adoc')

describe('asciidoc.FoldingProvider', () => {
  describe('getHeaderFoldingRanges', () => {
    test('Should not return anything for empty document', async () => {
      const folds = await getFoldsForDocument('')
      assert.strictEqual(folds.length, 0)
    })

    test('Should not return anything for document without headers', async () => {
      const folds = await getFoldsForDocument(`a
*b* afas
a=b
a`)
      assert.strictEqual(folds.length, 0)
    })

    test('Should fold from header to end of document', async () => {
      const folds = await getFoldsForDocument(`= a

== b

c
d`)
      assert.strictEqual(folds.length, 2)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 0)
      assert.strictEqual(firstFold.end, 5)
    })

    test('Should leave single newline before next header', async () => {
      const folds = await getFoldsForDocument(`
== a
x

== b
y`)
      assert.strictEqual(folds.length, 2)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 1)
      assert.strictEqual(firstFold.end, 3)
    })

    test('Should collapse multiple newlines to single newline before next header', async () => {
      const folds = await getFoldsForDocument(`
== a
x



== b
y`)
      assert.strictEqual(folds.length, 2)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 1)
      assert.strictEqual(firstFold.end, 5)
    })
  })
})

async function getFoldsForDocument(fileContents: string) {
  const doc = new InMemoryDocument(testFileName, fileContents)
  const provider = new AsciidocFoldingProvider(
    new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(
        AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
      ),
      new AsciidoctorDiagnostic('test'),
      extensionContext,
    ),
  )
  return provider.provideFoldingRanges(doc, undefined)
}
