import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 只在「文件被直接执行」时跑 CLI 主体；被测试 import 时不产生副作用 */
export function isDirectRun(metaUrl: string, argv1: string | undefined = process.argv[1]): boolean {
  if (argv1 === undefined) return false
  const current = resolve(fileURLToPath(metaUrl))
  const invoked = resolve(argv1)
  return process.platform === 'win32'
    ? current.toLowerCase() === invoked.toLowerCase()
    : current === invoked
}

export interface ToolOptions {
  env?: NodeJS.ProcessEnv
  cwd?: string
  argv?: string[]
}
