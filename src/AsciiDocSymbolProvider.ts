import {
    languages,
    Disposable,
    CancellationToken,
    Location,
    Position,
    TextDocument,
    SymbolInformation,
    SymbolKind
} from 'vscode';

export default function registerDocumentSymbolProvider(): Disposable {
    
        const _atxPattern = /^(=|#){1,6}\s+.+/;

        return languages.registerDocumentSymbolProvider('asciidoc', {
    
            provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] {
    
                const result: SymbolInformation[] = [];
                const lineCount = Math.min(document.lineCount, 10000);
                for (let line = 0; line < lineCount; line++) {
                    const {text} = document.lineAt(line);
    
                    if (_atxPattern.test(text)) {
                        // atx-style, 1-6 = characters
                        result.push(new SymbolInformation(text, SymbolKind.File, '',
                            new Location(document.uri, new Position(line, 0))));
                    }
                }
    
                return result;
            }
        });
    }
