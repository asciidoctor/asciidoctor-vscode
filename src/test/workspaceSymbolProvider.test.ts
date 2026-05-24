import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import AdocDocumentSymbolProvider from '../features/documentSymbolProvider.js'
import AsciidocWorkspaceSymbolProvider, {
  WorkspaceAsciidocDocumentProvider,
} from '../features/workspaceSymbolProvider.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security.js'
import { extensionContext } from './helper.js'

describe('asciidoc.WorkspaceSymbolProvider', () => {
  let symbolProvider: AdocDocumentSymbolProvider

  before(() => {
    symbolProvider = new AdocDocumentSymbolProvider(
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
  })

  test('Should not return anything for empty workspace', async () => {
    const provider = new AsciidocWorkspaceSymbolProvider(
      symbolProvider,
      new InMemoryWorkspaceAsciidocDocumentProvider([]),
    )
    assert.deepEqual(await provider.provideWorkspaceSymbols(''), [])
  })
})

class InMemoryWorkspaceAsciidocDocumentProvider
  implements WorkspaceAsciidocDocumentProvider
{
  private readonly _documents = new Map<string, vscode.TextDocument>()
  private readonly _onDidChangeAsciidocDocumentEmitter =
    new vscode.EventEmitter<vscode.TextDocument>()
  public onDidChangeAsciidocDocument =
    this._onDidChangeAsciidocDocumentEmitter.event
  private readonly _onDidCreateAsciidocDocumentEmitter =
    new vscode.EventEmitter<vscode.TextDocument>()
  public onDidCreateAsciidocDocument =
    this._onDidCreateAsciidocDocumentEmitter.event
  private readonly _onDidDeleteAsciidocDocumentEmitter =
    new vscode.EventEmitter<vscode.Uri>()
  public onDidDeleteAsciidocDocument =
    this._onDidDeleteAsciidocDocumentEmitter.event

  constructor(documents: vscode.TextDocument[]) {
    for (const doc of documents) {
      this._documents.set(doc.fileName, doc)
    }
  }

  async getAllAsciidocDocuments() {
    return Array.from(this._documents.values())
  }

  public updateDocument(document: vscode.TextDocument) {
    this._documents.set(document.fileName, document)
    this._onDidChangeAsciidocDocumentEmitter.fire(document)
  }

  public createDocument(document: vscode.TextDocument) {
    assert.ok(!this._documents.has(document.uri.fsPath))
    this._documents.set(document.uri.fsPath, document)
    this._onDidCreateAsciidocDocumentEmitter.fire(document)
  }

  public deleteDocument(resource: vscode.Uri) {
    this._documents.delete(resource.fsPath)
    this._onDidDeleteAsciidocDocumentEmitter.fire(resource)
  }
}
