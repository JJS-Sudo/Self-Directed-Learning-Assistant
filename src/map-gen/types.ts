import type { LinkType } from '../shared/map.js'

/** 候选节点的内部形状：`tempId` 只在一次生成/确认过程中有效 */
export interface RawCandidate {
  tempId: string
  title: string
  parentTempId?: string
  why?: string
}

/** 候选边：引用本块的 tempId */
export interface RawEdge {
  fromTempId: string
  toTempId: string
  type: LinkType
}
