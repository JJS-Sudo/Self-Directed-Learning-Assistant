import { app, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  GITEE_UPDATE_BASE,
  GITHUB_UPDATE_BASE,
  isNewerVersion,
  updateFeedUrls,
} from './update-config.js'

/**
 * 检查更新：GitHub 为主源，失败回退 Gitee；开发模式与未配置源时给出可读提示。
 * macOS 未签名时自动安装不可用，只提示手动下载。
 */
export async function checkForUpdates(manual: boolean): Promise<void> {
  if (!app.isPackaged) {
    if (manual) {
      await dialog.showMessageBox({
        type: 'info',
        message: '开发模式不检查更新',
        detail: '打包后的安装版才会连接更新源。',
      })
    }
    return
  }

  const version = app.getVersion()
  const urls = updateFeedUrls(version, GITHUB_UPDATE_BASE, GITEE_UPDATE_BASE)
  if (urls.length === 0) {
    if (manual) {
      await dialog.showMessageBox({
        type: 'warning',
        message: '未配置更新源',
        detail: '构建时需要设置 SDL_UPDATE_BASE_URL / SDL_GITEE_UPDATE_BASE_URL。',
      })
    }
    return
  }

  let lastError = ''
  for (const url of urls) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url })
      const result = await autoUpdater.checkForUpdates()
      const remote = result?.updateInfo.version

      if (remote === undefined || !isNewerVersion(version, remote)) {
        if (manual) {
          await dialog.showMessageBox({
            type: 'info',
            message: '已是最新版本',
            detail: `当前版本 ${version}`,
          })
        }
        return
      }

      if (process.platform === 'darwin') {
        await dialog
          .showMessageBox({
            type: 'info',
            message: `发现新版本 ${remote}`,
            detail: 'macOS 版未签名，自动安装不可用；请到发布页下载新版本覆盖。',
            buttons: ['打开下载页', '稍后'],
          })
          .then(async ({ response }) => {
            if (response === 0) await shell.openExternal(url)
          })
        return
      }

      const { response } = await dialog.showMessageBox({
        type: 'info',
        message: `发现新版本 ${remote}`,
        detail: '下载完成后会自动安装并重启。',
        buttons: ['下载并安装', '稍后'],
        defaultId: 0,
      })
      if (response === 0) {
        await autoUpdater.downloadUpdate()
        autoUpdater.quitAndInstall()
      }
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      continue
    }
  }

  if (manual) {
    await dialog.showMessageBox({
      type: 'warning',
      message: '检查更新失败',
      detail: `所有更新源都不可用。${lastError === '' ? '' : `\n${lastError}`}`,
    })
  }
}
