export const USAGE = [
  '用法：sdl [子命令]',
  '',
  '  sdl start      启动服务（默认）',
  '  sdl --help     显示本帮助',
  '  sdl --version  显示版本',
].join('\n')

export interface ParsedArgs {
  command: 'start' | 'help' | 'version'
  error?: string
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const first = argv[0]
  if (first === undefined || first === 'start') return { command: 'start' }
  if (first === '--help' || first === '-h') return { command: 'help' }
  if (first === '--version' || first === '-v') return { command: 'version' }
  return { command: 'help', error: `未知子命令：${first}\n${USAGE}` }
}
