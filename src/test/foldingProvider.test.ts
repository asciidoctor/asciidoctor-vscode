import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { FoldingRangeKind } from 'vscode'
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

  // The line-scanning logic is covered exhaustively by the VS Code-independent
  // unit tests (`src/test/unit/foldingRanges.test.ts`). These cases only check
  // that the provider wires it onto `vscode.FoldingRange`, including the
  // FoldingRangeKind mapping.
  describe('getDelimitedBlockFoldingRanges', () => {
    test('Should fold a listing block as a region', async () => {
      const folds = await getFoldsForDocument(`before

----
line 1
line 2
----

after`)
      const fold = findFold(folds, 2)
      assert.ok(fold, 'expected a fold starting at the opening delimiter')
      assert.strictEqual(fold.end, 5)
      assert.strictEqual(fold.kind, FoldingRangeKind.Region)
    })

    test('Should fold a comment block with the comment kind', async () => {
      const folds = await getFoldsForDocument(`////
comment
////`)
      const fold = findFold(folds, 0)
      assert.ok(fold)
      assert.strictEqual(fold.end, 2)
      assert.strictEqual(fold.kind, FoldingRangeKind.Comment)
    })
  })
})

function findFold(
  folds: readonly vscode.FoldingRange[],
  start: number,
): vscode.FoldingRange | undefined {
  return folds.find((fold) => fold.start === start)
}

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
