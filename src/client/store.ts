/**
 * 客户端数据层：远程面 API 的类型与一个极小的外置 store（轮询刷新 + 变更后刷新）。
 * 不引入任何第三方状态库，保持 bundle 自洽。
 */
import type {
  ActionResult, AgentPatch, AgentRecord, ApprovalRecord, CompanyState, HireInput,
  ScheduleInput, TaskInput, TaskRecord, TaskStatus,
} from '../shared/wire.ts'

/** 远程服务面（由 host 半的 Typert 清单声明）。 */
export interface CompanyRemote {
  remoteState(): Promise<CompanyState>
  setEnabled(on: boolean): Promise<Ack>
  tickNow(): Promise<{ schedules: number; delivered: number }>
  hire(input: HireInput): Promise<Ack>
  patchAgent(id: string, patch: AgentPatch): Promise<Ack>
  terminate(id: string): Promise<Ack>
  nudge(agentId: string, text: string): Promise<Ack>
  assign(input: TaskInput): Promise<Ack>
  updateTaskRemote(id: string, patch: {
    status?: TaskStatus
    result?: string
    assigneeId?: string | null
    priority?: number
    checkout?: boolean
  }): Promise<Ack>
  commentTaskRemote(id: string, text: string): Promise<Ack>
  mail(input: { toId: string; kind: string; body: string; taskId?: string | null }): Promise<Ack>
  decideApproval(id: string, approve: boolean, note?: string): Promise<Ack>
  createProjectRemote(input: { name: string; description?: string; defaultAcl?: 'none' | 'read' | 'write'; repoPath?: string | null }): Promise<Ack>
  writeDocRemote(input: { projectId: string | null; path: string; content: string; title?: string }): Promise<Ack>
  readDocRemote(docId: string): Promise<{ ok: boolean; title?: string; path?: string; content?: string; code?: string; message?: string }>
  createScheduleRemote(input: ScheduleInput): Promise<Ack>
  deleteSchedule(id: string): Promise<Ack>
  setScheduleEnabledRemote(id: string, enabled: boolean): Promise<Ack>
}

type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message?: string } }

type RawRemote = Record<string, (...args: unknown[]) => Promise<unknown>>

function unwrap<T>(result: unknown): T {
  if (typeof result !== 'object' || result === null || !('ok' in result)) return result as T
  const remote = result as RemoteResult<T>
  if (remote.ok) return remote.value
  throw new Error(remote.error.message ?? '远程调用失败')
}

/** Convert the generated Remote namespace into the business-facing client API. */
export function companyRemoteOf(value: unknown): CompanyRemote | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const remote = value as RawRemote
  const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
    const invoke = remote[method]
    if (typeof invoke !== 'function') throw new Error(`公司服务缺少方法 ${method}`)
    return unwrap<T>(await invoke(...args))
  }
  return {
    remoteState: () => call<CompanyState>('remoteState'),
    setEnabled: (on) => call<Ack>('setEnabled', on),
    tickNow: () => call<{ schedules: number; delivered: number }>('tickNow'),
    hire: (input) => call<Ack>('hire', input),
    patchAgent: (id, patch) => call<Ack>('patchAgent', id, patch),
    terminate: (id) => call<Ack>('terminate', id),
    nudge: (agentId, text) => call<Ack>('nudge', agentId, text),
    assign: (input) => call<Ack>('assign', input),
    updateTaskRemote: (id, patch) => call<Ack>('updateTaskRemote', id, patch),
    commentTaskRemote: (id, text) => call<Ack>('commentTaskRemote', id, text),
    mail: (input) => call<Ack>('mail', input),
    decideApproval: (id, approve, note) => call<Ack>('decideApproval', id, approve, note),
    createProjectRemote: (input) => call<Ack>('createProjectRemote', input),
    writeDocRemote: (input) => call<Ack>('writeDocRemote', input),
    readDocRemote: (docId) => call<{ ok: boolean; title?: string; path?: string; content?: string; code?: string; message?: string }>('readDocRemote', docId),
    createScheduleRemote: (input) => call<Ack>('createScheduleRemote', input),
    deleteSchedule: (id) => call<Ack>('deleteSchedule', id),
    setScheduleEnabledRemote: (id, enabled) => call<Ack>('setScheduleEnabledRemote', id, enabled),
  }
}

/** 变更类动作的统一回执。 */
export interface Ack {
  ok: boolean
  code?: string
  message?: string
  id?: string
}

/** 面板状态。 */
export interface PanelState {
  open: boolean
  view: ViewId
  loading: boolean
  error: string | null
  state: CompanyState | null
  toast: { text: string; kind: 'ok' | 'err' } | null
  selectedTaskId: string | null
}

export type ViewId = 'overview' | 'org' | 'tasks' | 'schedule' | 'approvals' | 'library' | 'activity'

type Listener = () => void

/** 极小外置 store：面板只需要「整份快照 + 视图态」。 */
export class PanelStore {
  private listeners = new Set<Listener>()
  private poll: number | null = null

  state: PanelState = {
    open: false,
    view: 'overview',
    loading: false,
    error: null,
    state: null,
    toast: null,
    selectedTaskId: null,
  }

  constructor(
    private readonly api: () => CompanyRemote | undefined,
    private readonly sessions: { open: (id: string) => void } | undefined,
    private readonly workspaces: {
      list: { getSnapshot: () => { items: readonly { workspaceId: string; path: string; sessionIds: readonly string[] }[] } }
      connectWorkspace: (workspaceId: string) => Promise<string>
    } | undefined,
  ) {}

  /**
   * 在原生界面打开一个会话（员工工位/项目群/大厅）。目标会话若在尚未加载的
   * 工作区里，先连接该工作区再打开。
   * @param sessionId - 目标会话 id。
   * @param cwd - 该会话的工作目录（用于匹配工作区）。
   */
  openSession(sessionId: string, cwd?: string): void {
    if (this.sessions === undefined) {
      this.notify('当前界面不支持会话跳转', 'err')
      return
    }
    try {
      this.sessions.open(sessionId)
      this.emit({ open: false })
      return
    } catch {
      // 落到这里通常意味着目标会话的工作区还没加载，尝试先连接工作区。
    }
    const workspaces = this.workspaces
    if (workspaces === undefined) {
      this.notify('该会话所在的工作区尚未加载，请先在侧栏点开对应工作区', 'err')
      return
    }
    void (async () => {
      try {
        const items = workspaces.list.getSnapshot().items
        const target = items.find((item) => item.sessionIds.includes(sessionId))
          ?? (cwd === undefined ? undefined : items.find((item) => item.path === cwd))
        if (target === undefined) {
          this.notify('该会话所在的工作区尚未加载，请先在侧栏点开对应工作区', 'err')
          return
        }
        await workspaces.connectWorkspace(target.workspaceId)
        window.setTimeout(() => {
          try {
            this.sessions?.open(sessionId)
            this.emit({ open: false })
          } catch {
            this.notify('工作区已打开，请在侧栏选择该会话', 'err')
          }
        }, 600)
      } catch (error) {
        this.notify(error instanceof Error ? error.message : String(error), 'err')
      }
    })()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): PanelState => this.state

  /** 上一次看到的待审批数（用于「有新审批」提醒）。 */
  private lastPending = 0

  private emit(patch: Partial<PanelState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /**
   * 插件启动时拉一次状态：侧栏红点/摘要需要在未打开面板时也准确。
   * 远程面（remote.company）可能比插件晚就绪——那样 refresh 会落到
   * `company-remote-pending`，这里用短退避快速重试，避免长时间显示「连接中…」。
   */
  warm(): void {
    const retry = (delay: number): void => {
      void this.refresh().then(() => {
        if (this.state.error !== 'company-remote-pending') return
        window.setTimeout(() => retry(Math.min(delay * 2, 15_000)), delay)
      })
    }
    retry(1_500)
    window.setInterval(() => {
      if (this.state.open) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void this.refresh()
    }, 120_000)
  }

  /** 打开/关闭整页。 */
  setOpen(open: boolean): void {
    this.emit({ open })
    if (open) {
      void this.refresh()
      this.startPolling()
    } else {
      this.stopPolling()
    }
  }

  setView(view: ViewId): void {
    this.emit({ view })
  }

  selectTask(id: string | null): void {
    this.emit({ selectedTaskId: id })
  }

  /** 拉取一次快照。 */
  async refresh(): Promise<void> {
    const api = this.api()
    if (api === undefined) {
      this.emit({ error: 'company-remote-pending', loading: false })
      return
    }
    this.emit({ loading: true })
    try {
      const state = await api.remoteState()
      const pending = state.approvals.filter((record) => record.status === 'pending').length
      if (pending > this.lastPending && this.lastPending !== 0) {
        this.notify(`有 ${pending - this.lastPending} 项新审批待裁决`, 'err')
      }
      this.lastPending = pending
      // 指纹没变就不 emit：避免每轮轮询都重渲染整页（约 250 行）。
      if (this.state.state?.revision === state.revision) {
        if (this.state.loading) this.emit({ loading: false, error: null })
        return
      }
      this.emit({ state, error: null, loading: false })
    } catch (error) {
      this.emit({ error: error instanceof Error ? error.message : String(error), loading: false })
    }
  }

  private startPolling(): void {
    if (this.poll !== null) return
    const tick = (): void => {
      this.poll = window.setTimeout(() => {
        // 标签页在后台时不打扰服务器：回到前台立即补一次
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') void this.refresh()
        tick()
      }, 8000)
    }
    tick()
  }

  private stopPolling(): void {
    if (this.poll !== null) {
      window.clearTimeout(this.poll)
      this.poll = null
    }
  }

  /** 读取一篇资料内容（Library 视图用）。 */
  async readDoc(docId: string): Promise<{ ok: boolean; title?: string; content?: string; path?: string; message?: string }> {
    const api = this.api()
    if (api === undefined) return { ok: false, message: '公司服务尚未就绪' }
    try {
      return await api.readDocRemote(docId)
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 提示一条结果。 */
  notify(text: string, kind: 'ok' | 'err' = 'ok'): void {
    this.emit({ toast: { text, kind } })
    window.setTimeout(() => {
      if (this.state.toast?.text === text) this.emit({ toast: null })
    }, 4200)
  }

  /**
   * 执行一个变更动作：成功提示 + 刷新，失败转成错误提示。
   * @param label - 动作用户可见名。
   * @param run - 实际调用。
   */
  async act(label: string, run: (api: CompanyRemote) => Promise<Ack | { ok: boolean; message?: string; delivered?: number }>): Promise<boolean> {
    const api = this.api()
    if (api === undefined) {
      this.notify('公司服务尚未就绪', 'err')
      return false
    }
    try {
      const result = await run(api)
      if (!result.ok) {
        this.notify(`${label}失败：${result.message ?? '未知原因'}`, 'err')
        await this.refresh()
        return false
      }
      this.notify(`${label}成功`)
      await this.refresh()
      return true
    } catch (error) {
      this.notify(`${label}失败：${error instanceof Error ? error.message : String(error)}`, 'err')
      return false
    }
  }
}

/** 面板用到的派生统计。 */
export function tasksOf(state: CompanyState, assigneeId?: string): TaskRecord[] {
  return assigneeId === undefined ? state.tasks : state.tasks.filter((task) => task.assigneeId === assigneeId)
}

/** 某员工今日工作日志。 */
export function worklogOf(state: CompanyState, agentId: string): CompanyState['worklogs'][number] | undefined {
  return state.worklogs.find((record) => record.agentId === agentId)
}

/** 员工显示名。 */
export function nameOf(state: CompanyState, agentId: string | null): string {
  if (agentId === null) return '待认领'
  return state.agents.find((record) => record.id === agentId)?.name ?? agentId
}

/** 员工记录。 */
export function agentOf(state: CompanyState, agentId: string | null): AgentRecord | undefined {
  return agentId === null ? undefined : state.agents.find((record) => record.id === agentId)
}

/** 审批计数。 */
export function pendingApprovals(state: CompanyState): ApprovalRecord[] {
  return (state.approvals ?? []).filter((record) => record.status === 'pending')
}

/** 数字千分位。 */
export function fmtNumber(value: number): string {
  return value.toLocaleString('en-US')
}

/** token 紧凑显示。 */
export function fmtTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/** 毫秒 → 「x 小时 y 分」/「y 分」。 */
export function fmtDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

/** 紧凑相对时间（窄卡片用）：12m / 3h / 09-18 / 2025-11-02。 */
export function fmtTimeShort(at: number, now = Date.now()): string {
  const diff = now - at
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return date.getFullYear() === new Date(now).getFullYear() ? `${month}-${day}` : `${date.getFullYear()}-${month}-${day}`
}

/** 时间戳 → 本地相对时间。 */
export function fmtTime(at: number, now = Date.now()): string {
  const diff = now - at
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export type { ActionResult }
