import { Document as AsciidoctorDocument, load } from '@asciidoctor/core'

// Cross-reference completion sources its candidates from Asciidoctor's reference
// catalog rather than from a regular expression over the text. This is what lets
// it offer *every* resolvable target the way the converter would — sections
// (including their auto-generated ids such as `_section_title`), block and inline
// anchors, and bibliography entries — instead of only the handful of explicit
// anchor syntaxes a regex can recognize.

export interface CrossReference {
  /** The id used in the `<<id>>` / `xref:id[]` target. */
  id: string
  /**
   * Human-readable text for the target (a section title, or an explicit
   * `reftext`), when one exists. Used as the completion item detail; it is also
   * the text a natural cross reference (`<<Section Title>>`) would resolve from.
   */
  reftext?: string
}

/**
 * Read every registered cross-reference target from an already-parsed
 * Asciidoctor document. `getRefs()` returns a plain `id → node` map.
 */
export function getReferencesFromDocument(
  document: AsciidoctorDocument,
): CrossReference[] {
  const refs = document.getRefs()
  return Object.keys(refs).map((id) => ({ id, reftext: readReftext(refs[id]) }))
}

/**
 * Parse raw AsciiDoc content on its own (includes are not resolved) and return
 * its cross-reference targets. Used for files other than the active document,
 * where a full, include-aware parse would be too costly to run on completion.
 */
export async function getReferencesFromContent(
  content: string,
): Promise<CrossReference[]> {
  const document = await load(content, { parse: true, sourcemap: false })
  return getReferencesFromDocument(document)
}

/**
 * Map every cross-reference target in a parsed document to its 1-based source
 * line, when the node carries a source location (requires `sourcemap: true`).
 * Used to turn a same-document `xref:`/`<<` target into a navigable link. Keyed
 * both by id and, when available, by reftext (a section title) so that a natural
 * cross reference such as `<<Section Title>>` resolves too.
 */
export function getReferenceLinesFromDocument(
  document: AsciidoctorDocument,
): Map<string, number> {
  const refs = document.getRefs()
  const lines = new Map<string, number>()
  for (const id of Object.keys(refs)) {
    const node = refs[id]
    const line = readLineNumber(node)
    if (line === undefined) {
      continue
    }
    lines.set(id, line)
    const reftext = readReftext(node)
    if (reftext && !lines.has(reftext)) {
      lines.set(reftext, line)
    }
  }
  return lines
}

function readLineNumber(node: any): number | undefined {
  try {
    const line = node?.getLineNumber?.()
    return typeof line === 'number' ? line : undefined
  } catch {
    return undefined
  }
}

function readReftext(node: any): string | undefined {
  let reftext: string | undefined
  try {
    reftext = node?.getReftext?.() ?? undefined
  } catch {
    reftext = undefined
  }
  // Sections expose their link text through the title rather than `reftext`.
  if (!reftext) {
    try {
      if (node?.getContext?.() === 'section') {
        reftext = node?.getTitle?.() ?? undefined
      }
    } catch {
      reftext = undefined
    }
  }
  return reftext || undefined
}
