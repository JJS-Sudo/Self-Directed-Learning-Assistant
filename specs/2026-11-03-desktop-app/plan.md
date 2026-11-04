# 阶段 12 · 零安装桌面应用 —— 实施计划

> 配套：`requirements.md`、`validation.md`
> 顺序：T1 骨架 → T2 数据/密钥 → T3 菜单 → T4 打包 → T5 更新 → T6 CI → T7 文档 → T8 验收。

---

## T1 · Electron 骨架

| #    | 任务                                                                                             | 落点                          |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| T1.1 | `electron/main.ts`：单实例锁、`listen(0)` 起服务、轮询 `/healthz`、`BrowserWindow` 加载动态端口  | `electron/main.ts`            |
| T1.2 | 安全默认：`contextIsolation`、`nodeIntegration:false`、`sandbox:true`、外链 `shell.openExternal` | 同上                          |
| T1.3 | 退出时关闭服务与窗口；启动失败弹错误框并写日志                                                   | 同上                          |
| T1.4 | `scripts/build-electron.mjs`：esbuild 把 main/preload 打成 CJS（`dist-electron/*.cjs`）          | 脚本 + `package.json`         |
| T1.5 | 纯函数测试：端口等待/启动参数（不启动 Electron）                                                 | `tests/electron-boot.test.ts` |

## T2 · 数据目录与密钥加密

| #    | 任务                                                                               | 落点                                 |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| T2.1 | 数据目录解析：安装版 `userData/vault`、便携版 `PORTABLE_EXECUTABLE_DIR/data/vault` | `electron/paths.ts`                  |
| T2.2 | 首启复用 `bootstrapVaultIfEmpty`，seeds 来自 `process.resourcesPath/seeds`         | `electron/main.ts`                   |
| T2.3 | 服务端抽出 `SecretsBackend`：默认 `FileSecrets`（明文），`createApp` 可注入        | `src/settings/keys.ts`、`src/app.ts` |
| T2.4 | `SafeStorageSecrets`：加解密、旧明文迁移、不可用时降级警告                         | `electron/secrets.ts`                |
| T2.5 | 测试：明文/密文读写、迁移、safeStorage 不可用降级、Web 默认后端不变                | `tests/secrets-backend.test.ts`      |

## T3 · 原生菜单与文件操作

| #    | 任务                                                                        | 落点                          |
| ---- | --------------------------------------------------------------------------- | ----------------------------- |
| T3.1 | `buildMenuTemplate(ctx)` 纯函数：文件 / 视图 / 帮助 + 快捷键                | `electron/menu.ts`            |
| T3.2 | 打开数据目录：`shell.openPath`                                              | 同上                          |
| T3.3 | 导入/导出 zip：系统对话框 + `net.fetch` 调本机 `/api/import`、`/api/export` | `electron/zip-actions.ts`     |
| T3.4 | 检查更新 / 使用说明 / 关于                                                  | `electron/menu.ts`            |
| T3.5 | 测试：菜单结构、快捷键、无 Obsidian 项                                      | `tests/electron-menu.test.ts` |

## T4 · 打包

| #    | 任务                                                                                                         | 落点                |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------- |
| T4.1 | `electron-builder.yml`：appId、productName、asar、files、extraResources（`dist/web → web`、`seeds → seeds`） | 配置                |
| T4.2 | Windows：NSIS + zip；macOS：dmg + zip（universal）；Linux：AppImage + zip                                    | 同上                |
| T4.3 | 应用图标与安装图（简洁叶片标，512px）                                                                        | `build/icon.png` 等 |
| T4.4 | `npm run desktop:pack` / `desktop:dist` 脚本；版本升 1.1.0                                                   | `package.json`      |
| T4.5 | 本地 Windows 打包冒烟：安装 → 启动 → 建目标                                                                  | 手工                |

## T5 · 自动更新

| #    | 任务                                                                           | 落点                             |
| ---- | ------------------------------------------------------------------------------ | -------------------------------- |
| T5.1 | `electron/updater.ts`：GitHub provider 为主；失败后用 Gitee generic 源重试一次 | `electron/updater.ts`            |
| T5.2 | 开发模式禁用；mac 未签名只提示「有新版本，去下载」                             | 同上                             |
| T5.3 | 菜单「检查更新」+ 更新可用/下载进度提示                                        | 同上                             |
| T5.4 | 测试：源选择顺序、版本比较、Gitee URL 拼接                                     | `tests/electron-updater.test.ts` |

## T6 · CI 桌面矩阵

| #    | 任务                                                                                                           | 落点 |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---- |
| T6.1 | `.github/workflows/desktop.yml`：matrix windows/macos/ubuntu                                                   | CI   |
| T6.2 | 每平台：`npm ci` → `@electron/rebuild`（better-sqlite3）→ `npm run build` → `electron-builder --publish never` | CI   |
| T6.3 | 上传 artifacts；tag `v*` 时创建 GitHub Release 并附三平台产物                                                  | CI   |
| T6.4 | `scripts/gitee-release.mjs`：有 `GITEE_TOKEN` 时同步资产，否则打印手动步骤                                     | 脚本 |

## T7 · 文档与 Obsidian 清理

| #    | 任务                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| T7.1 | README 新增「桌面版」：下载、安装、SmartScreen / Gatekeeper 说明、数据位置、更新方式 |
| T7.2 | 删除 README / START-HERE / 欢迎弹窗 / 菜单中的 Obsidian 文案，统一为「打开数据目录」 |
| T7.3 | 更新 `package.json` 描述与版本（1.1.0）；roadmap 阶段 12 完成后标记                  |
| T7.4 | 发布说明模板：版本、平台、校验值、已知限制                                           |

## T8 · 验收

| #    | 任务                                                                          |
| ---- | ----------------------------------------------------------------------------- |
| T8.1 | `typecheck` / `lint` / `test` / `build` 全绿；现有五项 CI 不回归              |
| T8.2 | Windows 安装版在干净用户配置下跑通：欢迎弹窗 → 建目标 → 地图 → 导出 zip       |
| T8.3 | 免安装 zip：数据写在旁边 `data/`，不碰 userData                               |
| T8.4 | 保存 Key 后检查 `.sdl-secrets.json` 为密文；旧明文自动迁移；Web/Docker 仍正常 |
| T8.5 | mac / Linux 产物由 CI 生成；记录未签名限制                                    |

## 提交切分（建议）

| #   | 提交                                          | 内容   |
| --- | --------------------------------------------- | ------ |
| 1   | `feat(electron): 主进程骨架与动态端口`        | T1     |
| 2   | `feat(desktop): 数据目录与 safeStorage 密钥`  | T2     |
| 3   | `feat(desktop): 原生菜单与 zip 导入导出`      | T3     |
| 4   | `build(desktop): electron-builder 三平台产物` | T4     |
| 5   | `feat(desktop): 自动更新与双下载源`           | T5     |
| 6   | `ci(desktop): 三平台构建矩阵`                 | T6     |
| 7   | `docs: 桌面版安装说明与 Obsidian 清理`        | T7     |
| 8   | `docs(spec): 阶段 12 规格与验收记录`          | 本目录 |

---

## 实施记录（2026-11-03）

T1–T7 完成，T8 部分完成。

| 项  | 结果                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `electron/main.ts`：单实例、动态端口、等 `/healthz` 再开窗、外链走系统浏览器；esbuild 打成 `dist-electron/main.cjs`                                                                                         |
| T2  | 数据目录按安装形态解析；首启复用 `bootstrapVaultIfEmpty`；`SecretsBackend` 注入，桌面用 safeStorage 加密并迁移旧明文                                                                                        |
| T3  | 原生菜单（打开数据目录 / 导入导出 zip / 检查更新 / 使用说明 / 关于），无 Obsidian；zip 走系统对话框 + 本机 API                                                                                              |
| T4  | `electron-builder.yml`：NSIS 安装包 + portable 单文件（Win）、dmg + zip（mac）、AppImage + zip（Linux）；本地 `--dir` 已产出 `release/win-unpacked`；免安装从 zip 改为 portable（zip 目标不会设置便携目录） |
| T5  | `electron-updater`：GitHub 主源、Gitee 回退；开发模式禁用；mac 只提示手动下载                                                                                                                               |
| T6  | `.github/workflows/desktop.yml` 三平台矩阵 + tag 发布；`scripts/gitee-release.mjs`（无 token 时打印手动步骤）                                                                                               |
| T7  | README 增加桌面版安装/数据/未签名说明；README、START-HERE、roadmap、菜单里的 Obsidian 文案已移除                                                                                                            |

验证：

- `npm run typecheck`（根 + web + electron）、`npm run lint` 通过；
- **487 条测试全绿**（新增 paths / secrets 加密 / menu / update 四组）；
- `npx electron-builder --dir` 成功产出 Windows 未打包目录（未签名）。

本机限制（未算代码失败）：

- `better-sqlite3` 需要按 Electron 45 的 ABI 重编，本机没有 Visual Studio C++ 工具链，
  `electron-rebuild` 与 `node-gyp` 失败；因此**本地无法启动 Electron 窗口做真机冒烟**。
  代码里不绕过这个问题，改由 CI 的 Windows/macOS/Linux 镜像执行 `electron-rebuild`。
- 因此 T8 的「Windows 安装版干净环境实测」留待 CI 产物下载后验证；mac/Linux 只能看 CI 产物。

待办：

1. 推送后触发 Desktop workflow，确认三平台都出包；
2. 下载 Windows 安装包在干净账户实测（数据在 userData、菜单、密钥密文）；
3. 创建 GitHub/Gitee Release 并设置 `SDL_UPDATE_BASE_URL` / `SDL_GITEE_UPDATE_BASE_URL`（CI 已从仓库变量取 Gitee 地址）；
4. 后续补 Windows 代码签名与 macOS 公证。

### 补充：真机启动冒烟（已解决）

最初在三平台 CI 出包后，下载 Windows 产物在本机安装/运行：进程能启动，但没有窗口、本地端口或数据目录。
继续排查后在 CI 里加「打包后启动」冒烟，复现了同样现象（**没有创建 `.sdl-vault`**，且没有启动日志）。

**根因**：`src/api/health.ts` 在模块顶层写了 `createRequire(import.meta.url)`。Electron 主进程被 esbuild
打成 CJS 后 `import.meta` 变成空对象，主进程一加载就抛 `TypeError`，所以连 `logBoot('module loaded')`
都执行不到——表现就是「进程活着、但没有窗口/数据/日志」。

**修复**：`readVersion` 不再用 `createRequire` / `import.meta`，改为优先读桌面注入的 `SDL_APP_VERSION`，
否则读 `process.cwd()/package.json`。

**验证**：CI run `41749029780` 三平台全绿，其中 Windows 冒烟：

- 启动 `release/win-unpacked` 后自动创建 `.sdl-vault`；
- 有本地监听端口；
- `/healthz` 返回 200。

本机安装已卸载，临时产物已清理；macOS / Linux 的启动行为由各自 CI job 出包覆盖（未做 GUI 冒烟）。
