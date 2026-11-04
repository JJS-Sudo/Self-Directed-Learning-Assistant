import type { Profile } from '../domain/profile.js'

/** 无搜索 Key 时生成的平台搜索页候选；不抓取网页，只指向确定的搜索入口 */
export interface PlatformLinkCandidate {
  nodeId: string
  title: string
  url: string
  snippet: string
  platform: string
  media: string
  level: string
  unverified: true
}

export interface PlatformNode {
  id: string
  title: string
}

const CODE_PATTERN =
  /html|css|javascript|typescript|react|vue|node|python|java|sql|git|api|算法|编程|代码|前端|后端/i

function encode(value: string): string {
  return encodeURIComponent(value.trim())
}

function bilibili(node: PlatformNode, level: string): PlatformLinkCandidate {
  const keyword = encode(node.title)
  return {
    nodeId: node.id,
    title: `在 B 站搜索“${node.title}”`,
    url: `https://search.bilibili.com/all?keyword=${keyword}`,
    snippet: 'B 站搜索结果页；点开后挑选适合的视频教程。',
    platform: 'B站',
    media: '视频',
    level,
    unverified: true,
  }
}

function youtube(node: PlatformNode, level: string): PlatformLinkCandidate {
  const keyword = encode(node.title)
  return {
    nodeId: node.id,
    title: `在 YouTube 搜索“${node.title}”`,
    url: `https://www.youtube.com/results?search_query=${keyword}`,
    snippet: 'YouTube 搜索结果页；点开后挑选适合的视频教程。',
    platform: 'YouTube',
    media: '视频',
    level,
    unverified: true,
  }
}

function bing(node: PlatformNode, level: string): PlatformLinkCandidate {
  const keyword = encode(node.title)
  return {
    nodeId: node.id,
    title: `在 Bing 搜索“${node.title}”`,
    url: `https://www.bing.com/search?q=${keyword}`,
    snippet: 'Bing 搜索结果页；点开后挑选文章、课程或文档。',
    platform: 'Bing',
    media: '文字',
    level,
    unverified: true,
  }
}

function mdn(node: PlatformNode, level: string): PlatformLinkCandidate {
  const keyword = encode(node.title)
  return {
    nodeId: node.id,
    title: `在 MDN 搜索“${node.title}”`,
    url: `https://developer.mozilla.org/zh-CN/search?q=${keyword}`,
    snippet: 'MDN 文档搜索结果页；适合查 API 与语法。',
    platform: 'MDN',
    media: '文字',
    level,
    unverified: true,
  }
}

/**
 * 按节点标题与画像生成 1–2 条平台搜索页链接。
 * 纯函数：不发网络请求，URL 模板固定，永远不会编造具体文章。
 */
export function platformLinkCandidates(
  node: PlatformNode,
  profile: Pick<Profile, 'level' | 'mediaPreference'>,
): PlatformLinkCandidate[] {
  const level = profile.level
  if (CODE_PATTERN.test(node.title)) {
    return [mdn(node, level), bing(node, level)]
  }
  if (profile.mediaPreference === '视频') {
    return [bilibili(node, level), youtube(node, level)]
  }
  if (profile.mediaPreference === '文字') {
    return [bing(node, level)]
  }
  return [bing(node, level), bilibili(node, level)]
}
