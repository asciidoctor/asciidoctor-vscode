// Fixtures of the preview conversion tests, which run in plain Node.
import type { AsciidocPreviewConfiguration } from '../../features/preview/previewConfig.js'
import type {
  PreviewHost,
  PreviewRequest,
  UriComponents,
} from '../../features/preview/previewConversion.js'
import { AsciidocPreviewSecurityLevel } from '../../features/securityLevel.js'

export function fileUri(path: string): UriComponents {
  return { scheme: 'file', authority: '', path, query: '', fragment: '' }
}

const config = {
  scrollBeyondLastLine: false,
  wordWrap: false,
  doubleClickToSwitchToEditor: true,
  scrollEditorWithPreview: true,
  scrollPreviewWithEditor: true,
  markEditorSelection: true,
  preservePreviewWhenHidden: false,
  lineHeight: Number.NaN,
  fontSize: Number.NaN,
  fontFamily: undefined,
  additionalStyles: [],
  refreshInterval: 1000,
  defaultStyle: 'asciidoctor',
  defaultStyleExplicit: true,
  previewStyle: '',
  previewTemplates: [],
} as unknown as AsciidocPreviewConfiguration

/** A request to convert `text`, as the document `/docs/index.adoc`. */
export function previewRequest(
  text: string,
  overrides: Partial<PreviewRequest> = {},
): PreviewRequest {
  return {
    text,
    documentUri: fileUri('/docs/index.adoc'),
    lineCount: text.split('\n').length,
    location: {
      dirName: '/docs',
      fileName: 'index',
      filePath: '/docs/index.adoc',
      extensionName: '.adoc',
    },
    attributes: {},
    antoraAttributes: {},
    darkTheme: false,
    templateDirs: [],
    asciidoctorConfig: '',
    extensions: { enableKroki: false, workspaceExtensionFiles: [] },
    extensionUri: fileUri('/extension'),
    cspSource: 'csp-source',
    securityLevel: AsciidocPreviewSecurityLevel.Strict,
    disableSecurityWarnings: false,
    contributions: { previewScripts: [], previewStyles: [] },
    config,
    strings: {
      preview: {
        cspAlertMessageText: 'text',
        cspAlertMessageTitle: 'title',
        cspAlertMessageLabel: 'label',
        staleImageTitle: 'stale',
      },
      plantUml: {
        alt: 'PlantUML diagram',
        loadFailed: '{0}',
        timeout: 'timeout',
      },
    },
    debug: false,
    ...overrides,
  }
}

/** A host whose files are the given ones, that records what it is asked. */
export function fakeHost(files: { [path: string]: Uint8Array } = {}) {
  const reads: string[] = []
  const warnings: string[] = []
  const host: PreviewHost = {
    readFile: async (uri) => {
      reads.push(uri.path)
      const content = files[uri.path]
      if (content === undefined) {
        throw new Error(`${uri.path} not found`)
      }
      return content
    },
    warn: (message) => {
      warnings.push(message)
    },
  }
  return { host, reads, warnings }
}

/** Resolves a resource token as `webview:<path>`. */
export function asTestWebviewUri(resource: UriComponents): string {
  return `webview:${resource.path}`
}

/** Removes the nonce, regenerated on each conversion. */
export function withoutNonce(html: string): string {
  const nonce = html.match(/nonce-([^']+)'/)?.[1]
  return nonce === undefined ? html : html.split(nonce).join('NONCE')
}
