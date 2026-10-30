import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  containsKrokiDiagram,
  krokiServerCspSource,
} from '../../features/preview/krokiDiagram.js'

describe('containsKrokiDiagram', () => {
  const positives: [string, string][] = [
    ['a plain diagram block', '= Doc\n\n[plantuml]\n....\na -> b\n....\n'],
    [
      'a diagram block with extra attributes',
      '[plantuml, diagram, svg]\n....\na -> b\n....\n',
    ],
    ['another diagram type', '[graphviz]\n----\ndigraph {}\n----\n'],
    ['a short diagram name', '[d2]\n----\nx -> y\n----\n'],
    ['a diagram with an id', '[erd#my-erd]\n----\n----\n'],
    ['a block macro form', 'plantuml::diagram.puml[]\n'],
    ['a block macro with attributes', 'graphviz::graph.dot[format=svg]\n'],
    [
      'a longer name that shares a prefix (vegalite vs vega)',
      '[vegalite]\n----\n{}\n----\n',
    ],
  ]
  for (const [label, source] of positives) {
    test(`detects ${label}`, () => {
      assert.equal(containsKrokiDiagram(source), true)
    })
  }

  const negatives: [string, string][] = [
    ['a document without diagrams', '= Doc\n\nSome *text* and a list.\n'],
    ['mermaid, which is always rendered', '[mermaid]\n....\ngraph TD;\n....\n'],
    [
      'a source block whose language is a diagram name',
      '[source,plantuml]\n----\na -> b\n----\n',
    ],
    [
      'a longer word merely starting with a name',
      '[plantumlish]\n----\n----\n',
    ],
    ['a diagram name used as a role', '[.plantuml]#styled#\n'],
    ['a diagram name mentioned in prose', 'You can use plantuml diagrams.\n'],
  ]
  for (const [label, source] of negatives) {
    test(`ignores ${label}`, () => {
      assert.equal(containsKrokiDiagram(source), false)
    })
  }
})

describe('krokiServerCspSource', () => {
  const valid: [string, string][] = [
    ['https://kroki.io', 'https://kroki.io'],
    ['HTTPS://Kroki.IO/', 'https://kroki.io'],
    ['http://localhost:8000', 'http://localhost:8000'],
    ['http://localhost:8000/kroki/', 'http://localhost:8000'],
    ['http://kroki_server:8000', 'http://kroki_server:8000'],
    ['http://192.168.1.10:8000', 'http://192.168.1.10:8000'],
    ['http://[::1]:8000', 'http://[::1]:8000'],
  ]
  for (const [serverUrl, expected] of valid) {
    test(`allows the origin of ${serverUrl}`, () => {
      assert.equal(krokiServerCspSource(serverUrl), expected)
    })
  }

  const invalid: [string, string | undefined][] = [
    ['no value', undefined],
    ['an empty value', ''],
    ['a value that is not a URL', 'not a url'],
    ['a URL without a scheme', 'localhost:8000'],
    ['a directive injection', "x; script-src 'unsafe-inline' *"],
    ['a directive injection after a URL', 'https://a; script-src *'],
    ['a semicolon in the host', 'https://a;script-src/'],
    ['an encoded semicolon in the host', 'https://a%3Bscript-src/'],
    ['a double quote in the host', 'https://a"b/'],
    ['a single quote in the host', "https://a'b/"],
    ['a comma in the host', 'https://a,b/'],
    ['the javascript scheme', 'javascript:alert(1)'],
    ['the data scheme', 'data:text/html,x'],
    ['the file scheme', 'file:///etc/passwd'],
  ]
  for (const [label, serverUrl] of invalid) {
    test(`rejects ${label}`, () => {
      assert.equal(krokiServerCspSource(serverUrl), undefined)
    })
  }
})
