# dsh-onecompany v2 改造方案 —— 公司面板做配置，原生 dsh 做交互

> 基于 v1 上线后的真实使用反馈（员工对话截图、任务阻塞、董事会信箱堆积）与 9 条新需求。
> 核心转向：**汇报与协作在原生会话里发生（项目群/大厅），公司面板退为配置与监督台**。

## 0. 现役 bug（先于一切修）

**员工没有 bash/fs 工具**。程序化 `ctx.agents.create()` 不会自动挂默认 preset——v1 的员工只有 16 个公司工具，所以员工甲在任务里只能「写报告、无法落地」。
**修复**：员工/CEO/群 agent 创建时统一 `ctx.agentPresets.mount(agentCtx, presetId ?? undefined)`（缺省挂部署默认 `standard`），公司工具叠加其上。由此员工获得 bash/fs/skill/plan/subagent/compaction，「重活开子会话」也有了物质基础。

## 1. 新的会话地图（核心变化）

```
原生 dsh 会话列表
├── 一人公司 · 大厅          ← CEO 工位：董事会指令入口 + 全公司简报/周报
├── 项目甲 · 项目群   ← CEO（PULSE 实例）：该项目一切汇报/讨论
├── 项目乙 · 项目群   ← CEO（Desic 实例）
├── 员工甲 · 工位              ← 员工工作台（任务帧落点 + 执行现场，偏审计）
├── 员工乙 · 工位
└── （员工的任务子会话）       ← B 路线：重活在子会话里干
```

- **员工工位**（不变）：一人一条持久会话，信箱帧落这里，干活现场。审计视角，用户平时不用看。
- **项目群**（新增）：**每个项目默认一条会话**，由 **CEO 角色的项目实例**驱动（同一 CEO persona + 项目上下文段）。用户在里面用人话安排这个项目的事；**员工的完成汇报以 CEO 口吻的易读简报落在这里**（assistant 消息 = 原生 markdown 渲染，可读性天然解决）。
- **公司大厅**（新增）：CEO 的主会话。董事会的大任务丢这里，CEO 拆解分派；跨项目事务与周报落这里。
- **汇报路由改写**：`company_report` 按任务 projectId 投递到对应项目群；无项目 → 大厅；审批/阻塞 → 大厅 + 面板角标。董事会信箱从此只留审批级事项，不再被汇报刷屏。

### 为什么项目群由 CEO 实例驱动而不是项目负责人

一条会话只有一个根 agent。让 CEO  persona 实例（而非员工甲本人）驱动群，用户得到的才是「CEO 汇报给我看」的视角：CEO 读员工的原始结论，写成董事会一眼能读完的简报（做了什么/结果/风险/需要我做什么）。负责人本人仍在工位干活。

### 固定会话标题

创建时用 `ctx.sessionTitle.rename(session, '员工甲 · 工位')` / 「项目名 · 项目群」/「一人公司 · 大厅」，侧边栏不再出现信箱帧文本当标题。

## 2. CEO 角色（默认配置）

- 名册默认含 `agt_ceo`（名字可改，默认「CEO」，职位 首席执行官），`canApprove: true`，其 `sessionId` 即大厅会话。
- CEO 拿到全部公司工具 + 两个专属：
  - `company_dispatch(员工, 任务, 项目?)`：建任务 + 投递一步到位（含验收标准模板）；
  - `company_announce(项目|大厅, markdown)`：向群/大厅发简报（投递给对应频道 agent，帧指令「以 CEO 口吻直接输出简报」）。
- 员工的 `managerId` 默认改为 `agt_ceo`：`company_report` 先到 CEO；`company_approval_request` 由 CEO 先裁（他 `canApprove`），超出权限再上呈董事会。
- 董事会与 CEO 的交互：在大厅会话里直接说话 / 任意会话 `@CEO` / 面板派工。

## 3. 任意原生会话里 @ 员工派活

三件套（都是官方机制）：

1. **输入框 @ 建议**：client 半注册 `ctx.inputTriggers.registerSource({ trigger: '@', name: 'company' })`，候选 = CEO + 全员名册（含项目标签），选中插入 `@员工甲 ` 纯文本（与 ui-subagent 的 `@` 源共存）。
2. **全局派活工具**：host 监听 `agent/created`，给**非公司所有的运行时根会话**（你的普通会话）scoped 注册 `company_call(员工, 任务, 项目?)`：校验 → 建任务 → 投递到该员工工位 → 返回「已派给员工甲（tsk_x），完成后简报会发到『项目甲 · 项目群』」。
3. **小提示段**：根会话创建时注入一段（仅公司启用时）：「@员工名/直呼其名 = 派活；员工名册：CEO(CEO)、员工甲(PULSE)、员工乙(Desic)；用 `company_call`」。`@CEO` 派给CEO = 他拆解后再分派。

公司停用时该工具返回 `company_disabled`，名册为空时提示先招聘。员工会话与公司频道**不**注册此工具（防止自我套娃）。

## 4. 员工多项目负责（多选）

- `AgentRecord` 加 `projectIds: string[]`（默认 `[]`，旧记录 zod default 兼容，domain 不升版本）；
- 权限默认派生：负责的项目 = write，其余 = read（`permissions.projects` 仍可作例外覆盖）；
- 招聘/编辑表单把「汇报对象」下面加「负责项目」多选 chips；CEO 派工时按 `projectIds` 对齐项目。

## 5. B 路线：主会话 = 工位，重活开子会话

- **纪律写进提示词与 AGENTS.md**：「超过一次会话能装下的活（大改造、长排查、批量数据），用 `subagent` 开子会话干；工位只做读材料、拆解、派子会话、收结果、写档案、汇报」；
- **血缘归集**：`foldEvent` 沿 `header.parentSession` 上溯（≤4 层）归到员工头上，token/工时把子会话算全；员工详情显示主+子会话列表（worklog.sessions 已收）；
- 子会话标题由员工自己管理（委派时给 description，系统据此起名）✓ 不用我们处理。

## 6. 公司面板退为配置台 + 监督台

**保留并强化**：组织（员工/CEO/权限/预算/多项目）、项目（档案 + ACL + 仓库路径 + 「打开项目群」按钮）、审批、工作日志统计、排程、审计时间线。
**弱化**：任务看板（仍可建任务/查看，但不再是主交互面）；董事会信箱改为只列审批级与异常。
**新增跳转**：员工卡片「打开工位」、项目卡片「打开项目群」——`ctx.sessions.open(id)` 直接切到原生聊天。

## 7. 面板可读性（markdown + 交互）

- 所有长文本（信箱正文、任务说明/结论、评论、汇报）改用官方 `MarkdownText` 渲染（`@deepseek-ai/dsh-client-ui-primitives`，平台模块）；
- 任务抽屉加交互：往来消息/评论**点击展开全文**（默认 3 行折叠）、关联任务/员工/资料**可点击跳转**（任务→抽屉切换、员工→详情弹层、文档→预览）；
- 员工详情「最近往来」同样 markdown + 展开。

## 8. 数据模型与迁移（不丢现有数据）

现有 domain（v1）已有真实数据（两名员工、任务、报告、档案），**全部保留**：

- `agents.projectIds: string[]` 默认 `[]`、`projects.channelSessionId: string|null` 默认 `null` —— zod `.default()` 让旧记录原样通过校验，**domain 不升版本**；
- 启动 reconcile：项目缺群 → 建群会话 + 改名；名册缺 CEO → 提示董事会一键补建（或自动补建，可配置 `config.autoCeo: true`）；
- 员工甲/员工乙的 `projectIds` 用迁移脚本补（`prj_pulse` / `prj_desic`），`managerId` → `agt_ceo`；
- 现有两位员工的工位会话补固定标题（rename）。

## 9. 启用开关语义不变

关掉 = 停调度、停投递、停公司工具、@源与公司工具从根会话消失（effect 撤销），数据与会话原样保留；开 = 全部恢复。

## 10. 实施顺序（建议）

| 批 | 内容 | 价值 |
|---|---|---|
| **P0（先修）** | 员工挂 standard preset（修「无 shell」）；固定会话标题；汇报改投项目群（没有群时先落大厅）；面板 MarkdownText + 任务抽屉展开 | 解开员工甲当前阻塞；可读性立刻好 |
| **P1** | 项目群频道 + CEO 角色 + 大厅 + `company_dispatch`/`company_announce` + 迁移脚本 | 新交互模型成形 |
| **P2** | `company_call` + @ 源 + 根会话提示段 + 面板「打开群/工位」跳转 | 原生 dsh 体验闭环 |
| **P3** | 员工多项目多选 UI + B 路线血缘归集 + 子会话列表 | 精细化 |
| **P4** | CEO 周报（定时）、大厅公告板、审批进大厅消息 | 锦上添花 |

## 11. 已确认的平台事实（实施依据）

- `ctx.sessionTitle.rename(session, title)` —— 固定标题 ✓
- `ctx.sessions.open(id)`（client）—— 面板跳转原生会话 ✓
- `ctx.inputTriggers.registerSource({trigger:'@', ...})` —— @ 建议 ✓（ui-subagent 同款模式）
- `ctx.agentPresets.mount(agentCtx, id?)` 空参 = 部署默认 preset —— 员工拿 bash/fs 的修复点 ✓
- `agent/created` + `agentCtx.tools.register` —— 根会话注入 `company_call` 的挂点（dsh-schedule 同款）✓
- `MarkdownText`（ui-primitives）—— 平台模块可直接 external 引入 ✓
- `header.parentSession` 血缘 —— 子会话归集 ✓

## 12. 明确不做（本版）

- 不做矩阵式组织（一员工多上级）；不做员工互相直接改对方任务（评论即可）；
- 群会话**不做**多 agent 同席发言（一条会话一个根 agent 是平台约束）——项目群就是「CEO 项目实例」，不是群聊多方；
- 面板不做任务拖拽排序（按钮改状态已够）。
