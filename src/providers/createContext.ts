import * as vscode from 'vscode'

export interface Context {
  textFullLine: string;
  document: vscode.TextDocument;
  documentExtension: string | undefined;
  position: vscode.Position;
}

export function createContext (
  document: vscode.TextDocument,
  position: vscode.Position
): Context {
  const textFullLine = document.getText(document.lineAt(position).range)
  const documentExtension = extractExtension(document)
  return {
    textFullLine,
    document,
    documentExtension,
    position,
  }
}

export function extractExtension (document: vscode.TextDocument) {
  if (document.isUntitled) {
    return undefined
  }

  const fragments = document.fileName.split('.')
  const extension = fragments[fragments.length - 1]

  if (!extension || extension.length > 3) {
    return undefined
  }

  return extension
}
