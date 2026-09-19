/** 资料库：项目与文档浏览、新建项目、写文档、查看内容。 */
import React, { useEffect, useState } from 'react'
import type { CompanyState, DocRecord } from '../../shared/wire.ts'
import type { PanelStore } from '../store.ts'
import { fmtTime } from '../store.ts'
import { Btn, Card, Empty, Field, Md, Modal, Pill, SectionTitle } from '../ui.tsx'

/** 新建项目弹层。 */
function ProjectForm(props: { store: PanelStore; onClose: () => void }): React.ReactElement {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [defaultAcl, setDefaultAcl] = useState<'none' | 'read' | 'write'>('read')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="新建项目"
      onClose={props.onClose}
      footer={(
        <>
          <Btn onClick={props.onClose}>取消</Btn>
          <Btn
            variant="primary"
            disabled={busy || name.trim() === ''}
            onClick={async () => {
              setBusy(true)
              const ok = await props.store.act('建项目', (api) => api.createProjectRemote({
                name: name.trim(),
                description,
                defaultAcl,
                repoPath: repoPath.trim() === '' ? null : repoPath.trim(),
              }))
              setBusy(false)
              if (ok) props.onClose()
            }}
          >
            {busy ? '创建中…' : '创建'}
          </Btn>
        </>
      )}
    >
      <Field label="项目名"><input className="oc-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：基础设施" /></Field>
      <Field label="说明"><textarea className="oc-textarea" style={{ minHeight: 60 }} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <Field label="代码仓库路径（可选）" hint="员工的默认工作目录；档案仍写在公司项目目录里。">
        <input className="oc-input" value={repoPath} onChange={(event) => setRepoPath(event.target.value)} placeholder="/Users/you/projects/your-repo" />
      </Field>
      <Field label="默认权限" hint="员工未单独授权时的访问级别；写权限只能显式授予。">
        <select className="oc-select" value={defaultAcl} onChange={(event) => setDefaultAcl(event.target.value as 'none' | 'read' | 'write')}>
          <option value="none">不可见</option>
          <option value="read">可读</option>
          <option value="write">可写</option>
        </select>
      </Field>
    </Modal>
  )
}

/** 新建/编辑文档弹层。 */
function DocForm(props: { state: CompanyState; store: PanelStore; projectId: string | null; onClose: () => void }): React.ReactElement {
  const [path, setPath] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="写文档"
      onClose={props.onClose}
      footer={(
        <>
          <Btn onClick={props.onClose}>取消</Btn>
          <Btn
            variant="primary"
            disabled={busy || path.trim() === ''}
            onClick={async () => {
              setBusy(true)
              const ok = await props.store.act('写文档', (api) => api.writeDocRemote({
                projectId: props.projectId,
                path: path.trim(),
                content,
                ...(title.trim() === '' ? {} : { title: title.trim() }),
              }))
              setBusy(false)
              if (ok) props.onClose()
            }}
          >
            {busy ? '保存中…' : '保存'}
          </Btn>
        </>
      )}
    >
      <Field label="相对路径" hint="相对该资料库根目录，如 reports/2026-09-19.md"><input className="oc-input" value={path} onChange={(event) => setPath(event.target.value)} /></Field>
      <Field label="标题（可选）"><input className="oc-input" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Markdown 正文"><textarea className="oc-textarea" style={{ minHeight: 160 }} value={content} onChange={(event) => setContent(event.target.value)} /></Field>
    </Modal>
  )
}

/** 资料库视图。 */
export function Library(props: { state: CompanyState; store: PanelStore }): React.ReactElement {
  const { state, store } = props
  const [scope, setScope] = useState<string | null>(null) // null = 公司资料库
  const [writing, setWriting] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [preview, setPreview] = useState<{ title: string; content: string; path: string } | null>(null)

  const docs = state.docs.filter((doc) => doc.projectId === scope)

  useEffect(() => {
    if (scope !== null && !state.projects.some((project) => project.id === scope)) setScope(null)
  }, [scope, state.projects])

  const open = async (doc: DocRecord): Promise<void> => {
    const result = await store.readDoc(doc.id)
    if (!result.ok) {
      store.notify(result.message ?? '读取失败', 'err')
      return
    }
    setPreview({ title: result.title ?? doc.title, content: result.content ?? '', path: result.path ?? doc.path })
  }

  return (
    <div className="oc-stack">
      <SectionTitle
        title="资料库与项目"
        sub={`${state.projects.length} 个项目 · ${state.docs.length} 篇文档`}
        extra={(
          <div className="oc-row" style={{ gap: 8 }}>
            <Btn onClick={() => setCreatingProject(true)}>＋ 项目</Btn>
            <Btn variant="primary" onClick={() => setWriting(true)}>＋ 文档</Btn>
          </div>
        )}
      />

      <div className="oc-grid oc-grid--3">
        <Card title="位置">
          <div className="oc-row oc-row--wrap" style={{ gap: 6 }}>
            <button className={`oc-btn oc-btn--sm ${scope === null ? 'oc-btn--primary' : ''}`} onClick={() => setScope(null)} type="button">公司资料库</button>
            {state.projects.map((project) => (
              <button
                key={project.id}
                className={`oc-btn oc-btn--sm ${scope === project.id ? 'oc-btn--primary' : ''}`}
                onClick={() => setScope(project.id)}
                type="button"
                title={project.description}
              >
                {project.name}
              </button>
            ))}
          </div>
          {scope !== null && (() => {
            const project = state.projects.find((entry) => entry.id === scope)
            if (project === undefined) return null
            return (
              <div style={{ marginTop: 10 }}>
                <div className="oc-stat__hint">{project.description}</div>
                {project.repoPath !== null && (
                  <div className="oc-stat__hint">代码仓库：<span className="oc-mono">{project.repoPath}</span></div>
                )}
                <div style={{ marginTop: 10 }}>
                  <Btn size="sm" variant="primary" disabled={project.channelSessionId === null} onClick={() => store.openSession(project.channelSessionId ?? '', project.repoPath ?? project.rootPath)}>
                    {project.channelSessionId === null ? '项目群随启动创建' : '打开项目群会话'}
                  </Btn>
                </div>
              </div>
            )
          })()}
        </Card>

        <Card title="文档" extra={<span className="oc-card__sub">{docs.length} 篇</span>}>
          {docs.length === 0
            ? <Empty>这里还没有文档。员工可以用 company_doc_write 直接落产出。</Empty>
            : (
              <div className="oc-list">
                {docs.map((doc) => (
                  <div className="oc-list__row oc-list__row--action" key={doc.id} onClick={() => { void open(doc) }}>
                    <div className="oc-row__main">
                      <div className="oc-truncate">{doc.title}</div>
                      <div className="oc-stat__hint oc-truncate">{doc.path} · {doc.createdBy} · {fmtTime(doc.updatedAt, state.now)}</div>
                    </div>
                    <Pill>打开</Pill>
                  </div>
                ))}
              </div>
            )}
        </Card>
      </div>

      {creatingProject && <ProjectForm store={store} onClose={() => setCreatingProject(false)} />}
      {writing && <DocForm state={state} store={store} projectId={scope} onClose={() => setWriting(false)} />}
      {preview !== null && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          <div className="oc-stat__hint" style={{ marginBottom: 10 }}>{preview.path}</div>
          {preview.content === '' ? <Empty>（空文档）</Empty> : <Md text={preview.content} />}
        </Modal>
      )}
    </div>
  )
}
