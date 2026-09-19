/**
 * 官方类型包的集中引入：这些包的 .d.ts 自带 `declare module '@deepseek-ai/cordis'`
 * 服务键扩充，必须在编译程序里出现一次，`ctx.agents`/`ctx.commands`/`ctx.tools`
 * 等站位的类型才成立。
 */
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** cordis-plugin-timer 提供的托底定时器：返回 disposer。 */
    setInterval(callback: () => void, delay: number): () => void
    /** cordis-plugin-timer 提供的托底定时器：返回 disposer。 */
    setTimeout(callback: () => void, delay: number): () => void
  }
}
