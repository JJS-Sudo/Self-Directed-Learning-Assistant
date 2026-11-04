import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { wikilink } from '../vault/document.js'
import { updateDocument } from '../vault/io.js'
import { listNodes, requireNode } from './nodes.js'
import { listQuestions } from './questions.js'
import { listStages } from './path-stages.js'

export interface NodeReferences {
  stages: { id: string; title: string }[]
  questions: { id: string; title: string }[]
}

/** 删除前先看看哪些路径段/题目引用了它 */
export function referencesOf(root: string, nodeId: string): NodeReferences {
  const node = requireNode(root, nodeId)
  if (node.goalId === undefined) return { stages: [], questions: [] }
  return {
    stages: listStages(root, node.goalId)
      .filter((stage) => stage.nodeIds.includes(nodeId))
      .map((stage) => ({ id: stage.id, title: stage.title })),
    questions: listQuestions(root, node.goalId)
      .filter((question) => question.nodeId === nodeId)
      .map((question) => ({ id: question.id, title: question.title })),
  }
}

/** 删除节点：级联清掉指向它的边，子节点升为顶层；返回它被谁引用过 */
export function removeNode(
  root: string,
  nodeId: string,
): {
  references: NodeReferences
  removedLinks: number
} {
  const node = requireNode(root, nodeId)
  const references = referencesOf(root, nodeId)
  let removedLinks = 0

  if (node.goalId !== undefined) {
    for (const other of listNodes(root, node.goalId)) {
      if (other.id === nodeId) continue
      const links = other.links.filter((link) => link.to !== nodeId)
      const lostParent = other.upId === nodeId
      if (links.length === other.links.length && !lostParent) continue

      removedLinks += other.links.length - links.length
      const parent = links.find((link) => link.type === 'parent')
      updateDocument({
        root,
        relativePath: other.relativePath,
        frontmatter: {
          links: links.map((link) => ({ to: link.to, type: link.type })),
          ...(lostParent
            ? { up: null }
            : parent === undefined
              ? {}
              : { up: wikilink(parent.to, requireNode(root, parent.to).title) }),
        },
      })
    }
  }

  rmSync(join(root, node.relativePath))
  return { references, removedLinks }
}
