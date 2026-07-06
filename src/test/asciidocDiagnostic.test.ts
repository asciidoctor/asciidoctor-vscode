import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'

function createLoader() {
  return new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
    new AsciidoctorDiagnostic('test-loader-diagnostics'),
    extensionContext,
  )
}

// A genuine error (not an artefact of include stubbing): a level-0 section in
// the body of an `article` document.
const documentWithError = `= Title

== Section

= Another Level 0
`

describe('asciidoc.AsciidocLoader diagnostics', () => {
  // Language features (symbols, folding, completion, links) parse through
  // load(); that parse must never publish diagnostics, otherwise invoking a
  // provider or opening the preview would (re)compute them.
  test('load() must not publish diagnostics', async () => {
    const uri = vscode.Uri.file('loader-load-no-diagnostics.adoc')
    const loader = createLoader()
    await loader.load(new InMemoryDocument(uri, documentWithError))
    assert.deepStrictEqual(
      vscode.languages.getDiagnostics(uri),
      [],
      'load() should not publish diagnostics',
    )
  })

  // reportDiagnostics() is the single diagnostics entry point (driven by the
  // diagnostic manager on open/change); it publishes genuine Asciidoctor errors.
  test('reportDiagnostics() publishes genuine errors', async () => {
    const uri = vscode.Uri.file('loader-report-diagnostics.adoc')
    const loader = createLoader()
    await loader.reportDiagnostics(new InMemoryDocument(uri, documentWithError))
    const diagnostics = vscode.languages.getDiagnostics(uri)
    assert.ok(
      diagnostics.some((diagnostic) =>
        diagnostic.message.includes('level 0 sections'),
      ),
      `expected a "level 0 sections" diagnostic, got: ${diagnostics
        .map((diagnostic) => diagnostic.message)
        .join(', ')}`,
    )
  })

  // Defensive: an extension can log a message whose `getText()` does not return
  // a string (asciidoctor-kroki historically logged an object payload when a
  // diagram failed to render). A non-string `Diagnostic.message` makes VS Code
  // throw "message.replace is not a function" while rendering the marker, so
  // the reported message must always be coerced to a string.
  test('reportErrors() always publishes a string diagnostic message', () => {
    const uri = vscode.Uri.file('loader-non-string-message-diagnostic.adoc')
    const diagnosticProvider = new AsciidoctorDiagnostic(
      'test-non-string-message-diagnostics',
    )
    const fakeMemoryLogger = {
      getMessages: () => [
        {
          message: { some: 'object' },
          getSeverity: () => 'ERROR',
          getText: () => ({ some: 'object' }), // not a string
          getSourceLocation: () => undefined,
        },
      ],
    }
    diagnosticProvider.reportErrors(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeMemoryLogger as any,
      new InMemoryDocument(uri, '= Title\n'),
    )
    const diagnostics = vscode.languages.getDiagnostics(uri)
    assert.equal(diagnostics.length, 1)
    assert.equal(typeof diagnostics[0].message, 'string')
  })
})
