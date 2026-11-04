import type { GoalSummary } from '../domain/goals.js'
import type { MapNodeSummary } from '../domain/nodes.js'
import type { RankedResource } from '../domain/resources.js'
import { escapeHtml, renderShell } from './layout.js'

export interface ResourcesViewData {
  goals: GoalSummary[]
  nodes: MapNodeSummary[]
  /** 已按推荐排序（同 `40-资源/` 的排序规则） */
  resources: RankedResource[]
  selectedGoalId?: string
  notice?: string
  error?: string
}

/**
 * `/resources` —— **资源跳转站**：只做"看 + 跳"。
 * 不提供录入表单（资源由 agent 或直接在 Obsidian 里写进 `40-资源/`）。
 */
export function renderResources(data: ResourcesViewData): string {
  const titleOfNode = new Map(data.nodes.map((node) => [node.id, node.title]))
  const activeGoal = data.goals.find((goal) => goal.id === data.selectedGoalId)

  const main = `
  <section>
    <h2>按目标筛选</h2>
    <ul class="list">
      <li><a href="/resources">全部资源</a>${data.selectedGoalId === undefined ? '<span class="meta">当前</span>' : ''}</li>
      ${data.goals
        .map(
          (goal) =>
            `<li><a href="/resources?goal=${encodeURIComponent(goal.id)}">${escapeHtml(goal.title)}</a>${
              goal.id === data.selectedGoalId ? '<span class="meta">当前</span>' : ''
            }</li>`,
        )
        .join('\n      ')}
    </ul>
  </section>

  <section>
    <h2>资源${activeGoal === undefined ? '' : ` · ${escapeHtml(activeGoal.title)}`}</h2>
    ${
      data.resources.length === 0
        ? '<p class="empty">还没有资源。</p>'
        : renderResourceList(data.resources, titleOfNode)
    }
  </section>`

  return renderShell({
    subtitle: '资源跳转站',
    active: '/resources',
    main,
    footer: '排序理由由画像的三个因子算出（水平匹配 / 媒介偏好 / 时长）。资源实体在 40-资源/。',
    ...(data.notice !== undefined ? { notice: data.notice } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  })
}

function renderResourceList(resources: RankedResource[], titleOfNode: Map<string, string>): string {
  const items = resources
    .map((resource) => {
      const nodeTitle = resource.nodeId === undefined ? undefined : titleOfNode.get(resource.nodeId)
      const meta = [resource.media, resource.level, ...resource.tags]
        .filter((part) => part !== '')
        .join(' · ')
      const extras = [
        nodeTitle,
        resource.durationMin === undefined ? undefined : `${resource.durationMin} 分钟`,
      ]
        .filter((part) => part !== undefined && part !== '')
        .join(' · ')

      const href = safeHref(resource.url)
      const link =
        href === undefined
          ? resource.url === undefined
            ? ''
            : `<span class="url">${escapeHtml(resource.url)}</span>`
          : `<a class="url" href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(resource.url ?? href)}  ↗</a>`

      return `<li>
      <span class="t">${escapeHtml(resource.title)}</span><span class="meta">${escapeHtml(meta)}${extras === '' ? '' : ` · ${escapeHtml(extras)}`}</span>
      ${link}
      <span class="why">${escapeHtml(resource.rankReason)}</span>
    </li>`
    })
    .join('\n')

  return `<ul class="list">${items}</ul>`
}

/**
 * 只允许 `http(s)` 进 `href` —— 用户可以在 Obsidian 里手改 `url` 字段，
 * 直接把它们拼进 href 会留下 `javascript:` 这类注入面。
 */
export function safeHref(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined
}
