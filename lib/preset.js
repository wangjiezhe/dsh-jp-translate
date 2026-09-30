/**
 * The declareable definition of the 日语翻译 agent preset.
 *
 * The preset is deliberately tiny: one preset-local plugin row. That row owns
 * everything the mode is:
 *
 * - the COMPLETE system prompt (the fixed translation contract plus the active
 *   glossary's term pairs), so no harness identity, tool guidance, workspace
 *   instructions, or runtime context can enter the prompt; and
 * - the request invariant that keeps every model call stateless — it shadows
 *   all prior surface history before each request, so the wire carries only the
 *   system prompt and the user's source text.
 *
 * No tool row, no shell, no filesystem, no skill mount: the mode loads no
 * tools, exactly like its namesake from the harness's own minimal preset but
 * with nothing on top.
 *
 * @module @workspace/dsh-jp-translate/preset
 */

import { PRESET_ID, PRESET_NAME, PRESET_ORDER } from './state.js'

/** Absolute file URL of the preset-local plugin module. */
export const PRESET_PLUGIN_URL = new URL('../presets/jp-translate.mjs', import.meta.url).href

/** One-line description the preset roster shows. */
export const PRESET_DESCRIPTION =
  '只做日译中：每次请求仅发送 system_prompt 与 user_prompt，不带任何历史消息；不加载任何工具。术语表可在设置页以「原始文本 / 翻译文本」两个文本框编辑并保存为可选择的预设。'

/**
 * Build the registry declaration of this plugin's bundled preset.
 * @returns {{ id: string, name: string, description: string, order: number, plugins: unknown[] }} the definition to submit to `ctx.agentPresets.register`.
 */
export function presetDefinition() {
  return {
    id: PRESET_ID,
    name: PRESET_NAME,
    description: PRESET_DESCRIPTION,
    order: PRESET_ORDER,
    plugins: [
      {
        id: 'jp-translate',
        name: PRESET_PLUGIN_URL,
      },
    ],
  }
}
