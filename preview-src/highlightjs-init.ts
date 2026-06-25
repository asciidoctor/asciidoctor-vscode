/*
 * highlight.js bootstrap for the AsciiDoc preview.
 *
 * Asciidoctor injects HTML into code blocks — most notably callout numbers
 * (conums), e.g. `<i class="conum" data-value="1"></i><b>(1)</b>`. highlight.js
 * >= 10 re-tokenizes the element's text content and would drop that markup,
 * leaving a stray "(1)" behind:
 * https://github.com/highlightjs/highlight.js/issues/2889
 *
 * The `mergeHtmlPlugin` below preserves the original inline HTML by diffing the
 * node streams before and after highlighting and merging them back together, so
 * both the syntax colors and the conums survive.
 *
 * mergeHtmlPlugin adapted from highlight.js (MIT License),
 * https://github.com/highlightjs/highlight.js/issues/2889
 */

declare const hljs: any

;(function () {
  if (typeof hljs === 'undefined') {
    return
  }

  function escapeHTML(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
  }

  function tag(node: any): string {
    return node.nodeName.toLowerCase()
  }

  // Build a stream of start/stop events for every element in `node`, keyed by
  // the text offset at which they occur.
  function nodeStream(node: any): any[] {
    const result: any[] = []
    ;(function _nodeStream(node: any, offset: number): number {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          offset += child.nodeValue.length
        } else if (child.nodeType === 1) {
          result.push({ event: 'start', offset, node: child })
          offset = _nodeStream(child, offset)
          // Void elements must not emit a closing event.
          if (!tag(child).match(/br|hr|img|input/)) {
            result.push({ event: 'stop', offset, node: child })
          }
        }
      }
      return offset
    })(node, 0)
    return result
  }

  // Merge the original markup stream into the highlighted one.
  function mergeStreams(
    original: any[],
    highlighted: any[],
    value: string,
  ): string {
    let processed = 0
    let result = ''
    const nodeStack: any[] = []

    function selectStream() {
      if (!original.length || !highlighted.length) {
        return original.length ? original : highlighted
      }
      if (original[0].offset !== highlighted[0].offset) {
        return original[0].offset < highlighted[0].offset
          ? original
          : highlighted
      }
      // Ensure a stop event is rendered before a start event at the same offset.
      return highlighted[0].event === 'start' ? original : highlighted
    }

    function open(node: any) {
      function attributeString(attr: any) {
        return ' ' + attr.nodeName + '="' + escapeHTML(attr.value) + '"'
      }
      result +=
        '<' +
        tag(node) +
        [].map.call(node.attributes, attributeString).join('') +
        '>'
    }

    function close(node: any) {
      result += '</' + tag(node) + '>'
    }

    function render(event: any) {
      ;(event.event === 'start' ? open : close)(event.node)
    }

    while (original.length || highlighted.length) {
      let stream = selectStream()
      result += escapeHTML(value.substring(processed, stream[0].offset))
      processed = stream[0].offset
      if (stream === original) {
        // Close the highlighted stack, render the original tag(s) at this
        // offset, then reopen the highlighted stack.
        nodeStack.reverse().forEach(close)
        do {
          render(stream.splice(0, 1)[0])
          stream = selectStream()
        } while (
          stream === original &&
          stream.length &&
          stream[0].offset === processed
        )
        nodeStack.reverse().forEach(open)
      } else {
        if (stream[0].event === 'start') {
          nodeStack.push(stream[0].node)
        } else {
          nodeStack.pop()
        }
        render(stream.splice(0, 1)[0])
      }
    }
    return result + escapeHTML(value.substr(processed))
  }

  let originalStream: any[]
  const mergeHtmlPlugin = {
    'before:highlightElement': ({ el }: any) => {
      originalStream = nodeStream(el)
    },
    'after:highlightElement': ({ el, result, text }: any) => {
      if (!originalStream || !originalStream.length) {
        return
      }
      const resultNode = document.createElement('div')
      resultNode.innerHTML = result.value
      result.value = mergeStreams(originalStream, nodeStream(resultNode), text)
      el.innerHTML = result.value
    },
  }

  // Highlight a set of code elements, skipping any that highlight.js has
  // already processed (it marks them with `data-highlighted`). This lets
  // incremental preview updates re-highlight only the blocks that changed
  // while leaving preserved blocks untouched.
  function highlightElements(elements: any[]): void {
    elements.forEach((el: any) => {
      if (el.dataset && el.dataset.highlighted) {
        return
      }
      hljs.highlightElement(el)
    })
  }
  // Re-highlight hook used by incremental preview updates.
  ;(window as any).__asciidocHighlight = (root?: ParentNode) => {
    highlightElements(
      [].slice.call(
        (root || document).querySelectorAll('pre.highlight > code'),
      ),
    )
  }

  if (hljs.initHighlighting.called) {
    return
  }
  hljs.initHighlighting.called = true
  hljs.addPlugin(mergeHtmlPlugin)
  highlightElements(
    [].slice.call(document.querySelectorAll('pre.highlight > code')),
  )
})()

export {}
