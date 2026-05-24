import * as vscode from 'vscode'
import { AsciidocEngine } from './asciidocEngine.js'
import { getAsciidocExtensionContributions } from './asciidocExtensions.js'
import { AsciidocIncludeItemsLoader, AsciidocLoader } from './asciidocLoader.js'
import { CommandManager } from './commandManager.js'
import { antoraSupportEnabledContextKey } from './commands/antoraSupport.js'
import * as commands from './commands/index.js'
import { AntoraSupportManager } from './features/antora/antoraContext.js'
import { AsciidoctorConfig } from './features/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from './features/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from './features/asciidoctorExtensions.js'
import { AsciidoctorIncludeItems } from './features/asciidoctorIncludeItems.js'
import { AttributeReferenceProvider } from './features/attributeReferenceProvider.js'
import { BuiltinDocumentAttributeProvider } from './features/builtinDocumentAttributeProvider.js'
import { AsciidocCompletionProviders } from './features/completion/completionProviders.js'
import LinkProvider from './features/documentLinkProvider.js'
import AdocDocumentSymbolProvider from './features/documentSymbolProvider.js'
import { DropImageIntoEditorProvider } from './features/dropIntoEditor.js'
import AsciidocFoldingRangeProvider from './features/foldingProvider.js'
import { AsciidocContentProvider } from './features/previewContentProvider.js'
import { AsciidocPreviewManager } from './features/previewManager.js'
import AsciidocWorkspaceSymbolProvider from './features/workspaceSymbolProvider.js'
import { Logger } from './logger.js'
import {
  AsciidoctorExtensionsSecurityPolicyArbiter,
  AsciidoctorExtensionsTrustModeSelector,
  ExtensionContentSecurityPolicyArbiter,
  PreviewSecuritySelector,
} from './security.js'
import { asciidocDocumentSelector } from './util/document.js'

export async function activate(context: vscode.ExtensionContext) {
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
    vscode.languages.registerCompletionItemProvider(
      selector,
      new AttributeReferenceProvider(asciidocLoader),
      '{',
    ),
  )
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      new BuiltinDocumentAttributeProvider(),
      ':',
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
}
