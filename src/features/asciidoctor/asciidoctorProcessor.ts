import {
  LoggerManager,
  MemoryLogger,
  SyntaxHighlighter,
} from '@asciidoctor/core'

export class AsciidoctorProcessor {
  // eslint-disable-next-line no-use-before-define
  private static instance: AsciidoctorProcessor
  public readonly highlightjsBuiltInSyntaxHighlighter: any

  private constructor() {
    // capture the built-in highlighter before the adapter overwrites it
    this.highlightjsBuiltInSyntaxHighlighter =
      SyntaxHighlighter.for('highlight.js')
  }

  public static getInstance(): AsciidoctorProcessor {
    if (!AsciidoctorProcessor.instance) {
      AsciidoctorProcessor.instance = new AsciidoctorProcessor()
    }
    return AsciidoctorProcessor.instance
  }

  public activateMemoryLogger(): any {
    const memoryLogger = MemoryLogger.create()
    LoggerManager.setLogger(memoryLogger)
    return memoryLogger
  }

  public restoreBuiltInSyntaxHighlighter() {
    SyntaxHighlighter.register(
      this.highlightjsBuiltInSyntaxHighlighter,
      'highlight.js',
      'highlightjs',
    )
  }
}
