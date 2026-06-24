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
})
