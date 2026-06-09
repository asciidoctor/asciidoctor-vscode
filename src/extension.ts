import * as vscode from 'vscode'
import { antoraSupportEnabledContextKey } from './commands/antoraSupport.js'
import * as commands from './commands/index.js'
import { CommandManager } from './core/commandManager.js'
import { asciidocDocumentSelector } from './core/document.js'
import { Logger } from './core/logger.js'
import { AntoraSupportManager } from './features/antora/antoraContext.js'
import { AsciidocEngine } from './features/asciidoctor/asciidocEngine.js'
import {
  AsciidocIncludeItemsLoader,
  AsciidocLoader,
} from './features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from './features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from './features/asciidoctor/asciidoctorDiagnostic.js'
import {
  AsciidoctorExtensionRegistrationApi,
  AsciidoctorExtensions,
} from './features/asciidoctor/asciidoctorExtensions.js'
import { AsciidoctorIncludeItems } from './features/asciidoctor/asciidoctorIncludeItems.js'
import { AsciidocCompletionProviders } from './features/completion/completionProviders.js'
import LinkProvider from './features/documentLinkProvider.js'
import AdocDocumentSymbolProvider from './features/documentSymbolProvider.js'
import { DropImageIntoEditorProvider } from './features/dropIntoEditor.js'
import { getAsciidocExtensionContributions } from './features/extensionContributions.js'
import AsciidocFoldingRangeProvider from './features/foldingProvider.js'
import { AsciidocContentProvider } from './features/preview/previewContentProvider.js'
import { AsciidocPreviewManager } from './features/preview/previewManager.js'
import {
  AsciidoctorExtensionsSecurityPolicyArbiter,
  AsciidoctorExtensionsTrustModeSelector,
  ExtensionContentSecurityPolicyArbiter,
  PreviewSecuritySelector,
} from './features/security.js'
import AsciidocWorkspaceSymbolProvider from './features/workspaceSymbolProvider.js'

export async function activate(
  context: vscode.ExtensionContext,
): Promise<AsciidoctorExtensionRegistrationApi> {
  // Set context as a global as some tests depend on it
  ;(globalThis as any).testExtensionContext = context
  const contributionProvider = getAsciidocExtensionContributions(context)
  const asciidoctorExtensionsSecurityPolicy =
    AsciidoctorExtensionsSecurityPolicyArbiter.activate(context)

  const extensionContentSecurityPolicy =
    new ExtensionContentSecurityPolicyArbiter(
      context.globalState,
      context.workspaceState,
    )
  const asciidoctorExtensionsTrustModeSelector =
    new AsciidoctorExtensionsTrustModeSelector()

  const asciidocEngineDiagnostic = new AsciidoctorDiagnostic('asciidoc-engine')
  const asciidocEngine = new AsciidocEngine(
    contributionProvider,
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocEngineDiagnostic,
  )
  const asciidocLoaderDiagnostic = new AsciidoctorDiagnostic('asciidoc-loader')
  const asciidocLoader = new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocLoaderDiagnostic,
    context,
  )
  const asciidocIncludeDiagnostic = new AsciidoctorDiagnostic(
    'asciidoc-include',
  )
  const asciidocIncludeItemsLoader = new AsciidocIncludeItemsLoader(
    new AsciidoctorIncludeItems(),
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocIncludeDiagnostic,
    context,
  )
  const logger = new Logger()
  logger.log('Extension was started')

  const selector = asciidocDocumentSelector

  const contentProvider = new AsciidocContentProvider(asciidocEngine, context)
  const symbolProvider = new AdocDocumentSymbolProvider(null, asciidocLoader)
  const previewManager = new AsciidocPreviewManager(
    contentProvider,
    logger,
    contributionProvider,
  )
  context.subscriptions.push(previewManager)
  context.subscriptions.push(new AsciidocCompletionProviders(asciidocLoader))
  context.subscriptions.push(
    AntoraSupportManager.getInstance(context.workspaceState),
  )
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider),
  )
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      selector,
      new LinkProvider(asciidocIncludeItemsLoader),
    ),
  )
  context.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider(
      new AsciidocWorkspaceSymbolProvider(symbolProvider),
    ),
  )
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      selector,
      new AsciidocFoldingRangeProvider(asciidocLoader),
    ),
  )
  context.subscriptions.push(
    vscode.languages.registerDocumentDropEditProvider(
      selector,
      new DropImageIntoEditorProvider(asciidocLoader),
    ),
  )
  const previewSecuritySelector = new PreviewSecuritySelector(
    extensionContentSecurityPolicy,
    previewManager,
  )
  const commandManager = new CommandManager()
  context.subscriptions.push(commandManager)
  commandManager.register(new commands.ShowPreviewCommand(previewManager))
  commandManager.register(new commands.ShowPreviewToSideCommand(previewManager))
  commandManager.register(
    new commands.ShowLockedPreviewToSideCommand(previewManager),
  )
  commandManager.register(new commands.ShowSourceCommand(previewManager))
  commandManager.register(new commands.RefreshPreviewCommand(previewManager))
  commandManager.register(new commands.MoveCursorToPositionCommand())
  commandManager.register(
    new commands.ShowPreviewSecuritySelectorCommand(
      previewSecuritySelector,
      previewManager,
    ),
  )
  commandManager.register(
    new commands.ShowAsciidoctorExtensionsTrustModeSelectorCommand(
      asciidoctorExtensionsTrustModeSelector,
    ),
  )
  commandManager.register(new commands.OpenDocumentLinkCommand(asciidocLoader))
  commandManager.register(new commands.ExportAsPDF(asciidocEngine, context))
  commandManager.register(new commands.PasteImage(asciidocLoader))
  commandManager.register(new commands.ToggleLockCommand(previewManager))
  commandManager.register(new commands.SaveHTML(asciidocEngine))
  commandManager.register(new commands.SaveDocbook(asciidocEngine))
  commandManager.register(
    new commands.EnableAntoraSupport(context.workspaceState, previewManager),
  )
  commandManager.register(
    new commands.DisableAntoraSupport(context.workspaceState, previewManager),
  )

  const antoraSupportSetting = context.workspaceState.get(
    'antoraSupportSetting',
  )
  if (antoraSupportSetting === true || antoraSupportSetting === false) {
    await vscode.commands.executeCommand(
      'setContext',
      antoraSupportEnabledContextKey,
      antoraSupportSetting,
    )
    previewManager.refresh(true)
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('asciidoc.registerAsciidoctorExtensions')) {
        if (
          vscode.workspace
            .getConfiguration('asciidoc', null)
            .get('registerAsciidoctorExtensions') === false
        ) {
          // reset
          await context.workspaceState.update(
            asciidoctorExtensionsSecurityPolicy.trustAsciidoctorExtensionsAuthorsKey,
            undefined,
          )
        }
      }
      logger.updateConfiguration()
      previewManager.updateConfiguration()
    }),
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      asciidocEngineDiagnostic.clearAll()
      asciidocLoaderDiagnostic.clearAll()
      asciidocIncludeDiagnostic.clearAll()
    }),
  )

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((e) => {
      // when the workspace configuration is updated, the file .vscode/settings.json since we are also listening onDidChangeConfiguration we can safely ignore this event
      if (!e.uri.path.endsWith('.vscode/settings.json')) {
        previewManager.refresh(true)
      }
    }),
  )

  return {
    registerAsciidoctorExtension:
      AsciidoctorExtensions.registerAsciidoctorExtension,
  }
}
