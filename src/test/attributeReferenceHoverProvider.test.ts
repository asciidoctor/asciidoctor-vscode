import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { Position } from 'vscode'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { AttributeReferenceHoverProvider } from '../features/attributeReferenceHoverProvider.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { createFile } from './workspaceHelper.js'

async function provideHover(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<vscode.Hover | undefined> {
  const textDocument = await vscode.workspace.openTextDocument(uri)
  const asciidocLoader = new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
    new AsciidoctorDiagnostic('test'),
    extensionContext,
  )
  return new AttributeReferenceHoverProvider(asciidocLoader).provideHover(
    textDocument,
    position,
  )
}

function hoverText(hover: vscode.Hover): string {
  return (hover.contents[0] as vscode.MarkdownString).value
}

describe('Attribute ref HoverProvider', () => {
  let createdFiles: vscode.Uri[] = []
  afterEach(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
  })

  test('Should show the value of an attribute defined in the same file', async () => {
    const file = await createFile(
      `:my-attribute: dummy value

The value is {my-attribute}.
`,
      'hover-attributeRef-samefile.adoc',
    )
    createdFiles.push(file)
    const hover = await provideHover(file, new Position(2, 20))
    assert.ok(hover, 'a hover should be provided over an attribute reference')
    assert.match(hoverText(hover), /\{my-attribute\} = dummy value/)
  })

  test('Should show an intrinsic attribute value', async () => {
    const file = await createFile(
      `= Title

Document name is {docname}.
`,
      'hover-attributeRef-docname.adoc',
    )
    createdFiles.push(file)
    const hover = await provideHover(file, new Position(2, 20))
    assert.ok(hover)
    assert.match(hoverText(hover), /\{docname\} = hover-attributeRef-docname/)
  })

  test('Should indicate when an attribute is not set', async () => {
    const file = await createFile(
      `= Title

Missing {not-defined-attribute}.
`,
      'hover-attributeRef-undefined.adoc',
    )
    createdFiles.push(file)
    const hover = await provideHover(file, new Position(2, 12))
    assert.ok(hover)
    assert.match(hoverText(hover), /is not set in this document/)
  })

  test('Should not provide a hover outside an attribute reference', async () => {
    const file = await createFile(
      `:my-attribute: dummy value

Plain text without any reference.
`,
      'hover-attributeRef-none.adoc',
    )
    createdFiles.push(file)
    const hover = await provideHover(file, new Position(2, 3))
    assert.strictEqual(hover, undefined)
  })

  test('Should not provide a hover inside a verbatim block without attributes subs', async () => {
    const file = await createFile(
      `= Title
:app-version: 1.2.3

----
version {app-version}
----
`,
      'hover-attributeRef-verbatim.adoc',
    )
    createdFiles.push(file)
    const hover = await provideHover(file, new Position(4, 12))
    assert.strictEqual(hover, undefined)
  })

  test('Should provide a hover inside a verbatim block with attributes subs', async () => {
    const file = await createFile(
      `= Title
:app-version: 1.2.3

[subs=+attributes]
----
version {app-version}
----
`,
      'hover-attributeRef-verbatim-subs.adoc',
    )
    createdFiles.push(file)
    const hover = await provideHover(file, new Position(5, 12))
    assert.ok(hover)
    assert.match(hoverText(hover), /\{app-version\} = 1\.2\.3/)
  })
})
