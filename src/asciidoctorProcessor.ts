import asciidoctor, { Asciidoctor } from '@asciidoctor/core'
import docbookConverter from '@asciidoctor/docbook-converter'

export class AsciidoctorProcessor {
  // eslint-disable-next-line no-use-before-define
  private static instance: AsciidoctorProcessor
  public readonly highlightjsBuiltInSyntaxHighlighter: any
  public readonly processor: Asciidoctor

  private constructor () {
    this.processor = asciidoctor()
    this.highlightjsBuiltInSyntaxHighlighter = (this.processor.SyntaxHighlighter as any).for('highlight.js')
    docbookConverter.register()
  }

  public static getInstance (): AsciidoctorProcessor {
    if (!AsciidoctorProcessor.instance) {
      AsciidoctorProcessor.instance = new AsciidoctorProcessor()
    }

    return AsciidoctorProcessor.instance
  }

  public activateMemoryLogger (): Asciidoctor.MemoryLogger {
    const memoryLogger = this.processor.MemoryLogger.create()
    this.processor.LoggerManager.setLogger(memoryLogger)
    return memoryLogger
  }

  public restoreBuiltInSyntaxHighlighter () {
    this.highlightjsBuiltInSyntaxHighlighter.$register_for('highlight.js', 'highlightjs')
  }
}
