# dsh-onecompany —— 「一人公司」DSH 插件设计方案

> 版本 v0.1（设计稿）。调研基础：`~/deepseek-harness` 源码（docs/architecture、cordis-tutorial、subsystems/*、packages/*）、本机已装社区插件（dsh-usage-stats / dsh-cost-meter / dsh-better-sidebar 等）、社区调研（dsh-plugin topic、paperclipai/paperclip、awesome-deepseek-harness）。

---

## 0. 一句话定位

把 Paperclip 的「公司控制面」概念（组织图 / 心跳 / 任务 / 董事会审批）原生化进 DSH：**你当董事会（board），agent 当员工**。每个员工是一个一等的、可持久化的 DSH 会话 agent；公司服务（`ctx.company`）作为编排中枢，提供任务系统、信箱总线、审批流、定时调度、资料库权限与工作日志统计；前端以 client plugin 形式贡献「公司面板」。

差异化：DSH 生态现有的 dsh-agent-teams 是「扁平 captain + 成员」、无层级/审批/预算/资料库权限——本插件补齐这四件事。

---

## 1. 调研结论：dsh 是什么 & 开发规范要点

### 1.1 dsh 架构本质

- **万物皆插件**：底层是 vendored Cordis。工具注册表、LLM 适配器、会话日志、agent loop 本身都是插件，无特权内核。扩展 = 把插件挂到其他插件旁边；**一切注册都是可逆 effect**（返回 disposer，卸载/HMR 自动回卷）。
- **服务即 `ctx.<key>`**：`ctx.tools`、`ctx.agents`、`ctx.sessions`、`ctx.subagents`、`ctx.sessionPersistence`、`ctx.sessionQuery`、`ctx.storageDomain`、`ctx.systemPrompt`、`ctx.commands`、`ctx.jobs`、`ctx.tokenMeter`、`ctx.workspaceRegistry` 等。插件用 `export const inject = [...]` 声明硬依赖，缺服务时静默 PENDING（首要排查点）。
- **组合方式**：profile（`dsh.profile.bundles` 列表）→ profile `cordis.patch.yml` → home patch → `--patch` overlay。patch 按 `id` 定位并**整行替换 config（非深合并）**。第三方插件的标准形态是**组合包（bundle）**：`package.json` 里 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，用 `dsh plugin --profile web add <pkg>` 安装。
- **会话日志是铁律**：「模型可见 ⟺ 已记录」。新增模型可见输入必须扩展 `SessionEventMap`；新事件默认 required-on-read（老 reader 拒读），纯信息事件须标 `ignorable: true`。**推论：公司业务数据一律放 storage domain，不碰会话事件 schema。**
- **agent 即 surface**：`Agent` 接口（`send/followup/steer/inject/cancel/whenIdle/runMaintenance`）是插件面向编程的面；`ctx.agents.create()/resume()` 可编程式创建/恢复任意 agent；`agent.ctx` 上做 scoped 注册（该 agent 独有的工具/提示词）。
- **client plugin 机制**：包声明 `"dsh": { "client": { "platform": "web", "inject": [...] } }` + `exports["./client"]`（tsdown 构建），宿主扫描后注入 `window.__DSH_BOOT__`，经 `/plugins/<id>/client.js` 加载。浏览器半插件 `export const inject = ['slots','sessions','locale',...]` + `apply(ctx: ClientContext)`，通过 **slot 注册表**贡献 UI（`ctx.slots.register(...)`），数据走 **Typert Remote RPC**（`ctx.remote.*`，goal/jobs 是模板）或自建 `ctx.webServer` 路由/SSE。

### 1.2 必须遵守的规范（摘与本插件相关）

1. 每个注册都有 disposer；框架不管的资源（定时器等）包进 `ctx.effect(() => { ...; return disposer })`。
2. waterfall 监听器必须调 `next()`（如挂 `agent/pre-step`）。
3. 部署差异值全部进 `Config`（Schemastery schema），无硬编码可调参数；配置错误加载时响亮失败。
4. 校验只在外部边界（config/模型/工具 JSON/持久化/wire）；同进程 typed 边界不做运行时校验。
5. 全 ESM（`"type":"module"`），`@deepseek-ai/cordis` 是 peerDependency。
6. 服务命名加前缀避免撞扁平命名空间（我们用 `company`）。
7. 不预防性拆分 Service Definition/Provider/Consumer 三包——**单包双半（host + client）起步**，需要独立演进再拆。
8. 工具设计时就定好 UI 渲染意图（generic/terminal/diff 等）。

### 1.3 需求 → dsh 机制映射总表

| 需求 | dsh 现成机制 | 结论 |
|---|---|---|
| 多 agent 上下级编排 | `ctx.agents.create/resume`（AgentRegistry）+ `agent.ctx` scoped 组合 + agent preset（`ctx.agentPresets`） | 员工 = 插件拥有的一等会话 agent；组织树为逻辑模型（见 §3 决策） |
| 员工可配置（名称/角色/AGENTS.md/模型） | preset 目录（`agent.cordis.yml` + `preset.yml`）+ `AgentOptions.provider/model` + persona 段 | 角色 = preset + AGENTS.md + 员工记录 |
| 资料库/项目（分权限、agent 可创建） | `ctx.storageDomain` + 文件系统目录 + 自建 ACL 工具 | 领域表存索引/ACL，内容落公司库目录，读写走 ACL 工具 |
| 定时任务 | `dsh-schedule` 仅 session-local 且不支持 cron → **自建公司调度器**（范式照抄 packages/schedule：持久表 + fiber timer + idle 后 followup） | 自建，支持 cron 表达式/间隔/绝对时点，跨会话投递 |
| agent 间通信协议 | 父子 `subagents.followup/reportFrom` 仅直接父子鉴权；跨树需自建总线 | **公司信箱总线**（durable mailbox + 投递 worker），全部消息可追溯 actor |
| 用户派任务 / agent 互相讨论 | `ctx.commands`（/company 命令）+ 公司工具（mail/task/comment）+ UI 看板 | 任务 + 评论 + 信箱三件套 |
| 可视化 | client plugin + slots + Typert Remote + （可选）webServer SSE | 公司面板：组织图/看板/员工详情/审批/资料库/时间线 |
| 工作日志 / token（输入/输出/缓存） | `session/event` 折叠 `assistant/message.usage`（inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens/reasoningTokens）+ `ctx.sessionQuery` 回填 + `ctx.tokenMeter` | 增量折叠进 worklog 表 |
| 待办/完成事项 | 自建 task 表（单负责人 + 原子 checkout + 父子层级，paperclip 模型） | 见 §4.4 |

---

## 2. 总体架构

```
┌──────────────────────────── dsh web 进程 ────────────────────────────┐
│                                                                      │
│  ┌─ host 半（dsh-onecompany/lib/index.js）───────────────────────────┐  │
│  │  CompanyService (ctx.company)                                   │  │
│  │   ├─ OrgManager      员工名册 CRUD / 入职离职 / 暂停恢复        │  │
│  │   ├─ AgentDriver     创建/恢复/驻留员工 agent（AgentHandle 池） │  │
│  │   ├─ Mailbox         信箱总线 + 投递 worker（resume→followup）  │  │
│  │   ├─ TaskBoard       任务状态机 / 原子 checkout / 评论          │  │
│  │   ├─ ApprovalFlow    董事会审批（hire/strategy/spend/action）   │  │
│  │   ├─ Scheduler       cron/interval/at 持久调度 + 心跳          │  │
│  │   ├─ Library         资料库/项目 + ACL 执行                     │  │
│  │   └─ Worklog         session/event 折叠 usage/工时             │  │
│  │  公司工具（每员工 scoped 注册，ACL 在 execute 内判定）          │  │
│  │  /company 命令（用户侧）                                       │  │
│  │  Typert Remote API（ctx.remote.company，供前端）               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│        │                    │                       │                 │
│  storageDomain        员工会话群              session/event           │
│  (company v1, sqlite)  （一等 sessions）      （usage/工时折叠）      │
│                                                                      │
│  ┌─ client 半（dsh-onecompany/lib/client.js，dsh.client）────────────┐  │
│  │  slots: 侧边栏入口 + 公司整页面板                                │  │
│  │   ├─ OrgChart（组织树 + 状态 + 今日 token）                     │  │
│  │   ├─ TaskBoard（看板 + 评论 + 指派）                            │  │
│  │   ├─ EmployeeDetail（工作日志/会话/排程/信箱）                  │  │
│  │   ├─ ApprovalsInbox（董事会审批）                               │  │
│  │   ├─ LibraryView（资料库/项目，按 ACL 可见）                    │  │
│  │   └─ ActivityTimeline（审计流）                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**形态**：单 npm 包 `dsh-onecompany`，`exports` 含 `"."`（host）、`"./client"`（浏览器半）、`"./typert"`（Remote host 装配），`cordis.patch.yml` 一行 insert。遵循 ui-jobs / dsh-usage-stats / dsh-cost-meter 的成熟范式。

---

## 3. 关键架构决策：员工 = 插件拥有的一等会话 agent（而非 subagent 树）

两个候选：

- **A. subagent continuable 树**：组织树 = dsh session 树，`followup/reportFrom` 鉴权天然契合上下级。缺点：投递必须经直接父级（用户→深层员工、同事→同事都要逐级中转）；冷恢复一层层走 continuation manager；员工会话嵌在用户会话树里，不好独立打开。
- **B.（选定）员工是独立 root 会话**：公司服务用 `ctx.agents.create(ownerCtx, { meta:{cwd}, agentOptions, setup })` 直接创建，持有 `AgentHandle`；消息投递用 `agent.followup()`（持有 handle 即能力）；冷员工用 `ctx.agents.resume({ resumeSessionId })` 按需唤醒；组织树是**逻辑模型**存 domain，注入提示词、由总线与审批流强制执行。

选 B 的理由：
1. **投递自由**：公司服务作为中枢可向任意员工 FIFO 投递，不受父子鉴权约束——「我安排任何人」「同事互问」「上级审批下达」全部统一走信箱总线。
2. **一等会话**：员工出现在侧栏，用户可直接打开员工会话查看/插话（透明、可调试），工作日志直接 `sessionQuery`。
3. **重启韧性**：会话持久化在 `ctx.sessionPersistence`；插件重启/HMR 后按名册懒恢复，无 continuation manager 的 Activation 所有权耦合。
4. **可组合**：员工创建时 `setup(agentCtx)` 里 `ctx.agentPresets.mount(agentCtx, presetId)`——角色组合（工具集/persona/指令）复用官方 preset 机制，用户用现成的 preset UI/文件即可编辑角色。

代价：失去 `subagent/*` 事件与 `listDescendants` 枚举——但名册在 domain 里，编排观测由总线自记（activity 审计表），完全够用。

**心跳模型（paperclip heartbeat 的原生化）**：员工不是常驻轮询的 loop，而是「消息/任务/定时器 → 唤醒一个 FIFO 轮次 → 工作 → 汇报 → 静止」。唤醒通道就是 `agent.followup()`；`whenIdle()` 后可选择 dispose 驻留 handle 释放内存（会话仍在盘上，下次唤醒冷恢复）。调度器/信箱投递 worker 负责唤醒，员工自己不需要任何常驻逻辑。

---

## 4. 领域模型（storageDomain，`company` v1，sqlite 后端路由）

```ts
const companyDomain = defineDomain({
  name: 'company',
  version: 1,
  tables: {
    agents:    domainTable<AgentId, AgentRecord>(agentSchema),
    projects:  domainTable<ProjectId, ProjectRecord>(projectSchema),
    docs:      domainTable<DocId, DocRecord>(docSchema),
    tasks:     domainTable<TaskId, TaskRecord>(taskSchema),
    comments:  domainTable<CommentId, CommentRecord>(commentSchema),
    messages:  domainTable<MessageId, MessageRecord>(messageSchema),
    approvals: domainTable<ApprovalId, ApprovalRecord>(approvalSchema),
    schedules: domainTable<ScheduleId, ScheduleRecord>(scheduleSchema),
    worklogs:  domainTable<string, WorklogRecord>(worklogSchema),   // key = `${agentId}:${yyyy-mm-dd}`
    activity:  domainTable<ActivityId, ActivityRecord>(activitySchema),
  },
})
```

### 4.1 agents（员工名册）

```jsonc
{
  "id": "agt_ops01",
  "name": "小维",
  "title": "运维工程师",
  "role": "ops",                       // 角色 key，ACL 用
  "managerId": "agt_cto",              // 逻辑汇报线；null = 直接向 board 汇报
  "presetId": "company-ops",           // ~/.dsh/.agent-presets/company-ops/
  "personaPath": "agents/ops/AGENTS.md", // 公司目录内的角色说明书
  "model": { "provider": "deepseek", "model": "deepseek-chat", "effort": "medium" },
  "sessionId": "ses_...",              // 一等会话 id（持久）
  "status": "active | paused | terminated",
  "permissions": {                     // 见 §6
    "projects": { "proj_infra": "write", "*": "read" },
    "tools": ["company_mail", "company_task", "company_doc", "company_schedule"],
    "canHire": false, "canApprove": false
  },
  "budget": { "dailyTokenCap": 2000000 },
  "createdAt": 0, "createdBy": "board"
}
```

### 4.2 projects / docs（资料库与项目）

- 物理布局：`<companyRoot>/projects/<projectId>/...`（项目文件）与 `<companyRoot>/library/<docPath>.md`（资料）。`<companyRoot>` 默认 `$DSH_HOME/company/<companyId>/`，Config 可改。
- `projects` 表：`{ id, name, rootPath, acl: { [roleOrAgentId]: "none"|"read"|"write" }, defaultAcl: "read", status, createdBy, createdAt }`。
- `docs` 表是索引：`{ id, projectId, path, title, tags, createdByType, createdById, updatedAt }`。内容就是 markdown 文件，agent 通过 ACL 工具读写（不直接暴露 fs 路径语义，见 §6）。

### 4.3 messages（公司信箱总线）——通信协议核心

```jsonc
{
  "id": "msg_...",
  "from": { "type": "agent|board|system", "id": "agt_ops01" },
  "to":   { "type": "agent|board", "id": "agt_cto" },
  "kind": "info | question | request | report | approval_request | approval_result | task_notice",
  "taskId": "tsk_...",               // 可选关联
  "body": "…markdown…",
  "status": "pending | delivered | read | answered",
  "createdAt": 0, "deliveredAt": 0
}
```

**协议规则**（写进每员工的 AGENTS.md 与工具描述）：
1. 一律经总线：`company_mail_send(to, kind, body, taskId?)`。禁止假定对方在线。
2. 发现问题/需要协助 → 给 `managerId` 发 `report`，或给相关同事发 `question`（`company_org()` 查通讯录）。
3. 需要权限外动作（花钱、上线、删库、招聘）→ `company_approval_request(kind, payload)`：若 `manager.canApprove` 则先送上级，否则直送 board；结果以 `approval_result` 信箱回送。
4. 每条消息、每次状态变更都落 `activity` 审计表（actor/at/action/detail）。

**投递 worker**（CompanyService 内 fiber，串行 per-recipient）：
`pending` → 解析收件人 →（冷则 `ctx.agents.resume`）→ `agent.followup([公司信箱] 格式化帧)` → 写 `deliveredAt`、`status=delivered`。帧格式稳定（纯文本 user message），携带 from/kind/taskId/body + 「用 company_mail_send 回复，mailId=…」。对 board 的消息不进会话，进 UI 收件箱 + 可选系统通知。

### 4.4 tasks（任务系统）

```jsonc
{
  "id": "tsk_...", "title": "…", "desc": "…",
  "assigneeId": "agt_ops01",          // 单负责人（paperclip）
  "creator": { "type": "board|agent", "id": "…" },
  "parentTaskId": null,               // 子全完成自动关父
  "projectId": "proj_infra",
  "status": "todo | in_progress | blocked | review | done | cancelled",
  "priority": 0, "dueAt": null,
  "checkout": null,                   // { by, at } 原子认领，防抢单
  "goalRef": null,                    // 关联公司目标（goal alignment）
  "result": null, "createdAt": 0, "updatedAt": 0, "doneAt": 0
}
```

状态机：`todo →(checkout)→ in_progress ⇄ blocked → review → done`；`review` 由 assignee 提交，manager/board 验收或打回（打回→`in_progress` + 评论）。评论表 `comments` 承载协作讨论（authorType/authorId/at/text），任务页即讨论串。

### 4.5 schedules（公司调度器）

```jsonc
{ "id": "sch_...", "agentId": "agt_ops01",
  "kind": "cron | every | at",
  "cron": "0 9 * * *", "everySec": null, "at": null, "timeZone": "Asia/Shanghai",
  "prompt": "每日巡检：检查 proj_infra 的监控面板…",
  "enabled": true, "nextRunAt": 0, "lastRunAt": 0, "lastOutcome": "ok|error" }
```

- 调度 fiber：`ctx.setInterval(tick, 30_000)`（effect 托管）；取 `enabled && nextRunAt <= now`；投递 = 创建一条 `system→agent` 的 `task_notice` 信箱消息走正常投递；`nextRunAt` 用 cron-parser（优选维护型依赖）推进；逾期策略与 dsh-schedule 一致：只补最近一次，不堆积。
- 对比直接用 `dsh-schedule`：它是 session-local、≥300s 固定速率、无 cron、只投递原会话——公司需要 cron 语义 + 跨会话投递，故自建；其 runtime 的「持久表为权威 + timer 分段等待 + idle 后 followup」范式照抄。

### 4.6 worklogs / activity

- `worklogs`：key=`agentId:date`，`{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, turns, activeMs, sessionIds[] }`。
- 增量来源：`ctx.on('session/event')` 全局监听，命中名册 sessionId 才折叠：`assistant/message.usage.*` 累加 token；`turn/start`/`turn/end` 时间差累加 `activeMs`。
- 回填：插件启动时对名册会话用 `ctx.sessionQuery.listEvents(sessionId, ...)` 扫当日（或按 logRevision 断点续扫）。
- 预算：`budget.dailyTokenCap` 在信箱投递前检查，超额 → 给 manager+board 发 `report` 并暂停当日投递。
- `activity`：`{ id, at, actorType, actorId, action, detail }`，一切变更可追溯。

---

## 5. 员工运行时：创建、组合、提示词

**入职（hire）流程**（UI 或 `/company hire` 触发；默认需 board 审批）：
1. 写 `agents` 记录（status=active），生成 `<companyRoot>/agents/<id>/AGENTS.md`（角色说明书：名称/职位/职责/汇报线/权限/预算/通信协议）。
2. 生成/复用 preset：`<presetsRoot>/company-<role>/agent.cordis.yml`（拷贝自公司模板 preset，含基础工具 + persona 段 + 公司工具行）。
3. `ctx.agents.create(ownerCtx, { meta: { cwd: <companyRoot> }, agentOptions: { provider, model, effort }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, presetId); 注册该员工 scoped 公司工具; 注入公司 system prompt 段; } })`。
4. 首条 followup = 「入职包」：组织图、你的 AGENTS.md、通讯录、当前任务清单、资料库索引。
5. 落 activity；会话 id 写回名册。

**员工提示词构成**：persona 段（preset）+ 公司段（scoped `ctx.systemPrompt.section`：通信协议、任务纪律、汇报规则）+ AGENTS.md（经 workspace instructions 或入职包）。模型按员工 `model` 字段走 `agentOptions`。

**离职/暂停**：`pause` = 拒收新投递（信箱囤 pending）；`terminate` = dispose handle + 会话归档保留 + 状态置 terminated。

---

## 6. 公司工具（模型可见，按员工 scoped 注册，execute 内查 ACL）

| 工具 | 说明 | ACL |
|---|---|---|
| `company_org` | 组织图/通讯录/我在哪 | 全员 |
| `company_mail_send / list / read` | 信箱收发 | 全员 |
| `company_task_create / list / update / checkout / comment` | 任务系统；create 可指派他人（经理可派下级） | 全员，update 限 assignee/manager/board |
| `company_report(body, taskId?)` | 向上级汇报（= mail kind=report to manager） | 全员 |
| `company_approval_request(kind, payload)` | 请求审批（hire/strategy/spend/action） | 全员；决议只来自 manager/board |
| `company_doc_list / read / write / create` | 资料库读写创建；按 projects.acl 判定 | 按 ACL |
| `company_project_create` | 创建项目（落目录 + 表） | `canHire` 同级配置项或需审批 |
| `company_schedule_create / list / delete` | 配置自己的定时任务 | `tools` 白名单含 schedule 者 |
| `company_help` | 协议自描述 | 全员 |

实现要点：`defineTool`（`@deepseek-ai/dsh-tools`）注册；`execute(args, exec)` 内 `exec.agent.id` → 名册记录 → ACL 判定，越权返回 `{ error: { code: 'company_forbidden', ... } }`（响亮、可教学）；output.schema 稳定 + render 为确定性 JSON 文本；工具描述里写明「什么时候用哪个工具」（模型体验章节照 dsh 规范写进 README）。

**用户（board）侧入口**：`/company` 命令族（`ctx.commands.register`）：`/company assign <agent> <任务>`、`/company org`、`/company inbox`、`/company approve <id>`。加上 UI 面板全套。用户在任意会话也可直接打开员工会话插话。

---

## 7. 前端（client 半）

**加载**：`package.json` → `"dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-slots", ...] } }`，`exports["./client"]` = tsdown 产物。宿主自动扫描进 boot 图，`/plugins/dsh-onecompany/client.js` 下发；`pnpm run dev:web` 时 HMR。

**数据通道**：Typert Remote（照 goal 模式）——host 半把 CompanyService 的只读/变更方法声明成 Remote descriptor，client 半 `ctx.remote.company.*` 调用；实时性用 `domain/changed` 事件转发成 Remote 订阅（或退一步：30s 轮询 + 手动刷新，M1 先轮询）。

**UI 贡献点**：
- `sidebar.*` slot 注册「公司」入口（图标 + 未读审批角标）。
- 公司整页：自建 slot 树（root scope）六视图：OrgChart / TaskBoard / Employee / Approvals / Library / Activity。
- OrgChart：名册树 + 每节点状态（active/paused、是否驻留 running/idle）、今日 token 摘要、点击进入详情。TaskBoard：五列看板，拖拽指派（调 Remote），任务卡展开评论串。Employee 详情：工作日志（会话列表跳转会话、工时、token 输入/输出/缓存读写堆叠图、近 7 天柱状图）、排程 CRUD、信箱。Approvals：board 收件箱，批准/驳回即写表并触发 `approval_result` 投递。

---

## 8. 闭环走查（验收剧本）

1. **派工闭环**：board 在 TaskBoard 指派「每天输出竞品监控报告」给运营 → task(todo)+信箱 → 运营 checkout → 每日 schedule 触发 → 写文档到资料库（ACL：marketing=write）→ task→review + report 给上级 → 上级验收 → done。board 全程在 Activity 看到每一步。
2. **上报审批闭环**：09:00 调度器唤醒运维巡检 → 发现磁盘将满 → task_create( blocked, 需采购 ) + report 给 CTO → CTO approval_request(spend) → board 在 Approvals 批准 → approval_result 信箱送达 CTO → CTO 派 task 给运维 → 运维执行 → report → done。任意环节 agent 可 `company_mail_send` 问同事（如问财务预算科目），讨论留在任务评论。
3. **用户插话闭环**：board 直接打开运维会话说「先别动生产」→ 即普通用户消息进入该员工 FIFO，天然优先于其队列后续。

---

## 9. 工程结构与开发流

```
dsh-onecompany/
├── package.json          # name: dsh-onecompany, type: module, dsh.bundle + dsh.client
├── cordis.patch.yml      # - insert: [{ id: company, name: 'dsh-onecompany', config: {...} }]
├── tsdown.config.ts      # host: src/index.ts → lib/index.js; client: src/client/index.ts → lib/client.js
├── src/
│   ├── index.ts          # host apply: Config 校验 → 开 domain → ctx.plugin(CompanyService)
│   ├── service.ts        # CompanyService (ctx.company)
│   ├── domain.ts         # defineDomain + zod schemas
│   ├── driver.ts         # AgentDriver：create/resume/handle 池/idle 回收
│   ├── mailbox.ts        # 总线与投递 worker
│   ├── tasks.ts / approvals.ts / scheduler.ts / library.ts / worklog.ts
│   ├── tools.ts          # scoped defineTool 组
│   ├── commands.ts       # /company 命令族
│   ├── remote.ts         # Typert Remote descriptor（ctx.remote.company）
│   └── client/
│       ├── index.ts      # export const inject / apply：locale + slots 注册
│       ├── slots.ts      # 自建 slot 树声明
│       └── views/        # OrgChart.tsx TaskBoard.tsx Employee.tsx Approvals.tsx Library.tsx Activity.tsx
├── presets/company-employee/   # 员工模板 preset（agent.cordis.yml + preset.yml）
└── README.md             # 含 Model Experience 章节（dsh 规范）
```

**Config（cordis.yml 可改，无硬编码）**：`companyRoot`、`storageBackend: 'sqlite'|'json'`、`tickMs`、`maxResidentAgents`、`defaultDailyTokenCap`、`approvals.required: ['hire','strategy','spend']`、`presetsRoot`。

**开发流**：`dsh plugin --profile web add link:~/dsh-onecompany`（或开发期 `--patch` 绝对路径直挂）→ `pnpm run dev:web` 起 client HMR → 改 host 代码 cordis HMR 自动回卷重挂。**排错口诀**：没输出先查 fiber PENDING（inject 缺提供方）；waterfall 记得 `next()`；patch 覆盖整行 config。

**测试**：domain 折叠/状态机单测（vitest）；ACL/审批/调度用 mock Agent + 内存 domain；端到端用 headless profile + `DEEPSEEK_API_KEY` 跑入职→派工→汇报剧本。

---

## 10. 里程碑

- **M1（骨架可用）**：domain + 名册 + 员工创建/恢复 + 信箱总线 + 任务系统 + `/company` 命令 + 最小 UI（组织列表 + 看板 + 审批收件箱）。验收：闭环 1 纯手工触发跑通。
- **M2（自治运转）**：调度器（cron/every/at）+ 审批全链路 + 资料库/项目 ACL + worklog 统计 + 员工详情页。验收：闭环 2 定时自动跑通。
- **M3（体验与治理）**：OrgChart 可视化 + token/工时仪表盘 + 预算熔断 + 公司导入导出（companies.sh 式 YAML）+ 与 dsh-usage-stats/cost-meter 口径对齐 + 公告板（pub/sub 广播）。
- **M4（生态）**：员工可配 subagent 下线（matrix 支援）、dsh-mnemon 知识库对接、对外 IM 通道（dsh-im）接信箱。

**风险清单**：① 驻留员工内存上限 → handle 池 LRU + `whenIdle` 回收（Config `maxResidentAgents`）；② HMR/重启时投递 worker 幂等（pending 状态 + deliveredAt 去重）；③ cron 时区（存 IANA zone，照 dsh-schedule 的 DST 规则：gap 拒绝、overlap 取早）；④ 工具重名 → 全部 scoped 注册进 `agent.ctx`，不进全局层；⑤ domain version 演进（预发布立场：直接 bump version 拒旧介质）。

---

## 11. 参考

- 官方文档：`~/deepseek-harness/docs/architecture.zh.md`、`cordis-tutorial/`、`subsystems/{subagent,core,tools,storage,session-query,token-meter,schedule}.zh.md`、`user/develop/` 系列
- 端到端模板：`packages/client/ui-jobs`（服务+面板成对）、`packages/goal/goal`（Typert Remote + client 半）、`packages/schedule/schedule`（持久调度范式）、`packages/preset/agent-presets`
- 社区：[dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)（多 agent 编排+信箱+树监视器，最贴近）、[paperclip](https://github.com/paperclipai/paperclip)（公司控制面概念源）、[dsh-ui-usage-billing](https://github.com/kenz1117/dsh-ui-usage-billing)（session 日志 token 聚合）、[dsh-mcp-panel](https://github.com/PerryLink/dsh-mcp-panel)（审批门控写入）、[dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon)（知识库）、[awesome-deepseek-harness](https://github.com/0xsline/awesome-deepseek-harness)
