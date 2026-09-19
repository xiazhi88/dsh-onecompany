/** 任务：五列看板 + 任务抽屉（详情、状态操作、评论协作流）。 */
import React, { useState } from 'react'
import type { CompanyState, TaskRecord, TaskStatus } from '../../shared/wire.ts'
import type { PanelStore } from '../store.ts'
import { agentOf, fmtTime, fmtTimeShort, nameOf } from '../store.ts'
import { Avatar, Btn, Empty, Expandable, Field, Md, Modal, Pill, SectionTitle } from '../ui.tsx'

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'todo', title: '待办' },
  { status: 'in_progress', title: '进行中' },
  { status: 'blocked', title: '阻塞' },
  { status: 'review', title: '待验收' },
  { status: 'done', title: '已完成' },
]

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '待办', in_progress: '进行中', blocked: '阻塞', review: '待验收', done: '已完成', cancelled: '已取消',
}

/** 新建任务弹层。 */
function TaskForm(props: { state: CompanyState; store: PanelStore; onClose: () => void }): React.ReactElement {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState('0')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="新建任务"
      onClose={props.onClose}
      footer={(
        <>
          <Btn onClick={props.onClose}>取消</Btn>
          <Btn
            variant="primary"
            disabled={busy || title.trim() === ''}
            onClick={async () => {
              setBusy(true)
              const ok = await props.store.act('派工', (api) => api.assign({
                title: title.trim(),
                desc,
                assigneeId: assignee === '' ? null : assignee,
                priority: Number(priority) || 0,
              }))
              setBusy(false)
              if (ok) props.onClose()
            }}
          >
            {busy ? '派发中…' : '派发任务'}
          </Btn>
        </>
      )}
    >
      <Field label="任务标题"><input className="oc-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="如：排查 API 网关 P99 抖动" /></Field>
      <Field label="说明与验收标准"><textarea className="oc-textarea" value={desc} onChange={(event) => setDesc(event.target.value)} placeholder="现象、范围、期望产出、截止时间；负责人会连同任务一起收到这条说明。" /></Field>
      <div className="oc-row" style={{ gap: 10 }}>
        <div style={{ flex: 2 }}>
          <Field label="负责人">
            <select className="oc-select" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">待认领</option>
              {props.state.agents.filter((agent) => agent.status === 'active').map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}（{agent.title}）</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="优先级"><input className="oc-input" value={priority} onChange={(event) => setPriority(event.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  )
}

/** 任务抽屉。 */
function TaskDrawer(props: { state: CompanyState; store: PanelStore; task: TaskRecord; onClose: () => void; onOpenAgent?: (agentId: string) => void }): React.ReactElement {
  const { task, state, store } = props
  const [comment, setComment] = useState('')
  const comments = state.comments.filter((entry) => entry.taskId === task.id)
  const children = state.tasks.filter((entry) => entry.parentTaskId === task.id)
  const related = state.messages.filter((message) => message.taskId === task.id)

  const move = (status: TaskStatus): void => {
    void store.act(`任务转「${STATUS_LABEL[status]}」`, (api) => api.updateTaskRemote(task.id, { status }))
  }

  return (
    <aside className="oc-drawer">
      <div className="oc-drawer__head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{task.title}</div>
          <div className="oc-stat__hint">
            {task.id} · 负责人 {nameOf(state, task.assigneeId)} · 优先级 {task.priority} · 更新 {fmtTime(task.updatedAt, state.now)}
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={props.onClose}>✕</Btn>
      </div>

      <div className="oc-drawer__body">
        <div className="oc-row oc-row--wrap" style={{ gap: 6, marginBottom: 12 }}>
          <Pill tone={task.status === 'blocked' ? 'err' : task.status === 'review' ? 'warn' : task.status === 'done' ? 'ok' : 'brand'}>{STATUS_LABEL[task.status]}</Pill>
          {task.checkoutBy !== null && <Pill>已认领：{nameOf(state, task.checkoutBy)}</Pill>}
        </div>

        {task.desc !== '' && (
          <div style={{ marginBottom: 14 }}>
            <div className="oc-card__sub" style={{ marginBottom: 6 }}>说明</div>
            <Expandable text={task.desc} collapsedLines={6} />
          </div>
        )}

        <div className="oc-row oc-row--wrap" style={{ gap: 6, marginBottom: 14 }}>
          {task.sessionId !== null && (
            <Btn
              size="sm"
              onClick={() => {
                const agent = state.agents.find((record) => record.id === task.assigneeId)
                store.openSession(task.sessionId!, agent?.cwd)
              }}
              title="在原生聊天里打开这个任务的一次性执行会话"
            >
              打开执行会话
            </Btn>
          )}
          {task.sessionId === null && task.assigneeId !== null && (
            <Btn
              size="sm"
              onClick={() => {
                const agent = state.agents.find((record) => record.id === task.assigneeId)
                if (agent !== undefined) store.openSession(agent.sessionId, agent.cwd)
              }}
              title="这条任务没有独立执行会话（常驻工位模式或旧任务）"
            >
              打开工位
            </Btn>
          )}
          {task.status !== 'in_progress' && <Btn size="sm" onClick={() => { void store.act('认领', (api) => api.updateTaskRemote(task.id, { checkout: true })) }}>认领并开工</Btn>}
          {task.status !== 'review' && task.status !== 'done' && <Btn size="sm" variant="primary" onClick={() => move('review')}>提交验收</Btn>}
          {task.status !== 'done' && <Btn size="sm" onClick={() => move('done')}>标记完成</Btn>}
          {task.status !== 'blocked' && <Btn size="sm" variant="danger" onClick={() => move('blocked')}>标记阻塞</Btn>}
          <select
            className="oc-select"
            style={{ width: 150 }}
            value={task.assigneeId ?? ''}
            onChange={(event) => { void store.act('改派', (api) => api.updateTaskRemote(task.id, { assigneeId: event.target.value === '' ? null : event.target.value })) }}
          >
            <option value="">待认领</option>
            {state.agents.filter((agent) => agent.status === 'active').map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </div>

        {task.result !== null && task.result !== '' && (
          <div style={{ marginBottom: 14 }}>
            <div className="oc-card__sub" style={{ marginBottom: 6 }}>结论</div>
            <Expandable text={task.result} collapsedLines={6} />
          </div>
        )}

        {children.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="oc-card__sub" style={{ marginBottom: 6 }}>子任务（全部完成时自动关闭父任务）</div>
            {children.map((child) => (
              <div className="oc-row" key={child.id} style={{ gap: 8, padding: '3px 0' }}>
                <Pill>{STATUS_LABEL[child.status]}</Pill>
                <button type="button" className="oc-link oc-truncate" style={{ flex: 1, textAlign: 'left' }} onClick={() => store.selectTask(child.id)}>{child.title}</button>
              </div>
            ))}
          </div>
        )}

        <div className="oc-card__sub" style={{ marginBottom: 8 }}>协作讨论（{comments.length}）</div>
        {comments.length === 0
          ? <div className="oc-stat__hint" style={{ marginBottom: 12 }}>还没有评论。讨论沉淀在这里，方便接手。</div>
          : comments.map((entry) => (
            <div className="oc-comment" key={entry.id}>
              <div className="oc-comment__meta">
                {entry.authorId !== 'board' && entry.authorId !== 'system' && agentOf(state, entry.authorId) !== undefined
                  ? <button type="button" className="oc-link" onClick={() => props.onOpenAgent?.(entry.authorId)}>{entry.authorName}</button>
                  : entry.authorName}
                {' · '}{fmtTime(entry.createdAt, state.now)}
              </div>
              <div className="oc-comment__body"><Md text={entry.text} /></div>
            </div>
          ))}

        <Field label="追加评论">
          <textarea className="oc-textarea" style={{ minHeight: 66 }} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="进展、决策、需要谁支持…" />
        </Field>
        <Btn
          size="sm"
          disabled={comment.trim() === ''}
          onClick={async () => {
            const ok = await store.act('评论', (api) => api.commentTaskRemote(task.id, comment))
            if (ok) setComment('')
          }}
        >
          发表
        </Btn>

        {related.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="oc-card__sub" style={{ marginBottom: 6 }}>往来消息</div>
            {related.slice(0, 8).map((message) => (
              <div className="oc-comment" key={message.id}>
                <div className="oc-comment__meta">{message.fromName} → {message.toType === 'board' ? '董事会' : nameOf(state, message.toId)} · {message.kind} · {fmtTime(message.createdAt, state.now)}</div>
                <Expandable text={message.body} collapsedLines={3} />
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

/** 任务看板。 */
export function Tasks(props: { state: CompanyState; store: PanelStore; onOpenAgent?: (agentId: string) => void }): React.ReactElement {
  const { state, store } = props
  const [creating, setCreating] = useState(false)
  const selectedId = store.getSnapshot().selectedTaskId
  const selected = selectedId === null ? null : state.tasks.find((task) => task.id === selectedId) ?? null

  return (
    <div className="oc-stack">
      <SectionTitle
        title="任务看板"
        sub={`${state.tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length} 项未完成 · 今日完成 ${state.stats.doneToday}`}
        extra={<Btn variant="primary" onClick={() => setCreating(true)}>＋ 新建任务</Btn>}
      />
      <div className="oc-board">
        {COLUMNS.map((column) => {
          const tasks = state.tasks
            .filter((task) => task.status === column.status)
            .sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt)
          return (
            <div className="oc-col" key={column.status}>
              <div className="oc-col__head">
                <span className="oc-col__title">{column.title}</span>
                <Pill>{tasks.length}</Pill>
              </div>
              <div className="oc-col__body">
                {tasks.length === 0 && <div className="oc-col__empty">暂无</div>}
                {tasks.map((task) => (
                  <div className="oc-task" key={task.id} onClick={() => store.selectTask(task.id)}>
                    <div className="oc-task__head">
                      <span className="oc-task__title">{task.title}</span>
                      {task.priority > 0 && <span className="oc-task__pri">P{task.priority}</span>}
                    </div>
                    <div className="oc-task__meta">
                      <Avatar name={nameOf(state, task.assigneeId)} small />
                      <span className="oc-truncate" style={{ flex: 1 }}>{nameOf(state, task.assigneeId)}</span>
                      <span className="oc-task__time">{fmtTimeShort(task.updatedAt, state.now)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {creating && <TaskForm state={state} store={store} onClose={() => setCreating(false)} />}
      {selected !== null && <TaskDrawer state={state} store={store} task={selected} onClose={() => store.selectTask(null)} onOpenAgent={props.onOpenAgent} />}
    </div>
  )
}
