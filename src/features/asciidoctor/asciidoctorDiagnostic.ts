import * as vscode from 'vscode'
import { DiagnosticCollection } from 'vscode'
import { SkinnyTextDocument } from '../../core/document.js'
import { logger } from '../../core/logger.js'
import { ConversionMessage } from './conversion.js'

// Map an Asciidoctor log severity to a VS Code diagnostic severity. Asciidoctor
// also logs DEBUG and INFO messages (e.g. "possible invalid reference"), but
// those are progress/log output rather than actionable document problems, so
// they are deliberately kept out of the Problems panel — `undefined` means
// "do not surface as a diagnostic".
function toDiagnosticSeverity(
  asciidoctorSeverity: string,
): vscode.DiagnosticSeverity | undefined {
  switch (asciidoctorSeverity) {
    case 'WARN':
      return vscode.DiagnosticSeverity.Warning
    case 'ERROR':
    case 'FATAL':
      return vscode.DiagnosticSeverity.Error
    default:
      // DEBUG, INFO and any unknown lower level: not actionable
      return undefined
  }
}

// Mirror an Asciidoctor log message to the extension's "Asciidoctor" output
// channel, preserving its severity. This happens for every message — including
// the DEBUG/INFO ones kept out of the Problems panel — so the full Asciidoctor
// log stays available for troubleshooting (visible through "Developer: Show
// Logs…", filtered by the channel's log level).
function logAsciidoctorMessage(message: ConversionMessage): void {
  const location = message.location
  const where = location
    ? `${location.file ?? '<stdin>'}:${location.lineNumber}`
    : undefined
  const text = message.text
  const line = where ? `${where}: ${text}` : text
  switch (message.severity) {
    case 'DEBUG':
      logger.debug(line)
      break
    case 'INFO':
      logger.info(line)
      break
    case 'WARN':
      logger.warn(line)
      break
    case 'ERROR':
    case 'FATAL':
      logger.error(line)
      break
    default:
      logger.info(line)
  }
}

export interface AsciidoctorDiagnosticProvider {
  delete(textDocumentUri: vscode.Uri): void

  clearAll(): void

  reportErrors(
    messages: readonly ConversionMessage[],
    textDocument: SkinnyTextDocument,
  ): void
}

export class AsciidoctorDiagnostic implements AsciidoctorDiagnosticProvider {
  private readonly errorCollection: DiagnosticCollection

  constructor(name: string) {
    this.errorCollection = vscode.languages.createDiagnosticCollection(name)
  }

  public delete(textDocumentUri: vscode.Uri) {
    this.errorCollection.delete(textDocumentUri)
  }

  public clearAll() {
    this.errorCollection.clear()
  }

  public reportErrors(
    messages: readonly ConversionMessage[],
    textDocument: SkinnyTextDocument,
  ) {
    // Always mirror Asciidoctor's log to the output channel for troubleshooting,
    // independently of whether diagnostics are surfaced in the Problems panel.
    messages.forEach(logAsciidoctorMessage)

    const asciidocDebugConfig = vscode.workspace.getConfiguration(
      'asciidoc.debug',
      null,
    )
    if (asciidocDebugConfig.get('enableErrorDiagnostics')) {
      const diagnostics: vscode.Diagnostic[] = []
      messages.forEach((error) => {
        const severity = toDiagnosticSeverity(error.severity)
        if (severity === undefined) {
          // DEBUG/INFO (and any unknown lower level): non-actionable log
          // output, never surfaced as a diagnostic
          return
        }
        let errorMessage = error.text
        let sourceLine = 0
        let relatedFile: ConversionMessage['location'] | null = null
        const diagnosticSource = 'asciidoctor.js'
        // allocate to line 0 in the absence of information
        let sourceRange = textDocument.lineAt(0).range
        const location = error.location
        if (location) {
          //There is a source location
          // The error is in the file we are parsing when its source file is
          // unset (no `docfile`, path reported as `<stdin>`) or matches the
          // document's own path. Comparing the file is robust whether or not
          // `docfile` is set, unlike testing the path against `<stdin>` which
          // only held when `docfile` was absent.
          const errorFile = location.file
          if (!errorFile || errorFile === textDocument.uri.fsPath) {
            //error is within the file we are parsing
            sourceLine = (location.lineNumber ?? 1) - 1
            // ensure errors are always associated with a valid line
            sourceLine =
              sourceLine >= textDocument.lineCount
                ? textDocument.lineCount - 1
                : sourceLine
            sourceRange = textDocument.lineAt(sourceLine).range
          } else {
            //error is coming from an included file
            relatedFile = location
            // try to find the 'include' directive responsible from the info provided by Asciidoctor.js
            const relatedFilePath = relatedFile?.path
            const lines = textDocument.getText().split('\n')
            const includeLine = lines.find(
              (str) =>
                str.startsWith('include') &&
                relatedFilePath !== undefined &&
                str.includes(relatedFilePath),
            )
            sourceLine =
              includeLine === undefined ? -1 : lines.indexOf(includeLine)
            if (sourceLine !== -1) {
              sourceRange = textDocument.lineAt(sourceLine).range
            }
          }
        }
        // A generic error without a source location (e.g. :source-highlighter:
        // coderay, or a failed Kroki fetch) keeps `errorMessage` as extracted
        // above and is anchored to line 0.
        let diagnosticRelated = null
        if (relatedFile?.file) {
          diagnosticRelated = [
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(
                vscode.Uri.file(relatedFile.file),
                new vscode.Position(0, 0),
              ),
              errorMessage,
            ),
          ]
          errorMessage = 'There was an error in an included file'
        }
        const diagnosticError = new vscode.Diagnostic(
          sourceRange,
          errorMessage,
          severity,
        )
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
