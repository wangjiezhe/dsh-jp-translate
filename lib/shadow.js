/**
 * The stateless-request invariant, extracted so it can be unit-tested against a
 * real `Session`.
 *
 * Every request of the 日语翻译 preset must carry exactly two wire messages: the
 * system prompt and the source text the user just sent. The harness derives a
 * request from the session's model-visible surface, and every turn appends to
 * that surface — so a plain "translate each message" chat would resend the whole
 * conversation on every request.
 *
 * The fix is a positional surface replacement: before each request the preset
 * shadows every current surface node EXCEPT node 0 (the system prompt) with one
 * empty developer message. `deriveEventMessage` returns `null` for a developer
 * node with no content, so the replacement removes the covered nodes from the
 * derived history without adding a wire message of its own. The underlying log
 * stays append-only; only the model-visible projection changes.
 *
 * THREE durable-session contracts constrain that event:
 *
 * 1. It is a Step-scoped surface event, so it must name the currently open turn
 *    and step (`@deepseek-ai/dsh-session/invariant`, `developer/message` ->
 *    `requireOpenStep`). Omitting them fails with "developer/message turn must be
 *    a non-negative safe integer".
 * 2. Its `source.kind` must be PRODUCER-OWNED: the format-v4 codec refuses the
 *    retired generic wrapper `kind: "plugin"` ("format v4 developer message
 *    requires id, role, content, and a producer-owned source"). Every producer
 *    names itself, the way `agent-instructions` uses
 *    `{ kind: "agent-instructions" }`.
 * 3. It must be appended while that step is OPEN IN THE LOG, and the only
 *    moment that satisfies (1) is inside the step. `agent/pre-step` runs BEFORE
 *    the loop appends `step/start` (dsh-agent-loop `turn()`: preStep ->
 *    `session.append("step/start")` -> `step()`), so a shadow appended there
 *    lands between `turn/start` and `step/start` — a position no turn/step pair
 *    can describe. The live append is not checked, so the turn succeeds and the
 *    damage is latent: reopening the session runs the released format-v4 reader
 *    (`dsh-session-format-v3-to-v4` `Relationships.requireStep`) and it refuses
 *    the whole log with
 *
 *      SessionFormatError: developer/message does not match an open turn and step
 *
 *    i.e. "stored session … is corrupt" and the conversation can never be
 *    reopened. The append therefore happens in `agent/request`, which the loop
 *    dispatches from `prepareRequest` INSIDE `step()` — after `step/start`,
 *    before it derives the request. That is also the last hook before the wire
 *    is composed, so it is the correct place on both counts.
 *
 * @module @workspace/dsh-jp-translate/shadow
 */

/**
 * Producer-owned message source kind. It must be this plugin's own identity —
 * `'plugin'` is the retired generic kind the format-v4 codec rejects.
 */
export const SOURCE_KIND = 'jp-translate'

/**
 * Source kind the agent loop stamps on its runtime-context injection.
 *
 * The loop's `RuntimeContextProjection` (`@deepseek-ai/dsh-agent-loop`, module
 * `runtime-context`) commits the rendered dynamic context as an extra USER
 * message: `const SOURCE = "runtime-context"`, and `isOwned(message)` is exactly
 * `message.source.kind === SOURCE`. The surface shadow above cannot reach it: the
 * loop builds the message during `pre-step` and appends it with the claimed user
 * messages inside `step()` — i.e. AFTER the history shadow has already run, so it
 * would survive as a third wire message. It is removed from the decision instead.
 *
 * `run-spec.mjs` re-reads the shipped module and asserts this mirror still
 * matches the constant it copies, so a rename fails the suite instead of
 * silently leaking the snapshot again.
 */
export const RUNTIME_CONTEXT_SOURCE = 'runtime-context'

/**
 * Whether one pre-step message is the loop's runtime-context injection.
 * @param {unknown} message - a candidate wire message.
 * @returns {boolean} true when its producer-owned source kind is the loop's.
 */
function isRuntimeContext(message) {
  if (message === null || typeof message !== 'object') return false
  const source = /** @type {{ source?: unknown }} */ (message).source
  if (source === null || typeof source !== 'object') return false
  return /** @type {{ kind?: unknown }} */ (source).kind === RUNTIME_CONTEXT_SOURCE
}

/**
 * Remove the loop's runtime-context injection from one pre-step decision.
 *
 * The reported defect: every other request carried a second user message with
 * the whole "Current runtime context…" snapshot. It alternates because the two
 * mechanisms fight — the loop re-injects whenever its retained snapshot is no
 * longer in the surface, and the history shadow above removes it from the
 * surface every turn. Suppressing the context contributions prevents the
 * snapshot from being built at all (see the preset's `suppressRuntimeContext`),
 * and this filter is the wire guarantee for sessions whose log already holds an
 * injected snapshot: dropping the message also stops it from ever entering the
 * surface.
 *
 * Only the loop's own message is removed. The claimed user messages — including
 * any a peer plugin rewrote — are passed through untouched, because dropping
 * them would discard the user's source text.
 * @param {any} decision - the value the waterfall chain resolved.
 * @returns {any} the same decision, or a copy without the injected message.
 */
export function stripRuntimeContext(decision) {
  if (decision === null || typeof decision !== 'object') return decision
  if (decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
  const kept = decision.messages.filter(message => !isRuntimeContext(message))
  if (kept.length === decision.messages.length) return decision
  return { ...decision, messages: kept }
}

/**
 * Forget the loop's retained runtime-context snapshot for one agent.
 *
 * WHY THIS IS NEEDED (DSH 0.2.2-rc.5)
 *   The loop no longer sends the context as part of the `agent/pre-step`
 *   decision. `step()` calls `systemPrompt.refreshContext(assembly)` and then
 *   `this.runtimeContext.project(sections)` itself, and appends the result after
 *   the claimed messages — so `stripRuntimeContext()` can no longer keep it off
 *   the wire. A scope that suppresses context renders no sections, and
 *   `project([])` is silent only while its private `retained` value is
 *   `undefined`. A resumed session whose log still holds a snapshot starts with
 *   `retained` set; the history shadow then covers that node, and
 *   `RuntimeContextProjection` treats a replacement that names the retained
 *   sequence as "context no longer applies" and emits a cleared reminder. The
 *   shadow covers that reminder on the next turn, so the reminder would be
 *   re-emitted on EVERY request.
 *
 *   The projection is not reachable through a public service; the loop exposes
 *   it as the instance field `runtimeContext` on the Agent it passes to
 *   `agent/request` (the event payload fuses the agent into every dispatch —
 *   `@deepseek-ai/dsh-agent` `agentEvents`). Clearing `retained` before the step
 *   projects it is therefore exact for a scope that suppresses context: there
 *   is never a snapshot to retain. `run-spec.mjs` reads the shipped loop source
 *   and fails if that field stops existing.
 *
 * Never throws: a preset that cannot clear the state must leave the request
 * alone rather than fail the turn (the request then carries one extra reminder,
 * which is a degradation, not a failure).
 * @param {any} agent - the live agent the `agent/request` hook received.
 * @returns {boolean} whether a retained value was cleared.
 */
export function resetRuntimeContextRetention(agent) {
  try {
    if (agent === null || typeof agent !== 'object') return false
    const projection = /** @type {{ runtimeContext?: { retained?: unknown } }} */ (agent).runtimeContext
    if (projection === null || typeof projection !== 'object') return false
    if (!('retained' in projection)) return false
    projection.retained = undefined
    return true
  } catch {
    return false
  }
}

/**
 * Compute the replacement that shadows all history behind the system prompt.
 *
 * Node 0 is deliberately excluded: the session's surface fold protects the
 * system prompt by rejecting any replacement that covers node 0 unless the
 * replacing event is itself a `system/message` over exactly that node.
 * @param {readonly number[]} nodes - the session's current surface node sequences, in order.
 * @returns {{ startSeq: number, endSeq: number, sourceEventSeqs: number[] } | undefined} the replacement coordinates, or `undefined` when there is no history to drop.
 */
export function historyShadowOptions(nodes) {
  if (!Array.isArray(nodes) || nodes.length <= 1) return undefined
  const shadowed = nodes.slice(1)
  return {
    startSeq: shadowed[0],
    endSeq: shadowed[shadowed.length - 1],
    sourceEventSeqs: [...shadowed],
  }
}

/**
 * The empty developer message that carries one replacement.
 * @param {string} id - message identity (a fresh uuid per append keeps the log readable).
 * @returns {{ id: string, role: string, source: { kind: string }, content: never[] }} the message payload.
 */
export function emptyDeveloperMessage(id) {
  return {
    id,
    role: 'developer',
    source: { kind: SOURCE_KIND },
    content: [],
  }
}

/**
 * Whether one value can name an open session step.
 * @param {unknown} value - the candidate turn or step.
 * @returns {boolean} true for a non-negative safe integer.
 */
function isStepCoordinate(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Shadow the history of one live agent, if it has any.
 *
 * MUST be called while the agent's step is open: see contract 3 in the module
 * doc. `agent/request` is the only hook that satisfies it.
 *
 * Never throws: a preset that cannot shape a request must leave the request
 * alone rather than fail the turn.
 * @param {any} agent - the live agent whose session owns the surface.
 * @param {AbortSignal | undefined} signal - the step's cancellation signal.
 * @param {(id: string) => string} mintId - message-id factory.
 * @param {number} turn - the open turn, from the hook payload.
 * @param {number} step - the open step, from the hook payload.
 * @returns {boolean} whether a replacement was appended.
 */
export function shadowHistory(agent, signal, mintId, turn, step) {
  if (signal?.aborted === true) return false
  if (!isStepCoordinate(turn) || !isStepCoordinate(step)) return false
  const session = agent?.session
  if (session === undefined || session === null) return false
  let nodes
  try {
    nodes = session.surface?.nodes
  } catch {
    return false
  }
  const options = historyShadowOptions(nodes)
  if (options === undefined) return false
  const { startSeq, endSeq, sourceEventSeqs } = options
  try {
    session.append(
      'developer/message',
      { turn, step, message: emptyDeveloperMessage(mintId()) },
      { surfaceOp: { op: 'replace', startSeq, endSeq }, sourceEventSeqs },
    )
    return true
  } catch {
    return false
  }
}
