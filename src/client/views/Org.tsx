/** 组织：按汇报线渲染员工树，支持招聘、调岗、暂停/恢复、私聊、离职。 */
import React, { useState } from 'react'
import type { AgentRecord, CompanyState } from '../../shared/wire.ts'
import type { CompanyRemote, PanelStore } from '../store.ts'
import { fmtDuration, fmtTokens, worklogOf } from '../store.ts'
import { Avatar, Btn, Card, Empty, Field, Modal, Pill, SectionTitle, StatusDot } from '../ui.tsx'
import { EmployeeDetail } from './EmployeeDetail.tsx'

/** 员工卡片。 */
function AgentCard(props: {
  agent: AgentRecord
  state: CompanyState
  store: PanelStore
  onNudge: (agent: AgentRecord) => void
  onEdit: (agent: AgentRecord) => void
  onHire: (managerId: string | null) => void
  onDetail: (agent: AgentRecord) => void
}): React.ReactElement {
  const { agent, state, store } = props
  const log = worklogOf(state, agent.id)
  const tone = agent.status === 'terminated' ? 'dead' : agent.status === 'paused' ? 'off' : state.residentIds.includes(agent.id) ? 'on' : 'idle'
  const reports = state.agents.filter((entry) => entry.managerId === agent.id)
  const openTasks = state.tasks.filter((task) => task.assigneeId === agent.id && task.status !== 'done' && task.status !== 'cancelled')

  return (
    <div className="oc-tree__node">
      <Card className="oc-card--hover">
        <div className="oc-row">
          <Avatar name={agent.name} />
          <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => props.onDetail(agent)} title="查看工作日志">
            <div className="oc-row" style={{ gap: 6 }}>
              <span className="oc-truncate" style={{ fontWeight: 600 }}>{agent.name}</span>
              <StatusDot tone={tone} />
            </div>
            <div className="oc-stat__hint">{agent.title} · {agent.model ?? '默认模型'}{agent.effort === null ? '' : `（${agent.effort}）`}</div>
          </div>
          {agent.status !== 'active' && <Pill tone={agent.status === 'paused' ? 'warn' : 'err'}>{agent.status === 'paused' ? '已暂停' : '已离职'}</Pill>}
        </div>

        <div className="oc-row oc-row--wrap" style={{ marginTop: 10, gap: 6 }}>
          <Pill>今日 {fmtTokens((log?.inputTokens ?? 0) + (log?.outputTokens ?? 0))} tokens</Pill>
          <Pill>轮次 {log?.turns ?? 0}</Pill>
          <Pill>工时 {fmtDuration(log?.activeMs ?? 0)}</Pill>
          {openTasks.length > 0 && <Pill tone="brand">待办 {openTasks.length}</Pill>}
          {agent.projectIds.map((pid) => {
            const project = state.projects.find((entry) => entry.id === pid)
            return project === undefined ? null : <Pill key={pid} tone="brand">{project.name}</Pill>
          })}
        </div>

        <div className="oc-row oc-row--wrap" style={{ marginTop: 12, gap: 6 }}>
          <Btn size="sm" variant="primary" onClick={() => props.onNudge(agent)}>派活/私聊</Btn>
          <Btn
            size="sm"
            onClick={() => {
              if (agent.provisionedAt === null) {
                store.notify('该员工还没有工位会话：派活后会自动建「任务会话」，或在「派活/私聊」里说一句即可创建。', 'ok')
                return
              }
              store.openSession(agent.sessionId, agent.cwd)
            }}
            title="在原生聊天里打开该员工的工位会话（对话面）"
          >
            打开工位
          </Btn>
          <Btn size="sm" onClick={() => props.onDetail(agent)}>工作日志</Btn>
          <Btn size="sm" onClick={() => props.onEdit(agent)}>编辑</Btn>
          <Btn
            size="sm"
            onClick={() => { void store.act('暂停', (api: CompanyRemote) => api.patchAgent(agent.id, { status: agent.status === 'active' ? 'paused' : 'active' })) }}
          >
            {agent.status === 'active' ? '暂停' : '恢复'}
          </Btn>
          <Btn size="sm" onClick={() => props.onHire(agent.id)}>加下属</Btn>
        </div>
      </Card>

      {reports.length > 0 && (
        <div className="oc-tree__children">
          {reports.map((report) => (
            <AgentCard key={report.id} {...props} agent={report} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 招聘 / 编辑表单。 */
function AgentForm(props: {
  state: CompanyState
  store: PanelStore
  editing: AgentRecord | null
  defaultManagerId: string | null
  onClose: () => void
}): React.ReactElement {
  const { editing, state } = props
  const [name, setName] = useState(editing?.name ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [persona, setPersona] = useState(editing?.persona ?? '')
  const [managerId, setManagerId] = useState<string>(editing?.managerId ?? props.defaultManagerId ?? '')
  const [projectIds, setProjectIds] = useState<string[]>(editing?.projectIds ?? [])
  const [model, setModel] = useState(editing?.model ?? '')
  const [effort, setEffort] = useState(editing?.effort ?? '')
  const [cap, setCap] = useState<string>(editing?.dailyTokenCap === null || editing?.dailyTokenCap === undefined ? '' : String(editing.dailyTokenCap))
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (name.trim() === '') return
    setBusy(true)
    const patch = {
      name: name.trim(),
      title: title.trim() === '' ? '员工' : title.trim(),
      role: editing?.role ?? 'staff',
      managerId: managerId === '' ? null : managerId,
      projectIds,
      persona,
      provider: editing?.provider ?? null,
      model: model.trim() === '' ? null : model.trim(),
      effort: effort.trim() === '' ? null : effort.trim(),
      presetId: editing?.presetId ?? null,
      dailyTokenCap: cap.trim() === '' ? null : Number(cap),
    }
    const ok = editing === null
      ? await props.store.act('招聘', (api) => api.hire(patch))
      : await props.store.act('保存', (api) => api.patchAgent(editing.id, patch))
    setBusy(false)
    if (ok) props.onClose()
  }

  return (
    <Modal
      title={editing === null ? '招聘新员工' : `编辑 ${editing.name}`}
      onClose={props.onClose}
      footer={(
        <>
          <Btn onClick={props.onClose}>取消</Btn>
          <Btn variant="primary" disabled={busy || name.trim() === ''} onClick={() => { void submit() }}>
            {busy ? '处理中…' : editing === null ? '招聘并唤醒' : '保存'}
          </Btn>
        </>
      )}
    >
      <Field label="姓名"><input className="oc-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：小维" /></Field>
      <Field label="职位"><input className="oc-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="如：运维工程师" /></Field>
      <Field label="汇报对象">
        <select className="oc-select" value={managerId} onChange={(event) => setManagerId(event.target.value)}>
          <option value="">董事会（直接汇报）</option>
          {state.agents.filter((entry) => entry.status !== 'terminated' && entry.id !== editing?.id).map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}（{entry.title}）</option>
          ))}
        </select>
      </Field>
      <Field label="负责项目（可多选）" hint="决定 CEO 派工时的归口，以及资料库写权限的派生。">
        <div className="oc-row oc-row--wrap" style={{ gap: 6 }}>
          {state.projects.length === 0 && <span className="oc-muted">暂无项目，先到「资料库」建项目</span>}
          {state.projects.map((project) => {
            const on = projectIds.includes(project.id)
            return (
              <button
                key={project.id}
                type="button"
                className={`oc-btn oc-btn--sm ${on ? 'oc-btn--primary' : ''}`}
                onClick={() => setProjectIds(on ? projectIds.filter((id) => id !== project.id) : [...projectIds, project.id])}
              >
                {project.name}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="岗位说明书（persona / AGENTS.md）" hint="写清职责、边界、验收标准；会写进员工的工位 AGENTS.md 与系统提示词。">
        <textarea className="oc-textarea" value={persona} onChange={(event) => setPersona(event.target.value)} placeholder="负责服务器巡检、告警响应与发布值守；发现问题先上报，不擅自变更生产环境。" />
      </Field>
      <div className="oc-row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="模型（留空=默认）"><input className="oc-input" value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-flash" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="推理强度"><input className="oc-input" value={effort} onChange={(event) => setEffort(event.target.value)} placeholder="medium" /></Field>
        </div>
      </div>
      <Field label="每日 token 预算" hint="超出后暂停向其投递消息，并通知董事会。留空表示不限。">
        <input className="oc-input" value={cap} onChange={(event) => setCap(event.target.value)} placeholder="5000000" />
      </Field>
    </Modal>
  )
}

/** 私聊/派活弹层。 */
function NudgeModal(props: { agent: AgentRecord; store: PanelStore; onClose: () => void }): React.ReactElement {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={`给 ${props.agent.name} 留言`}
      onClose={props.onClose}
      footer={(
        <>
          <Btn onClick={props.onClose}>取消</Btn>
          <Btn
            variant="primary"
            disabled={busy || text.trim() === ''}
            onClick={async () => {
              setBusy(true)
              const ok = await props.store.act('投递', (api) => api.nudge(props.agent.id, text))
              setBusy(false)
              if (ok) props.onClose()
            }}
          >
            {busy ? '投递中…' : '投递到信箱'}
          </Btn>
        </>
      )}
    >
      <Field label="留言内容" hint="会以下一条会话消息送达该员工，并在下个调度周期内投递。">
        <textarea className="oc-textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder="先把线上告警面板的巡检跑一遍，18:00 前给我结论。" />
      </Field>
    </Modal>
  )
}

/** 组织视图。 */
export function Org(props: { state: CompanyState; store: PanelStore }): React.ReactElement {
  const { state, store } = props
  const [hiring, setHiring] = useState<{ editing: AgentRecord | null; managerId: string | null } | null>(null)
  const [nudging, setNudging] = useState<AgentRecord | null>(null)
  const [detail, setDetail] = useState<AgentRecord | null>(null)
  const roots = state.agents.filter((agent) => agent.managerId === null && agent.status !== 'terminated')
  const orphaned = state.agents.filter((agent) => agent.status === 'terminated')

  return (
    <div className="oc-stack">
      <SectionTitle
        title="组织架构"
        sub={`${state.agents.length} 名员工 · 常驻 ${state.residentIds.length}`}
        extra={<Btn variant="primary" onClick={() => setHiring({ editing: null, managerId: null })}>＋ 招聘</Btn>}
      />
      {roots.length === 0
        ? <Empty>公司还没有员工。点右上「招聘」创建第一位同事：填姓名、职位、岗位说明书与模型，它会获得一间工位和一套公司协作工具。</Empty>
        : (
          <div className="oc-tree">
            {roots.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                state={state}
                store={store}
                onNudge={setNudging}
                onEdit={(target) => setHiring({ editing: target, managerId: target.managerId })}
                onHire={(managerId) => setHiring({ editing: null, managerId })}
                onDetail={setDetail}
              />
            ))}
          </div>
        )}

      {orphaned.length > 0 && (
        <Card title="已离职">
          <div className="oc-list">
            {orphaned.map((agent) => (
              <div className="oc-list__row" key={agent.id}>
                <Avatar name={agent.name} />
                <div style={{ flex: 1 }}>
                  <div>{agent.name}</div>
                  <div className="oc-stat__hint">{agent.title} · {agent.id}</div>
                </div>
                <Btn size="sm" onClick={() => { void store.act('恢复', (api) => api.patchAgent(agent.id, { status: 'active' })) }}>恢复在职</Btn>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hiring !== null && (
        <AgentForm
          state={state}
          store={store}
          editing={hiring.editing}
          defaultManagerId={hiring.managerId}
          onClose={() => setHiring(null)}
        />
      )}
      {nudging !== null && <NudgeModal agent={nudging} store={store} onClose={() => setNudging(null)} />}
      {detail !== null && <EmployeeDetail state={state} store={store} agent={state.agents.find((entry) => entry.id === detail.id) ?? detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
