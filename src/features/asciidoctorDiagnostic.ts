import { Asciidoctor } from '@asciidoctor/core'
import { SkinnyTextDocument } from '../util/document'
import vscode, { DiagnosticCollection } from 'vscode'

export interface AsciidoctorDiagnosticProvider {
  delete (textDocumentUri: vscode.Uri): void

  clearAll (): void

  reportErrors (memoryLogger: Asciidoctor.MemoryLogger, textDocument: SkinnyTextDocument): void
}

export class AsciidoctorDiagnostic implements AsciidoctorDiagnosticProvider {
  private readonly errorCollection: DiagnosticCollection

  constructor (name: string) {
    this.errorCollection = vscode.languages.createDiagnosticCollection(name)
  }

  public delete (textDocumentUri: vscode.Uri) {
    this.errorCollection.delete(textDocumentUri)
  }

  public clearAll () {
    this.errorCollection.clear()
  }

  public reportErrors (memoryLogger: Asciidoctor.MemoryLogger, textDocument: SkinnyTextDocument) {
    const asciidocDebugConfig = vscode.workspace.getConfiguration('asciidoc.debug', null)
    if (asciidocDebugConfig.get('enableErrorDiagnostics')) {
      const diagnostics = []
      memoryLogger.getMessages().forEach((error) => {
        let errorMessage = error.getText()
        let sourceLine = 0
        let relatedFile = null
        const diagnosticSource = 'asciidoctor.js'
        // allocate to line 0 in the absence of information
        let sourceRange = textDocument.lineAt(0).range
        const location = error.getSourceLocation()
        if (location) { //There is a source location
          if (location.getPath() === '<stdin>') { //error is within the file we are parsing
            sourceLine = location.getLineNumber() - 1
            // ensure errors are always associated with a valid line
            sourceLine = sourceLine >= textDocument.lineCount ? textDocument.lineCount - 1 : sourceLine
            sourceRange = textDocument.lineAt(sourceLine).range
          } else { //error is coming from an included file
            relatedFile = error.getSourceLocation()
            // try to find the 'include' directive responsible from the info provided by Asciidoctor.js
            sourceLine = textDocument.getText().split('\n').indexOf(textDocument.getText().split('\n').find((str) => str.startsWith('include') && str.includes(relatedFile.path)))
            if (sourceLine !== -1) {
              sourceRange = textDocument.lineAt(sourceLine).range
            }
          }
        } else {
          // generic error (e.g. :source-highlighter: coderay)
          errorMessage = error.message
        }
        let severity = vscode.DiagnosticSeverity.Information
        if (error.getSeverity() === 'WARN') {
          severity = vscode.DiagnosticSeverity.Warning
        } else if (error.getSeverity() === 'ERROR') {
          severity = vscode.DiagnosticSeverity.Error
        } else if (error.getSeverity() === 'DEBUG') {
          severity = vscode.DiagnosticSeverity.Information
        }
        let diagnosticRelated = null
        if (relatedFile) {
          diagnosticRelated = [
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(vscode.Uri.file(relatedFile.file),
                new vscode.Position(0, 0)
              ),
              errorMessage
            ),
          ]
          errorMessage = 'There was an error in an included file'
        }
        const diagnosticError = new vscode.Diagnostic(sourceRange, errorMessage, severity)
        diagnosticError.source = diagnosticSource
        if (diagnosticRelated) {
          diagnosticError.relatedInformation = diagnosticRelated
        }
        diagnostics.push(diagnosticError)
      })
      this.errorCollection.set(textDocument.uri, diagnostics)
    }
  }
}
