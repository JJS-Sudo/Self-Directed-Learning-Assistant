# 阶段 11 · 开源发布准备 —— 验收与门禁

> 配套：`requirements.md`、`plan.md`

## 1. 合并门禁

| #   | 门禁                                                                                                     | 证据                |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------- |
| G1  | CI 五项全绿（typecheck / lint / test / e2e / docker）                                                    | Actions             |
| G2  | **当前仓库不再跟踪私人库**：`git ls-files` 里没有 `自我导向学习项目运行库`                               | 命令输出            |
| G3  | **快照干净**：生成目录里 grep 私人库名、`sk-`、`tvly-` 为空；只有一条提交                                | 命令输出            |
| G4  | **快照可跑（Node）**：`npm ci && npm run build && npm start` → `vault/` 自动生成 → `POST /api/goals` 201 | 命令输出            |
| G5  | **快照可跑（Docker）**：`docker compose up` 到浏览器可用                                                 | 命令 + 截图         |
| G6  | **首启建库安全**：空目录自动建；非空无标记目录拒绝写入且服务仍起                                         | 单测 + 启动日志     |
| G7  | **README 达标**：第一屏能回答「装什么、怎么起、要不要钱、能不能商用」                                    | 人工核对            |
| G8  | **授权**：LICENSE 为 PolyForm Noncommercial 1.0.0；README 写明非商业 + 商用联系微信                      | 文件核对            |
| G9  | **截图**：4 张存在、来自 seeds、无真实目标                                                               | `docs/screenshots/` |
| G10 | **双发可用**：快照目录可直接 push 到 GitHub 与 Gitee（无硬编码单一远程）                                 | 发布说明            |
| G11 | **真实库零改动**：`git status` 干净；本地文件仍可正常读写                                                | 命令输出            |

---

## 2. 验收场景

### V1 · 当前仓库脱钩

```bash
git ls-files | grep 自我导向学习项目运行库   # 无输出
Test-Path 自我导向学习项目运行库              # True（本地文件还在）
```

### V2 · 快照

```bash
node scripts/public-snapshot.mjs --out ..\sdl-public
cd ..\sdl-public
git log --oneline          # 只有一条 chore: public snapshot
Test-Path 自我导向学习项目运行库   # False
grep -rE "sk-[a-zA-Z0-9]{20,}|tvly-[a-zA-Z0-9]{20,}" . --exclude-dir=.git   # 无
cat .sdlrc.json            # {"vaultPath":"./vault"}
```

### V3 · 快照里跑（Node）

```bash
npm ci
npm run build
npm start
curl -X POST localhost:3000/api/goals -H "content-type: application/json" -d '{"title":"第一个目标","kind":"常规"}'
# 201，且 vault/10-目标 出现文件
```

### V4 · 快照里跑（Docker）

```bash
docker compose up -d --build
# 浏览器 http://127.0.0.1:3000 能打开，首屏有欢迎弹窗
```

### V5 · 授权与文档

1. README 第一屏出现「非商业免费 / 商用需授权」；
2. LICENSE 文件存在且为 PolyForm Noncommercial 1.0.0；
3. 微信 `wxid_0bz0pezewo1w22` 在 README 与欢迎弹窗里都能找到；
4. 不再出现「阶段 1 / 186 个测试 / 六区」等过时描述。

### V6 · 截图

1. `docs/screenshots/home.png`、`map.png`、`path.png`、`quality.png` 存在；
2. 截图里没有真实目标名；
3. README 正确引用。

---

## 3. 不通过的样子

- `git ls-files` 仍能看到私人库文件。
- 快照历史带原仓库提交，或 grep 出真实目标名/密钥。
- 新克隆要手改 `.sdlrc.json` 才能建目标。
- 首启逻辑覆盖了非空目录，或吞掉「缺标记」检查。
- README 仍写「阶段 1」「六区」「186 个测试」。
- 许可证写成 MIT/Apache 或没有 LICENSE。
- 截图来自真实库。
- 为了发布而重写/强推当前仓库历史。

---

## 4. 本阶段不验证

| 内容                             | 归属    |
| -------------------------------- | ------- |
| Windows 便携包 / Electron 安装包 | 阶段 12 |
| Gitee 的 CI 流水线               | 不要求  |
| 英文文档                         | 未排期  |
| 商用授权合同模板                 | 线下    |

---

## 5. 评审者 5 分钟检查单

1. `git ls-files` 里还有私人库吗？
2. 快照目录能 `npm start` 并自动建出 `vault/` 吗？
3. 快照里 grep 得到真实目标或密钥吗？
4. README 第一屏能回答「装什么、怎么起、能不能商用」吗？
5. LICENSE 是 PolyForm Noncommercial 吗？商用微信在吗？
6. 截图是 seeds 演示库吗？
