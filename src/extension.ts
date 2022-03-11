/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { ExtensionContentSecurityPolicyArbiter, PreviewSecuritySelector } from './security'
import { AsciidocFileIncludeAutoCompletionMonitor } from './util/includeAutoCompletion'
import { AttributeReferenceProvider } from './features/attributeReferenceProvider'
import { BuiltinDocumentAttributeProvider } from './features/builtinDocumentAttributeProvider'

export function activate (context: vscode.ExtensionContext) {
  const contributions = getAsciidocExtensionContributions(context)

  const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState)

  const errorCollection = vscode.languages.createDiagnosticCollection('asciidoc')

  const engine = new AsciidocEngine(contributions, errorCollection)
  const logger = new Logger()
  logger.log('Extension was started')

  const selector: vscode.DocumentSelector = [
    { language: 'asciidoc', scheme: 'file' },
    { language: 'asciidoc', scheme: 'untitled' },
  ]

  const contentProvider = new AsciidocContentProvider(engine, context, cspArbiter, contributions, logger)
  const symbolProvider = new AdocDocumentSymbolProvider(engine, null)
  const previewManager = new AsciidocPreviewManager(contentProvider, logger, contributions)
  context.subscriptions.push(previewManager)
  const includeAutoCompletionMonitor = new AsciidocFileIncludeAutoCompletionMonitor()
  context.subscriptions.push(includeAutoCompletionMonitor)

  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider))
  context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new LinkProvider(engine)))
  context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new AsciidocWorkspaceSymbolProvider(symbolProvider)))
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new AttributeReferenceProvider(contributions.extensionUri), '{'))
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BuiltinDocumentAttributeProvider(contributions.extensionUri), ':'))
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
  commandManager.register(new commands.OpenDocumentLinkCommand(engine))
  commandManager.register(new commands.ExportAsPDF(engine, logger))
  commandManager.register(new commands.PasteImage())
  commandManager.register(new commands.ToggleLockCommand(previewManager))
  commandManager.register(new commands.ShowPreviewCommand(previewManager))
  commandManager.register(new commands.SaveHTML(engine))
  commandManager.register(new commands.SaveDocbook(engine))

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
    logger.updateConfiguration()
    previewManager.updateConfiguration()
    previewManager.refresh(true)
  }))

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    errorCollection.clear()
  }))

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => {
    previewManager.refresh(true)
  }))
}
