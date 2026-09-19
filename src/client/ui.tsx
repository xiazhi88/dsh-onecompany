/**
 * 面板共用 UI 原子：卡片、统计、徽标、按钮、表单、弹层、抽屉、状态点。
 * 全部用 dsh 主题 token，不引入第三方组件库。
 */
import React, { useEffect, useRef, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PanelState, PanelStore, ViewId } from './store.ts'

/** 订阅面板 store。 */
export function usePanel(store: PanelStore): PanelState {
  const [state, setState] = useState<PanelState>(store.getSnapshot())
  useEffect(() => store.subscribe(() => setState(store.getSnapshot())), [store])
  return state
}

/** 卡片容器。 */
export function Card(props: { title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <section className={`oc-card ${props.className ?? ''}`}>
      {(props.title !== undefined || props.extra !== undefined) && (
        <header className="oc-card__head">
          <span className="oc-card__title">{props.title}</span>
          <span className="oc-section__spacer" />
          {props.extra}
        </header>
      )}
      {props.children}
    </section>
  )
}

/** 区块标题行。 */
export function SectionTitle(props: { title: React.ReactNode; sub?: React.ReactNode; extra?: React.ReactNode }): React.ReactElement {
  return (
    <div className="oc-section">
      <span className="oc-section__title">{props.title}</span>
      {props.sub !== undefined && <span className="oc-card__sub">{props.sub}</span>}
      <span className="oc-section__spacer" />
      {props.extra}
    </div>
  )
}

/** 统计卡。 */
export function Stat(props: { label: string; value: React.ReactNode; hint?: React.ReactNode }): React.ReactElement {
  return (
    <div className="oc-card">
      <div className="oc-stat__label">{props.label}</div>
      <div className="oc-stat__value">{props.value}</div>
      {props.hint !== undefined && <div className="oc-stat__hint">{props.hint}</div>}
    </div>
  )
}

/** 徽标。 */
export function Pill(props: { children: React.ReactNode; tone?: 'default' | 'ok' | 'warn' | 'err' | 'brand' }): React.ReactElement {
  const tone = props.tone ?? 'default'
  return <span className={`oc-pill ${tone === 'default' ? '' : `oc-pill--${tone}`}`}>{props.children}</span>
}

/** 按钮。 */
export function Btn(props: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  disabled?: boolean
  title?: string
}): React.ReactElement {
  const classes = ['oc-btn']
  if (props.variant !== undefined && props.variant !== 'default') classes.push(`oc-btn--${props.variant}`)
  if (props.size === 'sm') classes.push('oc-btn--sm')
  return (
    <button className={classes.join(' ')} onClick={props.onClick} disabled={props.disabled === true} title={props.title} type="button">
      {props.children}
    </button>
  )
}

/** 表单字段。 */
export function Field(props: { label: string; children: React.ReactNode; hint?: string }): React.ReactElement {
  return (
    <label className="oc-field">
      <span className="oc-field__label">{props.label}</span>
      {props.children}
      {props.hint !== undefined && <span className="oc-stat__hint">{props.hint}</span>}
    </label>
  )
}

/** 空态。 */
export function Empty(props: { children: React.ReactNode }): React.ReactElement {
  return <div className="oc-empty">{props.children}</div>
}

/** 员工首字头像（small 用于卡片内联）。 */
export function Avatar(props: { name: string; small?: boolean }): React.ReactElement {
  return <span className={`oc-avatar ${props.small === true ? 'oc-avatar--sm' : ''}`}>{props.name.slice(0, 1)}</span>
}

/** 状态点：驻留/空闲/暂停/离职。 */
export function StatusDot(props: { tone: 'on' | 'idle' | 'off' | 'dead' }): React.ReactElement {
  return <span className={`oc-dot oc-dot--${props.tone}`} />
}

/** 弹层。 */
export function Modal(props: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        props.onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  return (
    <div className="oc-modal" ref={ref} onClick={(event) => { if (event.target === ref.current) props.onClose() }}>
      <div className="oc-modal__panel" role="dialog" aria-label={typeof props.title === 'string' ? props.title : '对话框'}>
        <div className="oc-modal__head">
          <span>{props.title}</span>
          <span className="oc-section__spacer" />
          <Btn variant="ghost" size="sm" onClick={props.onClose}>✕</Btn>
        </div>
        <div className="oc-modal__body">{props.children}</div>
        {props.footer !== undefined && <div className="oc-modal__foot">{props.footer}</div>}
      </div>
    </div>
  )
}

/** 提示条。 */
export function Toast(props: { text: string; kind: 'ok' | 'err' }): React.ReactElement {
  return <div className={`oc-toast ${props.kind === 'ok' ? 'oc-toast--ok' : 'oc-toast--err'}`}>{props.text}</div>
}

/** 导航图标（内联 SVG，16px 线性）。 */
/** 任务状态的中文标签（多处共用，别再各写一份）。 */
export const TASK_STATUS_LABEL: Record<string, string> = {
  todo: '待办', in_progress: '进行中', blocked: '阻塞', review: '待验收', done: '已完成', cancelled: '已取消',
}

/**
 * 任务状态图标：进行中转圈、阻塞/待验收呼吸、完成打勾、待办空心圈。
 * 动画让「正在跑」的事一眼可见，不用读文字。
 */
export function TaskStatusIcon(props: { status: string }): React.ReactElement {
  const stroke = 'currentColor'
  const common = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (props.status) {
    case 'in_progress':
      return <span className="oc-st oc-st--run" title="进行中"><svg {...common}><path d="M12 3a9 9 0 1 0 9 9" /></svg></span>
    case 'review':
      return <span className="oc-st oc-st--review" title="待验收"><svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg></span>
    case 'blocked':
      return <span className="oc-st oc-st--blocked" title="阻塞"><svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg></span>
    case 'done':
      return <span className="oc-st oc-st--done" title="已完成"><svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
    case 'cancelled':
      return <span className="oc-st oc-st--cancel" title="已取消"><svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 12h6" /></svg></span>
    default:
      return <span className="oc-st oc-st--todo" title="待办"><svg {...common}><circle cx="12" cy="12" r="9" /></svg></span>
  }
}

export function NavIcon(props: { view: ViewId }): React.ReactElement {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (props.view) {
    case 'overview':
      return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /></svg>
    case 'org':
      return <svg {...common}><rect x="9" y="3" width="6" height="5" rx="1.5" /><rect x="3" y="16" width="6" height="5" rx="1.5" /><rect x="15" y="16" width="6" height="5" rx="1.5" /><path d="M12 8v4M6 16v-4h12v4" /></svg>
    case 'tasks':
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h10" /><circle cx="19" cy="18" r="2.4" /></svg>
    case 'schedule':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
    case 'approvals':
      return <svg {...common}><path d="M9 11l2.5 2.5L16 8" /><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></svg>
    case 'library':
      return <svg {...common}><path d="M4 19V5a2 2 0 0 1 2-2h10l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M14 3v5h5" /></svg>
    case 'activity':
      return <svg {...common}><path d="M3 12h4l2.5-6 3.5 12 2.5-6H21" /></svg>
  }
}


const MD_LABELS = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '脚注' }

/** 官方 Markdown 渲染（与宿主会话同一渲染器）。 */
export function Md(props: { text: string }): React.ReactElement {
  return (
    <div className="oc-md">
      <MarkdownText text={props.text} labels={MD_LABELS} />
    </div>
  )
}

/** 长文本折叠/展开（默认 4 行高度，点击展开全文）。 */
export function Expandable(props: { text: string; collapsedLines?: number }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const lines = props.collapsedLines ?? 4
  return (
    <div>
      <div
        className="oc-expandable"
        style={expanded ? undefined : { maxHeight: `${lines * 1.55}em`, overflow: 'hidden' }}
      >
        <Md text={props.text} />
      </div>
      <button type="button" className="oc-btn oc-btn--ghost oc-btn--sm oc-expandable__toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? '收起' : '展开全文'}
      </button>
    </div>
  )
}
