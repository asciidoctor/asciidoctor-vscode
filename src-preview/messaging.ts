/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSettings } from './settings'

export interface MessagePoster {
  /**
   * Post a message to the asciidoc extension
   */
  postMessage(type: string, body: object): void;
}

export const createPosterForVsCode = (vscode: any) => {
  return new class implements MessagePoster {
    postMessage (type: string, body: object): void {
      vscode.postMessage({
        type,
        source: getSettings().source,
        body,
      })
    }
  }()
}
