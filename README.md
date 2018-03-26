[![Version](https://vsmarketplacebadge.apphb.com/version/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)

# AsciiDoc Support
A vscode support extension that provides live preview, syntax highlighting and symbols for the AsciiDoc format.

An extension to preview AsciiDoc text using the [Asciidoctor](https://asciidoctor.org/docs/asciidoctor.js/) publishing tool.

The extension can be activated in two ways

* Toggle Preview - `ctrl+shift+v` (Mac: `cmd+shift+v`)
* Open Preview to the Side - `ctrl+k v` (Mac: `cmd+k v`)
* View symbols - go to symbol action - `ctrl+shift+o`, select a heading.

## How to install
Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:

    ext install joaompinto.asciidoctor-vscode

## Demo
![alt](images/simple.gif)


## Optional
If you want to use the Ruby version of [**Asciidoctor**](http://asciidoctor.org/docs/install-toolchain/ ) you need to change the AsciiDoc.use_asciidoctor_js setting to _false_.

## How to build and install from source (Linux)
```
git clone https://github.com/joaompinto/asciidoctor-vscode
cd asciidoctor-vscode
npm install
sudo npm install -g vsce typescript
vsce package
code --install-extension *.vsix
```

## Credits:
The extension preview code is based on https://github.com/tht13/RST-vscode/

The AsciiDoc syntax rules are based on https://github.com/asciidoctor/sublimetext-asciidoc/

The symbol view is based on https://github.com/jrieken/md-navigate
