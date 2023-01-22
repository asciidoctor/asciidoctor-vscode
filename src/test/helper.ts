import vscode from 'vscode'

export let extensionContext: vscode.ExtensionContext
suiteSetup(async () => {
  // Trigger extension activation and grab the context as some tests depend on it
  const extension = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode')
  await extension?.activate()
  extensionContext = (global as any).testExtensionContext
})
