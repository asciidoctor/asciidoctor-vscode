import { IncludeProcessor } from '@asciidoctor/core'

const DBL_COLON = '::'
const DBL_SQUARE = '[]'
const NEWLINE_RX = /\r\n?|\n/
const TAG_DIRECTIVE_RX = /\b(?:tag|(e)nd)::(\S+?)\[\](?=$|[ \r])/m

/**
 * A generic Asciidoctor include processor whose only job is the mechanics of an
 * include — max-depth guard, `lines=`/`tags=` filtering and pushing the content
 * onto the reader. Locating the include target is delegated to the `resolve`
 * callback, so the same processor serves both the Antora content catalog and the
 * browser's `vscode.workspace.fs`-backed resolver.
 */
export class ResolverIncludeProcessor extends IncludeProcessor {
  private readonly _callback: (doc: any, target: string, cursor: any) => any

  constructor(callback: (doc: any, target: string, cursor: any) => any) {
    super()
    this._callback = callback
  }

  process(
    doc: any,
    reader: any,
    target: string,
    attrs: Record<string, any>,
  ): void {
    if (reader.exceedsMaxDepth()) {
      log(
        'error',
        `maximum include depth of ${reader._maxdepth.rel} exceeded`,
        reader,
        reader.cursorAtPrevLine(),
      )
      return
    }
    const sourceCursor = reader.cursorAtPrevLine()
    const resolvedFile = this._callback(doc, target, sourceCursor)
    if (resolvedFile) {
      let includeContents: string | string[]
      let linenums: number[] | undefined
      let tags: Map<string, boolean> | undefined
      let startLineNum: number
      if ((linenums = getLines(attrs))) {
        ;[includeContents, startLineNum] = filterLinesByLineNumbers(
          reader,
          target,
          resolvedFile,
          linenums,
        )
      } else if ((tags = getTags(attrs))) {
        ;[includeContents, startLineNum] = filterLinesByTags(
          reader,
          target,
          resolvedFile,
          tags,
          sourceCursor,
        )
      } else {
        includeContents = resolvedFile.contents
        startLineNum = 1
      }
      attrs['partial-option'] = ''
      // eslint-disable-next-line no-new-wrappers
      const file = Object.assign(String(resolvedFile.file), {
        src: resolvedFile.src,
        parent: { file: reader.file, lineno: reader.lineno - 1 },
      })
      reader.pushInclude(
        includeContents,
        file,
        resolvedFile.path,
        startLineNum,
        attrs,
      )
    } else {
      if ('optional-option' in attrs) {
        log(
          'info',
          `optional include dropped because include file not found: ${target}`,
          reader,
          sourceCursor,
        )
      } else {
        log(
          'error',
          `target of include not found: ${target}`,
          reader,
          sourceCursor,
        )
        reader.unshiftLine(
          `Unresolved include directive in ${sourceCursor.file} - include::${target}[]`,
        )
      }
    }
  }
}

function getLines(attrs: Record<string, any>): number[] | undefined {
  if ('lines' in attrs) {
    const lines = attrs.lines
    if (lines) {
      const linenums: (number | typeof Infinity)[] = []
      let filtered: boolean
      ;(~lines.indexOf(',') ? lines.split(',') : lines.split(';'))
        .filter((it: string) => it)
        .forEach((linedef: string) => {
          filtered = true
          let delim: number
          let from: number
          if (~(delim = linedef.indexOf('..'))) {
            from =
              parseInt(linedef.substr(0, delim) as unknown as string, 10) || -1
            const to = parseInt(linedef.substr(delim + 2) as string, 10) || -1
            if (to > 0) {
              if (from > 0) {
                for (let i = from; i <= (to as number); i++) {
                  linenums.push(i)
                }
              }
            } else if (
              to === -1 &&
              (from = parseInt(from as unknown as string, 10) || -1) > 0
            ) {
              linenums.push(from, Infinity)
            }
          } else if ((from = parseInt(linedef, 10) || -1) > 0) {
            linenums.push(from)
          }
        })
      if (linenums.length) {
        return [
          ...new Set(linenums.sort((a, b) => (a as number) - (b as number))),
        ] as number[]
      }
      if (filtered) {
        return []
      }
    }
  }
}

function getTags(attrs: Record<string, any>): Map<string, boolean> | undefined {
  if ('tag' in attrs) {
    const tag = attrs.tag
    if (tag && tag !== '!') {
      return tag.charAt() === '!'
        ? new Map().set(tag.substr(1), false)
        : new Map().set(tag, true)
    }
  } else if ('tags' in attrs) {
    const tags = attrs.tags
    if (tags) {
      const result = new Map<string, boolean>()
      let any = false
      tags.split(~tags.indexOf(',') ? ',' : ';').forEach((tag: string) => {
        if (tag && tag !== '!') {
          any = true
          tag.charAt(0) === '!'
            ? result.set(tag.substr(1), false)
            : result.set(tag, true)
        }
      })
      if (any) {
        return result
      }
    }
  }
}

function filterLinesByLineNumbers(
  reader: any,
  target: string,
  file: any,
  linenums: (number | typeof Infinity)[],
): [string[], number] {
  let lineNum = 0
  let startLineNum: number
  let selectRest: boolean
  const lines: string[] = []
  file.contents.split(NEWLINE_RX).some((line: string) => {
    lineNum++
    if (selectRest || (selectRest = linenums[0] === Infinity)) {
      if (!startLineNum) {
        startLineNum = lineNum
      }
      lines.push(line)
    } else {
      if (linenums[0] === lineNum) {
        if (!startLineNum) {
          startLineNum = lineNum
        }
        linenums.shift()
        lines.push(line)
      }
      if (!linenums.length) {
        return true
      }
    }
    return false
  })
  return [lines, startLineNum || 1]
}

function filterLinesByTags(
  reader: any,
  target: string,
  file: any,
  tags: Map<string, boolean>,
  sourceCursor: any,
): [string[], number] {
  let selectingDefault: boolean
  let selecting: boolean
  let wildcard: boolean
  const globstar = tags.get('**')
  const star = tags.get('*')
  if (globstar === undefined) {
    if (star === undefined) {
      selectingDefault = selecting = !mapContainsValue(tags, true)
    } else {
      if ((wildcard = star) || tags.keys().next().value !== '*') {
        selectingDefault = selecting = false
      } else {
        selectingDefault = selecting = !wildcard
      }
      tags.delete('*')
    }
  } else {
    tags.delete('**')
    selectingDefault = selecting = globstar
    if (star === undefined) {
      if (!globstar && tags.values().next().value === false) {
        wildcard = true
      }
    } else {
      tags.delete('*')
      wildcard = star
    }
  }

  const lines: string[] = []
  const tagStack: [string, boolean, number][] = []
  const foundTags: string[] = []
  let activeTag: string
  let lineNum = 0
  let startLineNum: number
  file.contents.split(NEWLINE_RX).forEach((line: string) => {
    lineNum++
    let m: RegExpMatchArray | null
    if (
      ~line.indexOf(DBL_COLON) &&
      ~line.indexOf(DBL_SQUARE) &&
      (m = line.match(TAG_DIRECTIVE_RX))
    ) {
      const thisTag = m[2]
      if (m[1]) {
        if (thisTag === activeTag) {
          tagStack.shift()
          ;[activeTag, selecting] = tagStack.length
            ? tagStack[0]
            : [undefined, selectingDefault]
        } else if (tags.has(thisTag)) {
          const idx = tagStack.findIndex(([name]) => name === thisTag)
          if (~idx) {
            tagStack.splice(idx, 1)
            log(
              'warn',
              `mismatched end tag (expected '${activeTag}' but found '${thisTag}') ` +
                `at line ${lineNum} of include file: ${file.file})`,
              reader,
              sourceCursor,
              createIncludeCursor(reader, file, target, lineNum),
            )
          } else {
            log(
              'warn',
              `unexpected end tag '${thisTag}' at line ${lineNum} of include file: ${file.file}`,
              reader,
              sourceCursor,
              createIncludeCursor(reader, file, target, lineNum),
            )
          }
        }
      } else if (tags.has(thisTag)) {
        foundTags.push(thisTag)
        tagStack.unshift([
          (activeTag = thisTag),
          (selecting = tags.get(thisTag)),
          lineNum,
        ])
      } else if (wildcard !== undefined) {
        selecting = activeTag && !selecting ? false : wildcard
        tagStack.unshift([(activeTag = thisTag), selecting, lineNum])
      }
    } else if (selecting) {
      if (!startLineNum) {
        startLineNum = lineNum
      }
      lines.push(line)
    }
  })
  if (tagStack.length) {
    tagStack.forEach(([tagName, _, tagLineNum]) =>
      log(
        'warn',
        `detected unclosed tag '${tagName}' starting at line ${tagLineNum} of include file: ${file.file}`,
        reader,
        sourceCursor,
        createIncludeCursor(reader, file, target, tagLineNum),
      ),
    )
  }
  if (foundTags.length) {
    foundTags.forEach((name) => tags.delete(name))
  }
  if (tags.size) {
    log(
      'warn',
      `tag${tags.size > 1 ? 's' : ''} '${[...tags.keys()].join(', ')}' not found in include file: ${file.file}`,
      reader,
      sourceCursor,
      createIncludeCursor(reader, file, target, 0),
    )
  }
  return [lines, startLineNum || 1]
}

function createIncludeCursor(
  reader: any,
  { file, src }: { file: any; src: any },
  path: string,
  lineno: number,
) {
  return reader.createIncludeCursor(
    // eslint-disable-next-line no-new-wrappers
    Object.assign(String(file), {
      src,
      parent: { file: reader.file, lineno: reader.lineno - 1 },
    }),
    path,
    lineno,
  )
}

function log(
  severity: 'error' | 'warn' | 'info',
  message: string,
  reader: any,
  sourceCursor: any,
  includeCursor?: any,
) {
  if (severity === 'info') {
    reader._logInfo(message, { sourceLocation: sourceCursor })
  } else if (severity === 'warn') {
    reader._logWarn(message, {
      sourceLocation: sourceCursor,
      ...(includeCursor && { includeLocation: includeCursor }),
    })
  } else {
    reader._logError(message, { sourceLocation: sourceCursor })
  }
}

function mapContainsValue(map: Map<string, boolean>, value: boolean): boolean {
  for (const v of map.values()) {
    if (v === value) {
      return true
    }
  }
  return false
}
