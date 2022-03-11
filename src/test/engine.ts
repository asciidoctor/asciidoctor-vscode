/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocEngine } from '../asciidocEngine'
import { AsciidocContributions } from '../asciidocExtensions'

const emptyContributions = new class implements AsciidocContributions {
  readonly extensionUri = vscode.Uri.parse('')
  readonly previewScripts: vscode.Uri[] = []
  readonly previewStylesEditor: vscode.Uri[] = []
  readonly previewStylesDefault: vscode.Uri[] = []
  readonly previewResourceRoots: vscode.Uri[] = []
  readonly asciidocItPlugins: Promise<(md: any) => any>[] = []
}()

export function createNewAsciidocEngine (): AsciidocEngine {
  return new AsciidocEngine(emptyContributions)
}
