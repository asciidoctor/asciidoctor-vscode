import { Document as AsciidoctorDocument, Extensions } from '@asciidoctor/core'
import * as vscode from 'vscode'
import { SkinnyTextDocument } from '../../core/document.js'
import { logger } from '../../core/logger.js'
import { WebviewResourceProvider } from '../../core/resources.js'
import { getWorkspaceFolder } from '../../core/workspace.js'
import { ConversionTiming } from '../../lib/conversionTiming.js'
import {
  AntoraDocumentContext,
  AntoraSupportManager,
} from '../antora/antoraContext.js'
import {
  getAntoraConfig,
  getAntoraDocumentContext,
} from '../antora/antoraDocument.js'
import { resolveIncludeFile } from '../antora/resolveIncludeFile.js'
import { AsciidocContributionProvider } from '../extensionContributions.js'
import { plantUmlStrings } from '../preview/plantumlStrings.js'
import {
  AsciidocPreviewConfiguration,
  AsciidocPreviewConfigurationManager,
} from '../preview/previewConfig.js'
import {
  convertForPreview,
  type InProcessPreviewHooks,
  type PreviewRequest,
  type PreviewResult,
  resolveWebviewResources,
  type UriComponents,
} from '../preview/previewConversion.js'
import {
  isDarkTheme,
  isPreviewDebugEnabled,
  previewHost,
  previewStrings,
} from '../preview/previewEnvironment.js'
import {
  type PreviewWorker,
  PreviewWorkerUnavailableError,
} from '../preview/previewWorkerClient.js'
import { ExtensionContentSecurityPolicyArbiter } from '../security.js'
import { AsciidocTextDocument } from './asciidocTextDocument.js'
import { AsciidoctorAttributesConfig } from './asciidoctorAttributesConfig.js'
import { AsciidoctorConfigResolver } from './asciidoctorConfig.js'
import { AsciidoctorExtensionsResolver } from './asciidoctorExtensions.js'
import { AsciidoctorProcessor } from './asciidoctorProcessor.js'
import { registerBrowserIncludeProcessor } from './browserIncludeSupport.js'
import {
  buildExportOptions,
  convert,
  type DocumentLocation,
} from './conversion.js'
import { ResolverIncludeProcessor } from './includeProcessor.js'
import { addMermaidToHtmlExport } from './mermaidExport.js'
import { addPlantUmlToHtmlExport } from './plantumlExport.js'
import { getTemplateDirs } from './templateDirs.js'

export type AsciidoctorBuiltInBackends = 'html5' | 'docbook5'

const previewConfigurationManager = new AsciidocPreviewConfigurationManager()

export class AsciidocEngine {
  constructor(
    readonly contributionProvider: AsciidocContributionProvider,
    readonly asciidoctorConfigProvider: AsciidoctorConfigResolver,
    readonly asciidoctorExtensionsProvider: AsciidoctorExtensionsResolver,
    /**
     * Runs the preview conversion off the extension host thread (desktop
     * only). Without it, the preview is converted in the extension host.
     */
    private readonly previewWorker?: PreviewWorker,
  ) {}

  // Export

  public async export(
    textDocument: vscode.TextDocument,
    backend: AsciidoctorBuiltInBackends,
    asciidoctorAttributes = {},
  ): Promise<{ output: string; document: AsciidoctorDocument }> {
    const timing = new ConversionTiming()
    const asciidoctorProcessor = AsciidoctorProcessor.getInstance()
    // Capture Asciidoctor log messages so they do not leak to the console.
    // Diagnostics are owned by AsciidocDiagnosticManager (driven by document
    // open/change), so neither exporting nor previewing reports them here.
    asciidoctorProcessor.activateMemoryLogger()

    const registry = Extensions.create()
    const textDocumentUri = textDocument.uri
    await this.asciidoctorExtensionsProvider.activate(registry, {
      documentUri: textDocumentUri,
      mode: 'export',
    })
    await this.asciidoctorConfigProvider.activate(registry, textDocumentUri)
    asciidoctorProcessor.restoreBuiltInSyntaxHighlighter()
    // In the browser, resolve `include::` targets via vscode.workspace.fs since
    // Asciidoctor.js cannot read them from disk (no-op on desktop).
    await registerBrowserIncludeProcessor(
      registry,
      textDocumentUri,
      textDocument.getText(),
    )

    const options = buildExportOptions({
      attributes: {
        // Soft default (`@`): the document header and `.asciidoctorconfig`
        // still win over the `asciidoc.extensions.kroki.serverUrl` setting.
        ...AsciidoctorAttributesConfig.defaultKrokiServerUrl(
          textDocumentUri,
          asciidoctorAttributes,
        ),
        ...AsciidoctorAttributesConfig.defaultSourceHighlighter(
          asciidoctorAttributes,
        ),
        ...asciidoctorAttributes,
      },
      backend,
      location: AsciidocTextDocument.fromTextDocument(textDocument),
      templateDirs: await getTemplateDirs(textDocumentUri),
      registry,
    })
    timing.phase('setup')
    const text = textDocument.getText()
    const { html: convertedOutput, document } = await convert(text, options, {
      timing,
    })
    const output =
      backend === 'html5'
        ? addPlantUmlToHtmlExport(
            addMermaidToHtmlExport(convertedOutput),
            plantUmlStrings(),
          )
        : convertedOutput
    logger.debug(
      timing.format(
        `Converted to ${backend}`,
        textDocumentUri.toString(),
        text,
      ),
    )
    return {
      output,
      document,
    }
  }

  // Convert (preview)

  public async convertFromUri(
    documentUri: vscode.Uri,
    context: vscode.ExtensionContext,
    editor: WebviewResourceProvider,
    line?: number,
  ): Promise<{ html: string; document?: AsciidoctorDocument }> {
    const textDocument = await vscode.workspace.openTextDocument(documentUri)
    const { html, document } = await this.convertFromTextDocument(
      textDocument,
      context,
      editor,
      line,
    )
    return {
      html,
      document,
    }
  }

  public async convertFromTextDocument(
    textDocument: SkinnyTextDocument,
    context: vscode.ExtensionContext,
    editor: WebviewResourceProvider,
    line?: number,
    fragment?: string,
  ): Promise<{ html: string; document?: AsciidoctorDocument }> {
    const timing = new ConversionTiming()
    const textDocumentUri = textDocument.uri
    const text = textDocument.getText()
    // Antora Resource Identifiers resolution
    const antoraDocumentContext = await getAntoraDocumentContext(
      textDocumentUri,
      context.workspaceState,
    )
    const cspArbiter = new ExtensionContentSecurityPolicyArbiter(
      context.globalState,
      context.workspaceState,
    )
    const extensions = await this.asciidoctorExtensionsProvider.resolve()
    const antoraSupport = AntoraSupportManager.getInstance(
      context.workspaceState,
    )
    const workspaceFolderUri = getWorkspaceFolder(textDocumentUri)?.uri
    const request: PreviewRequest = {
      text,
      documentUri: toUriComponents(textDocumentUri),
      lineCount: textDocument.lineCount,
      location: toDocumentLocation(
        AsciidocTextDocument.fromTextDocument(textDocument),
      ),
      attributes:
        AsciidoctorAttributesConfig.getPreviewAttributes(textDocumentUri),
      antoraAttributes: await antoraSupport.getAttributes(textDocumentUri),
      darkTheme: isDarkTheme(),
      templateDirs: await getTemplateDirs(textDocumentUri),
      asciidoctorConfig:
        await this.asciidoctorConfigProvider.getContent(textDocumentUri),
      extensions: {
        enableKroki: extensions.enableKroki,
        workspaceExtensionFiles: extensions.workspaceExtensionFiles,
      },
      extensionUri: toUriComponents(this.contributionProvider.extensionUri),
      cspSource: editor.cspSource,
      securityLevel: cspArbiter.getSecurityLevelForResource(textDocumentUri),
      disableSecurityWarnings: cspArbiter.shouldDisableSecurityWarnings(),
      contributions: {
        previewScripts:
          this.contributionProvider.contributions.previewScripts.map(
            toUriComponents,
          ),
        previewStyles:
          this.contributionProvider.contributions.previewStyles.map(
            toUriComponents,
          ),
      },
      config: {
        ...previewConfigurationManager.loadAndCacheConfiguration(
          textDocumentUri,
        ),
      } as AsciidocPreviewConfiguration,
      line,
      fragment,
      workspaceFolderUri: workspaceFolderUri
        ? toUriComponents(workspaceFolderUri)
        : undefined,
      strings: previewStrings(),
      debug: isPreviewDebugEnabled(),
    }
    timing.phase('prepare')

    try {
      const result = await this.runPreviewConversion(request, {
        antoraDocumentContext,
        hasContributedExtensions: extensions.hasContributedExtensions,
        textDocumentUri,
      })
      timing.phase(result.inWorker ? 'worker' : 'convert')
      this.asciidoctorExtensionsProvider.reportFailures(
        result.extensionFailures,
      )
      const html = resolveWebviewResources(
        result.html,
        result.resources,
        (resource) => editor.asWebviewUri(vscode.Uri.from(resource)).toString(),
      )
      timing.phase('resolve')
      logger.debug(result.timing)
      logger.debug(
        timing.format(
          result.inWorker
            ? 'Rendered the preview in a worker thread'
            : 'Rendered the preview',
          textDocumentUri.toString(),
          text,
        ),
      )
      return { html, document: result.document }
    } catch (e) {
      vscode.window.showErrorMessage(String(e))
      throw e
    }
  }

  /**
   * Runs the conversion in the worker thread when there is one and the
   * document does not need the extension host, otherwise in the extension
   * host. Falls back to the extension host when the worker thread fails.
   */
  private async runPreviewConversion(
    request: PreviewRequest,
    {
      antoraDocumentContext,
      hasContributedExtensions,
      textDocumentUri,
    }: {
      antoraDocumentContext: AntoraDocumentContext | undefined
      hasContributedExtensions: boolean
      textDocumentUri: vscode.Uri
    },
  ): Promise<PreviewResult & { inWorker: boolean }> {
    // The extensions contributed by other VS Code extensions are registered by
    // them, and the Antora content catalog lives in the extension host.
    if (
      this.previewWorker !== undefined &&
      antoraDocumentContext === undefined &&
      !hasContributedExtensions
    ) {
      try {
        return {
          ...(await this.previewWorker.convert(request, previewHost)),
          inWorker: true,
        }
      } catch (e) {
        if (!(e instanceof PreviewWorkerUnavailableError)) {
          throw e
        }
        logger.warn(
          `Unable to convert in a worker thread, converting in the extension host instead: ${e.message}`,
        )
      }
    }
    const hooks: InProcessPreviewHooks = {
      antoraDocumentContext,
      registerContributedExtensions: (registry) =>
        this.asciidoctorExtensionsProvider.registerContributedExtensions(
          registry,
          { documentUri: textDocumentUri, mode: 'preview' },
        ),
      registerIncludeProcessor: async (registry) => {
        if (antoraDocumentContext !== undefined) {
          const antoraConfig = await getAntoraConfig(textDocumentUri)
          registry.includeProcessor(
            new ResolverIncludeProcessor((_, target, cursor) =>
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
        } else {
          // In the browser, Asciidoctor.js cannot read `include::` targets
          // from disk; resolve them via vscode.workspace.fs instead (no-op on
          // desktop).
          await registerBrowserIncludeProcessor(
            registry,
            textDocumentUri,
            request.text,
          )
        }
      },
    }
    return {
      ...(await convertForPreview(request, previewHost, hooks)),
      inWorker: false,
    }
  }
}

function toUriComponents(uri: vscode.Uri): UriComponents {
  return {
    scheme: uri.scheme,
    authority: uri.authority,
    path: uri.path,
    query: uri.query,
    fragment: uri.fragment,
  }
}

function toDocumentLocation(document: AsciidocTextDocument): DocumentLocation {
  return {
    dirName: document.dirName,
    fileName: document.fileName,
    filePath: document.filePath,
    extensionName: document.extensionName,
    baseDirOverride: document.baseDirOverride,
  }
}
