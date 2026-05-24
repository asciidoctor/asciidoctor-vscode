import * as vscode from 'vscode'
import { findDefaultWorkspaceFolderUri } from '../../util/workspace.js'

export class AsciidoctorAttributesConfig {
  public static getPreviewAttributes(): {} {
    const asciidocPreviewConfig = vscode.workspace.getConfiguration(
      'asciidoc.preview',
      null,
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
      ...attributes,
    }
  }
}
