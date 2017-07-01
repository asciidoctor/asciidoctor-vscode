[![Version](https://vsmarketplacebadge.apphb.com/version/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)

# AsciiDoc Support
A vscode support extension that provides live preview and syntax highlighting for the AsciiDoc format.

An extension to preview AsciiDoc text using the _AsciiDoctor_ publishing tool.

The extension can be activate in two ways

* Toggle Preview - `ctrl+shift+r`
* Open Preview to the Side - `ctrl+k r`

## How to install
Open vscode. Press `F1`, search "`ext install`" followed by extension name, in this case: "`ext install asciidoctor-vscode`" without the ">".
Or if you prefer ">**ext install**", hit enter, search "**asciidoctor-vscode**".

![alt](images/simple.gif)


## Prerequisites

You need to [**install AsciiDoctor**](http://asciidoctor.org/docs/install-toolchain/ ) - A fast text processor & publishing toolchain for converting AsciiDoc to HTML5, DocBook & more.

## How to build and install from source (Linux)
```
git clone https://github.com/joaompinto/asciidoctor-vscode
cd asciidoctor-vscode
npm install
sudo npm install -g vsce
vsce package
code --install-extension *.vsix
```

## Credits:
This extension preview code was based on https://github.com/tht13/RST-vscode/

The AsciiDoc syntax rules are based on https://github.com/asciidoctor/sublimetext-asciidoc/
