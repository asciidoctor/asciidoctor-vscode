import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import DocumentSymbolProvider from '../features/documentSymbolProvider.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'
import { createFile } from './workspaceHelper.js'

const testFileName = vscode.Uri.file('test.adoc')

function newSymbolProvider() {
  return new DocumentSymbolProvider(
    new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(
        AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
      ),
      new AsciidoctorDiagnostic('text'),
      extensionContext,
    ),
  )
}

function getSymbolsForFile(fileContents: string) {
  const doc = new InMemoryDocument(testFileName, fileContents)
  return newSymbolProvider().provideDocumentSymbols(doc)
}

describe('asciidoc.DocumentSymbolProvider', () => {
  let createdFiles: vscode.Uri[] = []
  afterEach(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
  })

  test('Should not return anything for empty document', async () => {
    const symbols = await getSymbolsForFile('')
    assert.strictEqual(symbols.length, 0)
  })

  test('Should not return anything for document with no headers', async () => {
    const symbols = await getSymbolsForFile('a\na')
    assert.strictEqual(symbols.length, 0)
  })

  test('Should not serve a stale outline from another document', async () => {
    // Regression: the provider used to cache the tree on the (singleton)
    // instance behind a 2s throttle, so a second call within that window — for
    // a *different* document — returned the first document's outline.
    const provider = newSymbolProvider()
    const first = await provider.provideDocumentSymbols(
      new InMemoryDocument(
        vscode.Uri.file('first.adoc'),
        '= First\n\n== Alpha',
      ),
    )
    const second = await provider.provideDocumentSymbols(
      new InMemoryDocument(
        vscode.Uri.file('second.adoc'),
        '= Second\n\n== Beta',
      ),
    )
    assert.strictEqual(first[0].name, 'First')
    assert.strictEqual(second[0].name, 'Second')
    assert.deepStrictEqual(
      second[0].children.map((c) => c.name),
      ['Beta'],
    )
  })

  test('Should still return symbols when a section precedes an include with sections (#936)', async () => {
    createdFiles.push(
      await createFile(
        `== Installation

=== Prerequisites
`,
        'documentsymbol-936-include.adoc',
      ),
    )
    const mainContent = `= User Guide

== Overview

include::documentsymbol-936-include.adoc[]
`
    const mainFile = await createFile(
      mainContent,
      'documentsymbol-936-main.adoc',
    )
    createdFiles.push(mainFile)

    const symbols = await newSymbolProvider().provideDocumentSymbols(
      new InMemoryDocument(mainFile, mainContent),
    )

    // Before the fix this threw inside `buildToc` and the outline was empty
    // ("No symbols found in document").
    assert.ok(symbols.length > 0, 'the outline should not be empty')
    const root = symbols[0]
    assert.strictEqual(root.name, 'User Guide')
    const titles = root.children.map((c) => c.name)
    assert.deepStrictEqual(titles, ['Overview', 'Installation'])
    // The included section is anchored to the `include::` directive line (4,
    // 0-based) of the host document, the only navigable location in the Outline.
    const includedSection = root.children[1]
    assert.strictEqual(includedSection.range.start.line, 4)
    assert.deepStrictEqual(
      includedSection.children.map((c) => c.name),
      ['Prerequisites'],
    )
  })

  test('Should still return symbols when an attributes include directly follows the header with no blank line (#359)', async () => {
    // Faithful reproduction of #359: an `include::` of an *attributes* file sits
    // on the line right after the document title, with no blank line in between,
    // and the sections live in the main document. The outline used to come back
    // empty ("No symbols found in document") in this case.
    createdFiles.push(
      await createFile(
        `:js: JavaScript
:url-repo: https://example.org
`,
        'documentsymbol-359-attributes.adoc',
      ),
    )
    const mainContent = `= {js} Modules
include::documentsymbol-359-attributes.adoc[]

== Overview

== Details
`
    const mainFile = await createFile(
      mainContent,
      'documentsymbol-359-main.adoc',
    )
    createdFiles.push(mainFile)

    const symbols = await newSymbolProvider().provideDocumentSymbols(
      new InMemoryDocument(mainFile, mainContent),
    )

    assert.ok(symbols.length > 0, 'the outline should not be empty')
    const root = symbols[0]
    // The attribute defined in the included file is resolved in the title.
    assert.strictEqual(root.name, 'JavaScript Modules')
    assert.deepStrictEqual(
      root.children.map((c) => c.name),
      ['Overview', 'Details'],
    )
  })

  test('A section after an include stays a sibling, not nested under the include (#936)', async () => {
    createdFiles.push(
      await createFile(
        `== Installation

=== Prerequisites
`,
        'documentsymbol-936b-include.adoc',
      ),
    )
    const mainContent = `= User Guide

== Overview

include::documentsymbol-936b-include.adoc[]

== Configuration
`
    const mainFile = await createFile(
      mainContent,
      'documentsymbol-936b-main.adoc',
    )
    createdFiles.push(mainFile)

    // Open the real document and ask VS Code itself for the symbol tree, so we
    // exercise its range-based nesting (the Outline does not just trust our
    // `children`: a child whose range is contained in a sibling's range gets
    // re-parented). `Configuration` must remain a sibling of `Installation`.
    const document = await vscode.workspace.openTextDocument(mainFile)
    const symbols = (await vscode.commands.executeCommand(
      'vscode.executeDocumentSymbolProvider',
      document.uri,
    )) as vscode.DocumentSymbol[]

    const root = symbols[0]
    assert.strictEqual(root.name, 'User Guide')
    assert.deepStrictEqual(
      root.children.map((c) => c.name),
      ['Overview', 'Installation', 'Configuration'],
    )
    const includeSection = root.children.find((c) => c.name === 'Installation')!
    assert.deepStrictEqual(
      includeSection.children.map((c) => c.name),
      ['Prerequisites'],
      'Prerequisites is the only child of Installation',
    )
  })
})
