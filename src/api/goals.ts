import { z } from 'zod'
import { daysLeftOf, type GoalSummary } from '../domain/goals.js'
import { todayLocal } from '../domain/validate.js'
import type { GoalListItem } from '../shared/goals.js'
import type { StoredGoal } from '../index-db/goals-index.js'

/** HTTP 边界的校验：领域层仍用自己的 `VaultError` 规则，这里只挡脏输入 */
export const createGoalSchema = z.object({
  title: z.string().trim().min(1, '不能为空').max(200, '最长 200 字'),
  kind: z.enum(['激励性', '常规']).optional(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '必须是 YYYY-MM-DD')
    .optional(),
  successCriteria: z.string().trim().max(500, '最长 500 字').optional(),
})

export const updateGoalSchema = z
  .object({
    title: z.string().trim().min(1, '不能为空').max(200, '最长 200 字').optional(),
    kind: z.enum(['激励性', '常规']).optional(),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '必须是 YYYY-MM-DD')
      .nullable()
      .optional(),
    successCriteria: z.string().trim().max(500, '最长 500 字').nullable().optional(),
    status: z.enum(['在用', '暂停', '已完成', '已归档']).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: '至少修改一个字段',
  })

export type CreateGoalInput = z.infer<typeof createGoalSchema>

/** 把 zod 的报错压成一句人话，并保留字段路径 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path === '' ? issue.message : `${path}：${issue.message}`
    })
    .join('；')
}

export function toGoalListItem(goal: GoalSummary | StoredGoal, today = todayLocal()): GoalListItem {
  const deadline = goal.deadline
  return {
    id: goal.id,
    title: goal.title,
    kind: goal.kind,
    status: goal.status,
    ...(deadline === undefined ? {} : { deadline, daysLeft: daysLeftOf(deadline, today) }),
    ...('successCriteria' in goal && goal.successCriteria !== undefined
      ? { successCriteria: goal.successCriteria }
      : {}),
    ...('updatedAt' in goal && goal.updatedAt !== undefined ? { updatedAt: goal.updatedAt } : {}),
    createdAt: goal.createdAt,
  }
}
