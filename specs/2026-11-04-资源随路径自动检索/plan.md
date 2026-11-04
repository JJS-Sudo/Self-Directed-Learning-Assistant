# 资源随路径自动检索 —— 实施规划

## 1. 决策记录（已与用户确认）

| #   | 决策       | 结论                                         |
| --- | ---------- | -------------------------------------------- |
| 1   | 触发时机   | 路径确认落盘后自动接着检索                   |
| 2   | 覆盖范围   | 路径阶段实际列出的所有节点                   |
| 3   | 每节点数量 | 1–2 条，宁缺毋滥                             |
| 4   | 已有资源   | 复用已有，只补缺失                           |
| 5   | 落盘方式   | 直接落盘，路径页立即生效                     |
| 6   | 资源判定   | 所有新资源合并成一次 LLM 批量判定            |
| 7   | 失败处理   | 跳过该节点并提示，不影响路径与其他节点       |
| 8   | 资源页     | 改为总览 + 手动补检，去掉 5 个上限           |
| 9   | 路径展示   | 每个阶段下按节点分组，节点后跟资源           |
| 10  | 节点变化   | 保留旧资源，新增节点自动补，提供「重新补齐」 |
| 11  | 进度       | SSE 阶段式进度（第 N/M 个节点）              |
| 12  | 范围       | AI 路径与材料路径都覆盖；旧路径一键补齐      |
| 13  | 共享 URL   | 同一资源可挂多个节点（`nodes` 数组）         |
| 14  | 无 Tavily  | 生成平台搜索页链接兜底，标「未验证」并落盘   |
| 15  | 验收       | fake 搜索/模型单测 + 用户真实 Key 手测       |

### 为什么需要搜索源

DeepSeek API 的 `deepseek-chat` **没有内置联网搜索工具**，只能凭训练知识回答；让它直接给资源 URL
极易编造不存在的链接。因此：

- 有 Tavily Key：真实检索 → 得到可验证 URL → 模型只做等级/媒介/时长/适配判定；
- 无 Tavily Key：不抓取网页，生成**确定可用的平台搜索结果页链接**（B 站 / YouTube / Bing / MDN），
  标记 `unverified`；用户之后配置 Tavily 可「重新补齐」替换。

## 2. 现状与差距

| 现状                                                                    | 差距                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| `ResourcesPage` 手动选节点，前端 `next.size < 5`、后端 schema `.max(5)` | 上限要去掉；页面要改总览                         |
| `previewResources` 已是「逐节点搜索 + 一次批量判定」                    | 需支持进度回调、并发、失败隔离与平台兜底         |
| `persistResources` 全局按 URL 去重，重复直接跳过                        | 要改成「同 URL 追加节点关联」，支持共享          |
| 资源只有单个 `node` 字段                                                | 要加 `nodes` 数组与 `unverified`                 |
| 路径页只展示 `stage.resources`，DTO 无节点信息                          | 要按节点分组，增加 `nodes`/`nodeId`/`unverified` |
| 路径 commit 后没有后续动作                                              | 要串自动检索与 SSE 进度                          |
| 无 SSE 基础设施                                                         | 新增 Hono `streamSSE` 路由与前端解析             |
| 无资源删除接口                                                          | 新增 `DELETE /api/resources/:id`                 |

## 3. 架构

```
路径 commit
   │
   ▼
PathPage ──POST /api/goals/:id/resources/auto (SSE)──► autoResources()
                                                        │
                          ┌─────────────────────────────┼──────────────────────────┐
                          ▼                             ▼                          ▼
                   TavilySearchProvider          平台搜索页兜底              已有资源复用
                   （有 Key，真实 URL）          （无 Key，unverified）      （按 node 过滤）
                          │                             │                          │
                          └────────────► persistResources() ◄──────────────────────┘
                                             │
                                             ▼
                                   40-资源/*.md（nodes 数组、unverified）
```

### 3.1 新增/修改模块

| 文件                                    | 动作                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/domain/resources.ts`               | 加 `nodeIds`、`unverified`；`createResource` 支持多节点；`attachNode`；读取归一化             |
| `src/resource-search/platform-links.ts` | **新增**：按节点标题 + 画像生成平台搜索页候选（纯函数，无网络）                               |
| `src/resource-search/auto.ts`           | **新增**：编排「取节点 → 复用 → 搜索/兜底 → 批量判定 → 落盘 → 进度」                          |
| `src/resource-search/preview.ts`        | 抽出通用搜索循环；支持 `onProgress`、并发 3、失败收集                                         |
| `src/resource-search/persist.ts`        | URL 已存在时 `attachNode`；创建 verified 时清理该节点未验证链接                               |
| `src/api/resources.ts`                  | schema 去掉 5 上限；`auto` 请求/SSE 类型；`DELETE`；总览 DTO                                  |
| `src/api/path.ts`                       | `PathStageDto.nodes`、资源 `nodeId/nodeTitle/unverified`                                      |
| `src/app.ts`                            | 注册 `POST /resources/auto`（`streamSSE`）、`DELETE /api/resources/:id`、`GET /api/resources` |
| `web/src/pages/PathPage.tsx`            | commit 后自动补齐、SSE 进度、按节点分组、重试/重新补齐                                        |
| `web/src/pages/ResourcesPage.tsx`       | 总览、筛选、删除、去 5 上限、补齐按钮                                                         |
| `web/src/lib/stream.ts`                 | **新增**：fetch + SSE 解析（POST 流，EventSource 不支持 POST）                                |
| `web/src/styles.css`                    | 进度条、节点分组、未验证徽标                                                                  |

### 3.2 自动编排伪代码

```ts
async function autoResources(input: {
  root
  goal
  pathStages
  nodeIds?
  mode
  searchConfigured
  search?
  llmDeps?
  signal
  emit
}): Promise<AutoResult> {
  const nodes = resolveNodes(pathStages, input.nodeIds).slice(0, 40)
  const existing = listResources(root).filter((r) => r.nodeIds.some((id) => nodes.has(id)))
  const targets = selectTargets(nodes, existing, input.mode) // fill/refresh/retry
  emit('start', { total: targets.length, searchConfigured })

  const found: Candidate[] = []
  for (const node of targets) {
    if (signal.aborted) break
    const hits = searchConfigured
      ? await search.search(buildQuery(node.title, goal.title, profile.mediaPreference), {
          maxResults: 2,
        })
      : platformLinks(node, profile) // 纯函数，无网络
    found.push(...hits.map((hit) => ({ ...hit, nodeId: node.id, unverified: !searchConfigured })))
    emit('progress', {
      done: ++done,
      total,
      nodeId: node.id,
      nodeTitle: node.title,
      found: hits.length,
    })
  }

  const metadata = searchConfigured
    ? await inferMetadata(config, found, deps) // 1 次
    : { byUrl: new Map(), warnings: [] }

  const result = persistResources(root, goal.id, foundWithMetadata)
  if (searchConfigured) removeUnverifiedForTouchedNodes(root, targets)
  emit('done', result)
}
```

### 3.3 SSE 契约

```
event: start
data: {"total":12,"searchConfigured":true}

event: progress
data: {"done":3,"total":12,"nodeId":"n1","nodeTitle":"贝叶斯定理","found":2}

event: warning
data: {"message":"「马尔可夫链」没搜到资源"}

event: done
data: {"created":9,"linked":2,"skipped":1,"failures":2,"truncated":false}
```

- 路由使用 `streamSSE(c, async (stream) => …)`；
- 搜索并发 3，单次超时 10s，整体建议上限 5 分钟；
- 客户端 `AbortController` 断开时 `signal.aborted` 停止后续节点；
- 错误只在整体不可继续时发 `error`，单节点错误进 `warning`/`done.failures`。

## 4. 任务组

### T1 资源领域模型：多节点 + 未验证 + 兼容（0.5 天）

- `ResourceSummary` 增加 `nodeIds`、`unverified`；
- `CreateResourceInput` 支持 `nodeIds`，frontmatter 写 `node` + `nodes`；
- 读取时 `nodes` 缺失则回退 `[node]`；
- `listResources` 过滤改为 `nodeIds` 交集；
- `attachNode(root, resourceId, nodeId)` 追加关联并重写文件；
- 测试：旧文件读取、写多节点、过滤、attach 幂等。

### T2 平台搜索页兜底（0.5 天）

- `platform-links.ts`：输入节点标题、画像、目标，输出 1–2 条 `unverified` 候选；
- 规则：
  - 视频 → `search.bilibili.com/all?keyword=`、`youtube.com/results?search_query=`；
  - 文字/不限 → `bing.com/search?q=`；
  - 代码关键词 → `developer.mozilla.org/zh-CN/search?q=` 优先；
- 标题模板、平台名、URL 编码全部纯函数；
- 测试：中文编码、代码节点、最多 2 条、URL 合法。

### T3 自动编排与搜索改造（1 天）

- `preview.ts` 抽出共用搜索循环，支持 `onProgress`、并发 3、失败收集；
- `auto.ts`：取节点（40 上限）、模式选择、复用已有、搜索/兜底、批量判定、落盘、结果统计；
- `persist.ts`：同 URL attach；verified 创建后清理该节点 unverified；
- `mode` 语义：
  - `fill`：跳过已有（无 Tavily 时也跳过未验证，避免重复）；
  - `refresh`：补缺失；有 Tavily 时替换未验证；
  - `retry`：只跑指定节点。
- 测试：fake search/LLM 覆盖 40 上限、复用、失败、共享、替换。

### T4 API：SSE + 删除 + 总览（0.5 天）

- `POST /api/goals/:id/resources/auto`（SSE）；
- `GET /api/resources?goalId=` 总览（含 goal/node 标题、unverified）；
- `DELETE /api/resources/:id`；
- 预览 schema `max(200)`；
- 给 `createApp` 增加可注入 `searchFactory` / `llmDeps`，便于 API 测试；
- 测试：SSE 事件顺序、400 参数、删除 404、无 Key 分支。

### T5 路径页（1 天）

- PathPage commit 成功后自动调用 auto（`fill`），显示 SSE 进度；
- 按 `stage.nodes` 分组渲染；每个节点列出资源；空节点显示「未找到资源 + 重试」；
- `unverified` 徽标；顶部「重新补齐」；无 Tavily 时提示与配置入口；
- 单节点重试调用 `auto` + `nodeIds:[id]`；
- 测试：进度文案、分组、重试、失败提示。

### T6 资源页（1 天）

- 总览：按目标/节点分组、筛选已验证/未验证、删除；
- 手动检索：去掉 5 上限，节点可搜索过滤；
- 「补齐缺失资源」按钮复用 SSE；
- 测试：超过 5 个节点可提交、删除、筛选。

### T7 测试与加固（1 天）

- 单元：domain、platform-links、auto、persist；
- API：SSE、删除、总览、无 Key；
- UI：PathPage/ResourcesPage；
- 全量 `npm test`、lint、typecheck；
- 手工：真实 Tavily 一条路径 + 无 Key 一条路径。

### T8 文档与发布（0.5 天）

- README/START-HERE 更新资源流程说明；
- CHANGELOG、版本 1.2.0；
- roadmap 增加阶段 13（完成后标 ✅）；
- 桌面版重新出包（1.2.0）并更新微信包。

**合计约 6 个工作日。**

## 5. 兼容与迁移

- 旧资源只有 `node`：读取归一化，不批量改文件；
- 新写入同时写 `node`（第一个）与 `nodes`；
- 旧客户端只认第一个节点，仍可打开；
- 已存在的路径无需重算；点「补齐资源」即可。

## 6. 风险与对策

| 风险                     | 对策                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| Tavily 配额被长路径耗尽  | 40 节点上限、每节点 1 次、复用已有、`fill` 跳过                                   |
| SSE 被代理缓冲           | 本地直连为主；设置 `Cache-Control: no-cache`、`X-Accel-Buffering: no`；桌面端同理 |
| 资源模型迁移破坏旧库     | 读取回退 + 单测覆盖旧 frontmatter；不做批量重写                                   |
| 平台链接被误认为具体资源 | `unverified` 徽标 + 文案「搜索页」+ 配置 Tavily 提示                              |
| 节点删除产生孤儿资源     | 资源页总览可删除；后续再做孤儿清理                                                |
| 自动流程拖慢路径确认     | 路径先落盘成功，再异步补齐；补齐失败不撤销路径                                    |

## 7. 验收门槛

- `npm test` 全绿（现有 489+ 条 + 新增）；
- `npm run lint`、`npm run typecheck` 全绿；
- 手工：Tavily 路径 6 节点，每节点 1–2 条，刷新后仍在；
- 手工：移除 Tavily Key 的临时库，出现平台搜索页 + 未验证徽标；
- 手工：同一 URL 两个节点共享，`40-资源` 只有一个文件；
- 本机真实库验证不产生重复资源。

## 8. 实现记录（2026-11-04）

T1–T8 已完成：

- 资源模型支持 `nodes` 数组、`unverified`、attach/detach/delete，旧 `node` 兼容；
- `platform-links.ts` 生成 B 站 / YouTube / Bing / MDN 搜索页，无网络请求；
- `auto.ts` 串起「取路径节点 → 复用 → 搜索/兜底 → 批量判定 → 落盘」，SSE 进度；
- `POST /api/goals/:id/resources/auto`、`DELETE /api/resources/:id`、`GET /api/resources` 已接入；
- 路径页 commit 后自动 fill，按节点分组、未验证徽标、单点重试、重新补齐；
- 资源页总览、筛选、删除，手动检索去掉 5 个节点上限；
- 测试：**507 条全绿**，lint / typecheck 通过；
- 手测：真实 Tavily 3 节点各 2 条；无 Key 时 6 条平台搜索页；配置 Key 后 refresh 全部替换为已验证资源；
- 版本升到 **1.2.0**，新增 `docs/releases/v1.2.0.md`。
