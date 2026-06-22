import * as vscode from 'vscode'
import type { AntoraResourceContext } from './antoraContext.js'
import { getAntoraDocumentContext } from './antoraDocument.js'

// Matches a macro and the resource id typed so far, anchored at the cursor, e.g.
// `image::ui:but` while completing `image::ui:button.png[]`.
const MACRO_PREFIX_RX = /\b(image|xref|include)(::?)([^\s[\]]*)$/

interface MacroCompletionContext {
  macro: 'image' | 'xref' | 'include'
  /** The families to suggest for this macro. */
  families: string[]
  /** The default family of the macro (omitted from the generated ids). */
  defaultFamily: string
  /** Column where the resource id starts on the current line. */
  targetStart: number
}

const MACRO_SETTINGS: {
  [macro: string]: { families: string[]; defaultFamily: string }
} = {
  image: { families: ['image'], defaultFamily: 'image' },
  xref: { families: ['page'], defaultFamily: 'page' },
  include: { families: ['partial', 'example', 'page'], defaultFamily: 'page' },
}

const KIND_BY_FAMILY: { [family: string]: vscode.CompletionItemKind } = {
  image: vscode.CompletionItemKind.File,
  page: vscode.CompletionItemKind.Reference,
  partial: vscode.CompletionItemKind.Reference,
  example: vscode.CompletionItemKind.Reference,
}

export function findAntoraResourceMacroPrefix(
  lineTextBeforeCursor: string,
): MacroCompletionContext | undefined {
  const match = MACRO_PREFIX_RX.exec(lineTextBeforeCursor)
  if (match === null) {
    return undefined
  }
  const macro = match[1] as 'image' | 'xref' | 'include'
  const settings = MACRO_SETTINGS[macro]
  return {
    macro,
    families: settings.families,
    defaultFamily: settings.defaultFamily,
    targetStart: match.index + match[1].length + match[2].length,
  }
}

/**
 * Build the shortest resource id that unambiguously points at `target` from the
 * `current` page context, following Antora's resource id coordinates
 * `version@component:module:family$relative`.
 */
export function buildResourceId(
  target: {
    component: string
    version: string
    module: string
    family: string
    relative: string
  },
  current: AntoraResourceContext,
  defaultFamily: string,
): string {
  let needComponent = target.component !== current.component
  const needVersion = target.version !== current.version
  if (needVersion) {
    needComponent = true
  }
  const needModule = target.module !== current.module || needComponent
  const needFamily = target.family !== defaultFamily

  let id = target.relative
  if (needFamily) {
    id = `${target.family}$${id}`
  }
  if (needModule) {
    // The ROOT module is referenced with an empty module segment.
    const moduleSegment = target.module === 'ROOT' ? '' : target.module
    id = `${moduleSegment}:${id}`
  }
  if (needComponent) {
    id = `${target.component}:${id}`
    if (needVersion && target.version) {
      id = `${target.version}@${id}`
    }
  }
  return id
}

/**
 * Suggest Antora resource ids (pages, images, partials, examples) inside
 * `image:`, `xref:` and `include::` macros, sourced from the content catalog.
 */
export class AntoraResourceCompletionProvider
  implements vscode.CompletionItemProvider
{
  constructor(private readonly workspaceState: vscode.Memento) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const lineTextBeforeCursor = document
      .lineAt(position.line)
      .text.slice(0, position.character)
    const macroContext = findAntoraResourceMacroPrefix(lineTextBeforeCursor)
    if (macroContext === undefined) {
      return []
    }
    const antoraDocumentContext = await getAntoraDocumentContext(
      document.uri,
      this.workspaceState,
    )
    if (antoraDocumentContext === undefined) {
      return []
    }
    const current = antoraDocumentContext.resourceContext
    const contentCatalog = antoraDocumentContext.getContentCatalog()
    const replaceRange = new vscode.Range(
      new vscode.Position(position.line, macroContext.targetStart),
      position,
    )
    const items: vscode.CompletionItem[] = []
    for (const family of macroContext.families) {
      for (const resource of contentCatalog.findBy({ family })) {
        const src = resource.src
        const id = buildResourceId(src, current, macroContext.defaultFamily)
        const item = new vscode.CompletionItem(
          id,
          KIND_BY_FAMILY[family] ?? vscode.CompletionItemKind.Reference,
        )
        item.detail = `${family} · ${src.component} ${src.version ?? ''}`.trim()
        item.range = replaceRange
        items.push(item)
      }
    }
    return items
  }
}
