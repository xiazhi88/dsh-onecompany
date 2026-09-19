/**
 * Typert Host 面清单：浏览器半通过 `ctx.get('remote.company')` 调用这些方法。
 * 结构与 @deepseek-ai/dsh-typert-generator 的产物一致（手写版），codec 必须是
 * zod v4 实例。
 */
import { z } from 'zod'
import {
  zActionResult, zAgentPatch, zApprovalInput, zCompanyState, zHireInput, zMailInput,
  zScheduleInput, zTaskInput,
} from '../shared/wire.ts'

/** 每个 codec 的 package 前缀，保持与 loader 校验一致。 */
const PKG = 'dsh-onecompany'

const zAck = z.object({
  ok: z.boolean(),
  code: z.string().optional(),
  message: z.string().optional(),
  id: z.string().optional(),
})

const zDocResult = z.object({
  ok: z.boolean(),
  title: z.string().optional(),
  path: z.string().optional(),
  content: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
})

const zTickResult = z.object({ schedules: z.number(), delivered: z.number() })

const zTaskPatch = z.object({
  status: z.enum(['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled']).optional(),
  result: z.string().optional(),
  assigneeId: z.union([z.string(), z.null()]).optional(),
  priority: z.number().optional(),
  checkout: z.boolean().optional(),
})

const zProjectInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  defaultAcl: z.enum(['none', 'read', 'write']).optional(),
  repoPath: z.union([z.string(), z.null()]).optional(),
})

const zDocInput = z.object({
  projectId: z.union([z.string(), z.null()]),
  path: z.string(),
  content: z.string(),
  title: z.string().optional(),
})

const codec = <T>(typeSymbol: string, schema: z.ZodType<T>) => ({ mode: 'strict' as const, typeSymbol: `${PKG}#${typeSymbol}`, schema })

const STATE = codec('CompanyState', zCompanyState)
const ACK = codec('CompanyAck', zAck)
const DOC = codec('CompanyDoc', zDocResult)
const TICK = codec('CompanyTick', zTickResult)
const HIRE = codec('HireInput', zHireInput)
const PATCH = codec('AgentPatch', zAgentPatch)
const TASK = codec('TaskInput', zTaskInput)
const TASK_PATCH = codec('TaskPatch', zTaskPatch)
const MAIL = codec('MailInput', zMailInput)
const APPROVAL = codec('ApprovalInput', zApprovalInput)
const SCHEDULE = codec('ScheduleInput', zScheduleInput)
const PROJECT = codec('ProjectInput', zProjectInput)
const DOC_INPUT = codec('DocInput', zDocInput)
const STRING = codec('Text', z.string())
const BOOL = codec('Flag', z.boolean())
const APPROVE = codec('ApprovalDecision', z.boolean())

/** 一处声明参数，另一处声明 wire 字段名。 */
const param = <T>(name: string, c: { mode: 'strict'; typeSymbol: string; schema: z.ZodType<T> }, optional = false) =>
  ({ name, wire: name, source: 'json' as const, codec: c, ...(optional ? { acceptsUndefined: true as const } : {}) })

/** 只读与变更方法的统一声明体。 */
const invocation = (
  method: string,
  parameters: ReturnType<typeof param>[],
  result: { mode: 'strict'; typeSymbol: string; schema: z.ZodType<unknown> },
) => ({
  id: `${PKG}#company/${method}`,
  service: 'company',
  namespace: 'company',
  method,
  invocation: { kind: 'direct' as const },
  parameters,
  result,
})

/** Host 面清单。 */
export const TYPERT = {
  package: PKG,
  face: 'host' as const,
  schemas: [],
  invocations: [
    invocation('remoteState', [], STATE),
    invocation('setEnabled', [param('on', BOOL)], ACK),
    invocation('tickNow', [], TICK),
    invocation('hire', [param('input', HIRE)], ACK),
    invocation('patchAgent', [param('id', STRING), param('patch', PATCH)], ACK),
    invocation('terminate', [param('id', STRING)], ACK),
    invocation('nudge', [param('agentId', STRING), param('text', STRING)], ACK),
    invocation('assign', [param('input', TASK)], ACK),
    invocation('updateTaskRemote', [param('id', STRING), param('patch', TASK_PATCH)], ACK),
    invocation('commentTaskRemote', [param('id', STRING), param('text', STRING)], ACK),
    invocation('mail', [param('input', MAIL)], ACK),
    invocation('decideApproval', [param('id', STRING), param('approve', APPROVE), param('note', STRING, true)], ACK),
    invocation('createProjectRemote', [param('input', PROJECT)], ACK),
    invocation('writeDocRemote', [param('input', DOC_INPUT)], ACK),
    invocation('readDocRemote', [param('docId', STRING)], DOC),
    invocation('createScheduleRemote', [param('input', SCHEDULE)], ACK),
    invocation('deleteSchedule', [param('id', STRING)], ACK),
    invocation('markMessageRead', [param('id', STRING)], ACK),
    invocation('markAllBoardRead', [], ACK),
    invocation('setScheduleEnabledRemote', [param('id', STRING), param('enabled', BOOL)], ACK),
    invocation('approvals', [], codec('Approvals', z.array(z.record(z.string(), z.unknown())))),
    invocation('requestApprovalRemote', [param('input', APPROVAL)], ACK),
  ],
  model: {
    services: [{
      key: 'company',
      exportName: 'CompanyService',
      tags: [],
      description: '一人公司服务（ctx.company）：名册、任务、信箱、审批、排程、资料库与工作日志的唯一权威。',
      summary: '一人公司服务 (one-person company orchestration service)。',
      members: [
        { name: 'remoteState', signature: 'remoteState(): CompanyState', kind: 'method' },
        { name: 'setEnabled', signature: 'setEnabled(on: boolean): Promise<Ack>', kind: 'method' },
        { name: 'hire', signature: 'hire(input: HireInput): Promise<Ack>', kind: 'method' },
        { name: 'assign', signature: 'assign(input: TaskInput): Promise<Ack>', kind: 'method' },
        { name: 'nudge', signature: 'nudge(agentId: string, text: string): Promise<Ack>', kind: 'method' },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
}

export default TYPERT
