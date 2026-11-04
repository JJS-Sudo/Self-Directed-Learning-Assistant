# 阶段 8 · 验收与复盘 —— 需求

> 分支：`feat/phase-8-assessments`（从 `main` 306ba65 切出）
> 上游：`specs/roadmap.md` 阶段 8；约束来自 `specs/mission.md`、`specs/tech-stack.md`
> 状态：**已定稿**（2026-11-01 访谈：Scope / Decisions / Context，九问）
> 本阶段回答：**六环的最后一环——学完能不能测、测完能不能改，并且不用打开编辑器。**

---

## 1. 现状

| 项         | 事实                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 验收领域层 | `recordQuiz`（做题，必带 `question`）、`recordRecital`（复述，正文写受管区块）、`recordSession`（同一节点的复述+做题共享 `session_id`） |
| 词表       | 做题结果 `正确 / 错误 / 未作答`；复述结果 `已完成 / 未完成`；掌握度 `未学 / 在学 / 已掌握`                                              |
| 复盘领域层 | `createRetrospective({ assessment, worked, failed, nextAdjustment, adjustEvents?, mastery? })`，可顺带回写该验收节点的掌握度            |
| 查询       | `listAssessments` / `listSession` / `listRetrospectives` 已有                                                                           |
| 入口       | **没有任何验收 / 复盘 HTTP 接口**；验收、复盘两页仍是空状态                                                                             |
| 掌握度     | 节点 frontmatter 的 `mastery` 字段，目前只能手改                                                                                        |

---

## 2. 范围

### 2.1 范围内

| #   | 交付物          | 说明                                                                                      |
| --- | --------------- | ----------------------------------------------------------------------------------------- |
| S1  | 交卷接口        | 一次验收多条记录共享 `session_id`；**每道入选的题都必须有一条记录**，没答的按「未作答」落 |
| S2  | 复述记录        | 人工自评「已完成 / 未完成」+ 正文；不调模型                                               |
| S3  | 本轮统计        | 对/错/未答/复述完成数，以及按节点聚合的正确率                                             |
| S4  | 掌握度建议      | 按正确率映射出建议档位；**复盘时人工确认**后才回写                                        |
| S5  | 复盘接口        | `worked` / `failed` / `next_adjustment` / `adjust_events`；可带 `mastery` 回写            |
| S6  | 验收页 + 复盘页 | 独立入口；复盘页显示本轮统计与「调整了哪几段」                                            |

### 2.2 范围外

- 模型评分复述（人工自评）
- 自动重排路径（只记录调整事件，不动段序）
- 历史趋势图、跨目标汇总
- 题目编辑、题库管理
- 学习时长统计

---

## 3. 决策

| 编号 | 决策                                                                            | 理由                                                         | 影响                      |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------- |
| D1   | 验收 + 复盘 + mastery 回写 + 调整展示一次做全                                   | 少一环，六环就闭不上                                         | PR 较大                   |
| D2   | 独立验收页（目标 → 题目列表 → 逐题作答 → 交卷）                                 | 从路径段进入会耦合两个页面                                   | 先做独立页                |
| D3   | 复述用**人工自评**，不调模型                                                    | 模型打分的稳定性不足以支撑掌握度回写                         | 本阶段不需要 LLM          |
| D4   | 掌握度**自动建议 + 复盘时人工确认**                                             | 交卷即改容易被一次失误带偏；完全手选又太累                   | 复盘表单预填建议值        |
| D5   | 建议规则：按节点聚合本轮结果，`正确率 ≥ 80% → 已掌握`；`> 0 → 在学`；`0 → 未学` | 规则简单可解释                                               | 正确率分母含未作答        |
| D6   | **未作答计入分母**                                                              | roadmap 明确要求「未作答也必须落一条记录」；不计入会高估掌握 | 全未答 = 0%               |
| D7   | 调整只**记录事件**，不自动改路径                                                | 段序是用户排的，系统不该擅自改                               | 事件存段 id，页面映射标题 |
| D8   | 复盘页展示：本轮统计 + 调整事件（含段标题）+ 当前段序                           | 能看出「改了哪几段」即可，不做历史图表                       | 不引入图表库              |
| D9   | 真实冒烟用临时库全链路，**不需要模型 key**                                      | 本阶段没有模型调用                                           | 成本为零                  |

### 3.1 接口契约

```ts
// POST /api/goals/:id/assessments
// 一次交卷 = 一个 session；questionIds 里的每道题都会落一条记录
{
  questionIds: string[]                       // 1..20，必须属于该目标
  answers?: { questionId: string; result: '正确' | '错误' | '未作答' }[]
  recitals?: { nodeId: string; text: string; result: '已完成' | '未完成' }[]
}
→ {
  sessionId: string
  records: { id: string; mode: string; result: string; nodeId?: string; questionId?: string }[]
  stats: {
    total: number; correct: number; wrong: number; unanswered: number
    recitalDone: number; recitalPending: number
    byNode: { nodeId: string; total: number; correct: number; accuracy: number }[]
    suggestedMastery: { nodeId: string; mastery: '未学' | '在学' | '已掌握' }[]
  }
}

// GET /api/goals/:id/assessments?session=<id>
→ { records: [...] }        // 不带 session 时返回最近 50 条

// POST /api/goals/:id/retrospectives
{
  assessmentId: string
  worked: string; failed: string; nextAdjustment: string
  stageIds?: string[]      // 复盘页勾选了哪几段 → 服务端生成 adjust_events
  mastery?: '未学' | '在学' | '已掌握'
}
→ { id: string; adjustEvents: string[]; mastery?: string }

// GET /api/goals/:id/retrospectives
→ { retrospectives: { id: string; assessmentId: string; adjustEvents: string[]; mastery?: string; date: string }[] }
```

- 未作答：`answers` 里缺的题按 `未作答` 处理，**一定有记录**。
- 重复交卷：每次生成新 `session_id`，历史不覆盖。
- `stageIds` 不属于该目标 / 不存在 → 400 / 404。
- `adjust_events` 存**段 id**（领域层会校验并转成 wikilink）；页面再用 id 映射成「<order>. <title>」。
  用户的具体调整说明写在 `nextAdjustment` 里。
- 该目标没有题目 → 400「先在地图/路径页生成题目」。

### 3.2 掌握度建议规则（确定性）

| 本轮该节点结果             | 建议   |
| -------------------------- | ------ |
| 正确率 ≥ 80%               | 已掌握 |
| 0 < 正确率 < 80%           | 在学   |
| 正确率 = 0（含全部未作答） | 未学   |

- 分母 = 该节点本轮所有做题记录（正确 + 错误 + 未作答）；
- 复述结果**不参与**正确率，只单独统计完成数；
- 建议值只是预填，最终以复盘提交的 `mastery` 为准。

---

## 4. 上下文与约束

| 项         | 内容                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 现有资产   | `recordQuiz` / `recordRecital` / `newSessionId` / `createRetrospective` / `listAssessments` / `listRetrospectives` |
| 数据位置   | 验收记录写在目标分区的 `验收/` 下；复盘写在 `复盘/` 下（沿用领域层）                                               |
| 题目来源   | 阶段 6 落盘的题目；验收页通过 `GET /api/goals/:id/path` 拿题                                                       |
| 路径段来源 | 同上，复盘页用 `stageIds` 多选                                                                                     |
| 测试       | 纯领域 + 假库；真实冒烟不需要任何 key                                                                              |
| 性质       | 写库操作；**不产生新的 LLM / 搜索调用**                                                                            |

---

## 5. 风险

| 风险                         | 缓解                                                   |
| ---------------------------- | ------------------------------------------------------ |
| 交卷时漏题导致「未作答」没落 | 服务端对 `questionIds` 全量补齐；单测断言记录数 = 题数 |
| 正确率把复述算进去           | 明确分母只含做题；统计分开展示                         |
| 一次失误把已掌握降级         | 只给建议，不自动回写；人工确认                         |
| 复盘事件与段对不上           | 服务端用 stage id 查标题生成事件；id 非法直接 400      |
| 历史被覆盖                   | 每次交卷新 session；复盘只追加                         |
| 页面被当成编辑器             | 只提供作答、复盘表单与统计，不提供改题/改段            |

---

## 6. 未决问题

1. 一次验收是否允许同时选多个目标的题 —— 不允许，按目标隔离。
2. 复述正文的最小长度 —— 沿用领域层的非空校验，不额外加长。
3. 同一题重复作答 —— 允许（每次新 session），统计时按最新 session 展示。
