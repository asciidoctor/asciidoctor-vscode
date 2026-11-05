// The conversion of a document for the preview, from plain data, so that it can
// run in a worker thread (#1245) as well as in the extension host.
//
// This module, and every module it imports, MUST NOT import `vscode`: the
// extension host resolves everything that needs the VS Code API into a
// `PreviewRequest` (see `AsciidocEngine.convertFromTextDocument`), and the
// conversion reads files through the `PreviewHost`.
// `src/test/unit/previewConversion.test.ts` imports this module in plain Node,
// where `vscode` cannot be resolved.
import {
  Document as AsciidoctorDocument,
  ConverterFactory,
  Extensions,
  Registry,
} from '@asciidoctor/core'
import { URI, Utils } from 'vscode-uri'
import { ConversionTiming } from '../../lib/conversionTiming.js'
import { AsciidoctorProcessor } from '../asciidoctor/asciidoctorProcessor.js'
import {
  buildPreviewOptions,
  convert,
  type DocumentLocation,
  parseHeader,
  WEBVIEW_BACKEND,
} from '../asciidoctor/conversion.js'
import {
  registerAsciidoctorConfig,
  registerBuiltInExtensions,
  registerWorkspaceExtensions,
} from '../asciidoctor/registryExtensions.js'
import type { AsciidocPreviewSecurityLevel } from '../securityLevel.js'
import {
  AsciidoctorWebViewConverter,
  type PreviewAntoraContext,
  type PreviewResourceProvider,
  type PreviewStrings,
} from './asciidoctorWebViewConverter.js'
import { register as registerHighlightJs } from './highlightjs-adapter.js'
import type { AsciidocPreviewConfiguration } from './previewConfig.js'

/** A URI, as plain data. */
export interface UriComponents {
  readonly scheme: string
  readonly authority: string
  readonly path: string
  readonly query: string
  readonly fragment: string
}

/**
 * Everything the preview conversion needs, as plain data that can be sent to a
 * worker thread.
 */
export interface PreviewRequest {
  readonly text: string
  readonly documentUri: UriComponents
  readonly lineCount: number
  readonly location: DocumentLocation
  /** The attributes from the settings (`asciidoc.preview.asciidoctorAttributes`...). */
  readonly attributes: { [key: string]: any }
  /** The attributes of the Antora component, if any. */
  readonly antoraAttributes: { [key: string]: any }
  /** Whether the active color theme is dark (or high contrast). */
  readonly darkTheme: boolean
  readonly templateDirs: string[]
  /** The content of the `.asciidoctorconfig` files, or an empty string. */
  readonly asciidoctorConfig: string
  readonly extensions: {
    /** The `asciidoc.extensions.enableKroki` setting. */
    readonly enableKroki: boolean
    /** The paths of the trusted workspace extensions (`.asciidoctor/lib`). */
    readonly workspaceExtensionFiles: string[]
  }
  /** The root of the extension, to load the scripts and styles of the preview. */
  readonly extensionUri: UriComponents
  /** `vscode.Webview.cspSource`. */
  readonly cspSource: string
  readonly securityLevel: AsciidocPreviewSecurityLevel
  readonly disableSecurityWarnings: boolean
  readonly contributions: {
    readonly previewScripts: UriComponents[]
    readonly previewStyles: UriComponents[]
  }
  readonly config: AsciidocPreviewConfiguration
  /** The line to scroll to once the preview has loaded. */
  readonly line?: number
  /** The anchor to scroll to once the preview has loaded. */
  readonly fragment?: string
  /** The workspace folder of the document, if any. */
  readonly workspaceFolderUri?: UriComponents
  readonly strings: PreviewStrings
  /** Whether the webview logs `[asciidoc.preview]` debug messages. */
  readonly debug: boolean
}

/** The services of the thread that owns the VS Code API. */
export interface PreviewHost {
  /** Reads a file through `vscode.workspace.fs`. */
  readFile(uri: UriComponents): Promise<Uint8Array>

  warn(message: string): void
}

/**
 * What the conversion needs from the extension host that cannot be sent to a
 * worker thread: the conversion of a document that needs them stays in the
 * extension host.
 */
export interface InProcessPreviewHooks {
  readonly antoraDocumentContext?: PreviewAntoraContext
  /** Registers the extensions contributed by other VS Code extensions. */
  registerContributedExtensions?(registry: Registry): Promise<void>
  /** Registers an include processor (Antora, VS Code for the Web). */
  registerIncludeProcessor?(registry: Registry): Promise<void>
}

export interface PreviewResult {
  /**
   * The HTML of the preview, where the URIs of the local resources are tokens:
   * see `resolveWebviewResources`.
   */
  readonly html: string
  /** The resources referenced by the tokens of the HTML, by token id. */
  readonly resources: { [id: string]: UriComponents }
  /** The workspace extensions that failed to load. */
  readonly extensionFailures: { file: string; error: string }[]
  /** The duration of the conversion and its phases, for the log. */
  readonly timing: string
  /** The converted document, unless the conversion ran in a worker thread. */
  readonly document?: AsciidoctorDocument
}

/**
 * Converts a document for the preview.
 */
export async function convertForPreview(
  request: PreviewRequest,
  host: PreviewHost,
  hooks: InProcessPreviewHooks = {},
): Promise<PreviewResult> {
  const timing = new ConversionTiming()
  const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
  // Capture Asciidoctor log messages so they do not leak to the console.
  // The preview never reports diagnostics: that is owned by
  // AsciidocDiagnosticManager and refreshed on document open/change only, so
  // opening or closing the preview does not (re)compute or clear them.
  asciidoctorProcessor.activateMemoryLogger()

  // Load the header only to get the attributes the converter needs up front
  // (`kroki-server-url`...). Apply `.asciidoctorconfig` to it as well, so the
  // resolved `kroki-server-url` — and therefore the CSP allow-list built from
  // it — reflects a URL defined only in the configuration file. This matters
  // for a non-`https:` server (e.g. `http://localhost:8000`), which the CSP's
  // `https:` wildcard does not cover.
  const headerOnlyRegistry = Extensions.create()
  registerAsciidoctorConfig(headerOnlyRegistry, request.asciidoctorConfig)
  const header = await parseHeader(request.text, {
    attributes: request.attributes,
    registry: headerOnlyRegistry,
  })
  timing.phase('header')

  const documentUri = URI.from(request.documentUri)
  const resourceProvider = new WebviewResourceRecorder(
    URI.from(request.extensionUri),
    request.cspSource,
  )
  const converter = new AsciidoctorWebViewConverter({
    textDocument: { uri: documentUri, lineCount: request.lineCount },
    resourceProvider,
    securityLevel: request.securityLevel,
    disableSecurityWarnings: request.disableSecurityWarnings,
    contributions: {
      previewScripts: request.contributions.previewScripts.map((uri) =>
        URI.from(uri),
      ),
      previewStyles: request.contributions.previewStyles.map((uri) =>
        URI.from(uri),
      ),
    },
    config: request.config,
    antoraDocumentContext: hooks.antoraDocumentContext,
    line: request.line,
    krokiServerUrl: header.krokiServerUrl,
    dataUriEnabled: header.dataUriEnabled,
    fragment: request.fragment,
    workspaceFolderUri: request.workspaceFolderUri
      ? URI.from(request.workspaceFolderUri)
      : undefined,
    strings: request.strings,
    debug: request.debug,
    host: {
      readFile: (uri) => host.readFile(toComponents(uri)),
      warn: (message) => host.warn(message),
    },
  })
  ConverterFactory.register(converter, WEBVIEW_BACKEND)

  const registry = Extensions.create()
  registerBuiltInExtensions(registry, {
    enableKroki: request.extensions.enableKroki,
    mode: 'preview',
    plantUmlAlt: request.strings.plantUml.alt,
  })
  await hooks.registerContributedExtensions?.(registry)
  const extensionFailures = registerWorkspaceExtensions(
    registry,
    request.extensions.workspaceExtensionFiles,
  )
  registerAsciidoctorConfig(registry, request.asciidoctorConfig)
  await hooks.registerIncludeProcessor?.(registry)
  registerHighlightJs(
    asciidoctorProcessor.highlightjsBuiltInSyntaxHighlighter,
    resourceProvider,
    { darkTheme: request.darkTheme },
  )
  const options = buildPreviewOptions({
    attributes: request.attributes,
    antoraAttributes: request.antoraAttributes,
    header,
    darkTheme: request.darkTheme,
    location: request.location,
    templateDirs: request.templateDirs,
    registry,
  })
  timing.phase('setup')

  const { html, document } = await convert(request.text, options, {
    annotate: true,
    timing,
  })
  return {
    html,
    resources: resourceProvider.resources,
    extensionFailures,
    timing: timing.format(
      'Converted for the preview',
      documentUri.toString(),
      request.text,
    ),
    document,
  }
}

const RESOURCE_TOKEN_PREFIX = 'vscode-asciidoc-resource://'
// The id is the base64url encoding of the URI, so a token only depends on the
// resource: the fingerprint of the webview shell, which contains some of them,
// stays the same between two renders (see `hashShellParts`). The scheme makes
// Asciidoctor treat a token as a URI, e.g. not prefix an image with imagesdir.
const RESOURCE_TOKEN_RX = /vscode-asciidoc-resource:\/\/([A-Za-z0-9_-]+)~/g

/**
 * A `PreviewResourceProvider` that cannot compute webview URIs, since only the
 * webview, in the extension host, can: it returns a token for each resource,
 * that `resolveWebviewResources` replaces with the webview URI.
 */
export class WebviewResourceRecorder implements PreviewResourceProvider {
  readonly resources: { [id: string]: UriComponents } = {}

  constructor(
    private readonly extensionUri: URI,
    readonly cspSource: string,
  ) {}

  asWebviewUri(resource: URI): string {
    const id = base64url(resource.toString())
    this.resources[id] ??= toComponents(resource)
    return `${RESOURCE_TOKEN_PREFIX}${id}~`
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return this.asWebviewUri(Utils.joinPath(this.extensionUri, ...pathSegments))
  }
}

/**
 * Replaces the resource tokens of the HTML returned by `convertForPreview`
 * with the webview URIs. A token that was not recorded during the conversion,
 * e.g. typed in the document, is left as is.
 */
export function resolveWebviewResources(
  html: string,
  resources: { readonly [id: string]: UriComponents },
  asWebviewUri: (resource: UriComponents) => string,
): string {
  const webviewUris = new Map<string, string>()
  return html.replace(RESOURCE_TOKEN_RX, (token, id: string) => {
    if (!Object.hasOwn(resources, id)) {
      return token
    }
    let webviewUri = webviewUris.get(id)
    if (webviewUri === undefined) {
      webviewUri = asWebviewUri(resources[id])
      webviewUris.set(id, webviewUri)
    }
    return webviewUri
  })
}

function toComponents(uri: URI): UriComponents {
  return {
    scheme: uri.scheme,
    authority: uri.authority,
    path: uri.path,
    query: uri.query,
    fragment: uri.fragment,
  }
}

function base64url(value: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(value)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
