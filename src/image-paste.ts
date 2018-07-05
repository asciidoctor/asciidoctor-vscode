// Copyright (c) 2018 mushanshitiancai
// Copyright (c) 2019 jacksoncougar

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Original Source: https://github.com/mushanshitiancai/vscode-paste-image

'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import { spawn } from 'child_process';  
import * as moment from 'moment';
import * as upath from 'upath';

export class Logger
{
    static channel: vscode.OutputChannel;

    static log(message: any)
    {
        if (this.channel)
        {
            let time = moment().format("MM-DD HH:mm:ss");
            this.channel.appendLine(`[${time}] ${message}`);
        }
    }

    static showInformationMessage(message: string, ...items: string[]): Thenable<string>
    {
        this.log(message);
        return vscode.window.showInformationMessage(message, ...items);
    }

    static showErrorMessage(message: string, ...items: string[]): Thenable<string>
    {
        this.log(message);
        return vscode.window.showErrorMessage(message, ...items);
    }
}

export class Config
{

}

export class Paster
{

    static PATH_VARIABLE_CURRENT_FILE_DIR = /\$\{currentFileDir\}/g;
    static PATH_VARIABLE_PROJECT_ROOT = /\$\{projectRoot\}/g;
    static PATH_VARIABLE_CURRNET_FILE_NAME = /\$\{currentFileName\}/g;
    static PATH_VARIABLE_CURRNET_FILE_NAME_WITHOUT_EXT = /\$\{currentFileNameWithoutExt\}/g;

    static PATH_VARIABLE_IMAGE_FILE_PATH = /\$\{imageFilePath\}/g;
    static PATH_VARIABLE_IMAGE_ORIGINAL_FILE_PATH = /\$\{imageOriginalFilePath\}/g;
    static PATH_VARIABLE_IMAGE_FILE_NAME = /\$\{imageFileName\}/g;
    static PATH_VARIABLE_IMAGE_FILE_NAME_WITHOUT_EXT = /\$\{imageFileNameWithoutExt\}/g;
    static PATH_VARIABLE_IMAGE_SYNTAX_PREFIX = /\$\{imageSyntaxPrefix\}/g;
    static PATH_VARIABLE_IMAGE_SYNTAX_SUFFIX = /\$\{imageSyntaxSuffix\}/g;

    static defaultNameConfig: string;
    static folderPathConfig: string;
    static basePathConfig: string;
    static prefixConfig: string;
    static suffixConfig: string;
    static forceUnixStyleSeparatorConfig: boolean;
    static encodePathConfig: string;
    static namePrefixConfig: string;
    static nameSuffixConfig: string;
    static insertPatternConfig: string;
    static inlineImage: boolean;


    /**
     * Reads the current `:imagesdir:` [attribute](https://asciidoctor.org/docs/user-manual/#setting-the-location-of-images) from the document.
     * 
     * **Caution**: Only reads from the _active_ document (_not_ `included` documents).
     * 
     * Reads the _nearest_ `:imagesdir:` attribute that appears _before_ the current selection 
     * or cursor location
     */
    static get_current_imagesdir()
    {
        const text = vscode.window.activeTextEditor.document.getText();

        const imagesdir = /^[\t\f]*?:imagesdir:\s*?([\w-/.]+?)\s*?$/gmi
        let matches = imagesdir.exec(text);

        const index = vscode.window.activeTextEditor.selection.start;
        const offset = vscode.window.activeTextEditor.document.offsetAt(index);

        let dir = "";
        while (matches && matches.index < offset)
        {
            dir = matches[1] || "";
            matches = imagesdir.exec(text);
        }

        return dir;
    }

    /**
     * Checks if the given editor is a valid condidate _file_ for pasting images into.
     * @param editor vscode editor to check.
     */
    public static is_candidate_file(document: vscode.TextDocument): boolean
    {
        return document.uri.scheme === 'file';
    }

    /**
     * Checks if the given selected text is a valid _filename_ for an image.
     * @param selection Selected text to check.
     */
    public static is_candidate_selection(selection: string): boolean
    {
        return !/[\\:*?<>|]/.test(selection);
    }

    /**
     * Checks if the selected text is inline.
     * @param selected Selected text to check.
     * @param document Document where selected text occurs.
     * @param selection Selection
     */
    public static is_inline_context(
        selected: string, 
        document: vscode.TextDocument, 
        selection: vscode.Selection): boolean
    {
        const line = document.lineAt(selection.start).text;
        const is_block = new RegExp(`^${selected}\\w*$`);

        return selected && !is_block.test(line);
    }
    
    static validate(
        required: {
            editor: vscode.TextEditor, 
            selection: string
        }) :boolean
    {
        if (!this.is_candidate_file(required.editor.document))
        {
            Logger.showInformationMessage('Save document before pasting image');
            return false;
        }

        if (!this.is_candidate_selection(required.selection))
        {
            Logger.showInformationMessage('Selection does not contain a valid file name!');
            return false;
        }
        return true;
    }

    public static paste()
    {
        const editor = vscode.window.activeTextEditor;
        const selection = editor.document.getText(editor.selection);
        const config = vscode.workspace.getConfiguration('AsciiDoc');

        if(!this.validate({editor, selection})) return;

        this.inlineImage = this.is_inline_context(selection, editor.document, editor.selection);

        // load config
        this.defaultNameConfig = config['defaultName'] || 'Y-MM-DD-HH-mm-ss'
        this.folderPathConfig = config['path'] || '${currentFileDir}';
        this.basePathConfig = config['basePath'] || '';
        this.prefixConfig = config['prefix'];
        this.suffixConfig = config['suffix'];
        this.forceUnixStyleSeparatorConfig = config['forceUnixStyleSeparator'];
        this.forceUnixStyleSeparatorConfig = !!this.forceUnixStyleSeparatorConfig;
        this.encodePathConfig = config['encodePath'];
        this.namePrefixConfig = config['namePrefix'];
        this.nameSuffixConfig = config['nameSuffix'];
        this.insertPatternConfig = config['insertPattern'];

        const validate = (path: string) :boolean => 
        {
            return (path.length === path.trim().length);
        }

        if(!validate(this.folderPathConfig)) 
        {
            Logger.showErrorMessage(
                `The config AsciiDoc.path = '${this.folderPathConfig}' is invalid. Please check your config.`);
            return;
        }

        if(!validate(this.basePathConfig))
        {
            Logger.showErrorMessage(
                `The config AsciiDoc.path = '${this.basePathConfig}' is invalid. Please check your config.`);
            return;
        }

        // replace variable in config
        
        const filePath = editor.document.uri.fsPath;
        const projectPath = vscode.workspace.rootPath;

        this.defaultNameConfig = this.replacePathVariable(
            this.defaultNameConfig, projectPath, filePath, (x) => `[${x}]`);
        this.folderPathConfig = this.replacePathVariable(this.folderPathConfig, projectPath, filePath);
        this.basePathConfig = this.replacePathVariable(this.basePathConfig, projectPath, filePath);
        this.namePrefixConfig = this.replacePathVariable(this.namePrefixConfig, projectPath, filePath);
        this.nameSuffixConfig = this.replacePathVariable(this.nameSuffixConfig, projectPath, filePath);
        this.insertPatternConfig = this.replacePathVariable(this.insertPatternConfig, projectPath, filePath);

        /*
        Get the first :imagedir: value from the current location backwards.
        */

        let dir = this.get_current_imagesdir();

        this.basePathConfig = path.join(this.folderPathConfig, dir);
        this.folderPathConfig = path.join(this.folderPathConfig, dir);

        let imagePath = this.getImagePath(filePath, selection, this.folderPathConfig);

        try
        {
            let existed = fs.existsSync(imagePath);
            if (existed)
            {
                Logger.showInformationMessage(
                    `File ${imagePath} exists. Would you want to replace?`,
                    'Replace',
                    'Cancel').then(choice =>
                    {
                        if (choice == 'Cancel') return;
                        else
                        {
                            this.saveAndPaste(editor, imagePath);
                        }
                    });
            } else
            {
                this.saveAndPaste(editor, imagePath);
            }
        } catch (err)
        {
            Logger.showErrorMessage(`fs.existsSync(${imagePath}) fail. message=${err.message}`);
            return;
        }
    }

    public static saveAndPaste(editor: vscode.TextEditor, imagePath)
    {
        this.createImageDirWithImagePath(imagePath).then(imagePath =>
        {
            // save image and insert to current edit file
            this.saveClipboardImageToFileAndGetPath(imagePath, (imagePath, imagePathReturnByScript) =>
            {
                if (!imagePathReturnByScript) return;
                if (imagePathReturnByScript === 'no image')
                {
                    Logger.showInformationMessage('There is not an image in clipboard.');
                    return;
                }

                imagePath = this.renderFilePath(
                    editor.document.languageId, 
                    this.basePathConfig, 
                    imagePath, 
                    this.forceUnixStyleSeparatorConfig, 
                    this.prefixConfig, 
                    this.suffixConfig
                );

                editor.edit(edit =>
                {
                    let current = editor.selection;

                    if (current.isEmpty)
                    {
                        edit.insert(current.start, imagePath);
                    } else
                    {
                        edit.replace(current, imagePath);
                    }
                });
            });
        }).catch(err =>
        {
            if (err instanceof PluginError)
            {
                Logger.showErrorMessage(err.message);
            } else
            {
                Logger.showErrorMessage(`Failed make folder. message=${err.message}`);
            }
            return;
        });
    }

    public static getImagePath(filePath: string, selectText: string, folderPathFromConfig: string): string
    {
        // image file name
        let imageFileName = "";
        if (!selectText)
        {
            imageFileName = this.namePrefixConfig + moment().format(this.defaultNameConfig) + this.nameSuffixConfig + ".png";
        } else
        {
            imageFileName = this.namePrefixConfig + selectText + this.nameSuffixConfig + ".png";
        }

        // image output path
        let folderPath = path.dirname(filePath);
        let imagePath = "";

        // generate image path
        if (path.isAbsolute(folderPathFromConfig))
        {
            imagePath = path.join(folderPathFromConfig, imageFileName);
        } else
        {
            imagePath = path.join(folderPath, folderPathFromConfig, imageFileName);
        }

        return imagePath;
    }

    /**
     * create directory for image when directory does not exist
     */
    private static createImageDirWithImagePath(imagePath: string)
    {
        return new Promise((resolve, reject) =>
        {
            let imageDir = path.dirname(imagePath);

            fs.stat(imageDir, (err, stats) =>
            {
                if (err == null)
                {
                    if (stats.isDirectory())
                    {
                        resolve(imagePath);
                    } else
                    {
                        reject(new PluginError(`The image dest directory '${imageDir}' is a file. please check your 'AsciiDoc.path' config.`))
                    }
                } else if (err.code == "ENOENT")
                {
                    fse.ensureDir(imageDir, (err) =>
                    {
                        if (err)
                        {
                            reject(err);
                            return;
                        }
                        resolve(imagePath);
                    });
                } else
                {
                    reject(err);
                }
            });
        });
    }

    /**
     * use applescript to save image from clipboard and get file path
     */
    private static saveClipboardImageToFileAndGetPath(imagePath, cb: (imagePath: string, imagePathFromScript: string) => void)
    {
        if (!imagePath) return;

        let platform = process.platform;
        if (platform === 'win32')
        {
            // Windows
            const scriptPath = path.join(__dirname, '../../res/pc.ps1');

            let command = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            let powershellExisted = fs.existsSync(command)
            if (!powershellExisted)
            {
                command = "powershell"
            }

            const powershell = spawn(command, [
                '-noprofile',
                '-noninteractive',
                '-nologo',
                '-sta',
                '-executionpolicy', 'unrestricted',
                '-windowstyle', 'hidden',
                '-file', scriptPath,
                imagePath
            ]);
            powershell.on('error', function (e)
            {
                if (e.message == "ENOENT")
                {
                    Logger.showErrorMessage(`The powershell command is not in you PATH environment variables.Please add it and retry.`);
                } else
                {
                    Logger.showErrorMessage(e.message);
                }
            });
            powershell.on('exit', function (code, signal)
            {
                // console.log('exit', code, signal);
            });
            powershell.stdout.on('data', function (data: Buffer)
            {
                cb(imagePath, data.toString().trim());
            });
        }
        else if (platform === 'darwin')
        {
            // Mac
            let scriptPath = path.join(__dirname, '../../res/mac.applescript');

            let ascript = spawn('osascript', [scriptPath, imagePath]);
            ascript.on('error', function (e)
            {
                Logger.showErrorMessage(e.message);
            });
            ascript.on('exit', function (code, signal)
            {
                // console.log('exit',code,signal);
            });
            ascript.stdout.on('data', function (data: Buffer)
            {
                cb(imagePath, data.toString().trim());
            });
        } else
        {
            // Linux 
            let scriptPath = path.join(__dirname, '../../res/linux.sh');

            let ascript = spawn('sh', [scriptPath, imagePath]);
            ascript.on('error', function (e)
            {
                Logger.showErrorMessage(e.message);
            });
            ascript.on('exit', function (code, signal)
            {
                // console.log('exit',code,signal);
            });
            ascript.stdout.on('data', function (data: Buffer)
            {
                let result = data.toString().trim();
                if (result == "no xclip")
                {
                    Logger.showInformationMessage('You need to install xclip command first.');
                    return;
                }
                cb(imagePath, result);
            });
        }
    }

    /**
     * render the image file path dependen on file type
     * e.g. in markdown image file path will render to ![](path)
     */
    public static renderFilePath(languageId: string, basePath: string, imageFilePath: string, forceUnixStyleSeparator: boolean, prefix: string, suffix: string): string
    {
        if (basePath)
        {
            imageFilePath = path.relative(basePath, imageFilePath);
        }

        if (forceUnixStyleSeparator)
        {
            imageFilePath = upath.normalize(imageFilePath);
        }

        let originalImagePath = imageFilePath;
        let ext = path.extname(originalImagePath);
        let fileName = path.basename(originalImagePath);
        let fileNameWithoutExt = path.basename(originalImagePath, ext);

        imageFilePath = `${prefix}${imageFilePath}${suffix}`;

        if (this.encodePathConfig == "urlEncode")
        {
            imageFilePath = encodeURI(imageFilePath)
        } else if (this.encodePathConfig == "urlEncodeSpace")
        {
            imageFilePath = imageFilePath.replace(/ /g, "%20");
        }

        let imageSyntaxPrefix = "";
        let imageSyntaxSuffix = ""
        switch (languageId)
        {
            case "markdown":
                imageSyntaxPrefix = '![]('
                imageSyntaxSuffix = ')'
                break;
            case "asciidoc":
                imageSyntaxPrefix = this.inlineImage ? 'image:' : 'image::'
                imageSyntaxSuffix = '[]'
                break;
        }

        let result = this.insertPatternConfig
        result = result.replace(this.PATH_VARIABLE_IMAGE_SYNTAX_PREFIX, imageSyntaxPrefix);
        result = result.replace(this.PATH_VARIABLE_IMAGE_SYNTAX_SUFFIX, imageSyntaxSuffix);

        result = result.replace(this.PATH_VARIABLE_IMAGE_FILE_PATH, imageFilePath);
        result = result.replace(this.PATH_VARIABLE_IMAGE_ORIGINAL_FILE_PATH, originalImagePath);
        result = result.replace(this.PATH_VARIABLE_IMAGE_FILE_NAME, fileName);
        result = result.replace(this.PATH_VARIABLE_IMAGE_FILE_NAME_WITHOUT_EXT, fileNameWithoutExt);

        return result;
    }

    public static replacePathVariable(
        pathStr: string, 
        projectRoot: string, 
        curFilePath: string, 
        postFunction: (string) => string = (x) => x
    ): string
    {
        let currentFileDir = path.dirname(curFilePath);
        let ext = path.extname(curFilePath);
        let fileName = path.basename(curFilePath);
        let fileNameWithoutExt = path.basename(curFilePath, ext);

        pathStr = pathStr.replace(this.PATH_VARIABLE_PROJECT_ROOT, postFunction(projectRoot));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRENT_FILE_DIR, postFunction(currentFileDir));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_NAME, postFunction(fileName));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_NAME_WITHOUT_EXT, postFunction(fileNameWithoutExt));
        return pathStr;
    }
}

class PluginError
{
    constructor(public message?: string)
    {
    }
}
