/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import * as vscode from 'vscode'
import 'mocha'

import { InMemoryDocument } from './inMemoryDocument'

const testFileName = vscode.Uri.file('test.md')

suite('asciidoc.Asciidoctorconfig', () => {
  test('Pick up config from root workspace folder', () => {
    const doc = new InMemoryDocument(testFileName, '[my-var]')

    // TODO: find how to have the rendered html

    // TODO: assert that rendered document contains `variable coming from .asciictorconfig file placed at root of the workspace`
    assert.fail(`To check the content of a rendered ${doc.getText}`)
  })
})
