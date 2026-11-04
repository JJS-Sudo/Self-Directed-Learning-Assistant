import { describe, expect, it } from 'vitest'

/**
 * `validation.md` #9：版本已锁定。
 * 课程第 5 讲的 Decision 要求 `hono` 写精确版本，不带 `^` / `~`。
 */
describe('版本已锁定', () => {
  it('package.json 里 hono 的值不含 ^ 或 ~', async () => {
    const { default: pkg } = (await import('../package.json', { with: { type: 'json' } })) as {
      default: { dependencies: Record<string, string> }
    }
    const version = pkg.dependencies['hono']

    expect(version).toBeTypeOf('string')
    expect(version).not.toMatch(/[\^~]/)
    expect(version).toBe('4.13.11')
  })
})
