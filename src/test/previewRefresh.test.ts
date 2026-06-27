import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { Logger } from '../core/logger.js'
import { getAsciidocExtensionContributions } from '../features/extensionContributions.js'
import { AsciidocPreview } from '../features/preview/preview.js'
import { AsciidocPreviewConfigurationManager } from '../features/preview/previewConfig.js'
import { AsciidocContentProvider } from '../features/preview/previewContentProvider.js'
import { AsciidocFileTopmostLineMonitor } from '../features/preview/topmostLineMonitor.js'
import { extensionContext } from './helper.js'
import { createFile, removeFiles } from './workspaceHelper.js'

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// `asciidoc.preview.refreshInterval` defaults to 2000ms.
const REFRESH_INTERVAL = 2000

describe('Refresh preview command', () => {
  let fileUri: vscode.Uri
  let preview: AsciidocPreview | undefined
  let renderCount = 0

  before(async () => {
    fileUri = await createFile('= Hello\n\nworld\n', 'preview-refresh.adoc')
  })

  after(async () => {
    preview?.dispose()
    await removeFiles([fileUri])
  })

  test('forces a re-render even when the document is unchanged', async () => {
    // Count how many times the preview HTML is actually (re)generated, and tag
    // each render so we can tell a full reload (which assigns `webview.html`,
    // rebuilding the shell/<head> where styles live) from an incremental morph
    // (which leaves `webview.html` untouched).
    const contentProvider = {
      providePreviewHTML: async () => {
        renderCount++
        return `<html><body>preview ${renderCount}</body></html>`
      },
    } as unknown as AsciidocContentProvider

    // `locked: true` so this preview ignores active-editor changes triggered by
    // other tests sharing the extension host, keeping the render count stable.
    preview = AsciidocPreview.create(
      fileUri,
      vscode.ViewColumn.One,
      vscode.ViewColumn.Two,
      true,
      contentProvider,
      new AsciidocPreviewConfigurationManager(),
      new Logger(),
      new AsciidocFileTopmostLineMonitor(),
      getAsciidocExtensionContributions(extensionContext),
    )

    // Reading the (private) webview HTML lets us assert that a forced refresh
    // does a full reload, not just an incremental morph.
    const webviewHtml = () =>
      (preview as unknown as { editor: vscode.WebviewPanel }).editor.webview
        .html

    // Initial render.
    preview.update(fileUri)
    await tick(300)
    assert.equal(renderCount, 1, 'the initial update should render once')
    assert.match(
      webviewHtml(),
      /preview 1/,
      'the initial render is a full load',
    )

    // A non-forced refresh on an unchanged document must NOT re-render: the
    // update is throttled and then skipped by the unchanged-version
    // early-return. This is why "Refresh Preview" used to appear to do nothing
    // after changing only a setting (e.g. asciidoc.preview.style).
    preview.refresh(false)
    await tick(REFRESH_INTERVAL + 500)
    assert.equal(
      renderCount,
      1,
      'a non-forced refresh on an unchanged document should not re-render',
    )

    // The fix: a forced refresh re-renders regardless of the document version
    // *and* does a full reload, so shell-level settings such as
    // `asciidoc.preview.style` (which live in the webview <head>, untouched by
    // an incremental morph) actually take effect. Asserting `webview.html`
    // picked up the latest render proves the full reload happened — an
    // incremental morph would have left it at "preview 1".
    preview.refresh(true)
    await tick(500)
    assert.equal(
      renderCount,
      2,
      'a forced refresh must re-render even when the document is unchanged',
    )
    assert.match(
      webviewHtml(),
      /preview 2/,
      'a forced refresh must fully reload the webview, not just morph it',
    )

    // A save forces a re-render (so an open preview picks up `include::`d files
    // changed on disk, since a save does not bump the document version) but asks
    // for the incremental morph path (`fullReload: false`). It must re-render
    // yet leave `webview.html` untouched, so the preview/editor scroll position
    // is preserved instead of being reset by a full reload.
    preview.refresh(true, false)
    await tick(500)
    assert.equal(
      renderCount,
      3,
      'a forced refresh must re-render even with fullReload disabled',
    )
    assert.match(
      webviewHtml(),
      /preview 2/,
      'a forced refresh with fullReload disabled must morph, not reload (webview.html stays at the last full load)',
    )
  })
})
