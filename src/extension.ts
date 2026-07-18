import * as vscode from 'vscode'
import { antoraSupportEnabledContextKey } from './commands/antoraSupport.js'
import * as commands from './commands/index.js'
import { CommandManager } from './core/commandManager.js'
import { asciidocDocumentSelector } from './core/document.js'
import { isAsciidocFile } from './core/file.js'
import { logger } from './core/logger.js'
import { AntoraSupportManager } from './features/antora/antoraContext.js'
import { registerAntoraCacheInvalidation } from './features/antora/antoraDocument.js'
import { AntoraResourceCompletionProvider } from './features/antora/antoraResourceCompletionProvider.js'
import { AntoraResourceDefinitionProvider } from './features/antora/antoraResourceDefinitionProvider.js'
import { AsciidocDiagnosticManager } from './features/asciidoctor/asciidocDiagnosticManager.js'
import { AsciidocEngine } from './features/asciidoctor/asciidocEngine.js'
import {
  AsciidocIncludeItemsLoader,
  AsciidocLoader,
} from './features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from './features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from './features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from './features/asciidoctor/asciidoctorExtensions.js'
import { AsciidoctorIncludeItems } from './features/asciidoctor/asciidoctorIncludeItems.js'
import { AttributeReferenceHoverProvider } from './features/attributeReferenceHoverProvider.js'
import { AsciidocCompletionProviders } from './features/completion/completionProviders.js'
import LinkProvider from './features/documentLinkProvider.js'
import AdocDocumentSymbolProvider from './features/documentSymbolProvider.js'
import {
  DropImageIntoEditorProvider,
  dropImageMetadata,
} from './features/dropIntoEditor.js'
import { getAsciidocExtensionContributions } from './features/extensionContributions.js'
import AsciidocFoldingRangeProvider from './features/foldingProvider.js'
import {
  PasteImageIntoEditorProvider,
  pasteImageMetadata,
} from './features/pasteImageIntoEditor.js'
import { AsciidocContentProvider } from './features/preview/previewContentProvider.js'
import { AsciidocPreviewManager } from './features/preview/previewManager.js'
import {
  AsciidoctorExtensionsSecurityPolicyArbiter,
  AsciidoctorExtensionsTrustModeSelector,
  AsciidoctorTemplatesSecurityPolicyArbiter,
  AsciidoctorTemplatesTrustModeSelector,
  ExtensionContentSecurityPolicyArbiter,
  PreviewSecuritySelector,
} from './features/security.js'
import AsciidocWorkspaceSymbolProvider from './features/workspaceSymbolProvider.js'

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
  // Consent gate for templates auto-discovered under `.asciidoctor/templates`
  // (mirrors the `.asciidoctor/lib` extensions trust above). The arbiter is a
  // singleton read back via getInstance() from getTemplateDirs().
  AsciidoctorTemplatesSecurityPolicyArbiter.activate(context)
  const asciidoctorTemplatesTrustModeSelector =
    new AsciidoctorTemplatesTrustModeSelector()

  const asciidocEngine = new AsciidocEngine(
    contributionProvider,
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
  )
  // Single diagnostics collection, owned by AsciidocDiagnosticManager. The
  // include-items loader never reports diagnostics, so it shares the same
  // collection (it is only required by the AsciidocLoader base constructor).
  const asciidocDiagnostic = new AsciidoctorDiagnostic('asciidoc')
  const asciidocLoader = new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocDiagnostic,
    context,
  )
  const asciidocIncludeItemsLoader = new AsciidocIncludeItemsLoader(
    new AsciidoctorIncludeItems(),
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(asciidoctorExtensionsSecurityPolicy),
    asciidocDiagnostic,
    context,
  )
  // Diagnostics are computed from a single fully-resolved parse and refreshed
  // only on document open/change (and cleared on close), decoupled from the
  // preview and from language-feature providers.
  const diagnosticManager = new AsciidocDiagnosticManager(
    asciidocLoader,
    asciidocDiagnostic,
  )
  context.subscriptions.push(diagnosticManager.register())

  logger.info('Extension was started')

  const selector = asciidocDocumentSelector

  const contentProvider = new AsciidocContentProvider(asciidocEngine, context)
  const symbolProvider = new AdocDocumentSymbolProvider(asciidocLoader)
  const previewManager = new AsciidocPreviewManager(
    contentProvider,
    logger,
    contributionProvider,
  )
  context.subscriptions.push(previewManager)
  context.subscriptions.push(new AsciidocCompletionProviders(asciidocLoader))
  const antoraSupportManager = AntoraSupportManager.getInstance(
    context.workspaceState,
  )
  context.subscriptions.push(antoraSupportManager)
  context.subscriptions.push(registerAntoraCacheInvalidation())
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      selector,
      new AntoraResourceDefinitionProvider(context.workspaceState),
    ),
  )
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      new AntoraResourceCompletionProvider(context.workspaceState),
      ...[':', '$', '@', '/', '#'],
    ),
  )
  // Editing an included file does not bump the *parent* document's version, so
  // VS Code keeps serving a stale Outline/breadcrumbs for the parent. There is
  // no API to invalidate document symbols directly, but re-registering the
  // provider makes VS Code drop its symbol cache and re-query the visible
  // editors. Includes are resolved from disk during the parse, so the parent
  // can only reflect the new content once the include is *saved* — hence we
  // refresh on save (like the preview) rather than on every keystroke.
  let symbolProviderRegistration =
    vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider)
  context.subscriptions.push({
    dispose: () => symbolProviderRegistration.dispose(),
  })
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isAsciidocFile(document)) {
        symbolProviderRegistration.dispose()
        symbolProviderRegistration =
          vscode.languages.registerDocumentSymbolProvider(
            selector,
            symbolProvider,
          )
      }
    }),
  )
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      selector,
      new AttributeReferenceHoverProvider(asciidocLoader),
    ),
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
      new DropImageIntoEditorProvider(asciidocLoader, context.workspaceState),
      dropImageMetadata,
    ),
  )
  context.subscriptions.push(
    vscode.languages.registerDocumentPasteEditProvider(
      selector,
      new PasteImageIntoEditorProvider(asciidocLoader, context.workspaceState),
      pasteImageMetadata,
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
  commandManager.register(
    new commands.ShowAsciidoctorTemplatesTrustModeSelectorCommand(
      asciidoctorTemplatesTrustModeSelector,
    ),
  )
  commandManager.register(
    new commands.ShowCheatSheetCommand(previewManager, context.extensionUri),
  )
  commandManager.register(new commands.OpenDocumentLinkCommand(asciidocLoader))
  commandManager.register(
    new commands.ExportAsPDF(asciidocEngine, context, previewManager),
  )
  commandManager.register(new commands.PasteImage(context.globalState))
  commandManager.register(new commands.ToggleLockCommand(previewManager))
  commandManager.register(new commands.ToggleBoldCommand())
  commandManager.register(new commands.ToggleItalicCommand())
  commandManager.register(new commands.ToggleMonospaceCommand())
  commandManager.register(
    new commands.SaveHTML(asciidocEngine, previewManager, context.extensionUri),
  )
  commandManager.register(
    new commands.SaveDocbook(asciidocEngine, previewManager),
  )
  commandManager.register(
    new commands.EnableAntoraSupport(
      context.workspaceState,
      previewManager,
      antoraSupportManager,
    ),
  )
  commandManager.register(
    new commands.DisableAntoraSupport(
      context.workspaceState,
      previewManager,
      antoraSupportManager,
    ),
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
      previewManager.updateConfiguration()
    }),
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      // Re-render so the server-side `vscode-theme` attribute (and anything
      // derived from it, e.g. Highlight.js) reflects the new theme. Client-side
      // theming (Mermaid, CSS) already updates live via the webview body class.
      previewManager.refresh(true)
    }),
  )

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((e) => {
      // when the workspace configuration is updated, the file .vscode/settings.json since we are also listening onDidChangeConfiguration we can safely ignore this event
      if (!e.uri.path.endsWith('.vscode/settings.json')) {
        // Force a re-render so an open preview picks up `include::`d files saved
        // on disk (a save does not bump `document.version`), but keep the
        // incremental morph path (`fullReload: false`): a save leaves the
        // webview shell untouched, and a full reload would needlessly reset the
        // preview/editor scroll position even though the content is unchanged.
        previewManager.refresh(true, false)
      }
    }),
  )
}
