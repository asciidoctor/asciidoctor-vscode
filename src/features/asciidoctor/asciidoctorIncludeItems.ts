import { Extensions, Registry } from '@asciidoctor/core'

interface IncludeEntry {
  index: number
  name: string
  position: number
  length: number
}

export interface IncludeItems extends Array<IncludeEntry> {}

/** State stored on the include processor extension instance between renders. */
interface FindIncludeProcessorState {
  includeItems: IncludeItems
  includeIndex: number
}

export interface AsciidoctorIncludeItemsProvider {
  activate(registry: Registry)

  get()

  reset()
}

export class AsciidoctorIncludeItems
  implements AsciidoctorIncludeItemsProvider
{
  private readonly findIncludeProcessorExtension

  constructor() {
    this.findIncludeProcessorExtension = Extensions.newIncludeProcessor(
      'FindIncludeProcessorExtension',
      {
        postConstruct: function (this: FindIncludeProcessorState) {
          this.includeItems = []
          this.includeIndex = 0
        },
        // @ts-ignore
        handles: function (_target) {
          return true
        },
        process: function (
          this: FindIncludeProcessorState,
          doc,
          reader,
          target,
          attrs,
        ) {
          // We don't meaningfully process the includes, we just want to identify
          // their line number and path if they belong in the base document.
          //
          // Only record top-level includes (those written directly in the base
          // document), not includes nested inside an included file. The reader's
          // include depth is 0 while reading the base document and >= 1 once it
          // has descended into an include. This is robust regardless of whether
          // `docfile` is set; the previous `reader.path === '<stdin>'` test only
          // held when `docfile` was absent — with it set, the top-level reader
          // path becomes the file name instead of `<stdin>`.
          // @ts-ignore
          if (reader.getIncludeDepth() === 0) {
            this.includeItems.push({
              index: this.includeIndex,
              name: target,
              // @ts-ignore
              position: reader.lineno - 1,
              length: target.length,
            })
            this.includeIndex += 1
          }
          // Replace the include with an empty line rather than a placeholder
          // word: a placeholder paragraph distorts the document structure (e.g.
          // it inserts a block before a `= Document Title`, which then triggers
          // a spurious "level 0 sections can only be used when doctype is book"
          // (#987)). An empty line keeps the surrounding structure intact while
          // still letting us record the include's position above.
          return reader.pushInclude([''], target, target, 1, attrs)
        },
      },
    )
  }

  activate(registry: Registry) {
    registry.includeProcessor(this.findIncludeProcessorExtension)
  }

  get() {
    return (
      this.findIncludeProcessorExtension as unknown as FindIncludeProcessorState
    ).includeItems
  }

  reset() {
    const state = this
      .findIncludeProcessorExtension as unknown as FindIncludeProcessorState
    state.includeIndex = 0
    state.includeItems = []
  }
}
