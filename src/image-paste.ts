import * as path from 'path'
import * as vscode from 'vscode'
import { spawn } from 'child_process'
import * as fs from 'fs'

import { AsciidocParser } from './asciidocParser'

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
    DocumentDirectory: string = ''
    ImagesDirectory: string
    ImageFilename: string

    selectionRole: SelectionRole = SelectionRole.Filename
    encoding: FilenameEncoding = FilenameEncoding.URIEncoding
    mode: SelectionMode = SelectionMode.Replace
  }

  enum SelectionContext {
    Inline,
    Block,
    Other
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
        const promise = new Promise((resolve, reject) => {
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
        return promise
      } else if (platform === 'darwin') {
        // Mac
        const scriptPath = path.join(__dirname, '../../res/mac.applescript')
        const promise = new Promise((resolve, reject) => {
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
        return promise
      } else {
        // Linux
        const scriptPath = path.join(__dirname, '../../res/linux.sh')
        const promise = new Promise((resolve, reject) => {
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
        return promise
      }
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
      let alttext = '' //todo:...
      const imagesDirectory = this.getCurrentImagesDir(textDocument, selection)

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
            alttext = selectedText
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
                  this.importFromClipboard(importConfig) // try again
                }
              })
          } else if (error.message === 'no image exception') {
            vscode.window.showInformationMessage(
              'An image was not found on the clipboard.'
            )
          } else if (error.message === 'no filename exception') {
            vscode.window.showErrorMessage('Missing image filename argument.')
          } else if (error.message === 'no xclip') {
            vscode.window.showErrorMessage('To use this feature you must install xclip')
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
      let macro = `image${isInline ? ':' : '::'}${filename}[${alttext}]`

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
      const affectedText = editor.document.getText(affectedLines)
      return affectedText
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
     * Reads the current `:imagesdir:` [attribute](https://asciidoctor.org/docs/user-manual/#setting-the-location-of-images) from the document.
     *
     * Reads the _nearest_ `:imagesdir:` attribute that appears _before_ the current selection
     * or cursor location, failing that figures it out from the API by converting the document and reading the attribute
     */
    static getCurrentImagesDir (textDocument: vscode.TextDocument, selection: vscode.Selection) {
      const text = textDocument.getText()

      const imagesdir = /^[\t\f]*?:imagesdir:\s+(.+?)\s+$/gim
      let matches = imagesdir.exec(text)

      const index = selection.start
      const cursorIndex = textDocument.offsetAt(index)

      let dir = ''
      while (matches && matches.index < cursorIndex) {
        dir = matches[1] || ''
        matches = imagesdir.exec(text)
      }

      if (dir !== '') {
        return dir
      }

      const extensionUri = vscode.Uri.file('') // won't be used anyway... needs refactoring!
      const { document } = new AsciidocParser(extensionUri).load(textDocument)
      return document.getAttribute('imagesdir', '')
    }

    /**
     * Checks if the given editor is a valid condidate _file_ for pasting images into.
     * @param editor vscode editor to check.
     */
    public static isCandidateFile (document: vscode.TextDocument): boolean {
      return document.uri.scheme === 'file'
    }

    /**
     * Checks if the given selected text is a valid _filename_ for an image.
     * @param selection Selected text to check.
     */
    public static isCandidateSelection (selection: string): boolean {
      return encodeURIComponent(selection) === selection
    }

    /**
     * Checks if the current selection is an `inline` element of the document.
     */
    public static isInline (
      document: vscode.TextDocument,
      selection: vscode.Selection
    ): boolean {
      const line = document.lineAt(selection.start).text
      const selectedText = document.getText(selection)
      const selectedTextIsBlock = new RegExp(`^${selectedText}\\w*$`)

      return selection.isSingleLine && !selectedTextIsBlock.test(line)
    }

    /**
     * Determines the context of the selection in the document.
     */
    public static getSelectionContext (
      document: vscode.TextDocument,
      selection: vscode.Selection
    ): SelectionContext {
      // const line = document.lineAt(selection.start).text
      const selectedText = document.getText(selection)
      const selectedTextIsBlock = new RegExp(`^${selectedText}\\w*$`)

      if (!selection.isSingleLine) {
        return SelectionContext.Other
      } else if (selectedTextIsBlock) {
        return SelectionContext.Block
      } else {
        return SelectionContext.Inline
      }
    }

    static validate (required: {
      editor: vscode.TextEditor;
      selection: string;
    }): boolean {
      if (!this.isCandidateFile(required.editor.document)) {
        return false
      }

      return true
    }

    static isValidFilename (
      selection: string
    ): { result: boolean; value?: string } {
      if (!this.isCandidateSelection(selection)) {
        return { result: false, value: encodeURIComponent(selection) }
      }

      return { result: true, value: selection }
    }
  }
}
