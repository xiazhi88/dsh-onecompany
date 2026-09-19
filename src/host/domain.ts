/**
 * 公司领域（storage domain `onecompany` v1）：名册、项目、资料、任务、评论、
 * 信箱、审批、排程、工作日志、审计。全部业务状态都住在这里，不触碰会话事件
 * schema（"模型可见 ⟺ 已记录" 的边界保持干净）。
 */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import {
  zActivity, zAgent, zApproval, zComment, zDoc, zMessage, zProject,
  zSchedule, zTask, zWorklog,
} from '../shared/wire.ts'

/** 全局单例：公司开关与显示名。 */
export const zCompanyGlobal = z.object({
  enabled: z.boolean(),
  companyName: z.string(),
  createdAt: z.number(),
})

export type CompanyGlobal = z.infer<typeof zCompanyGlobal>

export const companyDomainSpec = defineDomain({
  name: 'onecompany',
  version: 1,
  global: {
    schema: zCompanyGlobal,
    initial: { enabled: true, companyName: '一人公司', createdAt: 0 } satisfies CompanyGlobal,
  },
  tables: {
    agents: domainTable<string, z.infer<typeof zAgent>>(zAgent),
    projects: domainTable<string, z.infer<typeof zProject>>(zProject),
    docs: domainTable<string, z.infer<typeof zDoc>>(zDoc),
    tasks: domainTable<string, z.infer<typeof zTask>>(zTask),
    comments: domainTable<string, z.infer<typeof zComment>>(zComment),
    messages: domainTable<string, z.infer<typeof zMessage>>(zMessage),
    approvals: domainTable<string, z.infer<typeof zApproval>>(zApproval),
    schedules: domainTable<string, z.infer<typeof zSchedule>>(zSchedule),
    worklogs: domainTable<string, z.infer<typeof zWorklog>>(zWorklog),
    activity: domainTable<string, z.infer<typeof zActivity>>(zActivity),
  },
})

export type CompanyDomainSpec = typeof companyDomainSpec
export type CompanyDomainHandle = Domain<CompanyDomainSpec>
