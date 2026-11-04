import type { Frontmatter } from '../vault/document.js'
import { VaultError } from '../vault/errors.js'
import { readDocument, updateDocument, writeDocument } from '../vault/io.js'
import { PROFILE_RELATIVE_PATH } from '../vault/paths.js'
import { LEVELS, MEDIA_PREFERENCES, assertOneOf } from './vocabulary.js'
import { requirePositiveInt } from './validate.js'

/**
 * 学习者画像 —— 单例文件 `00-配置/profile.md`。
 * 它是资源推荐排序的输入：`level` / `media_preference` / `time_budget` 三个因子都在这里。
 * 单例文件不适用 `{id} {title}.md` 命名规则（命名规则的例外条款）。
 */
export const PROFILE_PATH = PROFILE_RELATIVE_PATH

export interface Profile {
  id: string
  /** 入门 / 进阶 / 熟练 */
  level: string
  /** 视频 / 文字 / 不限 */
  mediaPreference: string
  /** 每周可用**小时数**（`seeds/00-配置/profile.md` 的字段语义）。排序时换算成分钟与 `duration_min` 比较 */
  timeBudget: number
  relativePath: string
}

export interface ProfilePatch {
  level?: string
  mediaPreference?: string
  timeBudget?: number
}

/** 新建画像时的默认值：与 `ensureVaultStructure` 生成的模板一致 */
export const PROFILE_DEFAULTS = {
  level: '入门',
  mediaPreference: '不限',
  timeBudget: 5,
} as const

export function readProfile(root: string): Profile {
  const doc = readDocument(root, PROFILE_PATH)
  return toProfile(doc.relativePath, doc.data)
}

/**
 * 宽容版读取：画像文件缺失时回落默认值。
 * 排序是只读派生计算，不该因为用户删掉了画像文件而让整个页面报错。
 */
export function readProfileOrDefault(root: string): Profile {
  try {
    return readProfile(root)
  } catch (error) {
    if (error instanceof VaultError && error.code === 'NOT_FOUND') {
      return { id: '', ...PROFILE_DEFAULTS, relativePath: PROFILE_PATH }
    }
    throw error
  }
}

export function writeProfile(root: string, patch: ProfilePatch = {}): Profile {
  const fields: Frontmatter = {}
  if (patch.level !== undefined) {
    fields['level'] = assertOneOf(LEVELS, patch.level, 'level')
  }
  if (patch.mediaPreference !== undefined) {
    fields['media_preference'] = assertOneOf(
      MEDIA_PREFERENCES,
      patch.mediaPreference,
      'media_preference',
    )
  }
  if (patch.timeBudget !== undefined) {
    fields['time_budget'] = requirePositiveInt(patch.timeBudget, 'time_budget')
  }

  if (profileExists(root)) {
    // 走 updateDocument：它会保留原有 id 与 type，不会额外生成新 id
    updateDocument({ root, relativePath: PROFILE_PATH, frontmatter: fields })
  } else {
    writeDocument({
      root,
      path: PROFILE_PATH,
      type: 'profile',
      frontmatter: {
        level: PROFILE_DEFAULTS.level,
        media_preference: PROFILE_DEFAULTS.mediaPreference,
        time_budget: PROFILE_DEFAULTS.timeBudget,
        ...fields,
      },
    })
  }

  return readProfile(root)
}

function profileExists(root: string): boolean {
  try {
    readDocument(root, PROFILE_PATH)
    return true
  } catch (error) {
    if (error instanceof VaultError && error.code === 'NOT_FOUND') return false
    throw error
  }
}

function toProfile(relativePath: string, data: Frontmatter): Profile {
  const budget = Number(data['time_budget'])
  return {
    id: String(data['id'] ?? ''),
    level: String(data['level'] ?? PROFILE_DEFAULTS.level),
    mediaPreference: String(data['media_preference'] ?? PROFILE_DEFAULTS.mediaPreference),
    // 字段只增不改、缺失取默认值；被手改成非数时同样回落，而不是让排序算出 NaN
    timeBudget: Number.isFinite(budget) && budget > 0 ? budget : PROFILE_DEFAULTS.timeBudget,
    relativePath,
  }
}
