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

export class AsciidocLoader {
  constructor(
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
    readonly asciidoctorDiagnosticProvider: AsciidoctorDiagnosticProvider,
    readonly context: vscode.ExtensionContext,
  ) {}

  public async load(
    textDocument: SkinnyTextDocument,
  ): Promise<AsciidoctorDocument> {
    // A plain parse used by language features (document symbols, folding,
    // completion, links, …). It must NOT publish diagnostics: diagnostics are
    // owned by `AsciidocDiagnosticManager` and refreshed only when a document is
    // opened or its text changes, so that merely invoking a provider — or
    // opening/closing the preview — never recomputes or clears them.
    const timing = new ConversionTiming()
    const { registry, antoraDocumentContext } = await this.prepare(
      textDocument,
      false,
    )
    if (antoraDocumentContext === undefined) {
      await registerBrowserIncludeProcessor(
        registry,
        textDocument.uri,
        textDocument.getText(),
      )
    }
    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes(
      textDocument.uri,
    )
    timing.phase('setup')
    const text = textDocument.getText()
    const { document } = await parse(
      text,
      this.getOptions(attributes, registry, asciidocDocument),
      { timing },
    )
    logger.debug(timing.format('Parsed', textDocument.uri.toString(), text))
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
    const timing = new ConversionTiming()
    const { registry, antoraDocumentContext } = await this.prepare(
      textDocument,
      true,
    )
    if (antoraDocumentContext === undefined) {
      await registerBrowserIncludeProcessor(
        registry,
        textDocument.uri,
        textDocument.getText(),
      )
    }
    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes(
      textDocument.uri,
    )
    // `parse` scopes the logger to this parse: the global one set in prepare()
    // can be replaced by any overlapping parse, which would capture our
    // messages.
    timing.phase('setup')
    const text = textDocument.getText()
    const { messages } = await parse(
      text,
      this.getOptions(attributes, registry, asciidocDocument),
      { timing },
    )
    this.asciidoctorDiagnosticProvider.reportErrors(messages, textDocument)
    logger.debug(
      timing.format(
        'Parsed for the diagnostics',
        textDocument.uri.toString(),
        text,
      ),
    )
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

  protected async prepare(
    textDocument: SkinnyTextDocument,
    manageDiagnostics = true,
  ) {
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
    if (manageDiagnostics) {
      this.asciidoctorDiagnosticProvider.delete(textDocumentUri)
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
  ) {
    super(
      asciidoctorConfigProvider,
      asciidoctorExtensionsProvider,
      asciidoctorDiagnosticProvider,
      context,
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
    // publishing to it. Diagnostics come from the fully-resolved parse in
    // `AsciidocLoader.load()` and the preview conversion.
    const timing = new ConversionTiming()
    const { registry } = await this.prepare(textDocument, false)
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
