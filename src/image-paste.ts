import * as path from 'path'
import * as vscode from 'vscode'
import { spawn } from 'child_process'
import * as fs from 'fs'

const remoteRegex = /^(?:[a-z]+:)?\/\//i

export namespace Import {

  /**
   * What part of the image macro should the selection be used for.
   *
   * e.g. image::filename[alt-text]
   */
  enum SelectionRole {
    Filename,
    AltText,
    None
  }

  /**
   * Controls how the image filename should be encoded, if at all.
   */
  enum FilenameEncoding {
    None,
    URIEncoding
  }

  /**
   * Controls if the selection is to be replaced with the image macro, or the
   * image macro is to be inserted at the selection-cursor.
   *
   * e.g. |selection| => ||image:...[]
   *      |selection| => |selection|image:...[]
   */
  enum SelectionMode {
    Insert,
    Replace
  }

  export class Configuration {
    ImagesDirectory: string

    selectionRole: SelectionRole = SelectionRole.Filename
    encoding: FilenameEncoding = FilenameEncoding.URIEncoding
    mode: SelectionMode = SelectionMode.Replace
  }

  class ScriptArgumentError extends Error {
    message: string
  }

  export class Image {
    /**
     * Saves an image from the clipboard.
     * @param filename the filename of the image file
     */
    static saveImageFromClipboard (filename: string) {
      const platform = process.platform
      if (platform === 'win32') {
        const script = path.join(__dirname, '../../res/pc.ps1')
        return new Promise((resolve, reject) => {
          const child = spawn('powershell', [
            '-noprofile',
            '-noninteractive',
            '-nologo',
            '-sta',
            '-executionpolicy',
            'unrestricted',
            '-windowstyle',
            'hidden',
            '-file',
            `${script}`,
            `${filename}`,
          ])

          child.stdout.once('data', (e) => resolve(e.toString()))
          child.stderr.once('data', (e) => {
            const exception = e.toString().trim()
            if (
              exception ===
              'Exception calling "Open" with "2" argument(s): "Could not find a part of the path'
            ) {
              reject(new ScriptArgumentError('bad path exception'))
            } else if (exception === 'no image') {
              reject(new ScriptArgumentError('no image exception'))
            } else if (exception === 'no filename') {
              reject(new ScriptArgumentError('no filename exception'))
            }
          })
          child.once('error', (e) => reject(e))
        })
      }
      if (platform === 'darwin') {
        // Mac
        const scriptPath = path.join(__dirname, '../../res/mac.applescript')
        return new Promise((resolve, reject) => {
          const child = spawn('osascript', [scriptPath, filename])
          child.stdout.once('data', (e) => resolve(e.toString()))
          child.stderr.once('data', (e) => {
            console.log(`stderr: ${e}`)
            const exception = e.toString().trim()
            if (exception === 'no image') {
              reject(new ScriptArgumentError('no image exception'))
            } else {
              reject(exception)
            }
          })
        })
      }
      // Linux
      const scriptPath = path.join(__dirname, '../../res/linux.sh')
      return new Promise((resolve, reject) => {
        const child = spawn(`"${scriptPath}"`, [`"${filename}"`], { shell: true })
        child.stdout.once('data', (e) => resolve(e.toString()))
        child.stderr.once('data', (e) => {
          const exception = e.toString().trim()
          if (exception === 'no xclip') {
            reject(new ScriptArgumentError('no xclip'))
          } else if (exception === 'no image') {
            reject(new ScriptArgumentError('no image exception'))
          } else {
            reject(exception)
          }
        })
      })
    }

    static async importFromClipboard (config: Configuration) {
      const activeTextEditor = vscode.window.activeTextEditor
      if (activeTextEditor === undefined) {
        return
      }

      const textDocument = activeTextEditor.document
      const selection = activeTextEditor.selection

      const currentDateString = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
      // default filename
      let filename = `${currentDateString}.png`
      let altText = '' //todo:...
      const imagesDirectory = config.ImagesDirectory

      // confirm directory is local--asciidoctor allows external URIs.
      // test for protocol (http://, ftp://, etc) to determine this.

      const remote = remoteRegex.test(imagesDirectory)
      if (remote) {
        vscode.window.showWarningMessage(
          'Cannot determine save location for image because `imagesdir` attribute references a remote location.'
        )
        return
      }

      // grab the selected text & update either the alt-attribute or filename
      // corresponding to the selection role.
      const importConfig = config || new Configuration()
      const selectedText = textDocument.getText(selection)
      if (!selection.isEmpty) {
        switch (importConfig.selectionRole) {
          case SelectionRole.AltText:
            altText = selectedText
            break
          case SelectionRole.Filename:
            filename = selectedText + '.png'
            break
        }
      }

      switch (importConfig.encoding) {
        case FilenameEncoding.URIEncoding:
          filename = encodeURIComponent(filename)
          break
      }

      try {
        const docDir = path.dirname(textDocument.uri.fsPath)

        // docDir === '.' if a document has not yet been saved
        if (docDir === '.') {
          vscode.window.showErrorMessage('To allow images to be saved, first save your document.')
          return
        }

        await this.saveImageFromClipboard(path.join(docDir, imagesDirectory, filename))
      } catch (error) {
        if (error instanceof ScriptArgumentError) {
          if (error.message === 'bad path exception') {
            const folder = path.join(vscode.workspace.rootPath, imagesDirectory)
            vscode.window
              .showErrorMessage(
                `The imagesdir folder was not found (${folder}).`,
                'Create Folder & Retry'
              )
              .then(async (value) => {
                if (value === 'Create Folder & Retry') {
                  fs.mkdirSync(folder)
                  await this.importFromClipboard(importConfig) // try again
                }
              })
          } else if (error.message === 'no image exception') {
            vscode.window.showInformationMessage(
              'An image was not found on the clipboard.'
            )
          } else if (error.message === 'no filename exception') {
            vscode.window.showErrorMessage('Missing image filename argument.')
          } else if (error.message === 'no xclip') {
            vscode.window.showErrorMessage('To use this feature, you must install xclip.')
          }
        } else { vscode.window.showErrorMessage(error.toString()) }
        return
      }

      const isInline = Image.predict(
        importConfig.mode,
        Image.modifiedLines(activeTextEditor),
        selection.anchor.character,
        selectedText
      )
      let macro = `image${isInline ? ':' : '::'}${filename}[${altText}]`

      macro = Image.padMacro(importConfig, activeTextEditor, macro)

      activeTextEditor.edit((edit) => {
        switch (importConfig.mode) {
          case SelectionMode.Insert:
            edit.insert(selection.active, macro)
            break
          case SelectionMode.Replace:
            edit.replace(selection, macro)
            break
        }
      })
    }

    // todo: tag functionl
    private static padMacro (
      config: Configuration,
      editor: vscode.TextEditor,
      macro: string
    ) {
      const { first, second } =
        config.mode === SelectionMode.Replace
          ? editor.selection.active.isAfter(editor.selection.anchor)
            ? {
              first: editor.selection.anchor,
              second: editor.selection.active,
            }
            : {
              first: editor.selection.active,
              second: editor.selection.anchor,
            }
          : { first: editor.selection.active, second: editor.selection.active }
      const selection = editor.document.getText(
        new vscode.Range(
          first.translate(0, first.character > 0 ? -1 : 0),
          second.translate(0, 1)
        )
      )
      const padHead = first.character !== 0 && !/^\s/.test(selection)
      const padTail = !/\s$/.test(selection)

      macro = `${padHead ? ' ' : ''}${macro}${padTail ? ' ' : ''}`
      return macro
    }

    /**
     * Returns the lines that will be effected by the current editor selection
     */
    private static modifiedLines (editor: vscode.TextEditor) {
      const affectedLines = new vscode.Range(
        editor.selection.start.line,
        0,
        editor.selection.end.line + 1,
        0
      )
      return editor.document.getText(affectedLines)
    }

    /**
     * Determines if the resulting image-macro is an inline-image or
     * block-image.
     */
    private static predict (
      selectionMode: SelectionMode,
      affectedText: string,
      index: number,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      selectedText: string
    ) {
      // does the macro start at the beginning of the line and end in only
      // whitespace.
      return !((index === 0 && /^\s+$/.test(affectedText)) || /^\s+$|^\S+$/.test(affectedText))
    }

    /**
     * Checks if the given editor is a valid candidate _file_ for pasting images into.
     * @param document
     */
    public static isCandidateFile (document: vscode.TextDocument): boolean {
      return document.uri.scheme === 'file'
    }

    static validate (required: {
      editor: vscode.TextEditor;
      selection: string;
    }): boolean {
      return this.isCandidateFile(required.editor.document)
    }
  }
}
