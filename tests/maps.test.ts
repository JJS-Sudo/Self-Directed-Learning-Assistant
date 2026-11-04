import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { recordSession } from '../src/domain/assessments.js'
import { createGoal, type GoalSummary } from '../src/domain/goals.js'
import { createNode, listAllNodes } from '../src/domain/nodes.js'
import { createStage, listStages } from '../src/domain/path-stages.js'
import { createQuestion } from '../src/domain/questions.js'
import { createResource, listAllResources } from '../src/domain/resources.js'
import { createRetrospective } from '../src/domain/retrospectives.js'
import { ancestorIdsOf, isComparableByLineage } from '../src/domain/graph.js'
import { readProfileOrDefault } from '../src/domain/profile.js'
import { rankReasonOf, rankResources } from '../src/domain/ranking.js'
import { RELATION_COLORS, type Canvas } from '../src/maps/canvas.js'
import { generateAllMaps } from '../src/maps/index.js'
import { buildKnowledgeMap, checkDanglingResources } from '../src/maps/knowledge-map.js'
import { buildLearningPath, compactReason } from '../src/maps/learning-path.js'
import { buildStageResources } from '../src/maps/stage-resources.js'
import { goalAreaRelativePath } from '../src/vault/goal-areas.js'
import { updateDocument, writeDocument } from '../src/vault/io.js'
import { createEmptyVault, createTempVault, removeDir } from './helpers.js'

const tempDirs: string[] = []

function track(dir: string): string {
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) removeDir(dir)
})

const ARTIFACTS = [
  '知识地图.md',
  '知识地图.canvas',
  '学习路径.md',
  '学习路径.canvas',
  '复盘.md',
  '复盘.canvas',
] as const

interface Fixture {
  vault: string
  goal: GoalSummary
  area: string
  nodeIds: string[]
  stageIds: string[]
  questionIds: string[]
  resourceIds: string[]
  file: (name: (typeof ARTIFACTS)[number]) => string
  canvas: (name: (typeof ARTIFACTS)[number]) => Canvas
  regenerate: () => void
}

/** 一个"两分支、叶子数 3 : 1"的目标：A 带两个子节点，B 是孤叶 */
function fixture(): Fixture {
  const vault = track(createEmptyVault())
  const goal = createGoal({
    root: vault,
    title: '三天完成人生第一个软件设计',
    kind: '激励性',
    deadline: '2026-10-11',
    today: '2026-10-08',
  })

  const branchA = createNode({ root: vault, title: '想清楚要做什么', goal: goal.id })
  const childA1 = createNode({
    root: vault,
    title: '一句话说清问题',
    goal: goal.id,
    up: branchA.id,
  })
  const childA2 = createNode({ root: vault, title: '划出三个功能', goal: goal.id, up: branchA.id })
  const branchB = createNode({ root: vault, title: '写出来跑起来', goal: goal.id })

  const q1 = createQuestion({
    root: vault,
    goal: goal.id,
    title: '一句话说清你要做的软件',
    kind: '封闭',
    stem: '能不能用一句话说清它替谁解决了什么问题？',
    answer: '能，且没有技术名词',
    explanation: '出现技术名词就说明还没想清楚。',
    node: childA1.id,
  })
  const q2 = createQuestion({
    root: vault,
    goal: goal.id,
    title: '能不能跑起来',
    kind: '开放',
    stem: '你的软件今天能被别人打开并自己走一遍吗？',
    node: branchB.id,
  })

  const s1 = createStage({
    root: vault,
    goal: goal.id,
    title: '第一天：把想法变成一句话',
    estimate: '约 0.5 天',
    deliverable: '一句话描述 + 三个功能',
    nodes: [branchA.id, childA1.id, childA2.id],
    checks: ['那句话里没有技术名词', '能说出这次不做什么'],
    questions: [q1.id],
  })
  const s2 = createStage({
    root: vault,
    goal: goal.id,
    title: '第二天：做出来并让它能跑',
    estimate: '约 1 天',
    nodes: [branchB.id],
    checks: ['别人不需要你在旁边就能打开'],
    questions: [q2.id],
  })

  const session = recordSession({
    root: vault,
    node: branchA.id,
    date: '2026-10-09',
    recital: { text: '先想清问题，再想实现。', result: '已完成' },
    quiz: { question: q1.id, result: '正确' },
  })
  const recital = session.assessments.find((item) => item.mode === '复述')
  createRetrospective({
    root: vault,
    assessment: recital?.id ?? '',
    worked: '先复述再动手。',
    failed: '第一版把实现方式当成了问题描述。',
    nextAdjustment: '第二天先做能点的最小版本。',
    adjustEvents: [s1.id],
    date: '2026-10-09',
    mastery: '在学',
  })

  // 三条资源：分别挂在枝干 / 叶子 / 另一枝干上，三因子得分 6 / 3 / 5
  const rA = createResource({
    root: vault,
    title: '枝干上的资源（视频）',
    node: branchA.id,
    media: '视频',
    level: '入门',
    durationMin: 20,
  })
  const rB = createResource({
    root: vault,
    title: '叶子上的资源（文字）',
    node: childA1.id,
    media: '文字',
    level: '进阶',
    durationMin: 20,
  })
  const rC = createResource({
    root: vault,
    title: '另一枝干的资源',
    node: branchB.id,
    media: '文字',
    level: '入门',
  })

  const regenerate = (): void => {
    generateAllMaps(vault)
  }
  regenerate()

  const area =
    generateAllMaps(vault).find((report) => report.goalId === goal.id)?.areaRelativePath ?? ''

  return {
    vault,
    goal,
    area,
    nodeIds: [branchA.id, childA1.id, childA2.id, branchB.id],
    stageIds: [s1.id, s2.id],
    questionIds: [q1.id, q2.id],
    resourceIds: [rA.id, rB.id, rC.id],
    file: (name) => readFileSync(join(vault, area, name), 'utf8'),
    canvas: (name) => JSON.parse(readFileSync(join(vault, area, name), 'utf8')) as Canvas,
    regenerate,
  }
}

// ───────────────────────── 几何小工具 ─────────────────────────

function center(node: { x: number; y: number; width: number; height: number }) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

function radiusOf(node: { x: number; y: number; width: number; height: number }): number {
  const point = center(node)
  return Math.hypot(point.x, point.y)
}

/** 一组卡片的极角跨度（度），已做 unwrap，不受 ±π 边界影响 */
function angularSpan(nodes: { x: number; y: number; width: number; height: number }[]): number {
  const angles = nodes.map((node) => {
    const point = center(node)
    return Math.atan2(point.y, point.x)
  })
  const mean = angles.reduce((sum, value) => sum + value, 0) / Math.max(1, angles.length)
  const unwrapped = angles.map((value) => {
    let delta = value - mean
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    return delta
  })
  return ((Math.max(...unwrapped) - Math.min(...unwrapped)) * 180) / Math.PI
}

function findByText(canvas: Canvas, needle: string) {
  return canvas.nodes.find((node) => node.text.includes(needle))
}

// ───────────────────────── TG1/TG2：知识地图 ─────────────────────────

describe('TG1/TG2 · 知识地图：径向蛛网 + 关系标注 + 覆盖检查', () => {
  it('锚点在中心，同深度同半径，深度越远越外', () => {
    const { vault, goal } = fixture()
    const { canvas } = buildKnowledgeMap(vault, goal)

    const anchor = findByText(canvas, '三天完成人生第一个软件设计')
    expect(anchor).toBeDefined()
    expect(radiusOf(anchor as Canvas['nodes'][number])).toBeLessThan(1)

    // 深度 1（顶层节点）的半径 = 460；深度 2 的半径 = 920
    const depth1 = canvas.nodes.filter(
      (node) => node.text.includes('想清楚要做什么') || node.text.includes('写出来跑起来'),
    )
    const depth2 = canvas.nodes.filter(
      (node) => node.text.includes('一句话说清问题') || node.text.includes('划出三个功能'),
    )
    expect(depth1).toHaveLength(2)
    expect(depth2).toHaveLength(2)

    for (const node of depth1) expect(radiusOf(node)).toBeCloseTo(460, 0)
    for (const node of depth2) expect(radiusOf(node)).toBeCloseTo(920, 0)
  })

  it('角度按子树叶子数加权：叶子多的分支扇形更大', () => {
    const { vault, goal } = fixture()
    const { canvas } = buildKnowledgeMap(vault, goal)

    const branchA = canvas.nodes.filter((node) =>
      ['想清楚要做什么', '一句话说清问题', '划出三个功能'].some((title) =>
        node.text.includes(title),
      ),
    )
    const branchB = canvas.nodes.filter((node) => node.text.includes('写出来跑起来'))

    expect(branchA).toHaveLength(3)
    expect(branchB).toHaveLength(1)
    // A 有 2 个叶子、B 有 1 个 → A 的扇形应当明显更大
    expect(angularSpan(branchA)).toBeGreaterThan(angularSpan(branchB))
  })

  it('canvas 合法：全是文本卡、色值合法、没有断边', () => {
    const { vault, goal } = fixture()
    const { canvas } = buildKnowledgeMap(vault, goal)

    for (const node of canvas.nodes) {
      expect(node.type).toBe('text')
      if (node.color !== undefined) expect(['1', '2', '3', '4', '5', '6']).toContain(node.color)
    }
    const ids = new Set(canvas.nodes.map((node) => node.id))
    for (const edge of canvas.edges) {
      expect(ids.has(edge.fromNode)).toBe(true)
      expect(ids.has(edge.toNode)).toBe(true)
    }
  })

  it('上级边：带标签，方向由子指向父', () => {
    const { vault, goal } = fixture()
    const { canvas } = buildKnowledgeMap(vault, goal)

    const upEdges = canvas.edges.filter((edge) => edge.label === '上级')
    // 2 条来自 frontmatter 的 `up`（子 → 父），另外 2 条是"锚点 → 顶层节点"
    // （顶层节点在数据上没有 up，但目标就是它们的上位）
    expect(upEdges).toHaveLength(4)

    const textOf = (id: string) => canvas.nodes.find((node) => node.id === id)?.text ?? ''
    const pairs = upEdges.map((edge) => [textOf(edge.fromNode), textOf(edge.toNode)] as const)

    // 两条 up：子 → 父（方向不能反）
    expect(
      pairs.some(([a, b]) => a.includes('一句话说清问题') && b.includes('想清楚要做什么')),
    ).toBe(true)
    expect(pairs.some(([a, b]) => a.includes('划出三个功能') && b.includes('想清楚要做什么'))).toBe(
      true,
    )
    // 两条锚点：顶层节点 → 目标
    expect(pairs.some(([a, b]) => a.includes('想清楚要做什么') && b.includes('三天完成'))).toBe(
      true,
    )
    expect(pairs.some(([a, b]) => a.includes('写出来跑起来') && b.includes('三天完成'))).toBe(true)
    // 反方向不存在
    expect(
      pairs.some(([a, b]) => a.includes('想清楚要做什么') && b.includes('一句话说清问题')),
    ).toBe(false)
  })

  it('并列边：同组相邻兄弟相连，跨组不连', () => {
    const { vault, goal } = fixture()
    const { canvas } = buildKnowledgeMap(vault, goal)

    const siblingEdges = canvas.edges.filter((edge) => edge.label === '并列')
    // 顶层组有 branchA、branchB 两个兄弟 → 1 条；A 组下有两个子节点 → 1 条
    expect(siblingEdges).toHaveLength(2)

    const textOf = (id: string) => canvas.nodes.find((node) => node.id === id)?.text ?? ''
    const pairs = siblingEdges.map((edge) => [textOf(edge.fromNode), textOf(edge.toNode)] as const)
    expect(pairs.some(([a, b]) => a.includes('一句话') && b.includes('划出三个功能'))).toBe(true)
    expect(pairs.some(([a, b]) => a.includes('想清楚') && b.includes('写出来'))).toBe(true)
  })

  it('相关边：与 relatedIds 一一对应；没有下级边；图例卡说明下级', () => {
    const { vault, goal } = fixture()
    const { canvas } = buildKnowledgeMap(vault, goal)

    const relatedEdges = canvas.edges.filter((edge) => edge.label === '相关')
    expect(relatedEdges).toHaveLength(0)

    // 没有任何边标成"下级"
    expect(canvas.edges.some((edge) => (edge.label ?? '').includes('下级'))).toBe(false)

    const legend = canvas.nodes.find((node) => node.id === 'legend')
    expect(legend).toBeDefined()
    for (const word of ['上级', '并列', '相关', '下级', '反向推导']) {
      expect(legend?.text, word).toContain(word)
    }
  })

  it('三种关系边颜色两两不同，且都不是卡片用的预设色', () => {
    const colors = Object.values(RELATION_COLORS)
    expect(new Set(colors).size).toBe(3)
    for (const color of colors) {
      expect(['1', '2', '3', '4', '5', '6']).not.toContain(color)
    }
  })

  it('md 含全部节点 id、四张关系表、内嵌 canvas 与覆盖检查', () => {
    const { vault, goal } = fixture()
    const { md, nodeCount } = buildKnowledgeMap(vault, goal)

    expect(nodeCount).toBe(4)
    for (const table of [
      '## 一、上级',
      '## 二、下级',
      '## 三、并列',
      '## 四、相关',
      '## 六、覆盖检查',
    ]) {
      expect(md).toContain(table)
    }
    expect(md).toContain('![[知识地图.canvas]]')
    expect(md).toContain('npm run maps')
  })

  it('覆盖检查：报出未被覆盖的叶子与引用了消失节点的段', () => {
    const { vault, goal, area, file } = fixture()

    // 加一个叶子节点，但没有任何路径段引用它
    createNode({ root: vault, title: '没人排它的叶子', goal: goal.id })

    const report = generateAllMaps(vault).find((item) => item.areaRelativePath === area)
    expect(report?.uncoveredLeaves.some((item) => item.includes('没人排它的叶子'))).toBe(true)
    expect(file('知识地图.md')).toContain('没人排它的叶子')

    // 让一个路径段引用不存在的节点：直接改实体文件
    const stageDir = join(vault, area, '学习路径')
    const stageName = readdirSync(stageDir)[0] ?? ''
    const stagePath = join(stageDir, stageName)
    const raw = readFileSync(stagePath, 'utf8')
    writeFileSync(
      stagePath,
      raw.replace(/nodes:\n(?:\s+- .*\n)+/, "nodes:\n  - '[[zzzzzz 不存在的节点|不存在的节点]]'\n"),
      'utf8',
    )

    const after = generateAllMaps(vault).find((item) => item.areaRelativePath === area)
    expect(after?.missingNodes.some((item) => item.includes('zzzzzz'))).toBe(true)
  })

  it('非法文件不参与生成，并被报告（幽灵卡不会出现）', () => {
    const { vault, area, file, canvas } = fixture()
    writeFileSync(
      join(vault, area, '知识网', '随手写的笔记.md'),
      '# 笔记\n\n没有 frontmatter。\n',
      'utf8',
    )

    const report = generateAllMaps(vault).find((item) => item.areaRelativePath === area)
    expect(report?.skipped).toHaveLength(1)

    const drawing = canvas('知识地图.canvas')
    expect(drawing.nodes.map((node) => node.text).join('\n')).not.toContain('随手写的笔记')

    const md = file('知识地图.md')
    expect(md.slice(md.indexOf('被隔离的文件'))).toContain('随手写的笔记')
  })

  it('六个派生物写盘幂等：连跑两次逐字节一致', () => {
    const { file, regenerate } = fixture()
    const before = ARTIFACTS.map((name) => file(name))

    regenerate()

    expect(ARTIFACTS.map((name) => file(name))).toEqual(before)
  })
})

// ───────────────────────── TG3：学习路径 ─────────────────────────

describe('TG3 · 学习路径：方正表格 canvas + 规则 md', () => {
  it('顶部三张表头卡，三列严格对齐', () => {
    const { canvas } = fixture()
    const drawing = canvas('学习路径.canvas')

    for (const header of ['阶段', '检验信号', '验收题目']) {
      expect(
        drawing.nodes.some((node) => node.text.startsWith(`**${header}**`)),
        header,
      ).toBe(true)
    }

    const stageXs = new Set(
      drawing.nodes.filter((node) => /^\*\*\d+\. /.test(node.text)).map((node) => node.x),
    )
    const checkXs = new Set(
      drawing.nodes
        .filter((node) => node.text.startsWith('**检验信号**') && node.text.includes('·'))
        .map((node) => node.x),
    )
    const questionXs = new Set(
      drawing.nodes.filter((node) => node.text.startsWith('**验收题目')).map((node) => node.x),
    )

    expect(stageXs.size).toBe(1)
    expect(checkXs.size).toBe(1)
    expect(questionXs.size).toBe(1)
    expect([...stageXs][0]).toBeLessThan([...checkXs][0] as number)
    expect([...checkXs][0]).toBeLessThan([...questionXs][0] as number)
  })

  it('段序自上而下，行距严格相等（统一行高）', () => {
    const { canvas } = fixture()
    const drawing = canvas('学习路径.canvas')

    const stageCards = drawing.nodes
      .filter((node) => /^\*\*\d+\. /.test(node.text))
      .sort(
        (a, b) =>
          Number(/^\*\*(\d+)\./.exec(a.text)?.[1] ?? 0) -
          Number(/^\*\*(\d+)\./.exec(b.text)?.[1] ?? 0),
      )

    expect(stageCards).toHaveLength(2)
    expect(stageCards[0]?.y).toBeLessThan(stageCards[1]?.y as number)
    // 统一行高 → 行距 = 行高 + 行距常量，这里只要求"间距为正且一致"的构造前提：
    // 两张阶段卡的高度相同（统一行高的直接结果）
    expect(stageCards[0]?.height).toBe(stageCards[1]?.height)
  })

  it('题目卡只有一条入边，且来自本段的检验信号卡', () => {
    const { canvas } = fixture()
    const drawing = canvas('学习路径.canvas')

    const questionCards = drawing.nodes.filter((node) => node.text.startsWith('**验收题目（'))
    expect(questionCards).toHaveLength(2)

    for (const card of questionCards) {
      const incoming = drawing.edges.filter((edge) => edge.toNode === card.id)
      expect(incoming).toHaveLength(1)
      const from = drawing.nodes.find((node) => node.id === incoming[0]?.fromNode)
      expect(from?.text.startsWith('**检验信号**')).toBe(true)
    }
  })

  it('md：总览表行数 = 段数，且每段一张同构两列表', () => {
    const { file } = fixture()
    const md = file('学习路径.md')

    expect(md).toContain('| 段 | 阶段 | 估时 | 涉及节点 | 检验信号 | 验收题目 |')
    const overviewRows = md
      .slice(md.indexOf('## 一、总览'), md.indexOf('## 二、逐段展开'))
      .split('\n')
      .filter((line) => /^\| \d+ \| /.test(line))
    expect(overviewRows).toHaveLength(2)

    expect(md).toContain('| 项 | 内容 |')
    const stageSection = md.slice(md.indexOf('## 二、逐段展开'), md.indexOf('## 三、进度清单'))
    for (const field of ['估时', '涉及节点', '产出物', '✅ 检验信号', '题目与提问']) {
      const count = stageSection.split(`| ${field} |`).length - 1
      expect(count, field).toBe(2)
    }
    expect(md.match(/- \[ \] /g)).toHaveLength(2)
    expect(md).toContain('![[学习路径.canvas]]')
  })

  it('路径里的节点 id 全部能在知识地图里找到（相互对照）', () => {
    const { file } = fixture()
    const pathMd = file('学习路径.md')
    const mapMd = file('知识地图.md')

    // 只看「涉及节点」行：路径 md 里的资源链接不属于知识网节点，不该参与这条对照
    const ids = [...pathMd.matchAll(/\| 涉及节点 \| (.+) \|/g)].flatMap((row) =>
      [...(row[1] ?? '').matchAll(/\[\[([a-z0-9]{6}) /g)].map((match) => match[1] ?? ''),
    )
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(mapMd, id).toContain(id)
  })

  it('没有配题目的段会显式写出来，而不是静默省略', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '目标' })
    const node = createNode({ root: vault, title: '节点', goal: goal.id })
    createStage({
      root: vault,
      goal: goal.id,
      title: '没有题目的段',
      estimate: '约 1 天',
      nodes: [node.id],
      checks: ['检验信号一条'],
    })

    const result = buildLearningPath(vault, goal)
    expect(result.md).toContain('（本段未配题目）')
  })
})

// ───────────────────────── TG6：复盘 ─────────────────────────

describe('TG6 · 复盘生成器', () => {
  it('思维导图上有三字段、调整的路径段、以及那次验收的结果', () => {
    const { canvas } = fixture()
    const allText = canvas('复盘.canvas')
      .nodes.map((node) => node.text)
      .join('\n')

    expect(allText).toContain('有效做法')
    expect(allText).toContain('先复述再动手')
    expect(allText).toContain('无效做法')
    expect(allText).toContain('把实现方式当成了问题描述')
    expect(allText).toContain('下一步调整')
    expect(allText).toContain('第一天：把想法变成一句话')
    expect(allText).toContain('复述：已完成')
  })
})

// ───────────────────────── 种子库 ─────────────────────────

describe('TG3 · 生成物里的 wikilink 必须能被 Obsidian 解析', () => {
  it('标题含 | [ ] 的节点，链接目标与磁盘文件名逐字一致且不残留语法字符', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '目标' })
    const node = createNode({ root: vault, title: '假设①零均值 E(u|X)=0', goal: goal.id })
    const stage = createStage({
      root: vault,
      goal: goal.id,
      title: '含危险字符的段',
      estimate: '约 1 天',
      nodes: [node.id],
      checks: ['能讲清这一段的检验信号'],
    })
    createRetrospective4Test(vault, goal.id, node.id, stage.id)

    const reports = generateAllMaps(vault)
    const area = reports.find((report) => report.goalId === goal.id)?.areaRelativePath ?? ''

    const fileName = node.relativePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? ''
    expect(fileName).toContain('E(u_X)=0') // 管道已被转义成下划线

    // 学习路径 md 里必须逐字出现该节点的文件名
    const pathMd = readFileSync(join(vault, area, '学习路径.md'), 'utf8')
    const pathTargets = [...pathMd.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(
      (match) => match[1] ?? '',
    )
    expect(pathTargets).toContain(fileName)

    // 两份生成物里的**每条**链接都不得残留 wikilink 语法字符
    for (const artifact of ['学习路径.md', '复盘.md'] as const) {
      const md = readFileSync(join(vault, area, artifact), 'utf8')
      const targets = [...md.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(
        (match) => match[1] ?? '',
      )
      expect(targets.length, artifact).toBeGreaterThan(0)
      for (const target of targets) {
        expect(target, `${artifact}: ${target}`).not.toContain('|')
        expect(target, `${artifact}: ${target}`).not.toMatch(/[[\]]/)
      }
    }
  })
})

/** 造一次验收 + 一条复盘（复盘 md 里也会出现段链接） */
function createRetrospective4Test(
  vault: string,
  goalId: string,
  nodeId: string,
  stageId: string,
): void {
  const session = recordSession({
    root: vault,
    node: nodeId,
    date: '2026-10-09',
    recital: { text: '复述正文。', result: '已完成' },
  })
  createRetrospective({
    root: vault,
    assessment: session.assessments[0]?.id ?? '',
    worked: 'w',
    failed: 'f',
    nextAdjustment: 'n',
    adjustEvents: [stageId],
    date: '2026-10-09',
  })
}

describe('TG1 · 配套关系的可比性判定', () => {
  it('祖先 / 后代 / 自身可比；兄弟与跨枝干不可比', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '目标' })
    const top = createNode({ root: vault, title: '枝干A', goal: goal.id })
    const mid = createNode({ root: vault, title: '中间', goal: goal.id, up: top.id })
    const leaf = createNode({ root: vault, title: '叶子', goal: goal.id, up: mid.id })
    const sibling = createNode({ root: vault, title: '兄弟', goal: goal.id, up: mid.id })
    const otherTop = createNode({ root: vault, title: '枝干B', goal: goal.id })
    const nodes = listAllNodes(vault)

    expect(isComparableByLineage(nodes, top.id, leaf.id)).toBe(true) // 祖孙
    expect(isComparableByLineage(nodes, mid.id, leaf.id)).toBe(true) // 父子
    expect(isComparableByLineage(nodes, leaf.id, leaf.id)).toBe(true) // 自身
    expect(isComparableByLineage(nodes, leaf.id, sibling.id)).toBe(false) // 兄弟
    expect(isComparableByLineage(nodes, mid.id, otherTop.id)).toBe(false) // 跨枝干
    expect(ancestorIdsOf(nodes, leaf.id)).toEqual(new Set([leaf.id, mid.id, top.id]))
  })

  it('容忍断链与环：不死循环、不抛错', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '目标' })
    const nodesDir = join(goalAreaRelativePath(goal), '知识网')

    writeDocument({
      root: vault,
      dir: nodesDir,
      type: 'map-node',
      title: '断链节点',
      id: 'aaaaaa',
      frontmatter: { up: '[[zzzzzz 不存在|不存在]]' },
    })
    writeDocument({
      root: vault,
      dir: nodesDir,
      type: 'map-node',
      title: '环A',
      id: 'bbbbbb',
      frontmatter: { up: '[[cccccc 环B|环B]]' },
    })
    writeDocument({
      root: vault,
      dir: nodesDir,
      type: 'map-node',
      title: '环B',
      id: 'cccccc',
      frontmatter: { up: '[[bbbbbb 环A|环A]]' },
    })

    const nodes = listAllNodes(vault)
    expect(isComparableByLineage(nodes, 'aaaaaa', 'bbbbbb')).toBe(false) // 断链不参与比较
    expect(isComparableByLineage(nodes, 'bbbbbb', 'cccccc')).toBe(true) // 环里仍互为祖先
    expect(ancestorIdsOf(nodes, 'bbbbbb').size).toBeLessThanOrEqual(2) // 有限步停下
  })
})

describe('TG2 · 段内配套资源', () => {
  it('段内资源 = 与段内任一节点可比的资源；排序与三因子完全一致', () => {
    const { vault, goal, stageIds, resourceIds } = fixture()
    const stages = listStages(vault, goal.id)
    const stage1 = stages.find((stage) => stage.id === stageIds[0])
    const stage2 = stages.find((stage) => stage.id === stageIds[1])
    expect(stage1).toBeDefined()
    expect(stage2).toBeDefined()

    const { ofStage } = buildStageResources(vault, goal)
    const profile = readProfileOrDefault(vault)

    // 第 1 段覆盖 branchA 与其两个子节点 → 枝干上的 rA 与叶子上的 rB 都配套（按分数 6 > 3）
    expect(ofStage(stage1 as never).map((item) => item.id)).toEqual([
      resourceIds[0],
      resourceIds[1],
    ])
    // 排序与 rankResources 逐项一致
    const all = listAllResources(vault)
    const expected = rankResources(
      profile,
      all.filter((item) => [resourceIds[0], resourceIds[1]].includes(item.id)),
    )
    expect(ofStage(stage1 as never).map((item) => item.id)).toEqual(
      expected.map((entry) => entry.item.id),
    )
    // 理由逐字一致
    for (const item of ofStage(stage1 as never)) {
      expect(item.rankReason).toBe(rankReasonOf(profile, item))
    }

    // 第 2 段只覆盖 branchB → 只有 rC
    expect(ofStage(stage2 as never).map((item) => item.id)).toEqual([resourceIds[2]])
  })

  it('canvas 仍是三列，资源写在阶段卡里且理由是紧凑写法', () => {
    const { canvas } = fixture()
    const drawing = canvas('学习路径.canvas')

    expect(new Set(drawing.nodes.map((node) => node.x)).size).toBe(3)

    const stage1 = drawing.nodes.find((node) => node.text.startsWith('**1. '))
    expect(stage1?.text).toContain('资源（按推荐排序）')
    expect(stage1?.text).toMatch(/理由：水平\+3 媒介\+2 时长\+1/)

    expect(
      compactReason('水平匹配 +3（资源 入门，画像 入门） · 媒介偏好 +2（a） · 时长 +1（b）'),
    ).toBe('水平+3 媒介+2 时长+1')
  })

  it('没有配套资源的段写占位文案（canvas 与 md 都有）', () => {
    const vault = track(createEmptyVault())
    const goal = createGoal({ root: vault, title: '目标' })
    const node = createNode({ root: vault, title: '节点', goal: goal.id })
    createStage({
      root: vault,
      goal: goal.id,
      title: '无资源段',
      estimate: '约 1 天',
      nodes: [node.id],
      checks: ['一条检验信号'],
    })

    const result = buildLearningPath(vault, goal)
    expect(result.canvas.nodes.some((item) => item.text.includes('（本段暂无配套资源）'))).toBe(
      true,
    )
    expect(result.md).toContain('（本段暂无配套资源）')
  })

  it('md：总览表有「配套资源」列，每段表固定六项且给完整理由', () => {
    const { file } = fixture()
    const md = file('学习路径.md')

    expect(md).toContain('| 段 | 阶段 | 估时 | 涉及节点 | 检验信号 | 验收题目 | 配套资源 |')

    const stageSection = md.slice(md.indexOf('## 二、逐段展开'), md.indexOf('## 三、进度清单'))
    for (const field of ['估时', '涉及节点', '产出物', '✅ 检验信号', '题目与提问', '配套资源']) {
      expect(stageSection.split(`| ${field} |`).length - 1, field).toBe(2)
    }
    expect(stageSection).toContain('水平匹配 +3（资源 入门，画像 入门）')
  })

  it('并列兜底：分数与 createdAt 都相同时按 id 升序', () => {
    const profile = {
      id: 'p',
      level: '入门',
      mediaPreference: '不限',
      timeBudget: 5,
      relativePath: '',
    }
    const same = {
      level: '入门',
      media: '文字',
      durationMin: 10,
      createdAt: '2026-10-10T00:00:00Z',
    }
    const ranked = rankResources(profile, [
      { id: 'cccccc', ...same },
      { id: 'aaaaaa', ...same },
      { id: 'bbbbbb', ...same },
    ])
    expect(ranked.map((entry) => entry.item.id)).toEqual(['aaaaaa', 'bbbbbb', 'cccccc'])
  })
})

describe('TG3 · 覆盖检查（资源侧）', () => {
  it('没有任何路径段用到的资源会被报出来', () => {
    const { vault, goal, area } = fixture()
    const isolated = createNode({ root: vault, title: '孤立叶子', goal: goal.id })
    createResource({
      root: vault,
      title: '没人用的资源',
      node: isolated.id,
      media: '文字',
      level: '入门',
    })

    const report = generateAllMaps(vault).find((item) => item.areaRelativePath === area)
    expect(report?.uncoveredLeaves.some((item) => item.includes('孤立叶子'))).toBe(true)
    expect(report?.unusedResources.some((item) => item.includes('没人用的资源'))).toBe(true)
  })

  it('资源挂在不存在的节点上：跨库检查报断链，且不污染 unusedResources', () => {
    const { vault, area, resourceIds } = fixture()
    const target = listAllResources(vault).find((item) => item.id === resourceIds[2])
    expect(target).toBeDefined()

    updateDocument({
      root: vault,
      relativePath: target?.relativePath ?? '',
      frontmatter: { node: '[[zzzzzz 不存在的节点|不存在的节点]]' },
    })

    const dangling = checkDanglingResources(vault)
    expect(dangling.some((item) => item.title === '另一枝干的资源')).toBe(true)

    const report = generateAllMaps(vault).find((item) => item.areaRelativePath === area)
    expect(report?.unusedResources.some((item) => item.includes('另一枝干的资源'))).toBe(false)
  })
})

describe('TG8 · 从 seeds 重建派生物', () => {
  it('每个目标分区都能生成六个派生物', () => {
    const vault = track(createTempVault())
    const reports = generateAllMaps(vault)

    expect(reports.length).toBeGreaterThanOrEqual(2)
    for (const report of reports) {
      for (const name of ARTIFACTS) {
        const path = join(vault, report.areaRelativePath, name)
        expect(() => readFileSync(path, 'utf8'), `${report.goalTitle} 的 ${name}`).not.toThrow()
      }
    }
  })
})
