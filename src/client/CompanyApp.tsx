/**
 * 公司整页外壳：顶栏（品牌 / 公司名 / 开关 / 刷新 / 关闭）+ 左侧导航 + 内容区。
 * 注册进 `shell.overlay`，关闭时渲染 null（不占位、不拦截点击）。
 */
import React, { useEffect, useState } from 'react'
import type { CompanyRemote, PanelStore, ViewId } from './store.ts'
import { fmtTokens, pendingApprovals } from './store.ts'
import { Btn, NavIcon, Pill, Toast, usePanel } from './ui.tsx'
import { Overview } from './views/Overview.tsx'
import { Org } from './views/Org.tsx'
import { Tasks } from './views/Tasks.tsx'
import { Approvals } from './views/Approvals.tsx'
import { Library } from './views/Library.tsx'
import { Activity } from './views/Activity.tsx'
import { EmployeeDetail } from './views/EmployeeDetail.tsx'

const NAV: { id: ViewId; label: string }[] = [
  { id: 'overview', label: '总览' },
  { id: 'org', label: '组织' },
  { id: 'tasks', label: '任务' },
  { id: 'approvals', label: '审批' },
  { id: 'library', label: '资料库' },
  { id: 'activity', label: '动态' },
]

/** 公司整页组件。 */
export function CompanyApp(props: { store: PanelStore }): React.ReactElement | null {
  const { store } = props
  const panel = usePanel(store)
  const [agentDetailId, setAgentDetailId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && store.getSnapshot().open) {
        event.stopPropagation()
        store.setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [store])

  if (!panel.open) return null

  const state = panel.state
  const pending = state === undefined || state === null ? 0 : pendingApprovals(state).length

  return (
    <div className="oc-root" role="dialog" aria-label="一人公司">
      <div className="oc-shell">
        <header className="oc-topbar">
          <span className="oc-brand">
            <span className="oc-brand__mark">司</span>
            <span className="oc-brand__stack">
              <span className="oc-brand__title">{state?.companyName ?? '一人公司'}</span>
              <span className="oc-brand__sub">
                {state === null ? '连接中…' : `员工 ${state.stats.agents} · 进行中任务 ${state.stats.activeTasks} · 今日 ${fmtTokens(state.stats.tokensToday)} tokens`}
              </span>
            </span>
          </span>
          <span className="oc-topbar__spacer" />
          {state !== null && (
            <Pill tone={state.enabled ? 'ok' : 'warn'}>{state.enabled ? '运行中' : '已停用'}</Pill>
          )}
          {panel.error !== null && <Pill tone="err">{panel.error}</Pill>}
          <Btn size="sm" onClick={() => { void store.act('手动调度', (api: CompanyRemote) => api.tickNow().then((result) => ({ ok: true, message: `投递 ${result.delivered} 条` }))) }}>立即调度</Btn>
          <Btn size="sm" onClick={() => { void store.refresh() }} disabled={panel.loading}>{panel.loading ? '刷新中' : '刷新'}</Btn>
          <Btn
            size="sm"
            variant={state?.enabled === true ? 'danger' : 'primary'}
            onClick={() => { void store.act(state?.enabled === true ? '停用公司模式' : '启用公司模式', (api: CompanyRemote) => api.setEnabled(state?.enabled !== true)) }}
          >
            {state?.enabled === true ? '停用' : '启用'}
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => store.setOpen(false)} title="关闭 (Esc)">✕</Btn>
        </header>

        <div className="oc-body">
          <nav className="oc-nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`oc-nav__item ${panel.view === item.id ? 'oc-nav__item--active' : ''}`}
                onClick={() => store.setView(item.id)}
                type="button"
              >
                <NavIcon view={item.id} />
                <span>{item.label}</span>
                {item.id === 'approvals' && pending > 0 && <span className="oc-nav__count">{pending}</span>}
              </button>
            ))}
          </nav>

          <main className="oc-main">
            {state === null
              ? (
                <div className="oc-empty">
                  {panel.error === 'company-remote-pending'
                    ? '正在连接公司服务…（host 半或 Remote 面尚未就绪，稍候会自动重试）'
                    : panel.error ?? '正在读取公司状态…'}
                </div>
              )
              : (
                <>
                  {!state.enabled && (
                    <div className="oc-notice">
                      <Pill tone="warn">公司模式已停用</Pill>
                      <span className="oc-muted">调度与信箱投递已停止，员工已卸载；数据与会话原样保留。点右上「启用」随时恢复。</span>
                    </div>
                  )}
                  {panel.view === 'overview' && <Overview state={state} onNavigate={(view) => store.setView(view)} />}
                  {panel.view === 'org' && <Org state={state} store={store} />}
                  {panel.view === 'tasks' && <Tasks state={state} store={store} onOpenAgent={setAgentDetailId} />}
                  {panel.view === 'approvals' && <Approvals state={state} store={store} />}
                  {panel.view === 'library' && <Library state={state} store={store} />}
                  {panel.view === 'activity' && <Activity state={state} store={store} />}
                </>
              )}
          </main>
        </div>

        {panel.toast !== null && <Toast text={panel.toast.text} kind={panel.toast.kind} />}
        {agentDetailId !== null && state !== null && (() => {
          const agent = state.agents.find((entry) => entry.id === agentDetailId)
          if (agent === undefined) return null
          return <EmployeeDetail state={state} store={store} agent={agent} onClose={() => setAgentDetailId(null)} />
        })()}
      </div>
    </div>
  )
}
