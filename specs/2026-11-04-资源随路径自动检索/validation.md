# 资源随路径自动检索 —— 验证计划

## 1. 验证目标

确认以下五件事：

1. 路径落盘后**真的会**为每个节点自动找资源并写入；
2. 没有 Tavily 时**不空白**，平台搜索页链接可用且标「未验证」；
3. 同一资源可被多个节点共享，但资源库只有一份；
4. 失败只影响单个节点，可重试、可整条重新补齐；
5. 不破坏旧资源、旧路径与现有 489+ 测试。

## 2. 测试分层

| 层   | 内容                               | 命令                                                                    |
| ---- | ---------------------------------- | ----------------------------------------------------------------------- |
| 单元 | 资源模型、平台链接、自动编排、落盘 | `npx vitest run tests/resources-* tests/resource-auto-*`                |
| API  | SSE 事件、删除、总览、无 Key 分支  | `npx vitest run tests/api-resources-*`                                  |
| UI   | 路径分组、进度、重试、资源页上限   | `npx vitest run web/src/__tests__/*path* web/src/__tests__/*resources*` |
| 全量 | 回归                               | `npm test`                                                              |
| 静态 | 类型与规范                         | `npm run typecheck && npm run lint`                                     |
| 手工 | 真实 Tavily / 无 Key / 共享 URL    | 见第 5 节                                                               |

## 3. 单元测试清单

### 3.1 资源模型（`tests/resources-model.test.ts`）

- 旧 frontmatter 只有 `node` → `nodeIds` 长度为 1；
- 写入多节点 → `node` 是第一个、`nodes` 完整；
- `listResources({nodeIds})` 能命中第二个节点；
- `attachNode` 幂等：重复追加不产生重复项；
- `unverified` 读取与默认值。

### 3.2 平台兜底（`tests/resource-platform-links.test.ts`）

- 视频偏好 → B 站 + YouTube 两条，URL 编码正确；
- 文字偏好 → Bing；
- 代码节点（TypeScript/React/Python）→ MDN 优先；
- 最多 2 条；
- 所有 URL 均为 `https://` 且包含编码后的节点标题；
- 不发起网络请求（fake fetch 断言零调用）。

### 3.3 自动编排（`tests/resource-auto.test.ts`）

用 fake `SearchProvider` 与 fake `LlmDeps`：

- `fill`：只补没有资源的节点；
- `refresh`：补缺失 + 有 Tavily 时替换未验证；
- `retry`：只处理传入的 nodeIds；
- 41 个节点 → 只处理 40 个，`truncated=true`；
- 单节点搜索抛错 → 其他节点继续，`failures` 计数正确；
- 同一 URL 被两个节点搜到 → 一个资源，两个 nodeIds；
- 无搜索 Key → 全部 unverified，且不调用 LLM；
- 有搜索 Key → 所有新资源合并成 **1 次** LLM 调用；
- 节点不属于目标 → 跳过并 warning；
- AbortSignal 触发后停止后续搜索。

### 3.4 落盘（`tests/resources-persist.test.ts`）

- 同 URL 第二次提交 → `linked`，不新建文件；
- 已关联同一节点 → `skipped`；
- verified 资源写入后，该节点的 unverified 链接被移除；
- 删除资源文件后列表不再返回。

## 4. API 测试清单（`tests/api-resources-auto.test.ts`）

通过 `createApp` 注入 fake `searchFactory` / `llmDeps`：

1. `POST /resources/auto` 返回 `text/event-stream`；
2. 事件顺序为 `start → progress × N → done`；
3. `done.created + linked + skipped + failures` 与节点数一致；
4. 请求体 `nodeIds` 为空数组 → 400；
5. 超过 40 节点 → `truncated=true`；
6. 无 Tavily → `start.searchConfigured=false`，资源 `unverified=true`；
7. `DELETE /api/resources/:id` → 204；不存在 → 404；
8. `GET /api/resources?goalId=` 返回 node/goal 标题与 unverified；
9. 预览接口超过 5 个节点不再 400。

## 5. 手工验收场景

> 使用库副本或演示库，避免污染真实数据；真实 Key 手测由用户完成一次。

### S1 有 Tavily：AI 路径自动补齐

1. 配置 Tavily + DeepSeek；
2. 目标 → 路径 → 生成路径 → 确认落盘；
3. 观察进度「正在为 N/M 个节点找资源」；
4. 完成后每个节点下出现 1–2 条资源；
5. 刷新页面，资源仍在；
6. `40-资源/` 出现对应 Markdown 文件，frontmatter 含 `nodes`。

**预期**：无重复文件；每个节点至少 1 条（冷门节点可为 0 并标「未找到」）。

### S2 无 Tavily：平台搜索页兜底

1. 临时库移除 `.sdl-secrets.json` 的 Tavily；
2. 生成/补齐资源；
3. 资源标题为「在 B 站搜索“…”」等，带「未验证」徽标；
4. 点击链接能打开对应平台的搜索结果页；
5. 资源已写入 `40-资源/`，`unverified: true`。

### S3 配置 Tavily 后替换

1. 在 S2 的路径上配置 Tavily；
2. 路径页点「重新补齐」；
3. 未验证链接被真实资源替换（同节点不再同时存在两者）。

### S4 共享 URL

1. 构造两个节点搜到同一 URL（fake 搜索或手工导入同一 URL）；
2. 路径页两个节点下都出现该资源；
3. `40-资源/` 只有一个文件，`nodes` 含两个节点。

### S5 失败与重试

1. fake/断网让某节点搜索失败；
2. 其他节点正常落盘；
3. 路径页该节点显示「未找到资源」；
4. 点「重试」只补该节点，不重复其他节点。

### S6 旧路径补齐

1. 打开 1.1.x 生成的旧路径（无资源）；
2. 点「补齐资源」；
3. 资源按节点写入，路径页出现。

### S7 40 节点上限

1. 构造 41 个节点的路径；
2. 执行补齐；
3. 只处理前 40 个，页面提示「超出上限，已截断」。

### S8 资源页

1. 选 10 个节点检索 → 不再被 5 个限制拦截；
2. 总览能看到全部资源、按节点分组；
3. 删除一条资源 → 文件和列表都消失；
4. 「补齐缺失」能触发同样的 SSE 进度。

## 6. 成本与性能验证

| 指标          | 方法               | 目标             |
| ------------- | ------------------ | ---------------- |
| 搜索次数      | fake provider 计数 | ≤ 节点数，且 ≤40 |
| LLM 次数      | fake LLM 计数      | 一次运行 ≤1      |
| 单节点耗时    | 日志/计时          | 搜索 ≤10s        |
| 40 节点总耗时 | 手工               | ≤3 分钟          |
| 中断          | 关闭页面           | 后续节点不再搜索 |

## 7. 回归检查

- `npm test` 全绿（含旧 489+ 条）；
- `npm run typecheck` 根/web/electron；
- `npm run lint`；
- 旧资源文件可读、旧路径页面不报错；
- 桌面版 1.2.0 打包后：路径生成 → 资源补齐 → 重启应用后资源仍在。

## 8. 发布前检查清单

- [ ] 资源页 5 个上限已移除（前端 + schema）
- [ ] 路径 commit 后自动触发，失败不撤销路径
- [ ] SSE 进度与中断可用
- [ ] 无 Tavily 兜底与「未验证」徽标
- [ ] 共享 URL 只落一个文件
- [ ] 单节点重试 + 整条重新补齐
- [ ] 旧路径补齐
- [ ] 资源删除接口与总览
- [ ] 测试/类型/规范全绿
- [ ] CHANGELOG、README、版本 1.2.0、桌面包更新

## 9. 已知限制（验收时接受）

- 平台搜索页链接不是具体资源，只是搜索入口；
- Tavily 免费额度有限，超出后由用户自行承担；
- 资源质量仍取决于搜索源与模型判定，冷门节点可能 0 条；
- 不做自动定时刷新；需要时手动「重新补齐」。

## 10. 执行结果（2026-11-04）

- 自动化：`507` 条测试全部通过（93 个文件）；`lint`、`typecheck` 通过。
- 真实 Tavily：3 节点路径 → 每节点 2 条，共 6 条，全部 `unverified=false`，实时 SSE 进度正常。
- 无 Key：同一路径 → 6 条 B 站/YouTube 搜索页链接，全部 `unverified=true`，未调用 Tavily。
- 配置 Tavily 后 refresh：6 条未验证全部被真实资源替换，资源总数保持 6，无重复文件。
- 路径页：按节点分组显示「似然函数 / 贝叶斯定理 / 先验与后验」及各自链接，未验证徽标与重试入口存在。
- 资源页：总览、筛选、删除按钮正常；手动检索不再限制 5 个节点。
- 未完成：真实 Key 下的浏览器点击全流程（生成路径 → 自动补齐）未逐步录像，仅通过 API + 页面渲染验证。
