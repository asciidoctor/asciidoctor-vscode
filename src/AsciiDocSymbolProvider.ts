import {
    languages,
    CancellationToken,
    Disposable,
    DocumentSymbol,
    SymbolKind,
    TextDocument
} from 'vscode';

export default function registerDocumentSymbolProvider(): Disposable {

        const _atxPattern = /^((=|#){1,6})\s+(.+)$/;
        const _blockPattern = /^(\.{4}|-{4})$/;

        return languages.registerDocumentSymbolProvider('asciidoc', {

            provideDocumentSymbols(document: TextDocument, token: CancellationToken): DocumentSymbol[] {

                const symbols: DocumentSymbol[] = [];
                const lineCount = Math.min(document.lineCount, 10000);

                // Really basic way of ignoring literal blocks when parsing headers.
                let currentBlock: string = null;

                for (let line = 0; line < lineCount; line++) {
                    const {text, range} = document.lineAt(line);

                    if (_blockPattern.test(text)) {
                        // Entering a block.
                        if (currentBlock === null) {
                            currentBlock = text;
                        }

                        // Exiting a block.
                        else if (text === currentBlock) {
                            currentBlock = null;
                        }

                        continue;
                    }

                    // Ignore lines in a literal block.
                    if (currentBlock !== null) {
                        continue;
                    }

                    const match = _atxPattern.exec(text);
                    if (match !== null) {
                        const depth = match[1].length;
                        const symbol = new DocumentSymbol(
                            match[3],
                            null,
                            SymbolKind.String,
                            range,
                            range
                        );

                        let parent = symbols;

                        for (let current = 1; current < depth; current++) {
                            // Some documents are not well-formed; promote this heading to a higher level if that is the
                            // case.
                            if (parent.length === 0) {
                                break;
                            }

                            parent = parent[parent.length - 1].children;
                        }

                        parent.push(symbol);
                    }
                }

                return symbols;
            }
        });
    }
