import { z } from 'zod'

export const budgetSchema = z.object({
  budgetCny: z.number().min(0, '预算不能为负').nullable(),
})

export type BudgetInput = z.infer<typeof budgetSchema>

export const regenerateSchema = z.object({
  nodeIds: z.array(z.string().min(1)).min(1, '至少选一个节点').max(10, '一次最多 10 个节点'),
})
