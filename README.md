# AsciiDoc support for Visual Studio Code

[![Version](https://vsmarketplacebadge.apphb.com/version/asciidoctor.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=asciidoctor.asciidoctor-vscode)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/asciidoctor.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=asciidoctor.asciidoctor-vscode)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating/asciidoctor.asciidoctor-vscode.svg)](https://vsmarketplacebadge.apphb.com/rating/asciidoctor.asciidoctor-vscode.svg)
[![Project chat](https://img.shields.io/badge/zulip-join_chat-brightgreen.svg)](https://asciidoctor.zulipchat.com/)


An extension that provides live preview, syntax highlighting and snippets for the AsciiDoc format using Asciidoctor.

![demo](images/simple.gif)

## Contents

- [AsciiDoc support for Visual Studio Code](#asciidoc-support-for-visual-studio-code)
  - [Contents](#contents)
  - [How to Install](#how-to-install)
  - [How to Use](#how-to-use)
    - [Preview](#preview)
    - [Export as PDF](#export-as-pdf)
    - [Save as HTML](#save-as-html)
    - [Save to DocBook](#save-to-docbook)
    - [Snippets](#snippets)
    - [Identifying the VS Code Environment](#identifying-the-vs-code-environment)
    - [Diagram Integration](#diagram-integration)
  - [User Settings](#user-settings)
  - [Visual Studio Code for the Web](#visual-studio-code-for-the-web)
  - [Build and Install from Source](#build-and-install-from-source)
    - [Manual](#manual)
    - [Script](#script)
  - [Issues](#issues)
  - [Contributing](#contributing)
  - [Credits](#credits)

## How to Install

Launch Visual Studio Code "Quick Open" (`Ctrl+P`), paste the following command, and press `Enter`:

`ext install asciidoctor.asciidoctor-vscode`

Alternatively, you can use the built-in extension browser to find the _AsciiDoc_ by _asciidoctor_ extension and install it.

This extension is also available as a pre-version (alpha) in [Visual Studio Code for the Web](https://code.visualstudio.com/docs/editor/vscode-web) and can be installed using the same procedure.

|Feature|Desktop|Web|
|--|--|--|
|Document Outline and Symbols|✔️|✔️|
|Equations (via Mathjax)|✔️|✔️ (requires security to be disabled)|
|Export as PDF|✔️|⛔|
|Kroki Integration for Diagrams|✔️|✔️|
|Paste Image |✔️|⛔|
|Save as HTML|✔️|⛔|
|Save as DocBook|✔️|⛔|
|Snippets|✔️|✔️|
|Syntax Highlighting|✔️|✔️ (requires security to be disabled)|
|Sync scrolling between the editor and the preview|✔️|✔️|

## How to Use

The extension activates automatically when opening an AsciiDoc file (.adoc, .ad, .asc, .asciidoc).

### Preview

To show the preview you can use the same commands as the Markdown extension:

* Toggle Preview - `ctrl+shift+v` (Mac: `cmd+shift+v`)
* Open Preview to the Side - `ctrl+k v` (Mac: `cmd+k v`)

The preview refreshes automatically, but it can also be forced with the _AsciiDoc: Refresh Preview_ command.

The preview supports setting attributes through the `asciidoc.preview.attributes` option.

By default the preview style follows the VSCode theme (`workbench.colorTheme`). To use Asciidoctor's style set option `asciidoc.preview.useEditorStyle` to `false`. It is also possible to set your own preview stylesheet with the `asciidoc.preview.style` option.

(See more details under [User Settings](#user-settings))

### Export as PDF

The extension provides a quick command to export your AsciiDoc file as PDF.

* Open the command palette - `ctrl+shift+p` or `F1` (Mac: `cmd+shift+p`)
* Select _AsciiDoc: Export document as PDF_
* Choose the folder and filename for the generated PDF

By default a separate binary is downloaded and used to render the document in PDF format. To use Asciidoctor PDF set option `asciidoc.use_asciidoctorpdf` to `true`.<br/>
(See more details under [User Settings](#user-settings))

### Save as HTML

The extension provides a quick command to export your AsciiDoc file as HTML using the default Asciidoctor stylesheet.

* Open the command palette - `ctrl+shift+p` or `F1` (Mac: `cmd+shift+p`)
* Select _AsciiDoc: Save HTML document_
* The file is generated in the same folder as the source document

The shortcout key of `ctrl+alt+s` (Mac: `cmd+alt+s`) will also save the document.

### Save to Docbook

The extension provides a quick command to export your AsciiDoc file as DocBook.

* Open the command palette - `ctrl+shift+p` or `F1` (Mac: `cmd+shift+p`)
* Select _AsciiDoc: Save to DocBook_
* The file is generated in the same folder as the source document

Only DocBook 5 is supported.

### Snippets

Several code snippets are provided including but not limited to: include statements, images, links, header, headings, lists, blocks, etc...

For a full list open the command palette and select _Insert Snippet_.

### Identifying the VS Code Environment

The `env-vscode` attribute is set on all output documents. If you need to identify or handle the VS Code environment you can use an `ifdef` expression similar to the following:

```asciidoc
ifdef::env-vscode[]
This is for vscode only
endif::[]
```

### Diagram Integration

This extension supports a wide range of diagrams from BPMN to Graphviz to PlantUML and Vega graphs using [kroki](https://kroki.io/) and [asciidoctor-kroki](https://github.com/Mogztter/asciidoctor-kroki).

You can [see the full range](https://kroki.io/#support) on the kroki website.

Note that this extension will send graph information to https://kroki.io. If this is an issue it is also possible to use your own kroki instance (see [the instructions](https://github.com/Mogztter/asciidoctor-kroki#using-your-own-kroki) for further information).

To enable diagram support, set the `use_kroki` parameter in your User Settings to `true`.

To cache and save diagrams locally set the `kroki-fetch-diagram` attribute in your document header:

```asciidoc
= My Amazing Document
:kroki-fetch-diagram:
```

This will store images by default in your document folder, however you may also set `imagesdir` to store them elsewhere:

```asciidoc
= My Amazing Document
:kroki-fetch-diagram:
:imagesdir: media
```

## User Settings

This extension is controlled by a multitude of user settings.

The following list contains all the options and their default value.

| Option: Default value | Description |
| :--- | :--- |
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
| `asciidoc.preview.refreshInterval: 2000` | Interval (in miliseconds) between preview refreshes (when the document is changed), 0 means refresh only on save |
| `asciidoc.preview.useEditorStyle: true` | Use editor style instead of default asciidoctor.css |
| `asciidoc.previewFrontMatter: "hide"` | Sets how YAML front matter should be rendered in the AsciiDoc preview. "hide" removes the front matter. Otherwise, the front matter is treated as AsciiDoc content. |
| `asciidoc.trace: "off"` | Enable debug logging for the AsciiDoc extension. |
| `asciidoc.use_asciidoctorpdf: false` | Use Asciidoctor PDF instead of the integrated renderer for the _Export as PDF_ command. |
| `asciidoc.use_kroki: false` | Enable kroki integration to generate diagrams. |

## Build and Install from Source

### Manual

```shell
git clone https://github.com/asciidoctor/asciidoctor-vscode
cd asciidoctor-vscode
npm install
npm run package
code --install-extension *.vsix
```


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

To contribute simply clone the repository and then commit your changes. When you do a pull request please clearly highlight what you changed in the pull comment.

Do not update the extension version or changelog, it will be done by the maintainers when a new version is released.

If you want to update the readme, you are free to fix typos, errors, and add or improve descriptions; but, if you have a style change in mind please use an issue (or specific pull request) so that it can be discussed.

## Credits

* [AsciiDoc](http://asciidoc.org/) by Stuart Rackham
* [Asciidoctor](https://asciidoctor.org/) organization for the language flavor
* [Asciidoctor.js](https://asciidoctor.org/docs/asciidoctor.js/) for the preview
* [Asciidoctor PDF](https://asciidoctor.org/docs/asciidoctor-pdf/) for the _Export to PDF_ function
* [wkhtmltopdf](https://wkhtmltopdf.org/) for the _Export to PDF_ function

All the following people who have contributed to the extension:

<!-- This list is generated using (on linux) a command something like:

    git log --format='%aN' | sort -u | awk '{print "* "$0}' | uniq

-->

* Achille Lacoin
* Andre Bossert
* Bart Sokol
* chriskoerner
* cirrusj
* Dan Allen
* Daniel Mulholland
* danyill
* Garrett D'Amore
* Gigacee
* Guillaume Grossetie
* Jackson C. Wiebe
* jacksoncougar
* João Pinto
* Johannes Rössel
* Joshua Stafman
* Kevin Palmowski
* Lars Hvam
* larshp
* Loïc PÉRON
* Marcelo Alvim
* Mark Roszko
* Masanori Asano
* Matteo Campinoti
* MatteoCampinoti94
* ojn
* Øyvind Hansen
* sgn
* shaneknysh
* Stephen Pegoraro
* Tatsunori Uchino
* Tilmann Oestreich
* Waldir Pimenta
