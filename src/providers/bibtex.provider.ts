import * as vscode from "vscode";
import { createContext, Context } from "./createContext";
import { readdirSync, readFileSync } from "fs";
const bibtexParse = require("@orcid/bibtex-parse-js");

export const BibtexProvider = {
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
  return /(citenp\:)\S*/gi.test(context.textFullLine);
}

function getCitationKeys(): string[] {
  const files = readdirSync(".").filter((fn) => fn.endsWith(".bib"));
  const filesContent = files.map((file) =>
    readFileSync(file).toString("utf-8")
  );
  const bibtexJson = filesContent.map((content) => bibtexParse.toJSON(content));
  const flatMap = (f, xs) => xs.reduce((r, x) => r.concat(f(x)), []);
  return flatMap(
    (jsons) => jsons.map((entries) => entries.citationKey),
    bibtexJson
  );
}

/**
 * Provide Completion Items
 */
async function provide(context: Context): Promise<vscode.CompletionItem[]> {
  const bibtexSearch = context.textFullLine.replace("citenp:", "");
  const citationKeys = getCitationKeys();

  return citationKeys
    .filter((citationKeys) => citationKeys.match(bibtexSearch))
    .map((citationKey) => ({
      label: `[${citationKey}]`,
      kind: vscode.CompletionItemKind.Reference,
    }));
}
