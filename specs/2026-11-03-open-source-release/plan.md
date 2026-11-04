# 阶段 11 · 开源发布准备 —— 实施计划

> 配套：`requirements.md`、`validation.md`
> 顺序：T1 私库脱钩 → T2 首启建库 → T3 快照脚本 → T4 文档与授权 → T5 截图 → T6 验收。

---

## T1 · 私人运行库移出 git

| #    | 任务                                                                                       | 落点         |
| ---- | ------------------------------------------------------------------------------------------ | ------------ |
| T1.1 | `git rm -r --cached 自我导向学习项目运行库`（本地文件保留）                                | git index    |
| T1.2 | `.gitignore` 加 `/自我导向学习项目运行库/`、`.dsh/`、`test-results/`、`playwright-report/` | `.gitignore` |
| T1.3 | 核对 `git ls-files` 不再含私人库；`git status` 只出现删除索引                              | 命令输出     |

**完成判据**：当前仓库不再跟踪私人数据，本地文件原样存在。

## T2 · 首启自动建库

| #    | 任务                                                                                          | 落点                              |
| ---- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| T2.1 | `bootstrapVaultIfEmpty(root, seedsDir)`：不存在/为空 → 复制 seeds + 写标记；非空无标记 → 不写 | `src/vault/bootstrap.ts`          |
| T2.2 | 启动时先 bootstrap 再 `ensureVaultStructure`，日志说明                                        | `src/index.ts`                    |
| T2.3 | `.sdlrc.json` → `{ "vaultPath": "./vault" }`                                                  | `.sdlrc.json`                     |
| T2.4 | 测试：不存在 / 空目录 / 非空无标记 / 已有合法库                                               | `tests/vault-bootstrap.test.ts`   |
| T2.5 | Docker 路径回归（entrypoint 不依赖新代码）                                                    | `docker/entrypoint.sh` 不改，冒烟 |

**完成判据**：新克隆 `npm start` 后 `vault/` 自动出现且能建目标；非空未标记目录仍被拒绝。

## T3 · 干净发布快照脚本

| #    | 任务                                                               | 落点                            |
| ---- | ------------------------------------------------------------------ | ------------------------------- |
| T3.1 | 以 `git ls-files` 为清单复制；按路径排除（见 requirements 3.1）    | `scripts/public-snapshot.mjs`   |
| T3.2 | 改写 `.sdlrc.json`；`git init` + 单提交；输出文件数与 hash         | 同上                            |
| T3.3 | 自检：私人库名 / `sk-` / `tvly-` 命中即失败                        | 同上                            |
| T3.4 | `npm run snapshot` 入口                                            | `package.json`                  |
| T3.5 | 测试：临时目录生成快照，断言文件集合、`.sdlrc`、单提交、无私人数据 | `tests/public-snapshot.test.ts` |

**完成判据**：快照目录可独立 `git log` 看到一条提交；自检 grep 为空。

## T4 · 文档与授权

| #    | 任务                                                                                        | 落点                   |
| ---- | ------------------------------------------------------------------------------------------- | ---------------------- |
| T4.1 | LICENSE：PolyForm Noncommercial 1.0.0 全文                                                  | `LICENSE`              |
| T4.2 | README 全篇重写（结构见 requirements 3.3）                                                  | `README.md`            |
| T4.3 | START-HERE 改「5 分钟上手」                                                                 | `START-HERE.md`        |
| T4.4 | 包元数据：`private` 去掉、`license: PolyForm-Noncommercial-1.0.0`、repository 字段留空/占位 | `package.json`         |
| T4.5 | 商用授权与微信写进 README、LICENSE 头部与欢迎弹窗文案                                       | 文档 + `WelcomeDialog` |
| T4.6 | 双发说明（GitHub + Gitee）                                                                  | README                 |

**完成判据**：第一次打开仓库的人只读 README 就能跑起来，并清楚知道「非商业」。

## T5 · 演示截图

| #    | 任务                                                                                 | 落点   |
| ---- | ------------------------------------------------------------------------------------ | ------ |
| T5.1 | `scripts/screenshots.mjs`：临时 seeds 演示库起服务，Playwright 截首页/地图/路径/质量 | 脚本   |
| T5.2 | 输出 `docs/screenshots/{home,map,path,quality}.png`                                  | 文件   |
| T5.3 | README 引用截图；确认图中无真实目标                                                  | README |

**完成判据**：4 张图存在，内容只来自 seeds。

## T6 · 验收与发布

| #    | 任务                                                                    |
| ---- | ----------------------------------------------------------------------- |
| T6.1 | `typecheck` / `lint` / `test` / `build` 全绿                            |
| T6.2 | 跑快照脚本到临时目录；`grep` 私人库名/密钥为空                          |
| T6.3 | 快照目录 `npm ci && npm run build && npm start` → 首启建库 → 建目标 201 |
| T6.4 | 快照目录 `docker compose up`（或 build）→ 浏览器可用                    |
| T6.5 | 真实库零改动；记录快照文件数与提交 hash                                 |
| T6.6 | 写发布说明：GitHub 建空仓库、Gitee 导入、各自 push 步骤                 |

## 提交切分（建议）

| #   | 提交                                      | 内容   |
| --- | ----------------------------------------- | ------ |
| 1   | `chore(repo): 私人运行库移出版本跟踪`     | T1     |
| 2   | `feat(vault): 首启自动建库与 .sdlrc 指向` | T2     |
| 3   | `feat(repo): 干净发布快照脚本`            | T3     |
| 4   | `docs: LICENSE、README、START-HERE 重写`  | T4     |
| 5   | `docs: 演示截图与发布说明`                | T5、T6 |
| 6   | `docs(spec): 阶段 11 规格与验收记录`      | 本目录 |

---

## 实施记录（2026-11-03）

T1–T5 完成，T6 的 Node 路径已在**全新快照目录**里验证；Docker 路径未在本机跑（Docker Desktop 未启动）。

| 项  | 结果                                                                                      |
| --- | ----------------------------------------------------------------------------------------- |
| T1  | 私人库移出跟踪：`git ls-files` 为 0；本地 432 个 md 原样保留                              |
| T2  | `.sdlrc.json` → `./vault`；`bootstrapVaultIfEmpty` 启动时执行；4 条测试                   |
| T3  | 快照脚本：**318 个文件、单提交**；含 `src/vault`、LICENSE、specs、截图；无私人库/密钥     |
| T4  | LICENSE = PolyForm Noncommercial 1.0.0（SPDX 全文）；README/START-HERE 重写；包元数据更新 |
| T5  | 截图 5 张（home/map/path/quality/welcome），来自临时 `示例库`，无真实数据                 |
| T6  | 快照里 `vault/` 自动生成、`POST /api/goals` 201、健康检查 `index: ok`（3 个目标）         |

发现并修复的 bug：

1. 快照脚本按路径段排除 `vault`，误伤 `src/vault/`，导致快照无法编译；改为只排除**根目录**的 `vault/`，并加测试断言 `src/vault/paths.ts` 存在。
2. `tests/env.smoke.test.ts` 仍假设 `.sdlrc` 指向已存在的库；改为断言 `./vault`，不存在时用 bootstrap 初始化。

环境限制（未算进代码问题）：

- 本机 `npm ci` 在快照里失败于 `better-sqlite3` 的 prebuilt 下载（GitHub 被代理挡住），回退 node-gyp 又缺 VS；
  实际验证用 `npm ci --ignore-scripts` + 复制本机已编译的 `better-sqlite3`，随后 `npm run build` 与启动均成功。
  普通用户有正常网络时 `npm ci` 应直接拿到 prebuilt；CI 的 Docker job 覆盖容器内编译。
- Docker Desktop 当前未运行，`docker compose up` 未在本机重跑；镜像构建由 CI 与早前冒烟覆盖。
- Gitee 仓库尚未创建（没有账号授权），只提供 push 步骤。

待你确认：LICENSE 里的版权人目前写的是 `JJS-Sudo`，如需真实姓名/公司名请改一处即可。
