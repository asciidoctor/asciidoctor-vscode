import { AsciidoctorConfigProvider } from './features/asciidoctorConfig'
import { AsciidoctorExtensionsProvider } from './features/asciidoctorExtensions'
import { AsciidocTextDocument } from './asciidocTextDocument'
import { Asciidoctor } from '@asciidoctor/core/types'
import { AsciidoctorProcessor } from './asciidoctorProcessor'
import { SkinnyTextDocument } from './util/document'
import { AsciidoctorAttributesConfig } from './features/asciidoctorAttributesConfig'
import { AsciidoctorDiagnosticProvider } from './features/asciidoctorDiagnostic'
import { AsciidoctorIncludeItemsProvider, IncludeItems } from './features/asciidoctorIncludeItems'

export class AsciidocLoader {
  protected readonly processor: Asciidoctor

  constructor (
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
    readonly asciidoctorDiagnosticProvider: AsciidoctorDiagnosticProvider
  ) {
    this.processor = AsciidoctorProcessor.getInstance().processor
  }

  public async load (textDocument: SkinnyTextDocument): Promise<Asciidoctor.Document> {
    const {
      memoryLogger,
      registry,
    } = await this.prepare(textDocument)
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).getBaseDir()
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    const doc = this.processor.load(textDocument.getText(), this.getOptions(attributes, registry, baseDir))
    this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
    return doc
  }

  protected getOptions (attributes: {}, registry: Asciidoctor.Extensions.Registry, baseDir: string) {
    return {
      attributes,
      extension_registry: registry,
      sourcemap: true,
      safe: 'unsafe',
      parse: true,
      ...(baseDir && { base_dir: baseDir }),
    }
  }

  protected async prepare (textDocument: SkinnyTextDocument) {
    const processor = this.processor
    const memoryLogger = processor.MemoryLogger.create()
    processor.LoggerManager.setLogger(memoryLogger)

    const registry = processor.Extensions.create()
    await this.asciidoctorExtensionsProvider.activate(registry)
    const textDocumentUri = textDocument.uri
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)

    this.asciidoctorDiagnosticProvider.delete(textDocumentUri)
    return {
      memoryLogger,
      registry,
    }
  }
}

export class AsciidocIncludeItemsLoader extends AsciidocLoader {
  constructor (
    readonly asciidoctorIncludeItemsProvider: AsciidoctorIncludeItemsProvider,
    readonly asciidoctorConfigProvider: AsciidoctorConfigProvider,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsProvider,
    readonly asciidoctorDiagnosticProvider: AsciidoctorDiagnosticProvider
  ) {
    super(asciidoctorConfigProvider, asciidoctorExtensionsProvider, asciidoctorDiagnosticProvider)
  }

  public async getIncludeItems (textDocument: SkinnyTextDocument): Promise<IncludeItems> {
    const {
      memoryLogger,
      registry,
    } = await this.prepare(textDocument)
    this.asciidoctorIncludeItemsProvider.activate(registry)
    const baseDir = AsciidocTextDocument.fromTextDocument(textDocument).getBaseDir()
    const attributes = AsciidoctorAttributesConfig.getPreviewAttributes()
    this.asciidoctorIncludeItemsProvider.reset()
    this.processor.load(textDocument.getText(), this.getOptions(attributes, registry, baseDir))
    this.asciidoctorDiagnosticProvider.reportErrors(memoryLogger, textDocument)
    return this.asciidoctorIncludeItemsProvider.get()
  }
}
