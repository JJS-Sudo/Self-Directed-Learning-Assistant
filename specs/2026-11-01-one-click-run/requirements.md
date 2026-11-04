# 阶段 9 · 一键跑起来 —— 需求

> 分支：`feat/phase-9-one-click`（从 `main` f45849f 切出）
> 上游：`specs/roadmap.md` 阶段 9；约束来自 `specs/mission.md`、`specs/tech-stack.md`
> 状态：**已定稿**（2026-11-01 访谈：Scope / Decisions / Context，九问）
> 本阶段回答：**一个从没装过 Node 的人，能不能在 5 分钟内打开浏览器用起来，而且不把库裸奔在公网。**

---

## 1. 现状

| 项     | 事实                                                                                    |
| ------ | --------------------------------------------------------------------------------------- |
| 启动   | `node dist/index.js`；`PORT` 可配，**监听地址固定为默认（所有接口）**，没有 `HOST` 概念 |
| 鉴权   | **没有**任何访问控制；`SDL_VAULT_PATH` 决定库目录                                       |
| 分发   | 只有 `npm start` / `npm run dev`；没有 `bin` 入口，没有 `.env.example`                  |
| 容器   | 没有 Dockerfile / compose                                                               |
| CI     | 三个检查：`typecheck` / `lint` / `test`（Node 22/24 矩阵）                              |
| 前端   | 已构建到 `dist/web`，由 Hono 托管；六区页面齐全                                         |
| 已知坑 | better-sqlite3 是原生模块；Windows 上构建受 OneDrive 影响（与容器无关）                 |

---

## 2. 范围

### 2.1 范围内

| #   | 交付物             | 说明                                                                                            |
| --- | ------------------ | ----------------------------------------------------------------------------------------------- |
| S1  | 监听地址与安全闸门 | 默认只绑 `127.0.0.1`；`HOST=0.0.0.0` 且无 `SDL_ACCESS_TOKEN` → **拒绝启动**（退出码 1）         |
| S2  | 令牌登录           | 未认证访问任意页面 → 登录页；提交令牌正确 → 写 httpOnly cookie；之后放行                        |
| S3  | 多阶段 Dockerfile  | `node:22-slim` 构建 + 运行；`/data` 卷；默认 `HOST=127.0.0.1`                                   |
| S4  | `compose.yml`      | 端口映射 `127.0.0.1:3000:3000`，命名卷 `sdl-data:/data`，支持 `.env`                            |
| S5  | npm `bin` 入口     | `sdl start`（默认子命令）；找不到构建产物时给明确指引                                           |
| S6  | `.env.example`     | `DEEPSEEK_API_KEY` / `TAVILY_API_KEY` / `SDL_VAULT_PATH` / `PORT` / `HOST` / `SDL_ACCESS_TOKEN` |
| S7  | CI 新增两门        | Playwright 主路径（Chromium）+ `docker build`                                                   |

### 2.2 范围外

- 多用户账号、密码体系（单令牌足够）
- HTTPS 终结（交给反代；文档写明）
- Kubernetes / Helm
- 自动升级、备份策略
- 移动端

---

## 3. 决策

| 编号 | 决策                                                                 | 理由                                | 影响                                             |
| ---- | -------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| D1   | 全做：容器 + bin + 两个 CI 门禁                                      | 与 roadmap 的「一键跑起来」一致     | PR 较大                                          |
| D2   | 默认绑定 `127.0.0.1`；`HOST=0.0.0.0` 无 token → **exit 1**           | 防止把学习库裸奔到公网              | 启动逻辑要显式校验                               |
| D3   | 访问令牌用**登录页换 httpOnly cookie**                               | 浏览器可用；比 URL 带 token 安全    | 新增 `GET /login`、`POST /login`、`POST /logout` |
| D4   | 令牌比较 **常量时间**，cookie 存 `sha256(token)` 而不是原文          | 降低时序侧信道与泄露面              | 纯函数可测                                       |
| D5   | `/healthz` 与 `GET /api/health` **免验**；其余全部要验               | 探针与运维自检不能因登录失败告警    | 中间件白名单                                     |
| D6   | 单卷 `/data`：库在 `/data/vault`，索引/导出也在 `/data`              | 搬一个卷就搬走全部数据              | `SDL_VAULT_PATH=/data/vault`                     |
| D7   | `bin` 入口 `sdl start`；默认子命令 `start`；未知子命令 exit 1        | 以后可加 `sdl backup` 等            | `package.json` 的 `bin`                          |
| D8   | 镜像 `node:22-slim` 多阶段，运行镜像只带 `dist` + 生产依赖 + `seeds` | glibc 与 better-sqlite3 预编译兼容  | Dockerfile 有 builder / runner 两段              |
| D9   | CI 装 Chromium（`playwright install --with-deps chromium`）          | 版本可控，不依赖 runner 自带 Chrome | CI 加一个 job                                    |

### 3.1 环境变量契约

| 变量                                  | 默认                      | 说明                                            |
| ------------------------------------- | ------------------------- | ----------------------------------------------- |
| `HOST`                                | `127.0.0.1`               | 监听地址；`0.0.0.0` 时必须有 `SDL_ACCESS_TOKEN` |
| `PORT`                                | `3000`                    | 端口                                            |
| `SDL_VAULT_PATH`                      | `./vault`（沿用现有解析） | 容器里设 `/data/vault`                          |
| `SDL_ACCESS_TOKEN`                    | 空                        | 为空且非本地监听 → 拒绝启动；非空则启用登录     |
| `DEEPSEEK_API_KEY` / `TAVILY_API_KEY` | 空                        | 与之前一致，仅影响生成/检索功能                 |
| `SDL_SESSION_SECRET`                  | 由 token 派生             | 可选，覆盖 cookie 值算法用的盐                  |

### 3.2 鉴权契约

```ts
// GET /login            → 200 登录页（HTML，无 JS 依赖）
// POST /login  form     → 令牌正确：302 + Set-Cookie: sdl_auth=<sha256>; HttpOnly; SameSite=Lax; Path=/
//                         令牌错误：401 + 登录页错误提示
// POST /logout          → 清 cookie，302 回 /login
// 其余请求：无有效 cookie 且无 `Authorization: Bearer <token>` → 302 /login（API 返回 401 JSON）
```

- 常量时间比较：`timingSafeEqual`（长度不同直接 false，但先 hash 再比）。
- `/healthz`、`/api/health`、`/login`、`POST /login`、`/favicon.ico` 免验。
- `HOST` 为本地地址时，登录**不强制**（没有 cookie 也放行），避免本地开发被打断；一旦设置 `SDL_ACCESS_TOKEN` 则始终启用。

---

## 4. 上下文与约束

| 项       | 内容                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 现有代码 | `src/index.ts` 里 `serve({ fetch, port })`；`createApp` 已可注入 webRoot |
| 测试     | 现有 381 条；鉴权与启动判定必须纯函数化才可测                            |
| Docker   | 构建上下文要排除 `node_modules`、`dist`、`tmp`、`.git`、真实运行库       |
| CI       | 现有 workflow 只跑 typecheck/lint/test；新增 job 不得拖垮既有矩阵        |
| 演示     | 干净机器 `docker compose up` → `http://127.0.0.1:3000` ≤ 5 分钟          |

---

## 5. 风险

| 风险                                | 缓解                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| better-sqlite3 在 slim 镜像缺预编译 | 构建阶段装 `python3 make g++` 作为兜底；失败时可切 alpine 方案   |
| 忘记设 token 却对外监听             | 启动即 exit 1，并在日志给出 `set SDL_ACCESS_TOKEN=...` 指引      |
| cookie 鉴权把静态资源挡住           | 中间件放行 `/login` 与其表单提交；其余 302 到登录页              |
| E2E 需要模型才能生成节点            | 用 `request` 直接调用 commit 接口播种（手写候选/题目），不调模型 |
| `docker build` 让 CI 变慢           | 单独 job + `docker/build-push-action` 缓存层                     |
| 端口冲突                            | compose 固定 `127.0.0.1:3000:3000`；文档写明改 `PORT`            |

---

## 6. 未决问题

1. 镜像标签策略 —— 本阶段只构建不推送。
2. 登录页样式 —— 极简 HTML，复用设计令牌的一项颜色即可，不引入 React。
3. 多副本 —— 不支持（单容器 + 单卷）。
