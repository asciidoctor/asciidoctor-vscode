import * as nls from 'vscode-nls'

// configure once
nls.config({ messageFormat: nls.MessageFormat.file })()

export const localize = nls.loadMessageBundle()
