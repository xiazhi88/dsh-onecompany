/**
 * 排程页：全公司定时任务的查看/新建/暂停/删除。
 *
 * 三种形态（对应 wire 的 kind）：
 * - 一次性：N 小时后触发一次（`at`，ISO 时间戳）
 * - 周期：每 N 小时触发（`every`，秒数）
 * - cron：标准 cron 表达式（`cron`，按公司时区解释）
 *
 * 到点后由 host 的 tick 把 prompt 作为一条消息投给指定员工，等于替董事会说那句话。
 */
import React, { useState } from 'react'
import type { ScheduleInput, ScheduleRecord } from '../../shared/wire.ts'
import type { CompanyRemote } from '../store.ts'
import { fmtTimeShort } from '../store.ts'
import { Avatar, Btn, Card, Empty, Field, Modal, Pill, SectionTitle, usePanel } from '../ui.tsx'

type Mode = 'once' | 'every' | 'cron'

/** 秒数 → 人类可读周期。 */
function describeEvery(sec: number | null): string {
  const value = sec ?? 0
  if (value % 3600 === 0) return `每 ${value / 3600} 小时`
  if (value % 60 === 0) return `每 ${value / 60} 分钟`
  return `每 ${value} 秒`
}

/** 排程一行摘要（列表与提示共用）。 */
function describeSchedule(record: ScheduleRecord): string {
  if (record.kind === 'cron') return `cron：${record.cron ?? ''}`
  if (record.kind === 'at') return '一次性'
  return describeEvery(record.everySec)
}

/** 下一次触发的人话表达（未来给「X 后」，过去给时间点）。 */
function describeNext(record: ScheduleRecord): string {
  if (!record.enabled) return '已暂停'
  const next = record.nextRunAt
  if (!Number.isFinite(next) || next <= 0) return '不再触发'
  const diff = next - Date.now()
  if (record.kind === 'at') {
    const when = new Date(next)
    const day = when.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
    const time = when.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return diff > 0 ? `约 ${Math.round(diff / 3600_000 * 10) / 10} 小时后（${day} ${time}）` : `${day} ${time}`
  }
  return `${Math.round(diff / 60_000)} 分钟后（${new Date(next).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）`
}

/** 排程页。 */
export function Schedule(props: { store: import('../store.ts').PanelStore }): React.ReactElement {
  const panel = usePanel(props.store)
  const state = panel.state
  const [creating, setCreating] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (state === null) return <Empty>正在读取公司状态…</Empty>

  const schedules = [...state.schedules].sort((a, b) => a.nextRunAt - b.nextRunAt)
  const nameOf = (agentId: string): string => state.agents.find((agent) => agent.id === agentId)?.name ?? agentId

  return (
    <>
      <SectionTitle
        title="排程"
        sub="到点把 prompt 作为一条消息投给指定员工（等于替你说那句话）。可直接暂停或删除。"
        extra={<Btn size="sm" variant="primary" onClick={() => setCreating(true)}>+ 新建排程</Btn>}
      />

      {schedules.length === 0 ? (
        <Empty>还没有排程。点右上「新建排程」——例如「3 小时后让陆遥跑一次巡检」「每 6 小时让顾砚汇报一次」。</Empty>
      ) : (
        <div className="oc-list">
          {schedules.map((record) => (
            <Card key={record.id} className="oc-card--hover">
              <div className="oc-sched">
                <Avatar name={nameOf(record.agentId)} small />
                <div className="oc-sched__main">
                  <div className="oc-sched__head">
                    <strong>{nameOf(record.agentId)}</strong>
                    <Pill tone={record.enabled ? 'brand' : 'default'}>{describeSchedule(record)}</Pill>
                    <span className="oc-muted">下次：{describeNext(record)}</span>
                    {record.lastRunAt !== null && (
                      <span className="oc-muted">· 上次 {fmtTimeShort(record.lastRunAt)}：{record.lastOutcome ?? '已触发'}</span>
                    )}
                  </div>
                  <div className="oc-sched__prompt">{record.prompt}</div>
                </div>
                <div className="oc-sched__actions">
                  <Btn
                    size="sm"
                    onClick={() => {
                      void props.store.act(
                        record.enabled ? '暂停排程' : '恢复排程',
                        (api: CompanyRemote) => api.setScheduleEnabledRemote(record.id, !record.enabled),
                      )
                    }}
                  >
                    {record.enabled ? '暂停' : '启用'}
                  </Btn>
                  {confirmId === record.id ? (
                    <>
                      <Btn
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirmId(null)
                          void props.store.act('删除排程', (api: CompanyRemote) => api.deleteSchedule(record.id))
                        }}
                      >
                        确认删除
                      </Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setConfirmId(null)}>取消</Btn>
                    </>
                  ) : (
                    <Btn size="sm" variant="ghost" onClick={() => setConfirmId(record.id)}>删除</Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <ScheduleForm
          agents={state.agents.map((agent) => ({ id: agent.id, name: agent.name, title: agent.title }))}
          timeZone={state.timeZone}
          onClose={() => setCreating(false)}
          onSubmit={(input) => {
            setCreating(false)
            void props.store.act('新建排程', (api: CompanyRemote) => api.createScheduleRemote(input))
          }}
        />
      )}
    </>
  )
}

/** 新建排程表单：员工 + 形态（一次性/周期/cron）+ 时间 + prompt。 */
function ScheduleForm(props: {
  agents: { id: string; name: string; title: string }[]
  timeZone: string
  onClose: () => void
  onSubmit: (input: ScheduleInput) => void
}): React.ReactElement {
  const [agentId, setAgentId] = useState(props.agents[0]?.id ?? '')
  const [mode, setMode] = useState<Mode>('once')
  const [hours, setHours] = useState('3')
  const [cron, setCron] = useState('0 9 * * *')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const hoursNumber = Number(hours)
  const build = (): ScheduleInput | string => {
    if (agentId === '') return '请选择员工'
    if (prompt.trim() === '') return '请写清楚到点要做什么（这段文字会作为消息发给该员工）'
    if (mode === 'cron') {
      if (cron.trim() === '') return '请填 cron 表达式'
      return { agentId, kind: 'cron', spec: cron.trim(), prompt: prompt.trim() }
    }
    if (!Number.isFinite(hoursNumber) || hoursNumber <= 0) return '小时数需为正数（可填小数，如 0.5 = 30 分钟）'
    if (mode === 'once') {
      return { agentId, kind: 'at', spec: new Date(Date.now() + hoursNumber * 3600_000).toISOString(), prompt: prompt.trim() }
    }
    const sec = Math.round(hoursNumber * 3600)
    if (sec < 60) return '周期不得小于 1 分钟'
    return { agentId, kind: 'every', spec: String(sec), prompt: prompt.trim() }
  }

  const preview = (): string => {
    const built = build()
    if (typeof built === 'string') return built
    if (built.kind === 'at') return `将于 ${new Date(Date.parse(built.spec)).toLocaleString('zh-CN')} 触发一次`
    if (built.kind === 'every') return `每 ${built.spec} 秒（约 ${hoursNumber} 小时）触发一次`
    return `按 cron「${built.spec}」触发（时区 ${props.timeZone}）`
  }

  const submit = (): void => {
    const built = build()
    if (typeof built === 'string') { setError(built); return }
    props.onSubmit(built)
  }

  return (
    <Modal
      title="新建排程"
      onClose={props.onClose}
      footer={(
        <>
          <Btn variant="ghost" onClick={props.onClose}>取消</Btn>
          <Btn variant="primary" onClick={submit}>创建</Btn>
        </>
      )}
    >
      <Field label="发给谁">
        <select className="oc-input" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
          {props.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name} · {agent.title}</option>
          ))}
        </select>
      </Field>

      <Field label="形态">
        <div className="oc-seg">
          <button type="button" className={`oc-seg__item ${mode === 'once' ? 'oc-seg__item--on' : ''}`} onClick={() => setMode('once')}>N 小时后做一次</button>
          <button type="button" className={`oc-seg__item ${mode === 'every' ? 'oc-seg__item--on' : ''}`} onClick={() => setMode('every')}>每 N 小时做</button>
          <button type="button" className={`oc-seg__item ${mode === 'cron' ? 'oc-seg__item--on' : ''}`} onClick={() => setMode('cron')}>cron 表达式</button>
        </div>
      </Field>

      {mode === 'cron' ? (
        <Field label="cron 表达式" hint={`按公司时区 ${props.timeZone} 解释，例如 0 9 * * * = 每天 09:00`}>
          <input className="oc-input" value={cron} onChange={(event) => setCron(event.target.value)} />
        </Field>
      ) : (
        <Field label={mode === 'once' ? '几小时后' : '每隔几小时'} hint="可填小数：0.5 = 30 分钟">
          <input className="oc-input" value={hours} onChange={(event) => setHours(event.target.value)} inputMode="decimal" />
        </Field>
      )}

      <Field label="到点要做什么（会作为一条消息发给该员工）" hint="写清楚目标与交付标准；用祈使句。">
        <textarea
          className="oc-input oc-input--area"
          rows={4}
          value={prompt}
          placeholder="例如：跑一次服务端巡检（磁盘、连接数、错误日志），把结论写进 reports/，异常项用 company_report 上报。"
          onChange={(event) => setPrompt(event.target.value)}
        />
      </Field>

      <div className={error === null ? 'oc-muted' : 'oc-error'}>{error ?? `预览：${preview()}`}</div>
    </Modal>
  )
}
