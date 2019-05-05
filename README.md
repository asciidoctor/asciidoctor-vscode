# AsciiDoc support for Visual Studio Code

[![Version](https://vsmarketplacebadge.apphb.com/version/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)

An extension that provides live preview, syntax highlighting and snippets for the AsciiDoc format using Asciidoctor flavor.

![demo](images/simple.gif)

## Contents

* [Contents](#contents)
* [How to Install](#how-to-install)
* [How to Use](#how-to-use)
  * [Preview](#preview)
  * [Export as PDF](#export-as-pdf)
  * [Snippets](#snippets)
* [Options](#options)
* [Build and Install from Source](#build-and-install-from-source)
  * [Manual](#manual)
  * [Script](#script)
* [Issues](#issues)
* [Contributing](#contributing)
* [Credits](#credits)

## How to Install

Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:

`ext install joaompinto.asciidoctor-vscode`

Alternatively you can use the built-in extension browser to find the _AsciiDoc_ by _joaompinto_ extension and install it.

## How to Use

The extension activates automatically when opening an AsciiDoc file (.adoc, ad, .asc, .asciidoc).

### Preview

To show the preview you can use the same commands as the Markdown extension:

* Toggle Preview - `ctrl+shift+v` (Mac: `cmd+shift+v`)
* Open Preview to the Side - `ctrl+k v` (Mac: `cmd+k v`)

The preview refreshes automatically, but it can also be forced with the _AsciiDoc: Refresh Preview_ command.

The preview supports setting attributes through the `asciidoc.preview.attributes` option.

By default the preview style follows the VSCode theme (`workbench.colorTheme`). To use Asciidoctor's style set option `asciidoc.preview.useEditorStyle` to `false`. It is also possible to set your own preview stylesheet with the `asciidoc.preview.style` option.

(See more details under [Options](#options))

### Export as PDF

The extension provides a quick command to export your AsciiDoc file as PDF.

* Open the command palette - `ctrl+shift+p` or `F1` (Mac: `cmd+shift+p`)
* Select _AsciiDoc: Export document as PDF_
* Choose the folder and filename for the generated PDF

By default a separate binary is downloaded and used to render the document in PDF format. To use Asciidoctor PDF set option `asciidoc.use_asciidoctorpdf` to `true`.<br/>
(See more details under [Options](#options))

### Snippets

Several code snippets are provided including but not limited to: include statements, images, links, header, headings, lists, blocks, etc...

For a full list open the command palette and select _Insert Snippet_.

## Options

This extension is controlled by a multitude of options.

The following list contains all the options and their default value.

| Option: Default value | Description |
| :--- | :--- |
| `asciidoc.asciidoctor_command: "asciidoctor"` | The path or command invoked when using Asciidoctor for the preview. |
| `asciidoc.asciidoctorpdf_command: "asciidoctor-pdf"` | The path or command invoked when using Asciidoctor PDF for the _Export as PDF_ function. |
| `asciidoc.forceUnixStyleSeparator: true` | Force set the file separator style to unix style. If set false, separator style will follow the system style. |
| `asciidoc.preview.style: ""` | The local path to a CSS style sheet to use in the AsciiDoc preview. Relative paths are interpreted relative to the workspace folder. If no workspace is open the document path. |
| `asciidoc.preview.attributes: {}` | Set attributes to be used in the preview. Attributes need to be written as an object of type {string: string} |
| `asciidoc.preview.breaks: false` | Sets how line-breaks are rendered in the AsciiDoc preview. Setting it to 'true' creates a `<br>` for every newline. |
| `asciidoc.preview.doubleClickToSwitchToEditor: true` | Double click in the AsciiDoc preview to switch to the editor. |
| `asciidoc.preview.fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', 'HelveticaNeue-Light', 'Ubuntu', 'Droid Sans', sans-serif"` | Controls the font family used in the AsciiDoc preview. |
| `asciidoc.preview.fontSize: 14` | Controls the font size in pixels used in the AsciiDoc preview. |
| `asciidoc.preview.lineHeight: 1.6` | Controls the line height used in the AsciiDoc preview. This number is relative to the font size. |
| `asciidoc.preview.linkify: true` | Enable or disable conversion of URL-like text to links in the AsciiDoc preview. |
| `asciidoc.preview.markEditorSelection: true` | Mark the current editor selection in the AsciiDoc preview. |
| `asciidoc.preview.openAsciiDocLinks: "inPreview"` | How should clicking on links to AsciiDoc files be handled in the preview.<br/>"inPreview" Try to open links in the the AsciiDoc preview<br/>"inEditor" Try to open links in the the editor |
| `asciidoc.preview.scrollEditorWithPreview: true` | When an AsciiDoc preview is scrolled, update the view of the editor. |
| `asciidoc.preview.scrollPreviewWithEditor: true` | When an AsciiDoc editor is scrolled, update the view of the preview. |
| `asciidoc.preview.scrollPreviewWithEditorSelection: true` | [Deprecated] Scrolls the AsciiDoc preview to reveal the currently selected line from the editor.<br/>This setting has been replaced by 'asciidoc.preview.scrollPreviewWithEditor' and no longer has any effect. |
| `asciidoc.preview.useEditorStyle: true` | Use editor style instead of default asciidoctor.css |
| `asciidoc.previewFrontMatter: "hide"` | Sets how YAML front matter should be rendered in the AsciiDoc preview. "hide" removes the front matter. Otherwise, the front matter is treated as AsciiDoc content. |
| `asciidoc.trace: "off"` | Enable debug logging for the AsciiDoc extension. |
| `asciidoc.use_asciidoctor_js: true` | Use Asciidoctor.js instead of the 'asciidoctor_command' to render the preview. |
| `asciidoc.use_asciidoctorpdf: false` | Use Asciidoctor PDF instead of the integrated renderer for the _Export as PDF_ command. |

## Build and Install from Source

### Manual

```shell
git clone https://github.com/asciidoctor/asciidoctor-vscode
cd asciidoctor-vscode
npm install
sudo npm install -g vsce typescript
vsce package
code --install-extension *.vsix
```

**WARNING**: In Windows you cannot use `sudo`, use `npm install -g`.

### Script

```shell
git clone https://github.com/asciidoctor/asciidoctor-vscode
bash ./script/build.sh build install
```

The script included in the repository automates all operations needed to build the extension. Run `bash ./script/build.sh help` for more information.

**WARNING**: The script only works in MacOS and Windows

## Issues

If you encounter any problems with the extension and cannot find the solution yourself, please open an issue in the dedicated GitHub page: [asciidoctor-vscode/issues](https://github.com/asciidoctor/asciidoctor-vscode/issues).

Before opening an issue, please make sure that it is not a duplicate. Your problem may have already been brought up by another user and been solved: [asciidoctor-vscode/issues all](https://github.com/asciidoctor/asciidoctor-vscode/issues?utf8=%E2%9C%93&q=).

When you do open an issue, remember to include the following information:

1. Description of the issue
2. VSCode version, OS (_Help -> About_) and extension version
3. Steps to reproduce the issue<br/>
**IMPORTANT**: We cannot solve the issue if you do not explain how you encountered it
4. If the problem occurs only with a specific file, attach it, together with any screnshot that might better show what the issue is.

If your issue only appeared after updating to a new version of the extension, you can roll back to a previous one via the extensions browser. Click on the small gear icon beside the AsciiDoc extension, then select _Install Another Version..._. A selection menu will appear allowing you to select which version you want to install.

## Contributing

To contribute simply clone the repository and then commit your changes. When you do a pull requests please clearly highlight what you changed in the pull comment.

Do not update the extension version or changelog, it will be done by the maintainers when a new version is released.

If you want to update the readme, you are free to fix typos, errors, add or improve descriptions, but if you have a style change in mind please use an issue (or specific pull request) so that it can be discussed.

## Credits

* [AsciiDoc](http://asciidoc.org/) by Stuart Rackham
* [Asciidoctor](https://asciidoctor.org/) organization for the the language flavor
* [Asciidoctor.js](https://asciidoctor.org/docs/asciidoctor.js/) for the preview
* [Asciidoctor PDF](https://asciidoctor.org/docs/asciidoctor-pdf/) for the _Export to PDF_ function
* [wkhtmltopdf](https://wkhtmltopdf.org/) for the _Export to PDF_ function

All the following people who have contributed to the extension:

* Bart Sokol
* Daniel Mulholland
* Garrett D'Amore
* Gigacee
* Jackson C. Wiebe
* João Pinto
* Kevin Palmowski
* Marcelo Alvim
* Mark Roszko
* Masanori Asano
* Matteo Campinoti
* Stephen Pegoraro
* Tatsunori Uchino
* chriskoerner
* ojn
* sgn
* Øyvind Hansen
