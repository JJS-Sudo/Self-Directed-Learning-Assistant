# 阶段 1 · Hello Hono —— 需求

> 分支：`feat/phase-1-hello-hono`
> 上游：`specs/roadmap.md` 阶段 1；约束来自 `specs/mission.md` 与 `specs/tech-stack.md`
> 状态：**已定稿**（2026-10-31 访谈：Scope / Decisions / Context 三组）
> 本阶段只回答一个问题：**这条链路能不能跑通**——Vite/React 能在 3000 出现、`/api/health` 能说清库与模型状态、构建产物能由单进程服务。

---

## 1. 现状（实施前的事实）

| 项   | 事实                                                                    |
| ---- | ----------------------------------------------------------------------- |
| 仓库 | 有 `.git`，`main` 上一笔 `4e3993b first commit`；远端 `origin` 已配     |
| 页面 | `src/views/*` 手写 HTML 字符串；路由只有 `/`、`/resources`、`/healthz`  |
| 测试 | Vitest，README 自述 172 用例 / 23 文件；测试跑在临时库目录              |
| 构建 | `tsc -p tsconfig.build.json` → `dist/`（`rootDir: src`）                |
| 依赖 | **未安装**（无 `node_modules`）；`package-lock.json` 在                 |
| 缺失 | 无 `web/`、无 lint 配置、无 `.github/`、无 CI                           |
| 环境 | 本机 Node **v24.19.0**；`engines` 写 `>=22`；路径在 OneDrive 中文目录下 |

---

## 2. 范围

### 2.1 范围内（这一阶段要交付的）

| #   | 交付物                  | 说明                                                                                                                    |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| S1  | ESLint(flat) + Prettier | 含 `.prettierignore`（`dist/`、`自我导向学习项目运行库/`、`package-lock.json`）                                         |
| S2  | npm 脚本                | `typecheck`（根 + web 两份）、`lint`、`format`、`dev`、`dev:api`、`dev:web`、`build`、`build:api`、`build:web`、`start` |
| S3  | GitHub Actions          | `ubuntu-latest`，Node **22 与 24** 矩阵：`npm ci` → `typecheck` → `lint` → `test`                                       |
| S4  | `web/` 骨架             | Vite + React + TS；端口 3000，dev 代理 `/api` → API 端口                                                                |
| S5  | 共享类型                | `src/shared/health.ts`，**只导出类型**（`import type` 不产生运行时依赖）                                                |
| S6  | `GET /api/health`       | 返回 vault / index / model / version 四项状态；**永不 500**                                                             |
| S7  | Hello 页                | 一屏，展示 `vault`、`index`、`model` 三项状态；无路由                                                                   |
| S8  | 生产托管                | `dist/web` 由 Hono 托管，`/` 返回 SPA；`/api/*` 的 404 仍是 JSON                                                        |
| S9  | 证据                    | 截图、DevTools 网络面板、CI 运行链接，写进 PR 描述                                                                      |

### 2.2 范围外（本阶段明确不做，别提前偷做）

- 六区导航、客户端路由、设计令牌迁移、`src/views/*` 的废弃 —— **阶段 2**
- SQLite 索引、`npm run index`、索引与 Markdown 的一致性 —— **阶段 3**
- DeepSeek 调用、Tavily、任何生成/写入实体的能力 —— **阶段 4 起**
- Dockerfile / compose / `npx` 分发 —— **阶段 9**
- Playwright e2e —— **阶段 9**
- README / START-HERE / SOP 的正文改写 —— **阶段 2 与 9**；本阶段只在 PR 描述里记录启动命令变化
- 旧 `src/views` 首页的退休 —— **阶段 2**；本阶段保留，只在生产模式下让位给 SPA
- 把 `.dsh/` 技能目录纳入提交 —— 单独决定，不混进本 PR

### 2.3 与现有代码的关系

- **保留**：`/`、`/resources`、`/healthz`、JSON 404、`onError` 的现有行为；`createApp()` 的测试契约不变。
- **新增**：`/api/health`；`createApp()` 增加**可选** `webRoot` 注入，注入时才挂 SPA 静态与 `/` 兜底。
- **不动**：`src/domain/*`、`src/vault/*`、`src/maps/*`、`tests/*` 的既有断言（除非为新增路由补测）。

---

## 3. 决策（访谈已定）

| 编号 | 决策                                                            | 理由                                                       | 影响                                           |
| ---- | --------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| D1   | 本阶段**全做**：lint + Prettier + CI + web 骨架 + health        | 与 roadmap 的 bullet 一致；一次把「能跑 + 能检」立起来     | PR 偏大，但都是一个主题（骨架）                |
| D2   | Hello 页**一屏、无路由**                                        | 不偷跑阶段 2；这一版只为证明链路通                         | `web/src` 只有一个入口与一个组件               |
| D3   | `/api/health` 是**自检 JSON**，页面展示其中三项                 | 监控与页面共用一份真相                                     | 字段需稳定，见 §3.1                            |
| D4   | dev 拓扑：**Vite 代理 `/api`**，浏览器只认 3000                 | 无 CORS、HMR 正常、与「单进程产品」不冲突（仅 dev 双进程） | Vite 3000、API 3001                            |
| D5   | 生产：**Hono `serveStatic` + SPA fallback**                     | 一个进程就能跑，与 Docker 单容器一致                       | `dist/web` 是构建产物                          |
| D6   | **双 tsconfig + `src/shared/`**                                 | DOM 与 Node 的 lib 不互相污染；跨端契约只写一次            | `web/tsconfig.json` 独立；共享类型**只导类型** |
| D7   | Node **>=22**，CI 跑 22 与 24                                   | 保留「陌生人也得能跑」的兼容面                             | 不能用 `node:sqlite` 等 24 专属 API            |
| D8   | `/healthz` **保留为探针**（永远 200），`/api/health` 新增为自检 | 探针语义不该被库状态或配置影响；也不破坏现有测试与部署习惯 | 两个端点并存，文档需说明分工                   |
| D9   | 构建输出：API → `dist/`，前端 → `dist/web/`                     | 单目录部署，容器只需一个 COPY                              | `build` = `build:api && build:web`             |

### 3.1 `/api/health` 的字段（本期定稿）

```ts
export interface HealthReport {
  service: 'self-directed-learning'
  version: string // 读 package.json，读不到用 '0.0.0'
  vault: {
    ok: boolean // 存在 && 是目录 && 有 .sdl-vault
    marked: boolean
    name: string // 目录名，不是绝对路径（不泄露用户名）
    error?: string // 仅探测抛错时出现
  }
  index: {
    status: 'absent' | 'ok' | 'stale' // 阶段 1 恒为 'absent'
    note?: string
  }
  model: {
    configured: boolean // 只检查 DEEPSEEK_API_KEY 是否存在
    provider: 'deepseek'
    model: string // SDL_LLM_MODEL ?? 'deepseek-chat'
  }
}
```

- **永不 500**：库不可用时返回完整的 200，`vault.ok=false` 并带 `error`。理由见 mission R5（无 key/无库也要能降级运行）。
- **不回传绝对路径**：避免误公开时泄露 Windows 用户名与内部目录结构；绝对路径只进日志。

---

## 4. 上下文与约束

| 项         | 内容                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| 使命约束   | R1 数据归用户（本期不落任何数据）；R5 无 key 可降级；R6 写入不越库根（本期不写）              |
| 技术栈约束 | Hono 4 + `@hono/node-server`；TS strict + `noUncheckedIndexedAccess`；ESM（相对导入带 `.js`） |
| 端口       | dev：web 3000 / api 3001；prod：3000（`PORT` 可覆盖）                                         |
| 环境变量   | `DEEPSEEK_API_KEY`（只查存在）、`SDL_LLM_MODEL`（默认 `deepseek-chat`）、`PORT`               |
| 库路径     | `SDL_VAULT_PATH` > `.sdlrc.json` > `./vault`，现有逻辑不改                                    |
| 平台       | Windows（中文 + 空格路径、OneDrive）；脚本必须跨平台（不用 `PORT=x cmd` 这类 POSIX 写法）     |
| 网络       | 实施时需要联网安装依赖、更新 `package-lock.json`                                              |

---

## 5. 风险与缓解

| 风险                                           | 缓解                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 新增 ESLint/Prettier 后全库格式化产生巨型 diff | 先单独一个 `style:` 提交做全量格式化（无逻辑改动），再接功能提交                              |
| 现有代码违反新 lint 规则                       | 规则收敛到 0 error；确有必要降级规则的，在 PR 里逐条写理由                                    |
| `tsc` 与 `vite build` 互相覆盖 `dist/`         | API 先构建；`vite build` 的 `outDir` 固定 `dist/web`，`emptyOutDir` 只清自己                  |
| 生产模式 `/` 抢掉旧 SSR 首页、打挂测试         | `webRoot` 由 `createApp` 可选注入，`index.ts` 探测到 `dist/web/index.html` 才传；测试默认不传 |
| Windows 下并行脚本写法不通用                   | 用 `concurrently` + `cross-env`（两个 dev 依赖），不写 POSIX 内联变量                         |
| health 泄露路径                                | `vault.name` 只要目录名；绝对路径只写日志                                                     |
| CI 首次跑不通（lockfile 不同步 / 端口占用）    | 本地先 `npm ci` 验证一遍再推；测试不监听固定端口                                              |

---

## 6. 未决问题（本阶段不阻塞）

1. 旧 SSR 首页何时正式退休 —— 阶段 2 决定。
2. `.dsh/skills/changelog` 是否随仓库提交 —— 与本次功能无关，单独 PR。
3. 是否加 Windows CI job —— 等 `tech-stack.md` G15 的路径问题真的出现再谈。
