/**
 * 示例：初始化一家「一人公司」——两名员工、两个项目、两份档案、两个接手任务。
 *
 * 用法：
 *   1. 先把下面的 PLACEHOLDERS 换成你自己的仓库路径；
 *   2. node scripts/seed-example.mjs            # 写入
 *      node scripts/seed-example.mjs --dry-run  # 只看计划
 *   3. 重启 dsh web（公司服务会在启动时补齐 CEO、大厅与项目群会话）。
 *
 * 说明：这是直接写 storage domain 介质的方式，适合首次搭建；日常招聘/建项目请用
 * 公司面板或让 CEO 用 company_hire_request 走审批。
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// ── 改这里 ────────────────────────────────────────────────────────────────
const PULSE_REPO = '/Users/you/projects/your-first-repo'
const PULSE_SERVER = '/Users/you/projects/your-first-server'
const DESIC_REPO = '/Users/you/projects/your-second-repo'
const VAULT = '/Users/you/Documents/Obsidian Vault'
// ──────────────────────────────────────────────────────────────────────────

const HOME = homedir()
const ROOT = join(HOME, '.dsh', 'onecompany')
const DOMAIN = join(HOME, '.dsh', 'storages', 'onecompany.json')
const dryRun = process.argv.includes('--dry-run')
const now = Date.now()

const agents = [
  {
    id: 'agt_alpha', name: '示例员工甲', title: '产品工程师 · 项目甲', role: 'engineer',
    managerId: null, projectIds: ['prj_alpha'], presetId: null,
    persona: '（把岗位说明书放在这里，或先用面板招聘再由 CEO 撰写）负责项目甲的客户端与服务端对齐；改动前先读项目档案。',
    provider: null, model: null, effort: null, sessionId: `ses_${randomUUID()}`,
    cwd: PULSE_REPO, provisionedAt: null, status: 'active',
    permissions: { projects: { prj_alpha: 'write', '*': 'read' }, tools: [], canHire: false, canApprove: false },
    dailyTokenCap: null, createdAt: now, updatedAt: now,
  },
  {
    id: 'agt_beta', name: '示例员工乙', title: '桌面端工程师 · 项目乙', role: 'engineer',
    managerId: null, projectIds: ['prj_beta'], presetId: null,
    persona: '负责项目乙的桌面端；遵守仓库自带的 AGENTS.md 与开发规范，交付必须附验证命令与结果。',
    provider: null, model: null, effort: null, sessionId: `ses_${randomUUID()}`,
    cwd: DESIC_REPO, provisionedAt: null, status: 'active',
    permissions: { projects: { prj_beta: 'write', '*': 'read' }, tools: [], canHire: false, canApprove: false },
    dailyTokenCap: null, createdAt: now, updatedAt: now,
  },
]

const projects = [
  {
    id: 'prj_alpha', name: '项目甲', description: '（一句话定位）当前重心与边界。',
    rootPath: join(ROOT, 'projects', 'prj_alpha'), repoPath: PULSE_REPO,
    channelSessionId: null, acl: { agt_alpha: 'write' }, defaultAcl: 'read',
    createdBy: '董事会', createdAt: now,
  },
  {
    id: 'prj_beta', name: '项目乙', description: '（一句话定位）当前主线。',
    rootPath: join(ROOT, 'projects', 'prj_beta'), repoPath: DESIC_REPO,
    channelSessionId: null, acl: { agt_beta: 'write' }, defaultAcl: 'read',
    createdBy: '董事会', createdAt: now,
  },
]

const docs = [
  {
    id: 'doc_alpha_handover', projectId: 'prj_alpha', title: '项目甲 · 交接清单',
    rel: 'projects/prj_alpha/交接清单.md', createdBy: '董事会',
    content: `# 项目甲 · 交接清单\n\n1. 读仓库：README、规范文档、最近提交；\n2. 读知识库（当索引，不当权威）：${VAULT}/Projects/<你的项目>；\n3. 跑一次构建/测试，把结果写进 reports/；\n4. 产出《接手报告》：现状 / 你判断的前三个切片 / 风险。\n`,
  },
  {
    id: 'doc_beta_handover', projectId: 'prj_beta', title: '项目乙 · 交接清单',
    rel: 'projects/prj_beta/交接清单.md', createdBy: '董事会',
    content: `# 项目乙 · 交接清单\n\n1. 先看工作区现场（git status / log），保留他人改动；\n2. 读仓库规范与当前主线设计；\n3. 跑一次构建与类型检查；\n4. 产出《接手报告》写进 reports/。\n`,
  },
]

const tasks = [
  { id: 'tsk_alpha_onboard', title: '接手简报：读仓库与知识库，产出《接手报告》', assigneeId: 'agt_alpha', projectId: 'prj_alpha' },
  { id: 'tsk_beta_onboard', title: '接手简报：核对主线与工作区现场，产出《接手报告》', assigneeId: 'agt_beta', projectId: 'prj_beta' },
]

const docRecords = docs.map((doc) => ({
  id: doc.id, projectId: doc.projectId, title: doc.title, path: doc.rel,
  tags: [], createdBy: doc.createdBy, updatedAt: now,
}))

const taskRecords = tasks.map((task) => ({
  id: task.id, title: task.title,
  desc: '按项目档案里的《交接清单》执行；本任务不要求改代码，重在摸清现场并给出你的判断。',
  assigneeId: task.assigneeId, creatorType: 'board', creatorId: 'board',
  parentTaskId: null, projectId: task.projectId, status: 'todo', priority: 2,
  dueAt: null, checkoutBy: null, checkoutAt: null, result: null,
  createdAt: now, updatedAt: now, doneAt: null,
}))

const messages = tasks.map((task) => ({
  id: `msg_${randomUUID().slice(0, 8)}`,
  fromType: 'board', fromId: 'board', fromName: '董事会',
  toType: 'agent', toId: task.assigneeId, kind: 'task_notice', taskId: task.id,
  body: `【新任务】\n任务：${task.title}（${task.id}）\n请先用 \`company_task_update\`（checkout=true）认领，再动手；完成后置 status=review 并用 \`company_report\` 汇报。`,
  status: 'pending', createdAt: now, deliveredAt: null,
}))

const table = (rows) => Object.fromEntries(rows.map((row) => [row.id ?? row.key, row]))
const payload = {
  unit: { name: 'onecompany', version: 1 },
  global: { enabled: true, companyName: '一人公司', createdAt: now },
  tables: {
    agents: table(agents), projects: table(projects), docs: table(docRecords),
    tasks: table(taskRecords), comments: {}, messages: table(messages),
    approvals: {}, schedules: {}, worklogs: {}, activity: {},
  },
}

if (dryRun) {
  console.log('（dry-run）将写入：')
  console.log('  员工:', agents.map((a) => `${a.name}（${a.title}）`).join('、'))
  console.log('  项目:', projects.map((p) => p.name).join('、'))
  console.log('  档案:', docRecords.length, '篇 · 任务:', taskRecords.length, '个')
  console.log('  目标文件:', DOMAIN)
} else {
  for (const agent of agents) {
    const dir = agent.cwd
    if (!dir.startsWith(ROOT)) continue
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'AGENTS.md'), agent.persona, 'utf8')
  }
  for (const doc of docs) {
    const file = join(ROOT, doc.rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, doc.content, 'utf8')
  }
  for (const project of projects) mkdirSync(join(project.rootPath, 'reports'), { recursive: true })
  writeFileSync(DOMAIN, JSON.stringify(payload, null, 2))
  console.log('已写入:', DOMAIN)
  console.log('下一步：重启 dsh web —— 公司服务会补齐 CEO、大厅与项目群会话，并投递这', taskRecords.length, '个任务。')
}
