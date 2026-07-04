/*
 * Detection of Kroki-renderable diagram blocks in an AsciiDoc source, kept free
 * of any `vscode` dependency so it can be unit-tested in isolation. Used to
 * surface a one-time hint that Kroki can render these diagrams when the Kroki
 * extension is disabled (asciidoctor/asciidoctor-vscode#480).
 */

// Diagram block styles / block-macro names registered by asciidoctor-kroki,
// minus `mermaid`, which the extension always renders through its own block
// processor (so enabling Kroki is not needed for it). Keep in sync with
// asciidoctor-kroki's list.
export const KROKI_DIAGRAM_NAMES = [
  'actdiag',
  'blockdiag',
  'bpmn',
  'bytefield',
  'c4plantuml',
  'd2',
  'dbml',
  'diagramsnet',
  'ditaa',
  'erd',
  'excalidraw',
  'goat',
  'graphviz',
  'nomnoml',
  'nwdiag',
  'packetdiag',
  'pikchr',
  'plantuml',
  'rackdiag',
  'seqdiag',
  'structurizr',
  'svgbob',
  'symbolator',
  'tikz',
  'umlet',
  'vega',
  'vegalite',
  'wavedrom',
  'wireviz',
]

// Longest names first so the alternation matches e.g. `vegalite` before `vega`
// (otherwise `[vegalite]` would be tested against `vega` first and, although it
// backtracks, keeping the order explicit is clearer).
const alternation = [...KROKI_DIAGRAM_NAMES]
  .sort((a, b) => b.length - a.length)
  .join('|')

// A diagram appears either as a block whose style is the diagram name, e.g.
//   [plantuml]
//   [plantuml, target, svg]
// or as a block macro, e.g.
//   plantuml::diagram.puml[]
// Both are anchored at the start of a line (multiline mode). The character
// class after the name in the block-style form guards against matching a longer
// word that merely starts with a diagram name (e.g. `[plantumlish]`).
const DIAGRAM_BLOCK_STYLE = new RegExp(
  `^\\[(?:${alternation})(?:[,#.\\]])`,
  'm',
)
const DIAGRAM_BLOCK_MACRO = new RegExp(`^(?:${alternation})::\\S*\\[`, 'm')

/**
 * Whether the AsciiDoc source contains at least one diagram block that Kroki
 * can render (Mermaid excluded, since it is always rendered). Deliberately a
 * cheap textual scan: it may occasionally match a diagram-looking line inside a
 * verbatim block, which is acceptable for a one-time discovery hint.
 */
export function containsKrokiDiagram(text: string): boolean {
  return DIAGRAM_BLOCK_STYLE.test(text) || DIAGRAM_BLOCK_MACRO.test(text)
}
