# 阶段 9 · 一键跑起来 —— 实施计划

> 配套：`requirements.md`、`validation.md`
> 顺序：T1 启动闸门 → T2 鉴权 → T3 接线 → T4 容器 → T5 bin → T6 CI/E2E → T7 验收。
> 分支：`feat/phase-9-one-click`（从 `main` f45849f 切出）。

---

## T1 · 启动闸门（纯函数）

| #    | 任务                                                                                            | 落点                       |
| ---- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| T1.1 | `resolveHost(env)`：`HOST` 默认 `127.0.0.1`；识别本地地址集合；`0.0.0.0` 无 token → `{ error }` | `src/server/host-guard.ts` |
| T1.2 | 错误信息含「怎么设 token」的可复制命令                                                          | 同上                       |
| T1.3 | 测试：默认、`127.0.0.1`、`localhost`、`0.0.0.0` 有无 token、`::`                                | `tests/host-guard.test.ts` |

**完成判据**：判定逻辑不依赖 `serve`，可单测。

---

## T2 · 鉴权与登录页

| #    | 任务                                                                                                                           | 落点                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| T2.1 | `expectedCookie(token, secret?)`：`sha256(token + secret)`；`isAuthorized(cookie, bearer, token)` 常量时间比较                 | `src/server/auth.ts` |
| T2.2 | 中间件：免验白名单（`/login`、`POST /login`、`/healthz`、`/api/health`、`/favicon.ico`）；页面 302 `/login`；`/api/*` 401 JSON | 同上                 |
| T2.3 | `GET /login` 极简 HTML；`POST /login` 表单换 cookie；`POST /logout` 清理                                                       | 同上                 |
| T2.4 | 测试：未登录 302 / API 401 / 错误 token 401 / 正确 cookie 放行 / Bearer 放行 / 白名单免验                                      | `tests/auth.test.ts` |

**完成判据**：没有 cookie 也能访问 `/healthz`；其余路径被挡。

---

## T3 · 接到启动入口

| #    | 任务                                                                                            | 落点                     |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| T3.1 | `src/index.ts`：读 `resolveHost`，有 error → `console.error` + `process.exitCode = 1` 并 return | `src/index.ts`           |
| T3.2 | `serve({ fetch, port, hostname })`；启动日志打印实际绑定地址                                    | 同上                     |
| T3.3 | `createApp` 增加 `accessToken` 选项，注入中间件                                                 | `src/app.ts`             |
| T3.4 | 测试：`createApp({ accessToken })` 的鉴权行为（用 app.request 覆盖 T2 的场景）                  | `tests/app-auth.test.ts` |

**完成判据**：本地默认不拦；设 token 后必须登录；对外监听无 token 直接退出。

---

## T4 · 容器

| #    | 任务                                                                                                            | 落点            |
| ---- | --------------------------------------------------------------------------------------------------------------- | --------------- |
| T4.1 | 多阶段 Dockerfile：builder 装依赖、构建；runner 只带 `dist` + 生产依赖 + `seeds` + `package.json`；非 root 用户 | `Dockerfile`    |
| T4.2 | `ENV HOST=127.0.0.1 PORT=3000 SDL_VAULT_PATH=/data/vault`；`VOLUME /data`                                       | 同上            |
| T4.3 | `.dockerignore` 排除 `node_modules` / `dist` / `tmp` / `.git` / 真实运行库                                      | `.dockerignore` |
| T4.4 | `compose.yml`：`127.0.0.1:3000:3000`、命名卷 `sdl-data:/data`、`env_file: .env`（可选）                         | `compose.yml`   |
| T4.5 | `.env.example` 覆盖全部变量、不含真实 key                                                                       | `.env.example`  |

**完成判据**：镜像默认只绑本地；`/data` 挂卷后重建容器数据还在。

---

## T5 · `bin` 入口

| #    | 任务                                                                                                                 | 落点                     |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| T5.1 | `parseArgs(argv)`：默认 `start`；`start` / `--help` / `--version`；未知子命令 → 用法 + exit 1                        | `src/cli/args.ts`        |
| T5.2 | `bin/sdl.mjs`：shebang；`start` 时设默认 env 并 `import('../dist/index.js')`；无 `dist` 时给「先 npm run build」指引 | `bin/sdl.mjs`            |
| T5.3 | `package.json` 增加 `"bin": { "sdl": "bin/sdl.mjs" }`                                                                | `package.json`           |
| T5.4 | 测试：`parseArgs` 的默认/显式/未知/帮助                                                                              | `tests/cli-args.test.ts` |

**完成判据**：`node bin/sdl.mjs` 与 `node bin/sdl.mjs start` 行为一致；未知子命令非零退出。

---

## T6 · CI：Playwright + docker build

| #    | 任务                                                                                    | 落点                       |
| ---- | --------------------------------------------------------------------------------------- | -------------------------- |
| T6.1 | Playwright 配置：`webServer` 用临时库启动生产构建（端口 3111），不碰真实库              | `playwright.config.ts`     |
| T6.2 | 主路径用例：API 播种目标/节点/路径/题目 → 页面依次检查 地图 / 路径 / 验收（交卷）/ 复盘 | `e2e/main.spec.ts`         |
| T6.3 | CI 新增 `e2e` job：`playwright install --with-deps chromium` → `npm run e2e`            | `.github/workflows/ci.yml` |
| T6.4 | CI 新增 `docker` job：`docker build -t sdl:ci .`（带缓存）                              | 同上                       |
| T6.5 | `npm run e2e` 脚本                                                                      | `package.json`             |

**完成判据**：CI 五项全绿（typecheck / lint / test / e2e / docker）。

---

## T7 · 验收

| #    | 任务                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| T7.1 | `typecheck` / `lint` / `test` / `build` / `e2e` 本地全绿（Playwright 需要 Chromium） |
| T7.2 | 本机 `docker build`（若本机有 Docker；没有则只靠 CI）                                |
| T7.3 | 临时库 + `npm run build` + `npx sdl start` 冒烟：登录页 → 令牌 → 六区可点            |
| T7.4 | 真实运行库零改动；构建上下文不含真实库                                               |
| T7.5 | 记录证据                                                                             |

---

## 提交切分（建议）

| #   | 提交                                     | 内容   |
| --- | ---------------------------------------- | ------ |
| 1   | `feat(server): 监听闸门与令牌登录`       | T1–T3  |
| 2   | `feat(docker): 多阶段镜像与 compose`     | T4     |
| 3   | `feat(cli): sdl start 入口`              | T5     |
| 4   | `test(e2e): Playwright 主路径与 CI 门禁` | T6     |
| 5   | `docs(spec): 阶段 9 规格与验收记录`      | 本目录 |

---

## 实施记录（2026-11-01）

T1–T3、T5、T6 完成；T4 的**本地** `docker build` / compose 受环境限制（Docker Desktop 守护进程未启动），
构建与运行由 CI 的 `docker` job 验证。用例从 381 增至 **404**。

| 项       | 结果                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 启动闸门 | `HOST=0.0.0.0` 无 token → 退出码 **1**，日志给出 `set SDL_ACCESS_TOKEN=...` 指引                                                       |
| 登录     | 未登录 `/` → 302 `/login`；`/api/goals` → 401；错误令牌 401；正确令牌写 `sdl_auth`（64 位 hex，`HttpOnly`）；cookie 或 Bearer 均可放行 |
| 白名单   | `/healthz`、`/api/health`、`/login` 免验                                                                                               |
| bin      | `--help` 退出 0、`--version` 输出 1.0.0、`nope` 退出 1、默认 start                                                                     |
| E2E      | 本地 Playwright Chromium：主路径 **4.4 秒通过**（建目标 → 地图 → 路径 → 验收交卷 → 复盘）                                              |
| 浏览器   | 登录页输入 `test-token` → 进入目标页，六区可用                                                                                         |
| Docker   | 本机 Docker CLI 29.8 存在，但守护进程未起（Docker Desktop 启动超时），`docker build` 未在本地执行                                      |

与计划的偏差：

1. **Bearer 直接收原文 token**：cookie 里存派生值（`sha256(secret:token)`），但 `Authorization: Bearer <token>`
   收原文，方便 curl 与脚本；两条路径都走常量时间比较。
2. **登录只在设了 `SDL_ACCESS_TOKEN` 时启用**：本地不设 token 时完全保持旧行为（404 而不是登录页），
   所以 `/login` 路由也只在有 token 时注册。
3. **`docker build` 与 compose 持久化未在本地验证**：Docker Desktop 守护进程没起来；CI 的 `docker job`
   会真实构建，但「重启容器后数据还在」这条门禁需要一台能跑 Docker 的机器补验。

未完成：`docker compose` 的本地持久化验证（Docker Desktop 守护进程未启动，环境限制）；
CI 的 `Docker build` job 已成功，说明镜像本身能构建。

### CI 结果（2026-11-01）

```
run 41281452740：success
  Node 22          success
  Node 24          success
  E2E（Playwright）success
  Docker build     success
```

E2E 与 Docker 两个新门禁都已在 CI 上真实跑通。

### 本地 Docker 打通（2026-11-01 补验）

Docker Desktop 起来后，本地构建与 compose 全部跑通，过程中修了三个真问题：

1. **`# syntax=docker/dockerfile:1` 让 BuildKit 去 `auth.docker.io` 拉前端镜像**，
   本机 IPv6 出口连不通，构建直接失败；这行并非必需，已删除。
2. **容器里 `HOST=127.0.0.1` 导致端口映射打不进来**（容器内自测通、宿主 000）：
   compose 改为容器内 `HOST=0.0.0.0` + `SDL_BEHIND_PROXY=1`，对外暴露仍由
   `127.0.0.1:3000:3000` 限制；启动闸门新增该变量（无 token 也允许，仅限显式声明）。
3. **`/data/vault` 首次启动没有 `.sdl-vault` 标记**，应用拒绝写入：
   新增 `docker/entrypoint.sh`，空卷时用 `seeds/` 初始化并写标记。

还有一个环境坑：compose 用中文目录名推导项目名会报 `project name must not be empty`，
已在 `compose.yml` 显式写 `name: sdl`。

实测：

| 项                  | 结果                                                                       |
| ------------------- | -------------------------------------------------------------------------- |
| `docker build`      | 成功（node:22-slim 多阶段，约 2 分钟）                                     |
| `docker compose up` | 容器 `sdl-app-1` 起来，日志显示「首次启动：已用 seeds 初始化 /data/vault」 |
| 宿主访问            | `http://127.0.0.1:3000/healthz` → **200**，浏览器打开是目标页（7 区）      |
| 非 root             | `docker exec sdl-app-1 id` → `uid=1000(node)`                              |
| 持久化              | 建目标后 `restart` → 目标还在；`down` + `up` → 目标还在（3 个目标）        |
| 端口                | `docker compose ps` 显示 `127.0.0.1:3000->3000/tcp`                        |

未完成：无。
