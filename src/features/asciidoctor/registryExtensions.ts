// The extensions registered on an Asciidoctor registry, built from plain data so
// that the registry can be built in a worker thread (#1245).
//
// This module, and every module it imports, MUST NOT import `vscode`: the
// caller resolves the settings, the `.asciidoctorconfig` files and the trusted
// workspace extensions up front (see `AsciidoctorExtensions.resolve()` and
// `AsciidoctorConfig.getContent()`).
import {
  Document,
  Extensions,
  PreprocessorReader,
  Registry,
} from '@asciidoctor/core'
import { register as registerKroki } from 'asciidoctor-kroki'
import { requireFresh } from '../../core/requireExtension.js'
import { mermaidJSProcessor } from '../preview/mermaid.js'
import { plantumlJSProcessor } from '../preview/plantuml.js'
import type { AsciidoctorProcessingMode } from './asciidoctorExtensionContributions.js'

/**
 * Registers a preprocessor that prepends the content of the
 * `.asciidoctorconfig` files to the document.
 */
export function registerAsciidoctorConfig(
  registry: Registry,
  content: string,
): void {
  registry.preprocessor(
    Extensions.newPreprocessor('PrependConfigPreprocessorExtension', {
      process: (_doc: Document, reader: PreprocessorReader) => {
        if (content.length > 0) {
          // otherwise an empty line at the beginning breaks level 0 detection
          reader.pushInclude(content, undefined, undefined, 1, {})
        }
      },
    }),
  )
}

/**
 * Registers the extensions bundled with the extension: Kroki (or the local
 * PlantUML rendering when Kroki is disabled) and Mermaid.
 */
export function registerBuiltInExtensions(
  registry: Registry,
  options: {
    /** The `asciidoc.extensions.enableKroki` setting. */
    enableKroki: boolean
    mode?: AsciidoctorProcessingMode
    /** The localized alternative text of the PlantUML diagrams. */
    plantUmlAlt: string
  },
): void {
  // The `load` parse backs diagnostics and language features: its output is
  // never rendered, yet it runs on every edit. With Kroki registered, it would
  // send each diagram to the server and, with `kroki-fetch-diagram`, write the
  // images into the workspace.
  if (options.enableKroki) {
    if (options.mode !== 'load') {
      registerKroki(registry)
    }
  } else {
    registry.block('plantuml', plantumlJSProcessor(options.plantUmlAlt))
  }
  registry.block('mermaid', mermaidJSProcessor())
}

/**
 * Registers the extensions of the workspace (`.asciidoctor/lib/**\/*.js`),
 * already trusted by the user. Returns the extensions that failed to load.
 */
export function registerWorkspaceExtensions(
  registry: Registry,
  files: readonly string[],
): { file: string; error: string }[] {
  const failures: { file: string; error: string }[] = []
  for (const file of files) {
    try {
      const extjs = requireFresh(file) as {
        register(registry: Registry): void
      }
      extjs.register(registry)
    } catch (e) {
      failures.push({ file, error: String(e) })
    }
  }
  return failures
}
