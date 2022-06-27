import * as vscode from 'vscode'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { exec, spawn, SpawnOptions } from 'child_process'
import { uuidv4 } from 'uuid'
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
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)
    if (workspaceFolder === undefined) {
      await vscode.window.showWarningMessage('Unable to get the workspace folder, aborting.')
      return
    }
    const workspacePath = workspaceFolder.uri.fsPath
    const docUri = path.parse(path.resolve(doc.fileName))
    const baseDirectory = path.join(docUri.root, docUri.dir)
    const pdfFilename = vscode.Uri.file(path.join(baseDirectory, docUri.name + '.pdf'))

    const asciidocPdfConfig = vscode.workspace.getConfiguration('asciidoc.pdf')
    const pdfOutputUri = await vscode.window.showSaveDialog({ defaultUri: pdfFilename })
    if (!pdfOutputUri) {
      console.log('No output directory selected to save the PDF, aborting.')
      return
    }

    const pdfOutputPath = pdfOutputUri.fsPath
    const text = doc.getText()
    const pdfEnfine = asciidocPdfConfig.get('engine')
    if (pdfEnfine === 'asciidoctor-pdf') {
      let asciidoctorPdfCommandPath = asciidocPdfConfig.get('asciidoctorPdfCommandPath', 'asciidoctor-pdf')
      /* eslint-disable-next-line no-template-curly-in-string */
      asciidoctorPdfCommandPath = asciidoctorPdfCommandPath.replace('${workspaceFolder}', workspacePath)
      try {
        await commandExists(asciidoctorPdfCommandPath, { shell: true, cwd: workspacePath })
      } catch (error) {
        // command does not exist!
        console.error(error)
        const answer = await vscode.window.showInformationMessage('This feature requires asciidoctor-pdf. Do you want to install the latest version locally (in .bundle/gems) using Bundler? Alternatively, you can configure the path to the asciidoctor-pdf executable from the extension settings.', 'Install locally')
        if (answer === 'Install locally') {
          const temporaryGemfile = path.join(workspacePath, '.asciidoctor-vscode-asciidoctor-pdf-gemfile')
          try {
            await execute('bundle', ['config', '--local', 'path', '.bundle/gem'], undefined, { cwd: workspacePath })
            fs.writeFileSync(temporaryGemfile, `source 'https://rubygems.org'

gem 'asciidoctor-pdf'`, { encoding: 'utf8' })
            await execute('bundle', ['install', '--gemfile', '.asciidoctor-vscode-asciidoctor-pdf-gemfile'], undefined, { cwd: workspacePath })
          } catch (err) {
            await vscode.window.showErrorMessage(`Unable to install the latest version of asciidoctor-pdf using Bundler: ${err}`)
            return
          } finally {
            try {
              fs.unlinkSync(temporaryGemfile)
            } catch (err) {
              console.warn('Unable to unlink Gemfile', err)
            }
            try {
              fs.unlinkSync(`${temporaryGemfile}.lock`)
            } catch (err) {
              console.warn('Unable to unlink Gemfile.lock', err)
            }
          }
        } else {
          return
        }
      }
      const asciidoctorPdfCommandArgs = asciidocPdfConfig.get<string[]>('asciidoctorPdfCommandArgs', [])
      const defaultArgs = [
        '-q', // quiet
        '-B',
        `"${baseDirectory.replace('"', '\\"')}"`, // base directory
        '-o',
        `"${pdfOutputPath.replace('"', '\\"')}"`, // output file
      ]
      const args = defaultArgs.concat(asciidoctorPdfCommandArgs)
        .concat(['-']) // read from stdin

      try {
        await execute(asciidoctorPdfCommandPath, args, text, { shell: true, cwd: baseDirectory })
        offerOpen(pdfOutputPath)
      } catch (err) {
        console.error('Unable to generate a PDF using asciidoctor-pdf: ', err)
        await vscode.window.showErrorMessage(`Unable to generate a PDF using asciidoctor-pdf: ${err}`)
      }
    } else if (pdfEnfine === 'wkhtmltopdf') {
      let wkhtmltopdfCommandPath = asciidocPdfConfig.get('wkhtmltopdfCommandPath', '')
      if (wkhtmltopdfCommandPath === '') {
        wkhtmltopdfCommandPath = `wkhtmltopdf${process.platform === 'win32' ? '.exe' : ''}`
      } else {
        /* eslint-disable-next-line no-template-curly-in-string */
        wkhtmltopdfCommandPath = wkhtmltopdfCommandPath.replace('${workspaceFolder}', workspacePath)
      }
      try {
        await commandExists(wkhtmltopdfCommandPath, { shell: true, cwd: workspacePath })
      } catch (error) {
        // command does not exist!
        console.error(error)
        const answer = await vscode.window.showInformationMessage('This feature requires wkhtmltopdf. Please download the latest version from https://wkhtmltopdf.org/downloads.html. If wkhtmltopdf is not available on your path, you can configure the path to wkhtmltopdf executable from the extension settings.', 'Download')
        if (answer === 'Download') {
          vscode.env.openExternal(vscode.Uri.parse('https://wkhtmltopdf.org/downloads.html'))
        }
        return
      }
      const wkhtmltopdfCommandArgs = asciidocPdfConfig.get<string[]>('wkhtmltopdfCommandArgs', [])
      const defaultArgs = ['--enable-local-file-access', '--encoding', ' utf-8', '--javascript-delay', '1000']

      const { output: html, document } = await this.engine.export(doc, 'html5', { 'data-uri@': '' })
      const footerCenter = document?.getAttribute('footer-center')
      if (footerCenter) {
        defaultArgs.push('--footer-center', footerCenter)
      }
      const objectArgs = []
      const showTitlePage = (document?.isAttribute('showTitlePage') as unknown) as boolean // incorrect type definition in Asciidoctor.js
      const titlePageLogo = document?.getAttribute('titlePageLogo')
      const coverFilePath = showTitlePage ? createCoverFile(titlePageLogo, baseDirectory, document) : undefined
      if (coverFilePath) {
        objectArgs.push('cover', coverFilePath)
      }
      // wkhtmltopdf [GLOBAL OPTION]... [OBJECT]... <output file>
      const args = defaultArgs.concat(wkhtmltopdfCommandArgs)
        .concat(objectArgs)
        .concat(['-', pdfOutputPath]) // read from stdin and outputfile

      try {
        await execute(wkhtmltopdfCommandPath, args, html, { shell: true, cwd: workspacePath, stdio: ['pipe', 'ignore', 'pipe'] })
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

function commandExists (command: string, options: SpawnOptions): Promise<{ stdout: string, code: number }> {
  const childProcess = spawn(command, ['--version'], { env: process.env, ...options })
  return new Promise(function (resolve, reject) {
    const stdoutOutput = []
    childProcess.stdout.on('data', (data) => {
      stdoutOutput.push(data)
    })
    childProcess.on('close', function (code) {
      if (code === 0) {
        resolve({
          stdout: stdoutOutput.join('\n'),
          code,
        })
      } else {
        reject(new Error(`command failed: ${command}`))
      }
    })
    childProcess.on('error', function (err) {
      reject(err)
    })
  })
}

function execute (command: string, args: string[], input: string | undefined, options: SpawnOptions): Promise<boolean> {
  return new Promise(function (resolve, reject) {
    const childProcess = spawn(command, args, { env: process.env, ...options })
    const stderrOutput = []
    childProcess.stderr.on('data', (data) => {
      stderrOutput.push(data)
    })
    childProcess.on('close', function (code) {
      if (code === 0) {
        resolve(true)
      } else {
        reject(new Error(`command failed: ${command} ${args.join(' ')}\n${stderrOutput.join('\n')}`))
      }
    })
    childProcess.on('error', function (err) {
      reject(err)
    })
    if (input !== undefined) {
      childProcess.stdin.write(input)
      childProcess.stdin.end()
    }
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
