// This must be the first import in the main entry file
import './i18n'
import * as vscode from 'vscode'
import { CommandManager } from './commandManager'
import * as commands from './commands/index'
import LinkProvider from './features/documentLinkProvider'
import AdocDocumentSymbolProvider from './features/documentSymbolProvider'
import { AsciidocContentProvider } from './features/previewContentProvider'
import { AsciidocPreviewManager } from './features/previewManager'
import AsciidocWorkspaceSymbolProvider from './features/workspaceSymbolProvider'
import { Logger } from './logger'
import { getAsciidocExtensionContributions } from './asciidocExtensions'
import { AsciidoctorExtensionsSecurityPolicyArbiter, AsciidoctorExtensionsTrustModeSelector, ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security'
import { AsciidocTargetPathAutoCompletionMonitor } from './util/includeAutoCompletion'
import { AttributeReferenceProvider } from './features/attributeReferenceProvider'
import { BuiltinDocumentAttributeProvider } from './features/builtinDocumentAttributeProvider'
import AsciidocFoldingRangeProvider from './features/foldingProvider'
import { AntoraSupportManager } from './features/antora/antoraSupport'
import { DropImageIntoEditorProvider } from './features/dropIntoEditor'
import { AsciidoctorConfig } from './features/asciidoctorConfig'
import { AsciidoctorExtensions } from './features/asciidoctorExtensions'
import { AsciidoctorDiagnostic } from './features/asciidoctorDiagnostic'
import { AsciidocEngine } from './asciidocEngine'
import { AsciidocIncludeItemsLoader, AsciidocLoader } from './asciidocLoader'
import { AsciidoctorIncludeItems } from './features/asciidoctorIncludeItems'

export async function activate (context: vscode.ExtensionContext) {
  // Set context as a global as some tests depend on it
  (global as any).testExtensionContext = context
  const contributionProvider = getAsciidocExtensionContributions(context)
  const asciidoctorExtensionsSecurityPolicy = AsciidoctorExtensionsSecurityPolicyArbiter.activate(context)

  const extensionContentSecurityPolicy = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState)
  const asciidoctorExtensionsTrustModeSelector = new AsciidoctorExtensionsTrustModeSelector()

  const asciidocEngineDiagnostic = new AsciidoctorDiagnostic('asciidoc-engine')
  const asciidocEngine = new AsciidocEngine(
    contributionProvider,
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocEngineDiagnostic
  )
  const asciidocLoaderDiagnostic = new AsciidoctorDiagnostic('asciidoc-loader')
  const asciidocLoader = new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocLoaderDiagnostic,
    context
  )
  const asciidocIncludeDiagnostic = new AsciidoctorDiagnostic('asciidoc-include')
  const asciidocIncludeItemsLoader = new AsciidocIncludeItemsLoader(
    new AsciidoctorIncludeItems(),
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocIncludeDiagnostic,
    context
  )
  const logger = new Logger()
  logger.log('Extension was started')

  const selector: vscode.DocumentSelector = [
    {
      language: 'asciidoc',
      scheme: 'file',
    },
    {
      language: 'asciidoc',
      scheme: 'untitled',
    },
  ]

  const contentProvider = new AsciidocContentProvider(asciidocEngine, context)
  const symbolProvider = new AdocDocumentSymbolProvider(null, asciidocLoader)
  const previewManager = new AsciidocPreviewManager(contentProvider, logger, contributionProvider)
  context.subscriptions.push(previewManager)
  context.subscriptions.push(new AsciidocTargetPathAutoCompletionMonitor(asciidocLoader))
  context.subscriptions.push(await AntoraSupportManager.getInstance(context.workspaceState))
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider))
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new LinkProvider(asciidocIncludeItemsLoader)))
  context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new AsciidocWorkspaceSymbolProvider(symbolProvider)))
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new AttributeReferenceProvider(asciidocLoader), '{'))
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BuiltinDocumentAttributeProvider(), ':'))
  context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, new AsciidocFoldingRangeProvider(asciidocLoader)))
  context.subscriptions.push(vscode.languages.registerDocumentDropEditProvider(selector, new DropImageIntoEditorProvider(asciidocLoader)))
  const previewSecuritySelector = new PreviewSecuritySelector(extensionContentSecurityPolicy, previewManager)
  const commandManager = new CommandManager()
  context.subscriptions.push(commandManager)
  commandManager.register(new commands.ShowPreviewCommand(previewManager))
  commandManager.register(new commands.ShowPreviewToSideCommand(previewManager))
  commandManager.register(new commands.ShowLockedPreviewToSideCommand(previewManager))
  commandManager.register(new commands.ShowSourceCommand(previewManager))
  commandManager.register(new commands.RefreshPreviewCommand(previewManager))
  commandManager.register(new commands.MoveCursorToPositionCommand())
  commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector, previewManager))
  commandManager.register(new commands.ShowAsciidoctorExtensionsTrustModeSelectorCommand(asciidoctorExtensionsTrustModeSelector))
  commandManager.register(new commands.OpenDocumentLinkCommand(asciidocLoader))
  commandManager.register(new commands.ExportAsPDF(asciidocEngine, context, logger))
  commandManager.register(new commands.PasteImage(asciidocLoader))
  commandManager.register(new commands.ToggleLockCommand(previewManager))
  commandManager.register(new commands.ShowPreviewCommand(previewManager))
  commandManager.register(new commands.SaveHTML(asciidocEngine))
  commandManager.register(new commands.SaveDocbook(asciidocEngine))

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration('asciidoc.registerAsciidoctorExtensions')) {
      if (vscode.workspace.getConfiguration('asciidoc', null).get('registerAsciidoctorExtensions') === false) {
        // reset
        await context.workspaceState.update(asciidoctorExtensionsSecurityPolicy.trustAsciidoctorExtensionsAuthorsKey, undefined)
      }
    }
    logger.updateConfiguration()
    previewManager.updateConfiguration()
  }))

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    asciidocEngineDiagnostic.clearAll()
    asciidocLoaderDiagnostic.clearAll()
    asciidocIncludeDiagnostic.clearAll()
  }))

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
    // when the workspace configuration is updated, the file .vscode/settings.json since we are also listening onDidChangeConfiguration we can safely ignore this event
    if (!e.uri.path.endsWith('.vscode/settings.json')) {
      previewManager.refresh(true)
    }
  }))
}
