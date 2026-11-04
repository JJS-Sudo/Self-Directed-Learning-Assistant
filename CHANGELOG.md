# 变更日志

## 2026-11-04

- 新增：Electron 桌面版（1.1.0）—— 主进程内嵌 Hono 服务、动态端口、单实例；不需要 Node/Docker 即可双击使用。
- 新增：桌面数据目录按安装形态区分 —— 安装版 `userData/vault`，Windows portable / Linux AppImage 用程序旁 `data/vault`；首启自动从 `seeds/` 建库。
- 新增：桌面密钥用系统密钥链 `safeStorage` 加密，旧明文 `.sdl-secrets.json` 自动迁移；Web/Docker 仍保持明文兼容。
- 新增：原生菜单（打开数据目录 / 导入 zip / 导出 zip / 检查更新 / 使用说明 / 关于）与外部链接走系统浏览器。
- 新增：`electron-builder` 三平台产物 —— Windows NSIS + portable、macOS dmg + zip、Linux AppImage + zip；版本升到 1.1.0。
- 新增：`electron-updater` 自动更新，GitHub Releases 主源、Gitee 回退；mac 未签名时只提示手动下载。
- 新增：Desktop CI 三平台矩阵 + Windows 打包后启动冒烟（建库 / 监听端口 / `/healthz` 200）。
- 修复：`health.ts` 在模块顶层使用 `createRequire(import.meta.url)`，CJS 打包后 `import.meta` 为空导致主进程启动即崩溃；改为读 `SDL_APP_VERSION` / `process.cwd()/package.json`。
- 文档：README 增加桌面版安装、数据位置、SmartScreen / Gatekeeper 与未签名说明；README、START-HERE、roadmap、菜单中的 Obsidian 文案全部移除。
- 工程：`eslint` / `prettier` 忽略 `dist-electron`、`release` 构建产物；新增 4 组 Electron 单测。

<!-- commits: 3561050 571f785 ccd8ff8 bfa5d39 6a87076 9a3500d dfffe74 9d71995 2e0b245 5b0883d 66d1f21 -->

## 2026-11-03

- 新增：知识地图改版 —— 中心目标卡 + 力导向蛛网，节点关系支持「上级 / 并列 / 相关」（下级由上级反推），可拖拽、连线、删边、改标题序号掌握度；布局写入 `知识网/布局.json`。
- 新增：路径页三列阶段卡（阶段 / 检验信号 / 验收题目），阶段卡下方列出全部资源链接与「平台 · 价格」概况；资源新增 `platform` / `price` 字段。
- 新增：地图默认「AI 自动生成知识地图」——配了 Tavily 先搜资料，否则纯模型；材料生成移到独立页 `/map/material`。
- 新增：整体视觉刷新（抹茶绿 + 玻璃顶栏 + 柔和光斑 + Lucide 图标），首次打开欢迎弹窗（三步上手 / API Key 指引 / 微信反馈）。
- 修复：`/api/health` 的索引状态改为真实读取（ok / stale / absent），不再恒报「未建立」。
- 修复：E2E 预置欢迎弹窗已读，避免遮挡交互。
- 新增：首启自动建库 —— 目录不存在或为空时从 `seeds/` 初始化，`.sdlrc.json` 默认指向 `./vault`。
- 工程：私人运行库移出版本跟踪；新增 `npm run snapshot` 生成单提交公开快照（排除私人数据与密钥）。
- 文档：LICENSE 改为 PolyForm Noncommercial 1.0.0；README、START-HERE 重写为普通用户优先；新增 seeds 演示截图与 `npm run screenshots`。
- CI：Node 22/24、E2E、Docker build 五项全绿。

<!-- commits: 50c351e 6fcbbb9 c89efcb 2dd918d 555600f e8e262a 8fc6de8 65f8555 ebf675a 75d1bc0 8c17fbf ac3aff8 7fc873e 6d2789d 3ae1aa4 -->

## 2026-11-01

- 修复：模型会发明虚拟根节点 `n0`，导致整棵知识树被拍平；提示词禁止虚拟根，合并层也按顶层容错。
- 修复：索引文件被占用时删除失败（Windows `EPERM`）——改为改名隔离，迁移失败时先关闭连接。
- 工程：四个 CLI 主流程可测试化（`runIndex` / `runMaps` / `runReset` / `runMigrate`），并补组件、CLI、API 负路径与日期边界测试（用例 249 → 307）。
- 新增：学习路径生成 —— 模型按「一次能学完」分段，必须覆盖全部叶子；覆盖不足会自动补一段（最多一次）。
- 新增：每段生成两道验收题（封闭 + 开放），封闭题必须带答案与解析；落盘时先题后段，`order` 接在已有段之后。
- 新增：`checks` 校验下沉到领域层（每条至少 6 字），「理解 / 了解」这类模糊措辞只给警告、不阻止落盘。
- 新增：路径页与四个路径接口（estimate / preview / commit / get），估算不调用模型。
- 文档：阶段 5–6 规格、实施记录与真实模型冒烟证据；路线图阶段 4–6 标记完成。
- 新增：资源检索 —— Tavily 按「节点 + 目标 + 画像媒介偏好」检索 top-5，只保留真实返回的 URL；未配置 key 时 503 且不发请求。
- 新增：候选资源的等级 / 媒介 / 时长由模型批量判定，判不出的留空，非法值丢弃并警告（不猜时长）。
- 新增：资源落盘 —— 勾选并编辑后写入 `40-资源/`，URL 全局去重，重复时报告「已挂在哪里」。
- 新增：资源页 —— 节点多选 → 检索 → 勾选落盘 → 列表显示实时三因子理由（不写 `rank_reason`）。
- 修复：Vite 补 `@shared` 运行时别名（此前只解析类型导入，导入运行时值即构建失败）。
- 修复：资源页画像时长按「小时」显示，与领域层 `timeBudget * 60` 的口径一致。
- 文档：阶段 7 规格、实施记录与两次冒烟（混合、真 Tavily + 真模型）证据，含两项真实环境发现。
- 新增：验收交卷 —— 一次验收的多条记录共享 session；没答的题也落「未作答」；复述用人工自评。
- 新增：本轮统计与掌握度建议 —— 正确率分母含未作答，≥80% 已掌握、>0 在学、0 未学；建议不自动回写。
- 新增：复盘接口 —— worked / failed / next_adjustment + 调整段（存段 id）与 mastery 回写，路径段序不变。
- 新增：验收页与复盘页（`/assess`、`/retro`），替换原占位页。
- 文档：阶段 8 规格、实施记录与临时库全链路证据（含未作答、建议、mastery 回写与段序校验）。
- 新增：默认只监听 `127.0.0.1`；`HOST=0.0.0.0` 且没有 `SDL_ACCESS_TOKEN` 时拒绝启动（退出码 1，日志给设置指引）。
- 新增：访问令牌登录页 —— 令牌换成 httpOnly cookie（存派生值，不存原文），也支持 `Authorization: Bearer`；`/healthz` 与 `/api/health` 免验。
- 新增：多阶段 Dockerfile 与 compose（端口绑 `127.0.0.1:3000`、`/data` 卷、非 root），以及 `.env.example`。
- 新增：npm `bin` 入口 `sdl start`（默认可省略子命令）；缺构建产物时提示先 `npm run build`。
- 工程：CI 新增 Playwright 主路径（Chromium）与 `docker build` 两个门禁，共五项检查。
- 文档：阶段 9 规格、实施记录与 CI 结果。
- 新增：质量面板（四类覆盖警告分组、最近失败原因、最近 runs 与费用、预算超支提示），导航新增第七区「质量」。
- 新增：子图重生成 —— 只对勾选的 1–10 个节点发一次请求，结果追加为修复候选，不删旧节点。
- 新增：单目标预算 `budget_cny`（元），超出只警告、不阻止生成。
- 新增：每次模型调用的真实 usage 落盘 `.sdl-runs.json`（tokens / 费用 / 成败），文件损坏时自动备份并降级为空历史。
- 新增：整库或单目标 zip 导出 —— 默认排除索引、运行记录与 canvas；勾选后带上 `.canvas`。
- 新增：zip 导入 —— 已存在跳过、派生文件忽略、绝对路径拒绝，导入后重建索引。
- 工程：新增运行时依赖 JSZip（导出/导入共用）。
- 文档：阶段 10 规格、实施记录与真实运行库导入实测。

<!-- commits: bdab293 f35756c 35767e2 854e17e 8c76646 c2019d8 afd0245 4b06206 fd171e5 dfe9bf8 b365b41 8990517 be24b5a 5b0a23d 1322797 7b4d35d 7dd59cc d1f5bdb 81b856e d1b4601 95e4937 064058e a8c3f9d 3b5f42d cf059e3 82f7270 4a516d2 1ea47a7 70db89c d7fe219 54e5380 56f82df 8618ee2 362d162 e27e853 14e3120 0eeb8c3 d32b58f 39d5f93 aff108d 4c74a8e ff493de -->

## 2026-10-31

- 工程：加入 ESLint + Prettier 与 GitHub Actions 门禁（Node 22 / 24 跑 `typecheck` / `lint` / `test`），`npm run dev` 改为一条命令同时起 API（3001）与网页（3000）。
- 新增：网页端骨架（Vite + React），生产环境由 Hono 托管 `dist/web`；新增 `GET /api/health` 自检接口，返回库 / 索引 / 模型 / 版本四项状态，库不可用时仍返回 200。
- 文档：README、START-HERE、SOP 对齐新定位 —— 网页端承载全部功能、允许联网与调用大模型，旧的「不联网、不调用大模型、可视化交给 Obsidian」边界标注作废。
- 新增：六区导航与客户端路由（目标 / 地图 / 路径 / 资源 / 验收 / 复盘），支持深链与刷新不 404，未匹配路径显示页内 404；样式拆为设计令牌 + 基础层。
- 变更：生产模式下 `/resources` 也交由网页渲染；没有构建产物时仍回落到旧的服务端页面。
- 新增：SQLite 目标索引（库根 `.sdl-index.db`），删掉索引文件后下一次请求自动重建，新增 `npm run index` 强制全量重建。
- 新增：目标 API —— `GET /api/goals`（新→旧）与 `POST /api/goals`（zod 校验 → 先写 Markdown → 再更新索引），索引更新失败时返回 500 并说明「目标已创建」。
- 新增：目标页表单与列表（标题 / 类型 / 期限 / 剩余天数，逾期与无期限分别显示），提交后立即刷新，接口错误原样显示在表单下方。
- 修复：目标表单校验错误重复字段名（「title：title 不能为空」→「title：不能为空」）。
- 文档：新增 `specs/` 下的阶段 1–3 规格与实施记录，路线图中的阶段 1–3 标注为已完成。
- 新增：DeepSeek 客户端 —— 原生 `fetch`、请求超时、5xx / 429 的退避重试、SSE 流式解析，以及「结构化输出 + 恰好一次修复重试」；401/403 与超时不重试。
- 新增：`POST /api/llm/ping` 手动自检 —— 未配置密钥时返回 200 且不发起任何上游请求，凭据错误映射为 502 `LLM_AUTH`，响应不泄露密钥与上游报文。
- 新增：目标页「测试连接」按钮，点击后显示模型名与耗时；未配置时给环境变量指引而不是报错。
- 文档：新增阶段 4 规格、实施记录与真实冒烟 / 错误路径证据。
- 新增：知识地图生成 —— 粘贴教材目录按小节切块，模型输出候选节点（可改、可删、可调层级），确认后落盘；重名自动加「（2）」。
- 新增：知识地图四个接口（estimate / preview / commit / get），估算不调用模型；覆盖检查不阻止落盘，红字并列展示。
- 新增：地图页 —— 目标选择、材料输入、候选编辑与 React Flow 渲染（拖拽、缩放）。

<!-- commits: 632da3c e053c8d 952569d ee3da53 5a53042 ea9e802 3ec607b 821a171 daff764 bf95676 7016cbd a072866 7dc5ee2 2aadcb8 f9034b3 5c9b13e 5a80d22 b319086 f74ec57 c51fdb0 0eb4769 18c2bf0 8da83c6 82dfebe 9c6b65e c518b0a f1bd659 965f70a -->

## 2026-10-29

- 新增：项目初始导入 —— 六环领域层（目标 / 知识节点 / 路径段 / 资源 / 验收 / 复盘）、Markdown 库读写与目标分区、Obsidian canvas 与 md 生成器、`npm run maps` / `reset` / `migrate` 三个命令、使用者手册（SOP）以及三个真实学习项目样例库（当时 172 个测试用例）。

<!-- commits: 4e3993b -->
