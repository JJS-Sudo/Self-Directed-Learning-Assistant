import type { GoalSummary } from '../domain/goals.js'
import { GOAL_KINDS } from '../domain/vocabulary.js'
import { escapeHtml, renderShell } from './layout.js'

export interface HomeViewData {
  goals: GoalSummary[]
  notice?: string
  error?: string
}

/**
 * `/` —— **只做总目标设定**。
 *
 * 激励性总目标（例如"三天完成人生第一个软件设计"）由用户自己输入：
 * 标题 + 类型 + 期限 + 成功判据。其余一切（知识地图 / 学习路径 / 验收 / 复盘）都在 Obsidian 里。
 */
export function renderHome(data: HomeViewData): string {
  const main = `
  <section>
    <h2>设定总目标</h2>
    <form method="post" action="/goals">
      <label>目标（激励性目标就写你真正想要的那件事）
        <input name="title" required maxlength="120" placeholder="三天完成人生第一个软件设计">
      </label>
      <label>类型<select name="kind">${renderOptions(GOAL_KINDS)}</select></label>
      <label>期限（激励性目标必填）<input name="deadline" type="date"></label>
      <label>成功判据（可判定的一句话）
        <input name="success_criteria" maxlength="200" placeholder="能把它跑起来并讲清每一层的推导">
      </label>
      <button type="submit">建立目标</button>
    </form>
    <p class="note">知识地图、学习路径、验收与复盘都在 Obsidian 里；网页只负责设定目标与跳到资源。</p>
  </section>

  <section>
    <h2>目标</h2>
    ${data.goals.length === 0 ? '<p class="empty">还没有目标 —— 从上面建一个开始。</p>' : renderGoals(data.goals)}
  </section>`

  return renderShell({
    subtitle: '总目标设定',
    active: '/',
    main,
    footer: '库里的每个目标都有自己的分区：知识地图 / 学习路径 / 验收 / 复盘。用 Obsidian 打开看。',
    ...(data.notice !== undefined ? { notice: data.notice } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  })
}

function renderGoals(goals: GoalSummary[]): string {
  const items = goals
    .map((goal) => {
      const badge = `<span class="meta">${escapeHtml(goal.kind)}</span>`
      const deadline =
        goal.deadline === undefined
          ? ''
          : `<span class="meta">期限 ${escapeHtml(goal.deadline)}` +
            `${
              goal.daysLeft === undefined
                ? ''
                : `（还剩 ${goal.daysLeft} 天${goal.daysLeft < 0 ? '，已逾期' : ''}）`
            }</span>`
      const criteria =
        goal.successCriteria === undefined
          ? ''
          : `<span class="why">判据：${escapeHtml(goal.successCriteria)}</span>`

      return `<li><span class="t">${escapeHtml(goal.title)}</span>${badge}${deadline}${criteria}</li>`
    })
    .join('\n')

  return `<ul class="list">${items}</ul>`
}

function renderOptions(values: readonly string[]): string {
  return values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('')
}
