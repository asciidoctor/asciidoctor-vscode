import { Asciidoctor } from '@asciidoctor/core'
import { AsciidoctorProcessor } from '../asciidoctorProcessor'

interface IncludeEntry {
  index: number,
  name: string,
  position: number,
  length: number,
}

export interface IncludeItems extends Array<IncludeEntry> {
}

export interface AsciidoctorIncludeItemsProvider {
  activate (registry: Asciidoctor.Extensions.Registry)

  get ()

  reset ()
}

export class AsciidoctorIncludeItems implements AsciidoctorIncludeItemsProvider {
  private readonly findIncludeProcessorExtension

  constructor () {
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    this.findIncludeProcessorExtension = asciidoctorProcessor.processor.Extensions.createIncludeProcessor('FindIncludeProcessorExtension', {
      postConstruct: function () {
        this.includeItems = []
        this.includeIndex = 0
      },
      // @ts-ignore
      handles: function (_target) {
        return true
      },
      process: function (doc, reader, target, attrs) {
        // We don't meaningfully process the includes, we just want to identify
        // their line number and path if they belong in the base document

        // @ts-ignore
        if (reader.path === '<stdin>') {
          this.includeItems.push({
            index: this.includeIndex,
            name: target,
            // @ts-ignore
            position: reader.lineno - 1,
            length: target.length,
          })
          this.includeIndex += 1
        }
        return reader.pushInclude(['nothing'], target, target, 1, attrs)
      },
    }).$new()
  }

  activate (registry: Asciidoctor.Extensions.Registry) {
    registry.includeProcessor(this.findIncludeProcessorExtension)
  }

  get () {
    return (this.findIncludeProcessorExtension as any).includeItems
  }

  reset () {
    (this.findIncludeProcessorExtension as any).includeIndex = 0
    ;(this.findIncludeProcessorExtension as any).includeItems = []
  }
}
