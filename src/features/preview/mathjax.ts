// MathJax 4 head markup for the preview WebView.
//
// Kept free of any `vscode` dependency so it can be unit-tested without the
// extension host (see src/test/unit/mathjax.test.ts). The converter resolves
// the WebView resource URLs and passes them in.

export interface MathJaxResources {
  /** Resolved `<script src>` of the combined `tex-mml-chtml-mathjax-newcm` component. */
  scriptSrc: string
  /**
   * Resolved base URL of the CommonHTML fonts, i.e. the directory holding the
   * per-font folders. The `%%FONT%%` placeholder (expanded by MathJax to the
   * font name) is appended to it.
   */
  fontBase: string
}

/**
 * Map Asciidoctor's `eqnums` attribute to MathJax 4's `tex.tags`.
 *
 * Asciidoctor's `eqnums` ("none"|"AMS"|"all") drove MathJax 2's
 * `equationNumbers.autoNumber`; MathJax 4 uses `tex.tags` ("none"|"ams"|"all").
 * A bare `:eqnums:` resolves to an empty string and means AMS auto-numbering.
 */
export function eqnumsToTexTags(eqnums: string): string {
  let value = eqnums
  if (value != null && value.trim().length === 0) {
    value = 'AMS'
  }
  return String(value).toLowerCase()
}

/**
 * Build the MathJax `<head>` markup (configuration + loader script) for a
 * document. Returns an empty string when the document has no `stem` attribute,
 * since there is no math to typeset.
 */
export function renderMathJax(
  stem: boolean,
  eqnums: string,
  nonce: string,
  resources: MathJaxResources,
): string {
  if (!stem) {
    return ''
  }
  const tags = eqnumsToTexTags(eqnums)
  return `<script nonce="${nonce}">
MathJax = {
  // AsciiMath is not part of any combined component, so load it on demand.
  loader: { load: ['input/asciimath'] },
  output: {
    fontPath: '${resources.fontBase}/%%FONT%%'
  },
  options: {
    // The MathJax context menu does not work in the sandboxed WebView.
    enableMenu: false,
    // MathJax 4 has a single document-level ignore class (the per-input
    // ignoreClass of tex2jax/asciimath2jax is gone), so combine both.
    ignoreHtmlClass: 'nostem|nolatexmath|noasciimath'
  },
  tex: {
    inlineMath: [['\\\\(', '\\\\)']],
    displayMath: [['\\\\[', '\\\\]']],
    tags: '${tags}'
  },
  asciimath: {
    delimiters: [['\\\\$', '\\\\$']]
  },
  startup: {
    ready() {
      // AsciiMath has no pre/post filters in MathJax 4, so we override compile()
      // to reproduce the MathJax 2 behaviour: Asciidoctor wraps both inline and
      // block AsciiMath in the same \\$…\\$ delimiters, so block math is only
      // distinguishable by its enclosing .stemblock element.
      const { AsciiMath } = MathJax._.input.asciimath_ts
      Object.assign(AsciiMath.prototype, {
        _compile: AsciiMath.prototype.compile,
        compile(math, document) {
          let el = math.start && math.start.node
          while (el && !(el.classList && el.classList.contains('stemblock'))) {
            el = el.parentNode
          }
          math.display = Boolean(el)
          const result = this._compile(math, document)
          const mstyle = result.childNodes[0].childNodes.pop()
          mstyle.childNodes.forEach((child) => result.appendChild(child))
          if (math.display) {
            result.attributes.set('display', 'block')
          }
          return result
        }
      })
      MathJax.startup.defaultReady()
    }
  }
}
</script>
<script src="${resources.scriptSrc}" nonce="${nonce}"></script>`
}
