import * as vscode from "vscode";
import { FileInfo } from "../util/file";

export function createPathCompletionItem(
  fileInfo: FileInfo
): vscode.CompletionItem {
  return {
    label: fileInfo.file,
    kind: vscode.CompletionItemKind.File,
    sortText: fileInfo.file,
  };
}
