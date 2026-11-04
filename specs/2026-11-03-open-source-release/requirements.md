# 阶段 11 · 开源发布准备 —— 需求

> 分支：`feat/phase-11-release-prep`（基于 `main` 8fc6de8，已含 1–10 阶段与最近的地图/路径/UI 改动）
> 上游：`specs/roadmap.md` 阶段 11；约束：`specs/mission.md`（面向陌生人的网页产品）、`specs/tech-stack.md`（Node ≥ 22 / Hono / Markdown 库）
> 状态：**已定稿**（2026-11-03 访谈）
> 目录：`specs/2026-11-03-open-source-release/`

---

## 1. 目标

把当前工作区变成**别人可以安全下载、看得懂、跑得起来、法律上允许非商业使用**的发布物，同时**不发布任何私人学习数据**。

| 现状                         | 目标                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| 400+ 私人库文件被 git 跟踪   | 移出跟踪，发布快照只含 `seeds/` 演示库                          |
| `.sdlrc.json` 指向私人运行库 | 指向 `./vault`，缺失/为空时**首启自动建库**                     |
| 没有 LICENSE，README 过时    | **PolyForm Noncommercial 1.0.0** + 全篇重写 README + 5 分钟上手 |
| 只有当前仓库，历史含私人数据 | 新仓库**单提交快照**，GitHub 与 Gitee 双发                      |
| 没有演示截图                 | 用 seeds 演示库截 4 张，进 `docs/screenshots/`                  |

---

## 2. 范围

### 2.1 范围内

| #   | 交付物                      | 说明                                                                                                                                                                                              |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | 私库移出 git                | `git rm --cached` 运行库全部文件 + `.gitignore` 兜底；本地文件保留                                                                                                                                |
| S2  | 干净发布快照                | `scripts/public-snapshot.mjs --out <dir>`：以 `git ls-files` 为清单，排除 `.dsh/`、`node_modules/`、`dist/`、`tmp/`、测试产物、`.env`、`.sdl-secrets.json`、`vault/`、个人库；`git init` + 单提交 |
| S3  | 首启建库                    | `.sdlrc.json` → `./vault`；目录不存在或为空时从 `seeds/` 初始化并写 `.sdl-vault`；非空无标记仍拒绝                                                                                                |
| S4  | README 全篇重写             | 面向普通用户：一句话定位 → 需要什么 → Docker（主）/ Node（次）→ 第一次使用 → API Key 与费用 → 截图 → 数据位置 → 非商用授权 → 反馈微信                                                             |
| S5  | START-HERE 改「5 分钟上手」 | 删掉阶段 1/六区/手写 SOP 的过时描述                                                                                                                                                               |
| S6  | LICENSE                     | PolyForm Noncommercial 1.0.0 全文 + README 授权说明 + 商用授权微信入口                                                                                                                            |
| S7  | 演示截图                    | `scripts/screenshots.mjs`：seeds 演示库起服务，截首页 / 地图 / 路径 / 质量，存 `docs/screenshots/*.png`                                                                                           |
| S8  | 双发说明                    | README「发布到 GitHub / Gitee」小节；快照目录可直接 push 到两个远程                                                                                                                               |
| S9  | 验收                        | 快照全新目录跑通 Node 与 Docker 两条路径；真实的私人库不被写入                                                                                                                                    |

### 2.2 范围外

- Windows 便携包（**已定不做**，等阶段 12 Electron）
- 同步/托管在线 demo、多用户
- 修改产品功能（除首启建库与文档外不动代码）
- 为 Gitee 单独维护分支（同一快照推两处）
- 英文 README / i18n

---

## 3. 决策

| #   | 决策                                                             | 理由                                                                       |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| D1  | 许可证 **PolyForm Noncommercial 1.0.0**                          | 允许个人非商业使用/修改/分发，禁止商用；带专利与商标条款；比 CC 更适合软件 |
| D2  | 明确写「source-available，不是 OSI 开源」                        | 避免误解；GitHub 会识别为自定义/非商用                                     |
| D3  | **开放商用授权**：README 与 LICENSE 注明「商用需联系作者」+ 微信 | 保留商业化通道                                                             |
| D4  | 发布物 = 源码快照，**GitHub + Gitee 双发**，不做便携包           | 访谈选择；安装包留给阶段 12                                                |
| D5  | 历史处理：**新仓库单提交快照**，不用 filter-repo                 | 最彻底；当前仓库历史不外发                                                 |
| D6  | 私人运行库：**移出 git 跟踪并 gitignore**                        | 防止误提交；发布快照自然不含                                               |
| D7  | 快照含 **代码 + seeds + specs + 截图**                           | 设计依据可审查                                                             |
| D8  | 首启建库只在「不存在 / 为空」时触发；非空无标记拒绝              | 保持现有安全语义，不覆盖用户目录                                           |
| D9  | 保留中文产品名；npm 包名维持英文 `self-directed-learning`        | 访谈选择                                                                   |
| D10 | 截图只来自 seeds 演示库                                          | 不泄露真实学习内容                                                         |
| D11 | 发布节奏：先源码快照，Electron（阶段 12）完成后再发安装包        | 访谈选择                                                                   |

### 3.1 快照脚本契约

```bash
node scripts/public-snapshot.mjs --out ../sdl-public
```

- 清单：`git ls-files`（保证只带已跟踪文件，脏文件不会混入）
- 排除：私人运行库、`.dsh/`、`node_modules/`、`dist/`、`tmp/`、`test-results/`、`playwright-report/`、`.env`、`.sdl-secrets.json`、`vault/`
- 改写：`.sdlrc.json` → `{ "vaultPath": "./vault" }`
- 生成：`git init` + 一条提交 `chore: public snapshot`
- 自检：不含私人库目录/文件；文本里不得出现长串 `sk-` / `tvly-` 密钥（文档里描述库名不算泄漏）
- 目标目录已存在且非空 → 拒绝覆盖

### 3.2 首启建库契约

```ts
bootstrapVaultIfEmpty(root, seedsDir): { created: boolean; copied: number }
```

- 仅当目标目录不存在或为空：复制 `seeds/` + 写 `.sdl-vault`；
- 非空但无标记：不写入，日志提示「这个目录不是库，拒绝初始化」，服务照常启动；
- 在 `src/index.ts` 启动时调用，然后才 `ensureVaultStructure`。

### 3.3 README 结构（普通用户优先）

1. 一句话 + 截图
2. 你需要什么（Docker 推荐；Node ≥ 22 可选；浏览器）
3. 三条命令跑起来（Docker）
4. 第一次使用：建目标 → 配 Key（右上角）→ 生成地图/路径
5. API Key 与费用（DeepSeek 必填、Tavily 可选；页面保存位置与掩码）
6. 数据在哪、怎么备份（Markdown 库 + zip 导出）
7. 授权：非商业免费；商用需授权（微信）
8. 反馈：微信 `wxid_0bz0pezewo1w22`
9. 开发者：Node 路径、测试、设计文档链接

---

## 4. 上下文

| 项       | 内容                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 分支基点 | `main` 8fc6de8（包含阶段 1–10 + 地图/路径/UI 改动）                                                                             |
| 现有草稿 | `specs/2026-11-01-open-source-prep/`（旧版，未提交）→ 由本目录取代                                                              |
| 相关代码 | `src/vault/paths.ts`（库根与标记）、`src/index.ts`（启动）、`docker/entrypoint.sh`（容器首启）、`src/export/zip.ts`（导出排除） |
| 现有文档 | README（过时）、START-HERE（过时）、SOP.md（仍有效）                                                                            |
| CI       | 五项门禁（Node 22/24、E2E、Docker build）                                                                                       |
| 代理限制 | 当前环境推 GitHub 需代理；Gitee 双发不改变本地准备                                                                              |

---

## 5. 风险

| 风险                         | 缓解                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| 移除 400+ 文件时误删本地数据 | 只用 `git rm --cached`；先 `git ls-files` 核对；本地文件保留           |
| 快照混入私人数据             | 以 `git ls-files` 为清单 + 生成后强制 grep 自检                        |
| PolyForm 被误解为开源        | README 标题写「源码可见 · 非商业」，附官方链接                         |
| 首启建库覆盖用户目录         | 只对不存在/空目录触发；非空无标记拒绝（复用现有检查）                  |
| 截图耗时/失败                | 脚本可重复；失败时保留占位并在 validation 记录                         |
| Gitee 导入后 CI 不能跑       | 快照里的 GitHub Actions 可留着；Gitee 侧只需能 clone/运行，不要求 CI   |
| 商用授权边界模糊             | LICENSE 明确「Commercial use requires a separate license」并给联系方式 |
