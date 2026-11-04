# 阶段 2 · 基础布局 —— 实施计划

> 配套：`requirements.md`（范围与决策）、`validation.md`（合并门禁）
> 顺序：T1 → T2 → T3 → T4 → T5。T1 先打通路由，后面每一步都能「当场点开看」。
> 分支：`feat/phase-2-basic-layout`（基于 `feat/phase-1-hello-hono`），PR 的 base 也指向 phase-1 分支。

## 先决条件

1. `npm install react-router-dom`（联网），lock 一起提交。
2. 阶段 1 的本地门禁仍绿（`typecheck` / `lint` / `test` 186 用例）。

---

## T1 · 路由与外壳

| #    | 任务                                                                                    | 落点                              |
| ---- | --------------------------------------------------------------------------------------- | --------------------------------- |
| T1.1 | 装 `react-router-dom`；`main.tsx` 包 `BrowserRouter`                                    | `web/src/main.tsx`                |
| T1.2 | `AppLayout`：顶部 `header`（产品名 + 导航）+ `<Outlet/>` + `footer`（版本、数据在本机） | `web/src/layout/AppLayout.tsx`    |
| T1.3 | 路由表：`/`、`/map`、`/path`、`/resources`、`/assess`、`/retro`、`*`                    | `web/src/routes.tsx` 或 `App.tsx` |
| T1.4 | 导航用 `NavLink`：当前项 `aria-current="page"` + 高亮，键盘 Tab 可达                    | `web/src/layout/AppLayout.tsx`    |
| T1.5 | 404 页：「没有这个区」+ 回到目标的链接                                                  | `web/src/pages/NotFound.tsx`      |

**完成判据**：六个地址直接输入都能打开对应区并高亮导航；随便输入 `/nope` 显示 404 页；浏览器后退/前进正常。

---

## T2 · 设计令牌与样式

| #    | 任务                                                               | 落点                        |
| ---- | ------------------------------------------------------------------ | --------------------------- |
| T2.1 | 从现有 `styles.css` 抽出变量：颜色、间距、字号、圆角、行高         | `web/src/styles/tokens.css` |
| T2.2 | 基础层：`body` 版式、`header/nav/footer`、`.page` 容器、焦点环     | `web/src/styles/base.css`   |
| T2.3 | 导航样式：横排、`nowrap`、`overflow-x: auto`、当前项下划线与强调色 | `web/src/styles/base.css`   |
| T2.4 | 删掉 `web/src/styles.css`，`main.tsx` 改为引入 tokens → base       | `web/src/main.tsx`          |

**完成判据**：`grep -n "#[0-9a-fA-F]\{6\}" web/src` 只在 `tokens.css` 命中；亮/暗主题跟系统切换正常；375px 下导航单行可横向滚动、页面无横向溢出。

---

## T3 · 六区空状态

| #    | 任务                                                                                                   | 落点                                                               |
| ---- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| T3.1 | `EmptyState` 组件：标题、定位句、`upcoming: string[]`（这一区会出现什么）、主行动（可禁用 + 阶段标签） | `web/src/components/EmptyState.tsx`                                |
| T3.2 | `HealthCard` 从阶段 1 的 `App.tsx` 拆出，落到目标页                                                    | `web/src/components/HealthCard.tsx`、`web/src/pages/GoalsPage.tsx` |
| T3.3 | 五个空状态页 + 文案（见 `requirements.md` §3.1 与下表），主行动禁用并标「阶段 N 开放」                 | `web/src/pages/*.tsx`                                              |
| T3.4 | 文案统一：定位句一句话，不用「敬请期待」这类空话，写清这一区**将来负责什么**                           | 同上                                                               |

文案基线：

| 区   | 定位句                                                       | 会出现什么                     |
| ---- | ------------------------------------------------------------ | ------------------------------ |
| 目标 | 每个目标是一份学习契约：一句可判定的话 + 一个期限。          | 目标列表、成功判据、剩余天数   |
| 地图 | 把目标拆成一张有层级、有横向关联的网。                       | 知识节点、四类枝干、掌握度     |
| 路径 | 按「一次坐下来能量完」为单位排序，每段都有可判定的检验信号。 | 学习段、估时、检验信号         |
| 资源 | 只收录真实存在的链接，按你的画像排序，并说明理由。           | 资源卡、三因子理由、跳转       |
| 验收 | 用费曼复述与做题来判断「真的会了」，而不是「看过了」。       | 题目、作答记录、正确率         |
| 复盘 | 哪有效、哪没用、下一步改哪一段。                             | 复盘结论、调整事件、掌握度回写 |

**完成判据**：六个区标题与定位句都在；目标区能看到 health 三项；其它五区各有一个禁用按钮与阶段标签；页面上没有任何「假数据」。

---

## T4 · 服务端让位 `/resources`

| #    | 任务                                                                                           | 落点                       |
| ---- | ---------------------------------------------------------------------------------------------- | -------------------------- |
| T4.1 | `/resources` 处理器：`indexHtml !== null` 时返回 SPA，否则维持旧 SSR                           | `src/app.ts`               |
| T4.2 | 测试：注入 `webRoot` 时 `/resources` 返回 index.html；不注入时仍返回旧页（既有用例已覆盖后者） | `tests/app-static.test.ts` |
| T4.3 | 生产构建手工验证：`npm run build && npm start`，`/resources` 刷新进 SPA 而不再跳旧页           | 手工                       |

**完成判据**：`tests/app-static.test.ts` 新增 1 条并通过；旧 `resources-page.test.ts` 不改仍绿；生产模式下 `/resources` 返回构建后的 index.html。

---

## T5 · 验收与证据

| #    | 任务                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| T5.1 | 手工矩阵：六个区 + 404 + `/resources` 刷新，各一张截图（或一张拼图）           |
| T5.2 | 375px 视口截图：导航单行、无横向溢出                                           |
| T5.3 | 键盘走查：Tab 遍历六个导航项，焦点可见，`aria-current` 正确                    |
| T5.4 | DevTools 网络面板：仍然只有 `localhost:3000`（无第三方字体/脚本）              |
| T5.5 | 回归：`npm run typecheck`、`npm run lint`、`npm test`（≥187）、`npm run build` |

**完成判据**：`validation.md` 的五条门禁逐条有证据；PR 描述里贴得上。

---

## 提交切分（建议）

| #   | 提交                                           | 内容           |
| --- | ---------------------------------------------- | -------------- |
| 1   | `feat(web): 路由与顶部导航`                    | T1             |
| 2   | `style(web): 拆出设计令牌与基础层`             | T2             |
| 3   | `feat(web): 六区空状态与 health 卡片`          | T3             |
| 4   | `feat(server): 生产模式下 /resources 交给 SPA` | T4             |
| 5   | `docs(spec): 阶段 2 规格`                      | 本目录三份文件 |

> T2 单独成笔的理由同阶段 1：样式拆分会产生大量行级 diff，与路由逻辑混在一起无法评审。

---

## 实施记录（2026-10-31）

T1–T5 全部完成；合并为两笔代码提交（web / server）+ 本规格记录。

| 项     | 结果                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 路由   | `/`、`/map`、`/path`、`/resources`、`/assess`、`/retro`、`*`，基于 React Router 7.18 的 `BrowserRouter` |
| 外壳   | `AppLayout`：顶部横排导航（`NavLink` 自带 `aria-current`）+ `<Outlet/>` + 页脚                          |
| 空状态 | `EmptyState`（标题 / 定位句 / 会出现什么 / 禁用主行动 + 阶段标签）；目标区挂 `HealthCard`               |
| 样式   | `tokens.css`（唯一允许字面颜色值的地方）+ `base.css`；删除单文件 `styles.css`                           |
| 服务端 | `/resources` 在注入 `webRoot` 时返回 SPA，否则维持旧页                                                  |
| 测试   | **187 用例 / 25 文件**（新增 1 条 `/resources` 的 SPA 断言）                                            |

实测证据：

- 六区直接输入地址均 200，导航高亮正确；`/retro` 深链刷新仍在复盘区；
- `/nope` 显示「没有这个区」+「回到目标」，HTTP **200**；`/api/nope` 仍是 JSON **404**；
- 生产（`npm run build && npm start`，3100）：`/`、`/resources`、`/retro`、`/nope` 都返回 413 字节的 SPA 外壳；
- 移除 `dist/web` 后重启：`/` 退回 6432 字节的旧目标页、`/resources` 退回 42350 字节的旧资源页 —— 降级路径完好；
- 375px（同源 iframe 模拟）：`scrollWidth == clientWidth == 358`，无横向溢出；导航高度 33px、行高 28px，**单行**（内容 318px 恰好放得下，`overflow-x: auto` 作为更窄时的兜底）；
- 资源域名只有 `localhost:3000`；页面上没有任何示例数据。

偏差：无（未改路由表与文案基线）。新增运行时依赖：`react-router-dom@7.18.5`（构建产物 gzip 从 70.5KB 增至 85.4KB）。
