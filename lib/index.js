/**
 * dsh-jp-translate — the 日语翻译 agent preset and its settings surface.
 *
 * The preset is one step BELOW the harness's own `minimal` mode: it declares a
 * single preset-local plugin (see ../presets/jp-translate.mjs) that owns the
 * WHOLE system prompt and shadows every prior surface node before each request.
 * The result is a strictly single-shot translation endpoint:
 *
 *   - no tools at all (no shell, no filesystem, no search, no subagents);
 *   - every request is exactly `[system] <translation contract + glossary>` and
 *     `[user] <the source text>` — never any history;
 *   - the `[Glossaries]` term table is edited in the Web settings page through
 *     two text boxes (原始文本 / 翻译文本) and saved as selectable presets.
 *
 * This host half declares the preset to the agent-preset registry at activation
 * (declare = enabled, so nothing is written into the harness home) and
 * re-declares it on every committed settings write so the new glossary reaches
 * sessions created afterwards. The preset row carries the glossary value, so
 * the preset-local plugin needs no file access and no host service.
 *
 * @module @workspace/dsh-jp-translate
 */

import z from '@deepseek-ai/schemastery'
import { presetDefinition } from './preset.js'
import { GLOSSARY_FIELD, parseState, serializeState, defaultState } from './state.js'

/** Stable cordis plugin name. */
export const name = 'jp-translate'

/**
 * Profile entry id this package's bundle patch inserts; the settings page binds
 * its form to this entry.
 */
export const SETTINGS_ENTRY_ID = 'jp-translate'

/** The preset identity this plugin declares, re-exported for consumers. */
export { PRESET_ID, PRESET_NAME } from './state.js'

/**
 * Plugin config. The Config of a profile entry IS its settings page, so the
 * whole glossary document lives in its single volatile field.
 *
 * Volatility matters for two reasons: the Host serves exactly the volatile
 * fields as this entry's editable form, and a volatile write is committed into
 * the reference this activation already holds instead of remounting the row —
 * which is what lets a save re-declare the preset in place.
 */
export const Config = z.object({
  [GLOSSARY_FIELD]: z.string().default(serializeState(defaultState())).volatile(),
})

/** Published cross-instance contract: package names currently mounted. */
const MOUNTED = Symbol.for('@workspace/dsh-jp-translate/mounted')

/** Queueing key the guard uses for refused mounts. */
const WAITERS = Symbol.for('@workspace/dsh-jp-translate/mount-waiters')

/**
 * Wrap an apply so this package runs at most once per process, even when the
 * profile lists it twice (an aggregate install beside a standalone one). The
 * refused mount is queued and replayed when the holder disposes, mirroring the
 * family guard the other Web UI plugins use.
 * @param {string} packageName - shared package identity.
 * @param {(ctx: any, config?: any) => void} fn - the real apply.
 * @returns {(ctx: any, config?: any) => void} the guarded apply.
 */
function mountOnce(packageName, fn) {
  const registry = /** @type {Record<symbol, unknown>} */ (globalThis)
  return (ctx, config) => {
    let mounted = registry[MOUNTED]
    if (!(mounted instanceof Set)) {
      mounted = new Set()
      registry[MOUNTED] = mounted
    }
    if (mounted.has(packageName)) {
      // Another fiber owns the name; replay if and when it releases it.
      let alive = true
      const pending = () => {
        if (alive) fn(ctx, config)
      }
      ctx?.effect?.(() => () => {
        alive = false
      })
      const waiters = (registry[WAITERS] ??= new Map())
      const queue = waiters.get(packageName) ?? []
      queue.push(pending)
      waiters.set(packageName, queue)
      return
    }
    mounted.add(packageName)
    ctx?.effect?.(() => () => {
      mounted.delete(packageName)
      const waiters = /** @type {Map<string, Array<() => void>>} */ (registry[WAITERS] ?? new Map())
      const queue = waiters.get(packageName)
      if (queue === undefined) return
      waiters.delete(packageName)
      for (const replay of queue.splice(0)) queueMicrotask(replay)
    })
    fn(ctx, config)
  }
}

/**
 * Read one activation field: the Host hands volatile fields over as references
 * whose `get()` reads the committed value, while a profile patch or a test may
 * pass the plain value.
 * @param {unknown} field - the raw field.
 * @param {string} fallback - default when nothing is committed yet.
 * @returns {string} the effective string value.
 */
function readConfigField(field, fallback) {
  if (field === undefined || field === null) return fallback
  const ref = /** @type {{ get?: () => unknown }} */ (field)
  const value = typeof ref.get === 'function' ? ref.get() : field
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/**
 * Mount the host half: declare the bundled preset and keep it in step with the
 * settings page.
 * @param {any} ctx - the host plugin context.
 * @param {unknown} config - the entry config (schema defaults applied by the Loader).
 */
export const apply = mountOnce('@workspace/dsh-jp-translate', function applyImpl(ctx, config) {
  /** The live registry, or undefined on a deployment that composes none. */
  const registryOf = () => {
    try {
      return ctx.get('agentPresets')
    } catch {
      return undefined
    }
  }

  /** Disposer of the live declaration; this plugin owns its lifetime. */
  let release
  /** Declaration generation: a re-arm supersedes the one it replaced. */
  let generation = 0
  /** Set once this fiber unloads, so a late re-arm cannot declare again. */
  let closed = false
  /** Serializes declaration work so a settings write cannot interleave with activation. */
  let queue = Promise.resolve()
  /** True when the last attempt found no registry, which the recovery below repairs. */
  let registryMissing = false

  const warn = message => {
    try {
      ctx.logger?.warn?.(`dsh-jp-translate: ${message}`)
    } catch {
      // A logger that refuses the write must not break the plugin.
    }
  }

  /** Release the live declaration, tolerating an already-unmounted registry. */
  const undeclare = async () => {
    const dispose = release
    release = undefined
    if (dispose === undefined) return
    try {
      await dispose()
    } catch (error) {
      warn(`releasing the preset declaration failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** The glossary value to write into the declared preset row. */
  const glossaryValue = () => {
    const field = config === null || typeof config !== 'object'
      ? undefined
      : /** @type {Record<string, unknown>} */ (config)[GLOSSARY_FIELD]
    const raw = readConfigField(field, serializeState(defaultState()))
    // Normalize (and re-serialize) so the preset row always carries a document
    // this plugin's own reader understands, whatever the field held.
    return serializeState(parseState(raw))
  }

  /** Declare the preset with the settings committed right now. */
  const declare = () => {
    const target = ++generation
    queue = queue.then(async () => {
      if (closed || target !== generation) return
      await undeclare()
      const registry = registryOf()
      if (registry === undefined) {
        registryMissing = true
        warn('the agent-preset registry is unavailable; the 日语翻译 preset is not declared')
        return
      }
      const definition = presetDefinition()
      const plugins = definition.plugins.map(row => row.id === 'jp-translate'
        ? { ...row, config: { [GLOSSARY_FIELD]: glossaryValue() } }
        : row)
      try {
        release = await registry.register({ ...definition, plugins })
        registryMissing = false
        ctx.logger?.info?.('jp-translate: preset declared')
      } catch (error) {
        warn(`declaring the preset failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }).catch(error => {
      warn(`preset declaration failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /** A committed settings write lands here: the preset is re-declared in place. */
  ctx.on('loader/volatile-update', () => {
    declare()
  })

  // The registry is deliberately not a hard inject: a deployment may compose
  // none, and waiting would pend this row forever. A single recovery attempt
  // happens when it appears, gated on the earlier miss so the row that was
  // already registered at activation is never released and re-declared.
  ctx.inject(['agentPresets'], () => {
    if (registryMissing) declare()
  })

  ctx.effect(() => {
    declare()
    return async () => {
      closed = true
      generation += 1
      await queue
      await undeclare()
    }
  }, 'dsh-jp-translate: preset declaration')
})
