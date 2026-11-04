import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  /** 一句话说清这一区负责什么 */
  lead: string
  /** 「这一区会出现什么」—— 只描述将来的真实内容，不放假数据 */
  upcoming: string[]
  /** 主行动的文案；未开放时按钮禁用，旁边标阶段 */
  action: string
  phase: string
  /** 额外真实内容（目前只有目标区的 health 卡片） */
  children?: ReactNode
}

export function EmptyState({ title, lead, upcoming, action, phase, children }: EmptyStateProps) {
  return (
    <section className="area">
      <h1 className="area-title">{title}</h1>
      <p className="lede">{lead}</p>

      <div className="upcoming">
        <p className="upcoming-label">这一区会出现</p>
        <ul>
          {upcoming.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="action-row">
        <button type="button" className="button" disabled>
          {action}
        </button>
        <span className="phase-tag">{phase} 开放</span>
      </div>

      {children}
    </section>
  )
}
