export interface AutoResourceEvent {
  type: 'start' | 'progress' | 'warning' | 'done' | 'error'
  total?: number
  searchConfigured?: boolean
  done?: number
  nodeId?: string
  nodeTitle?: string
  found?: number
  message?: string
  created?: number
  linked?: number
  skipped?: number
  failures?: number
  truncated?: boolean
}

export interface AutoResourceOptions {
  mode?: 'fill' | 'refresh' | 'retry'
  nodeIds?: string[]
  signal?: AbortSignal
}

function parseBlock(block: string): { event: string; data: string } | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
    else if (line.startsWith('data:')) data.push(line.slice('data:'.length).trimStart())
  }
  if (data.length === 0) return null
  return { event, data: data.join('\n') }
}

/** POST + SSE：EventSource 不支持 POST，所以手写流解析 */
export async function streamAutoResources(
  goalId: string,
  options: AutoResourceOptions,
  onEvent: (event: AutoResourceEvent) => void,
): Promise<void> {
  const response = await fetch(`/api/goals/${goalId}/resources/auto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      ...(options.nodeIds === undefined ? {} : { nodeIds: options.nodeIds }),
    }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  }
  if (response.body === null) throw new Error('服务端没有返回进度流')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseBlock(block)
        if (parsed !== null) {
          onEvent(JSON.parse(parsed.data) as AutoResourceEvent)
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}
