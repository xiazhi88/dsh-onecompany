/**
 * 员工与频道驱动器：把名册记录 / 项目频道变成活的 agent（首次 create，之后
 * resume），并向其收件箱投递消息。会话是持久的一等会话，插件重启后按需懒恢复；
 * 常驻句柄按 LRU 回收（会话日志仍在盘上，可再次 resume）。
 *
 * v2 变化：
 * - 组合时默认挂载部署 preset（缺省 `standard`），员工因此拥有 bash/fs/子代理等
 *   全套能力（v1 未挂载导致员工「无 shell」的教训）；
 * - 创建/恢复后固定会话标题（「姓名 · 职位」「项目名 · 项目群」「一人公司 · 大厅」）；
 * - 频道 agent（项目群）与大厅（CEO 工位）与员工共用同一套驻留与投递机制。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { AgentRecord, ProjectRecord, TaskRecord } from '../shared/wire.ts'

/** 组合一个 agent 作用域所需的输入。 */
export interface ComposeSpec {
  /** 这个 agent 是什么角色（决定工具面收窄与提示词性质）。 */
  kind: 'employee' | 'hall' | 'channel'
  /** 作用域内注册的公司工具。 */
  tools: ToolDefinition[]
  /** 提示词段文本（每次组装时求值）。 */
  prompt: string | (() => string)
  /** 预设 id；null/undefined = 部署默认 preset。 */
  presetId: string | null
}

/** 驱动器依赖的宿主能力（由 index.ts 注入，避免与 service 循环引用）。 */
export interface DriverDeps {
  /** 宿主插件上下文：谁在这里调用 `ctx.agents.*`，谁就拥有该 agent 句柄。 */
  ctx: Context
  /** 员工工位组合。 */
  composeEmployee: (record: AgentRecord) => ComposeSpec
  /** 项目群频道组合。 */
  composeChannel: (project: ProjectRecord) => ComposeSpec
  /** 一次性任务会话的组合（岗位说明书 + 任务 + 档案索引）。 */
  composeTask: (task: TaskRecord, employee: AgentRecord) => ComposeSpec
  /** 大厅（CEO 工位）组合。 */
  composeHall: (record: AgentRecord) => ComposeSpec
  /** 首次创建成功后回写名册（下一次唤醒走 resume）。 */
  markProvisioned: (agentId: string) => Promise<void>
  /** 频道会话建好后回写项目记录。 */
  markChannel: (projectId: string, sessionId: string) => Promise<void>
  /** 把公司会话归入其 cwd 对应的工作区（否则侧栏看不到、也无法跳转）。 */
  attachWorkspace: (agent: Agent) => Promise<void>
  /**
   * 部署默认模型路由：记录未指定 provider/model 时继承它。
   * 不继承会让请求装配缺 `{{model}}` 变量而直接失败。
   */
  defaultModel: () => { provider?: string; model?: string; reasoningEffort?: string } | undefined
  /** 常驻上限（员工与频道共享一个池）。 */
  maxResident: number
  /** 给公司 agent 禁掉用不到的工具（省下每步的工具 schema token）。 */
  restrictTools?: (agentCtx: Context, kind: 'employee' | 'hall' | 'channel') => void
  /**
   * 新建会话后的开场消息：没有跑过轮次的会话是 blank，会被客户端从侧栏隐藏，
   * 也选不中；发一句话既让它可见，也让员工/频道正式亮相。空串 = 不发。
   */
  kickoff?: (kind: 'employee' | 'hall' | 'channel', label: string) => string
  /** 诊断日志。 */
  log: (message: string) => void
}

interface Resident {
  handle: AgentHandle
  lastUsed: number
}

/** 员工 agent 与频道 agent 的驻留管理 + 消息投递。 */
export class AgentDriver {
  /** 键：员工 id 或 `channel:<projectId>`。 */
  private readonly residents = new Map<string, Resident>()

  constructor(private readonly deps: DriverDeps) {}

  /** 当前驻留的员工 id（面板展示用；频道键不进名册展示）。 */
  residentIds(): string[] {
    return [...this.residents.keys()].filter((key) => !key.startsWith('channel:'))
  }

  /**
   * 确保员工 agent 活着：驻留则直接返回；未建过会话则 create，否则 resume。
   * resume 撞上「会话不存在」（例如上次创建后没来得及回写名册）时兜底 create。
   * @param record - 名册记录。
   * @returns 活的 Agent。
   */
  async ensure(record: AgentRecord): Promise<Agent> {
    const spec = record.role === 'ceo' ? this.deps.composeHall(record) : this.deps.composeEmployee(record)
    return this.ensureKeyed(record.id, record.sessionId, record.provisionedAt !== null, {
      meta: { cwd: record.cwd, ...(record.presetId !== null ? { agentPreset: record.presetId } : {}) },
      options: this.optionsOf(record),
      compose: (agentCtx) => this.composeWith(agentCtx, spec),
      title: record.role === 'ceo' ? '一人公司 · 大厅' : `${record.name} · ${record.title}`,
      onCreated: async () => this.deps.markProvisioned(record.id),
      kickoff: this.deps.kickoff?.(record.role === 'ceo' ? 'hall' : 'employee', record.name),
    })
  }

  /**
   * 确保项目群频道活着（懒创建：首次投递/打开时才建会话）。
   * @param project - 项目记录。
   * @returns 活的 Agent。
   */
  async ensureChannel(project: ProjectRecord): Promise<Agent> {
    const fresh = project.channelSessionId === null
    const sessionId = project.channelSessionId ?? `ses_${crypto.randomUUID()}`
    const agent = await this.ensureKeyed(`channel:${project.id}`, sessionId, !fresh, {
      meta: { cwd: project.repoPath ?? project.rootPath },
      options: this.defaultOptions(),
      compose: (agentCtx) => this.composeWith(agentCtx, this.deps.composeChannel(project)),
      title: `${project.name} · 项目群`,
      onCreated: async () => this.deps.markChannel(project.id, sessionId),
      kickoff: this.deps.kickoff?.('channel', project.name),
    })
    return agent
  }

  /**
   * 投递一条用户角色消息到员工工位（唤醒一个 FIFO 轮次）。
   * @param notice - 给了就按「通知行」呈现（折叠、只显示这一行摘要），
   *   用于转投汇报/播报，避免在频道里看起来像董事会发了长文。
   */
  async deliver(record: AgentRecord, text: string, notice?: string): Promise<void> {
    const agent = await this.ensure(record)
    agent.followup(this.message(text, notice))
  }

  /**
   * 一次性任务会话：每个任务一个会话，key = `task:<id>`。
   * sessionId 由服务在建任务时生成；首次调用会因「会话不存在」回落到创建。
   */
  async ensureTask(task: TaskRecord, employee: AgentRecord): Promise<Agent> {
    const sessionId = task.sessionId ?? `ses_${crypto.randomUUID()}`
    return this.ensureKeyed(`task:${task.id}`, sessionId, true, {
      meta: {
        cwd: employee.cwd,
        ...(employee.presetId === null ? {} : { agentPreset: employee.presetId }),
        // 子代理血统：客户端据此把该会话从侧栏隐藏，改为显示在父会话的「N 个子代理」里。
        origin: 'subagent',
        ...(task.parentSessionId === null ? {} : { parentSession: task.parentSessionId }),
      },
      options: this.optionsOf(employee),
      compose: (agentCtx) => this.composeWith(agentCtx, this.deps.composeTask(task, employee)),
      title: `${task.id} · ${task.title.slice(0, 24)}`,
      attach: false,
    })
  }

  /** 把任务帧投进它的执行会话。 */
  async deliverTask(task: TaskRecord, employee: AgentRecord, text: string): Promise<void> {
    const agent = await this.ensureTask(task, employee)
    agent.followup(this.message(text))
  }

  /** 停止某任务的执行会话（会话保留、可 resume）。 */
  async stopTask(taskId: string): Promise<void> {
    await this.stop(`task:${taskId}`)
  }

  /** 投递到项目群频道。 */
  async deliverChannel(project: ProjectRecord, text: string, notice?: string): Promise<void> {
    const agent = await this.ensureChannel(project)
    agent.followup(this.message(text, notice))
  }

  /** 组装投递消息：notice 形式带一行摘要（UI 折叠显示）。 */
  private message(text: string, notice?: string) {
    return notice === undefined
      ? createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin' as const, plugin: 'onecompany' } })
      : createUserMessage({
          content: [{ type: 'text', text }],
          source: {
            kind: 'plugin' as const,
            plugin: 'onecompany',
            form: 'notice' as const,
            summary: notice.slice(0, 120),
          },
        })
  }

  /**
   * 把已存在员工会话的标题归位（resume → rename → 立即释放，不常驻）。
   * 会话尚未创建（provisionedAt 为空）的员工跳过，等首次唤醒时自然命名。
   */
  async fixTitles(records: readonly AgentRecord[]): Promise<void> {
    for (const record of records) {
      if (record.provisionedAt === null) continue
      const key = record.id
      const resident = this.residents.get(key)
      if (resident !== undefined) {
        this.renameTitle(resident.handle.agent, record.role === 'ceo' ? '一人公司 · 大厅' : `${record.name} · ${record.title}`)
        continue
      }
      try {
        const agent = await this.ensure(record)
        this.renameTitle(agent, record.role === 'ceo' ? '一人公司 · 大厅' : `${record.name} · ${record.title}`)
        await this.stop(key)
      } catch (error) {
        this.deps.log(`标题归位失败（${record.name}）：${describe(error)}`)
      }
    }
  }

  /** 停止某个驻留键（员工 id 或 channel:<id>）。 */
  async stop(key: string): Promise<void> {
    const resident = this.residents.get(key)
    if (resident === undefined) return
    this.residents.delete(key)
    try {
      await resident.handle.dispose()
    } catch (error) {
      this.deps.log(`停用 ${key} 失败：${describe(error)}`)
    }
  }

  /** 停用全部驻留（总开关关闭时调用；会话与数据保留）。 */
  async stopAll(): Promise<void> {
    for (const key of [...this.residents.keys()]) await this.stop(key)
  }

  // ───────────────────────────── 内部 ─────────────────────────────

  private async ensureKeyed(
    key: string,
    sessionId: string,
    resume: boolean,
    spec: {
      meta: { cwd: string; agentPreset?: string; origin?: 'subagent'; parentSession?: string }
      options: AgentOptions
      compose: (agentCtx: Context) => Promise<void>
      title: string
      onCreated?: () => Promise<void>
      kickoff?: string
      /** 是否把会话归入工作区（任务会话为 false：它挂在父会话下，不进侧栏）。 */
      attach?: boolean
    },
  ): Promise<Agent> {
    const resident = this.residents.get(key)
    if (resident !== undefined) {
      resident.lastUsed = Date.now()
      return resident.handle.agent
    }
    await this.reapFor(1)
    let handle: AgentHandle
    let created = !resume
    if (resume) {
      try {
        handle = await this.deps.ctx.agents.resume({
          resumeSessionId: sessionId as never,
          agentOptions: spec.options,
          setup: spec.compose,
        })
      } catch (error) {
        const message = describe(error)
        // 只有「会话不存在」才允许重建；被别的实例持有（多开）等属于状态冲突，
        // 重建会掩盖问题，直接抛出更诚实。
        if (!/not found/i.test(message)) throw error
        this.deps.log(`会话 ${sessionId} 不存在，改为重建：${message}`)
        handle = await this.createKeyed(sessionId, spec)
        created = true
        if (spec.onCreated !== undefined) await spec.onCreated()
      }
    } else {
      handle = await this.createKeyed(sessionId, spec)
      if (spec.onCreated !== undefined) await spec.onCreated()
    }
    this.residents.set(key, { handle, lastUsed: Date.now() })
    this.renameTitle(handle.agent, spec.title)
    if (spec.attach !== false) await this.deps.attachWorkspace(handle.agent)
    // 从未跑过轮次的会话是 blank（侧栏不可见）：新建时或恢复时补一次开场。
    const everRan = created
      ? false
      : handle.agent.session.snapshotEvents().some((event) => event.type === 'turn/start')
    if ((created || !everRan) && spec.kickoff !== undefined && spec.kickoff !== '') {
      const kickoffText = spec.kickoff
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: kickoffText }],
        source: { kind: 'plugin', plugin: 'onecompany' },
      }))
    }
    return handle.agent
  }

  private async createKeyed(
    sessionId: string,
    spec: {
      meta: { cwd: string; agentPreset?: string; origin?: 'subagent'; parentSession?: string }
      options: AgentOptions
      compose: (agentCtx: Context) => Promise<void>
      title: string
    },
  ): Promise<AgentHandle> {
    const handle = await this.deps.ctx.agents.create({
      sessionId: sessionId as never,
      meta: spec.meta as never,
      agentOptions: spec.options,
      setup: spec.compose,
    })
    this.deps.log(`已创建会话 ${sessionId}（${spec.title}）`)
    return handle
  }

  /** 固定会话标题（失败不阻断主流程）。 */
  private renameTitle(agent: Agent, title: string): void {
    try {
      const titles = this.deps.ctx.get('sessionTitle') as { rename: (session: unknown, title: string) => unknown } | undefined
      titles?.rename(agent.session, title)
    } catch (error) {
      this.deps.log(`固定标题失败（${title}）：${describe(error)}`)
    }
  }

  /** 员工作用域组合：preset（默认部署 preset）+ 公司工具 + 角色提示词段。 */
  private async composeWith(agentCtx: Context, spec: ComposeSpec): Promise<void> {
    const presets = this.deps.ctx.get('agentPresets') as {
      mount: (ctx: Context, id?: string) => Promise<unknown>
    } | undefined
    if (presets !== undefined) {
      await presets.mount(agentCtx, spec.presetId ?? undefined)
    } else {
      this.deps.log('本部署未挂载 agent-presets，该 agent 只有公司工具可用')
    }
    this.applyToolRestriction(agentCtx, spec.kind)
    for (const tool of spec.tools) {
      agentCtx.tools.register(tool)
    }
    agentCtx.systemPrompt.section({
      name: 'onecompany-role',
      order: 60,
      text: spec.prompt,
    })
  }

  /**
   * 收窄工具面：把「会话迁移 / 编排 / 可视化」这类与公司工作无关的宿主级工具
   * 从模型视野移除。它们在宿主层全局注册，合计约 3 万字符 schema（≈8-10k token/步），
   * 而员工与 CEO 一次都用不到。`tools.restrict()` 必须在 agent 作用域调用。
   */
  private applyToolRestriction(agentCtx: Context, kind: 'employee' | 'hall' | 'channel'): void {
    const restrict = this.deps.restrictTools
    if (restrict === undefined) return
    try {
      restrict(agentCtx, kind)
    } catch (error) {
      this.deps.log(`收窄工具面失败（${kind}，不影响创建）：${describe(error)}`)
    }
  }

  /** 员工 agent 的模型路由选项：记录显式指定优先，否则继承部署默认。 */
  private optionsOf(record: AgentRecord): AgentOptions {
    const options: AgentOptions = {}
    const base = record.provider === null || record.model === null ? this.deps.defaultModel() : undefined
    const provider = record.provider ?? base?.provider
    const model = record.model ?? base?.model
    const effort = record.effort ?? base?.reasoningEffort
    if (provider !== undefined) options.provider = provider
    if (model !== undefined) options.model = model
    if (effort !== undefined) options.reasoningEffort = effort as never
    return options
  }

  /** 频道 agent 的模型选项（部署默认）。 */
  private defaultOptions(): AgentOptions {
    const base = this.deps.defaultModel()
    const options: AgentOptions = {}
    if (base?.provider !== undefined) options.provider = base.provider
    if (base?.model !== undefined) options.model = base.model
    if (base?.reasoningEffort !== undefined) options.reasoningEffort = base.reasoningEffort as never
    return options
  }

  /** 按上限回收：优先停掉最久未用且当前空闲的驻留句柄。 */
  private async reapFor(incoming: number): Promise<void> {
    while (this.residents.size + incoming > this.deps.maxResident) {
      const victim = [...this.residents.entries()]
        .filter(([, resident]) => resident.handle.agent.status === 'idle')
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
      if (victim === undefined) return
      await this.stop(victim[0])
    }
  }
}

/** 把任意抛出物渲染成一行诊断。 */
export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
