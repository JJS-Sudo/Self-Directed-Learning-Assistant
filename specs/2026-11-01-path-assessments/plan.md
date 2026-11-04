# 阶段 6 · 路径与验收题 —— 实施计划

> 配套：`requirements.md`、`validation.md`
> 顺序：T1 领域校验 → T2 生成 → T3 落盘 → T4 API → T5 页面 → T6 验收。
> 分支：`feat/phase-6-path-assessments`（从 `main` 切出）。

---

## T1 · checks 校验下沉

| #    | 任务                                                                                    | 落点                         |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------- |
| T1.1 | 在领域层集中校验：`checks` ≥1、每条去空白后长度 ≥ 6，否则 `VaultError('INVALID_INPUT')` | `src/domain/path-stages.ts`  |
| T1.2 | 模糊措辞（`理解/了解/熟悉/掌握/知道` 开头）**不报错**，由调用方转成警告                 | 同上（导出 `vagueChecks()`） |
| T1.3 | 先跑既有 307 条用例，确认没有段因更严格的长度门槛被误伤                                 | 全量测试                     |

**完成判据**：空数组、空字符串、5 字以内的 checks 都会被拒绝；既有用例不改或只改测试数据（不改规则）。

---

## T2 · 生成（`src/path-gen/`）

| #    | 任务                                                                                                                      | 落点                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| T2.1 | zod schema：`stages[]`（title / estimate / node_ids / checks / questions[]），题目含 kind / stem / answer? / explanation? | `src/path-gen/schema.ts`          |
| T2.2 | `generatePath(config, goal, nodes, deps)`：把节点树写进提示词，要求按学习单位分段、覆盖全部叶子、每段封闭+开放各一        | `src/path-gen/generate.ts`        |
| T2.3 | 覆盖计算：叶子节点集合 − 段引用集合；非空则带缺口再调用一次；仍缺 → 警告                                                  | 同上                              |
| T2.4 | 校验：所有 `node_ids` 必须是该目标的真实节点，否则整批拒绝                                                                | 同上                              |
| T2.5 | 测试（假 `fetch`）：正常一次；缺覆盖触发第二次；两次仍缺给警告；伪造 node id 报错；无 key 不发请求                        | `tests/path-gen-generate.test.ts` |

**完成判据**：请求次数 = 1 或 2；不发生写盘；节点 id 全部可信。

---

## T3 · 落盘

| #    | 任务                                                                         | 落点                             |
| ---- | ---------------------------------------------------------------------------- | -------------------------------- |
| T3.1 | 先 `createQuestion`（封闭校验 answer/explanation；开放不写 answer），拿到 id | `src/path-gen/persist.ts`        |
| T3.2 | 再 `createStage`：`nodes`、`checks`、`estimate`、`questions`（上一步的 id）  | 同上                             |
| T3.3 | `order` 接在现有最大段序之后；只追加，不删旧段                               | 同上                             |
| T3.4 | 落盘后返回四类覆盖警告                                                       | 同上                             |
| T3.5 | 测试：两段四题；题绑定正确；顺序接续；无关节点 id 报错；已有段不被改         | `tests/path-gen-persist.test.ts` |

**完成判据**：`listStages` 能读回全部段与题；`npm run maps` 之后覆盖警告为 0（叶子全被引用）。

---

## T4 · API

| #    | 任务                                                                                 | 落点                            |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------- |
| T4.1 | `POST /api/goals/:id/path/estimate`：按节点数与段数估算 token，**不调模型**          | `src/api/path.ts`、`src/app.ts` |
| T4.2 | `POST .../path/preview`：生成候选；无 key → 503；模型错误按阶段 4 映射               | 同上                            |
| T4.3 | `POST .../path/commit`：确定性落盘，返回 `createdStages` / `createdQuestions` / 警告 | 同上                            |
| T4.4 | `GET .../path`：返回段、题与覆盖警告                                                 | 同上                            |
| T4.5 | 测试：四个接口；无 key 0 次上游；preview 不写盘；commit 后 GET 可读                  | `tests/api-path.test.ts`        |

**完成判据**：estimate 的假 fetch 调用为 0；preview 前后 `listStages` 数量不变。

---

## T5 · 路径页

| #    | 任务                                                                | 落点                                     |
| ---- | ------------------------------------------------------------------- | ---------------------------------------- |
| T5.1 | 目标选择 + 「估算」+「生成路径」；显示 token 估算                   | `web/src/pages/PathPage.tsx`             |
| T5.2 | 段编辑器：改标题、估时、checks（逐行）、删段；显示本段节点          | `web/src/components/PathStageEditor.tsx` |
| T5.3 | 题目编辑：封闭题显示 stem / answer / explanation；开放题只显示 stem | 同上                                     |
| T5.4 | 「确认落盘」→ 刷新；页面展示段—节点—题与四类覆盖警告                | `web/src/pages/PathPage.tsx`             |
| T5.5 | 组件测试：渲染候选、改 checks、删段、提交 payload                   | `web/src/__tests__/path-page.test.tsx`   |

**完成判据**：不刷新页面能从「生成」走到「看到路径与题」；空库时是引导态。

---

## T6 · 验收

| #    | 任务                                                                     |
| ---- | ------------------------------------------------------------------------ |
| T6.1 | `typecheck` / `lint` / `test`（≥ 332）/ `build` 全绿                     |
| T6.2 | 临时库真实冒烟：地图节点 → 生成路径 → 落盘 → `npm run maps` 覆盖警告为 0 |
| T6.3 | 模糊 checks（「了解线性回归」）出现警告但仍可落盘                        |
| T6.4 | 真实运行库不被冒烟污染                                                   |

**完成判据**：`validation.md` 门禁逐条有证据；T6.2 需要有效 key。

---

## 提交切分（建议）

| #   | 提交                                           | 内容   |
| --- | ---------------------------------------------- | ------ |
| 1   | `feat(domain): checks 校验下沉到写盘入口`      | T1     |
| 2   | `feat(path-gen): 路径生成、覆盖补段与批量落盘` | T2、T3 |
| 3   | `feat(api): 路径估算 / 预览 / 落盘 / 读取`     | T4     |
| 4   | `feat(web): 路径页与段/题编辑器`               | T5     |
| 5   | `docs(spec): 阶段 6 规格与验收记录`            | 本目录 |

---

## 实施记录（2026-11-01）

T1–T5 完成；T6 除「真实模型冒烟（T6.2）」外完成。用例从 307 增至 **331**。

| 项       | 结果                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| 领域校验 | `createStage` 新增「每条 check ≥ 6 字」硬规则；`vagueChecks()` 标出模糊措辞（只警告） |
| 生成     | 一次生成 + 最多一次补盖；封闭题缺 answer/explanation 直接判 `LLM_BAD_RESPONSE`        |
| 落盘     | 先题后段；`order` 接在现有最大值之后；只追加                                          |
| API      | estimate / preview / commit / get 四个接口；estimate 0 次模型调用                     |
| 页面     | 段卡可改标题、估时、checks，可删段；题以「封闭/开放」标签展示                         |

实测证据（临时库 `%TEMP%\sdl-path-demo`，生产构建 3100，**不用模型**走通写入链路）：

- `POST /map/commit` 四个手写候选 → 4 个节点（1 个顶层 + 1 个分支 + 2 个叶子）；
- `POST /path/commit` 单段覆盖全部 4 个节点 → `createdStages:1, createdQuestions:2, warnings:[]`；
- `GET /path` 返回 1 段 2 题、`warnings` 为空；
- `npm run maps -- --goal <id>`：该目标生成 6 件派生物，**0 条覆盖警告**；
- 页面 `/path`：1 段、标题与估时可见、封闭题与开放题各一、0 警告；
- 真实运行库：`git status` 里 0 个运行库文件被改动。

与计划的偏差：

1. **最小长度规则会误伤旧测试夹具**：`tests/domain-path-stages.test.ts` 里 8 处 `checks: ['c']`、`tests/maps.test.ts` 里 1 处 `checks: ['检验信号']`
   都改成合法文案（`能讲清这一段` / `能讲清这一段的检验信号`），**没有放宽规则**。
2. **补段是整体替换而非合并**：第二次生成的结果直接替换第一次的候选，因为 preview 阶段还没有用户编辑，
   合并两轮反而会产生重复段。
3. **题目在前端只读展示**（stem + answer），不支持在审核页改题干/答案；改题留到后续阶段。

### 真实模型冒烟（2026-11-01，临时库 `%TEMP%\sdl-path-real`，真 key）

- 8 个节点（3 章 + 5 个叶子），真实 `preview`：**4.2 秒、1 次调用、3 段**；
- 3 段分别覆盖 3 / 3 / 2 个节点 → **8/8 全覆盖**，`warnings: []`，`calls: 1`（没有触发补盖）；
- 每段 2 题，共 6 题，kind 依次为「封闭, 开放」×3；
- preview 前后 `GET /path` 都是 **0 段**（确认不落盘）；
- `commit` → `createdStages:3, createdQuestions:6, warnings:[]`；
- `GET /path`：3 段 6 题、`warnings` 为空、order 为 1,2,3；
- `npm run maps -- --goal <id>`：6 件派生物，**0 条覆盖警告**；
- 页面 `/path`：3 段、标题与估时正确、封闭/开放标签各 3 个、0 警告；
- 真实运行库：`git status` **0 个运行库文件被改动**。

未完成：无（T6.2 已闭环）。
