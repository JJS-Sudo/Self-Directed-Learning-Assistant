/** 设置页的跨端契约 */
export interface KeyStatusDto {
  configured: boolean
  /** 只给尾部 4 位，例如 ••••abcd */
  mask?: string
  /** 来源：环境变量 / 页面保存 */
  source?: 'env' | 'page'
}

export interface KeysViewDto {
  deepseek: KeyStatusDto
  tavily: KeyStatusDto
}
