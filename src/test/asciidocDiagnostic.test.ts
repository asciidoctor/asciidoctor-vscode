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

  // Asciidoctor's global logger is shared by every parse in the extension host
  // (diagnostics of other documents, preview, language features): a parse that
  // overlaps this one must not capture its messages.
  test('reportDiagnostics() keeps the errors of overlapping parses', async () => {
    const uris = [
      vscode.Uri.file('loader-report-overlapping-1.adoc'),
      vscode.Uri.file('loader-report-overlapping-2.adoc'),
    ]
    const loader = createLoader()
    await Promise.all(
      uris.map((uri) =>
        loader.reportDiagnostics(new InMemoryDocument(uri, documentWithError)),
      ),
    )
    for (const uri of uris) {
      assert.ok(
        vscode.languages
          .getDiagnostics(uri)
          .some((diagnostic) =>
            diagnostic.message.includes('level 0 sections'),
          ),
        `expected a "level 0 sections" diagnostic for ${uri.path}`,
      )
    }
  })

  // A message from an included file is anchored to its `include::` directive,
  // with the message itself as related information.
  test('reportErrors() anchors a message from an included file to its include directive', () => {
    const uri = vscode.Uri.file('/loader-included-file-diagnostic.adoc')
    const diagnosticProvider = new AsciidoctorDiagnostic(
      'test-included-file-diagnostics',
    )
    diagnosticProvider.reportErrors(
      [
        {
          severity: 'WARN',
          text: 'list item index: expected 2, got 3',
          location: {
            file: '/partials/list.adoc',
            path: 'partials/list.adoc',
            lineNumber: 2,
          },
        },
      ],
      new InMemoryDocument(uri, '= Title\n\ninclude::partials/list.adoc[]\n'),
    )
    const diagnostics = vscode.languages.getDiagnostics(uri)
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0].range.start.line, 2)
    assert.equal(
      diagnostics[0].message,
      'There was an error in an included file',
    )
    assert.equal(
      diagnostics[0].relatedInformation?.[0].message,
      'list item index: expected 2, got 3',
    )
  })
})
