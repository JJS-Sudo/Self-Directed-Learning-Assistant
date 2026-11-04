/**
 * `/api/health` 的响应契约 —— **只有类型，没有运行时代码**。
 *
 * 前端用 `import type` 引用（编译后整条 import 消失），因此不需要 Vite 解析跨目录模块；
 * 服务端用同一个接口约束返回值。字段改动只有这一处。
 */
export interface HealthReport {
  service: 'self-directed-learning'
  /** 取自 package.json；读不到时回落 '0.0.0' */
  version: string
  vault: {
    /** 存在 && 是目录 && 有 `.sdl-vault` 标记 */
    ok: boolean
    marked: boolean
    /** 目录名，**不是绝对路径**：避免误公开时泄露用户名与内部目录结构 */
    name: string
    /** 仅在探测本身抛错时出现 */
    error?: string
  }
  index: {
    /** 真实读取库根索引：ok=已建且不过期；stale=源文件变了；absent=没有或损坏 */
    status: 'absent' | 'ok' | 'stale'
    note?: string
  }
  model: {
    /** 只检查 DEEPSEEK_API_KEY 是否存在；阶段 1 不发起真实调用 */
    configured: boolean
    provider: 'deepseek'
    /** SDL_LLM_MODEL，缺省 deepseek-chat */
    model: string
  }
}
