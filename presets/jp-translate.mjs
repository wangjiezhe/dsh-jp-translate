/**
 * 日语翻译 preset-local plugin — the whole mode.
 *
 * Mounted once per preset scope by `@deepseek-ai/dsh-agent-preset-registry`
 * (the declaration lives in ../lib/preset.js). It owns two facts:
 *
 * 1. THE COMPLETE SYSTEM PROMPT. `complete: true` makes the rendered text the
 *    exact prompt after assembly, so the harness identity, deployment persona,
 *    tool guidance, workspace instructions, and runtime context contributions
 *    the deployment would otherwise make never reach the model. The text is
 *    rebuilt on every assembly from the glossary the settings page saved.
 *
 * 2. NO TOOL DECLARATIONS. A complete prompt section removes the prompt's
 *    *guidance* about tools but not the `tools` array of the request body: the
 *    tool schemas are assembled by `ToolRuntime` into `assembly.tools` and
 *    travel beside the prompt. Two independent suppressions apply, because the
 *    mode is a translation endpoint and must be one on both ends:
 *
 *      - the `system-prompt/assemble` waterfall empties `assembly.tools`, so
 *        NO tool declaration reaches the wire whatever any other plugin
 *        contributed (the loop omits the key entirely for an empty array);
 *      - `tools.restrict({ allow: [] })` removes every inherited tool from this
 *        preset scope's capability view, so a name the model invents anyway
 *        cannot resolve and execute (`UNKNOWN_TOOL` instead of a web search).
 *
 *    Both are scope-tagged: this listener and this restriction are owned by the
 *    preset's standing scope, which the scope chain places ABOVE each agent
 *    joined to the preset (dsh-scope: layers inherit down the chain, event
 *    admission extends up it). No other agent in the process is affected.
 *
 * 3. NO INJECTED RUNTIME CONTEXT. The loop renders the deployment's dynamic
 *    context (file policy, approval policy, sandbox facts, …) and commits it as
 *    an extra USER message beside the claimed input — it is NOT a prompt
 *    section, so neither `complete: true` nor the surface shadow can remove it:
 *    the loop builds it after this hook and appends it with the user messages.
 *    Two suppressions apply here as well:
 *
 *      - `systemPrompt.suppressRuntimeContext()` empties the assembly's
 *        contexts, so the snapshot is never rendered for this scope;
 *      - `stripRuntimeContext()` in `agent/pre-step` drops the loop's own
 *        message from the decision, which is what keeps a session whose log
 *        already holds one snapshot clean.
 *
 *    The alternation the defect showed is these two mechanisms fighting: the
 *    loop re-injects whenever its retained snapshot left the surface, and the
 *    history shadow removes it from the surface every turn.
 *
 * 4. THE STATELESS-REQUEST INVARIANT. Every request shadows the session's
 *    current surface except the system prompt (node 0) with one empty developer
 *    message. The loop DERIVES the request from the surface after that, so the
 *    composed wire is exactly:
 *
 *      [system] <the complete system prompt>
 *      [user]   <the source text the user just sent>
 *
 *    with no prior turn, no assistant reply, and no injected context. The
 *    replacement is durable, so it also survives resume: a reopened session
 *    sends the new message alone even though the log still holds the old turns.
 *    The log stays append-only — nothing is deleted, only shadowed.
 *
 *    PLACEMENT IS LOAD-BEARING. The shadow is a Step-scoped surface event, so it
 *    must be appended while the step is open. `agent/pre-step` runs BEFORE the
 *    loop appends `step/start`, and a row written there makes the stored log
 *    unreadable ("developer/message does not match an open turn and step") — the
 *    reader only checks on load, so every turn succeeds and the session is lost
 *    the moment it is reopened. The append therefore happens in `agent/request`,
 *    which `step()` dispatches after `step/start` and before it derives the
 *    request. See ../lib/shadow.js contract 3.
 *
 * @module @workspace/dsh-jp-translate/preset
 */

import { randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { buildSystemPrompt, parseState, PROMPT_SECTION, serializeState, defaultState } from '../lib/state.js'
import { shadowHistory, stripRuntimeContext } from '../lib/shadow.js'

/** Cordis plugin name. */
export const name = 'jp-translate'

/**
 * Prompt assembly must exist before the section can register. `agent/pre-step`
 * is an event, not a service, so it needs no inject. The tool registry is
 * deliberately NOT injected here: a deployment that composes no tools row has
 * nothing to suppress, and a hard inject would leave this preset pending on a
 * service it does not need (see the optional `ctx.inject` below).
 */
export const inject = ['systemPrompt']

/**
 * Runtime schema of the preset row's config.
 *
 * This MUST be a schemastery schema: cordis resolves a plugin's config through
 * `runtime.Config['~standard'].validate(config)`, so a plain object literal
 * (which reads as default config VALUES, not as a schema) fails activation with
 * "Cannot read properties of undefined (reading 'validate')". The declaring
 * host always writes `glossary`; the default keeps a hand-mounted preset working.
 */
export const Config = z.object({
  glossary: z.string().default(serializeState(defaultState())),
})

/**
 * The order assigned to the complete prompt section. Any finite number works —
 * a complete section becomes the whole prompt — but an explicit, high order
 * keeps it clear that this section is not a contribution to a composed prompt.
 */
const SECTION_ORDER = 1000

/**
 * Read this row's glossary config.
 * @param {unknown} config - the row config the Loader passed.
 * @returns {string} the stored glossary document, or an empty string.
 */
function glossaryOf(config) {
  if (config === null || typeof config !== 'object') return ''
  const value = /** @type {Record<string, unknown>} */ (config).glossary
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object') {
    /** A settings write may hand a `Volatile` reference rather than the value. */
    const ref = /** @type {{ get?: () => unknown }} */ (value)
    if (typeof ref.get === 'function') {
      const current = ref.get()
      return typeof current === 'string' ? current : ''
    }
  }
  return ''
}

/**
 * Mount the preset-local plugin.
 * @param {any} ctx - the preset scope's cordis context.
 * @param {unknown} config - the row config (see {@link Config}).
 */
export function apply(ctx, config) {
  /** The current complete system prompt, rebuilt from the config on every assembly. */
  const currentPrompt = () => buildSystemPrompt(parseState(glossaryOf(config)))

  ctx.effect(() => ctx.systemPrompt.section({
    name: PROMPT_SECTION,
    order: SECTION_ORDER,
    text: currentPrompt,
    complete: true,
  }), 'jp-translate: complete system prompt')

  // Tool declaration removal, end one: whatever every tool provider contributed
  // to `assembly.tools`, the preset-scope listener replaces it with none. This
  // is the wire guarantee, independent of which plugins registered schemas.
  ctx.effect(() => ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next()
    return assembly.tools.length === 0 ? assembly : { ...assembly, tools: [] }
  }), 'jp-translate: no tool declarations')

  // Tool declaration removal, end two: the capability view this preset scope and
  // every agent under it resolve is emptied, so a tool name the model invents
  // still cannot execute. Optional injection: with no tool registry composed
  // there is nothing to restrict, and this plugin must not pend on it.
  // `restrict()` already registers through the calling context's effect, so its
  // own disposer needs no second wrapper here.
  ctx.inject(['tools'], scoped => {
    scoped.tools.restrict({ allow: [] })
  })

  // Runtime-context removal, end one: no dynamic context contribution is
  // rendered for this scope, so the loop has no snapshot to inject. Scope-owned,
  // so other agents in the process keep their runtime context.
  ctx.effect(() => ctx.systemPrompt.suppressRuntimeContext(), 'jp-translate: no runtime context')

  // Runtime-context removal, end two: the loop appends its snapshot message
  // AFTER this hook, as one of the claimed messages, so it has to be filtered
  // out of the resolved decision. Claimed user text passes through untouched.
  // Nothing durable is written here — see the `agent/request` hook below.
  ctx.effect(() => ctx.on('agent/pre-step', (_payload, next) => (
    Promise.resolve(next()).then(stripRuntimeContext)
  )), 'jp-translate: no injected runtime context')

  // The stateless-request shadow. `agent/request` is dispatched from the loop's
  // `prepareRequest`, i.e. INSIDE `step()`: `step/start` is already logged, the
  // claimed user messages of this step are not yet, and the request is derived
  // from the surface immediately afterwards. That window is the only one where a
  // Step-scoped replacement can be appended without making the stored log
  // unreadable (../lib/shadow.js contract 3).
  //
  // The ledger keeps ONE shadow per (turn, step): a retried request re-enters
  // `prepareRequest` with the step's user messages already on the surface, and a
  // second shadow would replace them too — the retry would be sent with no input
  // at all. Keyed per agent, because one preset mount serves every agent joined
  // to the preset.
  const shadowedStep = new WeakMap()
  ctx.effect(() => ctx.on('agent/request', ({ agent, signal, turn, step }, next) => {
    if (typeof agent === 'object' && agent !== null) {
      const key = `${String(turn)}:${String(step)}`
      if (shadowedStep.get(agent) !== key) {
        shadowedStep.set(agent, key)
        shadowHistory(agent, signal, randomUUID, turn, step)
      }
    }
    return next()
  }), 'jp-translate: stateless requests')
}
