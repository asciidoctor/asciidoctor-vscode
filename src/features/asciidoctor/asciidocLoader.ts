import {
  Document as AsciidoctorDocument,
  Extensions,
  LoggerManager,
  MemoryLogger,
  Registry,
} from '@asciidoctor/core'
import * as vscode from 'vscode'
import { SkinnyTextDocument } from '../../core/document.js'
import { logger } from '../../core/logger.js'
import { ConversionTiming } from '../../lib/conversionTiming.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from '../antora/antoraDocument.js'
import { resolveIncludeFile } from '../antora/resolveIncludeFile.js'
import { AsciidocTextDocument } from './asciidocTextDocument.js'
import { AsciidoctorAttributesConfig } from './asciidoctorAttributesConfig.js'
import { AsciidoctorConfigProvider } from './asciidoctorConfig.js'
import { AsciidoctorDiagnosticProvider } from './asciidoctorDiagnostic.js'
import { AsciidoctorExtensionsProvider } from './asciidoctorExtensions.js'
import {
  AsciidoctorIncludeItemsProvider,
  IncludeItems,
} from './asciidoctorIncludeItems.js'
import { registerBrowserIncludeProcessor } from './browserIncludeSupport.js'
import { buildParseOptions, parse } from './conversion.js'
import { ResolverIncludeProcessor } from './includeProcessor.js'
import { ParseCache } from './parseCache.js'

/** The result of a parse, shared by the language features and the diagnostics. */
export type ParseResult = Awaited<ReturnType<typeof parse>>

export class AsciidocLoader {
  constructor(
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
    readonly asciidoctorDiagnosticProvider: AsciidoctorDiagnosticProvider,
    readonly context: vscode.ExtensionContext,
    // Shared with the other loaders of the extension, see `extension.ts`.
    readonly parseCache = new ParseCache<ParseResult>(),
  ) {}

  public async load(
    textDocument: SkinnyTextDocument,
  ): Promise<AsciidoctorDocument> {
    // A plain parse used by language features (document symbols, folding,
    // completion, links, …). It must NOT publish diagnostics: diagnostics are
    // owned by `AsciidocDiagnosticManager` and refreshed only when a document is
    // opened or its text changes, so that merely invoking a provider — or
    // opening/closing the preview — never recomputes or clears them.
    const { document } = await this.parseShared(textDocument)
    return document
  }

  /**
   * Parse the document and publish its Asciidoctor log messages as diagnostics.
   * This is the single source of diagnostics; it is driven by
   * `AsciidocDiagnosticManager` on document open/change only.
   */
  public async reportDiagnostics(
    textDocument: SkinnyTextDocument,
  ): Promise<void> {
    this.asciidoctorDiagnosticProvider.delete(textDocument.uri)
    const { messages } = await this.parseShared(textDocument)
    this.asciidoctorDiagnosticProvider.reportErrors(messages, textDocument)
  }

  /**
   * Parse the document, or reuse the parse of the same text: the language
   * features and the diagnostics all parse the document after an edit (#1251).
   * The parse is the same for all of them, since they must not depend on the
   * caller: the parse captures its own log messages (see `parse`), and the
   * diagnostics are published from them.
   *
   * The parse is also reused only with the same attributes and base directory
   * from the settings, so that a change of these settings is taken into
   * account even before `registerParseCacheInvalidation` clears the cache.
   */
  private parseShared(textDocument: SkinnyTextDocument): Promise<ParseResult> {
    const text = textDocument.getText()
    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes(
      textDocument.uri,
    )
    const options = JSON.stringify({
      attributes,
      baseDirOverride: asciidocDocument.baseDirOverride,
    })
    return this.parseCache.get(
      textDocument.uri.toString(),
      { text, options },
      () =>
        this.parseDocument(textDocument, text, attributes, asciidocDocument),
    )
  }

  private async parseDocument(
    textDocument: SkinnyTextDocument,
    text: string,
    attributes: {},
    asciidocDocument: AsciidocTextDocument,
  ): Promise<ParseResult> {
    const timing = new ConversionTiming()
    const { registry, antoraDocumentContext } = await this.prepare(textDocument)
    if (antoraDocumentContext === undefined) {
      await registerBrowserIncludeProcessor(registry, textDocument.uri, text)
    }
    timing.phase('setup')
    const result = await parse(
      text,
      this.getOptions(attributes, registry, asciidocDocument),
      { timing },
    )
    logger.debug(timing.format('Parsed', textDocument.uri.toString(), text))
    return result
  }

  protected getOptions(
    attributes: {},
    registry: Registry,
    asciidocDocument: AsciidocTextDocument,
  ) {
    return buildParseOptions({
      attributes,
      location: asciidocDocument,
      registry,
    })
  }

  protected async prepare(textDocument: SkinnyTextDocument) {
    // Keep Asciidoctor log messages out of the console; each parse captures
    // its own messages (see `parse`).
    LoggerManager.setLogger(MemoryLogger.create())

    const registry = Extensions.create()
    const textDocumentUri = textDocument.uri
    await this.asciidoctorExtensionsProvider.activate(registry, {
      documentUri: textDocumentUri,
      mode: 'load',
    })
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    const antoraDocumentContext = await getAntoraDocumentContext(
      textDocument.uri,
      this.context.workspaceState,
    )
    if (antoraDocumentContext !== undefined) {
      const antoraConfig = await getAntoraConfig(textDocumentUri)
      registry.includeProcessor(
        new ResolverIncludeProcessor((_, target, cursor) =>
          resolveIncludeFile(
            target,
            {
              src: antoraDocumentContext.resourceContext,
            },
            cursor,
            antoraDocumentContext.getContentCatalog(),
            antoraConfig,
          ),
        ),
      )
    }
    return {
      registry,
      antoraDocumentContext,
    }
  }
}

export class AsciidocIncludeItemsLoader extends AsciidocLoader {
  constructor(
    readonly asciidoctorIncludeItemsProvider: AsciidoctorIncludeItemsProvider,
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
    readonly asciidoctorDiagnosticProvider: AsciidoctorDiagnosticProvider,
    readonly context: vscode.ExtensionContext,
    readonly parseCache = new ParseCache<ParseResult>(),
  ) {
    super(
      asciidoctorConfigProvider,
      asciidoctorExtensionsProvider,
      asciidoctorDiagnosticProvider,
      context,
      parseCache,
    )
  }

  public async getIncludeItems(
    textDocument: SkinnyTextDocument,
  ): Promise<IncludeItems> {
    // This loader only enumerates `include::` directives (for document links).
    // It registers an include processor that replaces every include with a
    // `nothing` placeholder, so the parsed document is intentionally degraded
    // (e.g. a source block loses the callout markers carried by the included
    // file). Reporting diagnostics from this parse would surface false
    // positives such as "no callout found for <1>" (#971), so this path must
    // not touch the diagnostic collection at all — neither clearing it nor
    // publishing to it. Diagnostics come from the fully-resolved parse shared
    // by `AsciidocLoader.load()` and `reportDiagnostics()`.
    // For the same reason, this degraded parse never goes into the parse cache.
    const timing = new ConversionTiming()
    const { registry } = await this.prepare(textDocument)
    this.asciidoctorIncludeItemsProvider.activate(registry)
    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes(
      textDocument.uri,
    )
    this.asciidoctorIncludeItemsProvider.reset()
    timing.phase('setup')
    const text = textDocument.getText()
    await parse(text, this.getOptions(attributes, registry, asciidocDocument), {
      timing,
    })
    logger.debug(
      timing.format(
        'Parsed for the include directives',
        textDocument.uri.toString(),
        text,
      ),
    )
    return this.asciidoctorIncludeItemsProvider.get()
  }
}

/**
 * Drops the cached parses when they may no longer match what a new parse would
 * give for the same text:
 * - when a document is closed, to release its parse;
 * - when any document is saved, since the parse reads the included files, the
 *   `.asciidoctorconfig` files and the Antora files from disk (a change made
 *   outside VS Code shows up at the next edit of the document);
 * - when the configuration changes (attributes, base directory, extensions...);
 * - when the workspace becomes trusted, which allows the Asciidoctor extensions
 *   of the workspace.
 */
export function registerParseCacheInvalidation(
  parseCache: ParseCache<ParseResult>,
): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.workspace.onDidCloseTextDocument((document) =>
      parseCache.delete(document.uri.toString()),
    ),
    vscode.workspace.onDidSaveTextDocument(() => parseCache.clear()),
    vscode.workspace.onDidChangeConfiguration(() => parseCache.clear()),
    vscode.workspace.onDidGrantWorkspaceTrust(() => parseCache.clear()),
  )
}
