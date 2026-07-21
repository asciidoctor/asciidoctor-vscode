import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocPreviewConfiguration } from '../features/preview/previewConfig.js'
import { createFile, removeFiles } from './workspaceHelper.js'

describe('asciidoc.preview.defaultStyle resolution', () => {
  let createdFiles: vscode.Uri[] = []

  afterEach(async () => {
    await removeFiles(createdFiles)
    createdFiles = []
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    await asciidocConfig.update('preview.defaultStyle', undefined)
    await asciidocConfig.update('preview.useEditorStyle', undefined)
  })

  test('falls back to the vscode style when nothing is configured', async () => {
    const file = await createFile(
      '= Title\n\nSome content',
      'default-style-unset.adoc',
    )
    createdFiles.push(file)
    const config = AsciidocPreviewConfiguration.getForResource(file)
    assert.equal(config.defaultStyle, 'vscode')
    assert.equal(config.defaultStyleExplicit, false)
  })

  test('honors an explicit preview.defaultStyle', async () => {
    const file = await createFile(
      '= Title\n\nSome content',
      'default-style-explicit.adoc',
    )
    createdFiles.push(file)
    await vscode.workspace
      .getConfiguration('asciidoc', null)
      .update('preview.defaultStyle', 'github')
    const config = AsciidocPreviewConfiguration.getForResource(file)
    assert.equal(config.defaultStyle, 'github')
    assert.equal(config.defaultStyleExplicit, true)
  })

  test('falls back to the deprecated preview.useEditorStyle when defaultStyle is unset', async () => {
    const file = await createFile(
      '= Title\n\nSome content',
      'default-style-legacy-fallback.adoc',
    )
    createdFiles.push(file)
    await vscode.workspace
      .getConfiguration('asciidoc', null)
      .update('preview.useEditorStyle', false)
    const config = AsciidocPreviewConfiguration.getForResource(file)
    assert.equal(config.defaultStyle, 'asciidoctor')
    // Neither value of the legacy boolean expresses an opinion about
    // Antora, unlike an explicit `defaultStyle` — see
    // AsciidoctorWebViewConverter.resolveEffectiveDefaultStyle.
    assert.equal(config.defaultStyleExplicit, false)
  })

  test('prefers an explicit preview.defaultStyle over the deprecated preview.useEditorStyle', async () => {
    const file = await createFile(
      '= Title\n\nSome content',
      'default-style-precedence.adoc',
    )
    createdFiles.push(file)
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    await asciidocConfig.update('preview.useEditorStyle', false)
    await asciidocConfig.update('preview.defaultStyle', 'antora')
    const config = AsciidocPreviewConfiguration.getForResource(file)
    assert.equal(config.defaultStyle, 'antora')
    assert.equal(config.defaultStyleExplicit, true)
  })

  test('honors an explicit preview.defaultStyle of "vscode" even when the deprecated useEditorStyle is false', async () => {
    // The trickiest case: 'vscode' is both the schema default (returned by
    // `.get()` whether or not the user touched the setting) and a value the
    // user can pick on purpose. Only `hasExplicitValue()` (via `.inspect()`)
    // tells them apart — asserting `defaultStyleExplicit` here guards
    // against a regression that would make this look like the user never
    // configured a style, silently falling back to useEditorStyle.
    const file = await createFile(
      '= Title\n\nSome content',
      'default-style-explicit-vscode-over-legacy.adoc',
    )
    createdFiles.push(file)
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    await asciidocConfig.update('preview.useEditorStyle', false)
    await asciidocConfig.update('preview.defaultStyle', 'vscode')
    const config = AsciidocPreviewConfiguration.getForResource(file)
    assert.equal(config.defaultStyle, 'vscode')
    assert.equal(config.defaultStyleExplicit, true)
  })

  test('falls back to the legacy setting when preview.defaultStyle holds an invalid value', async () => {
    const file = await createFile(
      '= Title\n\nSome content',
      'default-style-invalid-value.adoc',
    )
    createdFiles.push(file)
    const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', null)
    // Simulates a hand-edited or stale settings.json holding a value outside
    // the current enum (e.g. after a style was renamed or removed).
    await asciidocConfig.update('preview.defaultStyle', 'not-a-real-style')
    await asciidocConfig.update('preview.useEditorStyle', false)
    const config = AsciidocPreviewConfiguration.getForResource(file)
    assert.equal(config.defaultStyle, 'asciidoctor')
  })
})
