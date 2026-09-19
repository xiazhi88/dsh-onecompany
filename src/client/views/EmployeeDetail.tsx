/** 员工详情：工作日志（会话/工时/token 分桶）、任务、排程、最近往来。 */
import React from 'react'
import type { AgentRecord, CompanyState } from '../../shared/wire.ts'
import type { PanelStore } from '../store.ts'
import { fmtDuration, fmtNumber, fmtTime, fmtTokens, nameOf, worklogOf } from '../store.ts'
import { Avatar, Btn, Card, Empty, Expandable, Modal, Pill, StatusDot } from '../ui.tsx'

const BUCKETS = [
  { key: 'inputTokens', label: '输入', color: '#5b86ff' },
  { key: 'outputTokens', label: '输出', color: '#43be86' },
  { key: 'cacheReadTokens', label: '缓存读', color: '#8b6cf0' },
  { key: 'cacheWriteTokens', label: '缓存写', color: '#dda63f' },
] as const

/** 员工详情弹层。 */
export function EmployeeDetail(props: { state: CompanyState; store: PanelStore; agent: AgentRecord; onClose: () => void }): React.ReactElement {
  const { state, store, agent } = props
  const log = worklogOf(state, agent.id)
  const total = Math.max(1, (log?.inputTokens ?? 0) + (log?.outputTokens ?? 0) + (log?.cacheReadTokens ?? 0) + (log?.cacheWriteTokens ?? 0))
  const tasks = state.tasks.filter((task) => task.assigneeId === agent.id)
  const schedules = state.schedules.filter((schedule) => schedule.agentId === agent.id)
  const mail = state.messages.filter((message) => message.toId === agent.id || message.fromId === agent.id).slice(0, 10)
  const reports = state.agents.filter((entry) => entry.managerId === agent.id)
  const manager = state.agents.find((entry) => entry.id === agent.managerId)
  const tone = agent.status === 'terminated' ? 'dead' : agent.status === 'paused' ? 'off' : state.residentIds.includes(agent.id) ? 'on' : 'idle'

  return (
    <Modal title={`${agent.name} · ${agent.title}`} onClose={props.onClose}>
      <div className="oc-row" style={{ gap: 10, marginBottom: 14 }}>
        <Avatar name={agent.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="oc-row" style={{ gap: 6 }}>
            <StatusDot tone={tone} />
            <span className="oc-muted">{agent.status === 'active' ? (state.residentIds.includes(agent.id) ? '在职 · 常驻' : '在职 · 休眠（按需唤醒）') : agent.status === 'paused' ? '已暂停' : '已离职'}</span>
          </div>
          <div className="oc-stat__hint">
            汇报：{manager === undefined ? '董事会' : manager.name} · 下属 {reports.length} 人 · 模型 {agent.model ?? '继承部署默认'}
          </div>
        </div>
      </div>

      <Card title="今日工作日志" extra={<span className="oc-card__sub">{state.today}</span>}>
        <div className="oc-grid oc-grid--4" style={{ marginBottom: 12 }}>
          <div><div className="oc-stat__label">token 合计</div><div style={{ fontSize: 18, fontWeight: 650 }}>{fmtTokens(total)}</div></div>
          <div><div className="oc-stat__label">轮次</div><div style={{ fontSize: 18, fontWeight: 650 }}>{log?.turns ?? 0}</div></div>
          <div><div className="oc-stat__label">工时</div><div style={{ fontSize: 18, fontWeight: 650 }}>{fmtDuration(log?.activeMs ?? 0)}</div></div>
          <div><div className="oc-stat__label">会话</div><div style={{ fontSize: 18, fontWeight: 650 }}>{(log?.sessions ?? []).length || 1}</div></div>
        </div>
        <div className="oc-tokenbar">
          {BUCKETS.map((bucket) => (
            <div key={bucket.key} className="oc-tokenbar__seg" style={{ width: `${((log?.[bucket.key] ?? 0) / total) * 100}%`, background: bucket.color }} />
          ))}
        </div>
        <div className="oc-legend">
          {BUCKETS.map((bucket) => (
            <span key={bucket.key} className="oc-legend__key">
              <span className="oc-legend__swatch" style={{ background: bucket.color }} />
              {bucket.label} {fmtNumber(log?.[bucket.key] ?? 0)}
            </span>
          ))}
          <span className="oc-legend__key">推理 {fmtNumber(log?.reasoningTokens ?? 0)}</span>
        </div>
        <div className="oc-stat__hint" style={{ marginTop: 10 }}>
          会话 id：<span className="oc-mono">{agent.sessionId}</span>
        </div>
      </Card>

      <div style={{ height: 12 }} />

      <Card title={`任务（${tasks.length}）`}>
        {tasks.length === 0
          ? <Empty>暂无任务。</Empty>
          : (
            <div className="oc-list">
              {tasks.slice(0, 10).map((task) => (
                <div className="oc-list__row" key={task.id}>
                  <Pill tone={task.status === 'blocked' ? 'err' : task.status === 'done' ? 'ok' : 'default'}>{task.status}</Pill>
                  <span className="oc-truncate" style={{ flex: 1 }}>{task.title}</span>
                  <span className="oc-muted" style={{ fontSize: 11 }}>{fmtTime(task.updatedAt, state.now)}</span>
                </div>
              ))}
            </div>
          )}
      </Card>

      <div style={{ height: 12 }} />

      <Card title={`定时任务（${schedules.length}）`} extra={<span className="oc-card__sub">由员工自己用 company_schedule_create 配置</span>}>
        {schedules.length === 0
          ? <Empty>暂无排程。</Empty>
          : (
            <div className="oc-list">
              {schedules.map((schedule) => (
                <div className="oc-list__row" key={schedule.id}>
                  <Pill tone={schedule.enabled ? 'ok' : 'warn'}>{schedule.enabled ? '启用' : '停用'}</Pill>
                  <span className="oc-truncate" style={{ flex: 1 }}>{schedule.prompt.slice(0, 60)}</span>
                  <span className="oc-muted" style={{ fontSize: 11 }}>{new Date(schedule.nextRunAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
      </Card>

      <div style={{ height: 12 }} />

      <Card title="最近往来">
        {mail.length === 0
          ? <Empty>暂无消息。</Empty>
          : mail.map((message) => (
            <div className="oc-comment" key={message.id}>
              <div className="oc-comment__meta">
                {message.fromName} → {message.toType === 'board' ? '董事会' : nameOf(state, message.toId)} · {message.kind} · {fmtTime(message.createdAt, state.now)}
              </div>
              <Expandable text={message.body} collapsedLines={3} />
            </div>
          ))}
      </Card>

      <div className="oc-row" style={{ gap: 8, marginTop: 14 }}>
        <Btn onClick={() => { void store.act('暂停/恢复', (api) => api.patchAgent(agent.id, { status: agent.status === 'active' ? 'paused' : 'active' })) }}>
          {agent.status === 'active' ? '暂停该员工' : '恢复在职'}
        </Btn>
        <Btn variant="danger" onClick={() => { void store.act('离职', (api) => api.terminate(agent.id)) }}>办理离职</Btn>
      </div>
    </Modal>
  )
}
