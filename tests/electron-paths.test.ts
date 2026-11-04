import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveVaultLocation } from '../electron/paths.js'

describe('桌面版数据目录', () => {
  it('便携版放在 exe 旁边的 data/vault', () => {
    const portableDir = join('portable', 'app')
    const location = resolveVaultLocation({
      isPackaged: true,
      portableDir,
      userData: join('users', 'a', 'sdl'),
      devVault: join('repo', 'vault'),
    })

    expect(location.portable).toBe(true)
    expect(location.vaultRoot).toBe(join(portableDir, 'data', 'vault'))
  })

  it('Linux AppImage 放在 AppImage 旁边的 data/vault', () => {
    const appImage = join('home', 'a', 'Apps', 'sdl.AppImage')
    const location = resolveVaultLocation({
      isPackaged: true,
      appImagePath: appImage,
      userData: join('home', 'a', '.config', 'sdl'),
      devVault: join('repo', 'vault'),
    })

    expect(location.portable).toBe(true)
    expect(location.vaultRoot).toBe(join('home', 'a', 'Apps', 'data', 'vault'))
  })

  it('安装版放在 userData/vault', () => {
    const userData = join('users', 'a', 'sdl')
    const location = resolveVaultLocation({
      isPackaged: true,
      userData,
      devVault: join('repo', 'vault'),
    })

    expect(location.portable).toBe(false)
    expect(location.vaultRoot).toBe(join(userData, 'vault'))
  })

  it('开发模式用仓库下的 ./vault', () => {
    const devVault = join('repo', 'vault')
    expect(
      resolveVaultLocation({
        isPackaged: false,
        userData: join('users', 'a', 'sdl'),
        devVault,
      }).vaultRoot,
    ).toBe(devVault)
  })
})
