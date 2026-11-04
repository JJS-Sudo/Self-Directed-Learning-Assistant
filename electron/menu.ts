import type { MenuItemConstructorOptions } from 'electron'

export interface MenuActions {
  openDataDir(): void
  importZip(): void
  exportZip(): void
  showHelp(): void
  checkUpdates(): void
  showAbout(): void
}

/** 原生菜单模板（纯函数，便于测试）。刻意不包含 Obsidian —— 产品已与它无关。 */
export function buildMenuTemplate(
  actions: MenuActions,
  platform: NodeJS.Platform = process.platform,
): MenuItemConstructorOptions[] {
  return [
    {
      label: '文件',
      submenu: [
        {
          label: '打开数据目录',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => actions.openDataDir(),
        },
        { type: 'separator' },
        { label: '导入 zip…', click: () => actions.importZip() },
        {
          label: '导出 zip…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => actions.exportZip(),
        },
        { type: 'separator' },
        platform === 'darwin'
          ? { role: 'close', label: '关闭窗口' }
          : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { type: 'separator' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'resetZoom', label: '重置缩放' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '使用说明', click: () => actions.showHelp() },
        { label: '检查更新', click: () => actions.checkUpdates() },
        { type: 'separator' },
        { label: '关于', click: () => actions.showAbout() },
      ],
    },
  ]
}
