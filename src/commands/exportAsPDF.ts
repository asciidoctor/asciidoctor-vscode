import * as vscode from 'vscode'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { exec, spawn, SpawnOptions, StdioPipe } from 'child_process'
import commandExists from 'command-exists'
import { uuidv4 } from 'uuid'
import * as zlib from 'zlib'
import { AsciidocEngine } from '../asciidocEngine'
import { Command } from '../commandManager'
import { Logger } from '../logger'
import { Asciidoctor } from '@asciidoctor/core'

export class ExportAsPDF implements Command {
  public readonly id = 'asciidoc.exportAsPDF'

  constructor (private readonly engine: AsciidocEngine, private readonly logger: Logger) {
    this.engine = engine
    this.logger = logger
  }

  public async execute () {
    const editor = vscode.window.activeTextEditor
    if (editor === null || editor === undefined) {
      return
    }

    const doc = editor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const docUri = path.parse(path.resolve(doc.fileName))
    const baseDirectory = path.join(docUri.root, docUri.dir)
    const pdfFilename = vscode.Uri.file(path.join(baseDirectory, docUri.name + '.pdf'))

    const asciidocPdfConfig = vscode.workspace.getConfiguration('asciidoc.pdf')
    const pdfOutputUri = await vscode.window.showSaveDialog({ defaultUri: pdfFilename })
    if (!pdfOutputUri) {
      console.log(`No output directory selected to save the PDF, aborting.`)
      return
    }

    const pdfOutputPath = pdfOutputUri.fsPath
    const text = doc.getText()
    const pdfEnfine = asciidocPdfConfig.get("engine")
    if (pdfEnfine === "asciidoctor-pdf") {
      let asciidoctorPdfCommandPath = asciidocPdfConfig.get('asciidoctorPdfCommandPath', 'asciidoctor-pdf')
      if (workspaceFolder && asciidoctorPdfCommandPath.includes('${workspaceFolder}')) {
        asciidoctorPdfCommandPath = asciidoctorPdfCommandPath.replace('${workspaceFolder}', workspaceFolder.uri.fsPath)
      }
      const asciidoctorPdfCommandArgs = asciidocPdfConfig.get<string[]>('asciidoctorPdfCommandArgs', [])
      const defaultArgs = [
        '-q', // quiet
        '-B',
        `"${baseDirectory.replace('"', '\\"')}"`, // base directory
        '-o',
        `"${pdfOutputPath.replace('"', '\\"')}"` // output file
      ]
      const args = defaultArgs.concat(asciidoctorPdfCommandArgs)
        .concat('-') // read from stdin

      try {
        // question: do we really need `shell: true`?
        // from the Node.js documentation:
        // > if the shell option is enabled, do not pass unsanitized user input to this function. Any input containing shell metacharacters may be used to trigger arbitrary command execution.
        // https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options
        await execute(asciidoctorPdfCommandPath, args, text, { shell: true, cwd: baseDirectory })
        offerOpen(pdfOutputPath)
      } catch (err) {
        console.error('Unable to generate a PDF using asciidoctor-pdf: ', err)
        await vscode.window.showErrorMessage(`Unable to generate a PDF using asciidoctor-pdf: ${err}`)
      }
    } else if (pdfEnfine === 'wkhtmltopdf') {
      let wkhtmltopdfCommandPath = asciidocPdfConfig.get('wkhtmltopdfCommandPath', `wkhtmltopdf${process.platform === 'win32' ? '.exe' : ''}`)
      if (workspaceFolder && wkhtmltopdfCommandPath.includes('${workspaceFolder}')) {
        wkhtmltopdfCommandPath = wkhtmltopdfCommandPath.replace('${workspaceFolder}', workspaceFolder.uri.fsPath)
      }
      try {
        await commandExists(wkhtmltopdfCommandPath)
      } catch (error) {
        // command does not exist!
        console.error(error)
        await vscode.window.showInformationMessage('This feature requires wkhtmltopdf. Please download the latest version from https://wkhtmltopdf.org/downloads.html. If wkhtmltopdf is not available on your path, you can configure the path to wkhtmltopdf executable from the extension settings.')
        return
      }
      const wkhtmltopdfCommandArgs = asciidocPdfConfig.get<string[]>('wkhtmltopdfCommandArgs', [])
      const defaultArgs = ['--encoding', ' utf-8', '--javascript-delay', '1000']

      const { output: html, document } = await this.engine.export(doc, 'html5')
      const footerCenter = document?.getAttribute('footer-center')
      if (footerCenter) {
        defaultArgs.push('--footer-center', footerCenter)
      }
      const showTitlePage = (document?.isAttribute('showTitlePage') as unknown) as boolean // incorrect type definition in Asciidoctor.js
      const titlePageLogo = document?.getAttribute('titlePageLogo')
      const coverFilePath = showTitlePage ? createCoverFile(titlePageLogo, baseDirectory, document) : undefined
      if (coverFilePath) {
        defaultArgs.push('cover', coverFilePath)
      }
      defaultArgs.push('-', pdfOutputPath)
      const args = defaultArgs.concat(wkhtmltopdfCommandArgs)

      try {
        await execute(wkhtmltopdfCommandPath, args, html, { cwd: baseDirectory, stdio: ['pipe', 'ignore', 'pipe'] })
        offerOpen(pdfOutputPath)
      } catch (err) {
        console.error('Unable to generate a PDF using wkhtmltopdf: ', err)
        await vscode.window.showErrorMessage(`Unable to generate a PDF using wkhtmltopdf: ${err}`)
      } finally {
        if (coverFilePath) {
          // remove temporary file
          fs.unlinkSync(coverFilePath)
        }
      }
    }
  }
}

function execute(command: string, args: string[], input: string, options: SpawnOptions) {
  return new Promise(function (resolve, reject) {
    const process = spawn(command, args, options)
    const stderrOutput = []
    process.stderr.on('data', (data) => {
      stderrOutput.push(data)
    })
    process.on('close', function (code) {
      if (code === 0) {
        resolve(true)
      } else {
        reject(new Error(`command failed: ${command} ${args.join(' ')}\n${stderrOutput.join('\n')}`))
      }
    })
    process.on('error', function (err) {
      reject(err)
    })
    process.stdin.write(input)
    process.stdin.end()
  })
}

export function _generateCoverHtmlContent (
  titlePageLogo: string | undefined,
  baseDir: string,
  document: Asciidoctor.Document,
  extensionUri: vscode.Uri): string {
  let imageHTML = ''
  if (titlePageLogo) {
    const imageURL = titlePageLogo.startsWith('http') ? titlePageLogo : path.join(baseDir, titlePageLogo)
    imageHTML = `<img src="${imageURL}">`
  }
  const styleHref = vscode.Uri.joinPath(extensionUri, 'media', 'all-centered.css')
  const doctitle: string = document?.getAttribute('doctitle', '')
  const author = document?.getAttribute('author', '')
  const email = document?.getAttribute('email', '')
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="${styleHref}">
  </head>
  <body>
  <div class="outer">
    <div class="middle">
      <div class="inner">
${imageHTML}
        <h1>${doctitle}</h1>
        p>${author} &lt;${email}&gt;</p>
      </div>
    </div>
  </div>
  </body>
  </html>`
}

function createCoverFile (titlePageLogo: string, baseDir: string, document: Asciidoctor.Document) {
  const extensionContext = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode')
  const coverHtmlContent = _generateCoverHtmlContent(titlePageLogo, baseDir, document, extensionContext.extensionUri)

  const tmpFilePath = path.join(os.tmpdir(), uuidv4() + '.html')
  fs.writeFileSync(tmpFilePath, coverHtmlContent, 'utf-8')
  return tmpFilePath
}

function offerOpen (destination) {
  // Saving the JSON that represents the document to a temporary JSON-file.
  vscode.window.showInformationMessage(('Successfully converted to ' + path.basename(destination)), 'Open File').then((label: string) => {
    if (label === 'Open File') {
      switch (process.platform) {
      // Use backticks for unix systems to run the open command directly
      // This avoids having to wrap the command AND path in quotes which
      // breaks if there is a single quote (') in the path
        case 'win32':
          exec(`"${destination.replace('"', '\\"')}"`)
          break
        case 'darwin':
          exec(`\`open "${destination.replace('"', '\\"')}" ; exit\``)
          break
        case 'linux':
          exec(`\`xdg-open "${destination.replace('"', '\\"')}" ; exit\``)
          break
        default:
          vscode.window.showWarningMessage('Output type is not supported')
          break
      }
    }
  })
}
