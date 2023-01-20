/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
import { AsciidocEngine } from './asciidocEngine'
import { getAsciidocExtensionContributions } from './asciidocExtensions'
import { AsciidoctorExtensionsSecurityPolicyArbiter, AsciidoctorExtensionsTrustModeSelector, ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security'
import { AsciidocFileIncludeAutoCompletionMonitor } from './util/includeAutoCompletion'
import { AttributeReferenceProvider } from './features/attributeReferenceProvider'
import { BuiltinDocumentAttributeProvider } from './features/builtinDocumentAttributeProvider'
import AsciidocFoldingRangeProvider from './features/foldingProvider'
import { AntoraSupportManager } from './features/antora/antoraSupport'
import { DropImageIntoEditorProvider } from './features/dropIntoEditor'

export async function activate (context: vscode.ExtensionContext) {
  // Set context as a global as some tests depend on it
  (global as any).testExtensionContext = context
  const contributionProvider = getAsciidocExtensionContributions(context)

  const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState)
  const aespArbiter = new AsciidoctorExtensionsSecurityPolicyArbiter(context)
  const asciidocExtSelector = new AsciidoctorExtensionsTrustModeSelector(aespArbiter)

  const errorCollection = vscode.languages.createDiagnosticCollection('asciidoc')

  const engine = new AsciidocEngine(contributionProvider, aespArbiter, errorCollection)
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

  const contentProvider = new AsciidocContentProvider(engine, context)
  const symbolProvider = new AdocDocumentSymbolProvider(null)
  const previewManager = new AsciidocPreviewManager(contentProvider, logger, contributionProvider)
  context.subscriptions.push(previewManager)
  context.subscriptions.push(new AsciidocFileIncludeAutoCompletionMonitor())
  context.subscriptions.push(await AntoraSupportManager.getInstance(context.workspaceState))

  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider))
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new LinkProvider()))
  context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new AsciidocWorkspaceSymbolProvider(symbolProvider)))
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new AttributeReferenceProvider(), '{'))
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BuiltinDocumentAttributeProvider(), ':'))
  context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, new AsciidocFoldingRangeProvider()))
  context.subscriptions.push(vscode.languages.registerDocumentDropEditProvider(selector, new DropImageIntoEditorProvider()))
  const previewSecuritySelector = new PreviewSecuritySelector(cspArbiter, previewManager)
  const commandManager = new CommandManager()
  context.subscriptions.push(commandManager)
  commandManager.register(new commands.ShowPreviewCommand(previewManager))
  commandManager.register(new commands.ShowPreviewToSideCommand(previewManager))
  commandManager.register(new commands.ShowLockedPreviewToSideCommand(previewManager))
  commandManager.register(new commands.ShowSourceCommand(previewManager))
  commandManager.register(new commands.RefreshPreviewCommand(previewManager))
  commandManager.register(new commands.MoveCursorToPositionCommand())
  commandManager.register(new commands.ShowPreviewSecuritySelectorCommand(previewSecuritySelector, previewManager))
  commandManager.register(new commands.ShowAsciidoctorExtensionsTrustModeSelectorCommand(asciidocExtSelector))
  commandManager.register(new commands.OpenDocumentLinkCommand(engine))
  commandManager.register(new commands.ExportAsPDF(engine, context, logger))
  commandManager.register(new commands.PasteImage())
  commandManager.register(new commands.ToggleLockCommand(previewManager))
  commandManager.register(new commands.ShowPreviewCommand(previewManager))
  commandManager.register(new commands.SaveHTML(engine))
  commandManager.register(new commands.SaveDocbook(engine))

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration('asciidoc.registerAsciidoctorExtensions')) {
      if (vscode.workspace.getConfiguration('asciidoc', null).get('registerAsciidoctorExtensions') === false) {
        // reset
        await context.workspaceState.update(aespArbiter.trustAsciidoctorExtensionsAuthorsKey, undefined)
      }
    }
    logger.updateConfiguration()
    previewManager.updateConfiguration()
  }))

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    errorCollection.clear()
  }))

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
    // when the workspace configuration is updated, the file .vscode/settings.json since we are also listening onDidChangeConfiguration we can safely ignore this event
    if (!e.uri.path.endsWith('.vscode/settings.json')) {
      previewManager.refresh(true)
    }
  }))
}
