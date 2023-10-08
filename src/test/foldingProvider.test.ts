import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import AsciidocFoldingProvider from '../features/foldingProvider'
import { InMemoryDocument } from './inMemoryDocument'
import { AsciidocLoader } from '../asciidocLoader'
import { AsciidoctorConfig } from '../features/asciidoctorConfig'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'
import { extensionContext } from './helper'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'

const testFileName = vscode.Uri.file('test.adoc')

suite('asciidoc.FoldingProvider', () => {
  suite('getHeaderFoldingRanges', () => {
    test('Should not return anything for empty document', async () => {
      const folds = await getFoldsForDocument('')
      assert.strictEqual(folds.length, 0)
    })

    test('Should not return anything for document without headers', async () => {
      const folds = await getFoldsForDocument(`a
*b* afas
a=b
a`)
      assert.strictEqual(folds.length, 0)
    })

    test('Should fold from header to end of document', async () => {
      const folds = await getFoldsForDocument(`= a

== b

c
d`)
      assert.strictEqual(folds.length, 2)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 0)
      assert.strictEqual(firstFold.end, 5)
    })

    test('Should leave single newline before next header', async () => {
      const folds = await getFoldsForDocument(`
== a
x

== b
y`)
      assert.strictEqual(folds.length, 2)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 1)
      assert.strictEqual(firstFold.end, 3)
    })

    test('Should collapse multiple newlines to single newline before next header', async () => {
      const folds = await getFoldsForDocument(`
== a
x



== b
y`)
      assert.strictEqual(folds.length, 2)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 1)
      assert.strictEqual(firstFold.end, 5)
      const secondFold = folds[1]
      assert.strictEqual(secondFold.start, 6)
      assert.strictEqual(secondFold.end, 7)
    })

    test('Should not collapse if there is no newline before next header', async () => {
      const folds = await getFoldsForDocument(`= a
x
== b
y`)
      assert.strictEqual(folds.length, 1)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 0)
      assert.strictEqual(firstFold.end, 3)
    })
  })

  suite('getConditionalFoldingRanges', () => {
    test('Should fold from ifeval conditional beginning to its end', async () => {
      const folds = await getFoldsForDocument(`ifeval::["{lang}" == "de"]
Das ist mein Text.
endif::[]`)
      assert.strictEqual(folds.length, 1)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 0)
      assert.strictEqual(firstFold.end, 2)
    })

    test('Should fold from ifndef conditional beginning to its end', async () => {
      const folds = await getFoldsForDocument(`ifndef::env-github[]
This content is not shown on GitHub.
endif::[]`)
      assert.strictEqual(folds.length, 1)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 0)
      assert.strictEqual(firstFold.end, 2)
    })

    test('Should fold from ifdef multi conditionals beginning to its end', async () => {
      const folds = await getFoldsForDocument(`ifeval::["{InstallOS}"=="Linux"]
:install-os-linux:
endif::[]
ifeval::["{InstallOS}"=="Solaris"]
:install-os-solaris:
endif::[]
ifeval::["{InstallOS}"=="Windows"]
:install-os-windows:
endif::[]

ifdef::install-os-linux,install-os-solaris[]
NOTE: We recommend that you install the library in the \`/opt/\` directory.
endif::[]
ifdef::install-os-windows[]
NOTE: We recommend that you install the library in the \`C:\\Program Files\` directory.
endif::[]`)
      assert.strictEqual(folds.length, 5)
      const firstFold = folds[0]
      assert.strictEqual(firstFold.start, 0)
      assert.strictEqual(firstFold.end, 2)
    })

    test('Should fold nested conditionals', async () => {
      const folds = await getFoldsForDocument(`ifdef::foo[]
foo1
ifdef::bar[]
bar
endif::[]
foo2
endif::[]`)
      assert.strictEqual(folds.length, 2, 'expecting 2 folds')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 4, vscode.FoldingRangeKind.Region),
        new vscode.FoldingRange(0, 6, vscode.FoldingRangeKind.Region),
      ])
    })
  })

  suite('getOpenBlockFoldingRanges', () => {
    test('Should fold open block', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

--
An open block can be an anonymous container,
or it can masquerade as any other block.
--

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 5, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Should fold open block from dashes to the end of the document if no end block dashes', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

--
An unterminated open block.
Fold will end at the end of the document.

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [new vscode.FoldingRange(2, 6, vscode.FoldingRangeKind.Region)])
    })

    test('Should fold open block acting as a sidebar', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

[sidebar]
.Related information
--
This is aside text.

It is used to present information related to the main content.
--

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(4, 8, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Should fold open block acting as a source block', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

[source]
--
puts "I'm a source block!"
--

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(3, 5, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Should fold open block if title is before sidebar', async () => {
      const folds = await getFoldsForDocument(
        `before

.Title
[sidebar]
--
text
--

after`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(4, 6, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Nested open blocks  should behave like 2 separate blocks', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

[source]
--
--
puts "I'm a nested block!"
--
--

this is a paragraph`)
      assert.strictEqual(folds.length, 2, 'expecting 1 folds')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(3, 4, vscode.FoldingRangeKind.Region),
        new vscode.FoldingRange(6, 7, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Should not collapse if more or less than 2 dashes ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

--
---
inside
--

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 folds')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 5, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Should not fold on title if it is not the block title ', async () => {
      const folds = await getFoldsForDocument(
        `.Title
This is a paragraph.
--
Open
--`)
      assert.strictEqual(folds.length, 1, 'expecting 1 folds')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 4, vscode.FoldingRangeKind.Region),
      ])
    })
  })

  suite('getCommentBlockFoldingRanges', () => {
    test('Should fold comment block with 4 slashes ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

////
A comment block.
Notice it's a delimited block.
////

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 5, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Should fold comment block with more than 4 slashes ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

/////
A comment block.
Notice it's a delimited block.
/////

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 5, vscode.FoldingRangeKind.Region),
      ])
    })

    test('Should not fold comment block with less than 4 slashes ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

///
Some text.
From a paragraph.
///

this is another paragraph`)
      assert.strictEqual(folds.length, 0, 'expecting 0 fold')
    })

    test('Should fold comment block from slashes to the end of the document if no end block ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

////
An unterminated comment block.
Fold will end at the end of the document.

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [new vscode.FoldingRange(2, 6, vscode.FoldingRangeKind.Region)])
    })

    test('Should not fold comment block if slashes are part of literal text ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

 ////
Some text.
From a paragraph.
///
this is the same paragraph`)
      assert.strictEqual(folds.length, 0, 'expecting 0 fold')
    })
  })

  suite('getSingleLineCommentFoldingRanges', () => {
    test('Should fold on a group of single line comments ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

// A single-line comment.
// Another single-line comment.
// A third single-line comment.

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 4, vscode.FoldingRangeKind.Comment),
      ])
    })

    test('Should not fold single line comment if not contiguous ', async () => {
      const folds = await getFoldsForDocument(
        `// A single-line comment.

// Another single-line comment.

// This is a comment too.

This is a paragraph.

// This is another comment.`)
      assert.strictEqual(folds.length, 0, 'expecting 0 fold')
    })

    test('Should not fold single lines comments if slashes are part of literal text ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph
 // This is literal text
// This is a single line comment
this is the same paragraph`)
      assert.strictEqual(folds.length, 0, 'expecting 0 fold')
    })

    test('Should fold if last single line comment is on the last line of the document', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph
// This is a comment.
// The last line of the document is also a comment!`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(1, 2, vscode.FoldingRangeKind.Comment),
      ])
    })
  })

  suite('getMultiAttributesFoldingRanges', () => {
    test('Should fold on a group of attributes ', async () => {
      const folds = await getFoldsForDocument(
        `this is a paragraph

:attribute1: value 1
:attribute2: value 2
:attribute3: value 3
:attribute4: value 4

this is a paragraph`)
      assert.strictEqual(folds.length, 1, 'expecting 1 fold')
      assert.deepStrictEqual(folds, [
        new vscode.FoldingRange(2, 5),
      ])
    })
  })
})

async function getFoldsForDocument (contents: string) {
  const doc = new InMemoryDocument(testFileName, contents)
  const provider = new AsciidocFoldingProvider(new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
    new AsciidoctorDiagnostic('text'),
    extensionContext
  ))
  return provider.provideFoldingRanges(doc, new vscode.CancellationTokenSource().token)
}
