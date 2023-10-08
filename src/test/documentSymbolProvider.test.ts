import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import DocumentSymbolProvider from '../features/documentSymbolProvider'
import { InMemoryDocument } from './inMemoryDocument'
import { AsciidocLoader } from '../asciidocLoader'
import { AsciidoctorConfig } from '../features/asciidoctorConfig'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'
import { extensionContext } from './helper'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'

const testFileName = vscode.Uri.file('test.adoc')

function getSymbolsForFile (fileContents: string) {
  const doc = new InMemoryDocument(testFileName, fileContents)
  const provider = new DocumentSymbolProvider(null, new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
    new AsciidoctorDiagnostic('text'),
    extensionContext
  ))
  return provider.provideDocumentSymbols(doc)
}

suite('asciidoc.DocumentSymbolProvider', () => {
  test('Should not return anything for empty document', async () => {
    const symbols = await getSymbolsForFile('')
    assert.strictEqual(symbols.length, 0)
  })

  test('Should not return anything for document with no headers', async () => {
    const symbols = await getSymbolsForFile('a\na')
    assert.strictEqual(symbols.length, 0)
  })
})
