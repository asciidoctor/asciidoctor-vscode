/**
 * Compute the initial state of the preview webview.
 *
 * The state persisted by the webview (`vscode.getState()`) belongs to the panel, not to the document:
 * when the preview switches to another document, it still contains the scroll position of the previous one.
 * It is therefore only restored when it was saved for the document currently displayed.
 */
export function getInitialPreviewState<S extends { source: string }>(
  settings: S,
  persistedState: unknown,
  dataState: object,
): S & Record<string, any> {
  const restoredState =
    typeof persistedState === 'object' &&
    persistedState !== null &&
    (persistedState as { source?: unknown }).source === settings.source
      ? persistedState
      : {}
  return {
    ...settings,
    ...restoredState,
    ...dataState,
  }
}
