export interface HostDecision {
  host: string
  /** 是否必须登录（设了 token 或对外监听） */
  requiresAuth: boolean
  /** 不可启动的原因；存在时调用方应退出码 1 */
  error?: string
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function isLocal(host: string): boolean {
  return LOCAL_HOSTS.has(host)
}

export function resolveHost(env: NodeJS.ProcessEnv = process.env): HostDecision {
  const raw = (env['HOST'] ?? '').trim()
  const host = raw === '' ? '127.0.0.1' : raw
  const token = (env['SDL_ACCESS_TOKEN'] ?? '').trim()
  // 容器里必须监听 0.0.0.0，但对外暴露由 `127.0.0.1:3000` 的端口映射限制
  const behindProxy = (env['SDL_BEHIND_PROXY'] ?? '').trim() === '1'

  if (isLocal(host)) {
    return { host, requiresAuth: token !== '' }
  }

  if (token === '' && behindProxy) {
    return { host, requiresAuth: false }
  }

  if (token === '') {
    return {
      host,
      requiresAuth: true,
      error:
        `拒绝启动：HOST=${host} 对外监听，但没有 SDL_ACCESS_TOKEN。\n` +
        '  先设置一个长随机字符串，再重试：\n' +
        '    Windows:      set SDL_ACCESS_TOKEN=<随机字符串>\n' +
        '    macOS/Linux:  export SDL_ACCESS_TOKEN=<随机字符串>\n' +
        '  只想本地使用就别设 HOST（默认 127.0.0.1）。',
    }
  }

  return { host, requiresAuth: true }
}
