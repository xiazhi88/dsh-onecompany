// src/host/typert.ts
import { z as z2 } from "zod";

// src/shared/wire.ts
import { z } from "zod";
var zAgentStatus = z.enum(["active", "paused", "terminated"]);
var zAccessLevel = z.enum(["none", "read", "write"]);
var zTaskStatus = z.enum(["todo", "in_progress", "blocked", "review", "done", "cancelled"]);
var zMailKind = z.enum(["info", "question", "request", "report", "announce", "approval_request", "approval_result", "task_notice", "system"]);
var zMailStatus = z.enum(["pending", "delivered", "read"]);
var zApprovalKind = z.enum(["hire", "spend", "strategy", "danger", "other"]);
var zApprovalStatus = z.enum(["pending", "approved", "rejected"]);
var zScheduleKind = z.enum(["cron", "every", "at"]);
var zPermissions = z.object({
  projects: z.record(z.string(), zAccessLevel),
  tools: z.array(z.string()),
  canHire: z.boolean(),
  canApprove: z.boolean()
});
var zAgent = z.object({
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
  updatedAt: z.number()
});
var zProject = z.object({
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
  createdAt: z.number()
});
var zDoc = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  path: z.string(),
  tags: z.array(z.string()),
  createdBy: z.string(),
  updatedAt: z.number()
});
var zTask = z.object({
  id: z.string(),
  title: z.string(),
  desc: z.string(),
  assigneeId: z.string().nullable(),
  creatorType: z.enum(["board", "agent", "system"]),
  creatorId: z.string(),
  parentTaskId: z.string().nullable(),
  projectId: z.string().nullable(),
  status: zTaskStatus,
  priority: z.number(),
  dueAt: z.number().nullable(),
  checkoutBy: z.string().nullable(),
  checkoutAt: z.number().nullable(),
  result: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  doneAt: z.number().nullable()
});
var zComment = z.object({
  id: z.string(),
  taskId: z.string(),
  authorType: z.enum(["board", "agent", "system"]),
  authorId: z.string(),
  authorName: z.string(),
  text: z.string(),
  createdAt: z.number()
});
var zMessage = z.object({
  id: z.string(),
  fromType: z.enum(["board", "agent", "system"]),
  fromId: z.string(),
  fromName: z.string(),
  toType: z.enum(["board", "agent", "channel"]),
  toId: z.string(),
  kind: zMailKind,
  taskId: z.string().nullable(),
  body: z.string(),
  status: zMailStatus,
  createdAt: z.number(),
  deliveredAt: z.number().nullable()
});
var zApproval = z.object({
  id: z.string(),
  kind: zApprovalKind,
  /** 批准后由服务自动执行的结构化动作（如 hire），null = 纯人工动作。 */
  action: z.object({ kind: z.string(), payload: z.unknown() }).nullable().default(null),
  title: z.string(),
  detail: z.string(),
  requesterType: z.enum(["board", "agent", "system"]),
  requesterId: z.string(),
  requesterName: z.string(),
  status: zApprovalStatus,
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.number(),
  decidedAt: z.number().nullable()
});
var zSchedule = z.object({
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
  createdAt: z.number()
});
var zWorklog = z.object({
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
  updatedAt: z.number()
});
var zActivity = z.object({
  id: z.string(),
  at: z.number(),
  actorType: z.enum(["board", "agent", "system"]),
  actorId: z.string(),
  actorName: z.string(),
  action: z.string(),
  detail: z.string()
});
var zCompanyState = z.object({
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
    cacheWriteToday: z.number()
  })
});
var zActionResult = z.object({
  ok: z.boolean(),
  code: z.string().optional(),
  message: z.string().optional(),
  data: z.unknown().optional()
});
var zHireInput = z.object({
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
  permissions: zPermissions.partial().optional()
});
var zAgentPatch = zHireInput.partial().extend({
  status: zAgentStatus.optional(),
  permissions: zPermissions.optional()
});
var zTaskInput = z.object({
  title: z.string(),
  desc: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  priority: z.number().optional(),
  dueAt: z.number().nullable().optional(),
  parentTaskId: z.string().nullable().optional()
});
var zScheduleInput = z.object({
  agentId: z.string(),
  kind: zScheduleKind,
  spec: z.string(),
  prompt: z.string()
});
var zMailInput = z.object({
  toId: z.string(),
  kind: zMailKind,
  body: z.string(),
  taskId: z.string().nullable().optional()
});
var zApprovalInput = z.object({
  kind: zApprovalKind,
  title: z.string(),
  detail: z.string(),
  agentId: z.string().nullable().optional(),
  action: z.object({ kind: z.string(), payload: z.unknown() }).nullable().optional()
});

// src/host/typert.ts
var PKG = "dsh-onecompany";
var zAck = z2.object({
  ok: z2.boolean(),
  code: z2.string().optional(),
  message: z2.string().optional(),
  id: z2.string().optional()
});
var zDocResult = z2.object({
  ok: z2.boolean(),
  title: z2.string().optional(),
  path: z2.string().optional(),
  content: z2.string().optional(),
  code: z2.string().optional(),
  message: z2.string().optional()
});
var zTickResult = z2.object({ schedules: z2.number(), delivered: z2.number() });
var zTaskPatch = z2.object({
  status: z2.enum(["todo", "in_progress", "blocked", "review", "done", "cancelled"]).optional(),
  result: z2.string().optional(),
  assigneeId: z2.union([z2.string(), z2.null()]).optional(),
  priority: z2.number().optional(),
  checkout: z2.boolean().optional()
});
var zProjectInput = z2.object({
  name: z2.string(),
  description: z2.string().optional(),
  defaultAcl: z2.enum(["none", "read", "write"]).optional(),
  repoPath: z2.union([z2.string(), z2.null()]).optional()
});
var zDocInput = z2.object({
  projectId: z2.union([z2.string(), z2.null()]),
  path: z2.string(),
  content: z2.string(),
  title: z2.string().optional()
});
var codec = (typeSymbol, schema) => ({ mode: "strict", typeSymbol: `${PKG}#${typeSymbol}`, schema });
var STATE = codec("CompanyState", zCompanyState);
var ACK = codec("CompanyAck", zAck);
var DOC = codec("CompanyDoc", zDocResult);
var TICK = codec("CompanyTick", zTickResult);
var HIRE = codec("HireInput", zHireInput);
var PATCH = codec("AgentPatch", zAgentPatch);
var TASK = codec("TaskInput", zTaskInput);
var TASK_PATCH = codec("TaskPatch", zTaskPatch);
var MAIL = codec("MailInput", zMailInput);
var APPROVAL = codec("ApprovalInput", zApprovalInput);
var SCHEDULE = codec("ScheduleInput", zScheduleInput);
var PROJECT = codec("ProjectInput", zProjectInput);
var DOC_INPUT = codec("DocInput", zDocInput);
var STRING = codec("Text", z2.string());
var BOOL = codec("Flag", z2.boolean());
var APPROVE = codec("ApprovalDecision", z2.boolean());
var param = (name, c, optional = false) => ({ name, wire: name, source: "json", codec: c, ...optional ? { acceptsUndefined: true } : {} });
var invocation = (method, parameters, result) => ({
  id: `${PKG}#company/${method}`,
  service: "company",
  namespace: "company",
  method,
  invocation: { kind: "direct" },
  parameters,
  result
});
var TYPERT = {
  package: PKG,
  face: "host",
  schemas: [],
  invocations: [
    invocation("remoteState", [], STATE),
    invocation("setEnabled", [param("on", BOOL)], ACK),
    invocation("tickNow", [], TICK),
    invocation("hire", [param("input", HIRE)], ACK),
    invocation("patchAgent", [param("id", STRING), param("patch", PATCH)], ACK),
    invocation("terminate", [param("id", STRING)], ACK),
    invocation("nudge", [param("agentId", STRING), param("text", STRING)], ACK),
    invocation("assign", [param("input", TASK)], ACK),
    invocation("updateTaskRemote", [param("id", STRING), param("patch", TASK_PATCH)], ACK),
    invocation("commentTaskRemote", [param("id", STRING), param("text", STRING)], ACK),
    invocation("mail", [param("input", MAIL)], ACK),
    invocation("decideApproval", [param("id", STRING), param("approve", APPROVE), param("note", STRING, true)], ACK),
    invocation("createProjectRemote", [param("input", PROJECT)], ACK),
    invocation("writeDocRemote", [param("input", DOC_INPUT)], ACK),
    invocation("readDocRemote", [param("docId", STRING)], DOC),
    invocation("createScheduleRemote", [param("input", SCHEDULE)], ACK),
    invocation("deleteSchedule", [param("id", STRING)], ACK),
    invocation("approvals", [], codec("Approvals", z2.array(z2.record(z2.string(), z2.unknown())))),
    invocation("requestApprovalRemote", [param("input", APPROVAL)], ACK)
  ],
  model: {
    services: [{
      key: "company",
      exportName: "CompanyService",
      tags: [],
      description: "\u4E00\u4EBA\u516C\u53F8\u670D\u52A1\uFF08ctx.company\uFF09\uFF1A\u540D\u518C\u3001\u4EFB\u52A1\u3001\u4FE1\u7BB1\u3001\u5BA1\u6279\u3001\u6392\u7A0B\u3001\u8D44\u6599\u5E93\u4E0E\u5DE5\u4F5C\u65E5\u5FD7\u7684\u552F\u4E00\u6743\u5A01\u3002",
      summary: "\u4E00\u4EBA\u516C\u53F8\u670D\u52A1 (one-person company orchestration service)\u3002",
      members: [
        { name: "remoteState", signature: "remoteState(): CompanyState", kind: "method" },
        { name: "setEnabled", signature: "setEnabled(on: boolean): Promise<Ack>", kind: "method" },
        { name: "hire", signature: "hire(input: HireInput): Promise<Ack>", kind: "method" },
        { name: "assign", signature: "assign(input: TaskInput): Promise<Ack>", kind: "method" },
        { name: "nudge", signature: "nudge(agentId: string, text: string): Promise<Ack>", kind: "method" }
      ],
      types: []
    }],
    events: [],
    objects: []
  }
};
var typert_default = TYPERT;
export {
  TYPERT,
  typert_default as default
};
