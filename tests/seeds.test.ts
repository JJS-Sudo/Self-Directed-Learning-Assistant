import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import matter from 'gray-matter'
import { extractManagedBlock } from '../src/vault/document.js'

/**
 * 种子数据完整性：把 seeds/ 当成一个真实的库来校验。
 * 它同时是 roadmap P6-1「依据 seeds/ 重建」的前置保证 —— 种子自己先得是合法的。
 */

const SEEDS = join(import.meta.dirname, '..', 'seeds')

/** 相对目录 → 该目录下文件**允许**的 `type`（验收目录同时放题目与验收记录） */
function allowedTypes(relDir: string): string[] {
  const parts = relDir.split(/[\\/]/)
  const leaf = parts[parts.length - 1] ?? ''
  const inArea = parts[0] === '20-学习项目'

  if (relDir === '00-配置') return ['profile']
  if (relDir === '10-目标') return ['goal']
  if (relDir === '40-资源') return ['resource']
  if (inArea && leaf === '知识网') return ['map-node']
  if (inArea && leaf === '学习路径') return ['path-stage']
  if (inArea && leaf === '验收') return ['question', 'assessment']
  if (inArea && leaf === '复盘') return ['retrospective']
  return []
}

const REQUIRED = ['id', 'type', 'schema_version', 'created_at'] as const
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g

function walkMarkdown(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMarkdown(full))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

const files = walkMarkdown(SEEDS)
const docs = files.map((path) => {
  const parsed = matter(readFileSync(path, 'utf8'))
  return {
    path,
    rel: path.slice(SEEDS.length + 1),
    dir:
      path
        .slice(SEEDS.length + 1)
        .split(/[\\/]/)
        .slice(0, -1)
        .join('/') || '.',
    base: path.replace(/\.md$/, '').split(/[\\/]/).pop() ?? '',
    raw: readFileSync(path, 'utf8'),
    content: parsed.content,
    data: parsed.data as Record<string, unknown>,
  }
})

const basenames = new Set(docs.map((d) => d.base))

describe('seeds/', () => {
  it('至少覆盖七个实体目录，且每个文件都能解析出 frontmatter', () => {
    expect(files.length).toBeGreaterThanOrEqual(8)
    for (const doc of docs) {
      expect(doc.data, doc.rel).toBeTypeOf('object')
    }
  })

  it('每个文件都有 id / type / schema_version / created_at', () => {
    for (const doc of docs) {
      for (const key of REQUIRED) {
        expect(doc.data[key], `${doc.rel} 缺少 ${key}`).toBeDefined()
      }
      expect(doc.data.schema_version, doc.rel).toBe(1)
    }
  })

  it('created_at 与 date 都是字符串（引号约定在真实种子上成立）', () => {
    for (const doc of docs) {
      expect(typeof doc.data.created_at, doc.rel).toBe('string')
      if ('date' in doc.data) {
        expect(typeof doc.data.date, doc.rel).toBe('string')
      }
    }
  })

  it('id 全局唯一', () => {
    const ids = docs.map((d) => d.data.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个文件都落在该放的位置（目标分区结构）', () => {
    for (const doc of docs) {
      const allowed = allowedTypes(doc.dir)
      expect(allowed, `${doc.rel} 落在不该出现的位置：${doc.dir}`).not.toEqual([])
      expect(allowed, `${doc.rel} 的 type「${String(doc.data.type)}」与目录不符`).toContain(
        doc.data.type,
      )
    }
  })

  it('实体按目标分区：每个目标一个目录，四个子目录都被演示到', () => {
    const areas = new Set(
      docs
        .filter((doc) => doc.dir.startsWith('20-学习项目/'))
        .map((doc) => doc.dir.split('/')[1] ?? ''),
    )
    expect(areas.size).toBeGreaterThanOrEqual(2)

    // 每个分区至少有知识网与学习路径（这两个是地图与路径的源）
    for (const area of areas) {
      for (const subdir of ['知识网', '学习路径']) {
        const dir = `20-学习项目/${area}/${subdir}`
        expect(
          docs.some((doc) => doc.dir === dir),
          `${dir} 里一个文件都没有（种子应当演示完整的分区结构）`,
        ).toBe(true)
      }
    }

    // 四类子目录在整个种子里都要出现（不要求每个目标都齐全，空目录进不了版本库）
    for (const subdir of ['知识网', '学习路径', '验收', '复盘']) {
      expect(
        docs.some((doc) => doc.dir.endsWith(`/${subdir}`)),
        `种子里没有任何 ${subdir}/ 下的文件`,
      ).toBe(true)
    }
  })

  it('目标有 kind；激励性目标必须有 deadline', () => {
    const goals = docs.filter((doc) => doc.data.type === 'goal')
    expect(goals.length).toBeGreaterThanOrEqual(2)

    for (const goal of goals) {
      expect(goal.data.kind, goal.rel).toBeTruthy()
      if (goal.data.kind === '激励性') {
        expect(goal.data.deadline, goal.rel).toBeTruthy()
        expect(typeof goal.data.deadline, goal.rel).toBe('string')
      }
    }
    expect(goals.some((goal) => goal.data.kind === '激励性')).toBe(true)
  })

  it('路径段必须有 checks 与 nodes（检验信号与涉及节点）', () => {
    const stages = docs.filter((doc) => doc.data.type === 'path-stage')
    expect(stages.length).toBeGreaterThan(0)

    for (const stage of stages) {
      expect(Array.isArray(stage.data.checks), stage.rel).toBe(true)
      expect((stage.data.checks as unknown[]).length, stage.rel).toBeGreaterThan(0)
      expect(Array.isArray(stage.data.nodes), stage.rel).toBe(true)
      expect((stage.data.nodes as unknown[]).length, stage.rel).toBeGreaterThan(0)
      expect(stage.data.estimate, stage.rel).toBeTruthy()
    }
  })

  it('题目带 goal（分区之后题目也要能归属到目标）', () => {
    for (const doc of docs.filter((item) => item.data.type === 'question')) {
      expect(doc.data.goal, doc.rel).toBeTruthy()
    }
  })

  it('文件名以 id 开头（单例 profile.md 是唯一例外）', () => {
    for (const doc of docs) {
      if (doc.data.type === 'profile') {
        expect(doc.base, doc.rel).toBe('profile')
        continue
      }
      expect(doc.base.startsWith(`${String(doc.data.id)} `), doc.rel).toBe(true)
    }
  })

  it('所有 wikilink 都能解析到库内文件', () => {
    for (const doc of docs) {
      for (const [, target] of doc.raw.matchAll(WIKILINK)) {
        expect(basenames.has(target ?? ''), `${doc.rel} 里的 [[${target}]] 指向不存在的文件`).toBe(
          true,
        )
      }
    }
  })

  it('相关关系只声明一次（同一对节点不双向重复声明）', () => {
    const body = docs.map((d) => {
      const linked = [...d.raw.matchAll(WIKILINK)].map((m) => m[1] ?? '')
      return { id: String(d.data.id), linked }
    })
    const pairSeen = new Set<string>()
    for (const doc of body) {
      for (const target of doc.linked) {
        const key = [doc.id, target].sort().join('|')
        if (pairSeen.has(key)) continue
        pairSeen.add(key)
      }
    }
    // 条件类型 ↔ 类型体操 这对相关关系，库里只应出现一次
    const n3 = docs.find((d) => d.data.id === 'n3c4d5')
    const n4 = docs.find((d) => d.data.id === 'n4d5e6')
    expect(n3?.raw).toContain('n4d5e6')
    expect(n4?.raw ?? '').not.toContain('n3c4d5')
  })

  it('封闭题必须有答案与解析；开放题不要求', () => {
    const questions = docs.filter((d) => d.data.type === 'question')
    expect(questions.length).toBeGreaterThanOrEqual(2)

    for (const q of questions) {
      if (q.data.kind === '封闭') {
        expect(q.data.answer, q.rel).toBeTruthy()
        // 解析是长文本：按 Conventions 落在正文受管区块，不占 frontmatter
        expect(extractManagedBlock(q.content), q.rel).toBeTruthy()
      }
    }
    const open = questions.filter((q) => q.data.kind === '开放')
    expect(open.some((q) => q.data.answer === undefined)).toBe(true)
  })

  it('做题记录带 question，复述记录不带', () => {
    const assessments = docs.filter((d) => d.data.type === 'assessment')
    const quiz = assessments.filter((d) => d.data.mode === '做题')
    const recite = assessments.filter((d) => d.data.mode === '复述')

    expect(quiz.length).toBeGreaterThan(0)
    expect(recite.length).toBeGreaterThan(0)

    for (const a of quiz) expect(a.data.question, a.rel).toBeDefined()
    for (const a of recite) expect(a.data.question, a.rel).toBeUndefined()

    // 同一次验收共享 session_id
    const sessions = new Set(assessments.map((d) => d.data.session_id))
    expect(sessions.size).toBeLessThan(assessments.length)
  })

  it('四枝干在库里都有实例：上级 / 并列 / 相关 / 缺少 up 的顶层节点', () => {
    const nodes = docs.filter((d) => d.data.type === 'map-node')

    const withUp = nodes.filter((d) => typeof d.data.up === 'string')
    const withoutUp = nodes.filter((d) => d.data.up === undefined)
    expect(withoutUp.length).toBeGreaterThan(0) // 顶层节点不写 up

    const byUp = new Map<string, number>()
    for (const n of withUp) {
      const up = String(n.data.up)
      byUp.set(up, (byUp.get(up) ?? 0) + 1)
    }
    // 同一 up 下至少有两个兄弟节点 → 并列成立
    expect([...byUp.values()].some((count) => count >= 2)).toBe(true)
  })
})
