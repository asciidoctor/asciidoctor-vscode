import type {
  AbstractBlock,
  BlockProcessorDslInterface,
  Reader,
} from '@asciidoctor/core'

export const PLANTUML_SOURCE_DATA_URI_PREFIX = 'data:text/vnd.plantuml;base64,'
// Set on an HTML export whose consumer cannot run the client-side renderer, such as
// wkhtmltopdf: the blocks keep their source as a listing, like with other backends.
export const PLANTUML_AS_LISTING_ATTRIBUTE = 'vscode-plantuml-as-listing'

// The strings displayed to users. This module also runs in the webview and in the
// unit tests, where the VS Code API is not available: see plantumlStrings.ts.
export interface PlantUmlStrings {
  /** Alternative text of a diagram without a title. */
  alt: string
  /** Message when a script of the engine cannot be loaded, with its URL as `{0}`. */
  loadFailed: string
  /** Message when a diagram takes too long to render. */
  timeout: string
}

// A slow diagram must not hold the render queue forever if the engine never
// calls back (it rethrows some exceptions instead of reporting them).
const RENDER_TIMEOUT_MS = 30000

// `Buffer` is a Node global, unavailable in the VS Code for the Web extension
// host — fall back to `TextEncoder`/`btoa` there. Encoded by chunks since a
// diagram can exceed the maximum number of arguments of a function call.
export function encodePlantUmlSource(source: string): string {
  const bytes = new TextEncoder().encode(source)
  if (typeof Buffer !== 'undefined') {
    return `${PLANTUML_SOURCE_DATA_URI_PREFIX}${Buffer.from(bytes).toString('base64')}`
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `${PLANTUML_SOURCE_DATA_URI_PREFIX}${btoa(binary)}`
}

// Asciidoctor Diagram and Kroki accept a diagram without `@startuml`/`@enduml`,
// the engine does not.
function normalizePlantUmlSource(source: string): string {
  return /^\s*@start/m.test(source) ? source : `@startuml\n${source}\n@enduml`
}

// The client-side JS (as a string, not executed here) that loads @plantuml/core
// on demand: at 5 MB, it must not slow down the documents without a diagram.
// `viz-global.js` is a classic script that must run before the engine does.
// Defines the `loadPlantUmlEngine()` expected by plantUmlClientRenderScript().
export function plantUmlEngineLoaderScript(
  vizUrl: string,
  moduleUrl: string,
  strings: PlantUmlStrings,
): string {
  return `
    let plantUmlEngine;
    function loadPlantUmlEngine() {
      plantUmlEngine ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = ${JSON.stringify(vizUrl)};
        script.onload = resolve;
        script.onerror = () => reject(new Error(${JSON.stringify(strings.loadFailed)}.replace('{0}', script.src)));
        document.head.appendChild(script);
      }).then(() => import(${JSON.stringify(moduleUrl)}));
      return plantUmlEngine;
    }
  `
}

// The client-side JS (as a string, not executed here) that decodes a `[plantuml]`
// image block's data URI and renders it in the browser, swapping the `<img>` for
// the resulting SVG. Shared verbatim between the live preview
// (generatePlantUml() in asciidoctorWebViewConverter.ts) and HTML export
// (plantumlExport.ts): only how the engine is loaded differs between the two.
// Assumes a `loadPlantUmlEngine()` is in scope where this is inlined.
export function plantUmlClientRenderScript(strings: PlantUmlStrings): string {
  return `
    const PLANTUML_SOURCE_PREFIX = ${JSON.stringify(PLANTUML_SOURCE_DATA_URI_PREFIX)};
    let plantUmlQueue = Promise.resolve(0);
    function plantUmlToSvg(engine, source, options) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(${JSON.stringify(strings.timeout)})), ${RENDER_TIMEOUT_MS});
        engine.renderToString(
          source.split('\\n'),
          (svg) => {
            clearTimeout(timeout);
            resolve(svg);
          },
          (message) => {
            clearTimeout(timeout);
            reject(new Error(message));
          },
          options,
        );
      });
    }
    function sizePlantUmlSvg(container, img) {
      const svg = container.querySelector('svg');
      if (!svg) {
        return;
      }
      // The engine gives the SVG a fixed size: fit it in the column, like an image.
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      const size = (value) => (/^\\d+$/.test(value) ? value + 'px' : value);
      const width = img.getAttribute('width');
      const height = img.getAttribute('height');
      if (width || height) {
        svg.style.width = width ? size(width) : 'auto';
        svg.style.height = height ? size(height) : 'auto';
      }
    }
    // mutate runs the DOM change, so that the preview can keep the viewport still.
    async function renderPlantUmlImage(img, options, mutate) {
      const src = img.getAttribute('src');
      const container = document.createElement('div');
      container.className = 'plantuml';
      let failure;
      try {
        // In the try: a malformed source written by hand must not stop the queue.
        const bytes = Uint8Array.from(atob(src.slice(PLANTUML_SOURCE_PREFIX.length)), (c) => c.charCodeAt(0));
        const engine = await loadPlantUmlEngine();
        container.innerHTML = await plantUmlToSvg(engine, new TextDecoder().decode(bytes), options);
        sizePlantUmlSvg(container, img);
        // The engine reports a syntax error as a regular diagram, not as an error.
        const text = container.querySelector('svg')?.textContent ?? '';
        failure = text.match(/^PlantUML version .*(Syntax Error\\?.*)$/s)?.[1];
      } catch (e) {
        console.error('PlantUML rendering failed', e);
        failure = e.message;
        const error = document.createElement('pre');
        error.className = 'plantuml-error';
        error.textContent = e.message;
        container.appendChild(error);
      }
      // An update may have replaced the image or morphed its source meanwhile: it
      // has then queued a render of its own, and this result is out of date.
      if (!img.isConnected || img.getAttribute('src') !== src) {
        return;
      }
      // An updated diagram waits next to the one still on display (see
      // deferPlantUmlUpdate() in deferred-image.ts). While typing, its source is
      // often invalid for a moment: the page must not change for an error, so a
      // rendered diagram stays, dimmed, until a new version renders.
      const sibling = img.previousElementSibling;
      const displayed = sibling?.matches('.plantuml') ? sibling : null;
      mutate(() => {
        if (failure !== undefined && displayed?.querySelector('svg')) {
          displayed.style.opacity = '0.5';
          displayed.title = failure;
          img.remove();
        } else {
          displayed?.remove();
          img.replaceWith(container);
        }
      });
    }
    // The engine keeps the diagram being rendered in a shared state, and a new
    // render silently overwrites it: everything goes through a single queue,
    // including the renders requested by successive preview updates.
    function renderPlantUmlImages(nodes, options, mutate = (apply) => apply()) {
      plantUmlQueue = plantUmlQueue.then(async () => {
        const selector = 'img[src^="' + PLANTUML_SOURCE_PREFIX + '"]';
        const images = new Set();
        for (const node of nodes) {
          if (node.matches?.(selector)) {
            images.add(node);
          }
          node.querySelectorAll?.(selector).forEach((img) => images.add(img));
        }
        for (const img of images) {
          if (img.isConnected) {
            await renderPlantUmlImage(img, options, mutate);
          }
        }
      });
      return plantUmlQueue;
    }
  `
}

// Modeled as an Asciidoctor image block for the same reasons as Mermaid (see
// mermaidJSProcessor() in mermaid.ts): a block `.Title` and its caption go through
// the regular figure machinery, tree processors can rewrite them, and a `link` or
// a `width` are handled like on any other image. Only the HTML backends can render
// the data URI client-side, as long as what reads their output can run the renderer
// (see PLANTUML_AS_LISTING_ATTRIBUTE); the others keep the source as a listing.
export function plantumlJSProcessor(defaultAlt: string) {
  return function (this: BlockProcessorDslInterface) {
    this.onContext(['listing', 'literal'])
    // Same positional attributes as asciidoctor-kroki, so that a block written
    // for Kroki does not end up with its target or format as another attribute.
    this.positionalAttributes('target', 'format')
    ;(this as any).process(
      async (
        parent: AbstractBlock,
        reader: Reader,
        attrs: Record<string, unknown>,
      ) => {
        const title = typeof attrs.title === 'string' ? attrs.title : undefined
        const caption =
          typeof attrs.caption === 'string' ? attrs.caption : undefined
        const role = typeof attrs.role === 'string' ? attrs.role : undefined
        const blockId = typeof attrs.id === 'string' ? attrs.id : undefined
        let source = reader.getString()
        if (attrs.subs) {
          source = await (parent as any).applySubs(
            source,
            (parent as any).resolveSubs(attrs.subs),
          )
        }
        const blockAttrs = { ...attrs }
        delete blockAttrs.title
        delete blockAttrs.caption
        delete blockAttrs.target
        delete blockAttrs.format
        delete blockAttrs.opts
        delete blockAttrs.subs
        const document = parent.getDocument() as any
        const isHtml =
          String(document.getAttribute('backend')).endsWith('html5') &&
          !document.isAttribute(PLANTUML_AS_LISTING_ATTRIBUTE)
        let block: any
        if (isHtml) {
          blockAttrs.role = role ? `plantumlblock ${role}` : 'plantumlblock'
          blockAttrs.target = encodePlantUmlSource(
            normalizePlantUmlSource(source),
          )
          blockAttrs.alt = title || defaultAlt
          block = (this as any).createImageBlock(parent, blockAttrs)
        } else {
          delete blockAttrs.style
          block = (this as any).createBlock(
            parent,
            'listing',
            source,
            blockAttrs,
          )
        }
        if (title) {
          block.title = title
        }
        if (blockId) {
          block.id = blockId
        }
        if (isHtml) {
          block.assignCaption(caption, 'figure')
        }
        return block
      },
    )
  }
}
