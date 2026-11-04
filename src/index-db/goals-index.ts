import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { GOALS_DIR, listGoals, type GoalSummary } from '../domain/goals.js'

export interface SourceStamp {
  /** 目标目录里 `.md` 的最大 mtime（毫秒）；空目录为 0 */
  latestMtimeMs: number
  fileCount: number
}

export interface StoredGoal {
  id: string
  title: string
  kind: string
  status: string
  deadline?: string
  successCriteria?: string
  createdAt: string
}

const SOURCE_STAMP = 'source_stamp'
const BUILT_AT = 'built_at'

export function describeSource(root: string): SourceStamp {
  const dir = join(root, GOALS_DIR)

  try {
    const files = readdirSync(dir).filter((name) => name.endsWith('.md'))
    let latestMtimeMs = 0
    for (const name of files) {
      const stat = statSync(join(dir, name))
      if (stat.mtimeMs > latestMtimeMs) latestMtimeMs = stat.mtimeMs
    }
    return { latestMtimeMs, fileCount: files.length }
  } catch {
    // 目录还不存在：当作空快照，而不是抛错
    return { latestMtimeMs: 0, fileCount: 0 }
  }
}

export function formatStamp(stamp: SourceStamp): string {
  return `${Math.round(stamp.latestMtimeMs)}:${stamp.fileCount}`
}

export function readMeta(db: Database, key: string): string | undefined {
  const row = db.prepare('select value from meta where key = ?').get(key) as
    { value: string } | undefined
  return row?.value
}

export function writeMeta(db: Database, key: string, value: string): void {
  db.prepare(
    'insert into meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
  ).run(key, value)
}

export function readStoredStamp(db: Database): string | undefined {
  return readMeta(db, SOURCE_STAMP)
}

/** 从 Markdown 全量重建 goals 表；返回写入的行数 */
export function rebuildGoals(db: Database, root: string): number {
  const goals = listGoals(root)
  const stamp = formatStamp(describeSource(root))

  const insert = db.prepare(`
    insert into goals (id, title, kind, status, deadline, success_criteria, created_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    db.prepare('delete from goals').run()
    for (const goal of goals) {
      insert.run(
        goal.id,
        goal.title,
        goal.kind,
        goal.status,
        goal.deadline ?? null,
        goal.successCriteria ?? null,
        goal.createdAt,
      )
    }
    writeMeta(db, SOURCE_STAMP, stamp)
    writeMeta(db, BUILT_AT, new Date().toISOString())
  })()

  return goals.length
}

export function upsertGoal(db: Database, goal: GoalSummary): void {
  db.prepare(
    `insert into goals (id, title, kind, status, deadline, success_criteria, created_at)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set
       title = excluded.title,
       kind = excluded.kind,
       status = excluded.status,
       deadline = excluded.deadline,
       success_criteria = excluded.success_criteria,
       created_at = excluded.created_at`,
  ).run(
    goal.id,
    goal.title,
    goal.kind,
    goal.status,
    goal.deadline ?? null,
    goal.successCriteria ?? null,
    goal.createdAt,
  )
}

export function readGoals(db: Database): StoredGoal[] {
  const rows = db
    .prepare(
      `select id, title, kind, status, deadline, success_criteria, created_at
       from goals order by created_at asc, id asc`,
    )
    .all() as {
    id: string
    title: string
    kind: string
    status: string
    deadline: string | null
    success_criteria: string | null
    created_at: string
  }[]

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    ...(row.deadline === null ? {} : { deadline: row.deadline }),
    ...(row.success_criteria === null ? {} : { successCriteria: row.success_criteria }),
    createdAt: row.created_at,
  }))
}
