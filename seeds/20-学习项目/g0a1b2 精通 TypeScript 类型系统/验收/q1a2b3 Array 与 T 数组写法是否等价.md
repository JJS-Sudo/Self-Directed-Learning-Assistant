---
id: q1a2b3
type: question
goal: '[[g0a1b2 精通 TypeScript 类型系统|精通 TypeScript 类型系统]]'
schema_version: 1
created_at: '2026-09-29T02:40:00Z'
kind: 封闭
stem: '在类型层面，`Array<T>` 与 `T[]` 是否等价？'
answer: 等价
node: '[[n2b3c4 泛型|泛型]]'
status: 在用
---

# Array 与 T 数组写法是否等价

<!-- sdl:begin -->
两者都表示「元素类型为 T 的数组」。`Array<T>` 是泛型写法，`T[]` 是它的简写；在只读场景下可以互换。
<!-- sdl:end -->

封闭题：必须同时有 `stem`、`answer`、`explanation`，缺任一项系统应拒绝录入。
解析（`explanation`）是长文本，按 Conventions 落在**正文受管区块**，不在 frontmatter。
