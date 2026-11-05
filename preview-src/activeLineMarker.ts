import { getElementsForSourceLine } from './scroll-sync.js'

const ACTIVE_CLASS = 'code-active-line'

type ElementForLine = (line: number) => HTMLElement | undefined

function elementForLine(line: number): HTMLElement | undefined {
  const { previous } = getElementsForSourceLine(line)
  return previous && previous.element
}

/**
 * Highlight the block of the preview that contains the cursor of the editor.
 */
export class ActiveLineMarker {
  private _current: HTMLElement | undefined
  private _line: number | undefined

  constructor(
    private readonly _elementForLine: ElementForLine = elementForLine,
  ) {}

  onDidChangeTextEditorSelection(line: number) {
    this._line = line
    this._update(this._elementForLine(line))
  }

  /**
   * Remove the highlight before the content of the preview is updated, so that
   * the class does not make an unchanged block differ from its new version.
   */
  clear() {
    this._update(undefined)
  }

  /**
   * Highlight the block of the cursor again once the content of the preview is
   * updated: the update replaces the classes of the blocks that changed, the one
   * being edited included, and can move the block of the cursor.
   */
  refresh() {
    if (this._line !== undefined) {
      this._update(this._elementForLine(this._line))
    }
  }

  _update(before: HTMLElement | undefined) {
    this._unmarkActiveElement(this._current)
    this._markActiveElement(before)
    this._current = before
  }

  _unmarkActiveElement(element: HTMLElement | undefined) {
    element?.classList.remove(ACTIVE_CLASS)
  }

  _markActiveElement(element: HTMLElement | undefined) {
    element?.classList.add(ACTIVE_CLASS)
  }
}
