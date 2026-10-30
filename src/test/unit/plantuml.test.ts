import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import vm from 'node:vm'
import { convert, Extensions } from '@asciidoctor/core'
import {
  encodePlantUmlSource,
  PLANTUML_SOURCE_DATA_URI_PREFIX,
  plantUmlClientRenderScript,
  plantUmlEngineLoaderScript,
  plantumlJSProcessor,
} from '../../features/preview/plantuml.js'

function decodePlantUmlSource(html: string): string {
  const match = html.match(
    /src="data:text\/vnd\.plantuml;base64,([A-Za-z0-9+/=]+)"/,
  )
  assert.ok(match, `expected a PlantUML image in:\n${html}`)
  return Buffer.from(match[1], 'base64').toString('utf8')
}

async function convertWithPlantUml(
  input: string,
  options: Record<string, unknown> = {},
): Promise<string> {
  const registry = Extensions.create()
  registry.block('plantuml', plantumlJSProcessor())
  const output = await convert(input, {
    extension_registry: registry,
    safe: 'safe',
    ...options,
  })
  return String(output)
}

describe('plantumlJSProcessor', () => {
  test('models a [plantuml] listing block as an image block', async () => {
    const html = await convertWithPlantUml(
      '[plantuml]\n----\n@startuml\nAlice -> Bob : é\n@enduml\n----',
    )
    assert.match(html, /<div class="imageblock plantumlblock">/)
    assert.match(html, /alt="PlantUML diagram"/)
    assert.equal(
      decodePlantUmlSource(html),
      '@startuml\nAlice -> Bob : é\n@enduml',
    )
  })

  test('handles a [plantuml] literal block', async () => {
    const html = await convertWithPlantUml('[plantuml]\n....\nBob -> Al\n....')
    assert.match(html, /imageblock plantumlblock/)
  })

  test('adds the missing @startuml and @enduml', async () => {
    const html = await convertWithPlantUml(
      '[plantuml]\n----\nAlice -> Bob\n----',
    )
    assert.equal(decodePlantUmlSource(html), '@startuml\nAlice -> Bob\n@enduml')
  })

  test('keeps another @start directive', async () => {
    const html = await convertWithPlantUml(
      '[plantuml]\n----\n@startmindmap\n* root\n@endmindmap\n----',
    )
    assert.equal(
      decodePlantUmlSource(html),
      '@startmindmap\n* root\n@endmindmap',
    )
  })

  test('numbers the title like a figure', async () => {
    const html = await convertWithPlantUml(
      '.First\n[plantuml]\n----\nA -> B\n----\n\n.Second\n[plantuml]\n----\nB -> A\n----',
    )
    assert.match(
      html,
      /<div class="title">Figure 1\. First<\/div>[\s\S]*<div class="title">Figure 2\. Second<\/div>/,
    )
  })

  test('honors an explicit caption', async () => {
    const html = await convertWithPlantUml(
      '[caption="Diagram: "]\n.Login\n[plantuml]\n----\nA -> B\n----',
    )
    assert.match(html, /<div class="title">Diagram: Login<\/div>/)
  })

  test('keeps the id, the role, the link and the size of the image', async () => {
    const html = await convertWithPlantUml(
      '[plantuml,id=flow,role=wide,link=https://example.org,width=200]\n----\nA -> B\n----',
    )
    assert.match(html, /<div id="flow" class="imageblock plantumlblock wide">/)
    assert.match(html, /<a class="image" href="https:\/\/example\.org"><img /)
    assert.match(html, /width="200"/)
  })

  test('accepts the positional target and format of a block written for Kroki', async () => {
    const html = await convertWithPlantUml(
      '[plantuml, sequence, png]\n----\nA -> B\n----',
    )
    assert.equal(decodePlantUmlSource(html), '@startuml\nA -> B\n@enduml')
  })

  test('applies subs', async () => {
    const html = await convertWithPlantUml(
      '[plantuml,subs=attributes]\n----\nAlice -> {receiver}\n----',
      { attributes: { receiver: 'Bob' } },
    )
    assert.equal(decodePlantUmlSource(html), '@startuml\nAlice -> Bob\n@enduml')
  })

  test('keeps the source as a titled listing with the DocBook backend', async () => {
    const xml = await convertWithPlantUml(
      '.Login\n[plantuml]\n----\nAlice -> Bob\n----',
      { backend: 'docbook5' },
    )
    assert.match(xml, /Alice -&gt; Bob/)
    assert.match(xml, /<title>Login<\/title>/)
    assert.doesNotMatch(xml, /vnd\.plantuml/)
  })

  test('does not touch listing blocks that are not plantuml', async () => {
    const html = await convertWithPlantUml('----\nplain listing\n----')
    assert.doesNotMatch(html, /plantumlblock/)
    assert.match(html, /plain listing/)
  })
})

// A minimal DOM, enough to run the client-side script against a fake engine.
class FakeImage {
  isConnected = true
  replacedBy: any
  constructor(public src: string) {}
  getAttribute(name: string) {
    return name === 'src' ? this.src : null
  }
  matches() {
    return true
  }
  replaceWith(element: any) {
    this.replacedBy = element
  }
}

function clientRenderer(engine: unknown) {
  const context = {
    atob,
    TextDecoder,
    Uint8Array,
    setTimeout,
    clearTimeout,
    console: { error: () => undefined },
    loadPlantUmlEngine: async () => engine,
    document: {
      createElement: () => ({
        querySelector: () => null,
        children: [] as unknown[],
        appendChild(child: unknown) {
          this.children.push(child)
        },
      }),
    },
  }
  return vm.runInNewContext(
    `${plantUmlClientRenderScript()}; renderPlantUmlImages`,
    context,
  )
}

describe('plantUmlEngineLoaderScript', () => {
  test('loads Graphviz once, then the engine', async () => {
    const scripts: any[] = []
    const engine = { renderToString: true }
    const context = {
      document: {
        createElement: () => ({}),
        head: {
          appendChild(script: any) {
            scripts.push(script)
            script.onload()
          },
        },
      },
    }
    // Dynamic imports need a host hook in a vm context: only the Graphviz part
    // and the syntax of the script run for real here.
    const load = vm.runInNewContext(
      `${plantUmlEngineLoaderScript(
        'https://cdn/viz.js',
        'https://cdn/core.js',
      ).replace(
        /import\("https:\/\/cdn\/core\.js"\)/,
        'engine',
      )}; loadPlantUmlEngine`,
      { ...context, engine },
    )
    assert.equal(await load(), engine)
    assert.equal(await load(), engine)
    assert.equal(scripts.length, 1)
    assert.equal(scripts[0].src, 'https://cdn/viz.js')
  })
})

describe('plantUmlClientRenderScript', () => {
  const image = (source: string) => new FakeImage(encodePlantUmlSource(source))
  const echoEngine = (log: string[] = []) => ({
    renderToString(lines: string[], ok: (svg: string) => void) {
      log.push(`start ${lines[0]}`)
      setTimeout(() => {
        log.push(`end ${lines[0]}`)
        ok(`<svg>${lines[0]}</svg>`)
      }, 1)
    },
  })

  test('uses the expected data URI prefix', () => {
    assert.match(
      plantUmlClientRenderScript(),
      new RegExp(PLANTUML_SOURCE_DATA_URI_PREFIX.replace(/[.+]/g, '\\$&')),
    )
  })

  test('swaps the image for the SVG', async () => {
    const img = image('a\nb')
    const rendered = await clientRenderer(echoEngine())([img])
    assert.equal(rendered, 1)
    assert.equal(img.replacedBy.innerHTML, '<svg>a</svg>')
  })

  test('never runs two renders at once, even across calls', async () => {
    const log: string[] = []
    const render = clientRenderer(echoEngine(log))
    await Promise.all([render([image('a')]), render([image('b')])])
    assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b'])
  })

  test('shows the error of the engine and renders the next diagrams', async () => {
    const failing = image('bad')
    const next = image('good')
    const engine = {
      renderToString(
        lines: string[],
        ok: (svg: string) => void,
        ko: (message: string) => void,
      ) {
        lines[0] === 'bad' ? ko('Syntax error') : ok('<svg></svg>')
      },
    }
    await clientRenderer(engine)([failing, next])
    assert.equal(failing.replacedBy.children[0].textContent, 'Syntax error')
    assert.equal(next.replacedBy.innerHTML, '<svg></svg>')
  })

  test('skips an image removed before its turn', async () => {
    const img = image('a')
    img.isConnected = false
    assert.equal(await clientRenderer(echoEngine())([img]), 0)
    assert.equal(img.replacedBy, undefined)
  })

  test('drops a result whose image source changed meanwhile', async () => {
    const img = image('old')
    const engine = {
      renderToString(_lines: string[], ok: (svg: string) => void) {
        img.src = encodePlantUmlSource('new')
        ok('<svg></svg>')
      },
    }
    await clientRenderer(engine)([img])
    assert.equal(img.replacedBy, undefined)
  })
})
