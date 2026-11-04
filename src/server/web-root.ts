import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 构建产物与入口同层：`dist/index.js` → `dist/web/index.html`。
 * dev 下（`tsx src/index.ts`）算出来是 `src/web`，不存在，于是不托管网页 —— 前端由 Vite 负责。
 */
export function findWebRoot(baseDir: string): string | undefined {
  const candidate = join(baseDir, 'web')
  return existsSync(join(candidate, 'index.html')) ? candidate : undefined
}
