import type { Database } from 'better-sqlite3'

/** 索引 schema 版本；只增不改，旧库按缺口逐步补齐 */
export const SCHEMA_VERSION = 1

type Migration = (db: Database) => void

/** 有序迁移：下标 + 1 就是目标 `user_version` */
const MIGRATIONS: readonly Migration[] = [
  (db) => {
    db.exec(`
      create table meta (key text primary key, value text not null);
      create table goals (
        id               text primary key,
        title            text not null,
        kind             text not null,
        status           text not null,
        deadline         text,
        success_criteria text,
        created_at       text not null
      );
      create index goals_created_at on goals (created_at);
    `)
  },
]

export function migrate(db: Database): number {
  const current = db.pragma('user_version', { simple: true }) as number

  if (current > SCHEMA_VERSION) {
    throw new Error(`索引 schema 版本 ${current} 高于程序支持的 ${SCHEMA_VERSION}，拒绝降级使用`)
  }

  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    const migration = MIGRATIONS[version]
    if (migration === undefined) {
      throw new Error(`缺少迁移：v${version} → v${version + 1}`)
    }

    db.transaction(() => {
      migration(db)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }

  return SCHEMA_VERSION
}
