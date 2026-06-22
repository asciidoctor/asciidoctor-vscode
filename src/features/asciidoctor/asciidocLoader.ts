import {
  Document as AsciidoctorDocument,
  Extensions,
  LoggerManager,
  load,
  MemoryLogger,
  Registry,
} from '@asciidoctor/core'
import * as vscode from 'vscode'
import { SkinnyTextDocument } from '../../core/document.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from '../antora/antoraDocument.js'
import { AntoraIncludeProcessor } from '../antora/includeProcessor.js'
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
    const { registry } = await this.prepare(textDocument, false)
    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    return load(
      textDocument.getText(),
      this.getOptions(attributes, registry, asciidocDocument),
    )
  }

  /**
   * Parse the document and publish its Asciidoctor log messages as diagnostics.
   * This is the single source of diagnostics; it is driven by
   * `AsciidocDiagnosticManager` on document open/change only.
   */
  public async reportDiagnostics(
    textDocument: SkinnyTextDocument,
  ): Promise<void> {
    const { memoryLogger, registry } = await this.prepare(textDocument, true)
    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    await load(
      textDocument.getText(),
      this.getOptions(attributes, registry, asciidocDocument),
    )
    this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
  }

  protected getOptions(
    attributes: {},
    registry: Registry,
    asciidocDocument: AsciidocTextDocument,
  ) {
    return {
      attributes: {
        ...attributes,
        // Intrinsic attributes are not set automatically when the input is a
        // string, so provide docdir/docfile here to anchor relative includes
        // and images to the document's own directory. We deliberately do NOT
        // set base_dir (Asciidoctor derives it from docdir) unless the user
        // opted into useWorkspaceRootAsBaseDirectory (see #926).
        ...(asciidocDocument.dirName && { docdir: asciidocDocument.dirName }),
        ...(asciidocDocument.filePath && {
          docfile: asciidocDocument.filePath,
        }),
      },
      extension_registry: registry,
      sourcemap: true,
      safe: 'unsafe',
      parse: true,
      ...(asciidocDocument.baseDirOverride && {
        base_dir: asciidocDocument.baseDirOverride,
      }),
    }
  }

  protected async prepare(
    textDocument: SkinnyTextDocument,
    manageDiagnostics = true,
  ) {
    const memoryLogger = MemoryLogger.create()
    LoggerManager.setLogger(memoryLogger)

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
        new AntoraIncludeProcessor((_, target, cursor) =>
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
      memoryLogger,
      registry,
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
    const { registry } = await this.prepare(textDocument, false)
    this.asciidoctorIncludeItemsProvider.activate(registry)
    const asciidocDocument = AsciidocTextDocument.fromTextDocument(textDocument)
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    this.asciidoctorIncludeItemsProvider.reset()
    await load(
      textDocument.getText(),
      this.getOptions(attributes, registry, asciidocDocument),
    )
    return this.asciidoctorIncludeItemsProvider.get()
  }
}
