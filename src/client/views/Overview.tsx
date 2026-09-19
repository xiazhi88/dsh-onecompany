/** 总览：关键指标、今日 token 结构、员工效率榜、最近动态。 */
import React from 'react'
import type { CompanyState } from '../../shared/wire.ts'
import { Avatar, Card, Empty, Pill, SectionTitle, Stat, StatusDot } from '../ui.tsx'
import { fmtDuration, fmtNumber, fmtTime, fmtTokens, worklogOf } from '../store.ts'
import type { ViewId } from '../store.ts'

const COLORS = { input: '#5b86ff', output: '#43be86', cacheRead: '#8b6cf0', cacheWrite: '#dda63f' }

/** 把 token 分桶渲染成一条比例条 + 图例。 */
function TokenBar(props: { state: CompanyState }): React.ReactElement {
  const { stats } = props.state
  const total = Math.max(1, stats.tokensToday)
  const segments = [
    { key: 'input', label: '输入', value: stats.inputToday, color: COLORS.input },
    { key: 'output', label: '输出', value: stats.outputToday, color: COLORS.output },
    { key: 'cacheRead', label: '缓存读', value: stats.cacheReadToday, color: COLORS.cacheRead },
    { key: 'cacheWrite', label: '缓存写', value: stats.cacheWriteToday, color: COLORS.cacheWrite },
  ]
  return (
    <div>
      <div className="oc-tokenbar">
        {segments.map((segment) => (
          <div key={segment.key} className="oc-tokenbar__seg" style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }} />
        ))}
      </div>
      <div className="oc-legend">
        {segments.map((segment) => (
          <span key={segment.key} className="oc-legend__key">
            <span className="oc-legend__swatch" style={{ background: segment.color }} />
            {segment.label} {fmtTokens(segment.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 总览视图。 */
export function Overview(props: { state: CompanyState; onNavigate: (view: ViewId) => void }): React.ReactElement {
  const { state } = props
  const ranked = [...state.agents]
    .map((agent) => ({ agent, log: worklogOf(state, agent.id) }))
    .sort((a, b) => {
      const left = (a.log?.inputTokens ?? 0) + (a.log?.outputTokens ?? 0)
      const right = (b.log?.inputTokens ?? 0) + (b.log?.outputTokens ?? 0)
      return right - left
    })
  const recent = state.activity.slice(0, 8)

  return (
    <div className="oc-stack">
      <div className="oc-grid oc-grid--4">
        <Stat label="在职员工" value={state.stats.agents} hint={`常驻 ${state.residentIds.length} · 总计 ${state.agents.length}`} />
        <Stat label="进行中任务" value={state.stats.activeTasks} hint={`今日完成 ${state.stats.doneToday} 项`} />
        <Stat label="待董事会审批" value={state.stats.pendingApprovals} hint={`未读来信 ${state.stats.unreadMail} 封`} />
        <Stat label="今日 token" value={fmtTokens(state.stats.tokensToday)} hint={state.today} />
      </div>

      <Card title="今日 token 结构" extra={<span className="oc-card__sub">{fmtNumber(state.stats.tokensToday)} tokens</span>}>
        <TokenBar state={state} />
      </Card>

      <div className="oc-grid oc-grid--3">
        <Card title="员工效率">
          {ranked.length === 0
            ? <Empty>还没有员工。到「组织」页面招聘第一位同事。</Empty>
            : (
              <div className="oc-list">
                {ranked.map(({ agent, log }) => {
                  const tone = agent.status === 'terminated' ? 'dead' : agent.status === 'paused' ? 'off' : state.residentIds.includes(agent.id) ? 'on' : 'idle'
                  return (
                    <div className="oc-list__row" key={agent.id}>
                      <Avatar name={agent.name} />
                      <div className="oc-row__main">
                        <div className="oc-truncate" style={{ fontWeight: 550 }}>{agent.name}</div>
                        <div className="oc-stat__hint oc-truncate">{agent.title}</div>
                      </div>
                      <span className="oc-metric">
                        {fmtTokens((log?.inputTokens ?? 0) + (log?.outputTokens ?? 0))}
                        <span className="oc-metric__sub">{log?.turns ?? 0} 轮 · {fmtDuration(log?.activeMs ?? 0)}</span>
                      </span>
                      <StatusDot tone={tone} />
                    </div>
                  )
                })}
              </div>
            )}
        </Card>

        <Card title="最近动态" extra={<button className="oc-btn oc-btn--sm oc-btn--ghost" onClick={() => props.onNavigate('activity')} type="button">全部</button>}>
          {recent.length === 0
            ? <Empty>还没有活动记录。</Empty>
            : (
              <div className="oc-list">
                {recent.map((entry) => (
                  <div className="oc-list__row" key={entry.id}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="oc-truncate">{entry.detail}</div>
                      <div className="oc-stat__hint">{entry.actorName} · {entry.action}</div>
                    </div>
                    <span className="oc-muted" style={{ fontSize: 11 }}>{fmtTime(entry.at, state.now)}</span>
                  </div>
                ))}
              </div>
            )}
        </Card>

        <Card title="待办速览" extra={<button className="oc-btn oc-btn--sm oc-btn--ghost" onClick={() => props.onNavigate('tasks')} type="button">看板</button>}>
          {state.tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length === 0
            ? <Empty>没有未完成的任务。</Empty>
            : (
              <div className="oc-list">
                {state.tasks
                  .filter((task) => task.status !== 'done' && task.status !== 'cancelled')
                  .sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt)
                  .slice(0, 8)
                  .map((task) => (
                    <div className="oc-list__row" key={task.id}>
                      <div className="oc-row__main">
                        <div className="oc-truncate">{task.title}</div>
                        <div className="oc-stat__hint">{state.agents.find((a) => a.id === task.assigneeId)?.name ?? '待认领'}</div>
                      </div>
                      <Pill tone={task.status === 'blocked' ? 'err' : task.status === 'review' ? 'warn' : 'default'}>{task.status}</Pill>
                    </div>
                  ))}
              </div>
            )}
        </Card>
      </div>

      <div className="oc-meta">
        <span className="oc-meta__item">公司根目录 <span className="oc-mono">{state.root}</span></span>
        <span className="oc-meta__item">调度周期 {(state.tickMs / 1000).toFixed(0)}s</span>
        <span className="oc-meta__item">今日 {state.today}</span>
      </div>
    </div>
  )
}
