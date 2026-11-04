/**
 * 目标列表的跨端契约 —— **只有类型**。
 * `daysLeft` 由服务端在读取时按本地自然日计算，不落索引。
 */
export interface GoalListItem {
  id: string
  title: string
  kind: string
  status: string
  /** `YYYY-MM-DD`；常规目标可为空 */
  deadline?: string
  /** 距期限的天数（本地日）：逾期为负，当天为 0 */
  daysLeft?: number
  successCriteria?: string
  createdAt: string
  /** 最近一次修改时间；旧目标可能缺省 */
  updatedAt?: string
}
