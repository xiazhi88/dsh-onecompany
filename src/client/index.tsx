/**
 * dsh-onecompany 浏览器半：向宿主 web GUI 贡献
 *   1. `sidebar.footer.action` 的「公司」入口（含待审批角标）；
 *   2. `shell.overlay` 的公司整页（总览/组织/任务/审批/资料库/动态）。
 * 平台模块（react、ui-slots、ui-primitives）由 shell 模块表提供；其余全部内联。
 */
import React from 'react'
import type { CompanyRemote } from './store.ts'
import { companyRemoteOf, PanelStore, pendingApprovals, unreadBoardMail } from './store.ts'
import { TYPERT_REMOTE } from './remote.ts'
import { CompanyApp } from './CompanyApp.tsx'
import { usePanel } from './ui.tsx'
import styles from './styles.css'

/** 客户端上下文（只声明本插件用到的席位）。 */
interface ClientContext {
  effect: (callback: () => void | (() => void), label?: string) => void
  get: (key: string) => unknown
  slots: {
    inject: (name: string, factory: () => unknown) => () => void
    register: (spec: Record<string, unknown>, component: unknown) => unknown
  }
  remote: {
    $mount: (contribution: unknown) => Promise<() => Promise<void>>
  }
}

/** 需要的席位：槽位注册表与远程装配器。 */
export const inject = ['slots', 'remote', 'sessions', 'inputTriggers']

const STYLE_ID = 'onecompany-panel-styles'

/** 样式标签只注入一次。 */
function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-onecompany="${STYLE_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.onecompany = STYLE_ID
  tag.textContent = styles
  document.head.appendChild(tag)
}

/** 红点：待董事会裁决的审批数（0 不显示）。 */
function PendingDot(props: { count: number; className?: string }): React.ReactElement | null {
  if (props.count <= 0) return null
  return <span className={`oc-dot-badge ${props.className ?? ''}`}>{props.count > 9 ? '9+' : props.count}</span>
}

/** 侧栏底部入口：纯图标 + 审批红点（侧栏底部很挤，不放文字以免和其他插件互挤）。 */
function CompanyLauncher(props: { store: PanelStore; wide?: boolean }): React.ReactElement {
  const panel = usePanel(props.store)
  const state = panel.state
  const pending = state === null ? 0 : pendingApprovals(state).length
  const unread = state === null ? 0 : unreadBoardMail(state)
  const total = pending + unread
  const title = state === null
    ? '一人公司（加载中…）'
    : `一人公司 · ${state.stats.agents} 员工 · ${pending} 待批 · ${unread} 条未读消息 · 今日 ${state.stats.tokensToday} tokens`
  return (
    <button type="button" className="oc-launch oc-launch--compact" title={title} onClick={() => props.store.setOpen(true)}>
      <span className="oc-launch__mark">司</span>
      <PendingDot count={total} />
    </button>
  )
}

/** 会话标题栏入口（主入口：位置充裕、不与其他插件抢位）。 */
function CompanyHeaderAction(props: { store: PanelStore }): React.ReactElement {
  const panel = usePanel(props.store)
  const state = panel.state
  const pending = state === null ? 0 : pendingApprovals(state).length
  const unread = state === null ? 0 : unreadBoardMail(state)
  const total = pending + unread
  return (
    <button
      type="button"
      className={`oc-header-action ${total > 0 ? 'oc-header-action--alert' : ''}`}
      title={state === null ? '打开一人公司面板' : `一人公司 · ${state.stats.agents} 员工 · ${pending} 待批 · ${unread} 条未读 · 今日 ${state.stats.tokensToday} tokens`}
      onClick={() => props.store.setOpen(true)}
    >
      <span className="oc-header-action__mark">司</span>
      <span className="oc-header-action__text">公司</span>
      <PendingDot count={total} />
    </button>
  )
}

/**
 * 客户端插件主体：建 store、注册两个槽位。
 * @param ctx - 客户端根上下文。
 */
export async function apply(ctx: ClientContext): Promise<void> {
  await ctx.remote.$mount(TYPERT_REMOTE)
  ensureStyles()
  const sessions = ctx.get('sessions') as { open: (id: string) => void } | undefined
  const workspaces = ctx.get('workspaces') as ConstructorParameters<typeof PanelStore>[2]
  const store = new PanelStore(() => companyRemoteOf(ctx.get('remote.company')), sessions, workspaces)
  // 启动即拉一次状态：侧栏红点与摘要要在「没打开面板」时也准确。
  store.warm()

  const Launcher = (ownerProps: { wide?: boolean }): React.ReactElement => (
    <CompanyLauncher store={store} wide={ownerProps?.wide} />
  )
  const HeaderAction = (): React.ReactElement => <CompanyHeaderAction store={store} />
  const Panel = (): React.ReactElement | null => <CompanyApp store={store} />

  ctx.effect(() => {
    const disposeLauncher = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'onecompany',
      order: 40,
    }, Launcher))
    const disposePanel = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'onecompany',
      order: 60,
    }, Panel))
    // 主入口：会话标题栏（空间充裕，不与侧栏其他插件抢位）。
    const disposeHeader = ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'onecompany',
      order: 30,
    }, HeaderAction))
    return () => {
      disposeLauncher()
      disposePanel()
      disposeHeader()
    }
  }, 'onecompany: slots')

  // 「@员工」提及源：任意会话输入 @ 出现公司名册，选中插入 `@名字 `。
  registerMentionSource(ctx, store)
}

/** 名册提及源（与 ui-subagent 的 @ 源共存）。 */
interface MentionTriggerRegistry {
  registerSource: (source: unknown) => () => void
}

function registerMentionSource(ctx: ClientContext, store: PanelStore): void {
  // 与官方 ui-skill / ui-commands 一致：inputTriggers 走静态 inject，加载时已就绪。
  const triggers = ctx.get('inputTriggers') as MentionTriggerRegistry | undefined
  if (triggers === undefined) {
    console.warn('[onecompany] inputTriggers 服务不可用，@ 员工提及未注册（/call 命令仍可用）')
    return
  }

  let rosterCache: { id: string; name: string; title: string }[] | null = null
  let timer: number | null = null
  const warm = async (): Promise<void> => {
    try {
      // 必须经 companyRemoteOf 解包（remote 方法返回 {ok, value} 封套）
      const api = companyRemoteOf(ctx.get('remote.company'))
      if (api === undefined) return
      const state = await api.remoteState()
      rosterCache = state.agents
        .filter((record) => record.status !== 'terminated')
        .map((record) => ({ id: record.id, name: record.name, title: record.title }))
      console.log(`[onecompany] @ 名册已就绪：${rosterCache.map((entry) => entry.name).join('、')}`)
    } catch (error) {
      console.warn('[onecompany] @ 名册加载失败', error)
    }
  }

  const source = {
    trigger: '@',
    name: '员工', // 分组标题即此名（要在同一 trigger 下唯一）
    order: 20,
    async candidates(_session: unknown, { query }: { query: string }) {
      if (rosterCache === null) await warm()
      const roster = rosterCache ?? []
      const q = query.trim()
      // 候选字段只允许 name/description/icon/hint（写 detail 会被忽略）
      return roster
        .filter((entry) => q === '' || entry.name.includes(q) || entry.title.includes(q))
        .map((entry) => ({ name: entry.name, description: entry.title, hint: '派活' }))
    },
    lexicon() {
      return rosterCache === null ? undefined : rosterCache.map((entry) => entry.name)
    },
    subscribeLexicon(_session: unknown, listener: () => void) {
      if (timer !== null) window.clearInterval(timer)
      timer = window.setInterval(() => {
        const before = JSON.stringify(rosterCache?.map((entry) => entry.name) ?? null)
        void warm().then(() => {
          if (JSON.stringify(rosterCache?.map((entry) => entry.name) ?? null) !== before) listener()
        })
      }, 30_000)
      return () => {
        if (timer !== null) window.clearInterval(timer)
        timer = null
      }
    },
    onPick({ candidate }: { candidate: { name: string } }) {
      return { text: `@${candidate.name} ` }
    },
    codec: {
      clipboardText: (ref: string) => `@${ref}`,
      serialize: (ref: string) => Promise.resolve(`@${ref}`),
    },
  }

  ctx.effect(() => triggers.registerSource(source), 'onecompany: @ source')
  void warm()
}

export { CompanyApp } from './CompanyApp.tsx'
export { PanelStore } from './store.ts'
export { usePanel } from './ui.tsx'
export type { CompanyState } from '../shared/wire.ts'
