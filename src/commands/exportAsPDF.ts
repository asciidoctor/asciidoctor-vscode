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
  private readonly exportAsPdfStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)

  constructor (private readonly engine: AsciidocEngine, private readonly context: vscode.ExtensionContext, private readonly logger: Logger) {
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
    const docPath = doc.uri.fsPath
    const docNameWithoutExtension = path.parse(docPath).name

    const baseDirectory = path.dirname(docPath)
    const pdfFilename = vscode.Uri.file(path.join(baseDirectory, docNameWithoutExtension + '.pdf'))

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
      const asciidoctorPdfCommand = await this.resolveAsciidoctorPdfCommand(asciidocPdfConfig, workspacePath)
      if (asciidoctorPdfCommand === undefined) {
        return
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
        this.exportAsPdfStatusBarItem.name = 'Export As PDF'
        this.exportAsPdfStatusBarItem.text = '$(loading~spin) Generating a PDF using asciidoctor-pdf...'
        this.exportAsPdfStatusBarItem.show()
        await execute(asciidoctorPdfCommand.command, args, text, { shell: true, cwd: asciidoctorPdfCommand.cwd })
        this.exportAsPdfStatusBarItem.text = '$(pass) PDF has been successfully generated!'
        offerOpen(pdfOutputPath)
      } catch (err) {
        console.error('Unable to generate a PDF using asciidoctor-pdf: ', err)
        await vscode.window.showErrorMessage(`Unable to generate a PDF using asciidoctor-pdf: ${err}`)
      } finally {
        this.exportAsPdfStatusBarItem.hide()
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
        this.exportAsPdfStatusBarItem.name = 'Export As PDF'
        this.exportAsPdfStatusBarItem.text = '$(loading~spin) Generating a PDF using wkhtmltopdf...'
        this.exportAsPdfStatusBarItem.show()
        await execute(wkhtmltopdfCommandPath, args, html, { shell: true, cwd: workspacePath, stdio: ['pipe', 'ignore', 'pipe'] })
        this.exportAsPdfStatusBarItem.text = '$(pass) PDF has been successfully generated!'
        offerOpen(pdfOutputPath)
      } catch (err) {
        console.error('Unable to generate a PDF using wkhtmltopdf: ', err)
        await vscode.window.showErrorMessage(`Unable to generate a PDF using wkhtmltopdf: ${err}`)
      } finally {
        this.exportAsPdfStatusBarItem.hide()
        if (coverFilePath) {
          // remove temporary file
          fs.unlinkSync(coverFilePath)
        }
      }
    }
  }

  private async resolveAsciidoctorPdfCommand (asciidocPdfConfig, workspacePath): Promise<{ cwd: string, command: string } | undefined> {
    let asciidoctorPdfCommandPath = asciidocPdfConfig.get('asciidoctorPdfCommandPath', '')
    if (asciidoctorPdfCommandPath !== '') {
      /* eslint-disable-next-line no-template-curly-in-string */
      asciidoctorPdfCommandPath = asciidoctorPdfCommandPath.replace('${workspaceFolder}', workspacePath)
      // use the command specified
      return {
        cwd: workspacePath,
        command: asciidoctorPdfCommandPath,
      }
    }
    if (await this.isAsciidoctorPdfAvailable(workspacePath)) {
      // `asciidoctor-pdf` is available
      return {
        cwd: workspacePath,
        command: 'asciidoctor-pdf',
      }
    }
    if (await this.isBundlerAvailable()) {
      const globalStorageUri = this.context.globalStorageUri
      const installDirectory = path.join(globalStorageUri.fsPath, 'asciidoctor-pdf-install')
      try {
        await commandExists('bundle exec asciidoctor-pdf', { shell: true, cwd: installDirectory })
        return {
          cwd: installDirectory,
          command: 'bundle exec asciidoctor-pdf',
        }
      } catch (bundleExecError) {
        console.info(`Error while trying to execute 'bundle exec asciidoctor-pdf' from '${installDirectory}', cause: `, bundleExecError)
        // `asciidoctor-pdf` is not available in global storage, offer to automatically install it
        const answer = await vscode.window.showInformationMessage('This feature requires asciidoctor-pdf. Do you want to install the latest version locally using Bundler? Alternatively, you can configure the path to the asciidoctor-pdf executable from the extension settings.', 'Install locally')
        if (answer === 'Install locally') {
          this.exportAsPdfStatusBarItem.name = 'Asciidoctor PDF Installer'
          this.exportAsPdfStatusBarItem.text = '$(loading~spin) Installing Asciidoctor PDF...'
          this.exportAsPdfStatusBarItem.show()
          try {
            if (!fs.existsSync(installDirectory)) {
              fs.mkdirSync(installDirectory, { recursive: true })
            }
            const gemfile = path.join(installDirectory, 'Gemfile')

            await execute('bundle', ['config', '--local', 'path', '.bundle/gem'], undefined, { cwd: installDirectory })
            fs.writeFileSync(gemfile, `source 'https://rubygems.org'

gem 'asciidoctor-pdf'`, { encoding: 'utf8' })
            await execute('bundle', ['install'], undefined, { cwd: installDirectory })
            this.exportAsPdfStatusBarItem.text = '$(pass) Asciidoctor PDF installed!'
            const answer = await vscode.window.showInformationMessage(`Successfully installed Asciidoctor PDF in ${installDirectory}`, 'Continue')
            if (answer === 'Continue') {
              return {
                command: 'bundle exec asciidoctor-pdf',
                cwd: installDirectory,
              }
            } else {
              return undefined
            }
          } catch (err) {
            await vscode.window.showErrorMessage(`Unable to install the latest version of asciidoctor-pdf using Bundler: ${err}`)
            return undefined
          } finally {
            this.exportAsPdfStatusBarItem.hide()
          }
        } else {
          return undefined
        }
      }
    } else {
      const answer = await vscode.window.showInformationMessage('This feature requires asciidoctor-pdf but the executable was not found on your PATH. Please install asciidoctor-pdf or configure the path to the executable from the extension settings.', 'Install', 'Configure')
      if (answer === 'Configure') {
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:asciidoctor.asciidoctor-vscode asciidoctorPdfCommand')
      } else if (answer === 'Install') {
        await vscode.env.openExternal(vscode.Uri.parse('https://docs.asciidoctor.org/pdf-converter/latest/install/'))
      }
      return undefined
    }
  }

  private async isBundlerAvailable (): Promise<boolean> {
    try {
      await commandExists('bundle', { shell: true })
      return true
    } catch (err) {
      // unable to find `bundle`, Bundler is probably not installed
      return false
    }
  }

  private async isAsciidoctorPdfAvailable (cwd: string) {
    try {
      await commandExists('asciidoctor-pdf', { shell: true, cwd })
      return true
    } catch (err) {
      // command does not exist
      console.warn(err)
      return false
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
