# AsciiDoc support for Visual Studio Code

[![Version](https://vsmarketplacebadge.apphb.com/version/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/joaompinto.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=joaompinto.asciidoctor-vscode)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)](https://vsmarketplacebadge.apphb.com/rating/joaompinto.asciidoctor-vscode.svg)

An extension that provides live preview, syntax highlighting and symbols for the AsciiDoc format. The preview uses [Asciidoctor.js](https://asciidoctor.org/docs/asciidoctor.js/).

Use the extension, by opening an .adoc file and then:

* Toggle Preview - `ctrl+shift+v` (Mac: `cmd+shift+v`)
* Open Preview to the Side - `ctrl+k v` (Mac: `cmd+k v`)
* View symbols - go to symbol action - `ctrl+shift+o`, select a heading.

## How to install

Launch VS Code Quick Open (Ctrl+P), paste the following command, and press enter:

    ext install joaompinto.asciidoctor-vscode

## Demo

![alt](images/simple.gif)

## Optional

If you want to use the Ruby version of [**Asciidoctor**](http://asciidoctor.org/docs/install-toolchain/ ) you need to change the `AsciiDoc.use_asciidoctor_js` setting to _false_.

### Use Asciidoc with PlantUML
Instead of trying to implement PlantUML support in this extension, two methods can be used.

#### Use external PlantUML files
You can firstly put each PlantML file in an Asciidoc [`include`](https://asciidoctor.org/docs/asciidoc-syntax-quick-reference/#include-files).
This way, the PlantUML content is edited using the plantuml extension, 
and the asciidoc content is edited using this extension.

Typically, you would write the Asciidoc document as follow

```asciidoc
[plantuml, example, png]
----
include::example.plantuml[]
----
```

#### Have Asciidoc preview render PlantUML
Rendering PlantUML requires modification of user settings.

As asciioc js doesn't support PlantUML rendering, you have to disable it.

    "AsciiDoc.use_asciidoctor_js": false,

And to have asciidoctor load [asciidoctor-diagram](http://asciidoctor.org/docs/asciidoctor-diagram/) (which is used to render PlantUML and other diagrams)

    "AsciiDoc.asciidoctor_command": "asciidoctor -r asciidoctor-diagram -o-",


## How to build and install from source (Linux)

```bash
git clone https://github.com/joaompinto/asciidoctor-vscode
cd asciidoctor-vscode
npm install
sudo npm install -g vsce typescript
vsce package
code --install-extension *.vsix
```

## Contributors

```git log --pretty="%an" | sort -u```

    art Sokol
    chriskoerner
    Daniel Mulholland
    Garrett D'Amore
    Gigacee
    João Pinto
    Kevin Palmowski
    Marcelo Alvim
    Mark Roszko
    Øyvind Hansen
    Tatsunori Uchino
