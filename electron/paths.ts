import { dirname, join } from 'node:path'

export interface VaultLocationInput {
  isPackaged: boolean
  /** 便携版可执行文件所在目录（electron-builder portable 注入） */
  portableDir?: string | undefined
  /** Linux AppImage 路径（运行时的 APPIMAGE 环境变量） */
  appImagePath?: string | undefined
  /** 安装版用户数据目录 */
  userData: string
  /** 开发模式使用仓库下的库 */
  devVault: string
}

export interface VaultLocation {
  vaultRoot: string
  portable: boolean
}

/**
 * 桌面版数据目录：
 * - 便携版：<exe 所在目录>/data/vault（拔盘即走）
 * - 安装版：userData/vault（卸载不误删）
 * - 开发：仓库下 ./vault
 */
export function resolveVaultLocation(input: VaultLocationInput): VaultLocation {
  if (input.portableDir !== undefined && input.portableDir.trim() !== '') {
    return { vaultRoot: join(input.portableDir, 'data', 'vault'), portable: true }
  }
  if (input.appImagePath !== undefined && input.appImagePath.trim() !== '') {
    return { vaultRoot: join(dirname(input.appImagePath), 'data', 'vault'), portable: true }
  }
  if (!input.isPackaged) return { vaultRoot: input.devVault, portable: false }
  return { vaultRoot: join(input.userData, 'vault'), portable: false }
}
