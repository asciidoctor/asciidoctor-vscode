import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocLoader } from '../asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions.js'
import DocumentSymbolProvider from '../features/documentSymbolProvider.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'

const testFileName = vscode.Uri.file('test.adoc')

function getSymbolsForFile(fileContents: string) {
  const doc = new InMemoryDocument(testFileName, fileContents)
  const provider = new DocumentSymbolProvider(
    null,
    new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(
        AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
      ),
      new AsciidoctorDiagnostic('text'),
      extensionContext,
    ),
  )
  return provider.provideDocumentSymbols(doc)
}

describe('asciidoc.DocumentSymbolProvider', () => {
  test('Should not return anything for empty document', async () => {
    const symbols = await getSymbolsForFile('')
    assert.strictEqual(symbols.length, 0)
  })

  test('Should not return anything for document with no headers', async () => {
    const symbols = await getSymbolsForFile('a\na')
    assert.strictEqual(symbols.length, 0)
  })
})
