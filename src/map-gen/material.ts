/** 把粘贴的材料切成「小节」：去掉空行与纯装饰行（分隔线、表格线） */
export function splitSections(material: string): string[] {
  return material
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .filter((line) => !/^[-=_*~]{3,}$/.test(line))
}

/** 按小节数切块；size 至少为 1 */
export function chunkSections(sections: readonly string[], size = 8): string[][] {
  const step = Math.max(1, Math.floor(size))
  const chunks: string[][] = []
  for (let index = 0; index < sections.length; index += step) {
    chunks.push(sections.slice(index, index + step))
  }
  return chunks
}
