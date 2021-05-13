import { readFileSync } from "fs";
import * as vscode from "vscode";
import { createContext, Context } from "./createContext";

export const xrefProvider = {
  provideCompletionItems,
};

export async function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionItem[]> {
  const context = createContext(document, position);

  return shouldProvide(context) ? provide(context) : Promise.resolve([]);
}

/**
 * Checks if we should provide any CompletionItems
 * @param context
 */
function shouldProvide(context: Context): boolean {
  const keyword = "xref:";
  // Check if cursor is after citenp:
  const occurence = context.textFullLine.indexOf(
    keyword,
    context.position.character - keyword.length
  );
  return occurence === context.position.character - keyword.length;
}

async function getLabels(): Promise<string[]> {
  const regex = new RegExp("\\[\\[(\\w+)\\]\\]", "g");
  const labels = await vscode.workspace.findFiles("**/*.adoc").then((files) =>
    files
      .map((uri) => readFileSync(uri.path).toString("utf-8"))
      .join("\n")
      .match(regex)
      .map((result) => result.replace("[[", "").replace("]]", ""))
  );
  return labels;
}

/**
 * Provide Completion Items
 */
async function provide(context: Context): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position } = context;
  const indexOfNextWhiteSpace = textFullLine.includes(" ", position.character)
    ? textFullLine.indexOf(" ", position.character)
    : textFullLine.length;
  //Find the text between citenp: and the next whitespace character
  const search = textFullLine.substring(
    textFullLine.lastIndexOf(":", position.character + 1) + 1,
    indexOfNextWhiteSpace
  );
  const xrefLabels = await getLabels();

  return xrefLabels
    .filter((label) => label.match(search))
    .map((label) => ({
      label: `${label}[]`,
      kind: vscode.CompletionItemKind.Reference,
    }));
}
