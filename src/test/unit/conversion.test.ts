// These tests run in plain Node, where `vscode` cannot be resolved: importing
// the conversion module also checks that it does not depend on the VS Code API,
// so that it can move to a worker thread (#1245).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { Extensions } from '@asciidoctor/core'
import {
  buildExportOptions,
  buildParseOptions,
  buildPreviewOptions,
  collectMessages,
  convert,
  type DocumentLocation,
  parse,
  parseHeader,
} from '../../features/asciidoctor/conversion.js'
import { ConversionTiming } from '../../lib/conversionTiming.js'

const location: DocumentLocation = {
  dirName: '/docs',
  fileName: 'index',
  filePath: '/docs/index.adoc',
  extensionName: '.adoc',
}

const header = {
  krokiServerUrl: 'https://kroki.io',
  dataUriEnabled: false,
}

describe('buildParseOptions', () => {
  test('sets the intrinsic attributes, but not base_dir', () => {
    const registry = Extensions.create()
    const options = buildParseOptions({
      attributes: { foo: 'bar' },
      location,
      registry,
    })
    assert.deepEqual(options, {
      attributes: {
        foo: 'bar',
        docdir: '/docs',
        docfile: '/docs/index.adoc',
        docname: 'index',
        docfilesuffix: '.adoc',
      },
      extension_registry: registry,
      sourcemap: true,
      safe: 'unsafe',
      parse: true,
    })
  })

  test('sets base_dir when the workspace root is the base directory', () => {
    const options = buildParseOptions({
      attributes: {},
      location: { ...location, baseDirOverride: '/workspace' },
      registry: Extensions.create(),
    })
    assert.equal(options.base_dir, '/workspace')
  })

  test('omits the attributes of the location unknown in the browser', () => {
    const options = buildParseOptions({
      attributes: {},
      location: { extensionName: '.adoc' },
      registry: Extensions.create(),
    })
    assert.deepEqual(options.attributes, { docfilesuffix: '.adoc' })
  })
})

describe('buildExportOptions', () => {
  test('sets the backend and the template directories', () => {
    const options = buildExportOptions({
      attributes: { 'source-highlighter': 'highlight.js' },
      backend: 'docbook5',
      location,
      templateDirs: ['/templates'],
      registry: Extensions.create(),
    })
    assert.equal(options.backend, 'docbook5')
    assert.deepEqual(options.template_dirs, ['/templates'])
    assert.equal(options.header_footer, true)
    assert.deepEqual(options.attributes, {
      'env-vscode': '',
      env: 'vscode',
      'source-highlighter': 'highlight.js',
      docdir: '/docs',
      docfile: '/docs/index.adoc',
    })
  })

  test('omits template_dirs when there is none', () => {
    const options = buildExportOptions({
      attributes: {},
      backend: 'html5',
      location,
      templateDirs: [],
      registry: Extensions.create(),
    })
    assert.equal('template_dirs' in options, false)
  })
})

describe('buildPreviewOptions', () => {
  function previewAttributes(
    input: Partial<Parameters<typeof buildPreviewOptions>[0]>,
  ) {
    return buildPreviewOptions({
      attributes: {},
      antoraAttributes: {},
      header,
      darkTheme: false,
      location,
      templateDirs: [],
      registry: Extensions.create(),
      ...input,
    }).attributes
  }

  test('converts with the webview backend and a source map', () => {
    const options = buildPreviewOptions({
      attributes: {},
      antoraAttributes: {},
      header,
      darkTheme: false,
      location,
      templateDirs: [],
      registry: Extensions.create(),
    })
    assert.equal(options.backend, 'webview-html5')
    assert.equal(options.sourcemap, true)
    assert.equal(options.attributes.filetype, 'html')
    assert.equal(options.attributes['!data-uri'], '')
  })

  test('exposes the color theme', () => {
    assert.equal(previewAttributes({ darkTheme: true })['vscode-theme'], 'dark')
    assert.equal(
      previewAttributes({ darkTheme: false })['vscode-theme'],
      'light',
    )
  })

  test('resolves any source highlighter to Highlight.js', () => {
    assert.equal(
      previewAttributes({ header: { ...header, sourceHighlighter: 'rouge' } })[
        'source-highlighter'
      ],
      'highlight.js',
    )
    assert.equal(
      previewAttributes({
        antoraAttributes: { 'source-highlighter': 'rouge' },
      })['source-highlighter'],
      'highlight.js',
    )
    assert.equal('source-highlighter' in previewAttributes({ header }), false)
  })

  test('asks asciidoctor-kroki for data URIs when data-uri is set', () => {
    assert.equal(
      previewAttributes({ header: { ...header, dataUriEnabled: true } })[
        'kroki-data-uri@'
      ],
      '',
    )
    assert.equal('kroki-data-uri@' in previewAttributes({ header }), false)
  })
})

describe('parseHeader', () => {
  test('reads the attributes the preview needs', async () => {
    const result = await parseHeader(
      '= Title\n:kroki-server-url: http://localhost:8000\n:data-uri:\n\nContent',
      {
        attributes: { 'source-highlighter': 'rouge' },
        registry: Extensions.create(),
      },
    )
    assert.deepEqual(result, {
      krokiServerUrl: 'http://localhost:8000',
      dataUriEnabled: true,
      sourceHighlighter: 'rouge',
    })
  })

  test('defaults to the public Kroki server', async () => {
    const result = await parseHeader('= Title\n\nContent', {
      attributes: {},
      registry: Extensions.create(),
    })
    assert.equal(result.krokiServerUrl, 'https://kroki.io')
    assert.equal(result.dataUriEnabled, false)
  })
})

describe('parse', () => {
  test('returns the messages logged during the parse as plain data', async () => {
    const { document, messages } = await parse(
      '= Title\n\n== Section\n\n= Another Level 0\n',
      { safe: 'unsafe', sourcemap: true },
    )
    assert.equal(document.getTitle(), 'Title')
    const message = messages.find((m) => m.text.includes('level 0 sections'))
    assert.ok(message, JSON.stringify(messages))
    assert.equal(message.severity, 'ERROR')
    assert.equal(message.location?.lineNumber, 5)
    // The messages must cross a thread boundary.
    assert.deepEqual(structuredClone(messages), messages)
  })

  test('keeps the messages of overlapping parses apart', async () => {
    const [withError, withoutError] = await Promise.all([
      parse('= Title\n\n== Section\n\n= Another Level 0\n', { safe: 'unsafe' }),
      parse('= Title\n\n== Section\n', { safe: 'unsafe' }),
    ])
    assert.ok(withError.messages.length > 0)
    assert.deepEqual(withoutError.messages, [])
  })
})

describe('convert', () => {
  test('converts the document', async () => {
    const { html } = await convert('Hello *world*', { safe: 'unsafe' })
    assert.match(html, /Hello <strong>world<\/strong>/)
    assert.doesNotMatch(html, /data-line-/)
  })

  test('annotates the blocks with their line and the hash of their source', async () => {
    const { html } = await convert(
      '= Title\n\nFirst paragraph.\n\nSecond paragraph.\n',
      { safe: 'unsafe', sourcemap: true },
      { annotate: true },
    )
    assert.match(html, /class="paragraph data-line-3 data-h-\w+"/)
    assert.match(html, /class="paragraph data-line-5 data-h-\w+"/)
  })
})

describe('timing', () => {
  test('records the phases of the conversion', async () => {
    let now = 0
    const timing = new ConversionTiming(() => now++)
    await convert(
      'Hello',
      { safe: 'unsafe', sourcemap: true },
      {
        annotate: true,
        timing,
      },
    )
    assert.match(
      timing.format('Converted', 'file:///a.adoc', 'Hello'),
      /\(load: 1 ms, annotate: 1 ms, convert: 1 ms\)$/,
    )
  })

  test('records the load phase of the parse', async () => {
    let now = 0
    const timing = new ConversionTiming(() => now++)
    await parse('Hello', { safe: 'unsafe' }, { timing })
    assert.match(
      timing.format('Parsed', 'file:///a.adoc', 'Hello'),
      /\(load: 1 ms\)$/,
    )
  })
})

describe('collectMessages', () => {
  // An extension can log a message whose `getText()` does not return a string
  // (asciidoctor-kroki historically logged an object payload when a diagram
  // failed to render). A non-string `Diagnostic.message` makes VS Code throw
  // "message.replace is not a function" while rendering the marker.
  test('coerces the text of a message to a string', () => {
    const messages = collectMessages({
      getMessages: () => [
        {
          getSeverity: () => 'ERROR',
          getText: () => ({ some: 'object' }),
          getSourceLocation: (): undefined => undefined,
        },
        {
          getSeverity: () => 'WARN',
          getText: (): undefined => undefined,
          getSourceLocation: (): undefined => undefined,
        },
      ],
    })
    assert.deepEqual(messages, [
      { severity: 'ERROR', text: '[object Object]' },
      { severity: 'WARN', text: '' },
    ])
  })
})
