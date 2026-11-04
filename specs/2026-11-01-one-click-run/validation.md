# 阶段 9 · 一键跑起来 —— 验收与合并门禁

> 配套：`requirements.md`、`plan.md`

## 1. 合并门禁

| #   | 门禁                                                                                                                    | 证据                           |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| G1  | CI **五项全绿**：`typecheck` / `lint` / `test` / `e2e` / `docker build`                                                 | Actions 链接                   |
| G2  | **默认只绑本地**：不设 `HOST` 时启动日志显示 `127.0.0.1`                                                                | 启动输出                       |
| G3  | **毒路径**：`HOST=0.0.0.0` 且无 `SDL_ACCESS_TOKEN` → 进程 **退出码 1**，日志给出设置指引                                | 命令行输出                     |
| G4  | **登录**：未认证访问 `/` → 302 `/login`；错误令牌 → 401；正确令牌 → Set-Cookie 后放行；`Authorization: Bearer` 同样可用 | `curl -i`                      |
| G5  | **免验白名单**：`/healthz`、`GET /api/health` 未登录可用                                                                | `curl`                         |
| G6  | **常量时间**：比较走 `sha256` + `timingSafeEqual`，cookie 不含 token 原文                                               | 代码 + 单测                    |
| G7  | **容器**：多阶段构建成功；运行镜像非 root；`HOST` 默认 `127.0.0.1`；`/data` 为卷                                        | `docker build` + inspect       |
| G8  | **compose**：端口映射为 `127.0.0.1:3000:3000`；`sdl-data:/data` 持久化（重启容器后目标还在）                            | `docker compose up` + 浏览器   |
| G9  | **bin**：`node bin/sdl.mjs` 与 `... start` 等价启动；未知子命令非零退出；缺 `dist` 有指引                               | 命令行                         |
| G10 | **E2E 主路径**：建目标 → 地图 → 路径 → 验收（交卷）→ 复盘，全部通过                                                     | CI e2e                         |
| G11 | **不碰真实库**：构建上下文与 E2E 临时库都不含 `自我导向学习项目运行库`；冒烟后 `git status` 干净                        | `git status` + `.dockerignore` |

**判定口径**：G3 必须看**退出码**，不是看有没有打印警告。
G8 的持久化必须**重建容器**后再查，不是同容器刷新。

---

## 2. 验收场景

### V1 · 本地安全启动

```bash
# 无 token 对外监听
$env:HOST='0.0.0.0'; node dist/index.js
# 期望：打印「拒绝启动」+ 设置 SDL_ACCESS_TOKEN 的命令，退出码 1

# 有 token
$env:HOST='0.0.0.0'; $env:SDL_ACCESS_TOKEN='test-token'; node dist/index.js
# 期望：监听 0.0.0.0，访问 / 得到登录页
```

### V2 · 登录与 cookie

```bash
curl -i http://127.0.0.1:3000/                 # 302 → /login
curl -i -X POST -d "token=wrong" http://127.0.0.1:3000/login    # 401
curl -i -X POST -d "token=test-token" -c jar.txt http://127.0.0.1:3000/login  # 302 + Set-Cookie
curl -i -b jar.txt http://127.0.0.1:3000/      # 200
curl -i -H "Authorization: Bearer test-token" http://127.0.0.1:3000/api/goals # 200
```

### V3 · 容器与持久化

```bash
docker compose up -d --build
# 打开 http://127.0.0.1:3000，建一个目标
docker compose restart
# 目标还在
docker compose down          # 不 down -v
docker compose up -d
# 目标仍在（卷保留）
```

### V4 · `bin` 入口

```bash
npm run build
node bin/sdl.mjs             # 等价 start
node bin/sdl.mjs start
node bin/sdl.mjs nope        # 非零退出 + 用法
```

### V5 · E2E 主路径

CI 的 `e2e` job 或本地 `npm run e2e`：

1. 通过 API 播种目标、节点、路径段与题目；
2. 打开 `/map` 看到节点；
3. 打开 `/path` 看到段与题；
4. `/assess` 交卷（含未作答）；
5. `/retro` 看到统计与建议。

### V6 · 构建上下文

```bash
docker build -t sdl:ci .
docker run --rm --entrypoint sh sdl:ci -c 'ls /app'
# 不应出现「自我导向学习项目运行库」或 tmp/
```

---

## 3. 证据清单（PR 里逐项贴上）

- [ ] G1：CI 五个 job 的结论
- [ ] G2：启动日志里的绑定地址
- [ ] G3：退出码 1 与指引文本
- [ ] G4：`curl -i` 的 302 / 401 / Set-Cookie
- [ ] G5：免验白名单的 200
- [ ] G7：`docker build` 输出与 `docker image inspect` 的 User/Env/Volumes
- [ ] G8：重启容器后目标仍在
- [ ] G9：三种 `bin` 调用的退出码
- [ ] G10：e2e 通过截图/日志
- [ ] G11：`git status` 与镜像内容清单

---

## 4. 不通过的样子

- 默认监听 `0.0.0.0`。
- `HOST=0.0.0.0` 无 token 只打印警告还继续跑。
- 登录页之外还有未鉴权页面可读。
- cookie 里是令牌原文。
- 容器默认把库写在镜像层（没挂 `/data`）。
- compose 端口写 `3000:3000`（对外暴露）。
- `docker build` 需要本机先 `npm install`（说明上下文没隔离）。
- E2E 依赖模型 key。
- 构建上下文或 E2E 写入真实运行库。

---

## 5. 本阶段不验证的内容

| 内容             | 归属     |
| ---------------- | -------- |
| 镜像推送/发布    | 未排期   |
| HTTPS 与反代配置 | 文档说明 |
| 多副本/高可用    | 不做     |
| 备份/导入导出    | 阶段 10  |

---

## 6. 评审者 5 分钟检查单

1. 不设 `HOST`：启动日志是 `127.0.0.1` 吗？
2. `HOST=0.0.0.0` 无 token：**退出码**是 1 吗？
3. 设 token 后：不登录能读 `/` 吗？`/healthz` 呢？
4. `docker compose up`：端口绑定是 `127.0.0.1` 吗？重启后数据还在吗？
5. `docker build` 的上下文里有没有真实运行库？
6. CI 的 `e2e` 与 `docker` 两个 job 绿了吗？
