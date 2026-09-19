/**
 * 公司领域线上类型（单一事实源）：host 的 storage domain 表、Typert Remote 的
 * 编解码 codec、client 半的类型，全部从这里的 zod schema 推导。
 */
import { z } from 'zod'

export const zAgentStatus = z.enum(['active', 'paused', 'terminated'])
export const zAccessLevel = z.enum(['none', 'read', 'write'])
export const zTaskStatus = z.enum(['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'])
export const zMailKind = z.enum(['info', 'question', 'request', 'report', 'announce', 'approval_request', 'approval_result', 'task_notice', 'system'])
export const zMailStatus = z.enum(['pending', 'delivered', 'read'])
export const zApprovalKind = z.enum(['hire', 'spend', 'strategy', 'danger', 'other'])
export const zApprovalStatus = z.enum(['pending', 'approved', 'rejected'])
export const zScheduleKind = z.enum(['cron', 'every', 'at'])

export const zPermissions = z.object({
  /** 是否允许给他人派活/建任务（董事会永远可以；员工默认没有，CEO 有）。 */
  canDispatch: z.boolean().default(false),
  projects: z.record(z.string(), zAccessLevel),
  tools: z.array(z.string()),
  canHire: z.boolean(),
  canApprove: z.boolean(),
})

export const zAgent = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  role: z.string(),
  managerId: z.string().nullable(),
  /** 负责的项目（多选）。 */
  projectIds: z.array(z.string()).default([]),
  presetId: z.string().nullable(),
  persona: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  effort: z.string().nullable(),
  sessionId: z.string(),
  cwd: z.string(),
  provisionedAt: z.number().nullable(),
  status: zAgentStatus,
  permissions: zPermissions,
  dailyTokenCap: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const zProject = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rootPath: z.string(),
  /** 代码仓库路径（员工工作目录）；公司档案目录仍是 rootPath。 */
  repoPath: z.string().nullable(),
  /** 项目群会话 id（CEO 项目实例驱动；null = 尚未创建）。 */
  channelSessionId: z.string().nullable().default(null),
  acl: z.record(z.string(), zAccessLevel),
  defaultAcl: zAccessLevel,
  createdBy: z.string(),
  createdAt: z.number(),
})

export const zDoc = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  path: z.string(),
  tags: z.array(z.string()),
  createdBy: z.string(),
  updatedAt: z.number(),
})

export const zTask = z.object({
  id: z.string(),
  title: z.string(),
  desc: z.string(),
  assigneeId: z.string().nullable(),
  creatorType: z.enum(['board', 'agent', 'system']),
  creatorId: z.string(),
  parentTaskId: z.string().nullable(),
  projectId: z.string().nullable(),
  status: zTaskStatus,
  priority: z.number(),
  dueAt: z.number().nullable(),
  checkoutBy: z.string().nullable(),
  /** 一次性执行会话 id（per-task 模式）；null = 尚未创建或走常驻工位。 */
  sessionId: z.string().nullable().default(null),
  /**
   * 执行会话的父会话：任务会话以 `origin: 'subagent'` 挂在这个会话下，
   * 于是它不进侧栏，只显示在父会话标题栏的「N 个子代理」里。
   */
  parentSessionId: z.string().nullable().default(null),
  checkoutAt: z.number().nullable(),
  result: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  doneAt: z.number().nullable(),
})

export const zComment = z.object({
  id: z.string(),
  taskId: z.string(),
  authorType: z.enum(['board', 'agent', 'system']),
  authorId: z.string(),
  authorName: z.string(),
  text: z.string(),
  createdAt: z.number(),
})

export const zMessage = z.object({
  id: z.string(),
  fromType: z.enum(['board', 'agent', 'system']),
  fromId: z.string(),
  fromName: z.string(),
  toType: z.enum(['board', 'agent', 'channel']),
  toId: z.string(),
  kind: zMailKind,
  taskId: z.string().nullable(),
  body: z.string(),
  status: zMailStatus,
  createdAt: z.number(),
  deliveredAt: z.number().nullable(),
})

export const zApproval = z.object({
  id: z.string(),
  kind: zApprovalKind,
  /** 批准后由服务自动执行的结构化动作（如 hire），null = 纯人工动作。 */
  action: z.object({ kind: z.string(), payload: z.unknown() }).nullable().default(null),
  /** 一句话：要董事会决定什么（面向非技术读者的行动请求）。 */
  ask: z.string().default(''),
  /** 三行以内的人话摘要：做什么 / 为什么要你决定 / 不批会怎样。 */
  summary: z.string().default(''),
  title: z.string(),
  detail: z.string(),
  requesterType: z.enum(['board', 'agent', 'system']),
  requesterId: z.string(),
  requesterName: z.string(),
  status: zApprovalStatus,
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.number(),
  decidedAt: z.number().nullable(),
})

export const zSchedule = z.object({
  id: z.string(),
  agentId: z.string(),
  kind: zScheduleKind,
  cron: z.string().nullable(),
  everySec: z.number().nullable(),
  at: z.number().nullable(),
  timeZone: z.string(),
  prompt: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.number(),
  lastRunAt: z.number().nullable(),
  lastOutcome: z.string().nullable(),
  createdAt: z.number(),
})

export const zWorklog = z.object({
  key: z.string(),
  agentId: z.string(),
  date: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  reasoningTokens: z.number(),
  turns: z.number(),
  activeMs: z.number(),
  sessions: z.array(z.string()),
  updatedAt: z.number(),
})

export const zActivity = z.object({
  id: z.string(),
  at: z.number(),
  actorType: z.enum(['board', 'agent', 'system']),
  actorId: z.string(),
  actorName: z.string(),
  action: z.string(),
  detail: z.string(),
})

/** 面板一次拉取的完整快照。 */
export const zCompanyState = z.object({
  enabled: z.boolean(),
  companyName: z.string(),
  root: z.string(),
  tickMs: z.number(),
  now: z.number(),
  today: z.string(),
  agents: z.array(zAgent),
  projects: z.array(zProject),
  docs: z.array(zDoc),
  tasks: z.array(zTask),
  comments: z.array(zComment),
  messages: z.array(zMessage),
  approvals: z.array(zApproval),
  schedules: z.array(zSchedule),
  worklogs: z.array(zWorklog),
  activity: z.array(zActivity),
  residentIds: z.array(z.string()),
  /** 当前汇报投递模式（digest/record），面板展示用。 */
  reportDelivery: z.string(),
  /** 定时任务时区（cron 解释用）。 */
  timeZone: z.string(),
  /** 内容指纹：变化才需要重渲染（客户端据此跳过无变化的轮询结果）。 */
  revision: z.string(),
  stats: z.object({
    agents: z.number(),
    activeTasks: z.number(),
    doneToday: z.number(),
    pendingApprovals: z.number(),
    unreadMail: z.number(),
    tokensToday: z.number(),
    inputToday: z.number(),
    outputToday: z.number(),
    cacheReadToday: z.number(),
    cacheWriteToday: z.number(),
  }),
})

export type AgentStatus = z.infer<typeof zAgentStatus>
export type AccessLevel = z.infer<typeof zAccessLevel>
export type TaskStatus = z.infer<typeof zTaskStatus>
export type MailKind = z.infer<typeof zMailKind>
export type ApprovalKind = z.infer<typeof zApprovalKind>
export type ScheduleKind = z.infer<typeof zScheduleKind>
export type Permissions = z.infer<typeof zPermissions>
export type AgentRecord = z.infer<typeof zAgent>
export type ProjectRecord = z.infer<typeof zProject>
export type DocRecord = z.infer<typeof zDoc>
export type TaskRecord = z.infer<typeof zTask>
export type CommentRecord = z.infer<typeof zComment>
export type MessageRecord = z.infer<typeof zMessage>
export type ApprovalRecord = z.infer<typeof zApproval>
export type ScheduleRecord = z.infer<typeof zSchedule>
export type WorklogRecord = z.infer<typeof zWorklog>
export type ActivityRecord = z.infer<typeof zActivity>
export type CompanyState = z.infer<typeof zCompanyState>

/** 工具/命令统一动作结果（host 与 client 共用）。 */
export interface ActionResult<T = unknown> {
  ok: boolean
  code?: string
  message?: string
  data?: T
}

export const zActionResult = z.object({
  ok: z.boolean(),
  code: z.string().optional(),
  message: z.string().optional(),
  data: z.unknown().optional(),
})

/** 入职输入。 */
export const zHireInput = z.object({
  name: z.string(),
  title: z.string(),
  role: z.string(),
  managerId: z.string().nullable(),
  projectIds: z.array(z.string()).optional(),
  persona: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  effort: z.string().nullable(),
  presetId: z.string().nullable(),
  dailyTokenCap: z.number().nullable(),
  permissions: zPermissions.partial().optional(),
})
export type HireInput = z.infer<typeof zHireInput>

/** 员工可写字段补丁。 */
export const zAgentPatch = zHireInput.partial().extend({
  status: zAgentStatus.optional(),
  permissions: zPermissions.optional(),
})
export type AgentPatch = z.infer<typeof zAgentPatch>

export const zTaskInput = z.object({
  title: z.string(),
  desc: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  priority: z.number().optional(),
  dueAt: z.number().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  /** 派发它的会话：任务会话会成为该会话的子代理（不进侧栏）。 */
  parentSessionId: z.string().nullable().optional(),
})
export type TaskInput = z.infer<typeof zTaskInput>

export const zScheduleInput = z.object({
  agentId: z.string(),
  kind: zScheduleKind,
  spec: z.string(),
  prompt: z.string(),
})
export type ScheduleInput = z.infer<typeof zScheduleInput>

export const zMailInput = z.object({
  toId: z.string(),
  kind: zMailKind,
  body: z.string(),
  taskId: z.string().nullable().optional(),
})
export type MailInput = z.infer<typeof zMailInput>

export const zApprovalInput = z.object({
  kind: zApprovalKind,
  title: z.string(),
  /** 一句话行动请求：董事会要点头/摇头的是什么。 */
  ask: z.string().optional(),
  /** 人话摘要（≤3 行）：做什么 / 为什么要你决定 / 不批会怎样。 */
  summary: z.string().optional(),
  detail: z.string(),
  agentId: z.string().nullable().optional(),
  action: z.object({ kind: z.string(), payload: z.unknown() }).nullable().optional(),
})
export type ApprovalInput = z.infer<typeof zApprovalInput>
