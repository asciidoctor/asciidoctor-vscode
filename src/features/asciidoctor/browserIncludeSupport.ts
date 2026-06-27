import * as vscode from 'vscode'
import { Uri } from 'vscode'
import { isBrowserEnvironment } from '../../core/environment.js'
import { ResolverIncludeProcessor } from './includeProcessor.js'

// `include::target[attrlist]` at the start of a line.
const INCLUDE_DIRECTIVE_RX = /^include::([^[\s]+)\[[^\]]*\]\s*$/gm

/**
 * Only relative file paths can be pre-loaded and resolved here. Skip remote
 * includes (handled by Asciidoctor over HTTP), Antora resource ids (handled by
 * the Antora include processor) and targets carrying unresolved attribute
 * references (we cannot substitute them ahead of the parse).
 */
function isResolvableTarget(target: string): boolean {
  return (
    !/^[a-z][a-z0-9.+-]*:\/\//i.test(target) &&
    !/[$@:]/.test(target) &&
    !target.includes('{')
  )
}

/**
 * Recursively read every `include::` target reachable from the document into a
 * map keyed by the resolved URI. Asciidoctor's `IncludeProcessor.process` is
 * synchronous, but `vscode.workspace.fs` is async, so the contents must be
 * collected up front and then served synchronously during the parse — the same
 * pattern the Antora support uses with its in-memory content catalog.
 */
async function collectIncludeContents(
  rootUri: Uri,
  rootText: string,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>()
  const seen = new Set<string>()
  const decoder = new TextDecoder('utf-8')
  const queue: { dirUri: Uri; text: string }[] = [
    { dirUri: Uri.joinPath(rootUri, '..'), text: rootText },
  ]
  while (queue.length > 0) {
    const { dirUri, text } = queue.shift()
    INCLUDE_DIRECTIVE_RX.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = INCLUDE_DIRECTIVE_RX.exec(text)) !== null) {
      const target = match[1].trim()
      if (!isResolvableTarget(target)) {
        continue
      }
      const fileUri = Uri.joinPath(dirUri, target)
      const key = fileUri.toString()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      try {
        const includedText = decoder.decode(
          await vscode.workspace.fs.readFile(fileUri),
        )
        contents.set(key, includedText)
        queue.push({ dirUri: Uri.joinPath(fileUri, '..'), text: includedText })
      } catch {
        // include not found / unreadable: leave it unresolved so the parse
        // reports the usual "target of include not found" diagnostic.
      }
    }
  }
  return contents
}

/**
 * Register an include processor that resolves relative `include::` directives
 * from files read via `vscode.workspace.fs`. This is a no-op outside the
 * browser, where Asciidoctor.js reads includes from disk itself, and outside
 * Antora documents, whose includes are resolved by the Antora include processor.
 */
export async function registerBrowserIncludeProcessor(
  registry: any,
  documentUri: Uri,
  text: string,
): Promise<void> {
  if (!isBrowserEnvironment()) {
    return
  }
  const contents = await collectIncludeContents(documentUri, text)
  if (contents.size === 0) {
    return
  }
  const rootDir = Uri.joinPath(documentUri, '..').toString()
  registry.includeProcessor(
    new ResolverIncludeProcessor((_doc, target, cursor) => {
      const parentDir =
        (cursor.file && cursor.file.src && cursor.file.src.dir) || rootDir
      const fileUri = Uri.joinPath(Uri.parse(parentDir), target)
      const includedText = contents.get(fileUri.toString())
      if (includedText === undefined) {
        return undefined
      }
      return {
        // Carry the included file's own directory so nested relative includes
        // resolve against it (mirrors how the Antora processor threads `src`).
        src: { dir: Uri.joinPath(fileUri, '..').toString() },
        file: fileUri.path,
        path: fileUri.path.split('/').pop(),
        contents: includedText,
      }
    }),
  )
}
