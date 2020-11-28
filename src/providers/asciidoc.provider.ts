import * as vscode from "vscode";
import { createContext, Context } from "./createContext";

import { createPathCompletionItem } from "./createCompletionItem";
import {
  getPathOfFolderToLookupFiles,
  getChildrenOfPath,
  sortFilesAndDirectories,
} from "../util/file";

export const AsciidocProvider = {
  provideCompletionItems,
};

export async function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionItem[]> {
  const context = createContext(document, position);

  return shouldProvide(context)
    ? provide(context)
    : Promise.resolve([]);
}

/**
 * Checks if we should provide any CompletionItems
 * @param context
 */
function shouldProvide(context: Context): boolean {
  return /(image\:\:|image\:|include\:\:)\S*/gi.test(context.textFullLine)
}

/**
 * Provide Completion Items
 */
async function provide(
  context: Context
): Promise<vscode.CompletionItem[]> {
  const workspace = vscode.workspace.getWorkspaceFolder(context.document.uri);

  const rootPath = workspace?.uri.fsPath;

  const path = getPathOfFolderToLookupFiles(
    context.document.uri.fsPath,
    rootPath
  );

  const childrenOfPath = await getChildrenOfPath(path);

  const items = sortFilesAndDirectories(childrenOfPath);

  return [
    ...items.map((child) => {
      const result = createPathCompletionItem(child);
      result.insertText = result.kind === vscode.CompletionItemKind.File ? child.file + '[]' : child.file + '/'
      return result;
    }),
  ];
}