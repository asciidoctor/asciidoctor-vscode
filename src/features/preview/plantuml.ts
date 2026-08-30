import type {
  AbstractBlock,
  BlockProcessorDslInterface,
  Reader,
} from '@asciidoctor/core'

const SAFE_MODE_SECURE = 20
const BUILTIN_ATTRIBUTES = new Set([
  'target',
  'width',
  'height',
  'format',
  'fallback',
  'link',
  'float',
  'align',
  'role',
  'title',
  'caption',
  'cloaked-context',
  '$positional',
  'subs',
  'opts',
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    )
  }
  return btoa(binary)
}

function decodeBase64(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8')
  }
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export const PLANTUML_SOURCE_DATA_URI_PREFIX =
  'data:application/vnd.asciidoctor-vscode.plantuml+json;base64,'

interface EncodedPlantUmlDiagram {
  source: string
  targetId: string
  format: string
  options: Record<string, string>
  role: string
  option?: string
}

export function encodePlantUmlDiagram(diagram: EncodedPlantUmlDiagram): string {
  return `${PLANTUML_SOURCE_DATA_URI_PREFIX}${encodeBase64(JSON.stringify(diagram))}`
}

export function decodePlantUmlDiagram(
  target: unknown,
): EncodedPlantUmlDiagram | undefined {
  if (
    typeof target !== 'string' ||
    !target.startsWith(PLANTUML_SOURCE_DATA_URI_PREFIX)
  ) {
    return undefined
  }
  try {
    const decoded = JSON.parse(
      decodeBase64(target.slice(PLANTUML_SOURCE_DATA_URI_PREFIX.length)),
    ) as Partial<EncodedPlantUmlDiagram>
    if (
      typeof decoded.source !== 'string' ||
      typeof decoded.targetId !== 'string' ||
      typeof decoded.format !== 'string' ||
      typeof decoded.role !== 'string' ||
      decoded.options === undefined ||
      typeof decoded.options !== 'object'
    ) {
      return undefined
    }
    return {
      source: decoded.source,
      targetId: decoded.targetId,
      format: decoded.format,
      options: decoded.options as Record<string, string>,
      role: decoded.role,
      option: typeof decoded.option === 'string' ? decoded.option : undefined,
    }
  } catch {
    return undefined
  }
}

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value)
}

function optionFrom(
  attrs: Record<string, unknown>,
  doc: any,
): string | undefined {
  for (const option of ['inline', 'interactive', 'none']) {
    if (attrs[`${option}-option`] === '') {
      return option
    }
  }
  return doc.getAttribute('kroki-default-options')
}

function krokiRole(attrs: Record<string, unknown>, format: string): string {
  const role = typeof attrs.role === 'string' ? attrs.role : ''
  const krokiRoles = `kroki-format-${format} kroki`
  return role ? `${role} ${krokiRoles}` : 'kroki'
}

function userOptions(attrs: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attrs).filter(
      ([key]) =>
        !key.endsWith('-option') &&
        !BUILTIN_ATTRIBUTES.has(key) &&
        !isNumeric(key),
    ),
  ) as Record<string, string>
}

// Modeled as an Asciidoctor image block for the same reason as Mermaid:
// titles/captions then flow through the normal image/figure pipeline and tree
// processors can rewrite them just like Kroki-rendered diagrams.
export function plantumlJSProcessor() {
  let diagramSequence = 0
  return function (this: BlockProcessorDslInterface) {
    this.onContext(['listing', 'literal'])
    this.positionalAttributes('target', 'format')
    ;(this as any).process(
      async (
        parent: AbstractBlock,
        reader: Reader,
        attrs: Record<string, unknown>,
      ) => {
        const doc = parent.getDocument() as any
        const title = typeof attrs.title === 'string' ? attrs.title : undefined
        const caption =
          typeof attrs.caption === 'string' ? attrs.caption : undefined
        const blockId = typeof attrs.id === 'string' ? attrs.id : undefined
        const id = `plantuml-${++diagramSequence}`
        let diagramText = reader.getString()
        if (attrs.subs) {
          diagramText = await (parent as any).applySubs(
            diagramText,
            (parent as any).resolveSubs(attrs.subs),
          )
        }
        if (doc.getSafe() < SAFE_MODE_SECURE) {
          const plantUmlIncludeFile = doc.getAttribute('kroki-plantuml-include')
          if (plantUmlIncludeFile) {
            diagramText = `!include ${plantUmlIncludeFile}\n${diagramText}`
          }
        }
        const format = String(
          attrs.format || doc.getAttribute('kroki-default-format') || 'svg',
        )
        const role = krokiRole(attrs, format)
        const blockAttrs = { ...attrs }
        blockAttrs.role = role
        blockAttrs.target = encodePlantUmlDiagram({
          source: diagramText,
          targetId: id,
          format,
          options: userOptions(attrs),
          role,
          option: optionFrom(attrs, doc),
        })
        blockAttrs.alt = title || 'PlantUML diagram'
        delete blockAttrs.title
        delete blockAttrs.caption
        delete blockAttrs.format
        delete blockAttrs.opts
        delete blockAttrs['inline-option']
        delete blockAttrs['interactive-option']
        delete blockAttrs['none-option']
        const block = (this as any).createImageBlock(parent, blockAttrs)
        if (title) {
          block.title = title
        }
        if (blockId) {
          block.id = blockId
        }
        block.assignCaption(caption, 'figure')
        return block
      },
    )
  }
}

export function plantUmlDiagramToHtml(diagram: EncodedPlantUmlDiagram): string {
  const classes = ['plantuml', ...diagram.role.split(/\s+/)]
  if (diagram.option && diagram.option !== 'none') {
    classes.push(`${diagram.option}-option`)
  }
  return `<div class='${escapeAttribute(classes.join(' '))}' data-plantuml-target='${escapeAttribute(diagram.targetId)}' data-plantuml-format='${escapeAttribute(diagram.format)}' data-plantuml-options='${escapeAttribute(JSON.stringify(diagram.options))}'><pre class='plantuml-source' hidden>${escapeHtml(diagram.source)}</pre><div id='${escapeAttribute(diagram.targetId)}' class='plantuml-target'></div></div>`
}

// Assumes @plantuml/core's `render` function is in scope where this is inlined.
export function plantUmlClientRenderScript(): string {
  return `
    const waitForPlantUmlSvg = (target) => new Promise((resolve) => {
      if (target.querySelector('svg')) {
        resolve();
        return;
      }
      const observer = new MutationObserver(() => {
        if (target.querySelector('svg')) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(target, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 10000);
    });
    const normalizePlantUmlLines = (source) => {
      const lines = source.split(/\\r\\n|\\r|\\n/);
      if (lines.some((line) => /^\\s*@start\\w*/.test(line))) {
        return lines;
      }
      return ['@startuml', ...lines, '@enduml'];
    };
    async function renderPlantUmlDiagrams(nodes, renderOptions) {
      const plantumlNodes = new Set();
      for (const node of nodes) {
        if (node.matches?.('.plantuml')) {
          plantumlNodes.add(node);
        }
        node
          .querySelectorAll?.('.plantuml')
          .forEach((plantumlNode) => plantumlNodes.add(plantumlNode));
      }
      for (const node of plantumlNodes) {
        const source = node.querySelector('.plantuml-source');
        const target = node.querySelector('.plantuml-target');
        if (!source || !target || !target.id) {
          continue;
        }
        target.textContent = '';
        try {
          render(normalizePlantUmlLines(source.textContent || ''), target.id, renderOptions);
          await waitForPlantUmlSvg(target);
        } catch (e) {
          console.error('PlantUML rendering failed', e);
        }
      }
    }
  `
}
