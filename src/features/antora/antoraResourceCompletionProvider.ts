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
 * Build every valid resource id that points at `target` from the `current` page
 * context, following Antora's resource id coordinates
 * `version@component:module:family$relative`, from the shortest unambiguous form
 * to the fully qualified one. For example, an image of the same module yields
 * `seaswell.png`, `commands:seaswell.png`, `cli:commands:seaswell.png` and
 * `2.0@cli:commands:seaswell.png`.
 */
export function buildResourceIds(
  target: {
    component: string
    version: string
    module: string
    family: string
    relative: string
  },
  current: AntoraResourceContext,
  defaultFamily: string,
): string[] {
  const familyPrefix =
    target.family === defaultFamily ? '' : `${target.family}$`
  const relative = `${familyPrefix}${target.relative}`
  // The ROOT module is referenced with an empty module segment.
  const moduleSegment = target.module === 'ROOT' ? '' : target.module
  const sameComponent = target.component === current.component
  const sameVersion = target.version === current.version
  const sameModule = target.module === current.module

  const ids: string[] = []
  // Shortest: just the relative path, valid within the same module.
  if (sameComponent && sameVersion && sameModule) {
    ids.push(relative)
  }
  // Module-qualified, valid within the same component and version.
  if (sameComponent && sameVersion && (!sameModule || moduleSegment !== '')) {
    ids.push(`${moduleSegment}:${relative}`)
  }
  // Component/module-qualified (version is optional).
  ids.push(`${target.component}:${moduleSegment}:${relative}`)
  // Fully qualified, including the version.
  if (target.version) {
    ids.push(
      `${target.version}@${target.component}:${moduleSegment}:${relative}`,
    )
  }
  return [...new Set(ids)]
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
    const lineText = document.lineAt(position.line).text
    const lineTextBeforeCursor = lineText.slice(0, position.character)
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
    // Complete the macro with its `[]` unless it is already there, placing the
    // cursor between the brackets for the alt text / attributes.
    const hasClosingBracket = lineText.charAt(position.character) === '['
    const items: vscode.CompletionItem[] = []
    for (const family of macroContext.families) {
      const kind = KIND_BY_FAMILY[family] ?? vscode.CompletionItemKind.Reference
      for (const resource of contentCatalog.findBy({ family })) {
        const src = resource.src
        const ids = buildResourceIds(src, current, macroContext.defaultFamily)
        ids.forEach((id, index) => {
          const item = new vscode.CompletionItem(id, kind)
          item.detail =
            `${family} · ${src.component} ${src.version ?? ''}`.trim()
          item.range = replaceRange
          item.insertText = hasClosingBracket
            ? id
            : new vscode.SnippetString(`${id}[$0]`)
          // Keep the variants of a resource grouped and ordered from the
          // shortest (preferred) to the fully qualified form.
          item.sortText = `${family}_${src.relative}_${index}`
          items.push(item)
        })
      }
    }
    return items
  }
}
