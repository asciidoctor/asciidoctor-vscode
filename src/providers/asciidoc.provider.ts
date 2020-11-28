import * as vscode from "vscode";
import * as path from "path";
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
  return /(include\:\:|image\:\:|image\:)\S*/gi.test(context.textFullLine)
}

/**
 * Provide Completion Items
 */
async function provide(
  context: Context
): Promise<vscode.CompletionItem[]> {
  const pathExtractedFromIncludeString = context.textFullLine.replace('include::', '').replace('image::', '').replace('image:', '');
  const entryDir = pathExtractedFromIncludeString.substr(0, pathExtractedFromIncludeString.lastIndexOf("/"));
  const workspace = vscode.workspace.getWorkspaceFolder(context.document.uri);
  const rootPath = workspace?.uri.fsPath;
  const searchPath = getPathOfFolderToLookupFiles(
    context.document.uri.fsPath,
    path.join(rootPath, entryDir)
  );

  const childrenOfPath = await getChildrenOfPath(searchPath);

  const items = sortFilesAndDirectories(childrenOfPath);

  const levelUpCompletionItem: vscode.CompletionItem = {
    label: '..',
    kind: vscode.CompletionItemKind.Folder,
    sortText: '..',
  }

  return [
    levelUpCompletionItem,
    ...items.map((child) => {
      const result = createPathCompletionItem(child);
      result.insertText = result.kind === vscode.CompletionItemKind.File ? child.file + '[]' : child.file
      return result;
    }),
  ];
}