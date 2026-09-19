/** 动态：审计时间线 + 董事会信箱。 */
import React from 'react'
import type { CompanyState } from '../../shared/wire.ts'
import type { PanelStore } from '../store.ts'
import { fmtTime, nameOf } from '../store.ts'
import { Btn, Card, Empty, Expandable, Pill, SectionTitle } from '../ui.tsx'

/** 动态视图。 */
export function Activity(props: { state: CompanyState; store: PanelStore }): React.ReactElement {
  const { state, store } = props
  const inbox = state.messages.filter((message) => message.toType === 'board')

  return (
    <div className="oc-stack">
      <SectionTitle
        title="董事会信箱"
        sub={`${inbox.filter((message) => message.status !== 'read').length} 封未读 · 共 ${inbox.length} 封`}
        extra={inbox.some((message) => message.status !== 'read')
          ? <Btn size="sm" onClick={() => { void store.act('全部已读', (api) => api.markAllBoardRead()) }}>全部已读</Btn>
          : undefined}
      />
      {inbox.length === 0
        ? <Empty>信箱为空。员工汇报、求助、审批结果都会出现在这里。</Empty>
        : (
          <Card>
            <div className="oc-list">
              {inbox.slice(0, 20).map((message) => (
                <div className="oc-list__row" key={message.id}>
                  <Pill tone={message.status === 'read' ? 'default' : 'brand'}>{message.kind}</Pill>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Expandable text={message.body} collapsedLines={2} />
                    <div className="oc-stat__hint">
                      来自 {message.fromName}
                      {message.taskId === null ? '' : ` · 任务 ${message.taskId}`}
                      {' · '}{fmtTime(message.createdAt, state.now)}
                    </div>
                  </div>
                  {message.status !== 'read'
                    ? (
                      <Btn size="sm" onClick={() => { void store.act('标记已读', (api) => api.markMessageRead(message.id)) }}>标记已读</Btn>
                    )
                    : <span className="oc-muted" style={{ fontSize: 12 }}>已读</span>}
                </div>
              ))}
            </div>
          </Card>
        )}

      <SectionTitle title="审计时间线" sub={`最近 ${Math.min(state.activity.length, 60)} 条`} />
      <Card>
        {state.activity.length === 0
          ? <Empty>还没有活动。</Empty>
          : state.activity.slice(0, 60).map((entry) => (
            <div className="oc-timeline__row" key={entry.id}>
              <span className="oc-timeline__time">{new Date(entry.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <Pill tone={entry.actorType === 'board' ? 'brand' : 'default'}>{entry.actorName}</Pill>
              <span className="oc-mono oc-muted" style={{ width: 132, flex: 'none' }}>{entry.action}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{entry.detail}</span>
            </div>
          ))}
      </Card>

      <SectionTitle title="员工往来（最近）" sub={`${state.messages.length} 条`} />
      <Card>
        {state.messages.filter((message) => message.toType === 'agent').slice(0, 25).map((message) => (
          <div className="oc-timeline__row" key={message.id}>
            <span className="oc-timeline__time">{fmtTime(message.createdAt, state.now)}</span>
            <Pill>{message.kind}</Pill>
            <span className="oc-muted" style={{ flex: 'none' }}>{message.fromName} → {nameOf(state, message.toId)}</span>
            <span style={{ flex: 1, minWidth: 0 }}><Expandable text={message.body} collapsedLines={2} /></span>
            <Pill tone={message.status === 'delivered' ? 'ok' : message.status === 'read' ? 'default' : 'warn'}>{message.status}</Pill>
          </div>
        ))}
      </Card>
    </div>
  )
}
