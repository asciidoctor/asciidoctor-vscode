import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import {
  AsciidocIncludeItemsLoader,
  AsciidocLoader,
  ParseResult,
} from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { AsciidoctorIncludeItems } from '../features/asciidoctor/asciidoctorIncludeItems.js'
import { ParseCache } from '../features/asciidoctor/parseCache.js'
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

// After an edit, the folding ranges, the document symbols, the document links
// and the diagnostics all need the parsed document: they share a single parse
// of each version of the document (#1251).
describe('asciidoc.AsciidocLoader shared parse', () => {
  test('load() reuses the parse of the same text', async () => {
    const uri = vscode.Uri.file('loader-shared-parse.adoc')
    const loader = createLoader()
    const first = await loader.load(new InMemoryDocument(uri, '= Title\n'))
    const second = await loader.load(new InMemoryDocument(uri, '= Title\n'))
    assert.strictEqual(second, first)
    const edited = await loader.load(
      new InMemoryDocument(uri, '= Edited title\n'),
    )
    assert.notStrictEqual(edited, first)
    assert.equal(edited.getDocumentTitle(), 'Edited title')
  })

  test('concurrent calls share the pending parse', async () => {
    const uri = vscode.Uri.file('loader-shared-pending-parse.adoc')
    const loader = createLoader()
    const [first, second] = await Promise.all([
      loader.load(new InMemoryDocument(uri, '= Title\n')),
      loader.load(new InMemoryDocument(uri, '= Title\n')),
    ])
    assert.strictEqual(second, first)
  })

  // The diagnostics come from the log messages of the shared parse, even when
  // a language feature started it.
  test('reportDiagnostics() publishes the errors of a parse started by load()', async () => {
    const uri = vscode.Uri.file('loader-shared-parse-diagnostics.adoc')
    const loader = createLoader()
    await loader.load(new InMemoryDocument(uri, documentWithError))
    assert.deepStrictEqual(vscode.languages.getDiagnostics(uri), [])
    await loader.reportDiagnostics(new InMemoryDocument(uri, documentWithError))
    assert.ok(
      vscode.languages
        .getDiagnostics(uri)
        .some((diagnostic) => diagnostic.message.includes('level 0 sections')),
      'expected a "level 0 sections" diagnostic from the shared parse',
    )
  })

  // The include directives are found with a degraded parse, where every
  // include is replaced by an empty line: it must neither use nor fill the
  // shared cache.
  test('the include directives parse does not go into the shared cache', async () => {
    const uri = vscode.Uri.file('loader-shared-parse-include-items.adoc')
    const parseCache = new ParseCache<ParseResult>()
    const securityPolicy =
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)
    const loader = new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(securityPolicy),
      new AsciidoctorDiagnostic('test-shared-parse-diagnostics'),
      extensionContext,
      parseCache,
    )
    const includeItemsLoader = new AsciidocIncludeItemsLoader(
      new AsciidoctorIncludeItems(),
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(securityPolicy),
      new AsciidoctorDiagnostic('test-shared-parse-diagnostics'),
      extensionContext,
      parseCache,
    )
    const text = '= Title\n\ninclude::partial.adoc[]\n'
    const includeItems = await includeItemsLoader.getIncludeItems(
      new InMemoryDocument(uri, text),
    )
    assert.deepEqual(
      includeItems.map((item) => item.name),
      ['partial.adoc'],
    )
    assert.equal(parseCache.size, 0)
    // The language features of both loaders share the full parse.
    const document = await loader.load(new InMemoryDocument(uri, text))
    assert.strictEqual(
      await includeItemsLoader.load(new InMemoryDocument(uri, text)),
      document,
    )
  })
})
