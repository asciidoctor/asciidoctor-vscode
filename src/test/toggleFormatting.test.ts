import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
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
  afterEach(async () => {
    await vscode.commands.executeCommand(
      'workbench.action.revertAndCloseActiveEditor',
    )
  })

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
  // language check that returns before the marker is read, so a single marker is
  // enough for each language.

  for (const language of ['markdown', 'plaintext', 'yaml', 'latex']) {
    test(`leaves a ${language} document untouched`, async () => {
      const editor = await withEditor(
        'foo bar baz',
        lineSelection(0, 4, 7),
        language,
      )
      assert.strictEqual(editor.document.languageId, language)
      await toggleInlineFormatting('*')
      assert.strictEqual(editor.document.getText(), 'foo bar baz')
    })
  }

  for (const { command, marker } of [
    { command: 'asciidoc.toggleBold', marker: '*' },
    { command: 'asciidoc.toggleItalic', marker: '_' },
    { command: 'asciidoc.toggleMonospace', marker: '`' },
  ]) {
    test(`${command} wraps the selection with ${marker} in an AsciiDoc document`, async () => {
      const editor = await withEditor('foo bar baz', lineSelection(0, 4, 7))
      await vscode.commands.executeCommand(command)
      assert.strictEqual(
        editor.document.getText(),
        `foo ${marker}bar${marker} baz`,
      )
    })

    // The guard covers the paths that are not filtered by a `when` clause, such
    // as `executeCommand` or a user keybinding without a `when` clause.
    test(`${command} leaves a non-AsciiDoc document untouched`, async () => {
      const editor = await withEditor(
        'foo bar baz',
        lineSelection(0, 4, 7),
        'markdown',
      )
      await vscode.commands.executeCommand(command)
      assert.strictEqual(editor.document.getText(), 'foo bar baz')
    })

    test(`${command} is only offered in AsciiDoc documents`, () => {
      const { contributes } = vscode.extensions.getExtension(
        'asciidoctor.asciidoctor-vscode',
      )?.packageJSON
      const paletteEntry = contributes.menus.commandPalette.find(
        (entry: { command: string }) => entry.command === command,
      )
      const keybinding = contributes.keybindings.find(
        (entry: { command: string }) => entry.command === command,
      )
      assert.strictEqual(paletteEntry.when, 'editorLangId == asciidoc')
      assert.strictEqual(
        keybinding.when,
        'editorTextFocus && editorLangId == asciidoc',
      )
    })
  }
})
