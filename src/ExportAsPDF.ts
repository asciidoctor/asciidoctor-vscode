import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawnSync } from "child_process";
import * as request from 'request';
import * as zlib from 'zlib';
import { parseText } from './text-parser';


export default async function ExportAsPDF(provider) {
    const editor = vscode.window.activeTextEditor;
    const doc = editor.document;
    const text = doc.getText();
    //RebuildPhantomJS(); // Rebuild Phantom JS if required
    var options = { format: 'Letter' };
    var destination;
    if (!doc.isUntitled)
        destination = doc.fileName+".pdf";
    else
        destination = 'temp.pdf'
    var html = await parseText('', text)
    var binary_path = path.join(__dirname, 'wkhtmltopdf_'+process.platform+'_'+process.arch);
    if(fs.existsSync(binary_path) )
        convert(destination);
    else {
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
                const platform = process.platform;
                const arch = process.arch;
                const download_url = `https://github.com/joaompinto/asciidoctor-vscode/raw/master/wkhtmltopdf-bin/wkhtmltopdf-${platform}-${arch}.gz`
                await download_file(download_url, binary_path+".gz")
                progress.report({ message: 'Unzipping wkhtmltopdf...'});
                const ungzip = zlib.createGunzip();
                const inp = fs.createReadStream(binary_path+".gz");
                const out = fs.createWriteStream(binary_path);
                inp.pipe(ungzip).pipe(out);
                progress.report({ message: 'Downloading wkhtmltopdf...'});
                //resolve()
        }).then( () => {console.log("done")} , (reason) => {vscode.window.showErrorMessage("Error installing wkhtmltopdf, "+reason.toString())})
    }
}

async function download_file(url: string, filename: string) {

    // axios image download with response type "stream"
    return new Promise( (resolve, reject) => {
        request
            .get(url)
            .on('response', function(response) {
                console.log(response.statusCode) // 200
                if(response.statusCode != 200)
                    reject("http error "+ response.statusCode)
                else {
                    console.log(response.headers['content-type']) // 'image/png'
                    resolve()
                }
            })
            .on('error', function(err) {
                throw(err)
            })
            .pipe(fs.createWriteStream(filename));
    })
}

function convert(destination){
    console.log(__dirname);
    // Saving the JSON that represents the document to a temporary JSON-file.
    vscode.window.showInformationMessage(("Successfully converted to "+destination), "Open File").then((label: string) => {
        if (label == "Open File") {
            console.log("Opening file", process.platform);
            switch (process.platform)
            {
                case 'win32':
                    exec(`"${destination}"`);
                    break;
                case 'darwin':
                    exec(`"bash -c 'open "${destination}"'`);
                    break;
                case 'linux':
                    exec(`"bash -c 'xdg-oopen "${destination}"'`);
                    break;
                default:
                    vscode. window.showWarningMessage("Output type is not supported");
                    break;
            }
        }
    })
}