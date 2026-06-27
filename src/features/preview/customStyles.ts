// Pure (vscode-free) helpers to build the user/custom stylesheet `<link>` tags
// injected into the preview <head>. Kept free of any `vscode` import so the
// logic can be unit-tested under `node --test` (see test/unit/customStyles).

function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;')
}

function styleLink(source: string, href: string): string {
  return `<link rel="stylesheet" class="code-user-style" data-source="${escapeAttribute(source)}" href="${escapeAttribute(href)}" type="text/css" media="screen">`
}

/**
 * Build the custom stylesheet `<link>` tags for the preview.
 *
 * `previewStyle` (the `asciidoc.preview.style` setting) *replaces* the default
 * Asciidoctor stylesheet, whereas `additionalStyles`
 * (`asciidoc.preview.additionalStyles`) are *layered on top of* whichever base
 * is in effect (default, editor, or custom). The additional styles are emitted
 * last so they win the CSS cascade and the user keeps full control.
 *
 * `resolveHref` turns a configured path/URL into the final webview `href`
 * (injected so this stays vscode-free; the converter passes its `fixHref`).
 */
export function buildCustomStyleSheetLinks(
  previewStyle: string,
  additionalStyles: readonly string[],
  resolveHref: (stylePath: string) => string,
): string {
  const out: string[] = []
  if (previewStyle !== '') {
    out.push(styleLink(previewStyle, resolveHref(previewStyle)))
  }
  for (const additionalStyle of additionalStyles) {
    out.push(styleLink(additionalStyle, resolveHref(additionalStyle)))
  }
  return out.join('\n')
}
