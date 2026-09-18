import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { toggleInlineFormatting } from '../commands/toggleFormatting.js'

async function withEditor(
  content: string,
  selection: vscode.Selection,
  language = 'asciidoc',
): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    content,
    language,
  })
  const editor = await vscode.window.showTextDocument(document)
  editor.selection = selection
  return editor
}

function lineSelection(line: number, start: number, end: number) {
  return new vscode.Selection(
    new vscode.Position(line, start),
    new vscode.Position(line, end),
  )
}

describe('asciidoc.toggleInlineFormatting', () => {
  test('wraps the selected text with the marker', async () => {
    const editor = await withEditor('foo bar baz', lineSelection(0, 4, 7))
    await toggleInlineFormatting('*')
    assert.strictEqual(editor.document.getText(), 'foo *bar* baz')
  })

  test('unwraps a selection already wrapped with the marker (toggle off)', async () => {
    const editor = await withEditor('foo *bar* baz', lineSelection(0, 4, 9))
    await toggleInlineFormatting('*')
    assert.strictEqual(editor.document.getText(), 'foo bar baz')
  })

  test('wraps the word under the cursor when nothing is selected', async () => {
    const editor = await withEditor('foo bar baz', lineSelection(0, 5, 5))
    await toggleInlineFormatting('_')
    assert.strictEqual(editor.document.getText(), 'foo _bar_ baz')
  })

  test('inserts an empty pair and places the cursor between the markers', async () => {
    const editor = await withEditor('foo  baz', lineSelection(0, 4, 4))
    await toggleInlineFormatting('`')
    assert.strictEqual(editor.document.getText(), 'foo `` baz')
    assert.deepStrictEqual(editor.selection.active, new vscode.Position(0, 5))
  })

  test('uses the unconstrained (doubled) form mid-word', async () => {
    const editor = await withEditor('foobar', lineSelection(0, 2, 4))
    await toggleInlineFormatting('*')
    assert.strictEqual(editor.document.getText(), 'fo**ob**ar')
  })

  test('unwraps the unconstrained form when the marks are inside the selection', async () => {
    const editor = await withEditor('fo**ob**ar', lineSelection(0, 2, 8))
    await toggleInlineFormatting('*')
    assert.strictEqual(editor.document.getText(), 'foobar')
  })

  test('unwraps the unconstrained form when the marks surround the selection', async () => {
    const editor = await withEditor('fo**ob**ar', lineSelection(0, 4, 6))
    await toggleInlineFormatting('*')
    assert.strictEqual(editor.document.getText(), 'foobar')
  })

  test('unwraps the constrained form when the word is selected but the marks are not', async () => {
    const editor = await withEditor('foo *bar* baz', lineSelection(0, 5, 8))
    await toggleInlineFormatting('*')
    assert.strictEqual(editor.document.getText(), 'foo bar baz')
  })

  test('keeps leading/trailing whitespace outside the constrained marks', async () => {
    const editor = await withEditor('foo bar baz', lineSelection(0, 3, 8))
    await toggleInlineFormatting('*')
    assert.strictEqual(editor.document.getText(), 'foo *bar* baz')
  })

  // The toggles are restricted to AsciiDoc documents (#1199). The guard is a
  // language check rather than an extension check, so it is exercised against a
  // few of the languages a user may have focused when pressing Ctrl+B, and with
  // each of the three markers.

  for (const language of [
    'markdown',
    'plaintext',
    'json',
    'yaml',
    'latex',
    'typescript',
  ]) {
    for (const [name, marker] of [
      ['bold', '*'],
      ['italic', '_'],
      ['monospace', '`'],
    ]) {
      test(`leaves a ${language} document untouched when toggling ${name}`, async () => {
        const editor = await withEditor(
          'foo bar baz',
          lineSelection(0, 4, 7),
          language,
        )
        await toggleInlineFormatting(marker)
        assert.strictEqual(editor.document.getText(), 'foo bar baz')
      })
    }
  }

  for (const command of [
    'asciidoc.toggleBold',
    'asciidoc.toggleItalic',
    'asciidoc.toggleMonospace',
  ]) {
    test(`${command} leaves a non-AsciiDoc document untouched`, async () => {
      const editor = await withEditor(
        'foo bar baz',
        lineSelection(0, 4, 7),
        'markdown',
      )
      await vscode.commands.executeCommand(command)
      assert.strictEqual(editor.document.getText(), 'foo bar baz')
    })
  }

  test('asciidoc.toggleBold still wraps the selection in an AsciiDoc document', async () => {
    const editor = await withEditor('foo bar baz', lineSelection(0, 4, 7))
    await vscode.commands.executeCommand('asciidoc.toggleBold')
    assert.strictEqual(editor.document.getText(), 'foo *bar* baz')
  })
})
