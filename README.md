# 日语翻译 (dsh-jp-translate)

一个比「极简模式」还简洁的 DSH agent 预设：只做日译中，**不加载任何工具**，并且
**每次请求只发送 `system_prompt` 与 `user_prompt`，不携带任何历史消息**。

## 这个模式做了什么

| 事实 | 实现 |
| --- | --- |
| 系统提示词完全可控 | 预设内插件注册一段 `complete: true` 的提示词段，因此组装后的系统提示词**就是** `[Task] / [Tone] / [Strict Rules] / [Glossaries] / [Source Text]` 这一段，不会掺入 harness 身份、部署 persona、工具指引、工作区指令或运行时上下文 |
| 不加载任何工具 | 预设只声明一个 preset-local 插件行，没有任何 shell / 文件 / 搜索 / 子代理 / skill 行，所以请求的 tool 清单为空 |
| 不带任何历史消息 | 每次请求前用一条空的 `developer/message` 做位置替换，遮蔽除系统提示词（surface node 0）以外的全部表面节点；钩子写在 `agent/request`（`step/start` 之后、派生请求之前），循环紧接着才派生请求，因此线上消息恒为 `[system] 提示词` + `[user] 本次原文`。替换是持久的，会话恢复后同样成立；事件日志仍然只增不删 |
| 术语表可编辑 | 设置页「日语翻译」：预设选择器 + 「原始文本」「翻译文本」两个文本框，按行一一对应 |
| 可保存为预设 | 新建 / 复制 / 删除 / 命名，保存后写入该插件 profile entry 的唯一 volatile 配置字段，host 随即用新术语表重新声明 agent 预设 |

## 适配 DSH 0.2.2-rc.5

升级到 0.2.2-rc.5 后本插件每一轮都失败：

```
本轮运行失败Cannot read properties of undefined (reading 'length')
UNKNOWN
```

根因是 DSH **0.2.1-rc.2** 的破坏性变更 `conditional-tools`：`system-prompt/assemble`
的 payload（`PromptPresentation`）不再携带 `tools`，工具声明只来自步骤准入的
`ResolvedToolSet` 与执行器插件的 `describe()`。插件旧代码在 assemble 监听器里读
`assembly.tools.length`，字段为 `undefined` 于是整轮报错。**这不是加 `?.` 能修的问题**：
那个 waterfall 里过滤工具已经无效。修法是删掉 assemble 监听器，用
`tools.restrict({ allow: [] })` 清空步骤准入集合，并在预设作用域选一个
`describe() => ({ schemas: [] })` 的 no-tools 执行器——这样连 PTC 的保留 `run_code`
传输也不会被声明，见下文契约 5。

同一轮升级还暴露了第二个问题：loop 改为在 `step()` 里自行投影 runtime context 并 append，
`agent/pre-step` 过滤 decision 已拦不住它；更关键的是 `suppressRuntimeContext()` 只移除
**可选** context，而当前发行版的 `working-directory:current` 是 `required: true`，还会被
自己的 assemble 监听器重新塞回去——所以请求仍会多一条
`Current working directory: …` 的 user 消息。插件现在在 `agent/request` 里把 loop 的
`project` 方法换成 no-op 并清掉 `retained`（契约 6 的端三），这条消息才真正消失。

测试环境也一起迁到了 0.2.2-rc.5：`tools/dsh-env/node_modules` 由
`tools/extract-rc5-env.mjs` 从**正在运行的** `app.asar` 解出（`.dsh-version.json` 记录
版本）。之前那份是 0.2.0-rc.2，所以 spec 全绿而上线即坏——这正是「测试环境必须等于
运行版本」的教训。DSH 再升级后请先重新解出，再跑 spec。

## 安装

```powershell
# 在 DSH GUI 里用插件管理器安装本目录（pnpm file: 依赖 + profile bundle patch）：
#   plugin_manager(install_bundle, target = "file:<本目录绝对路径>")
# 或使用 dsh CLI：
dsh plugin --profile desktop add "file:C:\path\to\dsh-jp-translate"
```

安装后 profile 的 `package.json` 会多出 `dsh.profile.bundles` 一项，`cordis.patch.yml`
里的 `jp-translate` 行由本包的 `cordis.patch.yml` 插入。新会话的预设选择器里即可看到
「日语翻译」。

## 术语表存放位置

术语表整体存放在该 profile entry 的 `glossary` 字段（一段 JSON 字符串）：

```json
{"version":1,"active":"default","presets":[{"id":"default","name":"默认","source":"仁王立ち\n気をつけ","target":"挺胸站立的姿势\n立正"}]}
```

出厂默认即本模式规格里的四条：

```
仁王立ち → 挺胸站立的姿势
気をつけ → 立正
ピンセット → 镊子
トーズ → 苏格兰皮拍
```

两个文本框按行索引对应：第 1 行原文配第 1 行译文；空行被忽略；原文有而译文空的词条会
单独列出（仍会写进 `[Glossaries]`）。译文多出的行没有对应原文，不会写入。

## 目录结构

```
package.json            dsh.bundle.patch + dsh.client 声明
cordis.patch.yml        插入 host 行 jp-translate
node_modules/           本包自己的依赖（@deepseek-ai/schemastery + 其 ESM 依赖 cosmokit）
lib/state.js            术语表模型 + 提示词模板 + 设置值编解码（host / 浏览器共用逻辑）
lib/preset.js           预设声明（id=jp-translate，name=日语翻译，唯一 plugin 行）
lib/shadow.js           无历史 / 无运行时上下文的不变式（可独立测试）
lib/index.js            host 半：Config schema、声明预设、设置写入后重声明
presets/jp-translate.mjs 预设内插件：complete 系统提示词段 + agent/request 遮蔽
client.js               浏览器半：设置页（两个文本框 + 预设管理），手写 bundle
```

### 七条必须记住的插件契约

1. **`Config` 必须是 schemastery schema，不能是普通对象字面量。**
   cordis 通过 `runtime.Config['~standard'].validate(config)` 解析插件配置；普通对象会被
   当成「默认配置值」而不是 schema，激活时报
   `Cannot read properties of undefined (reading 'validate')`。
   `tools/dsh-env/run-preset.mjs` 的 `resolveLikeLoader()` 专门复现这条规则，两个插件半的
   Config 都要经过它。

2. **预设内插件（`presets/*.mjs`）的裸 import 必须能从本包自身解析出来。**
   预设声明里只有包名，没有依赖清单，所以本包自带 `node_modules/`（`schemastery` 及其
   ESM 依赖 `cosmokit`），与安装后 profile 的 `node_modules` 解析路径一致。

3. **遮蔽事件必须带上当前打开的 turn / step，而且必须在 `step/start` 之后写。**
   `developer/message` / `system/message` 是 **Step 作用域**的表面事件，
   `@deepseek-ai/dsh-session/invariant` 会校验 `event.data.turn/step` 是否等于当前打开的
   turn/step（`requireOpenStep`）。漏掉会判整轮失败，报
   `developer/message turn must be a non-negative safe integer`——**第二轮**才触发，
   因为第一轮还没有历史可遮蔽。

   **位置同样是硬约束，而且线上写日志时没人拦你。** agent loop 的顺序是
   `agent/pre-step` → `session.append("step/start")` → `step()`，所以在 pre-step 里写这条
   记录，它会落在 `turn/start` 与 `step/start` **之间**——那个位置上没有任何打开的
   step，任何 turn/step 都对不上。写入照样成功（`session.append` 只校验表面元数据），
   于是**每一轮都正常**，直到重新打开会话时才由已发布的 format-v4 读取器
   （`dsh-session-format-v3-to-v4` 的 `Relationships.requireStep`）整份拒绝：

   ```
   SessionFormatError: developer/message does not match an open turn and step
   → stored session "session-…" is corrupt（gateway/internal）
   ```

   这就是 2026-09-30 那次事故：6 个会话、23 行遮蔽，全部再也打不开。修正后遮蔽写在
   **`agent/request`**——loop 在 `step()` 里、`step/start` 之后、派生请求之前派发它
   （`prepareRequest()`），既在打开的 step 内，又是拿到请求之前的最后一个钩子：

   ```js
   ctx.effect(() => ctx.on('agent/request', ({ agent, signal, turn, step }, next) => {
     if (typeof agent === 'object' && agent !== null) {
       const key = `${String(turn)}:${String(step)}`
       if (shadowedStep.get(agent) !== key) {       // 每个 (turn, step) 只遮蔽一次
         shadowedStep.set(agent, key)
         shadowHistory(agent, signal, randomUUID, turn, step)
       }
     }
     return next()
   }), 'jp-translate: stateless requests')
   ```

   `shadowedStep` 这张台账（`WeakMap`，按 agent 键）不是优化而是正确性：
   请求**重试**会带着本轮已经落到表面上的 user 消息再次进入 `prepareRequest`，
   再遮蔽一次会把它一起盖掉，重试请求会**一条输入都没有**。

   四条规则现在都由**真实读取器**钉住（不再是自己抄一份规则的 mirror）：

   ```
   ok   every turn of a real loop sequence sends the system prompt and the newest source text only
   ok   the shadow reaches a resumed session too: a log with history still sends one message
   ok   the pre-step placement is what corrupts the log — the shipped reader refuses it
   ok   a shadow naming a stale step is refused by the shipped reader
   ok   the shadow message is admitted by the real format-v4 codec
   ok   the retired generic "plugin" source kind is refused — the runtime defect
   ok   a shadow missing its turn/step is refused by the format-v4 codec too
   ```

   `run-spec.mjs` 的 `loopTurn()` 按 loop 的真实顺序逐行写日志（`turn/start` →
   `step/start` → 遮蔽 → `system/message` → `user/message` → `request/header` →
   `assistant/message` → `step/end` → `turn/end`），再用**随包发布的**
   `assertReleasedV4Relationships()` 判定「这份日志能不能加载」。旧版测试的 mirror 是
   对的、错的是**摆放顺序**（它把 `step/start` 放在了遮蔽之前），所以它全绿而线上坏——
   凡是能问真实实现的，就不要自己复述规则。

4. **消息 `source.kind` 必须是「生产者自有」的，`"plugin"` 是已废弃写法。**
   format-v4 编解码器（`@deepseek-ai/dsh-session-format-v3-to-v4`）在
   `assertDeveloperMessage` 里显式拒绝 `kind === "plugin"`：
   `format v4 developer message requires id, role, content, and a producer-owned source`。
   生产者要报自己的名字（`agent-instructions` 用 `{ kind: "agent-instructions" }`），
   本插件用 `SOURCE_KIND = 'jp-translate'`。

   这条也是**事故的一部分**：写进日志的每一行都要能过读取器，`agent/pre-step` 那次修复
   只顾了「写进去能跑」，没顾「读回来能过」。

5. **「不加载任何工具」现在只能靠「让步骤解析出的工具集为空」。**
   `complete: true` 只让本段成为**全部提示词**，请求体里的 `tools` 是另一路。
   DSH **0.2.1-rc.2** 起，工具声明只来自**步骤准入的注册**：
   `AgentLoop.preStep` 先 `tools.resolve({ agent, modelSelection, signal })` 得到该步骤的
   `ResolvedToolSet`，`ToolRuntime` 再用 `definitions(scope, toolSet)` 描述它，装配成
   `assembly.tools`；`system-prompt/assemble` 的 `PromptPresentation` **不再有 `tools` 字段**，
   waterfall 返回的 `tools` 也会被忽略（升级指南 `v0.2.1-rc.2/conditional-tools`）。

   所以预设内插件做两件事：

   ```js
   ctx.inject(['tools'], scoped => {
     scoped.tools.restrict({ allow: [] })                 // 步骤准入集合为空
     scoped.tools.setExecutor(NO_TOOLS_EXECUTOR)          // 声明方为空（连 PTC 的 run_code 也不声明）
   })
   ```

   第一行让链上每个 agent 的 `resolve()` 看到空视图。第二行是 0.2.1-rc.2 之后的
   **声明方**：从前 `ToolRuntime` 自己描述工具，现在由「执行器插件」的 `describe()`
   决定；部署若选了 PTC，它的 `describe()` **无论有没有工具都会声明保留的 `run_code`
   传输**，而 `tools.restrict()` 明确禁止点名 `run_code`。本预设在自己的作用域里选一个
   `describe: () => ({ schemas: [] })` 的只读执行器，于是无论部署根作用域选了什么执行器，
   本预设声明出的 `tools` 都是空；请求体整个省略 `tools`，模型硬编出的工具名也解析不到
   （`UNKNOWN_TOOL`）。执行器位于预设作用域，别的 agent 照旧用部署的执行器。

   **0.2.2-rc.5 的报错正是漏改了这一条**：旧代码在 `system-prompt/assemble` 里读
   `assembly.tools.length`，而该字段已不存在：

   ```
   Cannot read properties of undefined (reading 'length')
   UNKNOWN
   ```

   这不是「加个 `?.`」就能修好的问题——**在那个 waterfall 里过滤工具已经无效**，
   删除监听器、把抑制收到 `tools.restrict()` + 作用域执行器才是迁移方向。`run-preset.mjs`
   因此会直接读源码断言那里不再有 assemble 监听；`run-notools.mjs` 用真实
   `SystemPrompt + ToolRuntime + native executor + scope 链 + tools.resolve()` 钉住
   「准入集合为空 → `assembly.tools` 为空」以及对照组、兄弟 agent，并额外用一个
   PTC 风格的根执行器证明「连 `run_code` 也不会声明」。

   `tools` 仍然只能可选注入（`ctx.inject(['tools'], …)`）：没编入工具行的部署本来就没
   工具可抑制，硬注入会让这一行永远 pending。

   一个已知边角：**在本改动之前就已存在的旧会话**，第一次在新代码下发请求时，
   `dsh-agent-loop.buildRequest` 会发现自己记录的 header 里有工具、现在没有了，于是补一条
   `source.kind = 'tool-registry'` 的 tool-removal `developer/message`（并进入本轮请求）。
   这是 harness 自己写的事实变更记录，我们的遮蔽在它之前执行、够不到它；下一轮起它就被
   遮蔽了。**新建会话永远是干净的 `[system][user]`**。

6. **「不发运行时上下文」的最终保证在 loop 的 projection 上：`suppressRuntimeContext()` 压不掉 `required` context。**
   请求里多出来的那条 user 消息（`<system-reminder>…Current working directory…`）不是提示词段，
   也不是 surface 上的历史：`dsh-agent-loop` 自己渲染
   `joinContextSections(renderContextSections(assembly))`，由 `RuntimeContextProjection`
   作为**一条额外的 user 消息**跟着 claimed 消息一起提交。

   **0.2.2-rc.5 的行为变了**：loop 不再把这条消息放进 `agent/pre-step` 的 decision，而是
   在 `step()` 里自己 `refreshContext(assembly)` → `runtimeContext.project(sections)`，
   再在 claimed 消息之后 append。因此只过滤 decision 已经拦不住它。三层一起做：

   ```js
   // 端一：本作用域不渲染 OPTIONAL 动态 context
   ctx.effect(() => ctx.systemPrompt.suppressRuntimeContext(), 'jp-translate: no runtime context')

   // 端二：decision 里若仍有 runtime-context 消息，摘掉（claimed 原文放行）
   const decision = await next()
   return stripRuntimeContext(decision)

   // 端三：在 step() 投影之前，把 loop 的 project 换成 no-op（并清掉 retained）
   silenceRuntimeContext(agent)
   ```

   **为什么端一不够。** `suppressRuntimeContext()` 的文档与实现都只移除**可选** context：
   `required: true` 的贡献会被保留。当前发行版的 `dsh-working-directory` 正是
   `required: true`，而且它的 `system-prompt/assemble` 监听器会在 waterfall 返回前**再把
   `working-directory:current` 塞回 `assembly.contexts`**。于是即使抑制生效，请求仍会多一条
   `Current working directory: "…"`，模型看到 `[system][user][user]` 后去回答那条提醒，
   翻译失败。`dsh-tool-subagent*` 的 context 也是 required。

   **端三为什么是投影而不是 assembly。** 既然 required context 会穿过 assembly，唯一还
   能保证「不产生消息」的位置就是 loop 实例上的 `RuntimeContextProjection.project`：
   `step()` 里 `const context = this.runtimeContext.project(sections)`，返回
   `undefined` 就不会 append。`silenceRuntimeContext()` 把 `agent.runtimeContext.retained`
   清空，并把 `project` 换成 `() => undefined`；它只在 `agent/request` 里、历史遮蔽之后
   执行，作用于单个 agent，别的 agent 的运行时上下文照常。

   `retained` 的清理仍然保留：历史遮蔽每轮覆盖快照节点，projection 会把「replacement 的
   `sourceEventSeqs` 命中 retained」解释成「上下文已失效」，在方法补丁不可用时每轮重发
   `Current runtime context: none`。补丁与清空一起做，新建会话与恢复会话都只剩
   `[system][user]`。

   `runtimeContext` 不是公开服务，而是 loop 实例上的字段（`agentEvents` 会把 `agent`
   融合进每个 agent 事件 payload，`agent/request` 拿得到它）。因此 `run-spec.mjs` 会
   **重新读 `dsh-agent-loop` 源码**，断言 `this.runtimeContext = new RuntimeContextProjection(…)`、
   `retained` 字段、`project(sections)` 方法以及那行 append 都还在；改名字就红。
   `run-preset.mjs` 则用一个带 `runtimeContext`（含 `project`）的假 agent 走真实
   `agent/request` waterfall，断言 hook 返回前 `retained` 已清空、`project([])` 返回
   `undefined`。`run-notools.mjs` 用一个 required context 证明「assembly 会留下它」，
   从而说明端三不可省。

   两个细节：

   - `suppressRuntimeContext()` 的判定是**整条 scope 链上有一个抑制者就全抑制**
     （`scopeLayers.some(...)`），所以它也能压掉 `dsh-sandbox-policy`、`dsh-user-approval`
     注册在 agent scope 上的可选 context；同时它是 scope 级的，别的 agent 不受影响。
   - `stripRuntimeContext()` **只删那一个生产者**的消息，claimed 的用户原文（包括被别的插件
     改写过的版本）一律放行——越权过滤会丢用户正文。

   `RUNTIME_CONTEXT_SOURCE = 'runtime-context'` 是从 `dsh-agent-loop` 私有常量镜像来的，
   `run-spec.mjs` 会**重新读该模块源码**断言镜像仍然一致（改名字就红），而不是相信注释。

7. **已经被写坏的日志要用工具修，而且「修」= 删掉自己写的那几行 + 重新编号。**
   `tools/dsh-env/repair-session-logs.mjs` 是这次事故的收尾工具，默认只扫描：

   ```powershell
   <node> tools/dsh-env/repair-session-logs.mjs                # 只扫描，不动文件
   <node> tools/dsh-env/repair-session-logs.mjs --out <目录>    # 把修好的副本写到别处
   <node> tools/dsh-env/repair-session-logs.mjs --apply        # 原地修复（先备份）
   ```

   它只删「本插件自有、内容为空、且位置非法」的 `developer/message`；任何**别人的**位置
   非法行都会让它拒绝整份文件（`unrelated positional defect`）。删行之后必须重排
   `seq`（读取器要求 `event.seq === index` 连续），并把幸存行携带的**所有**序列引用一起
   重映射：`sourceEventSeqs`、`surfaceOp.startSeq/endSeq`、`headerSeq`、`sourceEventSeq`、
   `messageSeqs`、`shadowedSeqs`/`shadowedRange`、`image/offload` 的 `targets[].seq`、
   `throughSeq`。**任何指向被删行的引用都会让重写中止**——靠「忘掉这个引用」修好的日志
   只是坏成了另一种样子。

   写出前后各用一次**随包发布的** `assertReleasedV4Relationships()`：原件必须被判坏
   （并且是那句 `developer/message does not match an open turn and step`）、修好的必须能过，
   每一行还要单独过 `assertV4RowAdmission()`；写完再读回来验证一次，解出来的字节必须
   还是同一份。`--apply` 会在同目录留一份 `<原名>.jp-translate-corrupt.bak`（读取器按文件名
   识别世代，多出来的 `.bak` 会被忽略，确认无误后可自行删除）。

   ```powershell
   <node> tools/dsh-env/run-repair.mjs   # 造一份坏日志 → 检测 → 修 → 读取器放行 → 幂等
   ```

### 设置页（浏览器半）的写法约束

设置页注册进 `settings.section`（root scope list），把控制器交给组件：

```js
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section', id: 'jp-translate', order: 60,
  label: () => '日语翻译',
  inject: () => controller.face(),   // { controller, onSave, … }
}, GlossaryCard))
```

两条硬性经验，都是实际踩过的：

1. **组件自己订阅控制器，不要依赖渲染器绑定的 hook prop。**
   组件从 `props.controller` 拿 `getSnapshot()`/`subscribe()`，用
   `React.useState(read)` + `React.useEffect(...)` 订阅——这是同仓可用的
   `@linxin666/dsh-session-archive` 设置页的写法。用 `inject` 的 `hooks` 面再指望它变成
   `props.useXxx` 时，组件会在 render 阶段抛错，渲染器的 `SlotErrorBoundary` 会把这个
   entry **永久退役**：`Slot.inspect` 里显示 `active: false`，设置面板只剩空白。
2. **任何一步都不许抛。**
   `bindForm()` 里每个可能失败的动作都走 `safe()` 并以 pending 快照兜底；`getSnapshot()`
   永不抛，读失败就降级成带 `error` 字段的快照，页面把它显示出来。原因很直接：
   `bindForm()` 在 `apply()` 里抛错会让**整个设置页不被注册**（不是空白，是根本没有）；
   而组件抛错会让 entry 被退役（有导航项，点开空白）。
   `run-client.mjs` 用「永远抛错的表单」和「没有 controller」两种输入来钉住这两条。
3. **保存必须回读校验，不能凭 `set()` 的返回值宣布成功。**
   写入结果有两种“假成功”：
   - 被拒绝：`mutate` 返回 `false`，随后**异步**用 Host 的旧值恢复（`recover()` →
     `mirror.load()`）；
   - 被接受但没落库：返回 `true`，而 Host 里仍是旧值。

   两者只要被当成成功，卡片就会把草稿当成已保存、清掉 dirty 标记，紧接着表单推送旧值
   → `sync()` 覆盖草稿 → 下拉框弹回「默认」、新建的预设消失（这就是本页报过的现象）。
   所以 `save()` 在写入后用 `storedMatches(doc)` 把 **Host 实际持有的文档**读回来比对：
   只有内容一致才算保存成功；否则保留草稿（用户输入不丢）并显示「保存未生效…可重试」。
   `run-client.mjs` 用两个 double 分别钉住这两条：`refuseWrites()`（拒绝 + 异步恢复旧值）
   与 `dropWrites()`（接受但不落库）。
4. **共享表单快照的 `value` 是「整个 namespace section」，不是本插件的那个字段。**
   `configForms.get(entryId)` 构造的控制器只带 `{ namespace: entryId }`、没有 `decode`，
   于是 `ConfigFormController.decode()` 原样返回 `view.value`；而 Host 那边是
   `projectForm(form, plainConfig(entry.fiber.config))`——**该 entry 所有 volatile 字段**。
   所以术语表读到的形状是 `{ glossary: '<json string>' }`，必须取 `value.glossary`
   （`client.js` 的 `fieldOf()`）再解析。

   把整个 section 当文档解析的后果，正是本页报过的另一个现象：找不到 `presets`
   → 一律降级成默认文档 → 页面永远显示「默认」，且**任何**一次写入的回读都对不上，
   于是明明写进 profile patch 了，页面还是报「保存未生效」。
   `run-client.mjs` 的 `fakeForm()` 按真实传输形状包一层 section 来钉住它
   （「the section object is decoded」用例：section 里放一个默认文档没有的 `Pixiv`
   预设，字段/section 搞混就必然失败）。

## 改完源码后必须同步到已安装副本

`plugin_manager(install_bundle, "file:<本目录>")` 是**拷贝安装**（pnpm），profile 里那份
不是软链——改完源码后要执行：

```powershell
pwsh -File .\dsh-jp-translate\sync-installed.ps1
# 可选：-ProfileRoot <其他 profile 目录>
```

脚本先比对哈希（内容相同就跳过，因为运行中的 host 会长时间占用 `package.json`），再用
.NET `File.Copy` + 重试写入，最后按哈希复核。不要用 `Copy-Item -Force`：宿主占用或重载时
它会报「cannot overwrite … with itself」或静默跳过，看起来像成功。

## 验证

`tools/dsh-env/` 里放了一份可解析 `@deepseek-ai/*` 的 `node_modules`，由
`tools/extract-rc5-env.mjs` 从**正在运行的** Desktop `app.asar` 解出，用于在本机跑真实
`Session` / 真实服务的行为验证。`.dsh-version.json` 记录解出时的 DSH 版本，
`run-host.mjs` 会把它与当前 `app.asar` 里的 `@deepseek-ai/dsh` 版本**逐字对比**：
不一致就直接红并提示重跑解出脚本。DSH 升级后先重新解出，否则 spec 测的是旧版本：

```powershell
<node> tools/extract-rc5-env.mjs       # 从 app.asar 重新解出当前运行的 DSH 包
<node> tools/dsh-env/run-spec.mjs     # 提示词 + 无历史不变式 + 「这份日志能加载吗」（真实 Session + 真实读取器）
<node> tools/dsh-env/run-host.mjs     # host 半加载、预设声明、设置写入后重声明
<node> tools/dsh-env/run-preset.mjs   # 预设内模块：真实 SystemPrompt 装配、complete 段、pre-step 不写盘、request 遮蔽 + projection 静音
<node> tools/dsh-env/run-client.mjs   # 浏览器 bundle：设置页注册、两个文本框、预设增删改
<node> tools/dsh-env/run-notools.mjs  # 真实汇总：步骤准入集合与装配出的 tools 必为空，required context 仍会留存（故需端三）
<node> tools/dsh-env/run-repair.mjs   # 已损坏日志的修复工具：检测、重写、读取器复核、拒绝越权修改
<node> tools/dsh-env/verify-installed.mjs  # 已安装副本 9 个文件逐字节哈希一致 + 修复标记在位
```

所有 spec 都用**直接路径**导入本包（`../../dsh-jp-translate/…`），`run-host.mjs` 还断言
`tools/dsh-env/node_modules/@workspace/dsh-jp-translate` **不存在**：那里曾经放过一份拷贝
用来让裸包名解析，它悄悄变旧、spec 于是测的是旧版本——和手写替身同一类谎言。

`run-spec.mjs` 的关键断言：三轮对话后 `session.deriveMessages()` 恒为
`[system, user]`，且 user 就是最新一期的原文；三轮写完的日志仍能被
`assertReleasedV4Relationships()` 加载，而把遮蔽放回 `agent/pre-step` 的位置就会被它
以线上那句原文拒绝。它还重新读 `dsh-agent-loop` 源码，钉住
`this.runtimeContext = new RuntimeContextProjection(…)`、`retained` 字段、
`project(sections)` 方法以及`const context = this.runtimeContext.project(sections)` 那行
— 契约 6 的静音动作依赖这些，改名必须让 spec 变红。

`run-preset.mjs` 另外读源码断言预设**不再**监听 `system-prompt/assemble`（0.2.2-rc.5
报错的那条路径），并用带 `runtimeContext`（含 `project`）的 agent 走真实
`agent/request` waterfall，断言遮蔽之后 `retained` 已清空、`project([])` 返回
`undefined`。`run-notools.mjs` 再用一个 `required: true` context 证明 assembly 会把它
留下，从而说明「只靠 suppressRuntimeContext 不够」。

`run-preset.mjs` / `run-notools.mjs` 用的是**真实服务**（`SystemPrompt`、`ToolRuntime`、
native tool executor、`tools.resolve()`、dsh-scope 作用域链），不是手写替身。教训写在
这里：本包先后有三次「测试全绿但线上仍坏」，根因都是替身（或复刻的规则）比真实实现简单
一级——设置页替身把 `value` 当成字段而不是整个 section，装配替身把作用域**上下文**当成
作用域**键**，无历史替身把 `step/start` 摆在了遮蔽之前；第四次是测试环境停在
0.2.0-rc.2 而线上已是 0.2.2-rc.5。凡是能用真实实现的，就不要写替身；凡是能对齐运行
版本的，就不要留着旧副本。
