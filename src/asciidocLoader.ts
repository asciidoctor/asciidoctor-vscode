import {
  Document as AsciidoctorDocument,
  Extensions,
  LoggerManager,
  load,
  MemoryLogger,
  Registry,
} from '@asciidoctor/core'
import * as vscode from 'vscode'
import { AsciidocTextDocument } from './asciidocTextDocument.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from './features/antora/antoraDocument.js'
import { AntoraIncludeProcessor } from './features/antora/includeProcessor.js'
import { resolveIncludeFile } from './features/antora/resolveIncludeFile.js'
import { AsciidoctorAttributesConfig } from './features/asciidoctorAttributesConfig.js'
import { AsciidoctorConfigProvider } from './features/asciidoctorConfig.js'
import { AsciidoctorDiagnosticProvider } from './features/asciidoctorDiagnostic.js'
import { AsciidoctorExtensionsProvider } from './features/asciidoctorExtensions.js'
import {
  AsciidoctorIncludeItemsProvider,
  IncludeItems,
} from './features/asciidoctorIncludeItems.js'
import { SkinnyTextDocument } from './util/document.js'

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

  protected async prepare(textDocument: SkinnyTextDocument) {
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
    this.asciidoctorDiagnosticProvider.delete(textDocumentUri)
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
    const { memoryLogger, registry } = await this.prepare(textDocument)
    this.asciidoctorIncludeItemsProvider.activate(registry)
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).baseDir
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    this.asciidoctorIncludeItemsProvider.reset()
    await load(
      textDocument.getText(),
      this.getOptions(attributes, registry, baseDir),
    )
    this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
    return this.asciidoctorIncludeItemsProvider.get()
  }
}
