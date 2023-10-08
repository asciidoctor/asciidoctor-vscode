'use strict'

import ospath from 'path'

const EXAMPLES_DIR_TOKEN = 'example$'
const PARTIALS_DIR_TOKEN = 'partial$'
const RESOURCE_ID_DETECTOR_RX = /[$:@]/

/**
 * Resolves the specified target of an include directive to a virtual file in the content catalog.
 *
 * @memberof asciidoc-loader
 *
 * @param {String} target - The target of the include directive to resolve.
 * @param {File} page - The outermost virtual file from which the include originated (not
 *   necessarily the current file).
 * @param {Cursor} cursor - The cursor of the reader for file that contains the include directive.
 * @param {ContentCatalog} catalog - The content catalog that contains the virtual files in the site.
 * @returns {Object} A map containing the file, path, and contents of the resolved file.
 */
export function resolveIncludeFile (target, page, cursor, catalog, antoraConfig) {
  const src = (cursor.file || {}).src || page.src
  let resolved
  let family
  let relative
  if (RESOURCE_ID_DETECTOR_RX.test(target)) {
    // support for legacy {partialsdir} and {examplesdir} prefixes is @deprecated; scheduled to be removed in Antora 4
    if (target.startsWith(PARTIALS_DIR_TOKEN) || target.startsWith(EXAMPLES_DIR_TOKEN)) {
      ;[family, relative] = splitOnce(target, '$')
      if (relative.charAt() === '/') relative = relative.substr(1)
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
      path: ospath.normalize(ospath.relative(antoraConfig.contentSourceRootFsPath, ospath.join(cursor.dir.toString(), target))),
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
}

function extractResourceId ({ component, version, module: module_, family, relative }) {
  return { component, version, module: module_, family, relative }
}

/**
 * Splits the specified string at the first occurrence of the specified separator.
 *
 * @memberof asciidoc-loader
 *
 * @param {String} string - The string to split.
 * @param {String} separator - A single character on which to split the string.
 * @returns {String[]} A 2-element Array that contains the string before and after the separator, if
 * the separator is found, otherwise a single-element Array that contains the original string.
 */
function splitOnce (string, separator) {
  const separatorIdx = string.indexOf(separator)
  return ~separatorIdx ? [string.substr(0, separatorIdx), string.substr(separatorIdx + 1)] : [string]
}
