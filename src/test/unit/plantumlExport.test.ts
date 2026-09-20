import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  addPlantUmlToHtmlExport,
  restorePlantUmlImageBlocks,
} from '../../features/asciidoctor/plantumlExport.js'
import { encodePlantUmlDiagram } from '../../features/preview/plantuml.js'

const PLANTUML_CORE_VERSION = '1.2026.7'
const PLANTUML_CDN_BASE = `https://cdn.jsdelivr.net/npm/@plantuml/core@${PLANTUML_CORE_VERSION}`
const plantumlBlock =
  "<div class='plantuml kroki'><pre class='plantuml-source' hidden>Alice -&gt; Bob</pre><div id='plantuml-1' class='plantuml-target'></div></div>"

describe('addPlantUmlToHtmlExport', () => {
  test('restores PlantUML image blocks before adding the export renderer', () => {
    const target = encodePlantUmlDiagram({
      source: 'Alice -> Bob',
      targetId: 'plantuml-7',
      format: 'png',
      options: { theme: 'sketchy' },
      role: 'wide kroki-format-png kroki',
      option: 'inline',
    })
    const html = `<div class="imageblock wide kroki-format-png kroki">
<div class="content">
<img src="${target}" alt="Login flow">
</div>
<div class="title">Diagram 7. Login flow</div>
</div>`

    const restored = restorePlantUmlImageBlocks(html)

    assert.match(restored, /class='plantuml wide kroki-format-png kroki/)
    assert.match(restored, /inline-option/)
    assert.match(restored, /data-plantuml-format='png'/)
    assert.match(restored, /data-plantuml-options='\{"theme":"sketchy"\}'/)
    assert.match(
      restored,
      /<pre class='plantuml-source' hidden>Alice -&gt; Bob/,
    )
    assert.match(restored, /<div class="title">Diagram 7\. Login flow<\/div>/)
  })

  test('adds the PlantUML CDN renderer when exported HTML contains a PlantUML block', () => {
    const html = `<html><body>${plantumlBlock}</body></html>`
    const result = addPlantUmlToHtmlExport(html)
    assert.match(result, new RegExp(`${PLANTUML_CDN_BASE}/viz-global\\.js`))
    assert.match(
      result,
      new RegExp(
        `import \\{ render \\} from '${PLANTUML_CDN_BASE}/plantuml\\.js';`,
      ),
    )
    assert.match(result, /normalizePlantUmlLines/)
    assert.match(result, /renderPlantUmlDiagrams\(\[document\.body\]\);/)
    assert.ok(result.indexOf('<script src=') < result.indexOf('</body>'))
  })

  test('wraps source without an explicit @start directive before rendering', () => {
    const result = addPlantUmlToHtmlExport(`<body>${plantumlBlock}</body>`)
    assert.match(result, /return \['@startuml', \.\.\.lines, '@enduml'\];/)
  })

  test('does not add the renderer when there is no PlantUML block', () => {
    const html =
      '<html><body><div class="not-plantuml">text</div></body></html>'
    assert.equal(addPlantUmlToHtmlExport(html), html)
  })

  test('does not add the renderer twice', () => {
    const html = `<html><body>${plantumlBlock}</body></html>`
    const once = addPlantUmlToHtmlExport(html)
    const twice = addPlantUmlToHtmlExport(once)
    assert.equal(twice, once)
  })

  test('appends the renderer when exported HTML has no body element', () => {
    const html = `<main>${plantumlBlock}</main>`
    const result = addPlantUmlToHtmlExport(html)
    assert.match(result, /<\/main>\n<script src=/)
  })
})
