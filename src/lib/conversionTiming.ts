/**
 * Measures the phases of an AsciiDoc conversion or parse, to find out which
 * documents are slow enough to block the extension host (see #1245).
 *
 * Free of any `vscode` dependency, so it can be unit tested and, later, run in
 * a worker.
 */
export class ConversionTiming {
  private readonly start: number
  private last: number
  private readonly phases: { name: string; duration: number }[] = []

  constructor(private readonly now: () => number = () => performance.now()) {
    this.start = this.now()
    this.last = this.start
  }

  /**
   * Ends the current phase, started when the previous one ended (or when the
   * timing was created), and records its duration under the given name.
   */
  public phase(name: string): void {
    const now = this.now()
    this.phases.push({ name, duration: now - this.last })
    this.last = now
  }

  /** Time elapsed since the timing was created, in milliseconds. */
  public get total(): number {
    return this.now() - this.start
  }

  /**
   * Describes the measure on one line, for the log, e.g.
   * `Converted for the preview file:///a.adoc (120 lines, 4.1 K chars) in 52 ms (load: 30 ms, convert: 22 ms)`.
   */
  public format(action: string, documentUri: string, text: string): string {
    const phases = this.phases
      .map(({ name, duration }) => `${name}: ${formatDuration(duration)}`)
      .join(', ')
    return `${action} ${documentUri} (${describeSize(text)}) in ${formatDuration(this.total)}${phases ? ` (${phases})` : ''}`
  }
}

export function formatDuration(milliseconds: number): string {
  return `${Math.round(milliseconds)} ms`
}

export function describeSize(text: string): string {
  const lines = countLines(text)
  return `${lines} ${lines === 1 ? 'line' : 'lines'}, ${formatSize(text.length)}`
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0
  }
  let lines = 1
  let index = text.indexOf('\n')
  while (index !== -1) {
    // A trailing line feed does not start a new line.
    if (index < text.length - 1) {
      lines++
    }
    index = text.indexOf('\n', index + 1)
  }
  return lines
}

function formatSize(characters: number): string {
  if (characters < 1024) {
    return `${characters} chars`
  }
  return `${(characters / 1024).toFixed(1)} K chars`
}
