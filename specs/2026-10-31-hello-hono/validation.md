# 阶段 1 · Hello Hono —— 验收与合并门禁

> 配套：`requirements.md`（范围）、`plan.md`（任务组）
> 判据分两层：**合并门禁**（缺一条就不能合）与**验收场景**（证明行为对，而不只是命令绿）。

## 1. 合并门禁（全部满足才可合并）

| #   | 门禁                                                                                    | 证据                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `npm run typecheck`、`npm run lint`、`npm test` 全绿；旧 172 用例一条不少               | 本地输出 + CI 日志                                                                                                                       |
| G2  | GitHub Actions 在 **Node 22 与 24** 两个 job 上都绿                                     | Actions 运行链接                                                                                                                         |
| G3  | 冷启动演示：`npm run dev` → `localhost:3000` 显示 Hello + `vault: ok` + `model: 未配置` | 截图（含地址栏）                                                                                                                         |
| G4  | 页面零第三方请求                                                                        | DevTools 网络面板截图；或控制台执行 `performance.getEntriesByType('resource').map(r => new URL(r.name).host)`，结果只含 `localhost:3000` |
| G5  | `npm run build` 后 `npm start`，单进程可服务页面与 API                                  | 截图（3000 页面）+ `curl /api/health` 输出                                                                                               |

**门禁的判定口径**：G1 看命令退出码；G2 看 CI 结论；G3–G5 看证据文件，不接受「我这里可以」。

---

## 2. 验收场景

每条都要能**当场复现**，并且给得出「实际结果」。

### V1 · 正常启动

```bash
npm run dev            # 期望：API 在 3001，web 在 3000，两端都起来
```

打开 `http://localhost:3000`：

| 观察项 | 期望                                             |
| ------ | ------------------------------------------------ |
| 页面   | 一屏 Hello，含三项状态与版本号                   |
| vault  | 绿色 / `ok`，显示库目录名（**不是绝对路径**）    |
| index  | 显示「未建立」或 `absent`                        |
| model  | 灰色 / `未配置`，显示 `deepseek-chat`            |
| 网络   | 只有 `localhost:3000` 与 `localhost:3001` 的请求 |

### V2 · 库不可用仍可降级

临时把库挪走或改 `.sdlrc.json` 指向不存在的目录，重启 API：

- `GET /api/health` 仍是 **200**，`vault.ok=false`，带可读 `error`；
- 页面显示「库未就绪」，而不是白屏或 500；
- 控制台无未捕获异常。

### V3 · 模型配置的检测

```bash
# 不设 key
npm run dev            # model.configured = false
# 设一个假 key（不调用，只检测存在）
DEEPSEEK_API_KEY=sk-test npm run dev   # PowerShell: $env:DEEPSEEK_API_KEY='sk-test'
```

页面状态随之变化；`/api/health` 不因 key 是假的而报错（本期不发起真实调用）。

### V4 · 生产构建

```bash
rm -rf dist
npm run build
npm start
```

- 3000 打开同一张 Hello 页（由 `dist/web` 提供）；
- `/api/health` 正常；
- `/api/nope` 返回 **JSON 404**（不是 index.html）；
- `dist/` 内同时存在 API 的 `.js` 与 `web/index.html`。

### V5 · 既有功能零回归

```bash
npm test
curl localhost:3000/healthz     # 仍是探针，永远 200
curl localhost:3000/resources   # 旧页面仍可用（阶段 1 不退休）
```

`/` 在**未注入 webRoot**（即 dev 的 API 端口、测试环境）时仍是旧的目标设定页；只有生产模式才让位给 SPA。

### V6 · 热更新

改 `web/src/App.tsx` 里的一行文案 → 浏览器不刷新即更新；控制台无 HMR 报错。

### V7 · 管道可用性

CI 上故意制造一次 typecheck 失败（临时提交一个类型错误），确认 Actions 变红后再撤销。**目的**：证明门禁真的会拦人，而不是永远绿。

---

## 3. 证据清单（PR 里逐项贴上）

- [ ] G1：`typecheck` / `lint` / `test` 的本地输出（含用例总数）
- [ ] G2：Actions 运行链接（两个 Node 版本）
- [ ] G3：Hello 页截图 + 地址栏可见 `localhost:3000`
- [ ] G4：网络面板截图（无第三方域名）
- [ ] G5：`npm run build && npm start` 后页面截图
- [ ] V2：库缺失时的 health JSON 与页面状态
- [ ] V7：一次被 CI 拦下的运行记录

---

## 4. 不通过的样子（出现任意一条就退回）

- 为了让页面「看起来正常」而把 health 的错误吞成 `ok: true`。
- `/api/health` 返回绝对路径、用户名或库内文件名。
- 生产模式下 `/` 仍是旧 SSR 页面，或 `/api/*` 的未知路径回 `index.html`。
- 旧 172 用例中有任何一条被改动或删除来「通过」。
- 新增第三方 CDN / 字体 / 分析脚本。
- 引入范围外的功能（路由、导航、SQLite、模型调用）来「顺手做掉」。
- `lint` 靠大面积 `eslint-disable` 过关且未说明。

---

## 5. 本阶段不验证的内容（留到后续阶段）

| 内容                          | 归属   |
| ----------------------------- | ------ |
| 六区导航、深链、404 页内兜底  | 阶段 2 |
| 目标落盘、索引重建            | 阶段 3 |
| DeepSeek 调用、流式、失败重试 | 阶段 4 |
| 覆盖检查、知识地图渲染        | 阶段 5 |
| Docker / compose / `npx`      | 阶段 9 |
| Playwright e2e                | 阶段 9 |

---

## 6. 评审者 5 分钟检查单

1. 拉分支 → `npm ci` → `npm run dev`，30 秒内看到 Hello。
2. 看 `/api/health` 的响应体：有没有泄露绝对路径？库坏了还 200 吗？
3. 关掉 API 进程，页面是失败态还是白屏？
4. `rm -rf dist && npm run build && npm start`：3000 能不能打开？
5. PR 里的 7 项证据是否齐全，尤其 V7（门禁真的拦过人）与 G4（零第三方请求）。
