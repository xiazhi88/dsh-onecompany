/** 审批：董事会收件箱（批准/驳回 + 备注）。 */
import React, { useState } from 'react'
import type { ApprovalRecord, CompanyState } from '../../shared/wire.ts'
import type { PanelStore } from '../store.ts'
import { fmtTime } from '../store.ts'
import { Btn, Card, Empty, Expandable, Md, Pill, SectionTitle } from '../ui.tsx'

const KIND_LABEL: Record<string, string> = {
  hire: '招聘', spend: '花费', strategy: '策略/上线', danger: '高危操作', other: '其他',
}

/** 单条审批卡。 */
function ApprovalRow(props: { record: ApprovalRecord; state: CompanyState; store: PanelStore }): React.ReactElement {
  const { record } = props
  const [note, setNote] = useState('')
  const tone = record.status === 'approved' ? 'ok' : record.status === 'rejected' ? 'err' : 'warn'
  return (
    <Card
      title={<span className="oc-row" style={{ gap: 8 }}>{record.title}<Pill tone="brand">{KIND_LABEL[record.kind] ?? record.kind}</Pill></span>}
      extra={<Pill tone={tone}>{record.status === 'pending' ? '待裁决' : record.status === 'approved' ? '已批准' : '已驳回'}</Pill>}
    >
      <div className="oc-stat__hint" style={{ marginBottom: 8 }}>
        {record.requesterName} · {fmtTime(record.createdAt, props.state.now)} · {record.id}
      </div>
      {/* 面向董事会：先看「要我决定什么」，再看三行摘要，技术细节折叠 */}
      {record.ask !== '' && (
        <div className="oc-ask">
          <span className="oc-ask__label">要我决定</span>
          <span className="oc-ask__text">{record.ask}</span>
        </div>
      )}
      {record.summary !== '' && <div className="oc-summary"><Md text={record.summary} /></div>}
      {(record.detail !== '' && (record.ask !== '' || record.summary !== '')) && (
        <div style={{ marginBottom: 12 }}>
          <div className="oc-stat__hint" style={{ marginBottom: 4 }}>技术细节（想看再展开）</div>
          <Expandable text={record.detail} collapsedLines={3} />
        </div>
      )}
      {(record.ask === '' && record.summary === '') && (
        <div style={{ marginBottom: 12 }}><Md text={record.detail} /></div>
      )}
      {record.status === 'pending'
        ? (
          <>
            <input className="oc-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="决策说明（可选，会回传给发起人）" style={{ marginBottom: 10 }} />
            <div className="oc-row" style={{ gap: 8 }}>
              <Btn variant="primary" onClick={() => { void props.store.act('批准', (api) => api.decideApproval(record.id, true, note)) }}>批准</Btn>
              <Btn variant="danger" onClick={() => { void props.store.act('驳回', (api) => api.decideApproval(record.id, false, note)) }}>驳回</Btn>
            </div>
          </>
        )
        : record.decisionNote !== null && record.decisionNote !== '' && (
          <div className="oc-stat__hint">董事会说明：{record.decisionNote}</div>
        )}
    </Card>
  )
}

/** 审批视图。 */
export function Approvals(props: { state: CompanyState; store: PanelStore }): React.ReactElement {
  const pending = props.state.approvals.filter((record) => record.status === 'pending')
  const decided = props.state.approvals.filter((record) => record.status !== 'pending')

  return (
    <div className="oc-stack">
      <SectionTitle title="董事会审批" sub={`${pending.length} 项待裁决`} />
      {pending.length === 0
        ? <Empty>没有待裁决的审批。员工需要花钱、上线、删数据或招人时会提交到这里。</Empty>
        : pending.map((record) => <ApprovalRow key={record.id} record={record} state={props.state} store={props.store} />)}

      {decided.length > 0 && (
        <>
          <SectionTitle title="已裁决" sub={`${decided.length} 条`} />
          {decided.slice(0, 20).map((record) => <ApprovalRow key={record.id} record={record} state={props.state} store={props.store} />)}
        </>
      )}
    </div>
  )
}
