# 目标编辑与回收站 —— 实施规划

## 1. 决策记录（已与用户确认）

| #   | 决策     | 结论                                            |
| --- | -------- | ----------------------------------------------- |
| 1   | 对象     | 学习目标（`10-目标` 的 Goal）                   |
| 2   | 可改字段 | 标题、成功判据、期限与类型、状态；不改预算      |
| 3   | 状态     | 在用 / 暂停 / 已完成 / 已归档                   |
| 4   | 删除     | 软删除到 `99-回收站`，可恢复                    |
| 5   | 级联     | 节点 / 路径 / 验收 / 复盘随目标分区一起进回收站 |
| 6   | 共享资源 | 只解除本目标节点关联，资源文件保留              |
| 7   | 独占资源 | 随目标一起进回收站                              |
| 8   | 回收站   | 列表 + 恢复 + 彻底删除                          |
| 9   | 删除确认 | 普通二次确认弹窗（不要求输入标题）              |
| 10  | 界面     | 目标卡片「⋯」菜单；回收站放目标页底部折叠区     |
| 11  | 历史     | 只记 `updated_at`                               |
| 12  | 完成     | 不强制验收/复盘，只提示                         |
| 13  | 归档     | 只改状态、隐藏，不移动文件                      |
| 14  | 改名     | 目标文件与分区目录一起改名，id 不变             |
| 15  | 范围     | 目标编辑 + 状态 + 软删除/回收站；版本 1.3.0     |

## 2. 现状

| 现状                                                            | 差距                                     |
| --------------------------------------------------------------- | ---------------------------------------- |
| `createGoal` / `listGoals` / `getGoal`，无 PATCH/DELETE         | 需要编辑、软删除、回收站 API             |
| 目标文件 `10-目标/<id> <title>.md`                              | 改名要同步文件名                         |
| 分区 `20-学习项目/<id> <title>/` 含 `知识网/学习路径/验收/复盘` | 删除要整目录移动，不能只删目标文件       |
| 资源 `40-资源/` 可被多个目标共享（`nodeIds`）                   | 删除前要判断独占/共享                    |
| `status` 只有创建时的「在用」                                   | 需要四状态与归档筛选                     |
| 目标索引 `readGoals` 有缓存                                     | 改名/删除/恢复后要强制重建               |
| 目标页只有创建与列表                                            | 需要卡片菜单、编辑弹窗、删除确认、回收站 |

## 3. 架构

```
PATCH /api/goals/:id ──► updateGoal()
                           ├─ 字段校验
                           ├─ 改标题 → renameGoalFile + renamePartition
                           └─ updated_at + 重建索引

DELETE /api/goals/:id ─► trashGoal()
                           ├─ 计算节点与资源归属
                           ├─ 独占资源 → 99-回收站/<ts>-<id>/resources/
                           ├─ 共享资源 → detachNodeFromResource
                           ├─ 分区目录 → 99-回收站/<ts>-<id>/partition/
                           ├─ 目标文件 → 99-回收站/<ts>-<id>/goal.md
                           └─ manifest.json + 重建索引

GET /api/trash ────────► listTrash() 读 manifest
POST /api/trash/:id/restore ─► restoreTrash()（id/路径冲突 409）
DELETE /api/trash/:id ───────► purgeTrash()（rm -rf 条目）
```

### 3.1 文件布局

```
99-回收站/
  <YYYYMMDD-HHmmss>-<goalId>/
    manifest.json
    goal.md
    partition/
      知识网/ 学习路径/ 验收/ 复盘/
    resources/
      <原相对路径>
```

### 3.2 关键算法

**独占 vs 共享资源**

```ts
const goalNodes = new Set(listNodes(root, goalId).map((n) => n.id))
for (const resource of listAllResources(root)) {
  const owned = resource.nodeIds.filter((id) => goalNodes.has(id))
  if (owned.length === 0) continue
  if (resource.nodeIds.every((id) => goalNodes.has(id))) {
    exclusive.push(resource) // 全部属于本目标
  } else {
    shared.push({ resource, owned }) // 至少一个节点属于其他目标
  }
}
```

**软删除的顺序与回滚**

1. 建回收站条目目录；
2. 先写 manifest（记录计划路径与已移动项）；
3. 移动独占资源（记录每项）；
4. 移动分区目录；
5. 移动目标文件；
6. 重建索引。

任一步抛错：按已移动项逆序移回，删除空条目目录，再抛错。
**禁止**先删文件再写 manifest。

**恢复**

1. 读 manifest，校验 goalId 不存在（否则 409）；
2. 校验 `10-目标/<id> <title>.md` 与 `20-学习项目/<id> <title>/` 均不存在；
3. 移回目标文件、分区目录、独占资源；
4. 对 `sharedResources` 的每个节点重新 `attachNodeToResource`；
5. 删除条目目录，重建索引。

### 3.3 改名

- 用 `renameSync` 原地改名；
- 目标文件名：`<id> <旧标题>.md` → `<id> <新标题>.md`；
- 分区目录：`<id> <旧标题>/` → `<id> <新标题>/`；
- 先重命名目标文件，再重命名分区；第二步失败时把目标文件改回；
- 目标 frontmatter 的 `title` 同步更新；
- 新路径已存在 → 409，不覆盖。

## 4. 任务组

### T1 目标领域：更新、状态、updated_at（0.5 天）

- `GoalSummary` 加 `updatedAt`；
- `createGoal` 写 `updated_at`；
- `updateGoal({ root, id, patch })`：字段合并、校验、`updated_at`；
- `setGoalStatus` 可复用 `updateGoal`；
- `PATCH /api/goals/:id` schema：至少一个字段，空对象 400；
- 测试：改判据/期限/状态；激励性无期限 400；旧文件无 `updated_at` 兼容。

### T2 改名（0.5 天）

- `renameGoal({ root, id, title })`：目标文件 + 分区目录 + frontmatter；
- 冲突 409；第二步失败回滚；
- 强制重建索引；
- 测试：文件与目录同步改名；id/节点/资源关联不变；冲突不覆盖。

### T3 回收站领域（1.5 天）

- 新增 `src/domain/goal-trash.ts`；
- `trashGoal`：归属计算、独占资源移动、共享资源 detach、分区与目标移动、manifest；
- `listTrash`：读 manifest，返回条目摘要；
- `restoreTrash`：冲突校验、移回、共享关联恢复、清理条目；
- `purgeTrash`：删除整个条目；
- 测试：独占/共享、级联、恢复、彻底删除、id 冲突、路径冲突、回滚（可用 mock 制造失败）。

### T4 API（0.5 天）

- `PATCH /api/goals/:id`；
- `DELETE /api/goals/:id` → `{ trashId }`；
- `GET /api/trash`、`POST /api/trash/:id/restore`、`DELETE /api/trash/:id`；
- `GET /api/goals?includeArchived=1`；
- 错误映射：400/404/409/500；
- 测试：状态码、回收站生命周期。

### T5 目标页 UI（1.5 天）

- 卡片「⋯」菜单：编辑 / 状态 / 删除；
- 编辑弹窗：标题、类型、期限、成功判据、状态；保存后刷新；
- 删除确认弹窗：显示节点/路径/资源数量；
- 状态徽标与「显示已归档」开关；
- 测试：打开编辑、保存 payload、删除确认、归档筛选。

### T6 回收站 UI（1 天）

- 目标页底部折叠区；
- 条目：标题、删除时间、节点/资源数、恢复、彻底删除；
- 恢复/彻底删除二次确认；
- 空状态；
- 测试：列表、恢复、彻底删除调用。

### T7 一致性加固（0.5 天）

- 索引重建：改名、删除、恢复后调用 `forceRebuild`；
- 路径安全检查（库根内）；
- 失败回滚测试；
- 孤儿资源不误删；
- 全量 `npm test`、lint、typecheck。

### T8 文档与版本（0.5 天）

- README 目标管理说明；
- CHANGELOG、版本 1.3.0；
- roadmap 阶段 14；
- 桌面/微信包发布准备。

**合计约 6 个工作日。**

## 5. 文件影响

| 文件                                    | 动作                                              |
| --------------------------------------- | ------------------------------------------------- |
| `src/domain/goals.ts`                   | `updatedAt`、`updateGoal`、`renameGoal`、状态校验 |
| `src/domain/goal-trash.ts`              | **新增**：软删除、列表、恢复、彻底删除、manifest  |
| `src/vault/paths.ts`                    | 新增 `TRASH_DIR = '99-回收站'`                    |
| `src/api/goals.ts`                      | `patchGoalSchema`、`updateGoal` DTO               |
| `src/app.ts`                            | PATCH/DELETE/trash 路由、`includeArchived`        |
| `web/src/pages/GoalsPage.tsx`           | 卡片菜单、编辑弹窗、删除确认、回收站、归档开关    |
| `web/src/components/GoalEditDialog.tsx` | **新增**                                          |
| `web/src/components/TrashPanel.tsx`     | **新增**                                          |
| `web/src/styles/base.css`               | 菜单、弹窗、徽标、回收站样式                      |
| `tests/goal-edit.test.ts`               | 新增                                              |
| `tests/goal-trash.test.ts`              | 新增                                              |
| `tests/api-goals-trash.test.ts`         | 新增                                              |
| `web/src/__tests__/goals-page.test.tsx` | 扩展                                              |

## 6. 风险与对策

| 风险                    | 对策                                                   |
| ----------------------- | ------------------------------------------------------ |
| 跨目录移动非事务，半删  | manifest 先写 + 已移动项逆序回滚；测试注入失败         |
| 共享资源误删            | 只有全部 `nodeIds` 都属于该目标才算独占；否则只 detach |
| 改名冲突                | 409 拒绝，不自动加后缀、不覆盖                         |
| 索引缓存导致列表残留    | 改名/删除/恢复后强制 `forceRebuild`                    |
| 恢复时 id 冲突          | 409，提示先处理同名目标                                |
| 旧目标没有 `updated_at` | 读取回退 `created_at`，不批量迁移                      |
| 回收站无限增长          | 先手动彻底删除；自动过期留后续                         |

## 7. 验收门槛

- 全量测试、lint、typecheck 绿；
- 改名后文件/目录/id/关联一致；
- 删除 → 回收站 → 恢复全链路通过；
- 共享资源删除后仍在，关联正确；
- 彻底删除不可恢复；
- 归档筛选、状态切换、`updated_at` 可见。

## 8. 实现记录（2026-11-04）

T1–T8 已完成：

- `updateGoal`：标题/判据/类型/期限/状态 + `updated_at`；改标题同步目标文件与分区目录，冲突 409，移动失败回滚；
- `goal-trash.ts`：manifest 先写、独占资源移动、共享资源 detach、分区与目标移动、失败回滚；恢复/彻底删除/列表；
- API：`PATCH /api/goals/:id`、`DELETE /api/goals/:id`、`GET /api/trash`、`POST /api/trash/:id/restore`、`DELETE /api/trash/:id`、`includeArchived`；
- UI：卡片「⋯」菜单、编辑弹窗、删除确认、状态徽标、显示已归档、回收站折叠区；
- 版本 1.3.0；新增 `docs/releases/v1.3.0.md`；
- 测试：**528 条全绿**，lint / typecheck 通过；删除/恢复/共享资源/改名均有领域与 API 测试。
