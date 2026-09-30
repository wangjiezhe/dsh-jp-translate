/**
 * 日语翻译 preset — glossary model, prompt text, and settings value codec.
 *
 * This module is the single source of truth shared by the three halves of the
 * plugin:
 *
 * - the host half validates/decodes the settings value the Web page saves;
 * - the preset-local plugin builds the COMPLETE system prompt from it at every
 *   prompt assembly;
 * - the browser half round-trips the very same shape for its two text boxes.
 *
 * Everything here is dependency-free plain JavaScript so both the Node host and
 * the browser bundle can import it unchanged (the browser uses its own inline
 * copy of the few helpers it needs).
 *
 * @module @workspace/dsh-jp-translate/state
 */

/** Stable identity of the agent preset this plugin declares. */
export const PRESET_ID = 'jp-translate'

/** Display name of the preset in the new-session roster. */
export const PRESET_NAME = '日语翻译'

/** Roster order of the preset (builtins use 1=standard, 2=ptc, 3=minimal, 4=cordis/liangshen). */
export const PRESET_ORDER = 9

/** Settings field carrying the whole glossary document as one JSON string. */
export const GLOSSARY_FIELD = 'glossary'

/** Prompt section name the preset-local plugin registers. */
export const PROMPT_SECTION = 'preset:jp-translate'

/**
 * The complete system prompt template, exactly as the mode specifies it.
 *
 * `[Glossaries]` is replaced by the active glossary's term pairs (see
 * {@link buildSystemPrompt}); the closing `[Source Text]` heading is the seam
 * the user's own message continues from — the request carries only this system
 * prompt and one user message.
 */
export const SYSTEM_PROMPT_TEMPLATE = `[Task]
Please translate the novel below in [Source Text] into Simplified Chinese.

[Tone]
Natural, fluent, elegant, light novel style.

[Strict Rules]
1. Reference the translations in [Glossaries].
2. You must **ONLY output the translated result without any additional explanation**.
3. Correctly use personal pronouns based on context, and do not arbitrarily add pronouns that are not present in the original text.
4. For loanwords in Japanese (katakana words, typically originating from English or other Western languages), **do not** directly transliterate them into Chinese based on Japanese pronunciation. Instead, first restore them to their original language (usually English), then translate the original word into appropriate, natural Chinese.
5. Retain '「' and '」', and preserve the original paragraph breaks and dialogue formatting.

[Glossaries]
{{glossaries}}

[Source Text]`

/**
 * One glossary preset: the working unit of the settings page.
 * @typedef {object} GlossaryPreset
 * @property {string} id    stable identity inside the document
 * @property {string} name  display name in the preset selector
 * @property {string} source  one original term per line
 * @property {string} target  one translated term per line, aligned by line index
 */

/**
 * The whole settings document.
 * @typedef {object} GlossaryState
 * @property {number} version  document version
 * @property {string} active   id of the selected preset (empty when none)
 * @property {GlossaryPreset[]} presets
 */

const STATE_VERSION = 1

/** The four shipped term pairs of the default preset. */
export const DEFAULT_GLOSSARIES = [
  ['仁王立ち', '挺胸站立的姿势'],
  ['気をつけ', '立正'],
  ['ピンセット', '镊子'],
  ['トーズ', '苏格兰皮拍'],
]

/**
 * Fresh document id.
 * @returns {string} a collision-resistant id.
 */
function mintId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * The shipped document: one preset named 默认 carrying this mode's four terms.
 * @returns {GlossaryState} a detached default document.
 */
export function defaultState() {
  return {
    version: STATE_VERSION,
    active: 'default',
    presets: [{
      id: 'default',
      name: '默认',
      source: DEFAULT_GLOSSARIES.map(pair => pair[0]).join('\n'),
      target: DEFAULT_GLOSSARIES.map(pair => pair[1]).join('\n'),
    }],
  }
}

/**
 * Create one empty preset, appended by the settings page's 新建 button.
 * @param {string} [name] - display name; defaults to 新预设.
 * @returns {GlossaryPreset} a preset with no terms.
 */
export function emptyPreset(name = '新预设') {
  return { id: mintId(), name, source: '', target: '' }
}

/**
 * Split a textarea value into non-empty, trimmed lines.
 *
 * Blank lines are dropped rather than kept as empty slots so a trailing newline
 * (or a decorative blank line between groups) never shifts the pairing of the
 * term columns.
 * @param {string} text - the raw textarea value.
 * @returns {string[]} the non-empty lines, in order.
 */
export function lineList(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  return text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line.length > 0)
}

/**
 * Render one preset's aligned term pairs in the `[Glossaries]` format.
 *
 * `source` and `target` are paired by line index. Every source term is listed
 * even when its translation is missing — an untranslated term still tells the
 * model which words are named conventions. A target-only tail (more
 * translations than source terms) has nothing to attach to and is ignored, so
 * a half-edited column never produces an unattributable line.
 * @param {GlossaryPreset} preset - the preset to render.
 * @returns {string} one `原文 → 译文` line per source term.
 */
export function renderGlossary(preset) {
  if (preset === null || typeof preset !== 'object') return ''
  const sources = lineList(preset.source)
  const targets = lineList(preset.target)
  return sources
    .map((source, index) => {
      const target = targets[index]
      return target === undefined ? source : `${source} → ${target}`
    })
    .join('\n')
}

/**
 * The active preset of one document, falling back to the first preset.
 * @param {GlossaryState} state - a validated document.
 * @returns {GlossaryPreset | undefined} the preset whose terms are in force.
 */
export function activePreset(state) {
  if (state === null || typeof state !== 'object' || !Array.isArray(state.presets)) return undefined
  const preset = state.presets.find(candidate => candidate.id === state.active)
  return preset ?? state.presets[0]
}

/**
 * Build the complete system prompt sent on every request.
 *
 * With no glossary terms the `[Glossaries]` heading stays in place and reads
 * `(空)`, so the prompt's shape is identical request to request and the model
 * is told explicitly that no term table applies.
 * @param {GlossaryState} state - the active glossary document.
 * @returns {string} the exact system prompt text.
 */
export function buildSystemPrompt(state) {
  const preset = activePreset(state)
  const block = renderGlossary(preset)
  return SYSTEM_PROMPT_TEMPLATE.replace('{{glossaries}}', block.length > 0 ? block : '(空)')
}

/**
 * Coerce one unknown value into a valid preset, or `undefined` when it cannot be
 * one. Unknown extra keys are dropped; `id` and `name` are repaired when absent.
 * @param {unknown} value - the candidate.
 * @param {number} index - position, used to synthesize a fallback name.
 * @returns {GlossaryPreset | undefined} the normalized preset.
 */
function coercePreset(value, index) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = /** @type {Record<string, unknown>} */ (value)
  const source = typeof record.source === 'string' ? record.source : ''
  const target = typeof record.target === 'string' ? record.target : ''
  const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : mintId()
  const name = typeof record.name === 'string' && record.name.trim().length > 0
    ? record.name
    : `预设 ${index + 1}`
  return { id, name, source, target }
}

/**
 * Validate and normalize a decoded document.
 * @param {unknown} value - the decoded candidate.
 * @returns {GlossaryState | undefined} the document, or `undefined` when the value is not a document.
 */
export function coerceState(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = /** @type {Record<string, unknown>} */ (value)
  const rawPresets = Array.isArray(record.presets) ? record.presets : []
  const presets = rawPresets.map(coercePreset).filter(preset => preset !== undefined)
  if (presets.length === 0) return undefined
  const wanted = typeof record.active === 'string' ? record.active : ''
  const active = presets.some(preset => preset.id === wanted) ? wanted : presets[0].id
  return { version: STATE_VERSION, active, presets }
}

/**
 * Parse the settings field into a document, falling back to the shipped default.
 * @param {unknown} value - the raw settings value (usually a JSON string).
 * @returns {GlossaryState} always a usable document.
 */
export function parseState(value) {
  if (value === null || value === undefined) return defaultState()
  if (typeof value === 'object') return coerceState(value) ?? defaultState()
  if (typeof value !== 'string' || value.trim().length === 0) return defaultState()
  try {
    return coerceState(JSON.parse(value)) ?? defaultState()
  } catch {
    return defaultState()
  }
}

/**
 * Serialize a document for the settings field.
 * @param {GlossaryState} state - the document to store.
 * @returns {string} the compact JSON string the Config field carries.
 */
export function serializeState(state) {
  return JSON.stringify({ version: STATE_VERSION, active: state.active, presets: state.presets })
}

/**
 * Read the settings field whether it arrives as a JSON string or an object.
 * @param {unknown} value - the raw Config value.
 * @returns {GlossaryState} the decoded document.
 */
export function readField(value) {
  return parseState(value)
}
