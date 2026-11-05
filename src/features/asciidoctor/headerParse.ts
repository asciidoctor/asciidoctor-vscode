import { Document, load } from '@asciidoctor/core'

/**
 * Parses only the header of the document, to read its attributes before the
 * conversion.
 *
 * The option is `parse_header_only`: Asciidoctor ignores an unknown option such
 * as `header_only`, and would parse the whole document (#1249).
 */
export function parseHeaderOnly(
  text: string,
  options: { [key: string]: any } = {},
): Promise<Document> {
  return load(text, { ...options, parse_header_only: true })
}
