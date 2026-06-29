import * as vscode from 'vscode'
import { findDefaultWorkspaceFolderUri } from '../../core/workspace.js'

export class AsciidoctorAttributesConfig {
  public static getPreviewAttributes(documentUri?: vscode.Uri): {} {
    // Pass the document URI as the configuration scope so folder-level settings
    // (`.vscode/settings.json`) and multi-root workspace folder settings are
    // honored. Passing `null` would only read the global (User) configuration
    // and silently ignore workspace/folder overrides (#928).
    const asciidocPreviewConfig = vscode.workspace.getConfiguration(
      'asciidoc.preview',
      documentUri ?? null,
    )
    const attributes = asciidocPreviewConfig.get('asciidoctorAttributes', {})
    const workspacePath =
      vscode.env.uiKind === vscode.UIKind.Desktop
        ? findDefaultWorkspaceFolderUri()?.fsPath
        : findDefaultWorkspaceFolderUri()?.path
    Object.keys(attributes).forEach((key) => {
      const attributeValue = attributes[key]
      if (typeof attributeValue === 'string') {
        attributes[key] =
          workspacePath === undefined
            ? attributeValue
            : // biome-ignore lint/suspicious/noTemplateCurlyInString: magic-value used in the VS code settings
              attributeValue.replace('${workspaceFolder}', workspacePath)
      }
    })
    return {
      'env-vscode': '',
      env: 'vscode',
      'relfilesuffix@': '.adoc',
      ...AsciidoctorAttributesConfig.defaultSourceHighlighter(attributes),
      ...attributes,
    }
  }

  /**
   * Enable Highlight.js source highlighting out of the box, so code blocks are
   * highlighted in the preview and in HTML-based exports without any
   * configuration. This is a soft default (the `@` suffix), so a document's own
   * `:source-highlighter:` still wins.
   *
   * Returns an empty object when the user already configured a source
   * highlighter, to avoid sending conflicting hard/soft values for the same
   * attribute (set `source-highlighter` to an empty string to opt out).
   */
  public static defaultSourceHighlighter(userAttributes: {}): {} {
    return 'source-highlighter' in userAttributes
      ? {}
      : { 'source-highlighter@': 'highlight.js' }
  }
}
