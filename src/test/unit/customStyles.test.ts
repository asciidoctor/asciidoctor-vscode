import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildCustomStyleSheetLinks } from '../../features/preview/customStyles.js'

// A predictable stand-in for the converter's `fixHref`: prefix the path so we
// can tell the resolved `href` apart from the original `data-source`.
const resolveHref = (stylePath: string) => `resolved:${stylePath}`

describe('buildCustomStyleSheetLinks', () => {
  test('returns nothing when there is no custom or additional style', () => {
    assert.equal(buildCustomStyleSheetLinks('', [], resolveHref), '')
  })

  test('emits a single link for `preview.style` (replaces the default)', () => {
    const html = buildCustomStyleSheetLinks('./theme.css', [], resolveHref)
    assert.equal(html.match(/<link/g)?.length, 1)
    assert.ok(html.includes('data-source="./theme.css"'), html)
    assert.ok(html.includes('href="resolved:./theme.css"'), html)
  })

  test('emits additional styles even when no `preview.style` is set (additive on top of the default base)', () => {
    const html = buildCustomStyleSheetLinks(
      '',
      ['./a.css', './b.css'],
      resolveHref,
    )
    assert.equal(html.match(/<link/g)?.length, 2)
    assert.ok(html.includes('data-source="./a.css"'), html)
    assert.ok(html.includes('data-source="./b.css"'), html)
  })

  test('layers additional styles AFTER `preview.style` so they win the cascade', () => {
    const html = buildCustomStyleSheetLinks(
      './theme.css',
      ['./override.css'],
      resolveHref,
    )
    assert.ok(
      html.indexOf('./theme.css') < html.indexOf('./override.css'),
      `additional style must come after preview.style:\n${html}`,
    )
  })

  test('preserves the order of additional styles', () => {
    const html = buildCustomStyleSheetLinks(
      '',
      ['./first.css', './second.css', './third.css'],
      resolveHref,
    )
    assert.ok(
      html.indexOf('./first.css') < html.indexOf('./second.css') &&
        html.indexOf('./second.css') < html.indexOf('./third.css'),
      html,
    )
  })

  test('escapes double quotes in the data-source attribute', () => {
    const html = buildCustomStyleSheetLinks(
      '',
      ['./a".css'],
      (p) => `resolved:${p}`,
    )
    assert.ok(html.includes('data-source="./a&quot;.css"'), html)
  })
})
