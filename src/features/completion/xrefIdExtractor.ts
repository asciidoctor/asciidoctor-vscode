// Pure extractors for the anchor ids declared in an AsciiDoc document, used to
// feed xref/`<<` completion. Kept free of any `vscode` dependency so they can be
// unit-tested in isolation.

/** Ids declared with the legacy block anchor syntax, e.g. `[[anId]]`. */
export function getLabelsFromLegacyBlock(content: string): string[] {
  return matchIds(content, /\[\[(\w+)\]\]/g, '[[', ']]')
}

/** Ids declared with the shorthand syntax, e.g. `[#anId]`. */
export function getLabelsFromShorthandNotation(content: string): string[] {
  return matchIds(content, /\[#(\w+)\]/g, '[#', ']')
}

/** Ids declared with the longhand syntax, e.g. `[id=anId]`. */
export function getLabelsFromLonghandNotation(content: string): string[] {
  return matchIds(content, /\[id=(\w+)\]/g, '[id=', ']')
}

/** Every anchor id declared in `content`, across all supported syntaxes. */
export function getIdsFromContent(content: string): string[] {
  return [
    ...getLabelsFromLegacyBlock(content),
    ...getLabelsFromShorthandNotation(content),
    ...getLabelsFromLonghandNotation(content),
  ]
}

function matchIds(
  content: string,
  regex: RegExp,
  open: string,
  close: string,
): string[] {
  const matched = content.match(regex)
  if (matched) {
    return matched.map((result) => result.replace(open, '').replace(close, ''))
  }
  return []
}
