/**
 * dsh-onecompany（一人公司）host 半：公司领域 + 服务 + 员工/频道驱动 + 工具 +
 * 命令 + 根会话注入 + Remote 面。自包含：只依赖 dsh 官方核心服务。
 */
import { readFile } from 'node:fs/promises'
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { companyDomainSpec } from './domain.ts'
import { AgentDriver, describe, type ComposeSpec } from './driver.ts'
import { CompanyService } from './service.ts'
import { buildCeoExtras, buildChannelTools, buildCompanyTools } from './tools.ts'
import { registerCallCommand, registerCompanyCommand } from './commands.ts'
import { installRootInjector } from './injector.ts'
import { ensurePaths, resolveRoot } from './paths.ts'
import type { AgentRecord, ProjectRecord, TaskRecord } from '../shared/wire.ts'

export const name = 'onecompany'

/** 硬依赖：这些服务缺一不可（缺了插件保持 PENDING 并显式告警）。 */
export const inject = ['timer', 'storageDomain', 'agents', 'sessions', 'tools', 'commands', 'systemPrompt', 'sessionPersistence']

/** 插件配置（部署差异全部在这里，代码无硬编码可调参数）。 */
export interface Config {
  companyRoot: string
  companyName: string
  tickMs: number
  maxResidentAgents: number
  defaultDailyTokenCap: number
  /** CEO 每日 token 上限（大厅 + 项目群实例合计）。 */
  ceoDailyTokenCap: number
  approvalsRequired: string[]
  timeZone: string
  /** 启动时自动补建 CEO 与项目群会话。 */
  autoProvision: boolean
  /** 新建会话后发一条开场消息（让会话有首个轮次、出现在侧栏）。 */
  kickoffOnCreate: boolean
  /** 员工工位是否也发开场消息（默认否：员工只在被派活时醒来）。 */
  employeeKickoff: boolean
  /**
   * 执行会话形态：
   * - `per-task`（默认）每个任务开一个新会话，跑完即停（上下文小、按任务隔离、缓存友好）
   * - `resident`   沿用常驻工位会话（有连续性，但上下文随会话年龄增长、且会互相污染）
   */
  taskSession: 'per-task' | 'resident'
  /** 任务执行会话的超时小时数：超过就停止会话并在任务里留言（0 = 不超时）。 */
  taskSessionTimeoutHours: number
  /** 是否给公司 agent 收窄工具面（禁掉与工作无关的宿主工具）。 */
  leanTools: boolean
  /**
   * 精简提示词：把「每轮都在变的动态清单」（当前任务、全公司未完成任务、档案列表）
   * 从系统提示词里去掉，改为让模型用时再查（company_task_list / company_doc_list）。
   *
   * 为什么重要：系统提示词在 prompt 最前面，缓存是前缀匹配——只要其中任何一段变化，
   * 它之后的内容（整段对话历史）就全部 miss、按全价重算。动态清单放系统提示词里
   * 等于每轮把历史重发一遍全价。
   */
  compactPrompt: boolean
  /** 要禁掉的工具名（跨部署安全：不存在的名字会被自动忽略）。 */
  deniedTools: string[]
  /**
   * 汇报投递模式：
   * - `digest`（默认）CEO 把原始汇报转成给董事会的易读简报（会有一轮模型调用）
   * - `record` 只归档进项目档案 + 进面板未读，**不叫醒任何 agent**（零 token、零回声）
   */
  reportDelivery: 'digest' | 'record'
}

export const Config: Schema<Config> = Schema.object({
  companyRoot: Schema.string().default(''),
  companyName: Schema.string().default('一人公司'),
  tickMs: Schema.number().default(30_000),
  maxResidentAgents: Schema.number().default(8),
  defaultDailyTokenCap: Schema.number().default(2_000_000),
  ceoDailyTokenCap: Schema.number().default(8_000_000),
  approvalsRequired: Schema.array(Schema.string()).default(['hire', 'spend', 'strategy', 'danger']),
  timeZone: Schema.string().default('Asia/Shanghai'),
  autoProvision: Schema.boolean().default(true),
  kickoffOnCreate: Schema.boolean().default(true),
  employeeKickoff: Schema.boolean().default(false),
  taskSession: Schema.union(['per-task', 'resident']).default('per-task'),
  taskSessionTimeoutHours: Schema.number().default(12),
  leanTools: Schema.boolean().default(true),
  compactPrompt: Schema.boolean().default(true),
  deniedTools: Schema.array(Schema.string()).default([
    'import_chat', 'export_chat', 'export_bundle', 'restore_bundle', 'sync_to_claude',
    'scan_discover', 'list_imported_sessions', 'retract_import', 'import_agents',
    'import_settings', 'import_mcp', 'doctor', 'verify_session',
    'workflow', 'ralph', 'visualize',
  ]),
  reportDelivery: Schema.union(['digest', 'record']).default('record'),
})

/**
 * 挂载一人公司：开领域、起服务与驱动、注册命令、注入根会话、折叠会话事件。
 * @param ctx - 宿主插件上下文。
 * @param config - 已校验配置。
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const log = (message: string): void => {
    // 同时走 stdout：cordis logger 在 web 组合里进了 UI 日志缓冲，排障时看不见。
    console.log(`[onecompany] ${message}`)
    ctx.logger?.info?.(`[onecompany] ${message}`)
  }
  const root = resolveRoot(config.companyRoot)
  const paths = await ensurePaths(root)
  const domain = await ctx.storageDomain.open(companyDomainSpec)

  /** 包内 agents/ 目录的岗位说明书。 */
  const readBundledPersona = async (file: string): Promise<string> =>
    readFile(new URL(`../agents/${file}`, import.meta.url), 'utf8')

  /**
   * 工作区注册表是异步初始化的服务：apply 时往往还没就绪（要建全量会话 cwd 索引）。
   * 这里惰性解析并在就绪后补挂所有现存公司会话——公司会话必须归入工作区，
   * 否则侧栏不可见、面板也无法跳转。
   */
  let workspaceRegistry: {
    resolveByPath: (path: string) => Promise<{ attachSession: (id: string) => Promise<void>; title?: string; setTitle?: (title: string) => Promise<void> } | undefined>
    create: (path: string, title?: string) => Promise<{ attachSession: (id: string) => Promise<void> }>
  } | undefined

  /** 会话对应的展示标题（大厅/项目群/员工工位）。 */
  const titleForSession = (sessionId: string): string | undefined => {
    const record = service.agents().find((entry) => entry.sessionId === sessionId)
    if (record !== undefined) return record.role === 'ceo' ? '一人公司' : `${record.name} · ${record.title}`
    const project = service.projects().find((entry) => entry.channelSessionId === sessionId)
    return project === undefined ? undefined : `${project.name} · 项目群`
  }

  const attachSessionToWorkspace = async (session: { id: string; header: { cwd?: string } }, title?: string): Promise<void> => {
    if (workspaceRegistry === undefined) {
      workspaceRegistry = ctx.get('workspaceRegistry') as typeof workspaceRegistry
    }
    if (workspaceRegistry === undefined) return // 未就绪：注册表注入回调里会补挂
    const cwd = session.header.cwd
    if (cwd === undefined) return
    try {
      await ctx.sessions.flush(session as never)
      const workspace = (await workspaceRegistry.resolveByPath(cwd)) ?? (await workspaceRegistry.create(cwd, title))
      // 自动建出来的工作区标题就是目录名（如 agt_ceo），有更合适的名字就改名。
      const ws = workspace as { title?: string; setTitle?: (next: string) => Promise<void>; sessionIds?: readonly string[] }
      // 只给「公司自己建的」工作区改名：标题等于目录名、且里面只有我们这一个会话。
      // 用户已有的工作区（哪怕标题正好也是目录名）绝不改名。
      const ownOnly = Array.isArray(ws.sessionIds) && ws.sessionIds.length === 1 && ws.sessionIds[0] === session.id
      if (title !== undefined && ownOnly && ws.title !== title && typeof ws.setTitle === 'function') {
        await ws.setTitle(title)
        log(`工作区改名：${cwd.split('/').pop()} → ${title}`)
      }
      await workspace.attachSession(session.id)
    } catch (error) {
      log(`会话 ${session.id} 归入工作区失败：${describe(error)}`)
    }
  }

  /** 注册表就绪后，把当前活着的公司会话一次性补挂。 */
  const attachLiveCompanySessions = async (): Promise<void> => {
    const store = ctx.get('sessions') as { get: (id: string) => { id: string; header: { cwd?: string } } | undefined } | undefined
    if (store === undefined) return
    const ids = new Set<string>()
    for (const record of service.agents()) ids.add(record.sessionId)
    for (const project of service.projects()) {
      if (project.channelSessionId !== null) ids.add(project.channelSessionId)
    }
    for (const id of ids) {
      const session = store.get(id)
      if (session === undefined) continue
      await attachSessionToWorkspace(session, titleForSession(id))
    }
  }

  let driver: AgentDriver | undefined
  const service = new CompanyService({
    ctx,
    domain,
    paths,
    config: {
      tickMs: config.tickMs,
      defaultDailyTokenCap: config.defaultDailyTokenCap,
      ceoDailyTokenCap: config.ceoDailyTokenCap,
      approvalsRequired: config.approvalsRequired,
      timeZone: config.timeZone,
      companyName: config.companyName,
      reportDelivery: config.reportDelivery,
      compactPrompt: config.compactPrompt,
      taskSession: config.taskSession,
      taskSessionTimeoutHours: config.taskSessionTimeoutHours,
    },
    deliver: async (record, text, notice) => {
      if (driver === undefined) throw new Error('员工驱动尚未就绪')
      await driver.deliver(record, text, notice)
    },
    deliverTask: async (task, employee, text) => {
      if (driver === undefined) throw new Error('员工驱动尚未就绪')
      await driver.deliverTask(task, employee, text)
    },
    stopTask: async (taskId) => {
      if (driver === undefined) return
      await driver.stopTask(taskId)
    },
    ensureChannel: async (project) => {
      if (driver === undefined) return
      await driver.ensureChannel(project)
    },
    deliverToSession: async (sessionId, text, notice) => {
      if (driver === undefined) throw new Error('员工驱动尚未就绪')
      await driver.deliverToSession(sessionId, text, notice)
    },
    stopTaskIfIdle: async (taskId) => {
      if (driver === undefined) return true
      return driver.stopTaskIfIdle(taskId)
    },
    deliverChannel: async (project, text, notice) => {
      if (driver === undefined) throw new Error('员工驱动尚未就绪')
      await driver.deliverChannel(project, text, notice)
    },
    warmChannels: async () => {
      if (driver === undefined) return
      if (!config.autoProvision) return
      const ceo = service.ceo()
      if (ceo !== undefined) await driver.ensure(ceo)
      for (const project of service.projects()) await driver.ensureChannel(project)
    },
    fixTitles: async () => {
      if (driver === undefined) return
      await driver.fixTitles(service.agents())
    },
    readBundledPersona,
    stopResident: async (agentId) => {
      await driver?.stop(agentId)
    },
    stopAllResidents: async () => {
      await driver?.stopAll()
    },
    residentIds: () => driver?.residentIds() ?? [],
    log,
  })

  const composeEmployee = (record: AgentRecord): ComposeSpec => {
    const tools = buildCompanyTools(service, record.id)
    const extras = record.role === 'ceo' || record.permissions.canApprove ? buildCeoExtras(service, record.id) : []
    return {
      kind: record.role === 'ceo' ? 'hall' : 'employee',
      tools: [...tools, ...extras],
      prompt: () => service.employeePrompt(record.id),
      presetId: record.presetId,
    }
  }
  const composeChannel = (project: ProjectRecord): ComposeSpec => ({
    kind: 'channel',
    tools: buildChannelTools(service, project),
    prompt: () => service.channelPrompt(project.id),
    presetId: null,
  })
  const composeTask = (task: TaskRecord, employee: AgentRecord): ComposeSpec => ({
    kind: 'employee',
    tools: buildCompanyTools(service, employee.id),
    prompt: () => service.taskPrompt(task.id, employee.id),
    presetId: employee.presetId,
  })

  const composeHall = (record: AgentRecord): ComposeSpec => ({
    kind: 'hall',
    tools: [...buildCompanyTools(service, record.id), ...buildCeoExtras(service, record.id)],
    prompt: () => service.hallPrompt(),
    presetId: record.presetId,
  })

  /**
   * 收窄工具面：把与公司工作无关的宿主级工具（会话迁移、编排、可视化等）
   * 从模型视野移除——它们每步占用约 3 万字符 schema（≈8-10k token），
   * 而员工与 CEO 一次都用不到。未知名字会抛错，故失败时按错误里的已知清单重试。
   */
  const restrictTools = (agentCtx: Context, kind: 'employee' | 'hall' | 'channel'): void => {
    if (!config.leanTools) return
    const tools = (agentCtx as unknown as { tools?: { restrict: (filter: { deny: string[] }) => () => void } }).tools
    if (tools === undefined) return
    const deny = config.deniedTools
    const attempt = (names: string[]): void => {
      if (names.length === 0) return
      try {
        const dispose = tools.restrict({ deny: names })
        agentCtx.effect(() => dispose, 'onecompany: lean tools')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const known = /known global tools: (.+)$/.exec(message)?.[1]?.split(/,\s*/) ?? []
        const usable = names.filter((name) => known.includes(name))
        if (usable.length > 0 && usable.length < names.length) {
          attempt(usable)
          return
        }
        log(`收窄工具面失败（${kind}）：${message.slice(0, 160)}`)
      }
    }
    attempt(deny)
  }

  driver = new AgentDriver({
    ctx,
    composeEmployee,
    composeChannel,
    composeTask,
    composeHall,
    markProvisioned: async (agentId) => {
      await service.markProvisioned(agentId)
    },
    markChannel: async (projectId, sessionId) => {
      await service.markChannel(projectId, sessionId)
    },
    attachWorkspace: async (agent) => {
      const sessionId = agent.session.id
      const record = service.agents().find((entry) => entry.sessionId === sessionId)
      const project = service.projects().find((entry) => entry.channelSessionId === sessionId)
      // 工作区标题用「公司/项目」层面的名字（不带「· 工位」后缀）
      const title = record?.role === 'ceo' ? '一人公司' : project?.name
      await attachSessionToWorkspace(agent.session, title)
    },

    defaultModel: () => {
      const selection = ctx.get('agentDefaultModel') as { currentSelection: () => { provider: string; model: string; reasoningEffort?: string } } | undefined
      if (selection === undefined) return undefined
      try {
        const current = selection.currentSelection()
        return { provider: current.provider, model: current.model, ...(current.reasoningEffort === undefined ? {} : { reasoningEffort: String(current.reasoningEffort) }) }
      } catch {
        return undefined
      }
    },
    maxResident: Math.max(1, config.maxResidentAgents),
    restrictTools,
    isCompanySession: (sessionId: string) => service.isCompanySession(sessionId),
    kickoff: (kind, label) => {
      if (!config.kickoffOnCreate) return ''
      if (kind === 'employee' && !config.employeeKickoff) return ''
      if (kind === 'hall') return '【公司大厅已就绪】请用一句话向董事会自我介绍（你的名字「司南」、职责、如何给你派活），然后待命，不要调用工具。'
      if (kind === 'channel') return `【项目群已就绪】${label}：请用一句话说明本群用途（项目、当前进度、如何派活给团队），然后待命，不要调用工具。`
      return `【入职确认】${label}：请用一句话确认到岗（你的名字、职位、负责项目、你会怎么汇报），然后待命，不要调用工具。`
    },
    log,
  })

  // 公司显示名以配置为准（首次启动落库）。
  const global = domain.global.get()
  if (global.createdAt === 0) {
    await domain.global.set({ enabled: true, companyName: config.companyName, createdAt: Date.now() })
  } else if (global.companyName !== config.companyName) {
    await domain.global.set({ ...global, companyName: config.companyName })
  }

  ctx.inject(['workspaceRegistry'], (workspaceCtx) => {
    workspaceRegistry = (workspaceCtx as unknown as { workspaceRegistry: typeof workspaceRegistry }).workspaceRegistry
    void attachLiveCompanySessions().catch((error: unknown) => log(`补挂公司会话失败：${describe(error)}`))
  })

  // 领域任何写入都推进快照指纹（客户端据此决定要不要重渲染）。
  ctx.on('domain/changed', ((change: { domain?: string }) => {
    if (change?.domain === 'onecompany') service.bumpRevision()
  }) as never)

  registerCompanyCommand(ctx, service, log)
  registerCallCommand(ctx, service, log)

  // 根会话注入：普通会话获得 company_call 工具与名册提示。
  installRootInjector(ctx, service, (sessionId) => service.isCompanySession(sessionId), log)

  // token 用量：旁路捕获每次模型调用的 usage（透明透传，不改流协议）。
  ctx.on('llm/stream', (options, next) => {
    const downstream = next()
    type Usage = { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number }
    return (async function* onecompanyUsage() {
      let usage: Usage | undefined
      try {
        for await (const chunk of downstream) {
          const candidate = chunk as { type?: string; usage?: Usage }
          if (candidate.type === 'usage' && candidate.usage !== undefined) usage = candidate.usage
          yield chunk
        }
      } finally {
        if (usage !== undefined) {
          void service.foldUsage(options?.sessionId, usage).catch((error: unknown) => {
            log(`token 计量失败：${describe(error)}`)
          })
        }
      }
    })()
  })

  ctx.on('session/event', (session, event) => {
    void service.foldEvent(session.id, event).catch((error: unknown) => {
      log(`工作日志折叠失败：${describe(error)}`)
    })
  })

  // 生命周期：定时器与常驻句柄随插件卸载一起收干净；领域由本插件持有并关闭。
  ctx.effect(() => {
    service.startTimers()
    return async () => {
      service.stopTimers()
      await driver?.stopAll()
      await domain.close()
    }
  }, 'onecompany: lifecycle')

  // typertRemote 必须在 provide 之前挂到服务对象原件上：网关从它自己的 fiber 读
  // `originalOf(ctx.get('company')).typertRemote`，provide 后再补丁可能打到代理上。
  Object.defineProperty(service, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service, serviceKey: 'company', namespace: 'company' },
  })
  ctx.provide('company', service)

  const state = service.snapshot()
  log(`已加载：${state.companyName} · 根目录 ${paths.root} · 员工 ${state.agents.length} 人 · ${state.enabled ? '运行中' : '已停用'}`)

  // 归位与预热（幂等）：补 CEO、汇报线、负责项目、大厅与项目群会话。
  if (state.enabled) {
    void service.reconcile()
      .then(() => log('reconcile 完成'))
      .catch((error: unknown) => log(`reconcile 失败：${describe(error)}`))
    void service.tick()
  }
}

export { CompanyService } from './service.ts'
export type { CompanyState } from '../shared/wire.ts'
