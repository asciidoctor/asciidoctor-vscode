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
    // Count how many times the preview HTML is actually (re)generated.
    const contentProvider = {
      providePreviewHTML: async () => {
        renderCount++
        return '<html><body>preview</body></html>'
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

    // Initial render.
    preview.update(fileUri)
    await tick(300)
    assert.equal(renderCount, 1, 'the initial update should render once')

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

    // The fix: RefreshPreviewCommand calls refresh(true), which forces a full
    // re-render regardless of the document version.
    preview.refresh(true)
    await tick(500)
    assert.equal(
      renderCount,
      2,
      'a forced refresh must re-render even when the document is unchanged',
    )
  })
})
