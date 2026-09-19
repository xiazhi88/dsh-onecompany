/**
 * 公司工具组：每个员工在自己的作用域里拿到这一组工具（agent.ctx 注册，不进全局
 * 层）。所有动作都经 CompanyService，权限与总开关在 execute 内判定：越权返回可
 * 教学的错误码，停用时明确告知，绝不静默失败。
 */
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { BOARD, type Actor, type CompanyService } from './service.ts'
import type { ActionResult, ApprovalKind, MailKind, ScheduleKind, TaskStatus, ProjectRecord } from '../shared/wire.ts'

/** 统一输出：一行 JSON 文本（含成功/失败标记，便于模型与人类阅读）。 */
const textOutput = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

/**
 * 为某员工构造全部公司工具。
 * @param service - 公司服务。
 * @param agentId - 员工 id（工具作用域绑定）。
 * @returns 工具定义数组。
 */
export function buildCompanyTools(service: CompanyService, agentId: string): ToolDefinition[] {
  const actorOf = (): Actor => {
    const record = service.agent(agentId)
    return { type: 'agent', id: agentId, name: record?.name ?? agentId }
  }

  /** 统一执行包装：总开关 → 执行 → 渲染。 */
  const perform = async (run: () => Promise<ActionResult<unknown>>): Promise<string> => {
    if (!service.enabled) return '❌ company_disabled：公司模式当前已停用，请等董事会启用后再操作。'
    try {
      const result = await run()
      return result.ok
        ? `✅ ${typeof result.data === 'string' ? result.data : JSON.stringify(result.data)}`
        : `❌ ${result.code ?? 'error'}：${result.message ?? '操作被拒绝'}`
    } catch (error) {
      return `❌ internal_error：${error instanceof Error ? error.message : String(error)}`
    }
  }

  // 工作只由董事会分发：没有派活权的员工，工具面里不出现「建任务 / 自我排程」，
  // 免得模型看见却用不了（那会让它反复试错）。
  const canDispatch = service.mayDispatch({ type: 'agent', id: agentId, name: agentId })

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'company_org',
      description: '查看公司组织架构与通讯录（姓名/职位/汇报线/员工 ID）。要找人协作、确认汇报关系或查上级 ID 时用。',
      parameters: {},
      output: textOutput,
      execute: () => perform(async () => {
        const lines = service.agents()
          .filter((record) => record.status !== 'terminated')
          .map((record) => `- ${record.name}（${record.title}，id=${record.id}）汇报线：${service.chainOf(record.id)}`)
        return { ok: true, data: lines.length === 0 ? '（公司暂无其他员工）' : lines.join('\n') }
      }),
    }),

    defineTool({
      name: 'company_mail_send',
      description: '给同事或上级发公司信箱消息。问信息用 question，同步信息用 info，请人协作/对下属派活用 request。批量沟通请一次说清背景、诉求与期望回应。',
      parameters: {
        to: { type: 'string', required: true, description: '收件人员工 ID（company_org 可查）或 board 表示董事会' },
        kind: { type: 'string', required: true, enum: ['info', 'question', 'request', 'report'], description: '消息类型' },
        body: { type: 'string', required: true, description: '消息正文' },
        task_id: { type: 'string', description: '可选：关联任务 ID' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.sendMail(actorOf(), {
        toId: args.to,
        kind: args.kind as MailKind,
        body: args.body,
        taskId: args.task_id ?? null,
      })),
    }),

    defineTool({
      name: 'company_mail_list',
      description: '查看你自己的公司信箱（默认最近 20 条）。开工前扫一眼有没有上级指令或同事提问。',
      parameters: {
        unread_only: { type: 'boolean', description: '仅看未读（status != read）' },
        limit: { type: 'integer', description: '返回条数上限，默认 20' },
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const limit = args.limit ?? 20
        const list = service.messages({ toId: agentId })
          .filter((record) => args.unread_only !== true || record.status !== 'read')
          .slice(0, limit)
          .map((record) => `[${record.status}] ${record.id} ← ${record.fromName}（${record.kind}）：${record.body.slice(0, 160)}`)
        return {
          ok: true,
          data: list.length === 0
            ? '（信箱为空）'
            : `${list.join('\n')}\n\n提示：正文被摘要截断时，用 company_mail_read(mail_id) 读全文（不要去翻磁盘）。`,
        }
      }),
    }),

    defineTool({
      name: 'company_mail_read',
      description: '按 mail_id 读一封信箱消息的完整正文（列表里的摘要是截断的）。',
      parameters: {
        mail_id: { type: 'string', required: true, description: 'company_mail_list 给出的消息 ID' },
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const result = await service.readMail(args.mail_id)
        if (!result.ok || result.data === undefined) return result
        const message = result.data
        return {
          ok: true,
          data: [
            `来自：${message.fromName}（${message.fromType}）· 类型：${message.kind} · ${new Date(message.createdAt).toISOString()}`,
            ...(message.taskId === null ? [] : [`关联任务：${message.taskId}`]),
            '---',
            message.body,
          ].join('\n'),
        }
      }),
    }),

    defineTool({
      name: 'company_task_create',
      description: '建一个任务。可以指派给自己、下属或同事；也可以建子任务挂在父任务下（子任务全部完成时父任务自动关闭）。',
      parameters: {
        title: { type: 'string', required: true, description: '任务标题' },
        desc: { type: 'string', description: '任务说明与验收标准' },
        assignee: { type: 'string', description: '负责人员工 ID，缺省为待认领' },
        project_id: { type: 'string', description: '可选：关联项目 ID' },
        priority: { type: 'integer', description: '优先级，数字越大越紧急，默认 0' },
        parent_task_id: { type: 'string', description: '可选：父任务 ID' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.createTask(actorOf(), {
        title: args.title,
        desc: args.desc ?? '',
        assigneeId: args.assignee ?? null,
        projectId: args.project_id ?? null,
        priority: args.priority ?? 0,
        parentTaskId: args.parent_task_id ?? null,
      })),
    }),

    defineTool({
      name: 'company_task_list',
      description: '查看任务列表：默认看自己的，也可以看全部或按状态筛。开工先看这里确认优先级。',
      parameters: {
        scope: { type: 'string', enum: ['mine', 'all'], description: 'mine=只看自己的（默认），all=全公司' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'], description: '可选：按状态过滤' },
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const list = service.tasks()
          .filter((record) => (args.scope === 'all' ? true : record.assigneeId === agentId))
          .filter((record) => args.status === undefined || record.status === args.status)
          .map((record) => `[${record.status}] ${record.id} ${record.title} @${service.agent(record.assigneeId ?? '')?.name ?? '待认领'}${record.result === null ? '' : ` → ${record.result.slice(0, 120)}`}`)
        return { ok: true, data: list.length === 0 ? '（没有匹配的任务）' : list.join('\n') }
      }),
    }),

    defineTool({
      name: 'company_task_update',
      description: '更新任务：checkout=true 表示认领并开工；status 推进到 in_progress/blocked/review/done；result 写结论。被阻塞要置 blocked 并写清原因。',
      parameters: {
        task_id: { type: 'string', required: true, description: '任务 ID' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'], description: '新状态' },
        result: { type: 'string', description: '结论/产出/阻塞原因' },
        checkout: { type: 'boolean', description: 'true = 原子认领该任务' },
        assignee: { type: 'string', description: '改派给某员工 ID' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.updateTask(actorOf(), args.task_id, {
        ...(args.status !== undefined ? { status: args.status as TaskStatus } : {}),
        ...(args.result !== undefined ? { result: args.result } : {}),
        ...(args.assignee !== undefined ? { assigneeId: args.assignee } : {}),
        ...(args.checkout !== undefined ? { checkout: args.checkout } : {}),
      })),
    }),

    defineTool({
      name: 'company_task_comment',
      description: '在任务下写一条评论（协作讨论/进度记录）。讨论沉淀在任务里，方便他人接手。',
      parameters: {
        task_id: { type: 'string', required: true, description: '任务 ID' },
        text: { type: 'string', required: true, description: '评论内容' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.commentTask(actorOf(), args.task_id, args.text)),
    }),

    defineTool({
      name: 'company_report',
      description: '向上级汇报（发给你的直属上级；没有上级则直达董事会）。完成、卡住、发现新问题都用它，别默默做完不说。',
      parameters: {
        body: { type: 'string', required: true, description: '汇报正文：做了什么、结论、风险、需要的支持' },
        task_id: { type: 'string', description: '可选：关联任务 ID' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.report(actorOf(), args.body, args.task_id ?? null)),
    }),

    defineTool({
      name: 'company_approval_request',
      description: '请求审批：花钱（spend）、上线/对外发布（strategy）、删除或高危操作（danger）、招聘（hire）等越权动作，必须先审批再动手。写给董事会看的东西要用大白话：董事会不读代码、不看日志。',
      parameters: {
        kind: { type: 'string', required: true, enum: ['hire', 'spend', 'strategy', 'danger', 'other'], description: '审批类别' },
        title: { type: 'string', required: true, description: '一句话结论（大白话，别用术语），例如「把服务器磁盘从 60G 扩到 100G」' },
        ask: { type: 'string', required: true, description: '你到底要董事会点头还是摇头：一句话，以动词开头，如「请批准我今晚 22:00 扩容并重启服务」' },
        summary: { type: 'string', required: true, description: '三行人话摘要，用 markdown 无序列表逐行写：`- 要做什么（大白话）`、`- 为什么要你决定/有什么代价`、`- 不做会怎样`。不要写命令、日志、代码。' },
        detail: { type: 'string', required: true, description: '技术细节（可写命令、影响面、回滚方案、时间点）——这部分会被折叠，董事会想看才展开。' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.requestApproval(actorOf(), {
        kind: args.kind as ApprovalKind,
        title: args.title,
        ask: args.ask,
        summary: args.summary,
        detail: args.detail,
      })),
    }),

    defineTool({
      name: 'company_doc_list',
      description: '列出资料库文档（可按项目过滤）与你有权访问的项目清单。',
      parameters: {
        project_id: { type: 'string', description: '可选：只看某个项目' },
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const projects = service.projects()
          .map((project) => `- [项目] ${project.name}（${project.id}，我的权限：${service.accessOf(agentId, project.id)}）`)
        const docs = service.docs(args.project_id)
          .filter((doc) => service.accessOf(agentId, doc.projectId) !== 'none')
          .map((doc) => `- [资料] ${doc.title}（${doc.id}，路径 ${doc.path}）`)
        const all = [...projects, ...docs]
        return { ok: true, data: all.length === 0 ? '（资料库为空）' : all.join('\n') }
      }),
    }),

    defineTool({
      name: 'company_doc_read',
      description: '读取一篇资料的内容（需要读权限）。接手任务前先读相关文档。',
      parameters: {
        doc_id: { type: 'string', required: true, description: '资料 ID' },
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const result = await service.readDoc(actorOf(), args.doc_id)
        if (!result.ok || result.data === undefined) return result
        return { ok: true, data: `# ${result.data.doc.title}\n\n${result.data.content}` }
      }),
    }),

    defineTool({
      name: 'company_doc_write',
      description: '新建或覆盖一篇资料（需要写权限；无权限时先 company_approval_request）。路径相对项目/资料库根目录。',
      parameters: {
        path: { type: 'string', required: true, description: '相对路径，如 reports/2026-09-19-daily.md' },
        content: { type: 'string', required: true, description: 'Markdown 正文' },
        title: { type: 'string', description: '可选标题，默认用路径' },
        project_id: { type: 'string', description: '可选：写进某个项目，缺省写进公司资料库' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.writeDoc(actorOf(), {
        projectId: args.project_id ?? null,
        path: args.path,
        content: args.content,
        ...(args.title !== undefined ? { title: args.title } : {}),
      })),
    }),

    defineTool({
      name: 'company_schedule_create',
      description: '给自己配一个定时任务。kind=cron 用五段 cron（如 "0 9 * * *"），kind=every 给秒数（≥60），kind=at 给 ISO 时间戳。到点会把 prompt 投给你自己。',
      parameters: {
        kind: { type: 'string', required: true, enum: ['cron', 'every', 'at'], description: '排程类型' },
        spec: { type: 'string', required: true, description: 'cron 表达式 / 秒数 / ISO 时间戳' },
        prompt: { type: 'string', required: true, description: '到点要做的事，写清楚步骤与产出要求' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.createSchedule(actorOf(), {
        agentId,
        kind: args.kind as ScheduleKind,
        spec: args.spec,
        prompt: args.prompt,
      })),
    }),

    defineTool({
      name: 'company_schedule_list',
      description: '查看你自己的定时任务与下次触发时间。',
      parameters: {},
      output: textOutput,
      execute: () => perform(async () => {
        const list = service.schedules(agentId).map((record) => {
          const spec = record.kind === 'cron' ? `cron ${record.cron}` : record.kind === 'every' ? `每 ${record.everySec}s` : `at ${record.at === null ? '' : new Date(record.at).toISOString()}`
          return `- ${record.id} [${record.enabled ? '启用' : '停用'}] ${spec} 下次 ${new Date(record.nextRunAt).toISOString()}：${record.prompt.slice(0, 80)}`
        })
        return { ok: true, data: list.length === 0 ? '（没有定时任务）' : list.join('\n') }
      }),
    }),

    defineTool({
      name: 'company_schedule_delete',
      description: '删除一个定时任务。',
      parameters: {
        schedule_id: { type: 'string', required: true, description: '排程 ID' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.deleteSchedule(args.schedule_id)),
    }),

    defineTool({
      name: 'company_help',
      description: '公司协作协议速查：什么时候用哪个工具、汇报与审批规则。不确定流程时调用。',
      parameters: {},
      output: textOutput,
      execute: () => perform(async () => ({ ok: true, data: service.protocolText(agentId) })),
    }),
  ]
  if (!canDispatch) {
    const hidden = new Set(['company_task_create', 'company_schedule_create', 'company_schedule_delete'])
    return tools.filter((tool) => !hidden.has((tool as { name?: string }).name ?? ''))
  }
  return tools
}

// ───────────────────────────── CEO / 频道 / 全局工具 ─────────────────────────────

const DISPATCH_DESC = '建任务并一步投递给指定员工（优先用它，而不是先 task_create 再 mail）。必须写清验收标准。'
const ANNOUNCE_DESC = '向某项目群（或大厅）发一条面向董事会的简报。员工汇报由公司自动转成简报，不要重复播报同一内容。'
const APPROVAL_DECIDE_DESC = '裁决送到你这里的审批（你是一审）。批准/驳回会自动把结果回投给发起人。'

/** CEO 专属工具（追加在员工工具之后）。 */
export function buildCeoExtras(service: CompanyService, agentId: string, parentSessionId?: string | null): ToolDefinition[] {
  const actorOf = (): Actor => {
    const record = service.agent(agentId)
    return { type: 'agent', id: agentId, name: record?.name ?? agentId }
  }
  const perform = async (run: () => Promise<ActionResult<unknown>>): Promise<string> => {
    if (!service.enabled) return '❌ company_disabled：公司模式当前已停用。'
    try {
      const result = await run()
      return result.ok
        ? `✅ ${typeof result.data === 'string' ? result.data : JSON.stringify(result.data)}`
        : `❌ ${result.code ?? 'error'}：${result.message ?? '操作被拒绝'}`
    } catch (error) {
      return `❌ internal_error：${error instanceof Error ? error.message : String(error)}`
    }
  }
  return [
    defineTool({
      name: 'company_dispatch',
      description: DISPATCH_DESC,
      parameters: {
        employee: { type: 'string', required: true, description: '负责人员工 ID 或名字' },
        title: { type: 'string', required: true, description: '任务标题' },
        desc: { type: 'string', required: true, description: '任务说明 + 验收标准' },
        project_id: { type: 'string', description: '可选：关联项目 ID' },
        priority: { type: 'integer', description: '优先级，默认 0' },
      },
      output: textOutput,
      execute: (args) => perform(async () => {
        const target = service.agents().find((record) => record.id === args.employee || record.name === args.employee)
        if (target === undefined) return { ok: false, code: 'unknown_employee', message: `找不到员工「${args.employee}」，用 company_org 查名册` }
        return service.dispatch(actorOf(), {
          employeeId: target.id,
          title: args.title,
          desc: args.desc,
          projectId: args.project_id ?? null,
          priority: args.priority ?? 0,
          parentSessionId: parentSessionId ?? null,
        })
      }),
    }),
    defineTool({
      name: 'company_announce',
      description: ANNOUNCE_DESC,
      parameters: {
        text: { type: 'string', required: true, description: '简报正文（markdown）' },
        project_id: { type: 'string', description: '目标项目 ID；缺省发到大厅' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.announce(actorOf(), args.project_id ?? null, args.text)),
    }),
    defineTool({
      name: 'company_hire_request',
      description: '提交招聘申请（你没有人事权，招人要董事会批准；批准后系统自动创建员工并入职）。写清岗位、职责与负责项目。',
      parameters: {
        name: { type: 'string', required: true, description: '新员工姓名' },
        title: { type: 'string', required: true, description: '职位（如 运维工程师）' },
        persona: { type: 'string', required: true, description: '岗位说明书：职责、边界、验收标准、汇报方式' },
        project_ids: { type: 'array', items: { type: 'string' }, description: '负责的项目 ID 列表（可多选）' },
        role: { type: 'string', description: '角色 key，缺省 engineer' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.requestApproval(actorOf(), {
        kind: 'hire',
        title: `招聘 ${args.name}（${args.title}）`,
        ask: `请批准招聘 ${args.name} 做${args.title}`,
        summary: [
          `- 招一个${args.title}，叫 ${args.name}，负责 ${(args.project_ids ?? []).join('、') || '（未指定项目）'}。`,
          '- 需要你点头：招人会增加长期成本与调度负担。',
          '- 不批就维持现有人手，相关活继续排在这些项目上。',
        ].join('\n'),
        detail: [
          `姓名：${args.name}`,
          `职位：${args.title}`,
          args.project_ids === undefined ? '负责项目：（未指定）' : `负责项目：${args.project_ids.join('、')}`,
          '岗位说明书：',
          args.persona,
          '',
          '董事会批准后系统将自动创建该员工并入职。',
        ].join('\n'),
        action: {
          kind: 'hire',
          payload: {
            name: args.name,
            title: args.title,
            role: args.role ?? 'engineer',
            managerId: null,
            projectIds: args.project_ids ?? [],
            persona: args.persona,
            provider: null,
            model: null,
            effort: null,
            presetId: null,
            dailyTokenCap: null,
          },
        },
      })),
    }),
    defineTool({
      name: 'company_approval_decide',
      description: APPROVAL_DECIDE_DESC,
      parameters: {
        approval_id: { type: 'string', required: true, description: '审批 ID' },
        approve: { type: 'boolean', required: true, description: 'true=批准，false=驳回' },
        note: { type: 'string', description: '决策说明（会回传给发起人）' },
      },
      output: textOutput,
      execute: (args) => perform(async () => service.decideApproval(args.approval_id, args.approve, args.note ?? '', actorOf())),
    }),
  ]
}

/** 频道（项目群/大厅）工具 = 员工通用工具（以 CEO 身份）+ CEO 专属。 */
export function buildChannelTools(service: CompanyService, project: ProjectRecord): ToolDefinition[] {
  const ceo = service.ceo()
  const actorId = ceo?.id ?? 'agt_ceo'
  // 群会话里派出去的活，任务是它的子代理（显示在「N 个子代理」里）
  return [...buildCompanyTools(service, actorId), ...buildCeoExtras(service, actorId, project.channelSessionId)]
}

/**
 * 全局派活工具（挂在用户的普通会话上）：@员工 或直呼其名即派活。
 * 不在公司员工/频道会话上注册。
 */
export function buildCallTool(service: CompanyService, parentSessionId?: string): ToolDefinition {
  return defineTool({
    name: 'company_call',
    description: '把一项工作派给公司里的员工或 CEO。当用户说「@某人做某事」「让某人做某事」时使用。完成后结果会以简报形式出现在对应的项目群会话里。',
    parameters: {
      employee: { type: 'string', required: true, description: '员工名字或 ID（如 陆遥、顾砚、司南）' },
      task: { type: 'string', required: true, description: '要做的事：背景、期望产出、截止时间' },
      project: { type: 'string', description: '可选：项目名或 ID（用于归口汇报）' },
    },
    output: textOutput,
    execute: async (args) => {
      if (!service.enabled) return '❌ 公司模式当前已停用（面板或 /company on 可启用）。'
      try {
        const target = service.agents().find((record) =>
          record.status !== 'terminated' && (record.id === args.employee || record.name === args.employee),
        )
        if (target === undefined) {
          const roster = service.agents().filter((record) => record.status !== 'terminated').map((record) => `${record.name}（${record.title}）`).join('、')
          return `❌ 找不到员工「${args.employee}」。当前名册：${roster === '' ? '（空）' : roster}`
        }
        const projectId = args.project === undefined
          ? target.projectIds[0] ?? null
          : service.projects().find((project) => project.id === args.project || project.name === args.project)?.id ?? null
        const result = await service.dispatch(BOARD, {
          employeeId: target.id,
          title: args.task.length > 60 ? `${args.task.slice(0, 60)}…` : args.task,
          desc: args.task,
          projectId,
          priority: 1,
          parentSessionId: parentSessionId ?? null,
        })
        if (!result.ok || result.data === undefined) return `❌ ${result.message ?? '派活失败'}`
        const project = result.data.projectId === null ? undefined : service.projects().find((entry) => entry.id === result.data!.projectId)
        const where = project === undefined ? '「一人公司 · 大厅」' : `「${project.name} · 项目群」`
        return `✅ 已派给 ${target.name}（任务 ${result.data.id}）。完成后简报会发到 ${where}。`
      } catch (error) {
        return `❌ internal_error：${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

/** 根会话提示词段（动态读名册）。 */
export function callPromptSection(service: CompanyService): () => string {
  return () => {
    if (!service.enabled) return ''
    const roster = service.agents()
      .filter((record) => record.status !== 'terminated')
      .map((record) => `${record.name}（${record.title}）`)
      .join('、')
    if (roster === '') return ''
    return [
      '## 一人公司',
      '本机运行着「一人公司」：用户可以 @员工名 或说「让某人做某事」来派活，此时你必须调用 `company_call` 工具完成转交（不要自己代做公司员工的活）。',
      `当前名册：${roster}。`,
      '派活后告诉用户：结果会以简报形式出现在对应项目群会话（或「一人公司 · 大厅」）。',
    ].join('\n')
  }
}
