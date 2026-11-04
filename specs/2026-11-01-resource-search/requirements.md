# 阶段 7 · 资源检索与排序 —— 需求

> 分支：`feat/phase-7-resources`（从 `main` 5c78b9c 切出）
> 上游：`specs/roadmap.md` 阶段 7；约束来自 `specs/mission.md`、`specs/tech-stack.md`
> 状态：**已定稿**（2026-11-01 访谈：Scope / Decisions / Context，九问）
> 本阶段回答：**能不能按节点把「真实存在的资源」找回来，并让排序理由与画像对得上。**

---

## 1. 现状

| 项       | 事实                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------- |
| 领域层   | `createResource()` 已要 `node` / `media` / `level`，可选 `url` / `tags` / `durationMin`                 |
| 排序     | `listResourcesRanked()` 每次读取都**实时**按画像算分数与理由；`applyRanking()` 才会回写 `rank_reason`   |
| 词表     | `LEVELS = 入门/进阶/熟练`，`MEDIA_TYPES = 视频/文字`，画像有 `level` / `mediaPreference` / `timeBudget` |
| 页面     | 网页端 `/resources` 仍是空状态；旧的 SSR 页面（`/resources` 在无构建时）存在但不进 SPA                  |
| 检索     | **没有**任何搜索能力；没有 Tavily 客户端，也没有配置项                                                  |
| 已有测试 | 领域排序与资源落盘有覆盖；检索链路为零                                                                  |

---

## 2. 范围

### 2.1 范围内

| #   | 交付物                | 说明                                                                           |
| --- | --------------------- | ------------------------------------------------------------------------------ |
| S1  | `SearchProvider` 抽象 | 接口 + Tavily 实现（`POST https://api.tavily.com/search`），测试可注入假实现   |
| S2  | 批量检索              | 选 1–5 个节点，每节点 top-5；只保留供应商真实返回的 URL，不补造                |
| S3  | 元数据推断            | 一次模型调用把候选批量判成 `level` / `media` / `durationMin`（服务端逐项校验） |
| S4  | 勾选落盘              | 审核页可改标题 / 等级 / 媒介 / 时长；重复 URL 跳过并报告                       |
| S5  | 资源页                | 目标选择 → 节点勾选 → 检索 → 候选编辑 → 落盘；列表显示实时排序理由             |
| S6  | 无结果提示            | 某节点 0 条时明确说「没搜到」，并给放宽建议                                    |

### 2.2 范围外

- 按媒介 / 等级筛选、搜索框 —— 本阶段只做列表与理由
- 手动新增资源表单（领域层已有能力，不给 UI）
- Serper 或其他供应商
- 抓取资源正文、生成摘要/笔记
- 自动批量检索全部节点（一次最多 5 个，控制额度）

---

## 3. 决策

| 编号 | 决策                                               | 理由                                       | 影响                               |
| ---- | -------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| D1   | 检索 + 落盘 + 页面一次做全                         | 不落盘资源页仍是空的，排序理由没东西可显示 | PR 较大                            |
| D2   | 每个节点 **top-5**                                 | 覆盖视频/文字两种媒介，又不至于把额度烧光  | 5 节点 = 5 次搜索                  |
| D3   | 资源页只做「列表 + 实时理由」，不加筛选            | 本阶段焦点是排序理由是否与画像一致         | 后续再加筛选                       |
| D4   | 供应商选 **Tavily**，但走 `SearchProvider` 接口    | 换供应商不动业务；测试注入假实现           | 多一层抽象                         |
| D5   | 查询 = 节点标题 + 目标标题 + 画像媒介偏好          | 命中率明显高于只用节点标题                 | 查询在响应里回显，便于排查         |
| D6   | 元数据用**模型从标题+摘要批量判定**                | B 站时长/水平很难靠规则，模型一次调用即可  | 需要 DeepSeek key；多一次 LLM 调用 |
| D7   | 已存在同一 URL：**跳过并报告**，不重复落盘         | 同一视频挂到多个节点只会让排序重复         | 全局按 URL 去重（跨目标）          |
| D8   | 搜不到就**明确提示**，不自动换词重试               | 自动重试烧额度且可能白花                   | 页面显示「没搜到」与建议           |
| D9   | 真实冒烟需要 `TAVILY_API_KEY` + `DEEPSEEK_API_KEY` | 两条链路都要真验证                         | key 由用户以环境变量提供           |

### 3.1 接口契约

```ts
// POST /api/goals/:id/resources/preview
// body: { nodeIds: string[] }   // 1–5 个
{
  candidates: {
    nodeId: string
    title: string
    url: string
    snippet: string
    level?: '入门' | '进阶' | '熟练'
    media?: '视频' | '文字'
    durationMin?: number
  }[]
  perNode: { nodeId: string; query: string; found: number }[]
  warnings: string[]           // 无结果、元数据缺失等
}

// POST /api/goals/:id/resources/commit
// body: { resources: { nodeId; title; url; level; media; durationMin? }[] }
{ created: number; skipped: { url: string; reason: string }[]; warnings: string[] }

// GET /api/goals/:id/resources
{
  resources: {
    id: string; title: string; url?: string; nodeId?: string; nodeTitle?: string
    level: string; media: string; durationMin?: number
    score: number; rankReason: string
  }[]
  profile: { level: string; mediaPreference: string; timeBudget: number }
}
```

- 未配置 Tavily：`preview` → 503 `SEARCH_NOT_CONFIGURED`，不发任何请求；
- 未配置 DeepSeek：`preview` → 503 `LLM_NOT_CONFIGURED`（元数据推断是预览的一部分）；
- 节点不属于该目标 / 不存在 → 400 / 404；
- 重复 URL：`commit` 里进 `skipped`，不中断其他资源；
- `level` / `media` 必须在词表内，`durationMin` 为正整数，否则 400。

### 3.2 元数据推断的硬约束

- 输入：候选的 `url` / `title` / `snippet`（不抓正文）；
- 输出：每条候选一个 `{ url, level, media, duration_min? }`；
- 服务端校验：`level` ∈ 词表、`media` ∈ 词表、`duration_min` 为正整数；
- 模型漏掉的候选：保留但字段留空，进 `warnings`（不阻止落盘预览）；
- 无法判断时长时**不猜**，留空。

---

## 4. 上下文与约束

| 项       | 内容                                                                        |
| -------- | --------------------------------------------------------------------------- |
| 现有资产 | `createResource` / `listResourcesRanked` / `rankWithProfile` / 画像三个因子 |
| 检索配置 | `TAVILY_API_KEY`；base URL 固定，可被 `SDL_TAVILY_BASE_URL` 覆盖（测试用）  |
| 额度     | 一次预览最多 5 次搜索 + 1 次 LLM 调用；页面显示「本次检索 N 个节点」        |
| 排序     | 读取时实时计算，不写 `rank_reason`（阶段 7 只读）                           |
| 测试     | 假 `fetch` 同时模拟 Tavily 与 DeepSeek；真实冒烟只走临时库                  |
| 前端     | 沿用设计令牌；资源页替换空状态                                              |

---

## 5. 风险

| 风险                   | 缓解                                             |
| ---------------------- | ------------------------------------------------ |
| Tavily 返回广告/无关页 | 只取 top-5；标题/摘要展示给人勾选；不自动全收    |
| 模型编造时长或等级     | 服务端词表校验 + 缺失留空 + 审核页可改           |
| 额度被一次点爆         | 节点上限 5；预览前显示数量；不做自动全量         |
| 跨目标重复 URL         | 全局去重，`commit` 里报告挂在哪个目标            |
| 排序理由与画像不一致   | 理由由 `rankReasonOf` 实时生成，页面不读存储字段 |
| 页面把「没搜到」当错误 | 无结果只是 `found: 0` + 警告，不是 5xx           |

---

## 6. 未决问题

1. 是否缓存搜索结果（同一节点短时间内重复检索）—— 本期不做，额度有限但可接受。
2. `snippet` 是否落盘 —— 不落盘，只用于展示与元数据推断。
3. 资源标签 `tags` —— 本期不自动生成。
