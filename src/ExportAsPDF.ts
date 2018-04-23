import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { exec, spawnSync } from "child_process"
import * as zlib from 'zlib';
import { https } from 'follow-redirects'
import * as text_parser from './text-parser'
import { isNullOrUndefined } from 'util'
import { spawn } from "child_process";
import * as tmp from "tmp";


var HttpsProxyAgent = require('https-proxy-agent');
var url = require('url');

export default async function ExportAsPDF() {
    const editor = vscode.window.activeTextEditor
    if(isNullOrUndefined(editor))
        return

    const doc = editor.document
    const text = doc.getText()
    var destination

    if (!doc.isUntitled)
        destination = doc.fileName+".pdf"
    else
        destination = 'temp.pdf'
    let parser = new text_parser.AsciiDocParser(path.resolve(doc.fileName), text)
    var html =  await parser.parseText()
    const showtitlepage = parser.getAttribute("showtitlepage")
    const author = parser.getAttribute("author")
    const email = parser.getAttribute("email")
    const doctitle : string | undefined = parser.getAttribute("doctitle");
    const titlepagelogo : string | undefined = parser.getAttribute("titlepagelogo");
    const ext_path = vscode.extensions.getExtension('joaompinto.asciidoctor-vscode').extensionPath;
    const source_name = path.parse(path.resolve(doc.fileName))
    let cover: string | undefined = undefined;
    const img_html = isNullOrUndefined(titlepagelogo) ? "" : `<img src="${source_name.dir}/${titlepagelogo}" alt="IBM">`
    if(!isNullOrUndefined(showtitlepage) && !isNullOrUndefined(doctitle)) {
        var tmpobj = tmp.fileSync({postfix: '.html'});
        let html =  `\
        <!DOCTYPE html>
        <html>
            <head>
            <meta charset="UTF-8">
            <link rel="stylesheet" type="text/css" href="${ext_path + "/assets/all-centered.css"}">
            </head>
            <body>
            <div class="outer">
                <div class="middle">
                    <div class="inner">
                        ${img_html}
                        <h1>${doctitle}</h1>
                        <p>${author} &lt;${email}&gt;</p>
                    </div>
                </div>
            </div>
            </body>
        </html>
        `;
        fs.writeFileSync(tmpobj.name, html, 'utf-8')
        cover = `cover ${tmpobj.name}`;
    }
    const platform = process.platform
    const ext = platform == "win32" ? '.exe': ''
    const arch = process.arch;
    var binary_path = path.resolve(path.join(__dirname, 'wkhtmltopdf-'+platform+'-'+arch+ext))
    const pdf_filename = vscode.Uri.file(path.join(source_name.root, source_name.dir, source_name.name+'.pdf'))
    if(!fs.existsSync(binary_path) ) {
        var label = await vscode.window.showInformationMessage("This feature requires wkhtmltopdf\ndo you want to download", "Download")
        if (label != "Download")
            return
        var error_msg = null

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: "Downloading wkhtmltopdf",
            // cancellable: true
        }, async(progress) => {
            progress.report({ message: 'Downloading wkhtmltopdf...'});
            const download_url = `https://github.com/joaompinto/asciidoctor-vscode/raw/master/wkhtmltopdf-bin/wkhtmltopdf-${platform}-${arch}${ext}.gz`
            await download_file(download_url, binary_path+".gz", progress).then( () => {
                progress.report({ message: 'Unzipping wkhtmltopdf...'})
                const ungzip = zlib.createGunzip()
                const inp = fs.createReadStream(binary_path+".gz")
                const out = fs.createWriteStream(binary_path)
                inp.pipe(ungzip).pipe(out)
                fs.chmodSync(binary_path, 0x755)
            }).catch( async(reason) => {
                binary_path = null;
                console.error("Error downloading", download_url, " ", reason)
                await vscode.window.showErrorMessage("Error installing wkhtmltopdf, "+reason.toString())
                return
            })
        })
        if(isNullOrUndefined(binary_path))
            return;
    }
    var save_filename = await vscode.window.showSaveDialog({ defaultUri: pdf_filename})
    if(!isNullOrUndefined(save_filename)) {
        html2pdf(html, binary_path, cover,  save_filename.fsPath)
        .then((result) => { offer_open(result) })
        .catch(reason => {
            console.error("Got error", reason)
            vscode.window.showErrorMessage("Error converting to PDF, "+reason.toString());
        })
    }
}

async function download_file(download_url: string, filename: string, progress) {

    return new Promise( (resolve, reject) => {
        var download_options = url.parse(download_url);
        var wstream = fs.createWriteStream(filename)
        var totalDownloaded = 0;
        var proxy = process.env.http_proxy || vscode.workspace.getConfiguration("http")["proxy"].trim();
        var proxyStrictSSL = vscode.workspace.getConfiguration("http")["proxyStrictSSL"];
        if( proxy != '') {
            var agent = new HttpsProxyAgent(proxy);
            download_options.agent = agent
            download_options.rejectUnauthorized = proxyStrictSSL
        }
        https.get(download_options, (resp) => {
            const contentSize = resp.headers['content-length'];
            if(resp.statusCode != 200)
            {
                wstream.end()
                fs.unlink(filename)
                return reject("http error"+resp.statusCode)
            }

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                totalDownloaded += chunk.length
                progress.report( { message: "Downloading wkhtmltopdf ... "+ ((totalDownloaded/contentSize)*100.).toFixed(0)+"%"})
                wstream.write(chunk)
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                wstream.end()
                resolve()
            });

            }).on("error", (err) => {
                console.error("Error: " + err.message);
                reject(err.message)
            });
        })
}

function offer_open(destination){

    // Saving the JSON that represents the document to a temporary JSON-file.
    vscode.window.showInformationMessage(("Successfully converted to "+path.basename(destination)), "Open File").then((label: string) => {
        if (label == "Open File") {
            switch (process.platform)
            {
                case 'win32':
                    exec(`"${destination}"`);
                    break;
                case 'darwin':
                    exec(`bash -c 'open "${destination}"'`);
                    break;
                case 'linux':
                    exec(`bash -c 'xdg-open "${destination}"'`);
                    break;
                default:
                    vscode. window.showWarningMessage("Output type is not supported");
                    break;
            }
        }
    })
}

export async function html2pdf(html: string, binary_path: string, cover: string, filename :string) {
    let documentPath = path.dirname(filename);

    return new Promise((resolve, reject) => {
        var options = { cwdir: documentPath, stdio: ['pipe', 'ignore', "pipe"] }
        let cmd_arguments =  [ '--encoding', ' utf-8'];
        if(!isNullOrUndefined(cover))
            cmd_arguments = cover.split(" ")
        cmd_arguments = cmd_arguments.concat(['-', filename])
        var command = spawn(binary_path, cmd_arguments, options )
        var error_data = '';
        command.stdin.write(html);
        command.stdin.end();
        command.stderr.on('data', (data) => {
            error_data += data;
        })
        command.on('close', (code) => {
            if(code == 0)
                resolve(filename)
            else
                reject(error_data)
        })
    });
}
