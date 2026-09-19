/**
 * 根会话注入器：给用户的普通会话挂上 `company_call` 工具与一小段提示词，
 * 让「@员工名 / 让某人做某事」在任何会话里都能派活。公司员工与频道会话不注入。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CompanyService } from './service.ts'
import { buildCallTool, callPromptSection } from './tools.ts'
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
