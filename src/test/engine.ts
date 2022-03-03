/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocEngine } from '../asciidocEngine'
import { AsciidocContributionProvider, AsciidocContributions } from '../asciidocExtensions'
import { Disposable } from '../util/dispose'

const emptyContributions = new class extends Disposable implements AsciidocContributionProvider {
  readonly extensionUri = vscode.Uri.file('/')
  readonly contributions = AsciidocContributions.Empty
  readonly onContributionsChanged = this._register(new vscode.EventEmitter<this>()).event
}()

export function createNewAsciidocEngine (): AsciidocEngine {
  return new AsciidocEngine(emptyContributions)
}
