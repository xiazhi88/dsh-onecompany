# dsh-onecompany · 一人公司

给 DeepSeek Harness（dsh）加一层「公司」：**你当董事会，agent 当员工**。
每个员工是一等的 dsh 会话 agent，有岗位说明书、模型路由、工位目录和一套公司协作工具；
公司服务（`ctx.company`）负责名册、任务、信箱、审批、定时排程、资料库权限与工作日志。

完全自包含：只依赖 dsh 官方核心服务（`agents`/`tools`/`commands`/`systemPrompt`/`storageDomain`/`sessionPersistence`/`timer`），**不依赖任何第三方插件**。

## 安装

```sh
# 从 GitHub 安装（仓库自带 lib/ 构建产物，无需允许构建脚本）
dsh plugin --profile web add "github:xiazhi88/dsh-onecompany"

# 或本地开发用 link 安装
dsh plugin --profile web add /path/to/dsh-onecompany

dsh --profile web     # 重启后生效
```

重启后：

- 侧边栏底部出现「**一人公司**」入口（有未读审批时带角标）；
- 点开是**独立整页**：总览 / 组织 / 任务 / 审批 / 资料库 / 动态；
- 会话里可用 `/company` 命令：`status`、`org`、`tasks`、`assign <员工> <任务>`、`inbox`、`approve|reject <id>`、`on|off`。

## 总开关

页面右上「停用 / 启用」（等价于 `/company off|on`）：

- **停用**：调度与信箱投递立即停止，常驻员工全部卸载，公司工具对模型返回 `company_disabled`；
- **数据、会话、资料库原样保留**，重新启用即恢复；开关状态持久在领域全局槽位，重启后仍生效。

也就是说：不想用公司模式时，dsh 与你平时完全一样。

## 员工（agent）

在「组织」页招聘：姓名、职位、汇报对象、岗位说明书（persona → 同时落 `<工位>/AGENTS.md`）、模型、每日 token 预算。

- 招聘后**首次收到消息**才真正创建会话 agent（懒启动），之后按需 `resume`；
- 常驻句柄按 `maxResidentAgents` LRU 回收，会话日志始终保留，可随时冷恢复；
- 模型路由留空 = 继承部署默认（`agent-default-model`）；**不要留空到没有任何模型**，否则提示词里的 `{{model}}` 无法求值、请求会失败（插件已在创建时自动继承默认路由）；
- 汇报线是逻辑模型（存领域表 + 注入提示词 + 由信箱/审批强制执行），员工会话同时是一等会话，你可以直接打开它的会话插话。

## 员工拿到的公司工具（按员工 scoped 注册）

| 工具 | 用途 |
|---|---|
| `company_org` | 组织架构与通讯录 |
| `company_mail_send` / `company_mail_list` | 公司信箱收发（info / question / request / report） |
| `company_task_create` / `_list` / `_update` / `_comment` | 任务：建、查、认领与推进、评论区讨论 |
| `company_report` | 向上级（无上级则达董事会）汇报 |
| `company_approval_request` | 越权动作（花钱 / 上线 / 高危 / 招聘）申请审批 |
| `company_doc_list` / `_read` / `_write` | 资料库读写（按项目 ACL 判定） |
| `company_schedule_create` / `_list` / `_delete` | 自己的定时任务（cron / every / at） |
| `company_help` | 协作协议速查 |

工具描述里写明了「什么时候用哪个」，配合岗位提示词里的协议段，员工会自己走完
**收信 → 认领 → 执行 → 评论 → 提交验收 → 汇报** 的闭环。

## 闭环能力

1. **派工闭环**：董事会新建任务 → 信箱投递 → 员工认领执行 → 置 review → 汇报 → 验收。
2. **协作闭环**：员工之间用信箱互问、在任务评论里沉淀讨论；子任务全完成自动关闭父任务。
3. **审批闭环**：员工提交审批 → 面板批准/驳回 → 结果以信箱消息回传发起人。
4. **定时闭环**：排程到点 → 系统消息投递 → 员工按 prompt 执行 → 汇报（cron 用 cron-parser，逾期只补最近一次）。
5. **工作日志**：`session/event` 折叠轮次与工时，`llm/stream` 旁路捕获 token 四桶（输入/输出/缓存读/缓存写 + 推理），按员工与日期聚合；面板「组织 → 工作日志」可看明细。

## 定时任务（面板「排程」页）

在面板里新建一条排程，到点 host 会把 prompt **作为一条消息投给指定员工**（等于替董事会说那句话）：

| 形态 | 填法 | wire |
|---|---|---|
| N 小时后做一次 | 小时数（可小数，0.5 = 30 分钟） | `kind: 'at'` + ISO 时间戳 |
| 每 N 小时做 | 小时数 | `kind: 'every'` + 秒数（≥ 60） |
| cron 表达式 | 五段 cron，按公司时区解释 | `kind: 'cron'` |

- 每行可**暂停 / 启用 / 删除**（删除有二次确认）；暂停中的排程显示「已暂停」，启用时按当前时间重算下次触发，不会补跑历史时间点；
- 一次性排程触发后自动停用（不重复打扰）；
- 逾期只补最近一次（错过的中间次数不刷屏）；
- 员工也能给自己配：`company_schedule_create / list / delete`（例如「每 6 小时自检一次」）。

## 配置（`cordis.patch.yml`）

```yaml
- insert:
    - id: onecompany
      name: dsh-onecompany
      config:
        companyRoot: ''            # 公司根目录；空 = $DSH_HOME/onecompany
        companyName: 一人公司
        tickMs: 30000              # 调度/投递周期
        maxResidentAgents: 8       # 常驻员工上限
        defaultDailyTokenCap: 5000000
        approvalsRequired: [hire, spend, strategy, danger]
        timeZone: Asia/Shanghai
```

目录布局：`<root>/employees/<员工id>/`（工位，含 AGENTS.md）、`<root>/library/`（公司资料库）、`<root>/projects/<项目id>/`（项目文件）。

## 领域数据

storage domain `onecompany` v1（json 后端）：`agents` / `projects` / `docs` / `tasks` / `comments` / `messages` / `approvals` / `schedules` / `worklogs` / `activity` + 全局槽位（开关与公司名）。业务数据不写进会话事件 schema，避免污染会话日志。

## Model Experience

- **工具 schema**：每个员工作用域内可见上表工具，进入每次请求的工具目录；停用时工具仍可见但执行返回 `company_disabled` 的教学文本。
- **提示词**：`onecompany-role` 段（order 60）注入岗位、通讯录、当前任务与工作纪律；岗位说明书另落 `AGENTS.md`。
- **投递帧**：信箱/任务/排程/审批都使用稳定帧格式（`【公司信箱】` / `【新任务】` / `【定时任务】` / `【审批请求】` / `【审批结果】`），动态值 JSON 转义。
- **KV cache**：帧追加在历史尾部，不重写既有前缀；工具 schema 在员工激活期间保持前缀稳定。

## 设计约定（踩过的坑）

- **强调色不借主题 brand**：`--dsw-alias-brand-primary` 在深色主题下是「近白色」，拿它做按钮底色再配白字就是白底白字。面板自带 `--oc-accent` 蓝色系，前景/背景成对定义。
- **状态色随主题自适应**：pill / 角标的前景用 `color-mix(状态色, --oc-fg)`，深色偏亮、浅色偏深，两套主题都可读。
- **弹层与抽屉挂在整页层级**：`.oc-shell` 为定位父级，`.oc-modal__body` 滚动、footer 常驻，长表单不会把按钮滚出视野。
- **看板用 grid 自适应五列**（`minmax(0,1fr)`），窗口窄时才横向滚动；卡片信息分「标题 + 优先级角标」「负责人 + 紧凑时间（12m/3h/09-18）」两行。

## v2：原生 dsh 做主交互面（面板退为配置台）

**新的会话地图**

| 会话 | 谁在驱动 | 作用 |
|---|---|---|
| 「一人公司 · 大厅」 | CEO 司南 | 董事会指令入口 + 全公司简报/周报 |
| 「项目名 · 项目群」 | CEO 的项目实例 | 该项目一切汇报与派活（**汇报默认落这里**） |
| 「员工名 · 工位」 | 员工本人 | 任务帧落点 + 执行现场（偏审计） |

- **汇报路由**：`company_report` 按任务的项目归属归口。**投递模式由 `reportDelivery` 决定**：
  - `digest`（默认）：投到项目群/大厅，由 CEO 转成给董事会的易读简报（一轮模型调用）；
  - `record`：**不叫醒任何 agent**——原文追加进项目档案的《汇报流水》，同时进面板未读信箱（零 token、零回声）。
  审批/阻塞类仍会正常送达需要裁决的人。
- **派活三条路**：① 任意会话里 `@员工名`（`@` 是共享多分组触发器，与原生文件引用、子会话并列，`name: onecompany` 唯一）→ 模型调 `company_call`；② `/call <员工> <任务>`（命令直达，不经模型）；③ `/company assign`。
- **面板跳转**：组织页「打开工位」、资料库项目页「打开项目群」→ 直接切到原生会话（目标工作区未加载时会先连接再打开）。
- **固定会话标题**：工位/项目群/大厅创建即改名（`ctx.sessionTitle.rename`）。
- **工作区归入**：公司会话自动挂到 cwd 对应工作区（否则侧栏不可见、无法跳转）；公司自建的空工作区会自动命名（只改「仅含我们这一个会话」的工作区，绝不动用户已有工作区）。
- **开场消息**：新建会话后发一条「就绪/到岗确认」，让它跑出首个轮次——**没有轮次的会话是 blank，会被客户端从侧栏隐藏**（`SessionSummary.blank`）。可用 `kickoffOnCreate: false` 关闭。
- **B 路线**：员工提示词要求「重活开子会话」，worklog 按 `parentSession` 血缘把子会话 token/工时归集到员工。
- **员工 preset**：组合时挂载部署默认 preset（缺省 `standard`），员工因此有 bash/fs/子 agent/压缩（v1 漏挂导致「员工无 shell」的教训）。

新增配置项：

```yaml
        autoProvision: true      # 启动时自动补建 CEO 与项目群会话
        kickoffOnCreate: true    # 新建会话后发开场消息（让会话出现在侧栏）
        reportDelivery: record   # digest = CEO 转简报；record = 只归档 + 面板未读（不叫醒 agent）
```

## 搭建你自己的公司

公司名册、项目与岗位说明书都是**你的数据**，不属于插件本体。两种起步方式：

**A. 面板搭建（推荐）**：重启后打开「公司面板 → 组织 → 招聘」，填姓名/职位/负责项目/岗位说明书/模型，员工首次收到消息时自动创建会话。

**B. 脚本初始化（一次成型）**：复制 `scripts/seed-example.mjs`，把顶部的仓库路径换成你自己的，然后

```sh
node scripts/seed-example.mjs --dry-run   # 先看计划
node scripts/seed-example.mjs             # 写入
# 重启 dsh web：公司服务会补齐 CEO、大厅与项目群会话，并投递接手任务
```

岗位说明书写法参考 `examples/agents/example-role-brief.md`（含「负责/不负责、运行与验证、纪律、协作协议」四段）。

## 目录结构

```
src/host/      host 半：domain 模型、CompanyService、员工/频道驱动、公司工具、命令、根会话注入、Typert Remote
src/client/    浏览器半：公司整页（组织/任务/审批/资料库/动态）、入口按钮与红点、@ 员工提及源、Remote 适配
src/shared/    两侧共用的 zod 线路类型（domain 表、Remote codec、UI 快照）
agents/        包内岗位说明书（`agt_ceo.md` 是 CEO 默认说明书，启动时用于补建 CEO）
scripts/       初始化示例与运维脚本
lib/           构建产物（随仓库提供，从 GitHub 安装即可用，无需构建授权）
```

## 执行会话形态（`taskSession`）

默认 **`per-task`：每个任务一个一次性执行会话**，跑完即停（会话保留、可随时重开）。

```
员工 = 身份（名册：姓名/职位/模型/预算/权限）
 ├─ 执行：任务会话  task.sessionId   cwd=项目仓库  标题 `tsk_xxx · 任务简述`
 │        以 origin:'subagent' 挂在**派发它的会话**下 → 不进侧栏，
 │        只显示在父会话标题栏的「N 个子代理」里（面板任务详情可一键打开）
 ├─ 对话：工位会话  agent.sessionId  仅用于董事会直接找他说话（懒创建）
 └─ 记忆：项目档案 + 交接清单 + 任务评论（真源，不进上下文）
```

**父会话是谁**：你用 `@员工` 或在某个会话里派活 → 父会话就是**你正在看的那个会话**；
司南在项目群里派 → 父会话是该**项目群**；从面板派 → 父会话是**公司大厅**。
历史任务（早于该字段）在启动时按规则补归属：**带项目 → 该项目群；无项目 → 大厅**。

**派发人**：任务记录 `dispatcherName`（董事会 / 司南 / 某员工）+ `parentSessionId`（哪个会话）。
任务详情显示派发人与「打开派发会话」；任务会话的提示词里也写明「由谁派发、汇报会回到那里」。

**汇报回投**：`company_report` 除了归档（《汇报流水》）和进董事会信箱，还会把原文
**以通知行形式回投到派发它的那个会话**（项目群 / 大厅 / 你自己的会话）——派活的人在那里就能看到结果。

**在会话顶部的归纳**：任务会话在侧栏是隐藏的，但**派发它的那个会话标题栏**会出现
「N 个任务 ▾」（本插件自带的入口，紧挨「司 公司」），展开即列出本会话派出的任务
（状态图标 + 任务 id / 负责人 / 中文状态），点一下直接打开它的执行会话。
状态图标带动效：进行中转圈、阻塞与待验收呼吸、完成打勾、待办空心、取消灰线。

**在任务会话里能回去**：任务会话的标题栏会有「← 返回主会话」（父会话是大厅/项目群时
显示具体名字，否则显示「主会话」），点一下回到派发它的那个会话。

> 为什么不用平台原生的「N 个子代理」下拉：那个列表要求子会话由**子代理运行时**创建
> （带 subagent 生命周期投影），而我们的员工需要自己的工具面与岗位提示词，只能由插件
> 组合创建；标上 `origin: 'subagent'` 后它会一直卡在「正在加载子代理…」。所以改成
> 「保留血统 + 不标 subagent + 自己做归纳入口」。

- 派活时若任务还没有执行会话，就建一个；标题一眼看出这个会话在干什么；
- 任务进入 `review` / `done` / `cancelled` → **登记待停**，由 tick 在 agent **空闲后**停止会话
  （常驻位释放，会话可重开）。⚠️ 不能当场停：`handle.dispose()` 会等当前轮次结束，
  而从这轮自己的工具调用里 await 它必然死锁（工具等轮次、轮次等工具）；
- 超时兜底：`taskSessionTimeoutHours`（默认 12）内没收尾 → 停止会话 + 在任务里留一条说明（僵尸会话不占位）；
- **记忆靠档案**：任务会话的提示词带「本项目档案索引 + 最近讨论」，要求开工前 `company_doc_read` 按需读全文，
  交活必须写档案（`company_doc_write`）——这样下一个任务的会话不需要旧会话的历史；
- 面板任务详情有「打开执行会话」；组织页的「打开工位」是对话面（未唤醒过的员工会提示）。

改成 `resident` 即回到常驻工位模式（有连续性，但上下文随会话年龄增长、且会互相污染）。

## 面板要点

- **红点**＝待裁决审批数 + 董事会信箱未读数（侧栏图标与会话头「公司」按钮都统计），
  点悬浮看明细；新审批/新来信各自弹一次提醒。
- **任务看板**默认按「最近更新」倒序（每列内），可切换「按创建时间 / 按优先级」。
- **董事会信箱**（动态页）每封可「标记已读」，右上「全部已读」一键清空红点。
- 任务详情有「打开执行会话」（per-task 模式）或「打开工位」（常驻模式/旧任务）。

## Token 成本与优化

公司模式比单人会话贵得多，原因是**每一步都要把固定前缀重发一遍**。本机实测（2026-09-20）：

| 项 | 数值 |
|---|---|
| 公司当天输入 | 166M tokens（步骤级累计；其中 86% 命中前缀缓存） |
| 其中司南（大厅 + 2 个项目群三个实例） | 84.6M（约一半） |
| 单次请求工具 schema | 优化前 66k 字符（76 个工具）→ 优化后 32k（54 个） |

**已实施的优化**

- **工具面收窄**（`leanTools`）：把「会话迁移 / 编排 / 可视化」等与公司工作无关的宿主级工具
  从模型视野移除（`ctx.tools.restrict`），工具 schema −47%，每步固定开销减半。
- **提示词缓存友好**（`compactPrompt`）：动态清单（当前任务、未完成任务、档案列表）
  不再内联进系统提示词——它们每轮都在变，会让**整段对话历史的缓存失效**、按全价重算；
  改为用时 `company_task_list` / `company_doc_list` 查。
- **每日 token 预算**：`defaultDailyTokenCap`（员工默认 2M）与 `ceoDailyTokenCap`（默认 8M），
  超限即暂停该 agent 的信箱投递到次日，并在面板/大厅提示。
  ⚠️ 兜底只补「从没设过」的 agent：董事会在面板里设过（**包括显式设成「不限」**）就记
  `budgetPinned`，重启不会再被打回默认值。
- **少叫醒**：`reportDelivery: record`（汇报不叫醒）、`employeeKickoff: false`（入职不发开场）。

**还可以再省的（按收益排序）**

1. **降低轮次**：把高频排程（如 30 分钟一次的看门狗）改成 1-2 小时；每次唤醒都是一整套前缀。
2. **模型分级**：员工挂便宜档（面板「组织 → 编辑 → 模型」），CEO 保留强档；
   每 agent 还有 `effort` 字段可降推理强度（思考 token 也计费）。
3. **长活开子会话**：子会话上下文从零起，主会话只留结论（提示词里已要求）。
4. **CEO 三实例**：大厅 + 每个项目群各一个常驻实例，各有独立上下文；项目少开一个就能省一份。

## 架构要点：公司工具与提示词的注册点

**唯一注册点**是 `agent/created` 上的 `installCompanyAgentInjector`（src/host/injector.ts）：
它按 `service.companyRoleOf(sessionId)` 判断这个 agent 是公司角色（大厅 / 项目群 / 员工工位 /
任务会话）后，注册对应的公司工具与岗位提示词。

为什么必须放这里（而不是驱动器的 `setup`）：

- `setup` 只有**插件自己**创建/恢复会话时才会被调用；
- 平台自己的恢复路径（你在一个已停止的任务会话里继续发消息、冷读后接着聊）不走 `setup`
  ——那样那个会话会被组合成**普通 agent**，`company_*` 全部 `unknown tool`（这个坑踩过两次）；
- 平台保证 `agent/created` 在**首次提示词装配之前**发生，因此在这里注册是安全且完整的。

推论：驱动器的 `composeWith` 只负责「挂哪个 preset + 收窄工具面」，**不允许**再注册工具与
提示词（重复注册会抛 duplicate）。

## 踩过的坑（务必别重犯）

- **绝不能用「裸 preset」重新组合公司会话**：`deliverToSession` 之类为了往任意会话投递而
  resume 一个会话时，如果目标是公司会话（大厅/项目群/工位/任务会话），必须走各自的组合
  通道（`ensure` / `ensureChannel` / `ensureTask`）。否则那个会话会被重新组合成一个只有
  平台工具的普通 agent —— 表现是**所有 company_* 工具报 `unknown tool`**。现在服务按
  归属选通道，driver 里还有 `isCompanySession` 兜底直接拒绝。
- **绝不在 agent 自己的轮次里 await `dispose()`**：`handle.dispose()` 会等当前轮次结算，
  从这轮的工具调用里同步 await 必然死锁。收尾停会话要「登记 + 空闲后由 tick 停」。
- **动态清单不要塞进系统提示词**：系统提示词在 prompt 最前，缓存是前缀匹配，其中任何一段
  变化都会让其后的整段对话历史缓存失效、按全价重算（`compactPrompt` 就是为此）。

## 已知成本与后续可优化

- **客户端包体**：`lib/client.js` 535KB（minify 后，gzip 113KB）。其中约 400KB 是 zod：客户端的 generated Remote 装配**要求 strict codec（zod 实例）**，因此 `src/client/remote.ts` 必须带 host 清单的 schema。试过用构建期生成的纯数据描述符（`src-json`）把包压到 137KB，但装配层直接拒绝（`generated Remote <field> has no strict codec`），因此保留现状。
- **面板性能**：面板打开约 **90ms**，轮询 8s（标签页隐藏时暂停）、载荷已裁剪（消息 60 条 / 审计 80 条）、且内容指纹未变时不重渲染。
- **会话标题重复写**：每次唤醒都会 `rename` 一次（幂等），日志里会有多条 `session/title`；可优化为「仅在创建时写」。
- **汇报路由**：`company_report → 项目群` 的链路已实现，但需要在真实汇报发生时才会跑通（本机重启后由员工自然触发）。

## 开发

```sh
npm install
npm run build      # esbuild：lib/index.js（host）、lib/typert.js（Remote 清单）、lib/client.js（浏览器半）
npm run typecheck
node build.mjs --watch
```

host 半经 `dsh plugin add` 装进 profile；浏览器半由宿主扫描 `dsh.client` 标记经 `/plugins/` 下发（`pnpm run dev:web` 时热更新）。
