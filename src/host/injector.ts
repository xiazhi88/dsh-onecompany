/**
 * 根会话注入器：给用户的普通会话挂上 `company_call` 工具与一小段提示词，
 * 让「@员工名 / 让某人做某事」在任何会话里都能派活。公司员工与频道会话不注入。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CompanyService } from './service.ts'
import { buildCallTool, buildPromptForRole, buildToolsForRole, callPromptSection } from './tools.ts'
import { describe } from './driver.ts'

/**
 * 安装注入器：对现存与新建的根会话生效。
 * @param ctx - 宿主插件上下文。
 * @param service - 公司服务。
 * @param isOurs - 判断是否公司自有会话（员工工位/大厅/项目群，含创建中的）。
 * @param log - 诊断日志。
 */
export function installRootInjector(
  ctx: Context,
  service: CompanyService,
  isOurs: (sessionId: string) => boolean,
  log: (message: string) => void,
): void {
  const instrument = (agent: Agent): void => {
    try {
      if (isOurs(agent.session.id)) return
      // 派发时把「当前这个普通会话」作为父会话：任务会话会挂成它的子代理（不进侧栏）
      agent.ctx.tools.register(buildCallTool(service, agent.session.id))
      agent.ctx.systemPrompt.section({
        name: 'onecompany-call',
        order: 70,
        text: callPromptSection(service),
      })
    } catch (error) {
      log(`注入会话 ${agent.session.id} 失败：${describe(error)}`)
    }
  }

  // 新建的根会话
  ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
    if (!ctx.agents.roots().includes(agent)) return
    instrument(agent)
  }), 'onecompany: root injector')

  // 已经活着的根会话（插件随系统启动时大部分会话尚未创建，这里兜底现存的）
  for (const agent of ctx.agents.roots()) {
    instrument(agent)
  }
}


/**
 * 公司 agent 注入器：**公司工具与岗位提示词的唯一注册点**。
 *
 * 为什么放在 `agent/created` 而不是驱动器的 `setup`：`setup` 只有我在创建/恢复时才会被调用，
 * 而平台自己恢复会话（你在一个已停止的任务会话里发消息、冷读后继续对话）不走它——
 * 那些路径会把公司会话组合成普通 agent，company_* 全部 unknown tool（踩过两次）。
 * `agent/created` 覆盖**所有**注册路径（创建、我 resume、平台 resume），且平台保证它在
 * 首次提示词装配之前发生。
 * @param ctx - 宿主插件上下文。
 * @param service - 公司服务。
 * @param log - 诊断日志。
 */
export function installCompanyAgentInjector(
  ctx: Context,
  service: CompanyService,
  log: (message: string) => void,
): void {
  const instrument = (agent: Agent): void => {
    const role = service.companyRoleOf(agent.session.id)
    if (role === undefined) return
    try {
      for (const tool of buildToolsForRole(service, role, agent.session.id)) {
        agent.ctx.tools.register(tool)
      }
      agent.ctx.systemPrompt.section({
        name: 'onecompany-role',
        order: 60,
        text: buildPromptForRole(service, role),
      })
    } catch (error) {
      log(`公司 agent 注入失败（${agent.session.id}，${role.kind}）：${describe(error)}`)
    }
  }

  ctx.effect(() => ctx.on('agent/created', ({ agent }) => instrument(agent)), 'onecompany: company agent injector')

  // 插件启动时已经活着的公司 agent（先启动我们、后恢复它们的场景）
  for (const agent of ctx.agents.roots()) instrument(agent)
}
