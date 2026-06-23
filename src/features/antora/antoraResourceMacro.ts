// Matches the `image:`/`image::`, `xref:` and `include::` macros and captures
// their target, e.g. `image::2.0@cli:commands:output.png[]`.
const MACRO_RX = /(image|xref|include)(::?)([^\s[\]]+)\[/g

// An Antora resource id always carries a family/component/module/version marker.
const RESOURCE_ID_DETECTOR_RX = /[$:@]/

const DEFAULT_FAMILY_BY_MACRO: { [macro: string]: string } = {
  image: 'image',
  xref: 'page',
  include: 'page',
}

export interface AntoraResourceMacroMatch {
  /** The resource id to resolve, without any `#fragment`. */
  id: string
  /** The default Antora family to assume when the id does not specify one. */
  family: string
  /** Column where the resource id starts on the line. */
  idStart: number
  /** Column right after the resource id (before any `#fragment`). */
  idEnd: number
}

/**
 * Find the Antora resource macro whose target is located under `character` on
 * the given line, if any. Returns plain string offsets so the matcher stays free
 * of any `vscode` dependency and can be unit-tested in isolation.
 */
export function matchAntoraResourceMacroAt(
  lineText: string,
  character: number,
): AntoraResourceMacroMatch | undefined {
  for (const match of lineText.matchAll(MACRO_RX)) {
    const macro = match[1]
    const target = match[3]
    const targetStart = match.index + match[1].length + match[2].length
    const targetEnd = targetStart + target.length
    if (character < targetStart || character > targetEnd) {
      continue
    }
    // Drop the fragment (e.g. `xref:page.adoc#anchor[]`) before resolution.
    const fragmentIndex = target.indexOf('#')
    const id = fragmentIndex === -1 ? target : target.slice(0, fragmentIndex)
    if (id.length === 0) {
      continue
    }
    // For includes, only resource ids go through the content catalog; plain
    // relative paths are resolved by the include processor at render time.
    if (macro === 'include' && !RESOURCE_ID_DETECTOR_RX.test(id)) {
      continue
    }
    const idEnd = fragmentIndex === -1 ? targetEnd : targetStart + fragmentIndex
    return {
      id,
      family: DEFAULT_FAMILY_BY_MACRO[macro],
      idStart: targetStart,
      idEnd,
    }
  }
  return undefined
}
