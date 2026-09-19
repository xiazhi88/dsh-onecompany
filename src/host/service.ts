/**
 * 公司服务：名册、任务、信箱、审批、排程、资料库、工作日志的唯一权威。
 * 所有业务状态写进 storage domain；对员工的投递经司机（driver）落到其会话收件箱。
 */
import { randomUUID } from 'node:crypto'
import { appendFile, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ActionResult, AccessLevel, ActivityRecord, AgentPatch, AgentRecord, ApprovalInput,
  ApprovalRecord, CommentRecord, CompanyState, DocRecord, HireInput, MailInput,
  MessageRecord, Permissions, ProjectRecord, ScheduleInput, ScheduleRecord, TaskInput,
  TaskRecord, TaskStatus, WorklogRecord,
} from '../shared/wire.ts'
import type { CompanyDomainHandle } from './domain.ts'
import { displayPath, employeeDir, safeJoin, type CompanyPaths } from './paths.ts'
import { describe } from './driver.ts'

/** 动作发起者。 */
export interface Actor {
  type: 'board' | 'agent' | 'system'
  id: string
  name: string
}

/** 董事会（用户）发起者。 */
export const BOARD: Actor = { type: 'board', id: 'board', name: '董事会' }

/** 系统发起者。 */
export const SYSTEM: Actor = { type: 'system', id: 'system', name: '系统' }

/** 服务依赖。 */
export interface ServiceDeps {
  ctx: Context
  domain: CompanyDomainHandle
  paths: CompanyPaths
  config: {
    tickMs: number
    defaultDailyTokenCap: number
    /** CEO 每日 token 上限。 */
    ceoDailyTokenCap: number
    approvalsRequired: string[]
    timeZone: string
    companyName: string
    /** 汇报投递模式：digest = CEO 转成简报；record = 只归档 + 面板未读，不叫醒任何 agent。 */
    reportDelivery: 'digest' | 'record'
    /** 精简提示词：不把动态清单塞进系统提示词（保前缀缓存）。 */
    compactPrompt: boolean
    /** 执行会话形态：per-task 每个任务一个会话；resident 常驻工位。 */
    taskSession: 'per-task' | 'resident'
    /** 任务执行会话超时小时数（0 = 不超时）。 */
    taskSessionTimeoutHours: number
  }
  /** 向某员工的会话投递一条消息。 */
  deliver: (record: AgentRecord, text: string, notice?: string) => Promise<void>
  /** 向某项目群频道投递一条消息。 */
  deliverChannel: (project: ProjectRecord, text: string, notice?: string) => Promise<void>
  /** 向某任务的执行会话投递一条消息（per-task 模式）。 */
  deliverTask: (task: TaskRecord, employee: AgentRecord, text: string) => Promise<void>
  /** 停止某任务的执行会话（会话保留、可 resume）。 */
  stopTask: (taskId: string) => Promise<void>
  /** 只在 agent 空闲时停（true = 已停，false = 还在忙）。 */
  stopTaskIfIdle: (taskId: string) => Promise<boolean>
  /** 往任意会话投递一条通知（回投汇报给派发它的会话）。 */
  deliverToSession: (sessionId: string, text: string, notice?: string) => Promise<void>
  /** 确保某个项目群会话就绪（新建项目后立即调用，省得等下次启动）。 */
  ensureChannel: (project: ProjectRecord) => Promise<void>
  /** 预热大厅与项目群会话（reconcile 用；仅启用时调用）。 */
  warmChannels: () => Promise<void>
  /** 把已存在员工会话的标题归位为「姓名 · 职位」。 */
  fixTitles: () => Promise<void>
  /** 读包内 agents/ 目录的岗位说明书。 */
  readBundledPersona: (file: string) => Promise<string>
  /** 停用单个驻留员工（改状态/离职时）。 */
  stopResident: (agentId: string) => Promise<void>
  /** 停用全部驻留员工。 */
  stopAllResidents: () => Promise<void>
  /** 当前驻留员工 id。 */
  residentIds: () => string[]
  /** 诊断日志。 */
  log: (message: string) => void
}

const DEFAULT_PERMISSIONS: Permissions = {
  projects: { '*': 'read' },
  tools: [],
  canHire: false,
  canApprove: false,
  canDispatch: false,
}

/** 信箱每个 tick 最多投递条数（避免一次唤醒风暴）。 */
const DELIVERIES_PER_TICK = 4

/** 审计日志保留条数。 */
const ACTIVITY_KEEP = 800

/** 一人公司服务。 */
export class CompanyService {
  /** 会话轮次开始时间（估算工时）。 */
  private readonly turnStarted = new Map<string, number>()
  /** 会话归属缓存（sessionId → 员工 id / null）。 */
  private readonly ownerCache = new Map<string, string | null>()
  private timer: (() => void) | undefined
  private ticking = false
  private lastError: string | null = null
  /**
   * 领域写入序号：每次 domain/changed 递增，作为快照指纹的一部分。
   * 只靠「数量 + 时间戳」会漏掉不改变这两者的写入（例如排程暂停）。
   */
  private writeSeq = 0
  /** 待停止的执行会话（任务已收尾，等 agent 空闲后由 tick 停）。 */
  private readonly stopRequested = new Set<string>()

  constructor(private readonly deps: ServiceDeps) {}

  /** 领域写入后由 host 层调用，推进指纹。 */
  bumpRevision(): void {
    this.writeSeq += 1
  }

  /**
   * 会话 → 公司角色。**任何恢复路径都要用它**：平台自己 resume（例如你在一个已停止的
   * 任务会话里发消息）也必须补上公司工具与岗位提示词，否则那个会话会退化成普通 agent
   * （踩过：CEO 大厅被裸组合，company_* 全部 unknown tool）。
   * @param sessionId - 会话 id。
   * @returns 角色与归属，非公司会话返回 undefined。
   */
  companyRoleOf(sessionId: string):
    | { kind: 'hall'; agentId: string }
    | { kind: 'channel'; agentId: string; projectId: string }
    | { kind: 'employee'; agentId: string }
    | { kind: 'task'; agentId: string; taskId: string }
    | undefined {
    const ceo = this.ceo()
    if (ceo !== undefined && ceo.sessionId === sessionId) return { kind: 'hall', agentId: ceo.id }
    const channel = this.projects().find((project) => project.channelSessionId === sessionId)
    if (channel !== undefined) return { kind: 'channel', agentId: ceo?.id ?? 'agt_ceo', projectId: channel.id }
    const record = this.agents().find((entry) => entry.sessionId === sessionId)
    if (record !== undefined) return record.role === 'ceo' ? { kind: 'hall', agentId: record.id } : { kind: 'employee', agentId: record.id }
    const task = this.tasks().find((entry) => entry.sessionId === sessionId)
    if (task !== undefined && task.assigneeId !== null) return { kind: 'task', agentId: task.assigneeId, taskId: task.id }
    return undefined
  }

  /**
   * 公司协作协议文本：**按角色分开**——CEO（有派活权）与员工读到的不是同一份。
   * 踩过的坑：早先共用一份，里面写着「不要给别人派活」，CEO 读到后以为自己失去了派活权。
   * @param agentId - 读协议的 agent。
   */
  protocolText(agentId: string): string {
    const canDispatch = this.mayDispatch({ type: 'agent', id: agentId, name: this.agent(agentId)?.name ?? agentId })
    return canDispatch ? CEO_PROTOCOL : EMPLOYEE_PROTOCOL
  }

  /**
   * 能否给他人派活/建任务/自我排程：董事会永远可以；agent 需要 canDispatch
   * （默认只有 CEO）。这是「工作只由董事会分发」的闸门。
   */
  mayDispatch(actor: Actor): boolean {
    if (actor.type !== 'agent') return true
    const record = this.agent(actor.id)
    if (record === undefined) return false
    return record.role === 'ceo' || record.permissions.canDispatch === true
  }

  // ───────────────────────────── 总开关 ─────────────────────────────

  /** 公司模式是否启用。 */
  get enabled(): boolean {
    return this.deps.domain.global.get().enabled
  }

  /** 公司显示名。 */
  get companyName(): string {
    return this.deps.domain.global.get().companyName
  }

  /** 最近一次 tick 的错误（供面板诊断）。 */
  get health(): string | null {
    return this.lastError
  }

  /**
   * 启停公司模式。关闭时立即停止调度与投递并卸载常驻员工；数据与会话原样保留，
   * 重新打开即恢复（这就是「随时回到正常模式」的开关）。
   * @param on - true 启用，false 停用。
   */
  async setEnabled(on: boolean): Promise<ActionResult<{ enabled: boolean }>> {
    const current = this.enabled
    if (current === on) return { ok: true, data: { enabled: on } }
    await this.deps.domain.global.set({ ...this.deps.domain.global.get(), enabled: on })
    if (on) {
      this.startTimers()
      await this.enqueueSystemNotice('公司模式已启用。')
    } else {
      this.stopTimers()
      await this.deps.stopAllResidents()
    }
    await this.log(BOARD, on ? 'company.enable' : 'company.disable', on ? '启用公司模式' : '停用公司模式')
    return { ok: true, data: { enabled: on } }
  }

  /** 启动 tick 定时器（幂等）。 */
  startTimers(): void {
    if (this.timer !== undefined) return
    if (!this.enabled) return
    this.timer = this.deps.ctx.setInterval(() => {
      void this.tick()
    }, Math.max(5_000, this.deps.config.tickMs))
  }

  /** 停止 tick 定时器。 */
  stopTimers(): void {
    this.timer?.()
    this.timer = undefined
  }

  /** 一个调度周期：推进排程、投递信箱。 */
  async tick(): Promise<{ schedules: number; delivered: number }> {
    if (this.ticking || !this.enabled) return { schedules: 0, delivered: 0 }
    this.ticking = true
    try {
      const schedules = await this.fireDueSchedules()
      const delivered = await this.deliverPending()
      await this.sweepTaskSessions()
      this.lastError = null
      return { schedules, delivered }
    } catch (error) {
      this.lastError = describe(error)
      this.deps.log(`公司 tick 失败：${this.lastError}`)
      return { schedules: 0, delivered: 0 }
    } finally {
      this.ticking = false
    }
  }

  // ───────────────────────────── 名册 ─────────────────────────────

  /** 全部员工。 */
  agents(): AgentRecord[] {
    return [...this.deps.domain.table('agents').entries()].map(([, record]) => record)
  }

  /** 单个员工。 */
  agent(id: string): AgentRecord | undefined {
    return this.deps.domain.table('agents').get(id)
  }

  /**
   * 记录某员工会话已建立（首次创建后由驱动器回写）。
   * @param id - 员工 id。
   */
  async markProvisioned(id: string): Promise<void> {
    const record = this.agent(id)
    if (record === undefined || record.provisionedAt !== null) return
    await this.deps.domain.table('agents').put(id, { ...record, provisionedAt: Date.now() })
  }

  /** 项目群会话建好后回写项目记录。 */
  async markChannel(projectId: string, sessionId: string): Promise<void> {
    const project = this.deps.domain.table('projects').get(projectId)
    if (project === undefined || project.channelSessionId !== null) return
    await this.deps.domain.table('projects').put(projectId, { ...project, channelSessionId: sessionId })
    await this.log(SYSTEM, 'channel.create', `项目群会话 ${sessionId}（${project.name}）`)
  }

  /** 大厅（CEO 工位）提示词段。 */
  hallPrompt(): string {
    const ceo = this.ceo()
    if (ceo === undefined) return ''
    const openTasks = this.tasks()
      .filter((task) => task.status !== 'done' && task.status !== 'cancelled')
      .map((task) => `- [${task.status}] ${task.title}（${task.id}）→ ${this.agentNameOf(task.assigneeId ?? '')}`)
      .join('\n')
    const colleagues = this.agents()
      .filter((record) => record.status !== 'terminated' && record.id !== ceo.id)
      .map((record) => `${record.name}（${record.title}，id=${record.id}，负责：${this.projectsOf(record.id).map((project) => project.name).join('、') || '待分配'}）`)
      .join('；')
    return [
      '# 你的岗位（一人公司 · 大厅）',
      `你是「${ceo.name}」，首席执行官。这里是公司大厅：董事会的指令与跨公司事务在这里发生。`,
      ceo.persona.trim() === '' ? '' : `## 岗位说明书\n${ceo.persona.trim()}`,
      `## 名册\n${colleagues === '' ? '（暂无员工）' : colleagues}`,
      this.deps.config.compactPrompt
        ? '## 全公司未完成任务\n用 `company_task_list`（scope=all）查——不内联进提示词，避免每轮都让上下文缓存失效。'
        : `## 全公司未完成任务\n${openTasks === '' ? '（无）' : openTasks}`,
      '## @ 即派活：出现 `@员工名` + 指令 = 董事会点名派活，直接用 company_dispatch 建任务并投递，不要反问、不要只回「好的」。\n## 工作方式：董事会说什么，你就拆解 → company_dispatch 分派 → 跟踪 → 结果用 company_announce 写成简报。\n## 你有派活权：company_dispatch / company_task_create / company_schedule_create 对你开放，**员工没有这些权力**（帮助文本里「不要给别人派活」那条是写给员工的）。\n## 派活权边界（重要）：你只能执行**董事会当次的明确指令**。不要凭旧审批、旧计划或自己的判断给员工派活；不要自动给新员工安排入职任务——那也要先问董事会。开工前先确认「董事会这次让我做什么」；没有指令就不动。\n## 输出纪律：收到【转投】类通知时，你的整条回复就是简报正文本身——不要复述、不要评论、不要打招呼。招人走 company_hire_request（董事会批准后系统自动入职；没有人事权，别假装已经招到人，也别给不存在的员工派活）。',
    ].filter((section) => section !== '').join('\n\n')
  }

  /** 项目群（CEO 项目实例）提示词段。 */
  channelPrompt(projectId: string): string {
    const project = this.deps.domain.table('projects').get(projectId)
    if (project === undefined) return ''
    const ceo = this.ceo()
    const team = this.agents()
      .filter((record) => record.status !== 'terminated' && record.projectIds.includes(projectId))
      .map((record) => `${record.name}（${record.title}，id=${record.id}）`)
      .join('；')
    const openTasks = this.tasks()
      .filter((task) => task.projectId === projectId && task.status !== 'done' && task.status !== 'cancelled')
      .map((task) => `- [${task.status}] ${task.title}（${task.id}）→ ${this.agentNameOf(task.assigneeId ?? '')}`)
      .join('\n')
    const docs = this.docs(projectId)
      .map((doc) => `- ${doc.title}（${doc.id}，${doc.path}）`)
      .join('\n')
    return [
      `# 项目群 · ${project.name}`,
      `你是${ceo === undefined ? '公司 CEO' : `「${ceo.name}」`}在这个项目群的实例。${project.description}`,
      project.repoPath === null ? '' : `代码仓库：${project.repoPath}`,
      `## 项目团队\n${team === '' ? '（暂无）' : team}`,
      this.deps.config.compactPrompt
        ? '## 项目未完成任务\n用 `company_task_list` 查（不内联：动态清单会破坏前缀缓存）。'
        : `## 项目未完成任务\n${openTasks === '' ? '（无）' : openTasks}`,
      this.deps.config.compactPrompt
        ? '## 项目档案\n用 `company_doc_list` 查（不内联）。'
        : `## 项目档案\n${docs === '' ? '（暂无）' : docs}`,
      '## 你有派活权：company_dispatch / company_task_create 对你开放（员工没有）。\n## 边界：只执行董事会当次的明确指令——不要凭旧计划自动派活。\n## @ 即派活：本群出现 `@员工名` + 指令（例如「@陆遥 把横幅下线」）= 董事会点名派活，**立即用 company_dispatch 建任务并投递**，不要反问、不要只回一句「好的」；被 @ 的人即使不在本项目团队里也照派（董事会指定），在任务评论里记一句归属即可。\n## 你的两条职责：1）用户在本群说的话 = 对该项目下指令，拆活、用 company_dispatch 派给团队成员、跟踪到出结果；2）收到【下属汇报】/【播报任务】通知时，**只输出简报正文**（先结论后细节，markdown）：不要复述指令、不要评论、不要打招呼、不要加「收到」之类的回应、不要调用工具——你的整条回复就是给董事会看的那份简报。',
    ].filter((section) => section !== '').join('\n\n')
  }

  /** 按会话 id 反查员工（工作日志折叠用）。 */
  agentBySession(sessionId: string): AgentRecord | undefined {
    return this.agents().find((record) => record.sessionId === sessionId)
  }

  /** 某员工的直接下属。 */
  reports(id: string): AgentRecord[] {
    return this.agents().filter((record) => record.managerId === id)
  }

  /** 汇报线文本（如「董事会 → CTO → 你」）。 */
  chainOf(id: string): string {
    const names: string[] = []
    let cursor: AgentRecord | undefined = this.agent(id)
    const guard = new Set<string>()
    while (cursor !== undefined && !guard.has(cursor.id)) {
      guard.add(cursor.id)
      names.unshift(cursor.name)
      cursor = cursor.managerId === null ? undefined : this.agent(cursor.managerId)
    }
    return ['董事会', ...names].join(' → ')
  }

  /**
   * 招聘一名员工：写入名册、建目录与角色说明书，返回记录（由调用方决定是否
   * 立即启动会话）。
   * @param input - 入职输入。
   */
  async hire(input: HireInput): Promise<ActionResult<AgentRecord>> {
    const name = input.name.trim()
    if (name === '') return { ok: false, code: 'invalid_name', message: '员工名称不能为空' }
    if (this.agents().some((record) => record.name === name)) {
      return { ok: false, code: 'duplicate_name', message: `已存在同名员工「${name}」` }
    }
    if (input.managerId !== null && this.agent(input.managerId) === undefined) {
      return { ok: false, code: 'unknown_manager', message: `汇报对象 ${input.managerId} 不存在` }
    }
    const id = `agt_${randomUUID().slice(0, 8)}`
    const now = Date.now()
    const record: AgentRecord = {
      id,
      name,
      title: input.title.trim() === '' ? input.role.trim() : input.title.trim(),
      role: input.role.trim() === '' ? 'staff' : input.role.trim(),
      managerId: input.managerId,
      projectIds: input.projectIds ?? [],
      presetId: input.presetId,
      persona: input.persona,
      provider: input.provider,
      model: input.model,
      effort: input.effort,
      sessionId: `ses_${randomUUID()}`,
      cwd: employeeDir(this.deps.paths, id),
      provisionedAt: null,
      status: 'active',
      // 新员工默认无派活/建任务/自我排程权（工作只由董事会分发）
      permissions: { ...DEFAULT_PERMISSIONS, canDispatch: false, ...(input.permissions ?? {}) },
      dailyTokenCap: input.dailyTokenCap ?? this.deps.config.defaultDailyTokenCap,
      // 只在真给了数字时锁定；留空 = 用部署默认且不锁定（以后调默认值仍会跟随）
      budgetPinned: input.dailyTokenCap !== undefined && input.dailyTokenCap !== null,
      createdAt: now,
      updatedAt: now,
    }
    await mkdir(record.cwd, { recursive: true })
    await writeFile(join(record.cwd, 'AGENTS.md'), renderRoleBrief(record, this), 'utf8')
    await this.deps.domain.table('agents').put(id, record)
    await this.log(BOARD, 'agent.hire', `招聘 ${record.name}（${record.title}），汇报 ${this.chainOf(id)}`)
    return { ok: true, data: record }
  }

  /**
   * 修改员工记录（含启停与权限）。
   * @param id - 员工 id。
   * @param patch - 待改字段。
   */
  async patchAgent(id: string, patch: AgentPatch): Promise<ActionResult<AgentRecord>> {
    const record = this.agent(id)
    if (record === undefined) return { ok: false, code: 'unknown_agent', message: `员工 ${id} 不存在` }
    const next: AgentRecord = {
      ...record,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.managerId !== undefined ? { managerId: patch.managerId } : {}),
      ...(patch.presetId !== undefined ? { presetId: patch.presetId } : {}),
      ...(patch.persona !== undefined ? { persona: patch.persona } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.permissions !== undefined ? { permissions: patch.permissions } : {}),
      ...(patch.dailyTokenCap !== undefined ? { dailyTokenCap: patch.dailyTokenCap, budgetPinned: true } : {}),
      updatedAt: Date.now(),
    }
    if (next.managerId === id) return { ok: false, code: 'self_manager', message: '不能向自己汇报' }
    if (next.managerId !== null && this.agent(next.managerId) === undefined) {
      return { ok: false, code: 'unknown_manager', message: `汇报对象 ${next.managerId} 不存在` }
    }
    await this.deps.domain.table('agents').put(id, next)
    if (patch.status !== undefined && patch.status !== 'active') await this.deps.stopResident(id)
    await this.log(BOARD, 'agent.patch', `更新员工 ${next.name}${patch.status !== undefined ? ` → ${patch.status}` : ''}`)
    return { ok: true, data: next }
  }

  /** 让某员工离职（记录保留为 terminated，会话与数据不动）。 */
  async terminate(id: string): Promise<ActionResult<AgentRecord>> {
    return this.patchAgent(id, { status: 'terminated' })
  }

  // ───────────────────────────── 信箱 ─────────────────────────────

  /** 信箱消息（可按收件人过滤）。 */
  messages(filter: { toId?: string; limit?: number } = {}): MessageRecord[] {
    const all = [...this.deps.domain.table('messages').entries()]
      .map(([, record]) => record)
      .filter((record) => filter.toId === undefined || record.toId === filter.toId)
      .sort((a, b) => b.createdAt - a.createdAt)
    return filter.limit === undefined ? all : all.slice(0, filter.limit)
  }

  /**
   * 投递一条信箱消息（内部或工具入口）。agent 收件人走会话投递，董事会收件人
   * 只入站等待面板查看。
   * @param from - 发件人。
   * @param input - 收件人、类型与正文。
   */
  async sendMail(from: Actor, input: MailInput): Promise<ActionResult<MessageRecord>> {
    const channelId = input.toId.startsWith('channel:') ? input.toId.slice('channel:'.length) : input.toId
    const project = this.deps.domain.table('projects').get(channelId)
    const agent = this.agent(input.toId)
    const to = input.toId === 'board' || input.toId === 'user'
      ? { type: 'board' as const }
      : agent !== undefined
        ? { type: 'agent' as const }
        : project !== undefined
          ? { type: 'channel' as const }
          : undefined
    if (to === undefined) {
      return { ok: false, code: 'unknown_recipient', message: `收件人 ${input.toId} 不存在（既不是员工也不是项目群）` }
    }
    const now = Date.now()
    const record: MessageRecord = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      fromType: from.type,
      fromId: from.id,
      fromName: from.name,
      toType: to.type,
      toId: to.type === 'board' ? 'board' : to.type === 'channel' ? channelId : input.toId,
      kind: input.kind,
      taskId: input.taskId ?? null,
      body: input.body,
      status: 'pending',
      createdAt: now,
      deliveredAt: null,
    }
    await this.deps.domain.table('messages').put(record.id, record)
    const targetName = to.type === 'board' ? '董事会' : to.type === 'channel' ? `${project!.name}·项目群` : agent!.name
    await this.log(from, `mail.${input.kind}`, `致 ${targetName}：${excerpt(input.body)}`)
    if (this.enabled) void this.tick()
    return { ok: true, data: record }
  }

  /**
   * 读一封信箱消息的完整正文（信箱列表只给摘要，避免 CEO 为了看全文去翻磁盘）。
   * @param id - 消息 id。
   */
  async readMail(id: string): Promise<ActionResult<MessageRecord>> {
    const record = this.deps.domain.table('messages').get(id)
    if (record === undefined) return { ok: false, code: 'unknown_message', message: `消息 ${id} 不存在` }
    return { ok: true, data: record }
  }

  /** 把董事会信箱里所有未读标记为已读（面板「全部已读」）。 */
  async markAllBoardRead(): Promise<ActionResult<{ count: number }>> {
    let count = 0
    for (const record of this.messages()) {
      if (record.toType !== 'board' || record.status === 'read') continue
      await this.deps.domain.table('messages').put(record.id, { ...record, status: 'read' })
      count += 1
    }
    if (count > 0) await this.log(BOARD, 'mail.read-all', `董事会信箱：${count} 封标记已读`)
    return { ok: true, data: { count } }
  }

  /** 远程：标记单封已读（Remote：markMessageRead）。 */
  async markMessageReadRemote(id: string): Promise<ActionResult<MessageRecord>> {
    return this.markRead(id)
  }

  /** 远程：全部已读（Remote：markAllBoardRead）。 */
  async markAllBoardReadRemote(): Promise<ActionResult<{ count: number }>> {
    return this.markAllBoardRead()
  }

  /** 标记消息已读。 */
  async markRead(id: string): Promise<ActionResult<MessageRecord>> {
    const record = this.deps.domain.table('messages').get(id)
    if (record === undefined) return { ok: false, code: 'unknown_message', message: `消息 ${id} 不存在` }
    const next: MessageRecord = { ...record, status: 'read' }
    await this.deps.domain.table('messages').put(id, next)
    return { ok: true, data: next }
  }

  /** 把待投递消息送进收件人会话；董事会消息只标记为已入站。 */
  private async deliverPending(): Promise<number> {
    const pending = [...this.deps.domain.table('messages').entries()]
      .map(([, record]) => record)
      .filter((record) => record.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt)
    let delivered = 0
    for (const record of pending) {
      if (delivered >= DELIVERIES_PER_TICK) break
      if (record.toType === 'board') {
        await this.deps.domain.table('messages').put(record.id, { ...record, status: 'delivered', deliveredAt: Date.now() })
        delivered += 1
        continue
      }
      if (record.toType === 'channel') {
        const project = this.deps.domain.table('projects').get(record.toId)
        if (project === undefined) {
          await this.deps.domain.table('messages').put(record.id, { ...record, status: 'read' })
          continue
        }
        try {
          await this.deps.deliverChannel(
            project,
            renderChannelFrame(record, this.taskLabel(record.taskId), this.agentNameOf(record.fromId)),
            `${this.agentNameOf(record.fromId)} 的汇报已转投（${excerpt(record.body)}）`,
          )
          await this.deps.domain.table('messages').put(record.id, { ...record, status: 'delivered', deliveredAt: Date.now() })
          delivered += 1
        } catch (error) {
          this.lastError = describe(error)
          this.deps.log(`投递消息 ${record.id} 到项目群 ${project.name} 失败：${this.lastError}`)
        }
        continue
      }
      // 兜底：任何「自己发给自己」的消息都不投递（避免自唤醒回声环）
      if (record.fromType === 'agent' && record.fromId === record.toId) {
        await this.deps.domain.table('messages').put(record.id, { ...record, status: 'read' })
        await this.log(SYSTEM, 'mail.self-skip', `跳过自投递（${record.fromName} → 自己）`)
        continue
      }
      const recipient = this.agent(record.toId)
      if (recipient === undefined) {
        await this.deps.domain.table('messages').put(record.id, { ...record, status: 'read' })
        continue
      }
      if (recipient.status !== 'active') continue
      const budget = this.budgetExceeded(recipient)
      if (budget !== null) {
        await this.deps.domain.table('messages').put(record.id, { ...record, status: 'read' })
        await this.notifyBudget(recipient, budget)
        continue
      }
      try {
        const body = record.kind === 'announce'
          ? renderChannelFrame(record, this.taskLabel(record.taskId), this.agentNameOf(record.fromId))
          : renderMail(record, this.taskLabel(record.taskId))
        const notice = record.kind === 'announce'
          ? `${this.agentNameOf(record.fromId)} 的播报已转投（${excerpt(record.body)}）`
          : undefined
        await this.deps.deliver(recipient, body, notice)
        await this.deps.domain.table('messages').put(record.id, { ...record, status: 'delivered', deliveredAt: Date.now() })
        delivered += 1
      } catch (error) {
        this.lastError = describe(error)
        this.deps.log(`投递消息 ${record.id} 给 ${recipient.name} 失败：${this.lastError}`)
      }
    }
    return delivered
  }

  private async enqueueSystemNotice(body: string): Promise<void> {
    const now = Date.now()
    const record: MessageRecord = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      fromType: 'system', fromId: 'system', fromName: '系统',
      toType: 'board', toId: 'board', kind: 'system', taskId: null,
      body, status: 'pending', createdAt: now, deliveredAt: null,
    }
    await this.deps.domain.table('messages').put(record.id, record)
  }

  // ───────────────────────────── 任务 ─────────────────────────────

  /** 任务列表。 */
  tasks(filter: { assigneeId?: string; status?: TaskStatus } = {}): TaskRecord[] {
    return [...this.deps.domain.table('tasks').entries()]
      .map(([, record]) => record)
      .filter((record) => (filter.assigneeId === undefined || record.assigneeId === filter.assigneeId)
        && (filter.status === undefined || record.status === filter.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** 任务评论。 */
  comments(taskId?: string): CommentRecord[] {
    return [...this.deps.domain.table('comments').entries()]
      .map(([, record]) => record)
      .filter((record) => taskId === undefined || record.taskId === taskId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * 建任务并唤醒负责人。
   * @param creator - 建者。
   * @param input - 任务输入。
   */
  async createTask(creator: Actor, input: TaskInput): Promise<ActionResult<TaskRecord>> {
    if (!this.mayDispatch(creator)) {
      return {
        ok: false,
        code: 'no_dispatch_permission',
        message: '工作由董事会分发：你不能自己建任务（也不能给别人建）。把建议写进 company_report（做了什么/建议做什么/为什么），等董事会派发。',
      }
    }
    const title = input.title.trim()
    if (title === '') return { ok: false, code: 'invalid_title', message: '任务标题不能为空' }
    if (input.assigneeId != null && this.agent(input.assigneeId) === undefined) {
      return { ok: false, code: 'unknown_assignee', message: `负责人 ${input.assigneeId} 不存在` }
    }
    const now = Date.now()
    const id = `tsk_${randomUUID().slice(0, 8)}`
    const record: TaskRecord = {
      id, title,
      desc: input.desc ?? '',
      assigneeId: input.assigneeId ?? null,
      creatorType: creator.type, creatorId: creator.id,
      parentTaskId: input.parentTaskId ?? null,
      projectId: input.projectId ?? null,
      status: 'todo',
      priority: input.priority ?? 0,
      dueAt: input.dueAt ?? null,
      checkoutBy: null, checkoutAt: null, result: null,
      sessionId: this.deps.config.taskSession === 'per-task' && input.assigneeId != null ? `ses_${randomUUID()}` : null,
      dispatcherName: creator.name,
      parentSessionId: input.parentSessionId ?? this.ceo()?.sessionId ?? null,
      createdAt: now, updatedAt: now, doneAt: null,
    }
    await this.deps.domain.table('tasks').put(id, record)
    await this.log(creator, 'task.create', `任务「${title}」→ ${this.assigneeName(record)}`)

    if (record.assigneeId !== null) {
      const frame = renderTaskDispatch(record, this)
      const assignee = this.agent(record.assigneeId)
      if (this.deps.config.taskSession === 'per-task' && assignee !== undefined && record.sessionId !== null) {
        // 一次性执行会话：每任务一个会话，跑完即停。留一条已投递的信箱记录便于审计/面板查看。
        const mail: MessageRecord = {
          id: `msg_${randomUUID().slice(0, 8)}`,
          fromType: creator.type, fromId: creator.id, fromName: creator.name,
          toType: 'agent', toId: record.assigneeId, kind: 'task_notice', taskId: id,
          body: frame, status: 'delivered', createdAt: now, deliveredAt: now,
        }
        await this.deps.domain.table('messages').put(mail.id, mail)
        try {
          await this.deps.deliverTask(record, assignee, frame)
        } catch (error) {
          const message = describe(error)
          this.lastError = `任务会话创建失败：${message}`
          this.deps.log(`任务 ${id} 的执行会话创建失败：${message}`)
          await this.deps.domain.table('messages').put(mail.id, { ...mail, status: 'pending', deliveredAt: null })
        }
      } else {
        await this.sendMail(creator.type === 'agent' ? creator : BOARD, {
          toId: record.assigneeId,
          kind: 'task_notice',
          body: frame,
          taskId: id,
        })
      }
    }
    return { ok: true, data: record }
  }

  /**
   * 更新任务：认领、改状态、写结果、改派。
   * @param actor - 调用者。
   * @param id - 任务 id。
   * @param patch - 待改字段。
   */
  async updateTask(actor: Actor, id: string, patch: {
    status?: TaskStatus
    result?: string
    assigneeId?: string | null
    priority?: number
    checkout?: boolean
  }): Promise<ActionResult<TaskRecord>> {
    const record = this.deps.domain.table('tasks').get(id)
    if (record === undefined) return { ok: false, code: 'unknown_task', message: `任务 ${id} 不存在` }
    if (actor.type === 'agent') {
      const isAssignee = record.assigneeId === actor.id
      const isManager = record.assigneeId !== null && this.agent(record.assigneeId)?.managerId === actor.id
      if (!isAssignee && !isManager) {
        return { ok: false, code: 'forbidden', message: '只有负责人或直属上级能更新该任务' }
      }
    }
    const now = Date.now()
    const next: TaskRecord = {
      ...record,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
      ...(patch.checkout === true
        ? { checkoutBy: actor.id, checkoutAt: now, status: patch.status ?? (record.status === 'todo' ? 'in_progress' : record.status) }
        : {}),
      updatedAt: now,
      ...(patch.status === 'done' ? { doneAt: now } : {}),
    }
    await this.deps.domain.table('tasks').put(id, next)
    await this.log(actor, `task.${patch.status ?? (patch.checkout === true ? 'checkout' : 'update')}`, `任务「${next.title}」`)
    // 一次性执行会话：收尾（review/done/cancelled）后停掉会话，释放常驻位。
    // **只登记、不当场停**——这个调用可能来自该会话自己的轮次，而 dispose() 会等
    // 轮次结束，当场 await 必然死锁（工具等轮次、轮次等工具）。由 tick 在 agent
    // 空闲后真正停掉；会话本体保留在盘上，董事会随时可重新打开。
    if (next.sessionId !== null && (next.status === 'done' || next.status === 'cancelled' || next.status === 'review')) {
      this.stopRequested.add(next.id)
    }
    if (patch.status === 'done') await this.closeParentIfDone(next)
    if (patch.assigneeId !== undefined && patch.assigneeId !== record.assigneeId && patch.assigneeId !== null) {
      await this.sendMail(actor, {
        toId: patch.assigneeId,
        kind: 'task_notice',
        body: renderTaskDispatch(next, this),
        taskId: id,
      })
    }
    return { ok: true, data: next }
  }

  /** 追加任务评论（协作讨论）。 */
  async commentTask(actor: Actor, taskId: string, text: string): Promise<ActionResult<CommentRecord>> {
    const task = this.deps.domain.table('tasks').get(taskId)
    if (task === undefined) return { ok: false, code: 'unknown_task', message: `任务 ${taskId} 不存在` }
    const record: CommentRecord = {
      id: `cmt_${randomUUID().slice(0, 8)}`,
      taskId,
      authorType: actor.type,
      authorId: actor.id,
      authorName: actor.name,
      text,
      createdAt: Date.now(),
    }
    await this.deps.domain.table('comments').put(record.id, record)
    if (actor.type === 'agent' && task.assigneeId !== null && task.assigneeId !== actor.id) {
      await this.sendMail(actor, { toId: task.assigneeId, kind: 'info', body: `任务「${task.title}」有新评论：\n${text}`, taskId })
    }
    await this.log(actor, 'task.comment', `任务「${task.title}」：${excerpt(text)}`)
    return { ok: true, data: record }
  }

  private async closeParentIfDone(task: TaskRecord): Promise<void> {
    if (task.parentTaskId === null) return
    const parent = this.deps.domain.table('tasks').get(task.parentTaskId)
    if (parent === undefined || parent.status === 'done') return
    const siblings = this.tasks().filter((record) => record.parentTaskId === parent.id)
    if (siblings.every((record) => record.status === 'done' || record.status === 'cancelled')) {
      await this.deps.domain.table('tasks').put(parent.id, { ...parent, status: 'done', doneAt: Date.now(), updatedAt: Date.now() })
      await this.log(SYSTEM, 'task.autoclose', `子任务全部完成，父任务「${parent.title}」自动关闭`)
    }
  }

  // ───────────────────────────── 审批 ─────────────────────────────

  /** 审批列表。 */
  approvals(status?: 'pending' | 'approved' | 'rejected'): ApprovalRecord[] {
    return [...this.deps.domain.table('approvals').entries()]
      .map(([, record]) => record)
      .filter((record) => status === undefined || record.status === status)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 发起审批：按类别决定是否需要董事会裁决；上级可裁决的类别先送到上级。
   * @param requester - 发起人。
   * @param input - 审批内容。
   */
  async requestApproval(requester: Actor, input: ApprovalInput): Promise<ActionResult<ApprovalRecord>> {
    const now = Date.now()
    const record: ApprovalRecord = {
      id: `apv_${randomUUID().slice(0, 8)}`,
      kind: input.kind,
      title: input.title,
      ask: (input.ask ?? '').trim(),
      summary: (input.summary ?? '').trim(),
      detail: input.detail,
      requesterType: requester.type,
      requesterId: requester.id,
      requesterName: requester.name,
      status: 'pending',
      action: input.action ?? null,
      decidedBy: null,
      decisionNote: null,
      createdAt: now,
      decidedAt: null,
    }
    await this.deps.domain.table('approvals').put(record.id, record)
    await this.log(requester, 'approval.request', `${input.kind}：${input.title}`)
    const needsBoard = this.deps.config.approvalsRequired.includes(input.kind) || requester.type === 'board'
    const manager = requester.type === 'agent' ? this.agent(requester.id)?.managerId : null
    const decider = !needsBoard && manager !== null && manager !== undefined
      ? this.agent(manager)
      : undefined
    if (decider !== undefined && decider.permissions.canApprove) {
      await this.sendMail(requester, {
        toId: decider.id,
        kind: 'approval_request',
        body: renderApprovalAsk(record, '请你裁决'),
      })
    }
    return { ok: true, data: record }
  }

  /**
   * 裁决审批并通知发起人。
   * @param id - 审批 id。
   * @param approve - 通过/驳回。
   * @param note - 决策说明。
   */
  async decideApproval(id: string, approve: boolean, note = '', decider: Actor = BOARD): Promise<ActionResult<ApprovalRecord>> {
    const record = this.deps.domain.table('approvals').get(id)
    if (record === undefined) return { ok: false, code: 'unknown_approval', message: `审批 ${id} 不存在` }
    if (record.status !== 'pending') return { ok: false, code: 'already_decided', message: '该审批已裁决' }
    const next: ApprovalRecord = {
      ...record,
      status: approve ? 'approved' : 'rejected',
      decidedBy: decider.name,
      decisionNote: note,
      decidedAt: Date.now(),
    }
    await this.deps.domain.table('approvals').put(id, next)
    await this.log(decider, approve ? 'approval.approve' : 'approval.reject', `${record.title}`)

    // 结构化动作：批准即执行（目前支持 hire）
    let outcome = ''
    if (approve && next.action !== null) {
      const executed = await this.runApprovedAction(next)
      if (executed !== null) {
        outcome = executed
        await this.deps.domain.table('approvals').put(id, {
          ...next,
          decisionNote: note === '' ? executed : `${note}｜${executed}`,
        })
      }
    }

    if (record.requesterType === 'agent' && this.agent(record.requesterId) !== undefined) {
      await this.sendMail(BOARD, {
        toId: record.requesterId,
        kind: 'approval_result',
        body: renderApprovalResult(next, note) + (outcome === '' ? '' : `\n执行结果：${outcome}`),
      })
    }
    const finalRecord = this.deps.domain.table('approvals').get(id) ?? next
    return { ok: true, data: finalRecord }
  }

  /** 执行已被批准的结构化动作；返回一行人类可读结果（失败也返回，不抛）。 */
  private async runApprovedAction(approval: ApprovalRecord): Promise<string | null> {
    const action = approval.action
    if (action === null) return null
    try {
      if (action.kind === 'hire') {
        const result = await this.hire(action.payload as HireInput)
        if (!result.ok || result.data === undefined) return `招聘执行失败：${result.message ?? result.code ?? '未知原因'}`
        return `已入职：${result.data.name}（${result.data.title}，id=${result.data.id}）`
      }
      return null
    } catch (error) {
      return `动作执行异常：${describe(error)}`
    }
  }

  // ───────────────────────────── 资料库 ─────────────────────────────

  /** 项目列表。 */
  projects(): ProjectRecord[] {
    return [...this.deps.domain.table('projects').entries()].map(([, record]) => record)
  }

  /** 资料索引。 */
  docs(projectId?: string): DocRecord[] {
    return [...this.deps.domain.table('docs').entries()]
      .map(([, record]) => record)
      .filter((record) => projectId === undefined || record.projectId === projectId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** 员工对某项目的访问级别。 */
  accessOf(agentId: string, projectId: string | null): AccessLevel {
    const record = this.agent(agentId)
    if (record === undefined) return 'none'
    if (record.permissions.canHire) return 'write'
    const direct = record.permissions.projects[projectId ?? ''] ?? record.permissions.projects['*']
    if (direct !== undefined) return direct
    if (projectId !== null && record.projectIds.includes(projectId)) return 'write'
    if (projectId === null) return 'write'
    const project = this.deps.domain.table('projects').get(projectId)
    return project?.defaultAcl ?? 'read'
  }

  /** 员工的负责项目。 */
  projectsOf(agentId: string): ProjectRecord[] {
    const record = this.agent(agentId)
    if (record === undefined) return []
    return this.projects().filter((project) => record.projectIds.includes(project.id))
  }

  /** CEO 名册记录（role = 'ceo'）；没有返回 undefined。 */
  ceo(): AgentRecord | undefined {
    return this.agents().find((record) => record.role === 'ceo')
  }

  /** 判断一个会话是否属于公司（员工工位 / 大厅 / 项目群）。 */
  isCompanySession(sessionId: string): boolean {
    if (this.companyRoleOf(sessionId) !== undefined) return true
    // 已收尾的任务会话也仍属公司（任务记录里留着 sessionId）——否则会被当成董事会的
    // 普通会话注入 company_call，等于让员工拿到派活工具（越权）。
    return this.tasks().some((task) => task.sessionId === sessionId)
  }

  /**
   * 建项目（含目录）。
   * @param actor - 建者。
   * @param input - 名称与说明。
   */
  async createProject(actor: Actor, input: {
    name: string
    description?: string
    acl?: Record<string, AccessLevel>
    defaultAcl?: AccessLevel
    repoPath?: string | null
  }): Promise<ActionResult<ProjectRecord>> {
    const name = input.name.trim()
    if (name === '') return { ok: false, code: 'invalid_name', message: '项目名不能为空' }
    if (actor.type === 'agent') {
      const record = this.agent(actor.id)
      if (record === undefined || !record.permissions.canHire) {
        return { ok: false, code: 'forbidden', message: '当前权限不允许创建项目（需申请审批）' }
      }
    }
    const id = `prj_${randomUUID().slice(0, 8)}`
    const rootPath = safeJoin(this.deps.paths.projects, id)
    await mkdir(rootPath, { recursive: true })
    const record: ProjectRecord = {
      id,
      name,
      description: input.description ?? '',
      rootPath,
      repoPath: input.repoPath ?? null,
      channelSessionId: null,
      acl: input.acl ?? {},
      defaultAcl: input.defaultAcl ?? 'read',
      createdBy: actor.name,
      createdAt: Date.now(),
    }
    await this.deps.domain.table('projects').put(id, record)
    // 让项目群会话立即就绪（不阻塞建项目）：新建项目后就能在那里派活/收汇报。
    void this.deps.ensureChannel(record).catch((error: unknown) => {
      this.deps.log(`项目群会话预建失败（${id}）：${describe(error)}`)
    })
    await this.log(actor, 'project.create', `项目「${name}」`)
    return { ok: true, data: record }
  }

  /**
   * 写资料（新建或覆盖）。
   * @param actor - 写者。
   * @param input - 项目、相对路径与内容。
   */
  async writeDoc(actor: Actor, input: {
    projectId: string | null
    path: string
    title?: string
    content: string
  }): Promise<ActionResult<DocRecord>> {
    if (actor.type === 'agent' && this.accessOf(actor.id, input.projectId) !== 'write') {
      return { ok: false, code: 'forbidden', message: '没有该资料的写权限（可用 company_approval_request 申请）' }
    }
    const base = input.projectId === null ? this.deps.paths.library : this.projectRoot(input.projectId)
    if (base === null) return { ok: false, code: 'unknown_project', message: `项目 ${input.projectId} 不存在` }
    let target: string
    try {
      target = safeJoin(base, input.path)
    } catch (error) {
      return { ok: false, code: 'invalid_path', message: describe(error) }
    }
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, input.content, 'utf8')
    const existing = this.docs().find((doc) => doc.path === displayPath(this.deps.paths.root, target))
    const record: DocRecord = {
      id: existing?.id ?? `doc_${randomUUID().slice(0, 8)}`,
      projectId: input.projectId,
      title: input.title ?? input.path,
      path: displayPath(this.deps.paths.root, target),
      tags: existing?.tags ?? [],
      createdBy: actor.name,
      updatedAt: Date.now(),
    }
    await this.deps.domain.table('docs').put(record.id, record)
    await this.log(actor, 'doc.write', `资料「${record.title}」`)
    return { ok: true, data: record }
  }

  /**
   * 读资料。
   * @param actor - 读者。
   * @param docId - 资料 id。
   */
  async readDoc(actor: Actor, docId: string): Promise<ActionResult<{ doc: DocRecord; content: string }>> {
    const doc = this.deps.domain.table('docs').get(docId)
    if (doc === undefined) return { ok: false, code: 'unknown_doc', message: `资料 ${docId} 不存在` }
    if (actor.type === 'agent' && this.accessOf(actor.id, doc.projectId) === 'none') {
      return { ok: false, code: 'forbidden', message: '没有该资料的读权限' }
    }
    const absolute = join(this.deps.paths.root, doc.path)
    try {
      const content = await readFile(absolute, 'utf8')
      return { ok: true, data: { doc, content } }
    } catch (error) {
      return { ok: false, code: 'read_failed', message: describe(error) }
    }
  }

  /** 扫描资料库目录（面板的文件树，读权限内）。 */
  async listLibraryFiles(projectId: string | null): Promise<string[]> {
    const base = projectId === null ? this.deps.paths.library : this.projectRoot(projectId)
    if (base === null) return []
    const out: string[] = []
    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
        if (entry.isDirectory()) await walk(join(dir, entry.name), relative)
        else out.push(relative)
      }
    }
    await walk(base, '')
    return out.sort()
  }

  /** 项目根目录（不存在返回 null）。 */
  private projectRoot(projectId: string): string | null {
    return this.deps.domain.table('projects').get(projectId)?.rootPath ?? null
  }

  // ───────────────────────────── 排程 ─────────────────────────────

  /** 排程列表。 */
  schedules(agentId?: string): ScheduleRecord[] {
    return [...this.deps.domain.table('schedules').entries()]
      .map(([, record]) => record)
      .filter((record) => agentId === undefined || record.agentId === agentId)
      .sort((a, b) => a.nextRunAt - b.nextRunAt)
  }

  /**
   * 新建排程（cron / every / at）。
   * @param actor - 建者。
   * @param input - 员工、种类、规格与提示词。
   */
  async createSchedule(actor: Actor, input: ScheduleInput): Promise<ActionResult<ScheduleRecord>> {
    if (actor.type === 'agent' && !this.mayDispatch(actor)) {
      return {
        ok: false,
        code: 'no_schedule_permission',
        message: '例行工作也要董事会定：不要自己排程。把「建议的周期性工作 + 周期 + 理由」写进 company_report，董事会会在面板「排程」页建。',
      }
    }
    const agent = this.agent(input.agentId)
    if (agent === undefined) return { ok: false, code: 'unknown_agent', message: `员工 ${input.agentId} 不存在` }
    const parsed = parseSchedule(input, this.deps.config.timeZone)
    if (!parsed.ok) return parsed
    const record: ScheduleRecord = {
      id: `sch_${randomUUID().slice(0, 8)}`,
      agentId: input.agentId,
      kind: input.kind,
      cron: input.kind === 'cron' ? input.spec.trim() : null,
      everySec: input.kind === 'every' ? parsed.everySec : null,
      at: input.kind === 'at' ? parsed.at : null,
      timeZone: this.deps.config.timeZone,
      prompt: input.prompt,
      enabled: true,
      nextRunAt: parsed.nextRunAt,
      lastRunAt: null,
      lastOutcome: null,
      createdAt: Date.now(),
    }
    await this.deps.domain.table('schedules').put(record.id, record)
    await this.log(actor, 'schedule.create', `${agent.name}：${describeSchedule(record)}`)
    return { ok: true, data: record }
  }

  /**
   * 暂停/恢复排程。恢复时按当前时间重算下一次触发（避免补跑历史时间点）。
   * @param id - 排程 id。
   * @param enabled - true 启用，false 暂停。
   */
  async setScheduleEnabled(id: string, enabled: boolean): Promise<ActionResult<ScheduleRecord>> {
    const record = this.deps.domain.table('schedules').get(id)
    if (record === undefined) return { ok: false, code: 'unknown_schedule', message: `排程 ${id} 不存在` }
    if (record.enabled === enabled) return { ok: true, data: record }
    const now = Date.now()
    let nextRunAt = record.nextRunAt
    if (enabled) {
      if (record.kind === 'every') nextRunAt = now + (record.everySec ?? 0) * 1000
      else if (record.kind === 'at') {
        if (record.at === null || record.at <= now) {
          return { ok: false, code: 'not_future', message: '一次性排程的目标时间已过，请删掉重建' }
        }
        nextRunAt = record.at
      } else nextRunAt = nextCron(record.cron ?? '', now, record.timeZone) ?? Number.MAX_SAFE_INTEGER
    }
    const next: ScheduleRecord = { ...record, enabled, nextRunAt, lastOutcome: enabled ? null : record.lastOutcome }
    await this.deps.domain.table('schedules').put(id, next)
    await this.log(BOARD, enabled ? 'schedule.enable' : 'schedule.pause', `${this.agentNameOf(record.agentId)}：${describeSchedule(record)}`)
    return { ok: true, data: next }
  }

  /** 远程暂停/恢复排程（Remote：setScheduleEnabled）。 */
  async setScheduleEnabledRemote(id: string, enabled: boolean): Promise<ActionResult<ScheduleRecord>> {
    return this.setScheduleEnabled(id, enabled)
  }

  /** 删除排程。 */
  async deleteSchedule(id: string): Promise<ActionResult<{ id: string }>> {
    const existing = this.deps.domain.table('schedules').get(id)
    if (existing === undefined) return { ok: false, code: 'unknown_schedule', message: `排程 ${id} 不存在` }
    await this.deps.domain.table('schedules').delete(id)
    await this.log(BOARD, 'schedule.delete', `排程 ${id}`)
    return { ok: true, data: { id } }
  }

  /** 推进到期排程并把提示词送进员工信箱。 */
  private async fireDueSchedules(): Promise<number> {
    const now = Date.now()
    let fired = 0
    for (const record of this.schedules()) {
      if (!record.enabled || record.nextRunAt > now) continue
      const agent = this.agent(record.agentId)
      if (agent === undefined || agent.status !== 'active') {
        await this.deps.domain.table('schedules').put(record.id, { ...record, enabled: false, lastOutcome: 'agent-inactive' })
        continue
      }
      const next = advance(record, now, this.deps.config.timeZone)
      await this.deps.domain.table('schedules').put(record.id, {
        ...record,
        nextRunAt: next === null ? Number.MAX_SAFE_INTEGER : next,
        enabled: next !== null,
        lastRunAt: now,
        lastOutcome: 'fired',
      })
      await this.sendMail(SYSTEM, {
        toId: agent.id,
        kind: 'task_notice',
        body: renderScheduleFire(record, new Date(now).toISOString()),
      })
      fired += 1
    }
    return fired
  }

  // ───────────────────────────── 工作日志 ─────────────────────────────

  /** 某日工作日志（date 形如 2026-09-19；省略则今天）。 */
  worklogs(date?: string): WorklogRecord[] {
    const target = date ?? this.today()
    return [...this.deps.domain.table('worklogs').entries()]
      .map(([, record]) => record)
      .filter((record) => record.date === target)
  }

  /** 今天的日期键（配置时区）。 */
  today(at = Date.now()): string {
    return dayKey(at, this.deps.config.timeZone)
  }

  /**
   * 折叠一条会话事件到工作日志（live 增量）。非名册会话的事件被忽略。
   * `session/event` 的载荷是 `(session, event)`，usage 位于
   * `assistant/message.data.message.usage`（输入/输出/缓存读/缓存写/推理）。
   * @param sessionId - 事件所属会话 id。
   * @param event - 会话事件。
   */
  async foldEvent(sessionId: string, event: { type: string; data?: unknown }): Promise<void> {
    const record = this.ownerOf(sessionId)
    if (record === undefined) return
    const at = Date.now()
    const date = this.today(at)
    const key = `${record.id}:${date}`
    const table = this.deps.domain.table('worklogs')
    const current = table.get(key) ?? emptyWorklog(key, record.id, date)
    const data = (event.data ?? {}) as Record<string, unknown>

    if (event.type === 'turn/start') {
      const turn = typeof data.turn === 'number' ? data.turn : 0
      this.turnStarted.set(`${sessionId}:${turn}`, at)
      await table.put(key, { ...current, turns: current.turns + 1, updatedAt: at })
      return
    }

    if (event.type === 'turn/end') {
      const turn = typeof data.turn === 'number' ? data.turn : 0
      const startedAt = this.turnStarted.get(`${sessionId}:${turn}`)
      this.turnStarted.delete(`${sessionId}:${turn}`)
      const elapsed = startedAt === undefined ? 0 : Math.max(0, at - startedAt)
      await table.put(key, { ...current, activeMs: current.activeMs + elapsed, updatedAt: at })
    }
  }

  /**
   * 折叠一次模型调用的 usage（`llm/stream` 旁路捕获，与事件日志解耦）。
   * @param sessionId - 产生该调用的会话 id（缺失则忽略）。
   * @param usage - 提供方上报的 token 分桶。
   */
  async foldUsage(sessionId: string | undefined, usage: {
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
  }): Promise<void> {
    if (sessionId === undefined) return
    const record = this.ownerOf(sessionId)
    if (record === undefined) return
    const at = Date.now()
    const date = this.today(at)
    const key = `${record.id}:${date}`
    const table = this.deps.domain.table('worklogs')
    const current = table.get(key) ?? emptyWorklog(key, record.id, date)
    await table.put(key, {
      ...current,
      inputTokens: current.inputTokens + (usage.inputTokens ?? 0),
      outputTokens: current.outputTokens + (usage.outputTokens ?? 0),
      cacheReadTokens: current.cacheReadTokens + (usage.cacheReadTokens ?? 0),
      cacheWriteTokens: current.cacheWriteTokens + (usage.cacheWriteTokens ?? 0),
      reasoningTokens: current.reasoningTokens + (usage.reasoningTokens ?? 0),
      sessions: current.sessions.includes(sessionId) ? current.sessions : [...current.sessions, sessionId],
      updatedAt: at,
    })
  }

  /** 今日 token 合计（按员工）。 */
  tokensToday(agentId: string): number {
    const record = this.worklogs().find((entry) => entry.agentId === agentId)
    if (record === undefined) return 0
    return record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens
  }

  private budgetExceeded(record: AgentRecord): number | null {
    if (record.dailyTokenCap === null) return null
    const used = this.tokensToday(record.id)
    return used >= record.dailyTokenCap ? used : null
  }

  private async notifyBudget(record: AgentRecord, used: number): Promise<void> {
    const body = `员工「${record.name}」今日 token 已用 ${used}，达到预算上限 ${record.dailyTokenCap}，其信箱投递已暂停至明日。`
    await this.enqueueSystemNotice(body)
    await this.log(SYSTEM, 'budget.exceeded', body)
  }

  // ───────────────────────────── 审计与快照 ─────────────────────────────

  /** 追加一条审计记录并裁剪。 */
  async log(actor: Actor, action: string, detail: string): Promise<void> {
    const table = this.deps.domain.table('activity')
    const record: ActivityRecord = {
      id: `act_${randomUUID().slice(0, 10)}`,
      at: Date.now(),
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      action,
      detail,
    }
    await table.put(record.id, record)
    const all = [...table.entries()].map(([, entry]) => entry).sort((a, b) => a.at - b.at)
    if (all.length > ACTIVITY_KEEP) {
      for (const stale of all.slice(0, all.length - ACTIVITY_KEEP)) await table.delete(stale.id)
    }
  }

  /** 面板快照。 */
  snapshot(): CompanyState {
    const today = this.today()
    const worklogs = this.worklogs(today)
    const tasks = this.tasks()
    const comments = this.comments()
    const approvals = this.approvals()
    const sum = (pick: (record: WorklogRecord) => number): number =>
      worklogs.reduce((total, record) => total + pick(record), 0)
    return {
      enabled: this.enabled,
      companyName: this.companyName,
      root: this.deps.paths.root,
      tickMs: this.deps.config.tickMs,
      now: Date.now(),
      today,
      agents: this.agents(),
      projects: this.projects(),
      docs: this.docs(),
      tasks,
      comments,
      messages: this.messages({ limit: 60 }),
      approvals,
      schedules: this.schedules(),
      worklogs,
      activity: [...this.deps.domain.table('activity').entries()]
        .map(([, record]) => record)
        .sort((a, b) => b.at - a.at)
        .slice(0, 80),
      residentIds: this.deps.residentIds(),
      reportDelivery: this.deps.config.reportDelivery,
      timeZone: this.deps.config.timeZone,
      revision: `seq:${this.writeSeq}|${revisionOf({
        agents: this.agents(),
        projects: this.projects(),
        docs: this.docs(),
        tasks,
        comments,
        messages: this.messages({ limit: 60 }),
        approvals,
        schedules: this.schedules(),
        worklogs,
      })}`,
      stats: {
        agents: this.agents().filter((record) => record.status === 'active').length,
        activeTasks: tasks.filter((record) => record.status === 'in_progress' || record.status === 'review').length,
        doneToday: tasks.filter((record) => record.status === 'done' && record.doneAt !== null && this.today(record.doneAt) === today).length,
        pendingApprovals: this.approvals('pending').length,
        unreadMail: this.messages().filter((record) => record.toType === 'board' && record.status !== 'read').length,
        tokensToday: sum((record) => record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens),
        inputToday: sum((record) => record.inputTokens),
        outputToday: sum((record) => record.outputTokens),
        cacheReadToday: sum((record) => record.cacheReadTokens),
        cacheWriteToday: sum((record) => record.cacheWriteTokens),
      },
    }
  }

  /** 员工角色提示词段（每次组装时求值）。 */
  employeePrompt(agentId: string): string {
    const record = this.agent(agentId)
    if (record === undefined) return ''
    const colleagues = this.agents()
      .filter((entry) => entry.id !== agentId && entry.status === 'active')
      .map((entry) => `${entry.name}（${entry.title}，id=${entry.id}${entry.managerId === record.id ? '，你的下属' : ''}）`)
      .join('；')
    const openTasks = this.tasks({ assigneeId: agentId })
      .filter((task) => task.status !== 'done' && task.status !== 'cancelled')
      .map((task) => `- [${task.status}] ${task.title}（${task.id}）`)
      .join('\n')
    return [
      `# 你的岗位（一人公司）`,
      `你是「${record.name}」，职位 ${record.title}，角色 ${record.role}。汇报线：${this.chainOf(agentId)}。`,
      record.persona.trim() === '' ? '' : `## 岗位说明书\n${record.persona.trim()}`,
      `## 同事通讯录\n${colleagues === '' ? '（暂无其他同事）' : colleagues}`,
      (() => {
        const owned = this.projects().filter((project) => this.canWrite(agentId, project.id))
        if (owned.length === 0) return ''
        const lines = owned.map((project) => {
          const repo = project.repoPath === null ? '' : `｜代码仓库 ${project.repoPath}`
          const docs = `｜档案目录 ${project.rootPath}`
          return `- ${project.name}（${project.id}）${repo}${docs}\n  说明：${project.description}`
        })
        return `## 你负责的项目\n${lines.join('\n')}`
      })(),
      this.deps.config.compactPrompt
        ? '## 你当前的任务\n用 `company_task_list` 查（不内联进提示词：任务每变一次就会让上下文缓存整体失效，按全价重算）。收到派活帧时以帧里的任务为准。'
        : `## 你当前的任务\n${openTasks === '' ? '（暂无待办任务）' : openTasks}`,
      [
        '## 工作纪律（必须遵守）',
        '0. **工作只由董事会分发**：你只做派到你名下的任务。不要自己建任务、不要给同事派活、不要给自己排程；手上没活就待命。想推进别的事 → 写进 `company_report` 的建议（做什么 / 为什么值得做 / 预期产出），由董事会决定派给谁。',
        '1. 一切对外沟通都走公司信箱：问同事用 `company_mail_send`，汇报用 `company_report`（它会自动落到你的上级/项目群）。不要假设对方在线。',
        '2. 领到任务先 `company_task_update`（checkout=true）认领；完成后置 status=review 并 `company_report` 汇报——简报由 CEO 转呈董事会。',
        '3. 需要花钱、上线、删数据、招人等越权动作，先 `company_approval_request`，等 `approval_result` 回来再动手。',
        '4. 需要同事的上下文时直接发 `question` 问人，讨论沉淀在任务评论里（`company_task_comment`）。',
        '5. 资料读写用 `company_doc_*`，权限不足时申请审批，不要绕过。',
        '6. 你的工作目录（cwd）就是公司给你的工位，产出文件放这里或资料库里。',
        '7. 重活开子会话：超过一轮能装下的改造/排查/批量数据活，用 `subagent` 开子会话去做，工位只做读材料、拆解、派子会话、收结果、写档案与汇报。',
      ].join('\n'),
      `公司根目录：${this.deps.paths.root}`,
    ].filter((section) => section !== '').join('\n\n')
  }

  /**
   * 收尾清理：跑太久的任务执行会话停掉（会话保留），并在任务里留一条说明。
   * 目的是避免「僵尸会话」长期占着常驻位、也让董事会一眼看到哪件事拖住了。
   */
  private async sweepTaskSessions(): Promise<void> {
    // ① 已收尾的任务：agent 一空闲就停（登记式，避免在自己轮次里死锁）
    for (const taskId of [...this.stopRequested]) {
      try {
        if (await this.deps.stopTaskIfIdle(taskId)) this.stopRequested.delete(taskId)
      } catch (error) {
        this.stopRequested.delete(taskId)
        this.deps.log(`停止任务会话失败（${taskId}）：${describe(error)}`)
      }
    }
    const hours = this.deps.config.taskSessionTimeoutHours
    if (this.deps.config.taskSession !== 'per-task' || hours <= 0) return
    const now = Date.now()
    for (const task of this.tasks()) {
      if (task.sessionId === null || task.status !== 'in_progress') continue
      const startedAt = task.checkoutAt ?? task.createdAt
      if (now - startedAt < hours * 3600_000) continue
      // 超时也要等它空闲，避免停掉一个正在收尾的轮次
      if (!(await this.deps.stopTaskIfIdle(task.id))) continue
      const comment: CommentRecord = {
        id: `cmt_${randomUUID().slice(0, 8)}`, taskId: task.id,
        authorType: 'system', authorId: 'system', authorName: '公司调度',
        text: `执行会话已超时自动停止（超过 ${hours} 小时未收尾）。任务状态保持 ${task.status}；董事会可在任务详情重新打开执行会话，或改派/关闭。`,
        createdAt: now,
      }
      await this.deps.domain.table('comments').put(comment.id, comment)
      await this.deps.domain.table('tasks').put(task.id, { ...task, updatedAt: now })
      await this.log(SYSTEM, 'task.session-timeout', `任务「${task.title}」执行会话超时停止（${hours}h）`)
    }
  }

  /**
   * 一次性任务会话的提示词：岗位身份（静态）+ 本任务 + 开工前必读的档案索引 +
   * 最近讨论 + 交活要求。
   *
   * 为什么这么设计：per-task 会话没有历史记忆，**记忆的载体是档案**——所以这里
   * 只给「要点索引 + 路径」而不是把档案正文塞进来（省 token，且让模型自己按需读）。
   */
  taskPrompt(taskId: string, agentId: string): string {
    const task = this.deps.domain.table('tasks').get(taskId)
    const employee = this.agent(agentId)
    if (task === undefined || employee === undefined) return this.employeePrompt(agentId)
    const project = task.projectId === null ? undefined : this.deps.domain.table('projects').get(task.projectId)
    const docs = this.docs(task.projectId ?? undefined)
      .slice(0, 12)
      .map((doc) => `- 《${doc.title}》 ${doc.path}`)
      .join('\n')
    const comments = this.comments(taskId)
      .slice(-5)
      .map((comment) => `- ${comment.authorName}：${comment.text.slice(0, 300)}`)
      .join('\n')
    return [
      this.employeePrompt(agentId),
      [
        '# 本次任务会话（一次性）',
        '你在这个会话里只做下面这一件事；做完就收尾，不要顺手做别的、不要给自己或他人另开任务。',
        '',
        `## 任务\n${task.title}（${task.id}，状态 ${task.status}，优先级 ${task.priority}）`,
        task.desc.trim() === '' ? '（董事长/上级没写额外说明，按岗位职责与项目档案判断验收标准，并先写清你的理解）' : `## 任务说明与验收\n${task.desc}`,
        project === undefined
          ? '## 项目\n（未关联项目：产出写进公司资料库，汇报用 company_report）'
          : `## 项目\n${project.name}（${project.id}）${project.repoPath === null ? '' : `\n代码仓库：${project.repoPath}`}\n档案目录：${project.rootPath}`,
        docs === ''
          ? '## 开工前必读\n本项目还没有档案；先 `company_doc_list` 看看有什么，再决定要不要建一份交接记录。'
          : `## 开工前必读（本项目档案，按需 company_doc_read 读全文——不要凭记忆猜）\n${docs}`,
        comments === '' ? '' : `## 最近讨论\n${comments}`,
        '## 谁派的活\n由 '
        + (task.dispatcherName === '' ? '上级' : task.dispatcherName)
        + ' 派发'
        + (task.parentSessionId === null ? '' : '（来自他/她的会话）')
        + '；完成后 `company_report` 会把结论回投到那里，同时归档进项目档案。',
        '## 交活\n1. 完成后 `company_task_update`（status=review，result 写清：改了什么 / 跑了什么验证 / 未完成项与风险）；'
        + '\n2. 产出落到项目档案（company_doc_write）或仓库文件，别只写在会话里；'
        + '\n3. `company_report` 汇报结论——它会被归档到项目《汇报流水》，不会打断别人。'
        + '\n4. 若卡住：status=blocked + result 写清卡点，company_report 上报，然后停下等董事会/上级。',
      ].join('\n\n'),
    ].filter((part) => part !== '').join('\n\n')
  }

  private assigneeName(record: TaskRecord): string {
    if (record.assigneeId === null) return '（待认领）'
    return this.agent(record.assigneeId)?.name ?? record.assigneeId
  }

  /** 任务标签（投递帧里展示关联任务）。 */
  taskLabel(taskId: string | null): string | undefined {
    if (taskId === null) return undefined
    const task = this.deps.domain.table('tasks').get(taskId)
    return task === undefined ? taskId : `${task.title}（${task.id}，状态 ${task.status}）`
  }

  /**
   * 汇报路由：任务带项目且有群 → 项目群（CEO 实例转成简报）；否则 → CEO 大厅；
   * 没有 CEO 则直达董事会。
   * @param actor - 汇报人。
   * @param body - 汇报正文。
   * @param taskId - 关联任务（可选）。
   */
  async report(actor: Actor, body: string, taskId: string | null = null): Promise<ActionResult<MessageRecord>> {
    if (this.deps.config.reportDelivery === 'record') {
      const task = taskId === null ? undefined : this.deps.domain.table('tasks').get(taskId)
      const projectId = task?.projectId ?? null
      const path = await this.appendReportLog(projectId, actor, body, taskId === null ? '汇报' : `汇报 · ${taskId}`)
      await this.log(actor, 'report.record', `${actor.name} 的汇报已归档 ${path}`)
      // 回投派发它的那个会话（董事会自己的会话 / 项目群 / 大厅）——不然派活的人看不到结果。
      const relay = await this.relayToDispatcher(task, actor, body, path)
      return this.sendMail(actor, {
        toId: 'board',
        kind: 'report',
        body: `${body}\n\n---\n已归档到 ${path}${relay}（record 模式：不叫醒非相关 agent）`,
        taskId,
      })
    }
    let toId: string | null = null
    if (taskId !== null) {
      const task = this.deps.domain.table('tasks').get(taskId)
      if (task?.projectId != null && this.deps.domain.table('projects').get(task.projectId) !== undefined) {
        toId = task.projectId
      }
    }
    if (toId === null) toId = this.ceo()?.id ?? 'board'
    // 自环防护：CEO 自己的汇报不能回投给自己（否则每轮都会自我唤醒）
    if (toId === actor.id) toId = 'board'
    return this.sendMail(actor, { toId, kind: 'report', body, taskId })
  }

  /**
   * CEO 向项目群/大厅播报简报。
   * @param actor - 发起人（通常是 CEO）。
   * @param projectId - 目标项目（null = 大厅）。
   * @param text - 简报正文（markdown）。
   */
  async announce(actor: Actor, projectId: string | null, text: string): Promise<ActionResult<MessageRecord>> {
    if (this.deps.config.reportDelivery === 'record') {
      const path = await this.appendReportLog(projectId, actor, text, '播报')
      await this.log(actor, 'announce.record', `${actor.name} 的播报已归档 ${path}`)
      return this.sendMail(actor, {
        toId: 'board',
        kind: 'announce',
        body: `${text}\n\n---\n已归档到 ${path}（汇报投递模式：record）`,
      })
    }
    const ceo = this.ceo()
    const target = projectId ?? ceo?.id ?? 'board'
    // CEO 对大厅「播报」= 就是它自己所在会话：不给自己发信（会自唤醒成回声），
    // 改为入董事会信箱留档；它当前这轮的输出本身就已经落在大厅。
    const toId = target === actor.id ? 'board' : target
    return this.sendMail(actor, { toId, kind: 'announce', body: text })
  }

  /**
   * 一步派工（建任务 + 信箱投递 + 审计）。
   * @param actor - 发起人。
   * @param input - 任务与负责人。
   */
  async dispatch(actor: Actor, input: TaskInput & { employeeId: string }): Promise<ActionResult<TaskRecord>> {
    if (this.agent(input.employeeId) === undefined) {
      return { ok: false, code: 'unknown_assignee', message: `员工 ${input.employeeId} 不存在` }
    }
    return this.createTask(actor, { ...input, assigneeId: input.employeeId })
  }

  /**
   * 把汇报回投给派发它的那个会话。
   * @returns 一行说明（拼进信箱正文），失败时说明原因而不是抛错。
   */
  private async relayToDispatcher(task: TaskRecord | undefined, actor: Actor, body: string, archivePath: string): Promise<string> {
    const target = task?.parentSessionId ?? null
    if (target === null) return ''
    const who = task?.dispatcherName === undefined || task.dispatcherName === '' ? '派发人' : task.dispatcherName
    const text = [
      `【${actor.name} 的汇报${task === undefined ? '' : ` · ${task.title}（${task.id}）`}】`,
      '',
      body,
      '',
      `---`,
      `由 ${who} 派发；原文已归档到 ${archivePath}。`,
    ].join('\n')
    const notice = `${actor.name} 汇报了「${task?.title ?? '任务'}」`
    try {
      // 按目标会话的归属选投递通道：公司会话必须走各自的组合（大会/项目群/工位），
      // 否则会被「裸 preset」重新组合、公司工具全部消失（踩过：CEO 大厅变成普通 agent）。
      const ceo = this.ceo()
      if (ceo !== undefined && target === ceo.sessionId) {
        await this.deps.deliver(ceo, text, notice)
      } else {
        const channelProject = this.projects().find((project) => project.channelSessionId === target)
        const workbench = this.agents().find((record) => record.sessionId === target)
        if (channelProject !== undefined) await this.deps.deliverChannel(channelProject, text, notice)
        else if (workbench !== undefined) await this.deps.deliver(workbench, text, notice)
        else if (this.isCompanySession(target)) throw new Error('目标是公司会话但无法归属（跳过，避免裸组合）')
        else await this.deps.deliverToSession(target, text, notice)
      }
      return `，并已回投派发会话`
    } catch (error) {
      const message = describe(error)
      this.deps.log(`汇报回投失败（会话 ${target}）：${message}`)
      return `，但回投派发会话失败：${message.slice(0, 120)}`
    }
  }

  /**
   * 把一段汇报/播报追加进项目（或公司）档案的《汇报流水》文件，并维护资料索引。
   * record 模式用它替代「叫醒 agent 转写简报」。
   * @returns 相对公司根目录的展示路径。
   */
  private async appendReportLog(projectId: string | null, actor: Actor, body: string, label: string): Promise<string> {
    const project = projectId === null ? undefined : this.deps.domain.table('projects').get(projectId)
    const base = project?.rootPath ?? this.deps.paths.library
    const relative = project === undefined ? '汇报流水.md' : 'reports/汇报流水.md'
    const file = join(base, relative)
    await mkdir(dirname(file), { recursive: true })
    const stamp = new Date().toISOString()
    await appendFile(file, `\n\n## ${stamp} · ${actor.name} · ${label}\n\n${body}\n`, 'utf8')
    const shown = displayPath(this.deps.paths.root, file)
    const existing = this.docs().find((doc) => doc.path === shown)
    const record: DocRecord = {
      id: existing?.id ?? `doc_${randomUUID().slice(0, 8)}`,
      projectId,
      title: existing?.title ?? (project === undefined ? '公司汇报流水' : `${project.name} · 汇报流水`),
      path: shown,
      tags: ['汇报流水'],
      createdBy: actor.name,
      updatedAt: Date.now(),
    }
    await this.deps.domain.table('docs').put(record.id, record)
    return shown
  }

  /** 员工/频道显示名。 */
  agentNameOf(id: string): string {
    if (id === 'board') return '董事会'
    if (id === 'system') return '系统'
    const agent = this.agent(id)
    if (agent !== undefined) return agent.name
    const project = this.deps.domain.table('projects').get(id)
    return project?.name ?? id
  }

  /**
   * 会话归属：名册直配 → 频道归 CEO → 沿 parentSession 血缘上溯（≤4 层）。
   * 工作日志按归属员工聚合。
   */
  ownerOf(sessionId: string): AgentRecord | undefined {
    const direct = this.agentBySession(sessionId)
    if (direct !== undefined) return direct
    const cached = this.ownerCache.get(sessionId)
    if (cached !== undefined) return cached === null ? undefined : this.agent(cached)
    let owner: AgentRecord | undefined
    const channelProject = this.projects().find((project) => project.channelSessionId === sessionId)
    if (channelProject !== undefined) {
      owner = this.ceo()
    } else {
      let cursor: string | undefined = sessionId
      for (let depth = 0; depth < 4 && cursor !== undefined; depth += 1) {
        const parent = this.parentSessionOf(cursor)
        if (parent === undefined) break
        const hit = this.agentBySession(parent)
        if (hit !== undefined) {
          owner = hit
          break
        }
        if (this.projects().some((project) => project.channelSessionId === parent)) {
          owner = this.ceo()
          break
        }
        cursor = parent
      }
    }
    this.ownerCache.set(sessionId, owner?.id ?? null)
    return owner
  }

  /** 读一个 live 会话的 parentSession（冷会话读不到则返回 undefined）。 */
  private parentSessionOf(sessionId: string): string | undefined {
    const sessions = this.deps.ctx.get('sessions') as { get: (id: string) => { header: { parentSession?: string } } | undefined } | undefined
    const session = sessions?.get(sessionId)
    return session?.header.parentSession
  }

  /**
   * 启动/启用时的幂等归位：补建 CEO（包内 persona）、员工汇报线归 CEO、
   * 按 cwd 推断负责项目、预热大厅与项目群会话。
   */
  async reconcile(): Promise<void> {
    if (this.ceo() === undefined) await this.createCeo()
    const ceo = this.ceo()

    // 历史任务归位（含纠错）：带项目且有项目群的任务，一律归该项目群。
    // —— 早期版本把项目任务的父会话写成了大厅（字段刚加时群会话 id 还没写回），
    //    只补空值救不了这些任务，于是汇报会回到大厅而不是项目群（踩过）。
    for (const task of this.tasks()) {
      if (task.projectId === null || task.parentSessionId === ceo?.sessionId !== true) continue
      const channel = this.deps.domain.table('projects').get(task.projectId)?.channelSessionId ?? null
      if (channel === null || channel === task.parentSessionId) continue
      await this.deps.domain.table('tasks').put(task.id, {
        ...task,
        parentSessionId: channel,
        dispatcherName: task.dispatcherName === '' ? '司南' : task.dispatcherName,
        updatedAt: task.updatedAt,
      })
      this.deps.log(`任务 ${task.id} 归位到项目群 ${channel}`)
    }

    // 历史任务补归属：早于「派发来源」之前建的任务 parentSessionId 为空，
    // 按创建者推断（CEO 派的 → 大厅；项目任务 → 该项目群；其余 → 大厅），
    // 这样「N 个任务」才能挂在正确的会话上。
    for (const task of this.tasks()) {
      if (task.parentSessionId !== null) continue
      const project = task.projectId === null ? undefined : this.deps.domain.table('projects').get(task.projectId)
      // 规则：项目任务归该项目群（派活/汇报都在群里）；无项目则归大厅。
      const fallback = project?.channelSessionId ?? ceo?.sessionId ?? null
      if (fallback === null) continue
      await this.deps.domain.table('tasks').put(task.id, {
        ...task,
        parentSessionId: fallback,
        dispatcherName: task.dispatcherName === '' ? (task.creatorId === ceo?.id ? '司南' : '董事会') : task.dispatcherName,
        updatedAt: task.updatedAt,
      })
    }

    // 预算兜底：没有显式预算的 agent 按角色补默认上限（CEO 上限更高），
    // 超限后投递会被暂停到次日——这是「token 消耗失控」的硬止损。
    for (const record of this.agents()) {
      // 只补「从没设过」的：董事会显式设过（含显式「不限」= null）就不再干预。
      if (record.budgetPinned || record.dailyTokenCap !== null) continue
      const cap = record.role === 'ceo' ? this.deps.config.ceoDailyTokenCap : this.deps.config.defaultDailyTokenCap
      await this.deps.domain.table('agents').put(record.id, { ...record, dailyTokenCap: cap, updatedAt: Date.now() })
      this.deps.log(`已给「${record.name}」设默认预算 ${cap} tokens/日（未显式设定过）`)
    }
    for (const record of this.agents()) {
      if (record.role === 'ceo') continue
      const patch: Partial<AgentRecord> = {}
      if (record.managerId === null && ceo !== undefined) patch.managerId = ceo.id
      if (record.projectIds.length === 0) {
        const owned = this.projects()
          .filter((project) => project.repoPath !== null && record.cwd === project.repoPath)
          .map((project) => project.id)
        if (owned.length > 0) patch.projectIds = owned
      }
      if (Object.keys(patch).length > 0) {
        await this.deps.domain.table('agents').put(record.id, { ...record, ...patch, updatedAt: Date.now() })
        await this.log(SYSTEM, 'agent.reconcile', `归位 ${record.name}：${Object.keys(patch).join('、')}`)
      }
    }
    if (this.enabled) {
      await this.deps.warmChannels()
      await this.deps.fixTitles()
    }
  }

  /** 从包内 agents/ 目录读 CEO 岗位说明书并补建名册记录。 */
  private async createCeo(): Promise<void> {
    const persona = await this.deps.readBundledPersona('agt_ceo.md')
    const id = 'agt_ceo'
    const now = Date.now()
    const cwd = join(this.deps.paths.employees, id)
    await mkdir(cwd, { recursive: true })
    await writeFile(join(cwd, 'AGENTS.md'), persona, 'utf8')
    const record: AgentRecord = {
      id,
      name: '司南',
      title: '首席执行官',
      role: 'ceo',
      managerId: null,
      projectIds: [],
      presetId: null,
      persona,
      provider: null,
      model: null,
      effort: null,
      sessionId: `ses_${randomUUID()}`,
      cwd,
      provisionedAt: null,
      status: 'active',
      permissions: { projects: { '*': 'write' }, tools: [], canHire: false, canApprove: true, canDispatch: true },
      dailyTokenCap: null,
      budgetPinned: false, // 用默认值；改了默认值或董事会在面板里设过才固定
      createdAt: now,
      updatedAt: now,
    }
    await this.deps.domain.table('agents').put(id, record)
    await this.log(BOARD, 'agent.hire', '补建 CEO 司南（公司大厅会话）')
  }

  /** 员工在某项目上的可写判定（工具用）。 */
  canWrite(agentId: string, projectId: string | null): boolean {
    return this.accessOf(agentId, projectId) === 'write'
  }

  // ───────────────────────────── 远程面（浏览器面板调用） ─────────────────────────────

  /** 面板快照（Remote：getState）。 */
  remoteState(): CompanyState {
    return this.snapshot()
  }

  /** 读一篇资料（Remote：readDocRemote）。 */
  async readDocRemote(docId: string): Promise<{ ok: boolean; title?: string; path?: string; content?: string; code?: string; message?: string }> {
    const result = await this.readDoc(BOARD, docId)
    if (!result.ok || result.data === undefined) {
      return { ok: false, ...(result.code !== undefined ? { code: result.code } : {}), ...(result.message !== undefined ? { message: result.message } : {}) }
    }
    return { ok: true, title: result.data.doc.title, path: result.data.doc.path, content: result.data.content }
  }

  /** 董事会直接给某员工插一句话（Remote：nudge）。 */
  async nudge(agentId: string, text: string): Promise<ActionResult<MessageRecord>> {
    if (this.agent(agentId) === undefined) {
      return { ok: false, code: 'unknown_agent', message: `员工 ${agentId} 不存在` }
    }
    return this.sendMail(BOARD, { toId: agentId, kind: 'request', body: text })
  }

  /** 手动触发一次调度/投递（Remote：tickNow）。 */
  async tickNow(): Promise<{ schedules: number; delivered: number }> {
    return this.tick()
  }

  /** 董事会派工（Remote：assign）。 */
  async assign(input: TaskInput): Promise<ActionResult<TaskRecord>> {
    return this.createTask(BOARD, input)
  }

  /** 远程更新任务（Remote：updateTaskRemote）。 */
  async updateTaskRemote(id: string, patch: {
    status?: TaskStatus
    result?: string
    assigneeId?: string | null
    priority?: number
    checkout?: boolean
  }): Promise<ActionResult<TaskRecord>> {
    return this.updateTask(BOARD, id, patch)
  }

  /** 远程评论（Remote：commentTaskRemote）。 */
  async commentTaskRemote(id: string, text: string): Promise<ActionResult<CommentRecord>> {
    return this.commentTask(BOARD, id, text)
  }

  /** 董事会发信箱（Remote：mail）。 */
  async mail(input: MailInput): Promise<ActionResult<MessageRecord>> {
    return this.sendMail(BOARD, input)
  }

  /** 远程建项目（Remote：createProjectRemote）。 */
  async createProjectRemote(input: {
    name: string
    description?: string
    defaultAcl?: AccessLevel
    repoPath?: string | null
  }): Promise<ActionResult<ProjectRecord>> {
    return this.createProject(BOARD, input)
  }

  /** 远程写资料（Remote：writeDocRemote）。 */
  async writeDocRemote(input: {
    projectId: string | null
    path: string
    content: string
    title?: string
  }): Promise<ActionResult<DocRecord>> {
    return this.writeDoc(BOARD, input)
  }

  /** 远程建排程（Remote：createScheduleRemote）。 */
  async createScheduleRemote(input: ScheduleInput): Promise<ActionResult<ScheduleRecord>> {
    return this.createSchedule(BOARD, input)
  }

  /** 远程发起审批（Remote：requestApprovalRemote）。 */
  async requestApprovalRemote(input: ApprovalInput): Promise<ActionResult<ApprovalRecord>> {
    return this.requestApproval(BOARD, input)
  }
}

// ───────────────────────────── 纯渲染函数 ─────────────────────────────

function emptyWorklog(key: string, agentId: string, date: string): WorklogRecord {
  return {
    key, agentId, date,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
    turns: 0, activeMs: 0, sessions: [], updatedAt: Date.now(),
  }
}

/**
 * 内容指纹：覆盖面板会渲染的**所有**表——数量 + 时间戳之和。
 * 客户端据此在「什么都没变」时跳过整页重渲染；漏掉任何一张表都会导致
 * 该表变化后面板不刷新（曾因漏了 schedules 而看不到新建的排程）。
 */
function revisionOf(parts: Record<string, readonly Record<string, unknown>[]>): string {
  return Object.entries(parts)
    .map(([key, rows]) => {
      let stamp = 0
      for (const row of rows) {
        const value = (row.updatedAt ?? row.createdAt ?? row.at ?? row.decidedAt ?? 0) as number
        if (typeof value === 'number' && Number.isFinite(value)) stamp += value
      }
      return `${key}:${rows.length}:${stamp}`
    })
    .sort()
    .join('|')
}

/** 时区日期键。 */
export function dayKey(at: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
  } catch {
    return new Date(at).toISOString().slice(0, 10)
  }
}

/** 岗位说明书（落盘为 AGENTS.md）。 */
function renderRoleBrief(record: AgentRecord, service: CompanyService): string {
  return [
    `# ${record.name} · ${record.title}`,
    '',
    `- 员工 ID：${record.id}`,
    `- 角色：${record.role}`,
    `- 汇报线：${service.chainOf(record.id)}`,
    `- 工作目录：${record.cwd}`,
    '',
    '## 岗位职责',
    record.persona.trim() === '' ? '（待补充：由董事会在公司面板编辑）' : record.persona.trim(),
    '',
    '## 协作协议',
    '1. 与同事、上级沟通一律使用公司信箱工具（company_mail_send / company_report）。',
    '2. 任务先认领再执行，完成置 review 并汇报；被阻塞时把任务置 blocked 并说明原因。',
    '3. 越权动作先走 company_approval_request 审批。',
    '4. 任务讨论沉淀在任务评论里，便于他人接手。',
    '',
  ].join('\n')
}

/** 信箱消息 → 员工可见的投递帧。 */
function renderMail(record: MessageRecord, taskLabel: string | undefined): string {
  const lines = [
    '【公司信箱】',
    `消息 ID：${record.id}`,
    `来自：${record.fromName}（${record.fromType === 'board' ? '董事会' : record.fromType === 'system' ? '系统' : '同事'}）`,
    `类型：${record.kind}`,
  ]
  if (taskLabel !== undefined) lines.push(`关联任务：${taskLabel}`)
  lines.push('---', record.body, '---')
  lines.push('处理方式：需要回话用 `company_mail_send`；任务进展用 `company_task_update`；完成后用 `company_report` 向上级汇报。')
  return lines.join('\n')
}

/** 频道帧：下属汇报/播报 → CEO 实例转成面向董事会的简报。 */
function renderChannelFrame(record: MessageRecord, taskLabel: string | undefined, fromName: string): string {
  const intro = record.kind === 'announce'
    ? `【播报任务】${fromName} 要向董事会播报以下内容：`
    : `【下属汇报】${fromName} 完成了一项工作，请转成给董事会的简报：`
  const lines = [
    intro,
    ...(taskLabel !== undefined ? [`关联任务：${taskLabel}`] : []),
    '---',
    record.body,
    '---',
    '按你的简报格式输出（先结论后细节；markdown；不复述本指令；不调用工具）。',
  ]
  return lines.join('\n')
}

/** 派工帧。 */
function renderTaskDispatch(task: TaskRecord, service: CompanyService): string {
  const manager = task.assigneeId === null ? undefined : service.agent(task.assigneeId)?.managerId
  return [
    '【新任务】',
    `任务：${task.title}（${task.id}）`,
    `说明：${task.desc === '' ? '（无）' : task.desc}`,
    `优先级：${task.priority}${task.dueAt === null ? '' : ` · 截止：${new Date(task.dueAt).toISOString()}`}`,
    manager === undefined || manager === null ? '' : `由 ${service.agent(manager)?.name ?? manager} 指派。`,
    '请先用 `company_task_update`（checkout=true）认领，再动手；完成后置 status=review 并用 `company_report` 汇报结论。',
  ].filter((line) => line !== '').join('\n')
}

/** 排程触发帧。 */
function renderScheduleFire(record: ScheduleRecord, atIso: string): string {
  return [
    '【定时任务】',
    `排程：${record.id}（${describeSchedule(record)}）`,
    `触发时间：${atIso}`,
    '---',
    record.prompt,
    '---',
    '按提示词执行；有结论用 `company_report` 汇报，需要他人协作发 `company_mail_send`。',
  ].join('\n')
}

/** 审批请求帧。 */
function renderApprovalAsk(record: ApprovalRecord, action: string): string {
  return [
    '【审批请求】',
    `审批：${record.id} · 类别 ${record.kind}`,
    `标题：${record.title}`,
    `发起：${record.requesterName}`,
    '---',
    record.detail,
    '---',
    `${action}：批准后任务照常推进；驳回则请发起人调整方案。`,
  ].join('\n')
}

/** 审批结果帧。 */
function renderApprovalResult(record: ApprovalRecord, note: string): string {
  return [
    '【审批结果】',
    `审批：${record.id} · ${record.title}`,
    `结果：${record.status === 'approved' ? '✅ 已批准' : '❌ 已驳回'}`,
    note.trim() === '' ? '' : `董事会说明：${note}`,
    '据此继续推进（批准后照常执行；驳回则调整方案或重新申请）。',
  ].filter((line) => line !== '').join('\n')
}

/** 排程描述。 */
export function describeSchedule(record: ScheduleRecord): string {
  if (record.kind === 'cron') return `cron「${record.cron}」`
  if (record.kind === 'every') return `每 ${record.everySec} 秒`
  return `一次性 ${record.at === null ? '' : new Date(record.at).toISOString()}`
}

/** 一行摘要。 */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat
}

// ───────────────────────────── 排程解析与推进 ─────────────────────────────

interface ParsedSchedule {
  ok: true
  nextRunAt: number
  everySec: number
  at: number
}

/** 解析排程规格（cron 表达式 / 间隔秒 / ISO 时点）。 */
export function parseSchedule(input: ScheduleInput, timeZone: string): ParsedSchedule | { ok: false; code: string; message: string } {
  const now = Date.now()
  if (input.kind === 'every') {
    const everySec = Number(input.spec.trim())
    if (!Number.isFinite(everySec) || everySec < 60) {
      return { ok: false, code: 'invalid_rule', message: 'every 规格是秒数，且不得小于 60' }
    }
    return { ok: true, nextRunAt: now + everySec * 1000, everySec, at: 0 }
  }
  if (input.kind === 'at') {
    const at = Date.parse(input.spec.trim())
    if (!Number.isFinite(at)) return { ok: false, code: 'invalid_rule', message: 'at 规格需为 ISO 时间戳' }
    if (at <= now) return { ok: false, code: 'not_future', message: 'at 必须晚于当前时间' }
    return { ok: true, nextRunAt: at, everySec: 0, at }
  }
  const next = nextCron(input.spec.trim(), now, timeZone)
  if (next === null) return { ok: false, code: 'invalid_rule', message: `cron 表达式无法解析：${input.spec}` }
  return { ok: true, nextRunAt: next, everySec: 0, at: 0 }
}

/** 推进一条排程到下一个触发点；返回 null 表示不再触发。 */
function advance(record: ScheduleRecord, from: number, timeZone: string): number | null {
  if (record.kind === 'at') return null
  if (record.kind === 'every') {
    const step = (record.everySec ?? 0) * 1000
    if (step <= 0) return null
    let next = record.nextRunAt
    while (next <= from) next += step
    return next
  }
  return nextCron(record.cron ?? '', from, timeZone)
}

/** cron 表达式 → 下一次触发毫秒（指定时区）。 */
function nextCron(expression: string, from: number, timeZone: string): number | null {
  const parser = cronParser()
  if (parser === null) return null
  try {
    const interval = parser.parseExpression(expression, { currentDate: new Date(from), tz: timeZone })
    return interval.next().toDate().getTime()
  } catch {
    return null
  }
}

interface CronParser {
  parseExpression: (
    expression: string,
    options: { currentDate: Date; tz: string },
  ) => { next: () => { toDate: () => Date } }
}

let cachedCron: CronParser | null | undefined

/** 惰性加载 cron-parser（缺失时排程优雅降级为不触发）。 */
function cronParser(): CronParser | null {
  if (cachedCron !== undefined) return cachedCron
  try {
    cachedCron = createRequire(import.meta.url)('cron-parser') as CronParser
  } catch {
    cachedCron = null
  }
  return cachedCron
}

export type { TaskRecord, AgentRecord, MessageRecord, ApprovalRecord, ProjectRecord, DocRecord, ScheduleRecord, WorklogRecord }

/** CEO（有派活权的 agent）读到的协作协议。 */
const CEO_PROTOCOL = [
  '公司协作协议（你的角色：**管理者**，有派活权）：',
  '0. **派活权边界**：你能用 company_dispatch / company_task_create / company_schedule_create，且**只有你和董事会有这个权力**（员工没有）。但只能执行**董事会当次的明确指令**——不要凭旧审批、旧计划或自己的判断开工；没有指令就不动。',
  '1. 派活：company_dispatch(employee, title, desc)——必须写清验收标准；范围以董事会这次说的话为准。',
  '2. 查人查事：company_org 看名册与汇报线；company_task_list(scope=all) 看全公司任务。',
  '3. 汇报/播报：company_announce 写给董事会的简报（自动落项目群/大厅）。',
  '4. 招人：company_hire_request 提申请（你没有人事权，批准后系统自动入职）。',
  '5. 例行工作：company_schedule_create 定时提醒自己（仅限董事会交代的例行事项）。',
  '6. 越权动作（花钱/上线/删数据）：先 company_approval_request。',
  '7. 员工汇报会归档到项目《汇报流水》并回投到派活的那个会话；你不需要复述。',
].join('\n')

/** 员工读到的协作协议（没有派活权）。 */
const EMPLOYEE_PROTOCOL = [
  '公司协作协议：',
  '0. **工作只由董事会分发**：你只做派到你名下的任务。不要自己建任务、不要给别人派活、不要自我排程——想推进别的事，写进 company_report 的建议（做什么/为什么/预期产出），等董事会点头。',
  '1. 领任务：company_task_list → company_task_update(checkout=true) → 干活。',
  '2. 要信息：company_org 查人 → company_mail_send(kind=question)。',
  '3. 要协作：company_mail_send(kind=request) 请同事帮忙（不要替别人建任务）。',
  '4. 卡住了：任务置 blocked（result 写原因），company_report 上报。',
  '5. 越权动作（花钱/上线/删数据/招人）：先 company_approval_request，等 approval_result。',
  '6. 做完：任务置 review，company_doc_write 落产出，company_report 汇报结论。',
  '7. 手上没活时：待命。不要自己找活干、不要为了「显得有产出」而开工。',
].join('\n')
