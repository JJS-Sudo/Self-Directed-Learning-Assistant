# 阶段 10 · 质量闸门与兜底 —— 需求

> 分支：`feat/phase-10-quality-export`（从 `main` c1e84cd 切出）
> 上游：`specs/roadmap.md` 阶段 10；约束来自 `specs/mission.md`、`specs/tech-stack.md`
> 状态：**已定稿**（2026-11-01 访谈：Scope / Decisions / Context，九问）
> 本阶段回答：**生成错了能不能看见、能不能只修坏的那块、库能不能搬走再搬回来、钱花在哪。**

---

## 1. 现状

| 项           | 事实                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| 覆盖检查     | `coverageWarnings()` 已能报四类问题（叶子未被路径覆盖、路径段引用不存在的节点、资源未使用、资源挂在不存在的节点） |
| 生成失败     | 只在调用方返回错误，**没有落任何记录**；面板无从汇总                                                              |
| token / 费用 | `chat()` 的返回里已有 `usage`（`prompt_tokens` / `completion_tokens`），但没有持久化，也没有价格换算的汇总        |
| 预算         | 目标 frontmatter 没有预算字段                                                                                     |
| 导出/导入    | 完全没有；只有 `npm run maps` 生成派生物                                                                          |
| 导航         | 六区（目标 / 地图 / 路径 / 资源 / 验收 / 复盘）                                                                   |
| 真实运行库   | **5 个目标、313 个文件**（roadmap 里「三个真实项目」的旧描述已过时）                                              |

---

## 2. 范围

### 2.1 范围内

| #   | 交付物     | 说明                                                                |
| --- | ---------- | ------------------------------------------------------------------- |
| S1  | 质量面板   | 新「质量」页：四类警告按目标汇总、最近生成失败原因、token/费用      |
| S2  | 子图重生成 | 按警告涉及节点勾选（1–10 个），只对这些节点生成修复候选，确认后追加 |
| S3  | 单目标预算 | 目标可设 `budget_cny`；超出**只警告**，不阻止生成                   |
| S4  | 运行记录   | 每次 LLM 调用追加一条 run（tokens / 费用 / 成败），落盘可查         |
| S5  | 整库导出   | zip：Markdown + 资源；`.canvas` 可选；不含索引与运行记录            |
| S6  | 导入旧库   | 上传 zip 解压写库；同路径已存在则跳过并报告                         |
| S7  | 页面入口   | 质量页按钮（导出 / 导入 / 重生成）+ API                             |

### 2.2 范围外

- 自动全库体检守护进程
- 服务端定时任务、邮件通知
- 多用户预算
- 增量备份、版本历史
- 云端同步

---

## 3. 决策

| 编号 | 决策                                                                | 理由                                    | 影响                    |
| ---- | ------------------------------------------------------------------- | --------------------------------------- | ----------------------- |
| D1   | 面板 + 重生成 + 导出入 + 预算一次做全                               | roadmap 的最后一阶段，收口              | PR 大                   |
| D2   | 重生成**只处理勾选的节点**（1–10 个），一次 LLM 调用                | 避免整目标重写与浪费                    | 需要新的 preview 接口   |
| D3   | 重生成结果是**追加修复候选**，不删旧节点                            | 旧节点可能已有路径/题目引用，删除会断链 | 文档写明「修复 = 补充」 |
| D4   | 运行记录写库根 `.sdl-runs.json`（JSONL 风格数组），不用 SQLite      | 索引可重建，费用历史不该丢              | 文件随库走              |
| D5   | 费用 = 真实 `usage` × 价格表；缺 usage 时不计费用但记 tokens 未知   | 用真数据，不拍脑袋                      | 调用方都要回传 usage    |
| D6   | 预算写目标 frontmatter `budget_cny`；超了**只警告**                 | 硬拦会让人卡死                          | 面板显示进度条/超支提示 |
| D7   | 导出为 zip（JSZip），Markdown + 资源；canvas 勾选才带               | 与 Obsidian 兼容，体积可控              | 新增运行时依赖          |
| D8   | 导入按**目标相对路径**判断重复：已存在就跳过并报告                  | 简单、不会覆盖手改                      | 汇报 skipped 列表       |
| D9   | 导航新增第七区「质量」                                              | 面板需要独立空间                        | 导航与路由测试要更新    |
| D10  | 验收演示导入**真实运行库**（5 个目标），并用真 key 跑一次子图重生成 | 这是最有说服力的回归                    | 需要 key；在临时库做    |

### 3.1 接口契约

```ts
// GET /api/goals/:id/quality
{
  warnings: { category: '地图' | '路径' | '资源' | '生成'; message: string }[]
  failures: { at: string; kind: string; message: string }[]   // 最近 20 条失败
  runs: { at: string; kind: string; promptTokens?: number; completionTokens?: number; costCny?: number; ok: boolean }[]
  budget: { budgetCny?: number; spentCny: number; over: boolean }
}

// POST /api/goals/:id/regenerate
// body: { nodeIds: string[] }（1–10，必须属于该目标）
// → 生成修复候选，不写库
{ candidates: { title: string; parentNodeId?: string; why?: string }[]
  usage?: { promptTokens?: number; completionTokens?: number }
  costCny?: number
  warnings: string[] }

// POST /api/goals/:id/budget
// body: { budgetCny: number | null }   null = 清除
{ goal: { id: string; budgetCny?: number } }

// GET /api/export?goalId=<可选>&canvas=1
// → application/zip（整库或单目标；canvas=1 时带上 .canvas）

// POST /api/import   原始 zip 字节（content-type: application/zip）
{ imported: string[]; skipped: { path: string; reason: string }[]; failed: { path: string; reason: string }[] }
```

- 导入解析 zip 时拒绝绝对路径与盘符；`..` 会被 JSZip 规范化，最终仍落在库根内。
- 导出排除：`.sdl-index.db*`、`.sdl-runs.json`、`.obsidian/`、`.sdl-backup/`。
- 重生成没有 key → 503 `LLM_NOT_CONFIGURED`，不产生 run。
- 运行记录：成功与失败都记，失败时 `ok: false` + `error`。

### 3.2 四类警告的归类

| 类别 | 来源                                                |
| ---- | --------------------------------------------------- |
| 地图 | 叶子节点未被任何路径段覆盖（`coverageWarnings`）    |
| 路径 | 路径段引用了地图上不存在的节点                      |
| 资源 | 资源没有被路径段使用 / 挂在不存在节点上             |
| 生成 | 最近一次生成/重生成失败（来自 runs 的 `ok: false`） |

---

## 4. 上下文与约束

| 项       | 内容                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 已有能力 | `coverageWarnings`、`chat()` 的 usage、`listResourcesRanked`、`ensureGoalsIndex`          |
| 新增依赖 | `jszip`（纯 JS，用于导出与导入）                                                          |
| 数据位置 | 运行记录 `.sdl-runs.json`（库根）；预算在目标 frontmatter                                 |
| 价格     | 复用 `map-gen/estimate` 的价格表（可按环境变量覆盖）                                      |
| 演示     | 真实运行库 → 复制到临时库 → 导出 → 导入空库 → 地图/路径渲染 + 警告可见；真 key 重生成一次 |
| 安全     | 导入的路径必须落在库根内；导入不执行任何文件内容                                          |

---

## 5. 风险

| 风险             | 缓解                                                    |
| ---------------- | ------------------------------------------------------- |
| zip 内存占用     | 导出按文件逐个写；导入限制单文件 10MB、总量 50MB        |
| zip slip         | 解析时校验每个 entry 的规范化路径必须在库根内           |
| 重生成质量不可控 | 只生成候选、必须人工确认；不自动落盘                    |
| 费用记录写坏     | `.sdl-runs.json` 读失败时降级为空并保留原文件（`.bak`） |
| 预算单位误解     | 统一人民币元，字段名 `budget_cny`，面板写「元」         |
| 真实库被导入污染 | 演示只在临时库做；导入端对已存在路径跳过                |

---

## 6. 未决问题

1. 运行记录保留上限 —— 先保留最近 1000 条，超出时截断最旧的。
2. 导出是否包含 `seeds/` —— 不包含，seeds 是程序模板。
3. 导入后是否自动重建索引与派生物 —— 只重建索引；`maps` 由用户手动跑（与现有行为一致）。
