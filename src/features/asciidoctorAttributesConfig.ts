import vscode from 'vscode'

export class AsciidoctorAttributesConfig {
  public static getPreviewAttributes (): {} {
    const asciidocPreviewConfig = vscode.workspace.getConfiguration('asciidoc.preview', null)
    const attributes = asciidocPreviewConfig.get('asciidoctorAttributes', {})
    const workspaceFolders = vscode.workspace.workspaceFolders
    let workspacePath
    if (workspaceFolders && workspaceFolders.length) {
      workspacePath = workspaceFolders[0].uri.path
    }
    Object.keys(attributes).forEach((key) => {
      const attributeValue = attributes[key]
      if (typeof attributeValue === 'string') {
        attributes[key] = workspacePath === undefined
          ? attributeValue
          // eslint-disable-next-line no-template-curly-in-string
          : attributeValue.replace('${workspaceFolder}', workspacePath)
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
