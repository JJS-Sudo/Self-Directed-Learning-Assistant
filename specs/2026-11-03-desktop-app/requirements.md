# 阶段 12 · 零安装桌面应用（Electron） —— 需求

> 分支：`feat/phase-12-electron`（基于 `main` 830cf7f）
> 上游：`specs/roadmap.md` 阶段 12；约束：`specs/mission.md`（面向陌生人的网页产品）、`specs/tech-stack.md`（Node ≥ 22 / Hono / Markdown 库）
> 状态：**已定稿**（2026-11-03 访谈）
> 目录：`specs/2026-11-03-desktop-app/`

---

## 1. 目标

让**没装 Node、没装 Docker 的普通用户**双击安装即可使用：

- 一个 Electron 应用，主进程内嵌现有 Hono 服务，窗口打开 `http://127.0.0.1:<动态端口>`；
- 数据放在系统用户目录（安装版）或应用旁（免安装版），首次自动从 `seeds/` 建库；
- API Key 用系统密钥链加密（`safeStorage`），不再明文落盘；
- 原生菜单提供「打开数据目录 / 导入 zip / 导出 zip / 检查更新 / 使用说明」；
- 出 Windows / macOS / Linux 三平台安装包 + 免安装 zip，自动更新走 GitHub（Gitee 备用源）；
- **彻底移除 Obsidian 相关文案**（产品与 Obsidian 已无关系，数据只是普通 Markdown）。

---

## 2. 范围

### 2.1 范围内

| #   | 交付物          | 说明                                                                                                                 |
| --- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| S1  | Electron 主进程 | 动态端口起服务、单实例、等待健康检查后再开窗口、退出优雅关闭                                                         |
| S2  | 数据目录        | 安装版 `app.getPath('userData')/vault`；免安装版 `<解压目录>/data/vault`；首次从 seeds 初始化                        |
| S3  | 密钥加密        | `safeStorage` 加密 `.sdl-secrets.json`；旧明文自动迁移；Web/Docker 仍保持明文兼容                                    |
| S4  | 原生菜单        | 文件：打开数据目录 / 导入 zip / 导出 zip；视图：重载、缩放；帮助：使用说明、检查更新、关于                           |
| S5  | 打包            | Windows NSIS 安装包 + portable 单文件；macOS dmg + zip（未签名/未公证）；Linux AppImage + zip（AppImage 为便携形态） |
| S6  | 自动更新        | `electron-updater`：GitHub Releases 为主，Gitee Releases 为备用源；mac 未签名时只提示手动更新                        |
| S7  | CI              | 三平台矩阵构建、原生模块重建、产物上传；tag 时发布 GitHub Release（可选同步 Gitee）                                  |
| S8  | 文档            | README 桌面安装小节、SmartScreen / Gatekeeper 说明；删除 Obsidian 文案                                               |

### 2.2 范围外

- 代码签名（Windows）、macOS 公证（Gatekeeper 会拦，README 写「右键 → 打开」）
- 托盘、开机自启、文件关联、`sdl://` 协议
- Windows ARM / macOS 双架构分别出包（mac 先出 universal）
- 移动端、商店上架（Microsoft Store / Mac App Store）
- 自动更新在 macOS 上真正可用（未签名前只做手动更新提示）

---

## 3. 决策

| #   | 决策                                                                                 | 理由                                     |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| D1  | 三平台：Windows 10/11 x64、macOS universal、Linux x64                                | 访谈选择；先保证体验一致                 |
| D2  | 安装包 + 免安装 zip 都出                                                             | 访谈选择；zip 适合 U 盘/临时机器         |
| D3  | 数据目录按安装形态分开：安装版 userData；Windows portable、Linux AppImage 用 `data/` | 卸载不误删、便携可带走                   |
| D4  | 密钥用 `safeStorage` 加密，文件仍是 `.sdl-secrets.json`                              | 桌面端安全；Web 端零改动                 |
| D5  | 主进程直接 `createApp` + `@hono/node-server`                                         | 少一个进程、退出好管                     |
| D6  | 动态端口（`listen(0)` 后取端口）                                                     | 不要求用户理解端口冲突                   |
| D7  | 单实例锁；无托盘、无开机自启                                                         | 访谈选择                                 |
| D8  | 原生菜单标准实用项 + 快捷键                                                          | 普通用户需要「打开数据目录」这类系统入口 |
| D9  | 自动更新：GitHub 为主、Gitee 为备；两处都上传 Release 资产                           | 访谈选择                                 |
| D10 | 不买 Windows 签名证书；mac 不公证                                                    | 先出包；README 说明警告与打开方式        |
| D11 | `better-sqlite3` 按 Electron ABI 重建（`@electron/rebuild`），CI 缓存                | 保留现有 SQLite 索引                     |
| D12 | 移除 Obsidian 文案与菜单项；只保留「打开数据目录」                                   | 产品已与 Obsidian 脱钩                   |
| D13 | 版本号随桌面首发升到 **1.1.0**                                                       | 与 1.0 Web 版区分                        |

### 3.1 运行结构

```text
Electron main
 ├─ app.requestSingleInstanceLock()
 ├─ vaultRoot = 安装版 userData/vault | 便携版 <exe>/data/vault
 ├─ bootstrapVaultIfEmpty(vaultRoot, resources/seeds)
 ├─ process.env.SDL_VAULT_PATH = vaultRoot
 ├─ secretStore = new SafeStorageSecrets(userData/secrets.enc)
 ├─ app = createApp({ webRoot: resources/web, secretStore })
 ├─ server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) → port
 ├─ await /healthz
 └─ BrowserWindow.loadURL(`http://127.0.0.1:${port}`)
```

### 3.2 密钥后端契约

```ts
interface SecretsBackend {
  read(): { deepseek?: string; tavily?: string }
  write(keys: { deepseek?: string | null; tavily?: string | null }): void
}
```

- 默认 `FileSecrets`（明文 JSON，Web/Docker 行为不变）；
- 桌面注入 `SafeStorageSecrets`：读文件 → `safeStorage.decryptString`；写 → `encryptString`；
- 文件格式：`{ "v": 1, "encrypted": true, "data": "<base64>" }`；
- 旧明文 `{ "deepseek": "sk-..." }` 首次读取时迁移为加密格式，并删除明文；
- `safeStorage.isEncryptionAvailable()` 为假时降级为明文并写警告日志。

### 3.3 数据与资源路径

| 形态   | vault                   | web 资源        | seeds             |
| ------ | ----------------------- | --------------- | ----------------- |
| 开发   | `./vault`               | `dist/web`      | `seeds/`          |
| 安装版 | `userData/vault`        | `resources/web` | `resources/seeds` |
| 免安装 | `<解压目录>/data/vault` | `resources/web` | `resources/seeds` |

- electron-builder `extraResources`：`dist/web → web`、`seeds → seeds`；
- 便携版通过 `process.env.PORTABLE_EXECUTABLE_DIR` 判断所在目录。

### 3.4 自动更新

- `electron-updater` + `publish` 配置；
- 主源：GitHub Releases（`provider: github`）；
- 备用：Gitee Releases 同版本资产，以 `generic` provider 指向
  `https://gitee.com/<owner>/<repo>/releases/download/v${version}/`；
- 失败回退顺序：GitHub → Gitee → 提示手动下载；
- mac 未签名：不启用自动安装，只提示「有新版本，去下载」。

### 3.5 菜单

```text
文件   打开数据目录 (Ctrl+Shift+O) / 导入 zip… / 导出 zip… / 退出
视图   重新加载 (Ctrl+R) / 放大 / 缩小 / 重置缩放
帮助   使用说明 / 检查更新 / 打开项目主页 / 关于
```

- 导入/导出复用现有 `/api/import`、`/api/export`（主进程用 `net.fetch` 调本机服务 + 系统文件对话框）；
- 外部链接一律 `shell.openExternal`；窗口内 `window.open` 交给系统浏览器。

---

## 4. 上下文

| 项       | 内容                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 现有资产 | `createApp`（可注入 `webRoot`）、`bootstrapVaultIfEmpty`、`.sdl-secrets.json`、`/api/export`、`/api/import`、阶段 11 的快照与 LICENSE |
| 构建     | Vite 出 `dist/web`；`tsc -p tsconfig.build.json` 出服务端；新增 `dist-electron`                                                       |
| CI       | 现有五项门禁 + 新增桌面矩阵（Windows/macOS/Linux）                                                                                    |
| 发布     | GitHub Releases（主）+ Gitee Releases（备）；版本 1.1.0                                                                               |
| 安全     | `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、无 preload 暴露 Node                                             |
| 平台限制 | mac 未公证需右键打开；Windows 未签名有 SmartScreen；Linux AppImage 需 `chmod +x`                                                      |

---

## 5. 风险

| 风险                            | 缓解                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `better-sqlite3` ABI 不匹配     | CI 里 `@electron/rebuild`；启动失败给出可读错误                  |
| asar 内路径读不到 web/seeds     | 用 `extraResources` 放到 `resources/`，主进程显式传 `webRoot`    |
| 动态端口被占用 / 服务未起       | `listen(0)` + 轮询 `/healthz`，超时弹错误窗并写日志              |
| safeStorage 在 Linux 无密钥环   | 可用性检查 + 降级明文 + 警告；文档说明                           |
| 未签名/未公证被拦               | README 写 SmartScreen「更多信息 → 仍要运行」、mac「右键 → 打开」 |
| Gitee Release API 变动/无 token | 上传脚本可选；没有 `GITEE_TOKEN` 时跳过并打印手动步骤            |
| 三平台构建时间长                | 矩阵并行 + 依赖缓存；`--publish never` 先出产物                  |
| 自动更新误报                    | 只在打包版启用；开发模式禁用；版本比较用 semver                  |
| 体积过大                        | asar + 只打包生产依赖 + 排除 sourcemap/tests                     |
