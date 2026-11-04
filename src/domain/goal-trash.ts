import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { VaultError } from '../vault/errors.js'
import { findAreaName } from '../vault/goal-areas.js'
import { TRASH_DIR, resolveInsideVault } from '../vault/paths.js'
import { listDocuments } from '../vault/io.js'
import { listNodes } from './nodes.js'
import { listStages } from './path-stages.js'
import {
  attachNodeToResource,
  detachNodeFromResource,
  listAllResources,
  listResources,
} from './resources.js'
import type { GoalSummary } from './goals.js'

export interface TrashCounts {
  nodes: number
  stages: number
  exclusiveResources: number
  sharedResources: number
}

export interface TrashManifest {
  version: 1
  goalId: string
  title: string
  deletedAt: string
  /** 原目标文件相对路径 */
  goalFile: string
  /** 原分区目录相对路径；目标没有分区时缺省 */
  partitionDir?: string
  /** 独占资源原相对路径 */
  exclusiveResources: string[]
  /** 共享资源：删除时解除的节点关联，恢复时重新挂上 */
  sharedResources: { resourceId: string; nodeIds: string[] }[]
  counts: TrashCounts
}

export interface TrashEntry {
  trashId: string
  goalId: string
  title: string
  deletedAt: string
  counts: TrashCounts
}

function timestampId(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function trashRoot(root: string): string {
  return join(root, TRASH_DIR)
}

function safeTrashId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new VaultError('INVALID_INPUT', `非法回收站条目：${id}`)
  }
  return id
}

function entryDir(root: string, trashId: string): string {
  return join(trashRoot(root), safeTrashId(trashId))
}

function readManifest(root: string, trashId: string): TrashManifest {
  const file = join(entryDir(root, trashId), 'manifest.json')
  if (!existsSync(file)) throw new VaultError('NOT_FOUND', `回收站条目不存在：${trashId}`)
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as TrashManifest
    if (
      parsed.version !== 1 ||
      typeof parsed.goalId !== 'string' ||
      typeof parsed.title !== 'string'
    ) {
      throw new Error('字段缺失')
    }
    return parsed
  } catch {
    throw new VaultError('INVALID_INPUT', `回收站条目损坏：${trashId}`)
  }
}

function exists(path: string): boolean {
  return existsSync(path)
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

/** 计算独占/共享资源；共享只记录本目标节点的关联 */
function resourcePlan(
  root: string,
  goal: GoalSummary,
): Pick<TrashManifest, 'exclusiveResources' | 'sharedResources' | 'counts'> {
  const nodes = listNodes(root, goal.id)
  const goalNodeIds = new Set(nodes.map((node) => node.id))
  const exclusive: string[] = []
  const shared: TrashManifest['sharedResources'] = []

  for (const resource of listAllResources(root)) {
    const owned = resource.nodeIds.filter((id) => goalNodeIds.has(id))
    if (owned.length === 0) continue
    if (resource.nodeIds.every((id) => goalNodeIds.has(id))) {
      exclusive.push(resource.relativePath)
    } else {
      shared.push({ resourceId: resource.id, nodeIds: owned })
    }
  }

  return {
    exclusiveResources: exclusive,
    sharedResources: shared,
    counts: {
      nodes: nodes.length,
      stages: listStages(root, goal.id).length,
      exclusiveResources: exclusive.length,
      sharedResources: shared.length,
    },
  }
}

/**
 * 软删除目标：目标文件、分区目录、独占资源一起进 `99-回收站`；
 * 共享资源只解除本目标节点关联。先写 manifest，失败时逆序回滚。
 */
export function trashGoal(
  root: string,
  goalId: string,
  now = new Date(),
): { trashId: string; manifest: TrashManifest } {
  const goal = requireGoalForTrash(root, goalId)
  const plan = resourcePlan(root, goal)

  const baseId = `${timestampId(now)}-${goal.id}`
  let trashId = baseId
  let suffix = 2
  while (exists(entryDir(root, trashId))) {
    trashId = `${baseId}-${suffix}`
    suffix += 1
  }

  const areaName = findAreaName(root, goal.id)
  const partitionDir = areaName === undefined ? undefined : join('20-学习项目', areaName)
  const manifest: TrashManifest = {
    version: 1,
    goalId: goal.id,
    title: goal.title,
    deletedAt: now.toISOString(),
    goalFile: goal.relativePath,
    ...(partitionDir === undefined ? {} : { partitionDir }),
    exclusiveResources: plan.exclusiveResources,
    sharedResources: plan.sharedResources,
    counts: plan.counts,
  }

  const dir = entryDir(root, trashId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const moved: { from: string; to: string }[] = []
  const move = (from: string, to: string): void => {
    ensureParent(to)
    renameSync(from, to)
    moved.push({ from, to })
  }

  // 先解除共享关联：此时节点文件还在，wikilink 标题不会退化成 id
  const detached: { resourceId: string; nodeIds: string[] }[] = []
  try {
    for (const shared of manifest.sharedResources) {
      detached.push(shared)
      for (const nodeId of shared.nodeIds) {
        detachNodeFromResource(root, shared.resourceId, nodeId)
      }
    }

    for (const relativePath of manifest.exclusiveResources) {
      const destination = join(dir, 'resources', relativePath)
      move(join(root, relativePath), destination)
    }
    if (partitionDir !== undefined) {
      move(join(root, partitionDir), join(dir, 'partition'))
    }
    move(join(root, goal.relativePath), join(dir, 'goal.md'))
  } catch (error) {
    for (const item of moved.reverse()) {
      try {
        ensureParent(item.from)
        renameSync(item.to, item.from)
      } catch {
        /* 回滚尽力而为 */
      }
    }
    for (const shared of detached) {
      for (const nodeId of shared.nodeIds) {
        try {
          attachNodeToResource(root, shared.resourceId, nodeId)
        } catch {
          /* 回滚尽力而为 */
        }
      }
    }
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
    throw error
  }

  return { trashId, manifest }
}

export function listTrash(root: string): TrashEntry[] {
  const dir = trashRoot(root)
  if (!exists(dir)) return []
  const out: TrashEntry[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    try {
      const manifest = readManifest(root, name.name)
      out.push({
        trashId: name.name,
        goalId: manifest.goalId,
        title: manifest.title,
        deletedAt: manifest.deletedAt,
        counts: manifest.counts,
      })
    } catch {
      // 损坏条目不影响其他条目列出
    }
  }
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

export function restoreTrash(
  root: string,
  trashId: string,
): { goalId: string; warnings: string[] } {
  const manifest = readManifest(root, trashId)
  const goalFile = resolveInsideVault(root, manifest.goalFile)
  const partitionTarget =
    manifest.partitionDir === undefined
      ? undefined
      : resolveInsideVault(root, manifest.partitionDir)
  const resourceTargets = manifest.exclusiveResources.map((relativePath) =>
    resolveInsideVault(root, relativePath),
  )

  const idExists = listDocuments(root, '10-目标').some((doc) => doc.data['id'] === manifest.goalId)
  if (idExists || exists(goalFile)) {
    throw new VaultError('CONFLICT', `目标 id 已存在：${manifest.goalId}`)
  }
  if (partitionTarget !== undefined && exists(partitionTarget)) {
    throw new VaultError('CONFLICT', `目标分区已存在：${manifest.partitionDir}`)
  }
  for (const [index, relativePath] of manifest.exclusiveResources.entries()) {
    const target = resourceTargets[index]
    if (target !== undefined && exists(target)) {
      throw new VaultError('CONFLICT', `资源已存在：${relativePath}`)
    }
  }

  const dir = entryDir(root, trashId)
  const moved: { from: string; to: string }[] = []
  const move = (from: string, to: string): void => {
    ensureParent(to)
    renameSync(from, to)
    moved.push({ from, to })
  }

  try {
    move(join(dir, 'goal.md'), goalFile)
    if (partitionTarget !== undefined) {
      move(join(dir, 'partition'), partitionTarget)
    }
    for (const [index, relativePath] of manifest.exclusiveResources.entries()) {
      const target = resourceTargets[index]
      if (target === undefined) continue
      move(join(dir, 'resources', relativePath), target)
    }
  } catch (error) {
    for (const item of moved.reverse()) {
      try {
        ensureParent(item.from)
        renameSync(item.to, item.from)
      } catch {
        /* 忽略 */
      }
    }
    throw error
  }

  const warnings: string[] = []
  for (const shared of manifest.sharedResources) {
    try {
      const resource = requireResourceById(root, shared.resourceId)
      for (const nodeId of shared.nodeIds) attachNodeToResource(root, resource.id, nodeId)
    } catch (error) {
      warnings.push(`共享资源恢复失败：${shared.resourceId}（${String(error)}）`)
    }
  }

  rmSync(dir, { recursive: true, force: true })
  return { goalId: manifest.goalId, warnings }
}

export function purgeTrash(root: string, trashId: string): void {
  const manifest = readManifest(root, trashId)
  void manifest
  rmSync(entryDir(root, trashId), { recursive: true, force: true })
}

function requireGoalForTrash(root: string, goalId: string): GoalSummary {
  // 避免领域循环依赖：直接按 id 找目标文件
  const goals = listDocuments(root, '10-目标')
  const doc = goals.find((item) => item.data['id'] === goalId)
  if (doc === undefined) throw new VaultError('NOT_FOUND', `目标不存在：${goalId}`)
  return {
    id: goalId,
    title: String(doc.data['title'] ?? ''),
    status: String(doc.data['status'] ?? '在用'),
    kind: String(doc.data['kind'] ?? '常规'),
    relativePath: doc.relativePath,
    createdAt: String(doc.data['created_at'] ?? ''),
  }
}

function requireResourceById(root: string, id: string) {
  const resource = listResources(root).find((item) => item.id === id)
  if (resource === undefined) throw new VaultError('NOT_FOUND', `资源不存在：${id}`)
  return resource
}
