import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import {
  addPlantUmlToHtmlExport,
  PLANTUML_CORE_VERSION,
} from '../../features/asciidoctor/plantumlExport.js'
import { encodePlantUmlSource } from '../../features/preview/plantuml.js'

const CDN_BASE = `https://cdn.jsdelivr.net/npm/@plantuml/core@${PLANTUML_CORE_VERSION}`
const image = `<img src="${encodePlantUmlSource('Alice -> Bob')}" alt="PlantUML diagram">`

describe('addPlantUmlToHtmlExport', () => {
  test('uses the bundled version', () => {
    const { devDependencies } = JSON.parse(readFileSync('package.json', 'utf8'))
    assert.equal(devDependencies['@plantuml/core'], `^${PLANTUML_CORE_VERSION}`)
  })

  test('does nothing when the HTML has no PlantUML block', () => {
    const html = '<html><body><p>Some content</p></body></html>'
    assert.equal(addPlantUmlToHtmlExport(html), html)
  })

  test('injects the CDN renderer before the end of the body', () => {
    const result = addPlantUmlToHtmlExport(`<html><body>${image}</body></html>`)
    assert.ok(result.includes(`"${CDN_BASE}/viz-global.js"`))
    assert.ok(result.includes(`import("${CDN_BASE}/plantuml.js")`))
    assert.match(result, /renderPlantUmlImages\(\[document\.body\]\);/)
    assert.ok(result.indexOf('<script') < result.indexOf('</body>'))
  })

  test('is idempotent', () => {
    const once = addPlantUmlToHtmlExport(`<html><body>${image}</body></html>`)
    assert.equal(addPlantUmlToHtmlExport(once), once)
  })

  test('appends the renderer when the HTML has no body element', () => {
    const result = addPlantUmlToHtmlExport(`<main>${image}</main>`)
    assert.match(result, /<\/main>\n<script type="module">/)
  })
})
