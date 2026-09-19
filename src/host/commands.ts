/**
 * `/company` 命令族：董事会（用户）不开模型轮次就能查状态、派活、审批、启停公司。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Actor, CompanyService } from './service.ts'
import { BOARD } from './service.ts'

const USAGE = [
  '/company status — 公司概况',
  '/company org — 组织架构',
  '/company tasks [done|todo|all] — 任务清单',
  '/company assign <员工> <任务标题> — 派活',
  '/company inbox — 董事会信箱',
  '/company approve <审批ID> [说明] — 批准',
  '/company reject <审批ID> [说明] — 驳回',
  '/company on | off — 启用/停用公司模式',
  '/call <员工名或ID> <任务描述> — 直接派活（等价于 @员工名）',
].join('\n')

/** 注册 /company 命令。 */
export function registerCompanyCommand(ctx: Context, service: CompanyService, log: (message: string) => void): void {
  ctx.commands.register({
    name: 'company',
    description: '一人公司：查看/派工/审批/启停',
    input: { hint: 'status | org | tasks | assign <员工> <任务> | inbox | approve <id> | reject <id> | on | off' },
    handler: async ({ rawInput }) => {
      const [sub = 'status', ...rest] = rawInput.trim().split(/\s+/)
      try {
        switch (sub) {
          case '': case 'status': {
            const state = service.snapshot()
            return success([
              `🏢 ${state.companyName}（${state.enabled ? '运行中' : '已停用'}） · 根目录 ${state.root}`,
              `员工 ${state.stats.agents} 人 · 进行中任务 ${state.stats.activeTasks} · 待审批 ${state.stats.pendingApprovals} · 今日 token ${state.stats.tokensToday}`,
              `今日完成 ${state.stats.doneToday} 项 · 未读来信 ${state.stats.unreadMail} 封`,
            ].join('\n'))
          }
          case 'org': {
            const lines = service.agents().map((record) => `- ${record.name}（${record.title}，${record.status}，模型 ${record.model ?? '默认'}）id=${record.id} · ${service.chainOf(record.id)}`)
            return success(lines.length === 0 ? '公司还没有员工，用 /company assign 前先在面板招聘。' : lines.join('\n'))
          }
          case 'tasks': {
            const filter = rest[0]
            const tasks = service.tasks()
              .filter((task) => filter === undefined || filter === 'all' || task.status === filter)
              .slice(0, 30)
            return success(tasks.length === 0
              ? '没有匹配的任务。'
              : tasks.map((task) => `[${task.status}] ${task.id} ${task.title} @${service.agent(task.assigneeId ?? '')?.name ?? '待认领'}`).join('\n'))
          }
          case 'assign': {
            const [name, ...titleParts] = rest
            const title = titleParts.join(' ')
            if (name === undefined || title === '') return failure('用法：/company assign <员工名或id> <任务标题>')
            const target = service.agents().find((record) => record.name === name || record.id === name)
            if (target === undefined) return failure(`找不到员工「${name}」，用 /company org 看看。`)
            const result = await service.createTask(BOARD, { title, assigneeId: target.id, desc: '由董事会通过 /company assign 指派。' })
            if (!result.ok || result.data === undefined) return failure(result.message ?? '派工失败')
            return success(`已把「${title}」派给 ${target.name}（任务 ${result.data.id}），信箱投递将在下个调度周期送达。`)
          }
          case 'inbox': {
            const inbox = service.messages({ toId: 'board' }).slice(0, 20)
            return success(inbox.length === 0
              ? '董事会信箱为空。'
              : inbox.map((message) => `[${message.status}] ${message.id} ← ${message.fromName}（${message.kind}）：${message.body.slice(0, 120)}`).join('\n'))
          }
          case 'approve': case 'reject': {
            const [id, ...noteParts] = rest
            if (id === undefined) return failure(`用法：/company ${sub} <审批ID> [说明]`)
            const result = await service.decideApproval(id, sub === 'approve', noteParts.join(' '))
            return result.ok ? success(`审批 ${id} 已${sub === 'approve' ? '批准' : '驳回'}，结果会投递给发起人。`) : failure(result.message ?? '裁决失败')
          }
          case 'on': case 'off': {
            const result = await service.setEnabled(sub === 'on')
            return result.ok ? success(sub === 'on' ? '公司模式已启用。' : '公司模式已停用：调度与投递已停、常驻员工已卸载，数据与会话原样保留。') : failure(result.message ?? '切换失败')
          }
          default:
            return failure(`未知子命令「${sub}」。\n${USAGE}`)
        }
      } catch (error) {
        log(`/company ${sub} 失败：${error instanceof Error ? error.message : String(error)}`)
        return failure(error instanceof Error ? error.message : String(error))
      }
    },
  })
}

/**
 * 注册 `/call <员工> <任务>`：不依赖任何 @ 菜单的确定性派活入口。
 * 与「@员工名」等价，但直接由命令分发，不经过模型。
 */
export function registerCallCommand(ctx: Context, service: CompanyService, log: (message: string) => void): void {
  ctx.commands.register({
    name: 'call',
    description: '把一项工作派给某位员工（或 CEO）',
    input: { hint: '<员工名或ID> <任务描述>' },
    handler: async ({ rawInput }) => {
      const trimmed = rawInput.trim()
      if (trimmed === '') return { kind: 'error', text: '用法：/call <员工名或ID> <任务描述>（用 /company org 看名册）' }
      const [who, ...rest] = trimmed.split(/\s+/)
      const task = rest.join(' ').trim()
      if (task === '') return { kind: 'error', text: `请补上任务描述：/call ${who} <任务描述>` }
      try {
        const target = service.agents().find((record) =>
          record.status !== 'terminated' && (record.id === who || record.name === who),
        )
        if (target === undefined) {
          const roster = service.agents().filter((record) => record.status !== 'terminated').map((record) => `${record.name}(${record.id})`).join('、')
          return { kind: 'error', text: `找不到员工「${who}」。名册：${roster === '' ? '（空）' : roster}` }
        }
        const result = await service.dispatch(BOARD, {
          employeeId: target.id,
          title: task.length > 60 ? `${task.slice(0, 60)}…` : task,
          desc: task,
          projectId: target.projectIds[0] ?? null,
          priority: 1,
        })
        if (!result.ok || result.data === undefined) return { kind: 'error', text: result.message ?? '派活失败' }
        const project = result.data.projectId === null ? undefined : service.projects().find((entry) => entry.id === result.data!.projectId)
        const where = project === undefined ? '「一人公司 · 大厅」' : `「${project.name} · 项目群」`
        return { kind: 'success', text: `已派给 ${target.name}（任务 ${result.data.id}）。完成后简报会发到 ${where}。` }
      } catch (error) {
        log(`/call 失败：${error instanceof Error ? error.message : String(error)}`)
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}

function success(text: string): { kind: 'success'; text: string } {
  return { kind: 'success', text }
}

function failure(text: string): { kind: 'error'; text: string } {
  return { kind: 'error', text }
}

/** 董事会动作的统一渲染（供面板复用）。 */
export function boardActor(): Actor {
  return BOARD
}
