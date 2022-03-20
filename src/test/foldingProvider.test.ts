/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import AsciidocFoldingProvider from '../features/foldingProvider'
import { createNewAsciidocEngine } from './engine'
import { InMemoryDocument } from './inMemoryDocument'

const testFileName = vscode.Uri.file('test.adoc')

suite('asciidoc.FoldingProvider', () => {
  test('Should not return anything for empty document', () => {
    const folds = getFoldsForDocument('')
    assert.strictEqual(folds.length, 0)
  })

  test('Should not return anything for document without headers', () => {
    const folds = getFoldsForDocument(`a
*b* afas
a=b
a`)
    assert.strictEqual(folds.length, 0)
  })

  test('Should fold from header to end of document', () => {
    const folds = getFoldsForDocument(`= a

== b

c
d`)
    assert.strictEqual(folds.length, 2)
    const firstFold = folds[0]
    assert.strictEqual(firstFold.start, 0)
    assert.strictEqual(firstFold.end, 5)
  })

  test('Should leave single newline before next header', () => {
    const folds = getFoldsForDocument(`
== a
x

== b
y`)
    assert.strictEqual(folds.length, 2)
    const firstFold = folds[0]
    assert.strictEqual(firstFold.start, 1)
    assert.strictEqual(firstFold.end, 3)
  })

  test('Should collapse multiple newlines to single newline before next header', () => {
    const folds = getFoldsForDocument(`
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

  test('Should not collapse if there is no newline before next header', () => {
    const folds = getFoldsForDocument(`= a
x
== b
y`)
    assert.strictEqual(folds.length, 1)
    const firstFold = folds[0]
    assert.strictEqual(firstFold.start, 0)
    assert.strictEqual(firstFold.end, 3)
  })
})

test('Should fold from ifeval conditional beginning to its end', () => {
  const folds = getFoldsForDocument(`ifeval::["{lang}" == "de"]
Das ist mein Text.
endif::[]`)
  assert.strictEqual(folds.length, 1)
  const firstFold = folds[0]
  assert.strictEqual(firstFold.start, 0)
  assert.strictEqual(firstFold.end, 2)
})

test('Should fold from ifndef conditional beginning to its end', () => {
  const folds = getFoldsForDocument(`ifndef::env-github[]
This content is not shown on GitHub.
endif::[]`)
  assert.strictEqual(folds.length, 1)
  const firstFold = folds[0]
  assert.strictEqual(firstFold.start, 0)
  assert.strictEqual(firstFold.end, 2)
})

test('Should fold from ifdef multi conditionals beginning to its end', () => {
  const folds = getFoldsForDocument(`ifeval::["{InstallOS}"=="Linux"]
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

test('Should fold nested conditionals', () => {
  const folds = getFoldsForDocument(`ifdef::foo[]
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

function getFoldsForDocument (contents: string) {
  const doc = new InMemoryDocument(testFileName, contents)
  const provider = new AsciidocFoldingProvider(createNewAsciidocEngine())
  return provider.provideFoldingRanges(doc, new vscode.CancellationTokenSource().token)
}
