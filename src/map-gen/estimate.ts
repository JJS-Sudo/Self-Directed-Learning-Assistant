import { chunkSections, splitSections } from './material.js'

export interface EstimatePrices {
  /** 人民币 / 百万 token（仅作量级参考，不是账单） */
  inputPerMillionCny: number
  outputPerMillionCny: number
}

export interface CostEstimate {
  sections: number
  chunks: number
  inputChars: number
  inputTokens: number
  outputTokens: number
  costCny: number
}

/** 粗略口径：中文约 1.5 字符 / token；每块按 8 个节点、每节点 80 token 估产出 */
const CHARS_PER_TOKEN = 1.5
const NODES_PER_CHUNK = 8
const TOKENS_PER_NODE = 80

export function readPrices(env: NodeJS.ProcessEnv = process.env): EstimatePrices {
  const read = (key: string, fallback: number): number => {
    const raw = env[key]
    if (typeof raw !== 'string' || raw.trim() === '') return fallback
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  return {
    inputPerMillionCny: read('SDL_LLM_PRICE_INPUT_PER_M', 2),
    outputPerMillionCny: read('SDL_LLM_PRICE_OUTPUT_PER_M', 8),
  }
}

export function estimateCost(
  material: string,
  options: { chunkSections?: number; prices?: EstimatePrices } = {},
): CostEstimate {
  const sections = splitSections(material)
  const chunks = chunkSections(sections, options.chunkSections).length
  const inputChars = material.length
  const inputTokens = Math.ceil(inputChars / CHARS_PER_TOKEN)
  const outputTokens = chunks * NODES_PER_CHUNK * TOKENS_PER_NODE
  const prices = options.prices ?? readPrices()

  const costCny =
    (inputTokens / 1_000_000) * prices.inputPerMillionCny +
    (outputTokens / 1_000_000) * prices.outputPerMillionCny

  return {
    sections: sections.length,
    chunks,
    inputChars,
    inputTokens,
    outputTokens,
    costCny: Math.round(costCny * 1_000_000) / 1_000_000,
  }
}
