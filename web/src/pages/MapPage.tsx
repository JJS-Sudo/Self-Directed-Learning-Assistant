import { useCallback, useEffect, useState } from 'react'
import type { GoalListItem } from '@shared/goals'
import type {
  LayoutPositionDto,
  LinkType,
  MapCandidate,
  MapCandidateEdge,
  MapEstimate,
  MapGoalDto,
  MapNodeDto,
} from '@shared/map'
import { CandidateEditor } from '../components/CandidateEditor'
import { KnowledgeGraph } from '../components/KnowledgeGraph'

type Busy = null | 'estimate' | 'preview' | 'commit' | 'edit' | 'node' | 'link' | 'layout'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string }
  } | null
  const code = body?.error?.code
  const message = body?.error?.message ?? `HTTP ${response.status}`
  return code === undefined ? message : `${code}：${message}`
}

const TYPE_LABEL: Record<LinkType, string> = { parent: '上级', sibling: '并列', related: '相关' }

export function MapPage() {
  const [goals, setGoals] = useState<GoalListItem[]>([])
  const [goalId, setGoalId] = useState('')
  const [estimate, setEstimate] = useState<MapEstimate | null>(null)
  const [candidates, setCandidates] = useState<MapCandidate[] | null>(null)
  const [candidateEdges, setCandidateEdges] = useState<MapCandidateEdge[]>([])
  const [candidateWarnings, setCandidateWarnings] = useState<string[]>([])
  const [goal, setGoal] = useState<MapGoalDto | null>(null)
  const [nodes, setNodes] = useState<MapNodeDto[]>([])
  const [layout, setLayout] = useState<LayoutPositionDto[] | null>(null)
  const [mapWarnings, setMapWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editOrder, setEditOrder] = useState('0')
  const [editMastery, setEditMastery] = useState('未学')

  const [connectMode, setConnectMode] = useState(false)
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)
  const [connectPair, setConnectPair] = useState<{ from: string; to: string } | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<{
    from: string
    to: string
    type: LinkType
  } | null>(null)
  const [graphKey, setGraphKey] = useState(0)

  const loadMap = useCallback(async (id: string) => {
    if (id === '') {
      setNodes([])
      setGoal(null)
      setLayout(null)
      setMapWarnings([])
      return
    }
    const response = await fetch(`/api/goals/${id}/map`)
    if (!response.ok) throw new Error(await readError(response))
    const body = (await response.json()) as {
      goal?: MapGoalDto
      nodes: MapNodeDto[]
      layout?: { positions: LayoutPositionDto[] } | null
      warnings: string[]
    }
    setNodes(body.nodes)
    setGoal(body.goal ?? null)
    setLayout(body.layout?.positions ?? null)
    setMapWarnings(body.warnings)
    setGraphKey((current) => current + 1)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/goals')
        if (!response.ok) throw new Error(await readError(response))
        const body = (await response.json()) as { goals: GoalListItem[] }
        setGoals(body.goals)
        const first = body.goals[0]?.id
        if (first !== undefined) setGoalId((current) => (current === '' ? first : current))
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await loadMap(goalId)
        setSelectedId(null)
        setSelectedEdge(null)
      } catch (cause) {
        setError(messageOf(cause))
      }
    })()
  }, [goalId, loadMap])

  const selected = nodes.find((node) => node.id === selectedId) ?? null
  useEffect(() => {
    if (selected === null) return
    setEditTitle(selected.title)
    setEditOrder(String(selected.order))
    setEditMastery(selected.mastery)
  }, [selectedId, selected?.title, selected?.order, selected?.mastery])

  const runAi = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy('preview')
    try {
      const response = await fetch(`/api/goals/${goalId}/map/ai`, { method: 'POST' })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as {
        candidates: MapCandidate[]
        edges?: MapCandidateEdge[]
        warnings: string[]
        research?: { used: boolean; sources?: { title: string; url: string }[] }
        estimate: MapEstimate
      }
      setCandidates(body.candidates)
      setCandidateEdges(body.edges ?? [])
      const researchNote =
        body.research?.used === true
          ? `已联网检索 ${body.research.sources?.length ?? 0} 条来源`
          : '本次未联网，仅用模型已有知识拆解'
      setCandidateWarnings([researchNote, ...body.warnings])
      setEstimate(body.estimate)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const runCommit = async (): Promise<void> => {
    if (candidates === null) return
    setError(null)
    setBusy('commit')
    try {
      const response = await fetch(`/api/goals/${goalId}/map/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidates, edges: candidateEdges }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { created: number; links?: number }
      setCandidates(null)
      setCandidateEdges([])
      setCandidateWarnings([])
      setNotice(
        `已创建 ${body.created} 个节点` +
          (body.links === undefined ? '' : `、${body.links} 条关系`),
      )
      await loadMap(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const saveNode = async (): Promise<void> => {
    if (selectedId === null) return
    setError(null)
    setBusy('edit')
    try {
      const response = await fetch(`/api/nodes/${selectedId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          order: Number(editOrder),
          mastery: editMastery,
        }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setNotice('已保存')
      await loadMap(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const addNode = async (): Promise<void> => {
    const title = window.prompt('新知识点的标题')
    if (title === null || title.trim() === '') return
    setError(null)
    setBusy('node')
    try {
      const response = await fetch(`/api/goals/${goalId}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setNotice('已新增节点')
      await loadMap(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const deleteNode = async (): Promise<void> => {
    if (selectedId === null) return
    if (!window.confirm('删除这个节点？指向它的关系会一起删除。')) return
    setError(null)
    setBusy('node')
    try {
      let response = await fetch(`/api/nodes/${selectedId}`, { method: 'DELETE' })
      if (response.status === 409) {
        const body = (await response.json()) as { references?: unknown }
        void body
        if (!window.confirm('这个节点被路径段或题目引用，仍然删除？')) return
        response = await fetch(`/api/nodes/${selectedId}?force=1`, { method: 'DELETE' })
      }
      if (!response.ok) throw new Error(await readError(response))
      setSelectedId(null)
      setNotice('已删除节点')
      await loadMap(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const createEdge = async (from: string, to: string, type: LinkType): Promise<void> => {
    setError(null)
    setBusy('link')
    try {
      const response = await fetch(`/api/goals/${goalId}/map/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, type }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setNotice('已建立关系')
      setConnectPair(null)
      setPendingFrom(null)
      await loadMap(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const chooseType = (choice: LinkType | 'child'): void => {
    if (connectPair === null) return
    if (choice === 'child') {
      void createEdge(connectPair.to, connectPair.from, 'parent')
    } else {
      void createEdge(connectPair.from, connectPair.to, choice)
    }
  }

  const deleteEdge = async (): Promise<void> => {
    if (selectedEdge === null) return
    setError(null)
    setBusy('link')
    try {
      const query = new URLSearchParams({
        from: selectedEdge.from,
        to: selectedEdge.to,
        type: selectedEdge.type,
      })
      const response = await fetch(`/api/goals/${goalId}/map/links?${query.toString()}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await readError(response))
      setSelectedEdge(null)
      setNotice('已删除关系')
      await loadMap(goalId)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const onNodeClick = (id: string): void => {
    if (connectMode) {
      if (pendingFrom === null) setPendingFrom(id)
      else if (pendingFrom === id) setPendingFrom(null)
      else setConnectPair({ from: pendingFrom, to: id })
      return
    }
    setSelectedEdge(null)
    setSelectedId(id)
  }

  const refreshLayout = async (): Promise<void> => {
    setError(null)
    setBusy('layout')
    try {
      const response = await fetch(`/api/goals/${goalId}/map/layout`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ positions: [] }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setLayout(null)
      setGraphKey((current) => current + 1)
      setNotice('已重新布局')
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusy(null)
    }
  }

  const saveLayout = async (positions: LayoutPositionDto[]): Promise<void> => {
    setLayout(positions)
    try {
      const response = await fetch(`/api/goals/${goalId}/map/layout`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ positions }),
      })
      if (!response.ok) throw new Error(await readError(response))
    } catch (cause) {
      setError(messageOf(cause))
    }
  }

  const titleOf = (id: string): string => nodes.find((node) => node.id === id)?.title ?? id
  const canAiGenerate = goalId !== '' && busy === null

  return (
    <section className="area">
      <h1 className="area-title">地图</h1>
      <p className="lede">目标在中心，知识点像蛛网一样向外发散；关系可以手改。</p>

      {goals.length === 0 && <p className="hint">还没有目标。先去「目标」建一个，再回来拆解。</p>}

      {goals.length > 0 && (
        <div className="map-controls">
          <label className="field">
            <span>目标</span>
            <select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
              {goals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={!canAiGenerate}
              onClick={() => void runAi()}
            >
              {busy === 'preview' ? '生成中（约 20–30 个知识点）…' : 'AI 自动生成知识地图'}
            </button>
            <a
              className="button button-ghost"
              href={`/map/material?goal=${encodeURIComponent(goalId)}`}
            >
              导入材料生成
            </a>
            {estimate !== null && (
              <span className="hint">
                约 {estimate.inputTokens + estimate.outputTokens} token · ¥{estimate.costCny}
              </span>
            )}
          </div>
          <p className="hint">
            默认不联网时用模型已有知识；配了 Tavily 会先搜资料。材料生成在独立页面。
          </p>

          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice !== null && <p className="hint">{notice}</p>}
        </div>
      )}

      {candidates !== null && (
        <div className="preview">
          <p className="upcoming-label">
            候选节点（{candidates.length}）· 关系（{candidateEdges.length}）
          </p>
          {candidateWarnings.length > 0 && (
            <ul className="warning-list">
              {candidateWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {candidateEdges.length > 0 && (
            <ul className="run-list">
              {candidateEdges.slice(0, 12).map((edge) => (
                <li key={`${edge.from}:${edge.to}:${edge.type}`}>
                  {edge.type === 'parent'
                    ? `${edge.from} 的上级是 ${edge.to}`
                    : `${edge.from} 与 ${edge.to}：${TYPE_LABEL[edge.type]}`}
                </li>
              ))}
            </ul>
          )}
          <CandidateEditor candidates={candidates} onChange={setCandidates} />
          <div className="action-row">
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void runCommit()}
            >
              {busy === 'commit' ? '正在写入…' : '确认落盘'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setCandidates(null)
                setCandidateEdges([])
                setCandidateWarnings([])
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="map-view">
        <div className="map-toolbar">
          <span className="upcoming-label">知识网（{nodes.length} 个节点）</span>
          <button
            type="button"
            className="link"
            disabled={busy !== null}
            onClick={() => void addNode()}
          >
            加节点
          </button>
          <button
            type="button"
            className={connectMode ? 'link active' : 'link'}
            onClick={() => {
              setConnectMode((current) => !current)
              setPendingFrom(null)
            }}
          >
            {connectMode ? '退出连线' : '连线模式'}
          </button>
          <button type="button" className="link" onClick={() => void refreshLayout()}>
            刷新布局
          </button>
          <span className="map-legend">
            <i className="legend-line legend-parent" />
            上级
            <i className="legend-line legend-sibling" />
            并列
            <i className="legend-line legend-related" />
            相关
          </span>
          {connectMode && (
            <span className="hint">
              {pendingFrom === null ? '先点源节点' : `已选 ${titleOf(pendingFrom)}，再点目标节点`}
            </span>
          )}
        </div>

        {mapWarnings.length > 0 && (
          <ul className="warning-list" aria-live="polite">
            {mapWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        {nodes.length === 0 ? (
          <p className="hint">还没有节点。贴材料生成候选，确认后会出现在这里。</p>
        ) : (
          <KnowledgeGraph
            key={graphKey}
            goal={goal}
            nodes={nodes}
            layout={layout}
            onNodeClick={onNodeClick}
            onEdgeClick={(edge) => {
              setSelectedId(null)
              setSelectedEdge(edge)
            }}
            onLayoutChange={(positions) => void saveLayout(positions)}
          />
        )}

        {selected !== null && (
          <div className="detail-panel">
            <p className="upcoming-label">节点详情</p>
            <label className="field">
              <span>标题</span>
              <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
            </label>
            <label className="field">
              <span>序号</span>
              <input
                type="number"
                min={0}
                value={editOrder}
                onChange={(event) => setEditOrder(event.target.value)}
              />
            </label>
            <label className="field">
              <span>掌握度</span>
              <select value={editMastery} onChange={(event) => setEditMastery(event.target.value)}>
                <option value="未学">未学</option>
                <option value="在学">在学</option>
                <option value="已掌握">已掌握</option>
              </select>
            </label>
            <div className="action-row">
              <button
                type="button"
                className="button"
                disabled={busy !== null}
                onClick={() => void saveNode()}
              >
                保存
              </button>
              <button
                type="button"
                className="link"
                disabled={busy !== null}
                onClick={() => void deleteNode()}
              >
                删除节点
              </button>
            </div>
          </div>
        )}

        {selectedEdge !== null && (
          <div className="detail-panel">
            <p className="upcoming-label">关系</p>
            <p>
              {titleOf(selectedEdge.from)} → {titleOf(selectedEdge.to)}（
              {TYPE_LABEL[selectedEdge.type]}）
            </p>
            <button
              type="button"
              className="link"
              disabled={busy !== null}
              onClick={() => void deleteEdge()}
            >
              删除关系
            </button>
          </div>
        )}

        {connectPair !== null && (
          <div className="detail-panel connect-panel">
            <p className="upcoming-label">
              {titleOf(connectPair.from)} 与 {titleOf(connectPair.to)} 的关系
            </p>
            <div className="action-row">
              <button type="button" className="button" onClick={() => chooseType('parent')}>
                上级
              </button>
              <button type="button" className="button" onClick={() => chooseType('child')}>
                下级
              </button>
              <button type="button" className="button" onClick={() => chooseType('sibling')}>
                并列
              </button>
              <button type="button" className="button" onClick={() => chooseType('related')}>
                相关
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setConnectPair(null)
                  setPendingFrom(null)
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
