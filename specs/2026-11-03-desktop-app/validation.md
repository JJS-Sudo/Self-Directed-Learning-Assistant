# 阶段 12 · 零安装桌面应用 —— 验收与门禁

> 配套：`requirements.md`、`plan.md`

## 1. 合并门禁

| #   | 门禁                                                                                           | 证据                  |
| --- | ---------------------------------------------------------------------------------------------- | --------------------- |
| G1  | 现有五项 CI 不回归（Node 22/24、E2E、Docker build）                                            | Actions               |
| G2  | **桌面矩阵**：Windows / macOS / Linux 三个 job 都产出安装包 + zip                              | Actions artifacts     |
| G3  | **Windows 安装版可用**：干净用户配置下安装 → 打开窗口 → 欢迎弹窗 → 建目标成功                  | 截图 + 日志           |
| G4  | **免安装版可用**：解压运行，数据写在 `<目录>/data/vault`，不回写 userData                      | 路径检查              |
| G5  | **密钥加密**：保存 Key 后 `.sdl-secrets.json` 无明文 `sk-`；旧明文自动迁移；Web 版仍可读写明文 | 文件内容 + 单测       |
| G6  | **菜单**：打开数据目录、导入 zip、导出 zip、检查更新、使用说明、关于都可点且生效               | 手工 + 单测           |
| G7  | **单实例**：第二次启动只聚焦已有窗口，不起第二个服务                                           | 手工                  |
| G8  | **安全**：`nodeIntegration=false`、`contextIsolation=true`、外链走系统浏览器                   | 代码审查 + 手工点外链 |
| G9  | **mac / Linux 产物**：dmg/zip、AppImage/zip 存在；README 写明未签名限制                        | actions               |
| G10 | **更新**：GitHub 源优先，失败回退 Gitee；开发模式不检查更新                                    | 单测 + 日志           |
| G11 | **Obsidian 清理**：README / START-HERE / 欢迎弹窗 / 菜单不再出现 Obsidian                      | grep + 页面           |
| G12 | **版本**：应用与安装包为 1.1.0，App 关于页一致                                                 | 界面 + package.json   |

---

## 2. 验收场景

### V1 · Windows 安装版

1. 用未装 Node/Docker 的 Windows 账户安装；
2. 双击启动：出现欢迎弹窗 → 关掉 → 建一个目标；
3. 数据出现在 `%APPDATA%/<app>/vault`；
4. 从菜单导出 zip，再导入一次。

### V2 · 免安装单文件（Windows portable / Linux AppImage）

```text
双击 sdl-1.1.0-win-x64-portable.exe（无需安装）
数据目录：<解压目录>/data/vault
```

确认没有写 `%APPDATA%`（除 Electron 缓存外）；Linux 下载 AppImage 后 `chmod +x` 运行，数据在 AppImage 旁 `data/vault`。

### V3 · 密钥加密

1. 在 API Key 页保存 `sk-...`；
2. 打开库根 `.sdl-secrets.json`：应为 `{ "v":1, "encrypted":true, "data":"..." }`，grep 不到 `sk-`；
3. 把旧版明文文件放回去再启动：自动迁移为密文，Key 仍可用；
4. 用 `npm start`（Web 版）读写同一个库：仍兼容。

### V4 · 菜单

| 动作         | 预期                                  |
| ------------ | ------------------------------------- |
| 打开数据目录 | 系统文件管理器定位到 vault            |
| 导入 zip     | 选择文件后节点/目标出现               |
| 导出 zip     | 保存对话框，文件可解压                |
| 检查更新     | 开发版提示「已是最新/开发模式不检查」 |
| 使用说明     | 打开欢迎弹窗或文档                    |
| 关于         | 显示 1.1.0                            |

### V5 · 更新回退

mock GitHub 返回 404 后，确认再次请求 Gitee generic 地址；两者都失败时提示手动下载。

### V6 · mac / Linux

1. CI 下载 dmg / AppImage；mac 未公证时按 README「右键 → 打开」；
2. AppImage `chmod +x` 后可启动；数据在 AppImage 同目录的 `data/vault`。

---

## 3. 不通过的样子

- 启动后白屏 / 端口冲突直接报错，而不是自动换端口。
- 安装版把数据写进应用安装目录（卸载即丢）。
- 免安装版仍写 userData，U 盘拔走后数据不见。
- `.sdl-secrets.json` 仍是明文，或 Web 版因此读不了 Key。
- 菜单里有「打开 Obsidian」，或 README 仍写「用 Obsidian 打开」。
- 第二个实例能再起一个服务。
- 外链在应用窗口里打开，或渲染进程能 `require`。
- 三平台只出了 Windows。
- 自动更新在开发模式弹窗，或只配了 GitHub 没有 Gitee 回退。

---

## 4. 本阶段不验证

| 内容                        | 归属               |
| --------------------------- | ------------------ |
| Windows 代码签名 / mac 公证 | 需证书与费用，后续 |
| 商店上架                    | 未排期             |
| 托盘 / 开机自启 / 文件关联  | 明确不做           |
| 移动端                      | 未排期             |

---

## 5. 评审者 5 分钟检查单

1. 干净 Windows 装完能双击打开吗？数据在 userData 吗？
2. 便携版数据在解压目录旁吗？
3. Key 文件是密文吗？Web 版还能读吗？
4. 菜单有 Obsidian 吗？「打开数据目录」能用吗？
5. 三平台产物都有吗？README 写了未签名怎么打开吗？
6. 第二个实例会聚焦而不是重开吗？
