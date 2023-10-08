import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import AdocDocumentSymbolProvider from '../features/documentSymbolProvider'
import AsciidocWorkspaceSymbolProvider, { WorkspaceAsciidocDocumentProvider } from '../features/workspaceSymbolProvider'
import { AsciidocLoader } from '../asciidocLoader'
import { AsciidoctorConfig } from '../features/asciidoctorConfig'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'
import { extensionContext } from './helper'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'

const symbolProvider = new AdocDocumentSymbolProvider(null, new AsciidocLoader(
  new AsciidoctorConfig(),
  new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
  new AsciidoctorDiagnostic('text'),
  extensionContext
))

suite('asciidoc.WorkspaceSymbolProvider', () => {
  test('Should not return anything for empty workspace', async () => {
    const provider = new AsciidocWorkspaceSymbolProvider(symbolProvider, new InMemoryWorkspaceAsciidocDocumentProvider([]))

    assert.deepEqual(await provider.provideWorkspaceSymbols(''), [])
  })
})

class InMemoryWorkspaceAsciidocDocumentProvider implements WorkspaceAsciidocDocumentProvider {
  private readonly _documents = new Map<string, vscode.TextDocument>()
  private readonly _onDidChangeAsciidocDocumentEmitter = new vscode.EventEmitter<vscode.TextDocument>()
  public onDidChangeAsciidocDocument = this._onDidChangeAsciidocDocumentEmitter.event
  private readonly _onDidCreateAsciidocDocumentEmitter = new vscode.EventEmitter<vscode.TextDocument>()
  public onDidCreateAsciidocDocument = this._onDidCreateAsciidocDocumentEmitter.event
  private readonly _onDidDeleteAsciidocDocumentEmitter = new vscode.EventEmitter<vscode.Uri>()
  public onDidDeleteAsciidocDocument = this._onDidDeleteAsciidocDocumentEmitter.event

  constructor (documents: vscode.TextDocument[]) {
    for (const doc of documents) {
      this._documents.set(doc.fileName, doc)
    }
  }

  async getAllAsciidocDocuments () {
    return Array.from(this._documents.values())
  }

  public updateDocument (document: vscode.TextDocument) {
    this._documents.set(document.fileName, document)
    this._onDidChangeAsciidocDocumentEmitter.fire(document)
  }

  public createDocument (document: vscode.TextDocument) {
    assert.ok(!this._documents.has(document.uri.fsPath))

    this._documents.set(document.uri.fsPath, document)
    this._onDidCreateAsciidocDocumentEmitter.fire(document)
  }

  public deleteDocument (resource: vscode.Uri) {
    this._documents.delete(resource.fsPath)
    this._onDidDeleteAsciidocDocumentEmitter.fire(resource)
  }
}
