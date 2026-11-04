# 发布步骤（v1.1.0 起）

> 适用于「打 tag 自动出三平台安装包 + GitHub Release」的流程。
> 仓库地址里的 `<owner>/<repo>` 请替换成实际值（GitHub 与 Gitee 各一份）。

## 0. 前置条件

- `main` 干净、CI 与 Desktop workflow 都是绿色；
- `package.json` 版本为 **1.1.0**（与 tag 一致），CHANGELOG / roadmap 已更新；
- GitHub 仓库已建好；Gitee 仓库可由 GitHub 导入；
- 代码签名证书暂不要求（未签名是已知限制）。

## 1. 配置仓库变量与密钥

GitHub → Settings → Secrets and variables → Actions：

| 类型           | 名称                        | 值                                                   |
| -------------- | --------------------------- | ---------------------------------------------------- |
| Variable       | `SDL_GITEE_UPDATE_BASE_URL` | `https://gitee.com/<owner>/<repo>/releases/download` |
| Secret（可选） | `GITEE_TOKEN`               | Gitee 私人令牌（用于自动上传 Gitee Release）         |

> **重要**：更新源的基地址是在**构建时**注入安装包的。第一次发版前若没设
> `SDL_GITEE_UPDATE_BASE_URL`，这版安装包就没有 Gitee 回退源；要补只能重新构建、升版本号。

GitHub 主源不需要配置——workflow 会根据仓库自动拼成
`https://github.com/<owner>/<repo>/releases/download`。

## 2. 打 tag 并推送

```bash
git switch main
git pull
git status                 # 应为 clean

git tag -a v1.1.0 -m "自我导向学习辅助器 v1.1.0"
git push origin v1.1.0
```

推送 tag 后：

1. **Desktop** workflow 在 Windows / macOS / Linux 三平台构建；
2. Windows job 会跑打包后启动冒烟（建库 / 监听端口 / `/healthz` 200）；
3. 全绿后 **Release** job 创建 GitHub Release，附上安装包，并使用
   `docs/releases/v1.1.0.md` 作为发行说明。

## 3. 校验 GitHub Release

- Release 附件应包含：Windows 安装包 + portable、macOS dmg + zip、Linux AppImage + zip；
- 下载 Windows 安装包装到干净账户：能启动 → 欢迎弹窗 → 建目标 → 菜单导出 zip；
- 下载 portable 版：数据应出现在程序旁 `data/vault`；
- 生成 SHA256 并追加到 Release 说明：

```powershell
Get-FileHash .\自我导向学习辅助器-1.1.0-win-x64.exe -Algorithm SHA256
```

```bash
shasum -a 256 Self-Directed-*   # macOS / Linux
```

## 4. 同步 Gitee Release

同一份产物上传到 Gitee（二选一）：

**脚本（配置了 `GITEE_TOKEN` 时）**

```bash
export GITEE_TOKEN=...
export GITEE_OWNER=<owner>
export GITEE_REPO=<repo>
export TAG=v1.1.0
node scripts/gitee-release.mjs   # 需要本地 release/ 目录；CI 产物请先下载到 release/
```

**手动**

Gitee 仓库 → 发行版 → 新建 `v1.1.0` → 上传与 GitHub 相同的附件 → 说明粘贴同一份发行说明。

## 5. 发版后检查

- README 的下载链接指向最新 Release（或 Releases 页面）；
- 已安装用户点「帮助 → 检查更新」：应显示「已是最新版本」；
- 下一版开发时无需改版本号；发布新版本时同步升 `package.json` 并新增
  `docs/releases/vX.Y.Z.md`；
- 关注 Issue / 微信反馈，出现严重问题走 1.1.1 修复版。

## 6. 回滚（仅在版本不可用时）

1. 先发 `v1.1.1` 修复版（优先，避免用户卡在坏版本）；
2. 如需隐藏坏版本：GitHub Release 取消勾选「Latest」或删除该 Release（tag 可保留）；
3. Gitee 同步删除或标记；
4. 不要强推历史；版本号只增不减。

## 附：发布检查清单

- [ ] `main` CI / Desktop 绿
- [ ] `package.json` = 1.1.0，tag = `v1.1.0`
- [ ] `SDL_GITEE_UPDATE_BASE_URL` 已设置
- [ ] tag 推送后三平台 job 全绿（含 Windows 冒烟）
- [ ] GitHub Release 六个附件齐全
- [ ] Windows 安装版 / 便携版各冒烟一次
- [ ] SHA256 已附
- [ ] Gitee Release 已镜像
- [ ] 已安装旧版能检查更新
- [ ] README / 欢迎弹窗里的反馈微信可用
