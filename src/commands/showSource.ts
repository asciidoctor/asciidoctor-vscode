/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../commandManager';
import { AsciidocPreviewManager } from '../features/previewManager';

export class ShowSourceCommand implements Command {
	public readonly id = 'asciidoc.showSource';

	public constructor(
		private readonly previewManager: AsciidocPreviewManager
	) { }

	public execute() {
		if (this.previewManager.activePreviewResource) {
			return vscode.workspace.openTextDocument(this.previewManager.activePreviewResource)
				.then(document => vscode.window.showTextDocument(document));
		}
		return undefined;
	}
}
