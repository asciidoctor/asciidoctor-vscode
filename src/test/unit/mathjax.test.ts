import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  eqnumsToTexTags,
  renderMathJax,
} from '../../features/preview/mathjax.js'

const resources = {
  scriptSrc: 'media/mathjax/tex-mml-chtml-mathjax-newcm.js',
  fontBase: 'media/mathjax/output/fonts',
}

describe('eqnumsToTexTags', () => {
  test('maps an unset eqnums (default "none") to "none"', () => {
    assert.equal(eqnumsToTexTags('none'), 'none')
  })

  test('maps a bare ":eqnums:" (empty value) to AMS auto-numbering', () => {
    assert.equal(eqnumsToTexTags(''), 'ams')
    assert.equal(eqnumsToTexTags('   '), 'ams')
  })

  test('lower-cases "AMS" to the MathJax 4 "ams" tag', () => {
    assert.equal(eqnumsToTexTags('AMS'), 'ams')
  })

  test('passes "all" through', () => {
    assert.equal(eqnumsToTexTags('all'), 'all')
  })
})

describe('renderMathJax', () => {
  test('returns nothing when the document has no stem attribute', () => {
    assert.equal(renderMathJax(false, 'none', 'NONCE', resources), '')
  })

  test('loads the bundled combined component with the request nonce', () => {
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(
      html.includes(
        '<script src="media/mathjax/tex-mml-chtml-mathjax-newcm.js" nonce="NONCE"></script>',
      ),
      html,
    )
    assert.ok(html.includes('<script nonce="NONCE">'), html)
  })

  test('lazy-loads AsciiMath, which is in no combined component', () => {
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(html.includes("loader: { load: ['input/asciimath'] }"), html)
  })

  test('serves the CommonHTML font locally via fontPath (not the CDN)', () => {
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(
      html.includes("fontPath: 'media/mathjax/output/fonts/%%FONT%%'"),
      html,
    )
    assert.ok(!html.includes('cdn.jsdelivr'), html)
  })

  test('configures the LaTeX and AsciiMath delimiters Asciidoctor emits', () => {
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(html.includes("inlineMath: [['\\\\(', '\\\\)']]"), html)
    assert.ok(html.includes("displayMath: [['\\\\[', '\\\\]']]"), html)
    assert.ok(html.includes("delimiters: [['\\\\$', '\\\\$']]"), html)
  })

  test('disables the menu and combines the per-input ignore classes', () => {
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(html.includes('enableMenu: false'), html)
    assert.ok(
      html.includes("ignoreHtmlClass: 'nostem|nolatexmath|noasciimath'"),
      html,
    )
  })

  test('turns off processEscapes so AsciiMath keeps its \\$ delimiters', () => {
    // With processEscapes on (the MathJax 4 default), TeX rewrites Asciidoctor's
    // `\$…\$` delimiters into `<span>$</span>`, leaving a stray `$` around every
    // formula.
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(html.includes('processEscapes: false'), html)
  })

  test('disables the SRE speech/braille/enrichment a11y tooling', () => {
    // The speech web worker is not bundled; leaving it on stalls the document
    // ready promise and freezes incremental typesetting until a full reload.
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(html.includes('enrich: false'), html)
    assert.ok(html.includes('speech: false'), html)
    assert.ok(html.includes('braille: false'), html)
    assert.ok(html.includes('assistiveMml: false'), html)
  })

  test('overrides AsciiMath compile() to render .stemblock math as display', () => {
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    assert.ok(html.includes('MathJax._.input.asciimath_ts'), html)
    assert.ok(html.includes("classList.contains('stemblock')"), html)
    assert.ok(html.includes("result.attributes.set('display', 'block')"), html)
  })

  test('reflects the eqnums attribute in tex.tags', () => {
    assert.ok(
      renderMathJax(true, 'none', 'NONCE', resources).includes("tags: 'none'"),
    )
    assert.ok(
      renderMathJax(true, 'all', 'NONCE', resources).includes("tags: 'all'"),
    )
    assert.ok(
      renderMathJax(true, 'AMS', 'NONCE', resources).includes("tags: 'ams'"),
    )
    assert.ok(
      renderMathJax(true, '', 'NONCE', resources).includes("tags: 'ams'"),
    )
  })

  test('uses the MathJax 4 API, not the removed MathJax 2 one', () => {
    // Tokens that can only come from actual MathJax 2 wiring (the prose comments
    // do mention tex2jax/asciimath2jax, so those names are not regression
    // markers).
    const html = renderMathJax(true, 'none', 'NONCE', resources)
    for (const v2Token of [
      'MathJax.Hub',
      'MathJax.js',
      'config=TeX-MML-AM',
      'showMathMenu',
      'messageStyle',
      'equationNumbers',
    ]) {
      assert.ok(
        !html.includes(v2Token),
        `unexpected MathJax 2 token: ${v2Token}`,
      )
    }
  })
})
