import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec, spawn } from 'child_process'
import * as zlib from 'zlib'
import { https } from 'follow-redirects'
import { AsciidocParser } from '../text-parser'
import { Command } from '../commandManager'
import { AsciidocEngine } from '../asciidocEngine'
import * as tmp from 'tmp'

import url = require('url');
import { Logger } from '../logger'

export class ExportAsPDF implements Command {
  public readonly id = 'asciidoc.exportAsPDF'

  constructor (private readonly engine: AsciidocEngine, private readonly logger: Logger) {
    this.engine = engine
    this.logger = logger
  }

  public async execute () {
    const editor = vscode.window.activeTextEditor

    if (editor === null || editor === undefined) { return }

    const doc = editor.document
    const sourceName = path.parse(path.resolve(doc.fileName))
    const pdfFilename = vscode.Uri.file(path.join(sourceName.root, sourceName.dir, sourceName.name + '.pdf'))

    const text = doc.getText()
    if (vscode.workspace.getConfiguration('asciidoc', null).get('use_asciidoctorPDF')) {
      const docPath = path.parse(path.resolve(doc.fileName))
      let pdfPath = ''

      const pdfUri = await vscode.window.showSaveDialog({ defaultUri: pdfFilename })
      if (!(pdfUri === null || pdfUri === undefined)) {
        pdfPath = pdfUri.fsPath
      } else {
        console.error(`ERROR: invalid pdfUri "${pdfUri}"`)
        return
      }
      const asciidoctorPDFCommand = vscode.workspace
        .getConfiguration('asciidoc', null)
        .get('asciidoctorPDFCommand', 'asciidoctor-pdf')

      const adocPDFCmdArray = asciidoctorPDFCommand
        .split(/(\s+)/)
        .filter(function (e) { return e.trim().length > 0 })

      const adocPDFCmd = adocPDFCmdArray[0]

      const adocPDFCmdArgs = adocPDFCmdArray.slice(1)
      adocPDFCmdArgs.push('-q', '-B', '"' + docPath.dir.replace('"', '\\"') + '"',
        '-o', '"' + pdfPath.replace('"', '\\"') + '"', '-')

      const options = { shell: true, cwd: docPath.dir }

      const asciidoctorPDF = spawn(adocPDFCmd, adocPDFCmdArgs, options)

      asciidoctorPDF.stderr.on('data', (data) => {
        let errorMessage = data.toString()
        errorMessage += '\n'
        errorMessage += 'command: ' + adocPDFCmd + ' ' + adocPDFCmdArgs.join(' ')
        errorMessage += '\n'
        errorMessage += 'If the asciidoctor-pdf binary is not in your PATH, you can set the full path.'
        errorMessage += 'Go to `File -> Preferences -> User settings` and adjust the asciidoc.asciidoctorPDFCommand'
        console.error(errorMessage)
        vscode.window.showErrorMessage(errorMessage)
      })

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      asciidoctorPDF.on('close', (code) => {
        offerOpen(pdfPath)
      })

      asciidoctorPDF.stdin.write(text)
      asciidoctorPDF.stdin.end()
    } else {
      const wkHTMLtoPDFPath = vscode.workspace
        .getConfiguration('asciidoc')
        .get('wkHTMLtoPDFPath', '')

      const parser = new AsciidocParser(path.resolve(doc.fileName))
      //const body =  await parser.parseText()
      const body = await this.engine.render(doc.uri, true, text, false, 'html5')
      const extPath = vscode.extensions.getExtension('asciidoctor.asciidoctor-vscode').extensionPath
      const html = body
      const showTitlePage = parser.getAttribute('showTitlePage')
      const author = parser.getAttribute('author')
      const email = parser.getAttribute('email')
      const doctitle: string | undefined = parser.getAttribute('doctitle')
      const titlePageLogo: string | undefined = parser.getAttribute('titlePageLogo')
      const footerCenter: string | undefined = parser.getAttribute('footer-center')
      let cover: string | undefined
      let imageHTML: string = ''
      if (!(showTitlePage === undefined)) {
        if (!(titlePageLogo === undefined)) {
          const imageURL = titlePageLogo.startsWith('http') ? titlePageLogo : path.join(sourceName.dir, titlePageLogo)
          imageHTML = (titlePageLogo === undefined) ? '' : `<img src="${imageURL}">`
        }
        const tmpobj = tmp.fileSync({ postfix: '.html' })
        const html = `\
                <!DOCTYPE html>
                <html>
                    <head>
                    <meta charset="UTF-8">
                    <link rel="stylesheet" type="text/css" href="${extPath + '/media/all-centered.css'}">
                    </head>
                    <body>
                    <div class="outer">
                        <div class="middle">
                            <div class="inner">
                                ${imageHTML}
                                <h1>${doctitle}</h1>
                                <p>${author} &lt;${email}&gt;</p>
                            </div>
                        </div>
                    </div>
                    </body>
                </html>
                `
        fs.writeFileSync(tmpobj.name, html, 'utf-8')
        cover = `cover ${tmpobj.name}`
      }
      const platform = process.platform
      const ext = platform === 'win32' ? '.exe' : ''
      const arch = process.arch
      let binaryPath = path.resolve(path.join(__dirname, 'wkhtmltopdf-' + platform + '-' + arch + ext))

      if (wkHTMLtoPDFPath !== '') { binaryPath = wkHTMLtoPDFPath }

      if (!fs.existsSync(binaryPath)) {
        const label = await vscode.window.showInformationMessage('This feature requires wkhtmltopdf\ndo you want to download', 'Download')
        if (label !== 'Download') { return }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Window,
          title: 'Downloading wkhtmltopdf',
          // cancellable: true
        }, async (progress) => {
          progress.report({ message: 'Downloading wkhtmltopdf...' })
          const downloadURL = `https://github.com/joaompinto/wkhtmltopdf/releases/download/v0.0.1/wkhtmltopdf-${platform}-${arch}${ext}.gz`
          this.logger.log('Downloading ' + downloadURL)
          await downloadFile(downloadURL, binaryPath + '.gz', progress).then(() => {
            progress.report({ message: 'Unzipping wkhtmltopdf...' })
            const ungzip = zlib.createGunzip()
            const inp = fs.createReadStream(binaryPath + '.gz')
            const out = fs.createWriteStream(binaryPath)
            inp.pipe(ungzip).pipe(out)
            fs.chmodSync(binaryPath, 0x755)
          }).catch(async (reason) => {
            binaryPath = null
            console.error('Error downloading', downloadURL, ' ', reason)
            await vscode.window.showErrorMessage('Error installing wkhtmltopdf, ' + reason.toString())
          })
        })
        if (binaryPath === null || binaryPath === undefined) { return }
      }
      const saveFilename = await vscode.window.showSaveDialog({ defaultUri: pdfFilename })
      if (!(saveFilename === null || saveFilename === undefined)) {
        await html2pdf(html, binaryPath, cover, footerCenter, saveFilename.fsPath)
          .then((result) => { offerOpen(result) })
          .catch((reason) => {
            console.error('Got error', reason)
            vscode.window.showErrorMessage('Error converting to PDF, ' + reason.toString())
          })
      }
    }
  }
}

async function downloadFile (downloadURL: string, filename: string, progress) {
  return new Promise((resolve, reject) => {
    const downloadOptions = url.parse(downloadURL)
    const wstream = fs.createWriteStream(filename)
    let totalDownloaded = 0
    // Proxy support needs to be reworked
    // var proxy = process.env.http_proxy || vscode.workspace.getConfiguration("http", null)["proxy"].trim();
    // var proxyStrictSSL = vscode.workspace.getConfiguration("http", null)["proxyStrictSSL"];
    // if (proxy != '')
    // {
    //   var agent = new HttpsProxyAgent(proxy);
    //   downloadOptions.agent = agent
    //   downloadOptions.rejectUnauthorized = proxyStrictSSL
    // }
    https.get(downloadOptions, (resp) => {
      const contentSize = resp.headers['content-length']
      if (resp.statusCode !== 200) {
        wstream.end()
        fs.unlinkSync(filename)
        return reject(new Error('http error' + resp.statusCode))
      }

      // A chunk of data has been recieved.
      resp.on('data', (chunk) => {
        totalDownloaded += chunk.length
        progress.report({ message: 'Downloading wkhtmltopdf ... ' + ((totalDownloaded / contentSize) * 100.0).toFixed(0) + '%' })
        wstream.write(chunk)
      })

      // The whole response has been received. Print out the result.
      resp.on('end', () => {
        wstream.end()
        resolve()
      })
    }).on('error', (err) => {
      console.error('Error: ' + err.message)
      reject(err.message)
    })
  })
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

export async function html2pdf (html: string, binaryPath: string, cover: string, footerCenter: string, filename: string) {
  const documentPath = path.dirname(filename)

  return new Promise((resolve, reject) => {
    const options = { cwdir: documentPath, stdio: ['pipe', 'ignore', 'pipe'] }
    let cmdArguments = ['--encoding', ' utf-8', '--javascript-delay', '1000']
    if (footerCenter !== undefined) {
      cmdArguments = cmdArguments.concat(['--footer-center', footerCenter])
    }
    if (cover !== undefined) {
      cmdArguments = cmdArguments.concat(cover.split(' '))
    }
    cmdArguments = cmdArguments.concat(['-', filename])
    const command = spawn(binaryPath, cmdArguments, options)
    let errorData = ''
    command.stdin.write(html)
    command.stdin.end()
    command.stderr.on('data', (data) => {
      errorData += data
    })
    command.on('close', (code) => {
      if (code === 0) { resolve(filename) } else { reject(errorData) }
    })
  })
}
