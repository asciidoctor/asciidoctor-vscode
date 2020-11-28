import * as vscode from "vscode";
import { FileInfo } from "../util/file";

export function createPathCompletionItem(
  fileInfo: FileInfo
): vscode.CompletionItem {
  return {
    label: fileInfo.file,
    kind: fileInfo.isFile ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Folder,
    sortText: fileInfo.file,
  };
}
