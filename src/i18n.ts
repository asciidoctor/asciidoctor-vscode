import * as nls from 'vscode-nls'

// configure once
// set a default locale until https://github.com/microsoft/vscode-nls/commit/e3f36f5026867758173405adb4800ebc02eef631 is available in a release
nls.config({ locale: 'en-US', messageFormat: nls.MessageFormat.file })()
