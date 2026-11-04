#!/usr/bin/env node
/**
 * 把 release/ 下的安装包同步到 Gitee Releases（可选）。
 *
 * 需要环境变量：
 *   GITEE_TOKEN   Gitee 私人令牌（projects 权限）
 *   GITEE_OWNER   仓库 owner
 *   GITEE_REPO    仓库名
 *   TAG           版本 tag，例如 v1.1.0
 *
 * 没有 token 时只打印手动步骤，不失败。
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const token = (process.env['GITEE_TOKEN'] ?? '').trim()
const owner = (process.env['GITEE_OWNER'] ?? '').trim()
const repo = (process.env['GITEE_REPO'] ?? '').trim()
const tag = (process.env['TAG'] ?? '').trim()
const dir = join(process.cwd(), 'release')

if (token === '' || owner === '' || repo === '' || tag === '') {
  console.log('未配置 GITEE_TOKEN / GITEE_OWNER / GITEE_REPO / TAG，跳过自动上传。')
  console.log('手动步骤：Gitee 仓库 → 发行版 → 新建 v<版本> → 上传 release/ 下的安装包与 zip。')
  process.exit(0)
}

const api = `https://gitee.com/api/v5/repos/${owner}/${repo}`

async function createRelease() {
  const response = await fetch(`${api}/releases`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      access_token: token,
      tag_name: tag,
      name: tag,
      body: `自我导向学习辅助器 ${tag}`,
      target_commitish: 'main',
    }),
  })
  if (!response.ok) {
    throw new Error(`创建 Gitee Release 失败：HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json()).id
}

async function upload(releaseId) {
  const files = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile())
  for (const name of files) {
    const form = new FormData()
    form.append('access_token', token)
    const data = await import('node:fs/promises').then((fs) => fs.readFile(join(dir, name)))
    form.append('file', new Blob([data]), name)
    const response = await fetch(`${api}/releases/${releaseId}/attach_files`, {
      method: 'POST',
      body: form,
    })
    console.log(`${name}: ${response.ok ? '已上传' : `失败 HTTP ${response.status}`}`)
  }
}

const releaseId = await createRelease()
await upload(releaseId)
console.log(`Gitee Release ${tag} 已更新`)
