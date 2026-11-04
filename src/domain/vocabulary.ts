import { VaultError } from '../vault/errors.js'

/**
 * 取值域的**唯一定义处**。
 * 约定（SOP.md 第 6 节的约定）：面向用户的枚举值一律用中文 —— 人要在 Obsidian 里读；
 * 字段名用 ASCII —— 代码要匹配。
 */

export const LEVELS = ['入门', '进阶', '熟练'] as const
export const MEDIA_TYPES = ['视频', '文字'] as const
export const MEDIA_PREFERENCES = ['视频', '文字', '不限'] as const
export const MASTERY_VALUES = ['未学', '在学', '已掌握'] as const
/** 目标类型：`激励性` 是总目标（要求期限），`常规` 是普通目标 */
export const GOAL_KINDS = ['激励性', '常规'] as const
export const QUESTION_KINDS = ['封闭', '开放'] as const
export const ASSESSMENT_MODES = ['复述', '做题'] as const
/** `mode: 复述` 的 `result` 取值域 */
export const RECITAL_RESULTS = ['已完成', '未完成'] as const
/** `mode: 做题` 的 `result` 取值域。`未作答` 也必须落一条记录 */
export const QUIZ_RESULTS = ['正确', '错误', '未作答'] as const
/** 可变更的目录型实体共用的状态取值 */
export const STATUS_VALUES = ['在用', '已归档'] as const

export type Level = (typeof LEVELS)[number]
export type MediaType = (typeof MEDIA_TYPES)[number]
export type MediaPreference = (typeof MEDIA_PREFERENCES)[number]
export type Mastery = (typeof MASTERY_VALUES)[number]
export type GoalKind = (typeof GOAL_KINDS)[number]
export type QuestionKind = (typeof QUESTION_KINDS)[number]
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number]
export type RecitalResult = (typeof RECITAL_RESULTS)[number]
export type QuizResult = (typeof QUIZ_RESULTS)[number]

/** 取值域校验：不在域内即 `INVALID_INPUT`，错误信息里带上允许的取值 */
export function assertOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
  field: string,
): T {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') {
    throw new VaultError(
      'INVALID_INPUT',
      `${field} 不能为空，取值必须是 ${values.join(' / ')} 之一`,
    )
  }

  const found = values.find((candidate) => candidate === text)
  if (found === undefined) {
    throw new VaultError(
      'INVALID_INPUT',
      `${field} 取值必须是 ${values.join(' / ')} 之一，收到「${text}」`,
    )
  }
  return found
}
