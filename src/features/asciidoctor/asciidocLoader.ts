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
    const { memoryLogger, registry } = await this.prepare(textDocument)
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).baseDir
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    const doc = await load(
      textDocument.getText(),
      this.getOptions(attributes, registry, baseDir),
    )
    this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
    return doc
  }

  protected getOptions(attributes: {}, registry: Registry, baseDir: string) {
    return {
      attributes,
      extension_registry: registry,
      sourcemap: true,
      safe: 'unsafe',
      parse: true,
      ...(baseDir && { base_dir: baseDir }),
    }
  }

  protected async prepare(
    textDocument: SkinnyTextDocument,
    manageDiagnostics = true,
  ) {
    const memoryLogger = MemoryLogger.create()
    LoggerManager.setLogger(memoryLogger)

    const registry = Extensions.create()
    await this.asciidoctorExtensionsProvider.activate(registry)
    const textDocumentUri = textDocument.uri
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
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).baseDir
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    this.asciidoctorIncludeItemsProvider.reset()
    await load(
      textDocument.getText(),
      this.getOptions(attributes, registry, baseDir),
    )
    return this.asciidoctorIncludeItemsProvider.get()
  }
}
