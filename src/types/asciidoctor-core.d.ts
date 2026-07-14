import type {
  IncludeProcessor,
  Preprocessor,
  ProcessorExtension,
} from '@asciidoctor/core'

declare module '@asciidoctor/core' {
  // The 4.0 typings only declare the class-constructor and DSL-function forms
  // of the Registry registration methods, but the runtime also accepts an
  // already-constructed processor instance ("style 3" in
  // Registry#_addDocumentProcessor). The instance form is what allows keeping
  // per-render state reachable from the extension host (e.g.
  // AsciidoctorIncludeItems), so restore these overloads until upstream
  // declares them.
  interface Registry {
    preprocessor(processor: Preprocessor): ProcessorExtension
    includeProcessor(processor: IncludeProcessor): ProcessorExtension
  }

  // Preprocessor and include processor callbacks actually receive a
  // PreprocessorReader, but the typings declare the parameter as Reader and do
  // not re-export PreprocessorReader from the package root. Surface the
  // PreprocessorReader members the extension relies on.
  interface Reader {
    getIncludeDepth(): number
    pushInclude(
      data: string | string[],
      file?: string | object | null,
      path?: string | null,
      lineno?: number,
      attributes?: object,
    ): this
  }
}
