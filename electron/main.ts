import { appendFileSync } from 'node:fs'
import { app, BrowserWindow, dialog, Menu, safeStorage, shell } from 'electron'
import { serve } from '@hono/node-server'
import { join } from 'node:path'
import { createApp } from '../src/app.js'
import { bootstrapVaultIfEmpty } from '../src/vault/bootstrap.js'
import { buildMenuTemplate } from './menu.js'
import { resolveVaultLocation } from './paths.js'
import { createSafeStorageSecrets } from './secrets.js'
import { checkForUpdates } from './updater.js'
import { exportZipToFile, importZipFromFile } from './zip-actions.js'

let mainWindow: BrowserWindow | null = null
let server: { close: (callback?: () => void) => void } | null = null
let baseUrl = ''

function logBoot(step: string): void {
  try {
    appendFileSync(
      join(app.getPath('temp'), 'sdl-desktop.log'),
      `${new Date().toISOString()} ${step}\n`,
    )
  } catch {
    /* 日志失败不影响启动 */
  }
}

logBoot('module loaded')

function waitForHealth(port: number, timeoutMs = 20_000): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async (): Promise<void> => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/healthz`)
        if (response.ok) return resolve()
      } catch {
        /* 服务还没起来 */
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('本地服务启动超时（/healthz 无响应）'))
        return
      }
      setTimeout(() => void tick(), 300)
    }
    void tick()
  })
}

async function startLocalServer(
  vaultRoot: string,
  webRoot: string,
): Promise<{ port: number; close: () => void }> {
  const secrets = createSafeStorageSecrets(join(vaultRoot, '.sdl-secrets.json'), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (value) => safeStorage.encryptString(value),
    decryptString: (value) => safeStorage.decryptString(value),
  })
  const appServer = createApp({ vaultPath: vaultRoot, webRoot, secrets })

  return new Promise((resolve, reject) => {
    try {
      const instance = serve({ fetch: appServer.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        resolve({
          port: info.port,
          close: () => {
            instance.close()
          },
        })
      })
      server = instance
    } catch (error) {
      reject(error)
    }
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#edf0e6',
    title: '自我导向学习辅助器',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(baseUrl)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  window.on('closed', () => {
    mainWindow = null
  })

  void window.loadURL(baseUrl)
  return window
}

function showHelp(): void {
  void dialog.showMessageBox({
    type: 'info',
    message: '使用说明',
    detail: [
      '1. 在「目标」写下想学的东西和一句可判定的成功判据；',
      '2. 右上角钥匙图标 → API Key，填入自己的 DeepSeek Key（可选 Tavily）；',
      '3. 去「地图」点「AI 自动生成知识地图」，或在「路径」生成学习路径；',
      '',
      '数据目录可在「文件 → 打开数据目录」里找到，整库可导出 zip 备份。',
      '反馈微信：wxid_0bz0pezewo1w22（备注「学习辅助器」）。',
    ].join('\n'),
  })
}

function showAbout(): void {
  void dialog.showMessageBox({
    type: 'info',
    message: '自我导向学习辅助器',
    detail: [
      `版本：${app.getVersion()}`,
      `Electron：${process.versions.electron}`,
      `Node：${process.versions.node}`,
      '',
      '源码可见 · 非商业免费；商用需单独授权。',
    ].join('\n'),
  })
}

function installMenu(port: number): void {
  const actions = {
    openDataDir: () => {
      const location = resolveVaultLocation({
        isPackaged: app.isPackaged,
        portableDir: process.env['PORTABLE_EXECUTABLE_DIR'],
        appImagePath: process.env['APPIMAGE'],
        userData: app.getPath('userData'),
        devVault: join(app.getAppPath(), 'vault'),
      })
      void shell.openPath(location.vaultRoot)
    },
    importZip: () => {
      void (async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          title: '导入 zip',
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
          properties: ['openFile'],
        })
        const filePath = filePaths[0]
        if (canceled || filePath === undefined) return
        try {
          const result = await importZipFromFile(baseUrl, filePath)
          await dialog.showMessageBox({
            message: '导入完成',
            detail: `导入 ${result.imported} 个文件，跳过 ${result.skipped} 个`,
          })
        } catch (error) {
          await dialog.showMessageBox({
            type: 'error',
            message: '导入失败',
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      })()
    },
    exportZip: () => {
      void (async () => {
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: '导出整库 zip',
          defaultPath: 'sdl-export.zip',
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        })
        if (canceled || filePath === undefined) return
        try {
          await exportZipToFile(baseUrl, filePath)
          await dialog.showMessageBox({ message: '导出完成', detail: filePath })
        } catch (error) {
          await dialog.showMessageBox({
            type: 'error',
            message: '导出失败',
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      })()
    },
    showHelp,
    checkUpdates: () => {
      void checkForUpdates(true)
    },
    showAbout,
  }
  void port
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(actions)))
}

async function bootstrap(): Promise<void> {
  const repoRoot = app.getAppPath()
  const location = resolveVaultLocation({
    isPackaged: app.isPackaged,
    portableDir: process.env['PORTABLE_EXECUTABLE_DIR'],
    appImagePath: process.env['APPIMAGE'],
    userData: app.getPath('userData'),
    devVault: join(repoRoot, 'vault'),
  })

  const seedsDir = app.isPackaged ? join(process.resourcesPath, 'seeds') : join(repoRoot, 'seeds')
  const webRoot = app.isPackaged
    ? join(process.resourcesPath, 'web')
    : join(repoRoot, 'dist', 'web')

  bootstrapVaultIfEmpty(location.vaultRoot, seedsDir)
  process.env['SDL_APP_VERSION'] = app.getVersion()

  const started = await startLocalServer(location.vaultRoot, webRoot)
  baseUrl = `http://127.0.0.1:${started.port}`
  server = { close: () => started.close() }

  await waitForHealth(started.port)
  mainWindow = createWindow()
  installMenu(started.port)
  console.log(`[sdl] 桌面版已启动：${baseUrl}（库：${location.vaultRoot}）`)

  if (app.isPackaged) {
    setTimeout(() => void checkForUpdates(false), 4000)
  }
}

logBoot('requesting single instance lock')
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  logBoot('no lock, quitting')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    logBoot('app ready')
    try {
      logBoot('bootstrap start')
      await bootstrap()
      logBoot('bootstrap done')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logBoot(`bootstrap failed: ${message}`)
      dialog.showErrorBox('启动失败', message)
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    server?.close()
  })
}
