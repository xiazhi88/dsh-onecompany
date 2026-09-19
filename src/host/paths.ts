/** 公司目录布局与路径工具。 */
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'

/** 目录布局。 */
export interface CompanyPaths {
  root: string
  employees: string
  projects: string
  library: string
  templates: string
}

/** 解析公司根目录：显式配置优先，其次 $DSH_HOME/onecompany，最后 ~/.dsh/onecompany。 */
export function resolveRoot(configured: string): string {
  if (configured.trim() !== '') return resolve(configured.trim())
  const home = process.env.DSH_HOME?.trim()
  if (home !== undefined && home !== '') return join(resolve(home), 'onecompany')
  return join(homedir(), '.dsh', 'onecompany')
}

/** 计算并创建公司目录布局。 */
export async function ensurePaths(root: string): Promise<CompanyPaths> {
  const paths: CompanyPaths = {
    root,
    employees: join(root, 'employees'),
    projects: join(root, 'projects'),
    library: join(root, 'library'),
    templates: join(root, 'templates'),
  }
  await mkdir(paths.root, { recursive: true })
  await mkdir(paths.employees, { recursive: true })
  await mkdir(paths.projects, { recursive: true })
  await mkdir(paths.library, { recursive: true })
  await mkdir(paths.templates, { recursive: true })
  return paths
}

/** 员工工作目录。 */
export function employeeDir(paths: CompanyPaths, agentId: string): string {
  return join(paths.employees, agentId)
}

/**
 * 把相对路径解析进一个允许的根；拒绝逃逸（`..`、绝对路径、符号链接无关的纯路径检查）。
 * @param base - 允许的根目录。
 * @param relative - 调用方给出的相对路径。
 * @returns 绝对路径。
 * @throws 当路径为空或逃出根目录。
 */
export function safeJoin(base: string, relative: string): string {
  const trimmed = relative.trim().replace(/^\/+/, '')
  if (trimmed === '') throw new Error('路径不能为空')
  if (isAbsolute(trimmed)) throw new Error('必须是相对路径')
  const target = resolve(base, trimmed)
  const prefix = base.endsWith(sep) ? base : base + sep
  if (target !== base && !target.startsWith(prefix)) throw new Error('路径越界')
  return target
}

/** 把绝对路径渲染成相对根目录的展示路径。 */
export function displayPath(root: string, absolute: string): string {
  return absolute.startsWith(root + sep) ? absolute.slice(root.length + 1) : absolute
}
