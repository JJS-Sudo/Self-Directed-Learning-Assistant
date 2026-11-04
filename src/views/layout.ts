/**
 * 三个页面共用的外壳与视觉基线。
 *
 * 硬约束（SOP.md 第 6 节的界面约定）：
 * - **零外部资源**：不引用任何外部 CSS / 字体 / 图片 / 脚本 —— 样式内联，断网可用，无构建步骤
 * - 分区靠留白与细线，不靠"每个区块一个边框"；**单一强调色**
 * - 机器信息（`id`、`status`）不上屏
 * - 所有用户输入在渲染前必须 `escapeHtml`
 */

const STYLE = `
:root{
  color-scheme:light dark;
  --bg:#fcfcfb; --fg:#1b1b19; --muted:#8b8b86; --line:#e4e4df; --accent:#2f6f4f;
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#151619; --fg:#e9e9e6; --muted:#8d8f8c; --line:#2b2d30; --accent:#7cc4a0; }
}
*{box-sizing:border-box}
body{
  margin:0 auto; max-width:44rem; padding:3.5rem 1.25rem 6rem;
  background:var(--bg); color:var(--fg);
  font:16px/1.75 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
}
h1{font-size:1.05rem; font-weight:600; margin:0}
h2{font-size:.75rem; font-weight:500; letter-spacing:.12em; color:var(--muted); margin:0 0 1.1rem}
header p{font-size:.8rem; color:var(--muted); margin:.3rem 0 0}
nav{display:flex; gap:1.15rem; margin-top:1.05rem}
nav a{font-size:.78rem; color:var(--muted); text-decoration:none; border-bottom:1px solid transparent; padding-bottom:.1rem}
nav a:hover{color:var(--fg)}
nav a.active{color:var(--accent); border-bottom-color:var(--accent)}
main{margin-top:2.75rem}
section{margin:0}
section + section{margin-top:2.75rem; padding-top:2rem; border-top:1px solid var(--line)}
form{display:flex; flex-wrap:wrap; gap:.9rem 1.4rem; align-items:flex-end}
label{display:flex; flex-direction:column; gap:.3rem; font-size:.75rem; color:var(--muted)}
input,select,textarea{
  font:inherit; font-size:.92rem; color:var(--fg); background:transparent;
  border:0; border-bottom:1px solid var(--line); border-radius:0;
  padding:.28rem 0 .35rem; min-width:11rem;
}
textarea{min-width:100%; resize:vertical; line-height:1.6}
input:focus,select:focus,textarea:focus{outline:0; border-bottom-color:var(--accent)}
input::placeholder,textarea::placeholder{color:var(--muted); opacity:.5}
button{
  font:inherit; font-size:.82rem; padding:.45rem 1.1rem; cursor:pointer;
  border:0; border-radius:.3rem; background:var(--accent); color:#fff;
}
button:hover{opacity:.88}
.banner{font-size:.85rem; padding:.6rem .8rem; border-radius:.3rem; margin-top:1.75rem}
.banner.error{background:rgba(180,60,45,.10); color:#a8352a}
.banner.notice{background:rgba(47,111,79,.10); color:#2f6f4f}
@media (prefers-color-scheme:dark){
  .banner.error{background:rgba(220,110,95,.14); color:#e08d80}
  .banner.notice{background:rgba(124,196,160,.14); color:#7cc4a0}
}
.note{font-size:.78rem; color:var(--muted); margin:.9rem 0 0}
.goals{list-style:none; margin:0; padding:0}
.goals li{padding:.25rem 0}
.goals a{color:inherit; text-decoration:none; border-bottom:1px solid transparent}
.goals a:hover{border-bottom-color:var(--line)}
.goals li.active a{color:var(--accent); border-bottom-color:var(--accent)}
.goals .c{font-size:.78rem; color:var(--muted); margin-left:.6rem}
.tree{list-style:none; margin:0; padding:0}
.tree ul{list-style:none; margin:0; padding:0 0 0 1.15rem; border-left:1px solid var(--line)}
.tree li{padding:.22rem 0}
.tree .t{font-weight:500}
.tree .m,.tree .r{font-size:.78rem; color:var(--muted); margin-left:.6rem}
.list{list-style:none; margin:0; padding:0}
.list li{padding:.55rem 0}
.list li + li{border-top:1px solid var(--line)}
.list .t{font-weight:500}
.list .meta{font-size:.78rem; color:var(--muted); margin-left:.6rem}
.list .why{display:block; font-size:.78rem; color:var(--muted); margin-top:.15rem}
.list .url{font-size:.78rem; color:var(--muted); margin-left:.6rem}
.empty{font-size:.9rem; color:var(--muted)}
.foot{font-size:.78rem; color:var(--muted); margin:3.5rem 0 0}
`

/**
 * 网页只剩两条入口（见 `2026-10-08-obsidian-first/requirements.md`）：
 * 总目标设定与资源跳转站。知识地图 / 学习路径 / 验收 / 复盘全部在 Obsidian 里。
 */
const NAV = [
  { href: '/', label: '总目标' },
  { href: '/resources', label: '资源跳转站' },
] as const

export interface PageShell {
  subtitle: string
  /** 当前高亮的导航项（`/`、`/resources`、`/questions`） */
  active: string
  main: string
  notice?: string
  error?: string
  footer?: string
}

export function renderShell(shell: PageShell): string {
  const nav = NAV.map((item) => {
    const active = item.href === shell.active ? ' class="active"' : ''
    return `<a href="${item.href}"${active}>${item.label}</a>`
  }).join('\n    ')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>自我导向学习辅助器</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>自我导向学习辅助器</h1>
  <p>${escapeHtml(shell.subtitle)}</p>
  <nav>
    ${nav}
  </nav>
</header>
${renderBanners(shell)}
<main>
${shell.main}
</main>
<p class="foot">${escapeHtml(shell.footer ?? '知识网的可视化由 Obsidian 提供。')}</p>
</body>
</html>
`
}

export function renderBanners(data: { notice?: string; error?: string }): string {
  const parts: string[] = []
  if (data.error !== undefined) {
    parts.push(`<div class="banner error">${escapeHtml(data.error)}</div>`)
  }
  if (data.notice !== undefined) {
    parts.push(`<div class="banner notice">${escapeHtml(data.notice)}</div>`)
  }
  return parts.length === 0 ? '' : `\n${parts.join('\n')}\n`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
