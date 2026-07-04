import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { containsKrokiDiagram } from '../../features/preview/krokiDiagram.js'

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
