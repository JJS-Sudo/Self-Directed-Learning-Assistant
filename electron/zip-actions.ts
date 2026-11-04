import { readFile, writeFile } from 'node:fs/promises'

async function assertOk(response: Response, action: string): Promise<void> {
  if (response.ok) return
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  throw new Error(body?.error?.message ?? `${action}失败：HTTP ${response.status}`)
}

/** 导出：调用本机服务的 /api/export，把 zip 写到用户选定位置 */
export async function exportZipToFile(
  baseUrl: string,
  targetPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${baseUrl}/api/export`)
  await assertOk(response, '导出')
  await writeFile(targetPath, Buffer.from(await response.arrayBuffer()))
}

/** 导入：读取用户选定的 zip，POST 到 /api/import */
export async function importZipFromFile(
  baseUrl: string,
  sourcePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ imported: number; skipped: number }> {
  const data = await readFile(sourcePath)
  const response = await fetchImpl(`${baseUrl}/api/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: data,
  })
  await assertOk(response, '导入')
  return (await response.json()) as { imported: number; skipped: number }
}
