/** 查询 = 节点标题 + 目标标题 + 画像的媒介偏好 */
export function buildQuery(nodeTitle: string, goalTitle: string, mediaPreference: string): string {
  const suffix =
    mediaPreference === '视频' ? '视频 教程' : mediaPreference === '文字' ? '教程 文章' : ''
  return [nodeTitle.trim(), goalTitle.trim(), suffix].filter((part) => part !== '').join(' ')
}
