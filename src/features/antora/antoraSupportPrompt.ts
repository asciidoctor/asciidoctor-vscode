/*
 * Orchestration for the one-shot "Enable Antora support?" prompt, kept free of
 * any `vscode` dependency so it can be unit-tested in isolation (the VS Code
 * wiring lives in `antoraContext.ts`).
 *
 * The goal is to show the prompt at most once per session and reduce its
 * frequency (asciidoctor/asciidoctor-vscode#896): it is never stacked when
 * several Antora documents open at once, and never re-shown while a previous
 * prompt is still pending — e.g. when the user simply ignores the notification
 * rather than answering it.
 */

export interface AntoraSupportPrompt<TDocument> {
  /**
   * Whether the prompt is allowed to show at all (the
   * `asciidoc.antora.showEnableAntoraPrompt` setting). Consulted on every
   * opened document so the user can flip the setting without reloading.
   */
  isPromptEnabled: () => boolean
  /** Whether an Antora configuration applies to the just-opened document. */
  appliesToAntora: (document: TDocument) => Promise<boolean>
  /**
   * Show the prompt and resolve to the user's choice: `true` to enable, `false`
   * to refuse for good (never ask again), or `undefined` when the user defers
   * (e.g. "not now", or dismissing the prompt) without settling the choice.
   */
  askToEnable: () => Promise<boolean | undefined>
  /** The persisted decision, or `undefined` when none has been made yet. */
  getDecision: () => boolean | undefined
  /** Persist the user's decision. */
  setDecision: (enabled: boolean) => Promise<void>
  /** Turn the Antora features on. */
  enableFeatures: () => void
  /** Stop listening for opened documents. */
  dispose: () => void
}

/**
 * Build the "document opened" handler for the one-shot prompt. Returns an async
 * function to call for every opened document; it decides whether (and how) to
 * prompt, guaranteeing a single prompt at a time.
 */
export function createAntoraSupportPromptHandler<TDocument>(
  prompt: AntoraSupportPrompt<TDocument>,
): (document: TDocument) => Promise<void> {
  let promptInFlight = false
  return async (document) => {
    // A decision may have been made meanwhile — e.g. through the
    // "Enable/Disable Antora support" command. Honour it and stop listening,
    // rather than asking again and overwriting it.
    if (prompt.getDecision() !== undefined) {
      prompt.dispose()
      return
    }
    // The prompt is turned off by configuration: keep listening (the user may
    // turn it back on within the session) but never ask.
    if (!prompt.isPromptEnabled()) {
      return
    }
    // Only one prompt at a time. While a notification is pending (including when
    // the user ignores it), opening more documents must not stack another one.
    if (promptInFlight) {
      return
    }
    if (!(await prompt.appliesToAntora(document))) {
      return
    }
    // Re-check after the await: a concurrent open or a command may have settled
    // the decision (or started a prompt) while we were awaiting.
    if (promptInFlight || prompt.getDecision() !== undefined) {
      return
    }
    promptInFlight = true
    const answer = await prompt.askToEnable()
    // A `undefined` answer means the user deferred (e.g. "not now" or dismissed
    // the prompt): leave the decision unmade so it can be asked again in a later
    // session, but stop listening for now to avoid nagging within this one.
    if (answer !== undefined) {
      await prompt.setDecision(answer)
      if (answer) {
        prompt.enableFeatures()
      }
    }
    prompt.dispose()
  }
}
