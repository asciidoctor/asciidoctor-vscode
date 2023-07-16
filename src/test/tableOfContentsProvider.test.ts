/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import * as vscode from 'vscode'
import 'mocha'

import { TableOfContentsProvider } from '../tableOfContentsProvider'
import { InMemoryDocument } from './inMemoryDocument'
import { createFile } from './workspaceHelper'
import { AsciidocLoader } from '../asciidocLoader'
import { AsciidoctorConfig } from '../features/asciidoctorConfig'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions'
import { extensionContext } from './helper'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'

suite('asciidoc.TableOfContentsProvider', () => {
  let createdFiles: vscode.Uri[] = []
  teardown(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
  })

  test('Lookup should not return anything for empty document', async () => {
    const doc = new InMemoryDocument(vscode.Uri.file('test.adoc'), '')
    const provider = new TableOfContentsProvider(doc, new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
      new AsciidoctorDiagnostic('test')
    ))

    assert.strictEqual(await provider.lookup(''), undefined)
    assert.strictEqual(await provider.lookup('foo'), undefined)
  })

  test('Lookup should not return anything for document with no headers', async () => {
    const doc = new InMemoryDocument(vscode.Uri.file('test.adoc'), 'a *b*\nc')
    const provider = new TableOfContentsProvider(doc, new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
      new AsciidoctorDiagnostic('test')
    ))

    assert.strictEqual(await provider.lookup(''), undefined)
    assert.strictEqual(await provider.lookup('foo'), undefined)
    assert.strictEqual(await provider.lookup('a'), undefined)
    assert.strictEqual(await provider.lookup('b'), undefined)
  })

  test('Should include the document title in the TOC', async () => {
    const mainContent = `= test

content`
    const mainFile = await createFile(mainContent, 'tableofcontents-main-document.adoc')
    createdFiles.push(mainFile)
    const provider = new TableOfContentsProvider(new InMemoryDocument(mainFile, mainContent), new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
      new AsciidoctorDiagnostic('test')
    ))
    const toc = await provider.getToc()
    const documentTitleEntry = toc.find((entry) => entry.text === 'test' && entry.line === 0)
    assert.deepStrictEqual(documentTitleEntry !== undefined, true, 'should include the document title in the TOC')
  })

  test('Should include the document title in the TOC (when using an include just below it)', async () => {
    createdFiles.push(await createFile(`:attr: value
`, 'tableofcontents-attrs.adoc'))
    const mainContent = `= test
include::attrs.adoc[]

content`
    const mainFile = await createFile(mainContent, 'tableofcontents-main-document.adoc')
    createdFiles.push(mainFile)
    const provider = new TableOfContentsProvider(new InMemoryDocument(mainFile, mainContent), new AsciidocLoader(
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
      new AsciidoctorDiagnostic('test')
    ))
    const toc = await provider.getToc()
    const documentTitleEntry = toc.find((entry) => entry.text === 'test' && entry.line === 0)
    assert.deepStrictEqual(documentTitleEntry !== undefined, true, 'should include the document title in the TOC')
  })
})
