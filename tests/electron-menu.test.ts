import { describe, expect, it, vi } from 'vitest'
import { buildMenuTemplate } from '../electron/menu.js'

function labelsOf(template: ReturnType<typeof buildMenuTemplate>): string[] {
  const out: string[] = []
  const walk = (items: typeof template): void => {
    for (const item of items) {
      if (item.label !== undefined) out.push(item.label)
      if (Array.isArray(item.submenu)) walk(item.submenu)
    }
  }
  walk(template)
  return out
}

describe('原生菜单', () => {
  it('包含文件 / 视图 / 帮助与数据目录入口', () => {
    const labels = labelsOf(
      buildMenuTemplate({
        openDataDir: vi.fn(),
        importZip: vi.fn(),
        exportZip: vi.fn(),
        showHelp: vi.fn(),
        checkUpdates: vi.fn(),
        showAbout: vi.fn(),
      }),
    )

    expect(labels).toContain('打开数据目录')
    expect(labels).toContain('导入 zip…')
    expect(labels).toContain('导出 zip…')
    expect(labels).toContain('检查更新')
    expect(labels).toContain('关于')
  })

  it('不含 Obsidian', () => {
    const labels = labelsOf(
      buildMenuTemplate({
        openDataDir: vi.fn(),
        importZip: vi.fn(),
        exportZip: vi.fn(),
        showHelp: vi.fn(),
        checkUpdates: vi.fn(),
        showAbout: vi.fn(),
      }),
    )
    expect(labels.join(' ')).not.toMatch(/obsidian/i)
  })

  it('点击菜单项会调用对应动作', () => {
    const openDataDir = vi.fn()
    const template = buildMenuTemplate({
      openDataDir,
      importZip: vi.fn(),
      exportZip: vi.fn(),
      showHelp: vi.fn(),
      checkUpdates: vi.fn(),
      showAbout: vi.fn(),
    })

    const fileMenu = template.find((item) => item.label === '文件')
    const submenu = fileMenu?.submenu as { label?: string; click?: () => void }[]
    const item = submenu.find((entry) => entry.label === '打开数据目录')
    item?.click?.()

    expect(openDataDir).toHaveBeenCalledTimes(1)
  })
})
