import { describe, expect, it } from 'vitest'
import { isNewerVersion, updateFeedUrls } from '../electron/update-config.js'

describe('更新源', () => {
  it('GitHub 优先、Gitee 其次，去掉多余尾斜杠', () => {
    expect(
      updateFeedUrls(
        '1.1.0',
        'https://github.com/o/r/releases/download/',
        'https://gitee.com/o/r/releases/download',
      ),
    ).toEqual([
      'https://github.com/o/r/releases/download/v1.1.0',
      'https://gitee.com/o/r/releases/download/v1.1.0',
    ])
  })

  it('空源会被跳过', () => {
    expect(updateFeedUrls('1.1.0', '', 'https://gitee.com/o/r/releases/download')).toEqual([
      'https://gitee.com/o/r/releases/download/v1.1.0',
    ])
  })

  it('版本比较', () => {
    expect(isNewerVersion('1.1.0', '1.2.0')).toBe(true)
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(false)
    expect(isNewerVersion('1.2.0', 'v1.2.0')).toBe(false)
    expect(isNewerVersion('1.2', '1.2.0')).toBe(false)
    expect(isNewerVersion('1.2.0', '1.10.0')).toBe(true)
  })
})
