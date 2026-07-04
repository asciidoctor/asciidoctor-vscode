import * as vscode from 'vscode'
import { t as l10n_t } from '../../core/l10n.js'
import { containsKrokiDiagram } from './krokiDiagram.js'

const PROMPT_SHOWN_KEY = 'asciidoc.extensions.kroki.discoveryPromptShown'
const DIAGRAM_DOCUMENTATION_URL =
  'https://github.com/asciidoctor/asciidoctor-vscode/blob/main/docs/modules/ROOT/pages/diagram.adoc'

/**
 * One-time hint that Kroki can render the diagrams found in the previewed
 * document, shown only while the Kroki extension is disabled (#480). Kroki is
 * disabled by default and rendering sends the diagram source to a server, so it
 * stays an explicit opt-in: the hint never enables anything on its own.
 */
export class KrokiDiscoveryPrompt {
  // In-memory guard: `globalState.update` persists asynchronously, so this
  // prevents a second prompt from a burst of renders in the same session before
  // the persisted flag is observable.
  private prompted = false

  constructor(private readonly globalState: vscode.Memento) {}

  /**
   * Show the hint if the document contains a Kroki-renderable diagram, Kroki is
   * disabled, and the hint has never been shown. Safe to call on every preview
   * render: it is gated on cheap synchronous checks and never blocks (the
   * notification is shown without awaiting the user).
   */
  public maybePrompt(document: vscode.TextDocument): void {
    if (this.prompted || this.globalState.get<boolean>(PROMPT_SHOWN_KEY)) {
      return
    }
    const krokiEnabled = vscode.workspace
      .getConfiguration('asciidoc.extensions', document.uri)
      .get<boolean>('enableKroki')
    if (krokiEnabled) {
      return
    }
    if (!containsKrokiDiagram(document.getText())) {
      return
    }
    // Show at most once, ever: record it before showing the notification so a
    // burst of renders cannot stack several prompts. Fire-and-forget: the
    // caller (a preview render) must not block on the user's answer.
    this.prompted = true
    this.globalState.update(PROMPT_SHOWN_KEY, true)
    this.showPrompt()
  }

  private async showPrompt(): Promise<void> {
    const enable = l10n_t('kroki.discovery.enable')
    const learnMore = l10n_t('kroki.discovery.learnMore')
    const answer = await vscode.window.showInformationMessage(
      l10n_t('kroki.discovery.message'),
      enable,
      learnMore,
    )
    if (answer === enable) {
      await vscode.workspace
        .getConfiguration('asciidoc.extensions')
        .update('enableKroki', true, vscode.ConfigurationTarget.Global)
      // The Kroki toggle is not part of the preview configuration snapshot, so
      // the configuration-change listener does not refresh the preview on its
      // own; force a refresh so the diagrams render immediately.
      await vscode.commands.executeCommand('asciidoc.preview.refresh')
    } else if (answer === learnMore) {
      await vscode.env.openExternal(vscode.Uri.parse(DIAGRAM_DOCUMENTATION_URL))
    }
  }
}
