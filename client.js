// dsh-jp-translate browser half — the 日语翻译 settings page.
//
// Registers one `settings.section` navigation page holding the glossary editor:
// a preset selector plus the two text boxes the mode is specified with
// (原始文本 / 翻译文本). The document is stored as one JSON string in the host
// plugin entry's single volatile config field, so a save round-trips through the
// same settings transport every other plugin uses and the host re-declares the
// preset with the new terms.
//
// The bundle is hand-authored plain JavaScript: it registers itself with the
// module loader, asks `require()` only for `react` (a baseline module the shell
// always seeds), and writes its CSS through an injected <style> tag using the
// theme's semantic tokens.
window.__ModuleLoader__.load({
  id: '@workspace/dsh-jp-translate',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const useEffect = React.useEffect
    const useRef = React.useRef
    const useState = React.useState

    /** Settings field carrying the whole glossary document. */
    const FIELD = 'glossary'

    /** Section key this page registers into. */
    const SECTION = 'settings.section'

    /** Locale namespace-free page id. */
    const PAGE_ID = 'jp-translate'

    /** Candidate profile entry ids this package's row may carry, most likely first. */
    const ENTRY_IDS = ['jp-translate', '@workspace/dsh-jp-translate']

    /** Plugin name (must match the host half so logs line up). */
    const PLUGIN = 'jp-translate'

    // ── CSS ──────────────────────────────────────────────────────────────────
    const CSS = [
      '.jptr_section{display:flex;flex-direction:column;gap:14px;max-width:860px}',
      '.jptr_heading{margin:0;color:var(--dsw-alias-label-primary);font-size:17px;font-weight:600;line-height:1.4}',
      '.jptr_lede{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
      '.jptr_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:12px}',
      '.jptr_row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.jptr_label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5;flex:none}',
      '.jptr_hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}',
      '.jptr_input,.jptr_select,.jptr_area{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.6;border-radius:8px;padding:6px 10px;min-width:0}',
      '.jptr_input{height:32px;flex:1 1 180px}',
      '.jptr_select{height:32px;flex:1 1 180px}',
      '.jptr_area{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);min-height:240px;resize:vertical;white-space:pre;width:100%}',
      '.jptr_input:focus-visible,.jptr_select:focus-visible,.jptr_area:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}',
      '.jptr_grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}',
      '.jptr_col{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.jptr_colLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}',
      '.jptr_colHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}',
      '.jptr_action{appearance:none;font:inherit;font-size:13px;line-height:1.5;border-radius:8px;padding:5px 14px;cursor:pointer;border:1px solid transparent}',
      '.jptr_ghost{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.jptr_ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}',
      '.jptr_primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
      '.jptr_danger{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-state-error-primary,#b42318)}',
      '.jptr_action:disabled{opacity:.4;cursor:default}',
      '.jptr_action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.jptr_footer{display:flex;align-items:center;gap:8px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:12px}',
      '.jptr_grow{flex:1;min-width:0}',
      '.jptr_status{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.jptr_ok{color:var(--dsw-alias-label-secondary)}',
      '.jptr_bad{color:var(--dsw-alias-state-error-primary,#b42318)}',
      '.jptr_dirty{color:var(--dsw-alias-state-warn-primary,#b26a00)}',
      '.jptr_preview{margin:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.6;white-space:pre-wrap;max-height:180px;overflow:auto}',
      '@media (max-width:720px){.jptr_grid{grid-template-columns:1fr}}',
    ].join('\n')

    if (typeof document !== 'undefined') {
      const tagId = '@workspace/dsh-jp-translate/settings.css'
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
        const tag = document.createElement('style')
        tag.dataset.plugin = '@workspace/dsh-jp-translate'
        tag.dataset.pluginCss = tagId
        tag.textContent = CSS
        document.head.appendChild(tag)
      }
    }

    const cls = {
      section: 'jptr_section',
      heading: 'jptr_heading',
      lede: 'jptr_lede',
      card: 'jptr_card',
      row: 'jptr_row',
      label: 'jptr_label',
      hint: 'jptr_hint',
      input: 'jptr_input',
      select: 'jptr_select',
      area: 'jptr_area',
      grid: 'jptr_grid',
      col: 'jptr_col',
      colLabel: 'jptr_colLabel',
      colHint: 'jptr_colHint',
      action: 'jptr_action',
      ghost: 'jptr_ghost',
      primary: 'jptr_primary',
      danger: 'jptr_danger',
      footer: 'jptr_footer',
      grow: 'jptr_grow',
      status: 'jptr_status',
      ok: 'jptr_ok',
      bad: 'jptr_bad',
      dirty: 'jptr_dirty',
      idle: '',
      preview: 'jptr_preview',
    }

    /** CSS class for one status kind. */
    const statusClass = (kind) => (kind === 'ok' || kind === 'bad' || kind === 'dirty' ? cls[kind] : '')

    // ── document model (kept in sync with lib/state.js) ──────────────────────
    const DEFAULT_PRESETS = [{
      id: 'default',
      name: '默认',
      source: ['仁王立ち', '気をつけ', 'ピンセット', 'トーズ'].join('\n'),
      target: ['挺胸站立的姿势', '立正', '镊子', '苏格兰皮拍'].join('\n'),
    }]

    const newId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

    const defaultDoc = () => ({ active: 'default', presets: DEFAULT_PRESETS.map(p => ({ ...p })) })

    /** Validate and normalize one decoded document. */
    const coerce = (value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
      const raw = Array.isArray(value.presets) ? value.presets : []
      const presets = []
      for (let index = 0; index < raw.length; index += 1) {
        const candidate = raw[index]
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) continue
        presets.push({
          id: typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : newId(),
          name: typeof candidate.name === 'string' && candidate.name.trim().length > 0 ? candidate.name : '预设 ' + String(index + 1),
          source: typeof candidate.source === 'string' ? candidate.source : '',
          target: typeof candidate.target === 'string' ? candidate.target : '',
        })
      }
      if (presets.length === 0) return undefined
      const wanted = typeof value.active === 'string' ? value.active : ''
      return { active: presets.some(p => p.id === wanted) ? wanted : presets[0].id, presets }
    }

    /** Parse the settings field into a document. */
    const parse = (value) => {
      if (value === null || value === undefined) return defaultDoc()
      if (typeof value === 'object') return coerce(value) ?? defaultDoc()
      if (typeof value !== 'string' || value.trim().length === 0) return defaultDoc()
      try {
        return coerce(JSON.parse(value)) ?? defaultDoc()
      } catch {
        return defaultDoc()
      }
    }

    /**
     * Extract this plugin's field out of one config-form snapshot.
     *
     * A shared `configForms` snapshot's `value` is the WHOLE namespace section,
     * not the field: `ConfigFormController.decode` returns `view.value`
     * unchanged when the spec carries no `decode` (`ConfigForms.get(entryId)`
     * passes `{ namespace: entryId }` only), and the Host builds that value with
     * `projectForm(form, plainConfig(entry.fiber.config))` — every volatile
     * field of the entry, so the glossary arrives as
     * `{ glossary: '<json string>' }`.
     *
     * Parsing that object directly found no `presets` array, fell back to the
     * default document, and so reported every successful save as "未生效" while
     * the Host had in fact stored it. A bare string is accepted too, because a
     * single-field section may be handed over as the field value itself.
     *
     * @param {{ value?: unknown } | undefined} snapshot - one form snapshot.
     * @returns {unknown} the glossary field's value, or undefined when absent.
     */
    const fieldOf = (snapshot) => {
      const value = snapshot === null || snapshot === undefined ? undefined : snapshot.value
      if (value === null || value === undefined) return undefined
      if (typeof value === 'string') return value
      if (typeof value === 'object' && !Array.isArray(value)) {
        return /** @type {Record<string, unknown>} */ (value)[FIELD]
      }
      return undefined
    }

    /** Split one textarea value into non-empty trimmed lines. */
    const lines = (text) => (typeof text === 'string' && text.length > 0
      ? text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line.length > 0)
      : [])

    /** Render one preset's aligned pairs exactly as the system prompt will. */
    const renderGlossary = (preset) => {
      if (preset === null || typeof preset !== 'object') return []
      const source = lines(preset.source)
      const target = lines(preset.target)
      const pairs = []
      for (let index = 0; index < source.length; index += 1) {
        const translated = target[index]
        pairs.push(translated === undefined ? source[index] : source[index] + ' → ' + translated)
      }
      return pairs
    }

    // ── settings-form binding ────────────────────────────────────────────────
    /** The snapshot a binding reports before the host has answered. */
    const PENDING_FORM = { status: 'loading', value: undefined, user: undefined, writable: false, mode: 'host' }

    /**
     * Bind the config form for this entry. The family binder resolves the
     * namespace onto the profile entry id the Host actually serves; the shared
     * `configForms` service is the fallback, re-bound when the describe mirror
     * names one of this package's rows.
     *
     * Not one step of this may throw. A read that throws during activation would
     * abort `apply()` before the settings page is registered at all — the page
     * would then be missing entirely, not merely empty — so every failure
     * degrades into the pending snapshot and a form that reports unwritable.
     */
    function bindForm(ctx) {
      const binder = safe(() => ctx.get('webUiSettings'))
      if (binder !== undefined && typeof binder.bind === 'function') {
        const scope = safe(() => binder.bind({ namespace: PAGE_ID }))
        if (scope !== undefined) return scope
      }
      const forms = safe(() => ctx.configForms)
      const pick = () => {
        try {
          const view = forms.describe().getSnapshot().view
          const served = Array.isArray(view?.namespaces) ? view.namespaces.map(row => row.ns) : undefined
          if (served === undefined || served.length === 0) return ENTRY_IDS[0]
          return ENTRY_IDS.find(id => served.includes(id)) ?? PAGE_ID
        } catch {
          return ENTRY_IDS[0]
        }
      }
      const listeners = new Set()
      let boundId
      let bound
      let off
      let snapshot = PENDING_FORM
      /** Why the last state read failed, or the empty string while reads work. */
      let failure = ''
      const publish = () => {
        if (bound !== undefined) {
          try {
            snapshot = bound.getSnapshot()
            failure = ''
          } catch (error) {
            failure = describe(error)
          }
        }
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (error) {
            console.warn('[dsh-jp-translate] settings listener failed:', error)
          }
        }
      }
      const rebind = () => {
        const target = safe(pick)
        if (target === undefined || target === boundId) return
        if (off !== undefined) off()
        off = undefined
        const next = safe(() => forms.get(target))
        if (next === undefined) {
          boundId = undefined
          failure = 'the settings service refused the entry'
          publish()
          return
        }
        bound = next
        boundId = target
        off = safe(() => bound.subscribe(publish))
        // Read once on binding: a form that throws on its first read must be
        // reported here, not silently left at the pending snapshot.
        publish()
      }
      safe(() => forms.describe().subscribe(rebind))
      rebind()
      return {
        getSnapshot: () => (failure === ''
          ? snapshot
          : { ...snapshot, status: 'unavailable', writable: false, failure }),
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        set: (field, value) => (bound === undefined
          ? Promise.resolve(false)
          : safe(() => bound.set(field, value)) ?? Promise.resolve(false)),
        unset: (field) => (bound === undefined
          ? Promise.resolve(false)
          : safe(() => bound.unset(field)) ?? Promise.resolve(false)),
        mutate: (ops, expectedRevision) => (bound === undefined || typeof bound.mutate !== 'function'
          ? Promise.resolve(false)
          : safe(() => bound.mutate(ops, expectedRevision)) ?? Promise.resolve(false)),
      }
    }

    /**
     * Evaluate one step, reporting and swallowing a failure.
     * @param {() => T} body - the step.
     * @returns {T | undefined} its value, or undefined when it threw.
     * @template T
     */
    function safe(body) {
      try {
        return body()
      } catch (error) {
        console.warn('[dsh-jp-translate] step failed:', error)
        return undefined
      }
    }

    // ── controller ──────────────────────────────────────────────────────────
    /**
     * Owns the form subscription and the unsaved draft.
     *
     * The component pulls state from `getSnapshot()`/`subscribe()` itself rather
     * than through a renderer-bound hook prop, and `getSnapshot()` can never
     * throw: a slot entry that throws is retired by the renderer's error
     * boundary, which rendered this settings page as a blank pane. A failed
     * read therefore degrades into a snapshot that carries the failure text, so
     * the page shows what went wrong instead of disappearing.
     */
    class GlossaryCardController {
      constructor(form) {
        this.form = form
        this.listeners = new Set()
        this.saved = undefined
        this.draft = undefined
        this.status = { kind: 'idle', text: '' }
        this.saving = false
        /** Last failure text from a settings read, shown on the page. */
        this.failure = ''
        /** Last snapshot produced by the safe read path. */
        this.cached = undefined
        this.off = form.subscribe(() => {
          this.sync()
        })
        this.sync()
      }

      /** Adopt the committed document unless the user has unsaved edits. */
      sync() {
        try {
          const snapshot = this.form.getSnapshot()
          const saved = parse(fieldOf(snapshot))
          const pending = this.isDirty()
          this.saved = saved
          if (!pending) this.draft = cloneDoc(saved)
          this.failure = typeof snapshot.failure === 'string' ? snapshot.failure : ''
          if (this.failure !== '') this.status = { kind: 'bad', text: '设置读取异常：' + this.failure }
        } catch (error) {
          this.failure = describe(error)
          this.status = { kind: 'bad', text: '读取设置失败：' + this.failure }
        }
        this.emit()
      }

      /** Whether the draft differs from the committed document. */
      isDirty() {
        if (this.draft === undefined || this.saved === undefined) return false
        return JSON.stringify(this.draft) !== JSON.stringify(this.saved)
      }

      /** The active preset of the draft (falling back to the first one). */
      activePreset() {
        const doc = this.draft ?? defaultDoc()
        return doc.presets.find(preset => preset.id === doc.active) ?? doc.presets[0]
      }

      /** Replace one field of the active preset in the draft. */
      editPreset(patch) {
        const doc = this.draft ?? defaultDoc()
        const active = this.activePreset()
        if (active === undefined) return
        const presets = doc.presets.map(preset => (preset.id === active.id ? { ...preset, ...patch } : preset))
        this.draft = { ...doc, presets }
        this.status = { kind: 'dirty', text: '有未保存的修改' }
        this.emit()
      }

      /** Select a different preset for editing. */
      selectPreset(id) {
        const doc = this.draft ?? defaultDoc()
        this.draft = { ...doc, active: id }
        this.status = { kind: 'idle', text: '' }
        this.emit()
      }

      /** Append a new empty preset and select it. */
      addPreset() {
        const doc = this.draft ?? defaultDoc()
        const preset = { id: newId(), name: '新预设 ' + String(doc.presets.length + 1), source: '', target: '' }
        this.draft = { active: preset.id, presets: [...doc.presets, preset] }
        this.status = { kind: 'dirty', text: '已新建预设，保存后生效' }
        this.emit()
      }

      /** Duplicate the active preset. */
      duplicatePreset() {
        const doc = this.draft ?? defaultDoc()
        const active = this.activePreset()
        if (active === undefined) return
        const copy = { ...active, id: newId(), name: active.name + ' 副本' }
        this.draft = { active: copy.id, presets: [...doc.presets, copy] }
        this.status = { kind: 'dirty', text: '已复制预设，保存后生效' }
        this.emit()
      }

      /** Remove the active preset; the last remaining one cannot be removed. */
      removePreset() {
        const doc = this.draft ?? defaultDoc()
        const active = this.activePreset()
        if (active === undefined || doc.presets.length <= 1) return
        const presets = doc.presets.filter(preset => preset.id !== active.id)
        this.draft = { active: presets[0].id, presets }
        this.status = { kind: 'dirty', text: '已删除预设，保存后生效' }
        this.emit()
      }

      /**
       * Whether the settings service already holds this document.
       *
       * The write answer alone cannot be trusted: a refused mutate answers
       * `false` and then reloads the Host's view asynchronously, and a write
       * that is accepted but never stored answers `true` while the stored value
       * stays the old one. Adopting the draft as "saved" on either would clear
       * the dirty flag, let the next form publish overwrite the draft, and send
       * the selector back to 默认 with the new preset gone. So the outcome is
       * read back from the form rather than predicted.
       * @param {object} doc - the document the save intended to store.
       * @returns {boolean} whether the form reports exactly that document.
       */
      storedMatches(doc) {
        try {
          const stored = parse(fieldOf(this.form.getSnapshot()))
          return JSON.stringify({ active: stored.active, presets: stored.presets })
            === JSON.stringify({ active: doc.active, presets: doc.presets })
        } catch {
          return false
        }
      }

      /** Write the draft into the host settings document. */
      async save() {
        const doc = this.draft ?? defaultDoc()
        this.saving = true
        this.status = { kind: 'idle', text: '正在保存…' }
        this.emit()
        let failure = ''
        let accepted = false
        try {
          accepted = await this.form.set(FIELD, JSON.stringify({ version: 1, active: doc.active, presets: doc.presets }))
        } catch (error) {
          failure = describe(error)
        }
        const landed = failure === '' && accepted !== false && this.storedMatches(doc)
        this.saving = false
        if (landed) {
          this.saved = cloneDoc(doc)
          this.status = { kind: 'ok', text: '已保存；新建会话即使用新的术语表' }
        } else {
          // Keep the draft exactly as the user left it, so nothing they typed is
          // lost and the failure is visible next to a retry.
          this.status = {
            kind: 'bad',
            text: failure === ''
              ? '保存未生效：设置服务拒绝了这次写入（术语表仍然是未保存状态，可重试）'
              : '保存失败：' + failure + '（术语表仍然是未保存状态，可重试）',
          }
        }
        this.emit()
      }

      /** Discard the draft and restore the committed document. */
      discard() {
        this.draft = cloneDoc(this.saved ?? defaultDoc())
        this.status = { kind: 'idle', text: '已放弃未保存的修改' }
        this.emit()
      }

      /** Republish the snapshot to every subscriber. */
      emit() {
        this.cached = this.computeSnapshot()
        for (const listener of [...this.listeners]) listener()
      }

      /** The immutable snapshot the component reads. Never throws. */
      getSnapshot() {
        return this.cached ?? this.computeSnapshot()
      }

      /** Subscribe one renderer; returns its disposer. */
      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      }

      /** Build one snapshot, degrading any read failure into a shown status. */
      computeSnapshot() {
        const base = {
          ready: this.saved !== undefined,
          writable: true,
          dirty: false,
          saving: this.saving,
          status: this.status,
          activeId: '',
          presets: [],
          name: '',
          source: '',
          target: '',
          canRemove: false,
          preview: [],
          error: '',
        }
        try {
          const form = this.form.getSnapshot()
          const doc = this.draft ?? defaultDoc()
          const active = this.activePreset()
          return {
            ...base,
            ready: form.status === 'ready' || this.saved !== undefined,
            writable: this.failure === '' && form.writable !== false && form.status !== 'unavailable',
            dirty: this.isDirty(),
            activeId: doc.active,
            presets: doc.presets.map(preset => ({ id: preset.id, name: preset.name })),
            name: active === undefined ? '' : active.name,
            source: active === undefined ? '' : active.source,
            target: active === undefined ? '' : active.target,
            canRemove: doc.presets.length > 1,
            preview: renderGlossary(active),
            error: this.failure,
          }
        } catch (error) {
          return {
            ...base,
            error: describe(error),
            status: { kind: 'bad', text: '页面状态读取失败：' + describe(error) },
          }
        }
      }

      /** The inject face: the controller plus one plain action per verb. */
      face() {
        const controller = this
        return {
          controller,
          onSelect: (id) => {
            controller.selectPreset(id)
          },
          onName: (text) => {
            controller.editPreset({ name: text })
          },
          onSource: (text) => {
            controller.editPreset({ source: text })
          },
          onTarget: (text) => {
            controller.editPreset({ target: text })
          },
          onAdd: () => {
            controller.addPreset()
          },
          onDuplicate: () => {
            controller.duplicatePreset()
          },
          onRemove: () => {
            controller.removePreset()
          },
          onSave: () => {
            void controller.save()
          },
          onDiscard: () => {
            controller.discard()
          },
        }
      }

      dispose() {
        if (this.off !== undefined) this.off()
        this.listeners.clear()
      }
    }

    /** One-line description of a thrown value. */
    function describe(error) {
      if (error === null || error === undefined) return String(error)
      if (typeof error === 'string') return error
      return error.message === undefined ? String(error) : String(error.message)
    }

    /** Deep-enough copy of one document (presets hold only strings). */
    function cloneDoc(doc) {
      return {
        active: doc.active,
        presets: doc.presets.map(preset => ({ id: preset.id, name: preset.name, source: preset.source, target: preset.target })),
      }
    }

    // ── presentation ────────────────────────────────────────────────────────
    /**
     * Render the 日语翻译 settings page.
     *
     * The component subscribes to the controller itself (`useState` +
     * `useEffect`, the pattern the working external settings pages use) instead
     * of receiving a renderer-bound hook or prefixed action props. Every value
     * it renders is optional-by-construction: an entry that throws would be
     * retired by the renderer's error boundary into a blank pane, which is
     * exactly the failure this page must never present.
     * @param props - `controller` from the inject face plus optional chrome.
     * @returns the settings page element tree.
     */
    function GlossaryCard(props) {
      const controller = props.controller
      const read = () => {
        try {
          return controller.getSnapshot()
        } catch (error) {
          return { presetError: describe(error) }
        }
      }
      const [state, setState] = React.useState(read)
      React.useEffect(() => {
        if (controller === undefined || typeof controller.subscribe !== 'function') return undefined
        // Re-read on every publish so a save or a form refresh re-renders.
        const repaint = () => {
          setState(read())
        }
        repaint()
        return controller.subscribe(repaint)
      }, [controller])

      if (controller === undefined || typeof controller.getSnapshot !== 'function') {
        return h('div', { className: cls.section },
          h('h2', { className: cls.heading }, '日语翻译'),
          h('p', { className: cls.hint }, '设置控制器未注入：客户端插件与本页版本不匹配，请重新安装插件包。'))
      }

      const fallback = {
        ready: false,
        writable: false,
        dirty: false,
        saving: false,
        status: { kind: 'idle', text: '' },
        activeId: '',
        presets: [],
        name: '',
        source: '',
        target: '',
        canRemove: false,
        preview: [],
        error: '',
      }
      const view = { ...fallback, ...(state ?? {}) }
      const presetOptions = (view.presets ?? []).map(preset => h('option', { key: preset.id, value: preset.id }, preset.name))
      const pairCount = (view.preview ?? []).length
      return h('div', { className: cls.section },
        h('h2', { className: cls.heading }, '日语翻译'),
        h('p', { className: cls.lede },
          '预设「日语翻译」的系统提示词固定为日译中的翻译契约：每次请求只发送 system_prompt 与 user_prompt，不带任何历史消息，也不加载任何工具。下方术语表即提示词中的 [Glossaries] 部分。'),
        view.error !== '' ? h('p', { className: cls.bad }, '诊断：' + String(view.error)) : null,
        h('div', { className: cls.card },
          h('div', { className: cls.row },
            h('span', { className: cls.label }, '术语表预设'),
            h('select', {
              className: cls.select,
              value: view.activeId,
              disabled: !view.ready && (view.presets ?? []).length === 0,
              onChange: event => {
                props.onSelect(event.target.value)
              },
            }, presetOptions),
            h('button', { type: 'button', className: cls.action + ' ' + cls.ghost, onClick: props.onAdd }, '新建'),
            h('button', { type: 'button', className: cls.action + ' ' + cls.ghost, onClick: props.onDuplicate }, '复制'),
            h('button', {
              type: 'button',
              className: cls.action + ' ' + cls.danger,
              onClick: props.onRemove,
              disabled: view.canRemove !== true,
            }, '删除')),
          h('div', { className: cls.row },
            h('span', { className: cls.label }, '预设名称'),
            h('input', {
              className: cls.input,
              type: 'text',
              value: view.name,
              placeholder: '例如：默认',
              onChange: event => {
                props.onName(event.target.value)
              },
            })),
          h('p', { className: cls.hint },
            '两栏按行一一对应：第 1 行原文对应第 1 行译文，以此类推；空行会被忽略。原文有、译文空的条目仍会写进提示词，便于先列词后补译。'),
          h('div', { className: cls.grid },
            h('label', { className: cls.col },
              h('span', { className: cls.colLabel }, '原始文本'),
              h('span', { className: cls.colHint }, '每行一个原文词条（日文）'),
              h('textarea', {
                className: cls.area,
                value: view.source,
                spellCheck: false,
                placeholder: '仁王立ち\n気をつけ\nピンセット\nトーズ',
                onChange: event => {
                  props.onSource(event.target.value)
                },
              })),
            h('label', { className: cls.col },
              h('span', { className: cls.colLabel }, '翻译文本'),
              h('span', { className: cls.colHint }, '每行一个对应译文（简体中文）'),
              h('textarea', {
                className: cls.area,
                value: view.target,
                spellCheck: false,
                placeholder: '挺胸站立的姿势\n立正\n镊子\n苏格兰皮拍',
                onChange: event => {
                  props.onTarget(event.target.value)
                },
              }))),
          h('div', { className: cls.footer },
            h('span', { className: cls.grow + ' ' + cls.status + ' ' + statusClass(view.status?.kind) }, view.status?.text ?? ''),
            h('button', { type: 'button', className: cls.action + ' ' + cls.ghost, onClick: props.onDiscard, disabled: !view.dirty }, '放弃修改'),
            h('button', { type: 'button', className: cls.action + ' ' + cls.primary, onClick: props.onSave, disabled: view.writable !== true || view.saving === true }, view.saving === true ? '保存中…' : '保存'))),
        h('div', { className: cls.card },
          h('div', { className: cls.row },
            h('span', { className: cls.label }, '提示词预览'),
            h('span', { className: cls.hint }, pairCount === 0 ? '当前没有词条，[Glossaries] 将显示 (空)' : '共 ' + String(pairCount) + ' 条词条，将写入 [Glossaries]')),
          h('pre', { className: cls.preview }, pairCount === 0 ? '(空)' : (view.preview ?? []).join('\n'))))
    }

    // ── plugin ──────────────────────────────────────────────────────────────
    /**
     * The controller the page falls back to when no settings form can be bound:
     * it renders the same shell, reports why it is inert, and never throws.
     */
    class UnavailableController {
      constructor(reason) {
        this.listeners = new Set()
        this.snapshot = {
          ready: false,
          writable: false,
          dirty: false,
          saving: false,
          status: { kind: 'bad', text: '设置服务不可用：' + reason },
          activeId: '',
          presets: [{ id: 'unbound', name: '（未绑定）' }],
          name: '',
          source: '',
          target: '',
          canRemove: false,
          preview: [],
          error: reason,
        }
      }

      getSnapshot() {
        return this.snapshot
      }

      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      }

      dispose() {
        this.listeners.clear()
      }
    }

    /** Locale copy is hard-coded in the component; only services are injected. */
    const inject = ['slots', 'configForms']

    function apply(ctx) {
      let controller
      try {
        controller = new GlossaryCardController(bindForm(ctx))
      } catch (error) {
        // The page must exist even when the form transport does not: this
        // controller serves a static unavailable snapshot instead.
        console.warn('[dsh-jp-translate] settings form unavailable:', error)
        controller = new UnavailableController(describe(error))
      }
      ctx.effect(() => () => {
        controller.dispose()
      }, 'jp-translate: settings card')

      const register = () => {
        try {
          const unregister = ctx.slots.register({
            name: SECTION,
            id: PAGE_ID,
            order: 60,
            label: () => '日语翻译',
            inject: () => controller.face(),
          }, GlossaryCard)
          return () => {
            unregister()
          }
        } catch (error) {
          console.warn('[dsh-jp-translate] settings page registration refused:', error)
          return () => {}
        }
      }
      ctx.slots.inject(SECTION, register)
    }

    return { name: PLUGIN, inject, apply }
  },
})
