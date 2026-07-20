import ospath from 'node:path'
import type {
  ContentCatalog,
  ContentCatalogFile,
  ResourceId,
} from '@antora/content-classifier'
import { logger } from '../../core/logger.js'
import type { AntoraConfig, AntoraResourceContext } from './antoraContext.js'

const EXAMPLES_DIR_TOKEN = 'example$'
const PARTIALS_DIR_TOKEN = 'partial$'
const RESOURCE_ID_DETECTOR_RX = /[$:@]/

/**
 * The resource coordinates carried by the file whose include directive is
 * being resolved: either the outermost page, or, when the include originates
 * from a file that was itself included, that file's own catalog entry.
 */
type IncludeSource = AntoraResourceContext | ContentCatalogFile['src']

/**
 * The minimal shape this module needs from an Asciidoctor.js reader `Cursor`.
 * The upstream `Cursor` class (from `@asciidoctor/core`) declares `file` and
 * `dir` as `any`, so importing it would not buy any real type safety here —
 * this narrower, hand-written type describes what is actually read from it.
 */
export interface IncludeCursor {
  file: { src?: IncludeSource } | undefined
  dir: { toString(): string } | undefined
}

/** The result of successfully resolving an include target to a catalog entry. */
interface ResolvedInclude {
  src: IncludeSource
  file: string
  path: string
  contents: string
}

/**
 * Resolves the target of an `include::` directive to a virtual file in the
 * Antora content catalog, so Asciidoctor.js can read its contents as if it
 * were a regular file on disk.
 *
 * Ported from Antora's own `asciidoc-loader` package, adapted to resolve
 * against a content catalog built from the VS Code workspace instead of a
 * cloned repository.
 *
 * @param target - The target of the include directive to resolve.
 * @param page - The outermost virtual file from which the include originated
 *   (not necessarily the file that directly contains the include directive).
 * @param cursor - The cursor of the reader for the file that contains the
 *   include directive.
 * @param catalog - The content catalog that contains the virtual files in the site.
 * @param antoraConfig - The Antora configuration applicable to the current
 *   document; only read when `target` is a relative path rather than a
 *   resource ID.
 * @returns The resolved file's coordinates and contents, or `undefined` if
 *   `target` does not match any entry in the content catalog.
 */
export function resolveIncludeFile(
  target: string,
  page: { src: AntoraResourceContext },
  cursor: IncludeCursor,
  catalog: ContentCatalog,
  antoraConfig: AntoraConfig | undefined,
): ResolvedInclude | undefined {
  const src = cursor.file?.src ?? page.src
  let resolved: ContentCatalogFile | undefined
  let family: string
  let relative: string
  if (RESOURCE_ID_DETECTOR_RX.test(target)) {
    // support for legacy {partialsdir} and {examplesdir} prefixes is @deprecated; scheduled to be removed in Antora 4
    if (
      target.startsWith(PARTIALS_DIR_TOKEN) ||
      target.startsWith(EXAMPLES_DIR_TOKEN)
    ) {
      ;[family, relative] = splitOnce(target, '$')
      if (relative.charAt(0) === '/') {
        relative = relative.slice(1)
      }
      resolved = catalog.getById({
        component: src.component,
        version: src.version,
        module: src.module,
        family,
        relative,
      })
    } else {
      resolved = catalog.resolveResource(target, extractResourceId(src), 'page')
    }
  } else {
    // bypassing resource ID resolution for relative include path is @deprecated; scheduled to be removed in Antora 4
    resolved = catalog.getByPath({
      component: src.component,
      version: src.version,
      // QUESTION does cursor.dir always contain the value we expect?
      path: ospath.normalize(
        ospath.relative(
          antoraConfig.contentSourceRootFsPath,
          ospath.join(cursor.dir.toString(), target),
        ),
      ),
    })
  }
  if (resolved) {
    const resolvedSrc = resolved.src
    return {
      src: resolvedSrc,
      file: resolvedSrc.path,
      path: resolvedSrc.basename,
      // NOTE src.contents holds AsciiDoc source for page marked as a partial
      // QUESTION should we only use src.contents if family is 'page' and mediaType is 'text/asciidoc'?
      contents: (resolvedSrc.contents || resolved.contents || '').toString(),
    }
  }
  logger.debug(
    `Antora: unable to resolve include target "${target}" from component "${src.component}", version "${src.version}"${src.module ? `, module "${src.module}"` : ''} — the include directive will be left unresolved`,
  )
}

function extractResourceId({
  component,
  version,
  module: module_,
  family,
  relative,
}: ResourceId): ResourceId {
  return { component, version, module: module_, family, relative }
}

/**
 * Splits `string` at the first occurrence of `separator`.
 *
 * @param string - The string to split.
 * @param separator - A single character on which to split the string.
 * @returns A 2-element array containing the substrings before and after the
 *   separator, or a 1-element array containing the original string if the
 *   separator was not found.
 */
function splitOnce(string: string, separator: string): string[] {
  const separatorIdx = string.indexOf(separator)
  return ~separatorIdx
    ? [string.slice(0, separatorIdx), string.slice(separatorIdx + 1)]
    : [string]
}
