# 阶段 1 · Hello Hono —— 实施计划

> 配套：`requirements.md`（范围与决策）、`validation.md`（合并门禁）
> 顺序：T1 → T2 → T3 → T4 → T5 → T6 → T7。**T1 必须先落地**，否则后面每一步都没有自动门禁。
> 分支：`feat/phase-1-hello-hono`，一个 PR 收口。

## 先决条件

1. `npm install`（联网），并把更新后的 `package-lock.json` 一起提交。
2. 本地跑通一次 `npm run typecheck && npm test`，确认改动前基线是绿的（172 用例）。

---

## T1 · 工程门禁（lint / format / CI）

**目标**：让仓库从「靠自觉」变成「靠 CI 拦」。

| #    | 任务                                                                                                                                       | 落点                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| T1.1 | 加 dev 依赖：`eslint`、`@eslint/js`、`typescript-eslint`、`globals`、`prettier`、`concurrently`、`cross-env`                               | `package.json`                        |
| T1.2 | Flat 配置：`js.configs.recommended` + `tseslint.configs.recommended`；ignore `dist/`、`node_modules/`、`自我导向学习项目运行库/`、`seeds/` | `eslint.config.js`                    |
| T1.3 | Prettier：单引号、无分号（与现有代码风格一致）、宽 100；ignore 同上加 `package-lock.json`                                                  | `.prettierrc.json`、`.prettierignore` |
| T1.4 | 全量格式化一次，**单独一个 `style:` 提交，无逻辑改动**                                                                                     | 仓库内 `.ts` / `.md`                  |
| T1.5 | 脚本：`typecheck`（根 tsconfig）、`lint`（eslint + prettier --check）、`format`                                                            | `package.json`                        |
| T1.6 | CI：`ubuntu-latest` × Node `[22, 24]`，`npm ci` → `typecheck` → `lint` → `test`                                                            | `.github/workflows/ci.yml`            |

**完成判据**

- 本地 `npm run typecheck`、`npm run lint`、`npm test` 三条全绿，且 `lint` 的 error 数为 **0**（降级过的规则在 PR 里逐条写理由）。
- push 后 GitHub Actions 两个 Node 版本都绿，链接留档。

---

## T2 · 共享契约

**目标**：health 的响应形状只写一次，前后端各自引用。

| #    | 任务                                                                                  | 落点                                 |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| T2.1 | 定义 `HealthReport`（字段见 `requirements.md` §3.1），**只导类型**，不导运行时常量    | `src/shared/health.ts`               |
| T2.2 | 根 `tsconfig.json` 的 `include` 加 `src`（已包含，确认即可）；web 侧用 `paths` 指向它 | `tsconfig.json`、`web/tsconfig.json` |

**完成判据**：`npm run typecheck` 通过；`web/` 里能写 `import type { HealthReport } from '@shared/health'` 且不产生运行时 import。

---

## T3 · `GET /api/health`

**目标**：一个永远 200、能被页面直接读、不泄露绝对路径的自检端点。

| #    | 任务                                                                                                                                      | 落点                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| T3.1 | `buildHealthReport(root, env)` 纯函数：读 `version`（`package.json`，失败回落 `0.0.0`）、`inspectVault` 结果、`index: 'absent'`、模型配置 | `src/api/health.ts`        |
| T3.2 | 注册 `GET /api/health`，复用 `resolveRoot()`；任何异常都折成 `vault.ok=false` + `error`，**不抛 500**                                     | `src/app.ts`               |
| T3.3 | 测试：库正常 / 库不存在 / 缺 `.sdl-vault` / 有 `DEEPSEEK_API_KEY` / 无 key / 响应里不含绝对路径                                           | `tests/api-health.test.ts` |

**完成判据**

- 新用例 ≥ 6 条，全绿；既有用例一条不改也不挂。
- 手工：`curl localhost:3001/api/health` 在「库正常」与「库被删」两种情况下都返回 200。

---

## T4 · `web/` 骨架

**目标**：一个人能在 3000 看见 React 渲染的页，同时 API 仍在 3001。

| #    | 任务                                                                                                                                                | 落点                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| T4.1 | Vite 配置：`root: 'web'`、`server.port 3000`、`strictPort`、代理 `/api` → `http://127.0.0.1:3001`、`build.outDir '../dist/web'`、`emptyOutDir true` | `vite.config.ts`    |
| T4.2 | web 的 tsconfig：`DOM` lib、`react-jsx`、`moduleResolution: bundler`、`types: ["vite/client"]`、`paths: {"@shared/*": ["../src/shared/*"]}`         | `web/tsconfig.json` |
| T4.3 | 入口三件套：`index.html`、`main.tsx`、`App.tsx`；样式走 `web/src/styles.css`（沿用现有亮暗主题与单强调色，**不做设计令牌工程**）                    | `web/`              |
| T4.4 | 根 `typecheck` 追加 `tsc -p web/tsconfig.json`；`dev` = `concurrently` 起 `dev:api`（`cross-env PORT=3001 tsx watch`）与 `dev:web`（`vite`）        | `package.json`      |

**完成判据**：`npm run dev` 打开 `http://localhost:3000` 看到 Hello 页；改 `App.tsx` 触发热更新；`npm run typecheck` 同时检查两份 tsconfig。

---

## T5 · Hello 页接上 health

**目标**：页面自己证明「后端活着、库在哪、模型配没配」。

| #    | 任务                                                                                                                             | 落点              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| T5.1 | `useEffect` 拉 `/api/health`，三态：`loading` / `ok` / `error`                                                                   | `web/src/App.tsx` |
| T5.2 | 展示三项：`vault`（ok/未就绪 + 目录名）、`index`（阶段 1 显示「未建立」）、`model`（已配置 / 未配置 + 模型名）；`version` 放页脚 | 同上              |
| T5.3 | 失败态：写明「API 未响应（:3001）」并提供重试按钮，**不白屏、不吞错**                                                            | 同上              |
| T5.4 | 零第三方请求：不引外部字体 / CDN / 分析脚本                                                                                      | 全局              |

**完成判据**：三项状态与实际一致（删库 → vault 变红；加 `DEEPSEEK_API_KEY` → model 变绿）；停掉 API 进程后页面显示失败态并可重试。

---

## T6 · 生产托管与构建

**目标**：`npm run build && npm start` 一个进程就能服务页面与 API。

| #    | 任务                                                                                                                                | 落点                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| T6.1 | `createApp({ webRoot? })`：传入时挂 `serveStatic` 与 SPA 兜底（非 `/api/*` 的 GET 回 `index.html`）；`/api/*` 未知路径仍是 JSON 404 | `src/app.ts`               |
| T6.2 | `index.ts` 启动时探测 `dist/web/index.html`，存在才传 `webRoot`（dev 与测试不受影响）                                               | `src/index.ts`             |
| T6.3 | 测试：注入 `webRoot` 时 `/` 返回 index.html 内容；`/api/nope` 仍是 404 JSON；不注入时 `/` 行为不变                                  | `tests/app-static.test.ts` |
| T6.4 | 脚本：`build` = `build:api`（tsc）→ `build:web`（vite build）；`start` = `node dist/index.js`                                       | `package.json`             |

**完成判据**：清空 `dist/` 后 `npm run build` 成功；`npm start` 打开 3000 页面正常、`/api/health` 正常；`dist/` 里同时有 API 的 `.js` 与 `web/`。

---

## T7 · 证据与收尾

| #    | 任务                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------- |
| T7.1 | 截图三张：Hello 正常态、删库后的失败态、DevTools 网络面板（过滤第三方域名为空）                         |
| T7.2 | 记录 CI 运行链接（Node 22 与 24 两个 job）                                                              |
| T7.3 | PR 描述按 `validation.md` 的门禁逐条勾选，并写明启动命令变化（`npm run dev` 仍是 3000，但 API 在 3001） |
| T7.4 | push 分支，确认远端 CI 绿后请求评审                                                                     |

**完成判据**：`validation.md` 的五条合并门禁全部有证据，PR 描述里能点开。

---

## 提交切分（建议）

| #   | 提交                                      | 内容                            |
| --- | ----------------------------------------- | ------------------------------- |
| 1   | `chore(tooling): eslint + prettier + ci`  | T1.1–T1.3、T1.5、T1.6           |
| 2   | `style: prettier 全量格式化`              | T1.4（无逻辑改动，便于 review） |
| 3   | `feat(api): /api/health 与共享类型`       | T2、T3                          |
| 4   | `feat(web): vite + react 骨架与 Hello 页` | T4、T5                          |
| 5   | `feat(server): 托管 dist/web 与构建脚本`  | T6                              |
| 6   | `docs(spec): 阶段 1 规格`                 | 本目录三份文件                  |

> 拆分目的：把「格式化噪音」与「真实改动」隔开，评审时第 2 笔可整笔跳过。

---

## 实施记录（2026-10-31，与计划的偏差）

T1–T7 **全部完成**；`main` 已快进合入本阶段，落地页文档同步改写。

| 偏差                                    | 原因                                                                                                                                                                                  | 处置                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Vite 8 → Vite 7（+ plugin-react 5）** | Vite 8 的 rolldown 配置加载器在本机（中文 + OneDrive 路径）报 `UNRESOLVED_ENTRY: Cannot resolve entry module vitest.config.ts`，`vitest` 无法启动；同一条链在 Vite 7（esbuild）下正常 | 锁 `vite@^7.3.7`、`@vitejs/plugin-react@^5`；172 个既有用例全绿                                |
| **concurrently → `scripts/dev.mjs`**    | `concurrently` 在这台 Windows 上启动第二个子进程时静默失败（`[api]` 无任何输出、3001 不监听），换直接命令也复现                                                                       | 自写零依赖编排脚本（spawn + `taskkill /t`），移除 `concurrently`；`cross-env` 保留给 `dev:api` |
| **ESLint 首跑 3 个 error**              | 既有代码里 3 处未使用的导入/变量（`path-stages.ts`、`retrospectives.ts`、`canvas.ts`）                                                                                                | 直接删除，未降级规则                                                                           |
| **prettier 全库格式化**                 | 新规则与既有风格一致（单引号、无分号、100 列），但换行与表格对齐仍是巨量 diff                                                                                                         | 单独 `style:` 提交                                                                             |
| **端口**                                | dev：Vite 3000（浏览器）/ API 3001；prod：Hono 3000                                                                                                                                   | 与 `requirements.md` 一致，未变                                                                |

验收实测：

- `npm run typecheck`、`npm run lint`、`npm test`（**25 文件 / 186 用例**）全绿；
- `npm run build` → `dist/`（API）+ `dist/web/`（页面）；
- `npm start`（PORT=3100 验证）：`/` 返回 SPA、`/api/health` 200、`/api/*` 未知路径 JSON 404、`/assets/*` 可取；
- `npm run dev`：3000 页面渲染三项状态（库已就绪 / 索引未建立 / 模型未配置），`/api/health` 经代理 200，网络面板仅 `localhost:3000`。

**门禁闭合（2026-10-31）**

- **G2 · CI 实跑**：`feat/phase-1-hello-hono` 对应 run `41175424469`，`feat/phase-2-basic-layout` 对应 run `41175428373`；
  两个 run 的 **Node 22 与 Node 24 四个 job 全部 `success`**。
- **V7 · 门禁会变红**：临时分支 `ci-red-check` 故意写入 `export const RED_CHECK: number = '...'`，
  run 结论 `failure`，两个 job 都红在 `Run npm run typecheck`；验证后分支已删除（含远端）。
- **合入**：`main` 以 fast-forward 合入本阶段（`4e3993b..952569d`），随后追加一笔 `docs:` 提交
  改写 `README.md` / `START-HERE.md` / `SOP.md` 中被取代的旧边界（「不联网、不调用大模型、网页只有两条入口」）。
