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

- **汇报路由**：`company_report` 按任务的项目归属投到对应项目群；无归属 → 大厅；审批/阻塞 → 大厅 + 面板角标。董事会信箱不再被汇报刷屏。
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

## 已知成本与后续可优化

- **客户端包体**：`lib/client.js` ≈ 875KB——`src/client/remote.ts` 为了让浏览器端拿到 Remote 描述符，导入了 host 的 `typert.ts`，把 zod（约 700KB）一起内联进了浏览器包。功能正常（本机 127.0.0.1，传输成本可忽略），后续可改为「客户端自持一份纯数据描述符 + `src-json` codec」来瘦身到 ~110KB（改动会动到已验证的远程链路，需单独一轮验证）。
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
