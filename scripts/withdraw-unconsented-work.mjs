/**
 * 停掉「未经董事会派发」的在办工作（幂等，可重复运行）。
 *
 * 背景：设计漏洞——员工曾能自己建任务、自己排程、互相派活，于是入职后自行开工，
 * 产生了一批 todo/in_progress。本脚本按新规矩（工作只由董事会分发）收口：
 *
 * - 由 **agent 创建** 且状态为 `todo` / `in_progress` 的任务 → 置 `cancelled`，
 *   并写一条评论说明原因（`review` 的成品不动作，留给董事会复核；`done` 保留为历史）。
 * - 由 **员工（非 CEO）创建** 的排程 → 暂停（`enabled: false`），董事会可在面板
 *   「排程」页决定恢复或删除。
 *
 * 用法：node scripts/withdraw-unconsented-work.mjs [--dry-run]
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DOMAIN = join(homedir(), '.dsh', 'storages', 'onecompany.json')
const dryRun = process.argv.includes('--dry-run')
const now = Date.now()
const REASON = '按董事会新规：工作只由董事会分发（员工不得自建任务/自我排程）。此任务未经派发，已作废；如仍需推进，请董事会重新派发。'

const domain = JSON.parse(readFileSync(DOMAIN, 'utf8'))
const agents = domain.tables.agents
const nameOf = (id) => agents[id]?.name ?? id

const cancelled = []
for (const task of Object.values(domain.tables.tasks)) {
  if (task.creatorType !== 'agent') continue
  if (task.status !== 'todo' && task.status !== 'in_progress') continue
  if (task.desc?.includes('已作废')) continue
  task.status = 'cancelled'
  task.updatedAt = now
  task.result = `${task.result ?? ''}\n[作废] ${REASON}`.trim()
  const commentId = `cmt_${randomUUID().slice(0, 8)}`
  domain.tables.comments[commentId] = {
    id: commentId, taskId: task.id, authorType: 'board', authorId: 'board', authorName: '董事会',
    text: REASON, createdAt: now,
  }
  cancelled.push(`${nameOf(task.assigneeId)}｜${task.title}`)
}

const paused = []
for (const schedule of Object.values(domain.tables.schedules)) {
  if (!schedule.enabled) continue
  const record = agents[schedule.agentId]
  const isCeo = record?.role === 'ceo'
  if (record === undefined || isCeo) continue
  schedule.enabled = false
  paused.push(`${record.name}｜${schedule.kind}｜${schedule.prompt.slice(0, 40).replace(/\n/g, ' ')}`)
}

if (!dryRun) {
  for (const line of [...cancelled, ...paused]) {
    const id = `act_${randomUUID().slice(0, 10)}`
    domain.tables.activity[id] = {
      id, at: now, actorType: 'board', actorId: 'board', actorName: '董事会',
      action: 'work.withdraw', detail: line,
    }
  }
  writeFileSync(DOMAIN, JSON.stringify(domain, null, 2))
}

console.log(dryRun ? '（dry-run，未写入）' : '已写入')
console.log(`作废任务 ${cancelled.length} 条：`)
for (const line of cancelled) console.log('  -', line)
console.log(`暂停排程 ${paused.length} 条：`)
for (const line of paused) console.log('  -', line)
