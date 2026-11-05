// The AsciiDoc conversion and parse, isolated from the VS Code API so that they
// can later run in a worker thread (see #1245).
//
// This module, and every module it imports, MUST NOT import `vscode`: the
// caller resolves everything that needs the VS Code API (settings, workspace
// files, Antora context, color theme...) up front and passes it as plain data.
// `src/test/unit/conversion.test.ts` imports this module in plain Node, where
// `vscode` cannot be resolved, so a `vscode` import breaks the unit tests.
//
// Two inputs are not plain data yet, and must be addressed before the
// conversion moves to a worker:
// - the extension registry (`extension_registry` option), built by the caller
//   from the user's extensions, `.asciidoctorconfig` and the include processors
//   (Antora, VS Code for the Web), which read files through the VS Code API;
// - the converter of the preview, registered by the caller under the
//   `webview-html5` backend, which builds the webview URIs and the CSP.
import {
  AbstractBlock,
  Document as AsciidoctorDocument,
  load,
  MemoryLogger,
  Registry,
} from '@asciidoctor/core'
import { ConversionTiming } from '../../lib/conversionTiming.js'
import { hashBlockSource } from './blockSignature.js'
import { parseHeaderOnly } from './headerParse.js'
import { resolveBlockSourceLines } from './sourceLineMapping.js'

/** The backend name under which the preview's converter is registered. */
export const WEBVIEW_BACKEND = 'webview-html5'

// The webview converter always emits HTML, so its output-file suffix is fixed.
// Exposed as a constant because Asciidoctor.js 4.0 rewrites the converter
// instance's `outfilesuffix` property into a backend-traits accessor *function*
// once it normalises a registered converter (see @asciidoctor/core
// normalizeConverter/applyBackendTraits). Reading it back off the instance
// therefore can't be relied on to be a string — derive `filetype` from this
// constant instead.
export const WEBVIEW_OUTFILESUFFIX = '.html'

/**
 * Where the document lives, as resolved by `AsciidocTextDocument` from its URI
 * and the settings.
 */
export interface DocumentLocation {
  /** Directory of the document, unset in the browser. */
  readonly dirName?: string
  /** Name of the document, without the directory nor the extension. */
  readonly fileName?: string
  /** Path of the document on the file system, unset in the browser. */
  readonly filePath?: string
  /** Extension of the document, with its leading period (e.g. `.adoc`). */
  readonly extensionName: string
  /** Workspace root, when `asciidoc.useWorkspaceRootAsBaseDirectory` is set. */
  readonly baseDirOverride?: string
}

/**
 * A message logged by Asciidoctor during a parse, reduced to plain data so that
 * it can cross a thread boundary.
 */
export interface ConversionMessage {
  /** `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` or `UNKNOWN`. */
  readonly severity: string
  readonly text: string
  readonly location?: {
    /** Absolute path of the file, unset for the document being parsed. */
    readonly file?: string
    /** Path of the file, as written in the `include::` directive. */
    readonly path?: string
    /** 1-based line number in that file. */
    readonly lineNumber?: number
  }
}

export type AsciidoctorOptions = { [key: string]: any }

// Intrinsic attributes are not set automatically when the input is a string
// (Asciidoctor.js only derives them when the input is a file), so they are
// provided here for the API — this is allowed since the safe mode is 'unsafe'.
// docdir/docfile anchor relative includes and images to the document's own
// directory; docname/docfilesuffix make {docname} resolvable (#82).
// https://docs.asciidoctor.org/asciidoc/latest/attributes/document-attributes-ref/#intrinsic-attributes
function intrinsicAttributes(location: DocumentLocation) {
  return {
    ...(location.dirName && { docdir: location.dirName }),
    ...(location.filePath && { docfile: location.filePath }),
    // docname is the root name of the source document (no leading path or file
    // extension), see https://github.com/asciidoctor/asciidoctor-vscode/issues/82
    ...(location.fileName && { docname: location.fileName }),
    docfilesuffix: location.extensionName,
  }
}

// Do not set base_dir (Asciidoctor derives it from docdir) unless the user
// opted into useWorkspaceRootAsBaseDirectory (see #926).
function baseDirOption(location: DocumentLocation) {
  return location.baseDirOverride ? { base_dir: location.baseDirOverride } : {}
}

function templateDirsOption(templateDirs: string[]) {
  return templateDirs.length !== 0 ? { template_dirs: templateDirs } : {}
}

/**
 * Options of the parse used by the language features and the diagnostics.
 */
export function buildParseOptions(input: {
  attributes: { [key: string]: any }
  location: DocumentLocation
  registry: Registry
}): AsciidoctorOptions {
  return {
    attributes: {
      ...input.attributes,
      ...intrinsicAttributes(input.location),
    },
    extension_registry: input.registry,
    sourcemap: true,
    safe: 'unsafe',
    parse: true,
    ...baseDirOption(input.location),
  }
}

/**
 * Options of an export (`html5` or `docbook5`).
 */
export function buildExportOptions(input: {
  /** The attributes from the settings, already merged with their defaults. */
  attributes: { [key: string]: any }
  backend: string
  location: DocumentLocation
  templateDirs: string[]
  registry: Registry
}): AsciidoctorOptions {
  const { location } = input
  return {
    attributes: {
      'env-vscode': '',
      env: 'vscode',
      ...input.attributes,
      // Anchor relative includes/images to the document's own directory; do
      // not set base_dir unless the user opted in (see #926).
      ...(location.dirName && { docdir: location.dirName }),
      ...(location.filePath && { docfile: location.filePath }),
    },
    backend: input.backend,
    extension_registry: input.registry,
    header_footer: true,
    safe: 'unsafe',
    ...baseDirOption(location),
    ...templateDirsOption(input.templateDirs),
  }
}

/**
 * What the preview needs to know from the document header before the
 * conversion.
 */
export interface DocumentHeader {
  /** `kroki-server-url`, or the public Kroki server. */
  readonly krokiServerUrl: string
  /** Whether `data-uri` is set: the preview then embeds the images itself. */
  readonly dataUriEnabled: boolean
  /** `source-highlighter`, if set. */
  readonly sourceHighlighter?: string
}

/**
 * Reads the attributes of the document header that the preview needs before
 * the conversion.
 */
export async function parseHeader(
  text: string,
  options: { attributes: { [key: string]: any }; registry: Registry },
): Promise<DocumentHeader> {
  const document = await parseHeaderOnly(text, {
    attributes: options.attributes,
    extension_registry: options.registry,
  })
  return {
    krokiServerUrl:
      document.getAttribute('kroki-server-url') || 'https://kroki.io',
    // The preview embeds images itself when `data-uri` is set (see the
    // converter), because Asciidoctor's own data-uri embedding reads from disk
    // and does not work for VS Code workspaces.
    dataUriEnabled: document.isAttribute('data-uri'),
    sourceHighlighter: document.getAttribute('source-highlighter'),
  }
}

/**
 * Options of the preview conversion.
 */
export function buildPreviewOptions(input: {
  /** The attributes from the settings (`asciidoc.preview.asciidoctorAttributes`...). */
  attributes: { [key: string]: any }
  /** The attributes of the Antora component, if any. */
  antoraAttributes: { [key: string]: any }
  header: DocumentHeader
  /** Whether the active color theme is dark (or high contrast). */
  darkTheme: boolean
  location: DocumentLocation
  templateDirs: string[]
  registry: Registry
}): AsciidoctorOptions {
  const { antoraAttributes, header, location } = input
  return {
    attributes: {
      // `data-uri` is unset below, so asciidoctor-kroki would write the diagrams
      // fetched with `kroki-fetch-diagram` into the workspace, only for the
      // converter to read them back. Ask it to return a `data:` URI instead,
      // which the converter leaves untouched. Soft (`@`), so that the settings
      // and the document can still unset it.
      ...(header.dataUriEnabled && { 'kroki-data-uri@': '' }),
      ...input.attributes,
      ...antoraAttributes,
      // Highlight.js is the only source highlighter available in the preview:
      // resolve any value to it, unless highlighting is disabled (unset or
      // empty). A hard attribute, so it also wins over the document header.
      ...((antoraAttributes['source-highlighter'] ??
        header.sourceHighlighter) && {
        'source-highlighter': 'highlight.js',
      }),
      // Expose the active VS Code color theme as a document attribute so
      // authors can branch on it (e.g. `ifeval::["{vscode-theme}" == "dark"]`)
      // and so diagram extensions can request a matching theme.
      'vscode-theme': input.darkTheme ? 'dark' : 'light',
      ...intrinsicAttributes(location),
      filetype: WEBVIEW_OUTFILESUFFIX.substring(1), // remove the leading '.'
      // Disable Asciidoctor's own data-uri embedding; the WebView converter
      // does it instead (see AsciidoctorWebViewConverter, gated on
      // `dataUriEnabled`). Asciidoctor.js 4.0 dropped Opal and reads via
      // `node:fs`/`fetch`, so the native path works on the desktop — but not
      // in VS Code for the Web (no `node:fs`) nor on virtual file systems
      // (Remote SSH, dev containers, `vscode-vfs:`), where only
      // `vscode.workspace.fs` can read the file. Embedding through the VS Code
      // FS API covers every host uniformly.
      '!data-uri': '',
    },
    backend: WEBVIEW_BACKEND,
    extension_registry: input.registry,
    header_footer: true,
    safe: 'unsafe',
    sourcemap: true,
    ...baseDirOption(location),
    ...templateDirsOption(input.templateDirs),
  }
}

/**
 * Parses the document, capturing the messages logged by Asciidoctor during the
 * parse.
 *
 * With `timing`, records the `load` phase.
 */
export async function parse(
  text: string,
  options: AsciidoctorOptions,
  { timing }: { timing?: ConversionTiming } = {},
): Promise<{ document: AsciidoctorDocument; messages: ConversionMessage[] }> {
  // Scope the logger to this parse: the global one can be replaced by any
  // overlapping parse, which would capture our messages.
  const memoryLogger = MemoryLogger.create()
  const document = await load(text, { ...options, logger: memoryLogger })
  timing?.phase('load')
  return { document, messages: collectMessages(memoryLogger) }
}

/**
 * Parses and converts the document.
 *
 * With `annotate`, which the preview needs, each block gets a `data-line-N`
 * role, for the scroll synchronization, and a `data-h-HASH` role, for the
 * incremental update.
 *
 * With `timing`, records the `load`, `annotate` and `convert` phases.
 */
export async function convert(
  text: string,
  options: AsciidoctorOptions,
  {
    annotate = false,
    timing,
  }: { annotate?: boolean; timing?: ConversionTiming } = {},
): Promise<{
  html: string
  document: AsciidoctorDocument
  messages: ConversionMessage[]
}> {
  const { document, messages } = await parse(text, options, { timing })
  if (annotate) {
    annotateBlocks(document)
    timing?.phase('annotate')
  }
  const html = String(await document.convert(options))
  timing?.phase('convert')
  return { html, document, messages }
}

/**
 * Adds to each block a `data-line-N` role, with the line of the main document
 * the block comes from, and a `data-h-HASH` role, with a hash of its source.
 */
export function annotateBlocks(document: AsciidoctorDocument): void {
  const blocksWithLineNumber = document.findBy(function (b: AbstractBlock) {
    return typeof b.getLineNumber() !== 'undefined'
  })
  // Resolve the editor line for each block up front so content pulled in via
  // `include::` is anchored to the directive's neighbourhood in the main
  // document instead of to its line within the included file. Otherwise the
  // out-of-order anchors break the preview ⇄ editor scroll synchronization.
  const mainFile = (document as any).getSourceLocation?.()?.getFile?.()
  const sourceLines = resolveBlockSourceLines(
    blocksWithLineNumber.map((block) => ({
      // Guaranteed defined by the blocksWithLineNumber filter above.
      lineNumber: block.getLineNumber()!,
      file: (block as any).getSourceLocation?.()?.getFile?.(),
    })),
    mainFile,
  )
  blocksWithLineNumber.forEach(function (block, index) {
    block.addRole('data-line-' + sourceLines[index])
    // Tag each block with a hash of its source so the preview can morph
    // incrementally and skip blocks whose content is unchanged (keeping
    // already-rendered MathJax/Mermaid/highlight output intact). The hash is
    // encoded as a role/class because the custom converter already emits roles
    // as classes and they survive client-side post-processing.
    const contentHash = hashBlockSource(block)
    if (contentHash !== undefined) {
      block.addRole('data-h-' + contentHash)
    }
  })
}

/**
 * Reduces the messages of a memory logger to plain data.
 */
export function collectMessages(memoryLogger: {
  getMessages(): any[]
}): ConversionMessage[] {
  return memoryLogger.getMessages().map((message) => {
    const location = message.getSourceLocation?.()
    return {
      severity: String(message.getSeverity()),
      text: messageText(message),
      ...(location && {
        location: {
          file: location.getFile?.() ?? undefined,
          path: location.path ?? location.getPath?.() ?? undefined,
          lineNumber: location.getLineNumber?.() ?? undefined,
        },
      }),
    }
  })
}

// Coerce an Asciidoctor log message to a string.
// `MemoryLogger.getMessages()` is typed `any[]` upstream, so the message is too.
//
// Almost always `getText()` already returns a string. But an extension can log
// a non-string payload (asciidoctor-kroki historically logged an object when a
// diagram failed to render), and feeding a non-string straight into a
// `vscode.Diagnostic.message` makes VS Code throw "message.replace is not a
// function" when it renders the marker. Guarantee a string so a misbehaving
// message can never crash the editor.
function messageText(message: any): string {
  const text = message.getText()
  return typeof text === 'string' ? text : String(text ?? '')
}
