/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import * as arrays from './util/arrays'
import { Disposable } from './util/dispose'

const resolveExtensionResource = (extension: vscode.Extension<any>, resourcePath: string): vscode.Uri => {
  return vscode.Uri.joinPath(extension.extensionUri, resourcePath)
}

const resolveExtensionResources = (extension: vscode.Extension<any>, resourcePaths: unknown): vscode.Uri[] => {
  const result: vscode.Uri[] = []
  if (Array.isArray(resourcePaths)) {
    for (const resource of resourcePaths) {
      try {
        result.push(resolveExtensionResource(extension, resource))
      } catch (e) {
        // noop
      }
    }
  }
  return result
}

export interface AsciidocContributions {
  readonly previewScripts: ReadonlyArray<vscode.Uri>;
  readonly previewStyles: ReadonlyArray<vscode.Uri>;
  readonly previewResourceRoots: ReadonlyArray<vscode.Uri>;
}

// eslint-disable-next-line no-redeclare
export namespace AsciidocContributions {
  export const Empty: AsciidocContributions = {
    previewScripts: [],
    previewStyles: [],
    previewResourceRoots: [],
  }

  export function merge (a: AsciidocContributions, b: AsciidocContributions): AsciidocContributions {
    return {
      previewScripts: [...a.previewScripts, ...b.previewScripts],
      previewStyles: [...a.previewStyles, ...b.previewStyles],
      previewResourceRoots: [...a.previewResourceRoots, ...b.previewResourceRoots],
    }
  }

  function uriEqual (a: vscode.Uri, b: vscode.Uri): boolean {
    return a.toString() === b.toString()
  }

  export function equal (a: AsciidocContributions, b: AsciidocContributions): boolean {
    return arrays.equals(a.previewScripts, b.previewScripts, uriEqual) &&
      arrays.equals(a.previewStyles, b.previewStyles, uriEqual) &&
      arrays.equals(a.previewResourceRoots, b.previewResourceRoots, uriEqual)
  }

  export function fromExtension (
    extension: vscode.Extension<any>
  ): AsciidocContributions {
    const contributions = extension.packageJSON && extension.packageJSON.contributes
    if (!contributions) {
      return AsciidocContributions.Empty
    }

    const previewStyles = getContributedStyles(contributions, extension)
    const previewScripts = getContributedScripts(contributions, extension)
    const previewResourceRoots = previewStyles.length || previewScripts.length ? [extension.extensionUri] : []

    return {
      previewScripts,
      previewStyles,
      previewResourceRoots,
    }
  }

  function getContributedScripts (
    contributes: any,
    extension: vscode.Extension<any>
  ) {
    return resolveExtensionResources(extension, contributes['asciidoc.previewScripts'])
  }

  function getContributedStyles (
    contributes: any,
    extension: vscode.Extension<any>
  ) {
    return resolveExtensionResources(extension, contributes['asciidoc.previewStyles'])
  }
}

export interface AsciidocContributionProvider {
  readonly extensionUri: vscode.Uri;

  readonly contributions: AsciidocContributions;
  readonly onContributionsChanged: vscode.Event<this>;

  dispose(): void;
}

class VSCodeExtensionAsciidocContributionProvider extends Disposable implements AsciidocContributionProvider {
  private _contributions?: AsciidocContributions

  public constructor (
    private readonly _extensionContext: vscode.ExtensionContext
  ) {
    super()

    vscode.extensions.onDidChange(() => {
      const currentContributions = this.getCurrentContributions()
      const existingContributions = this._contributions || AsciidocContributions.Empty
      if (!AsciidocContributions.equal(existingContributions, currentContributions)) {
        this._contributions = currentContributions
        this._onContributionsChanged.fire(this)
      }
    }, undefined, this._disposables)
  }

  public get extensionUri () { return this._extensionContext.extensionUri }

  private readonly _onContributionsChanged = this._register(new vscode.EventEmitter<this>())
  public readonly onContributionsChanged = this._onContributionsChanged.event

  public get contributions (): AsciidocContributions {
    if (!this._contributions) {
      this._contributions = this.getCurrentContributions()
    }
    return this._contributions
  }

  private getCurrentContributions (): AsciidocContributions {
    return vscode.extensions.all
      .map(AsciidocContributions.fromExtension)
      .reduce(AsciidocContributions.merge, AsciidocContributions.Empty)
  }
}

export function getAsciidocExtensionContributions (context: vscode.ExtensionContext): AsciidocContributionProvider {
  return new VSCodeExtensionAsciidocContributionProvider(context)
}
