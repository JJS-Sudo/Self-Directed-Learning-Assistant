import type { MapCandidate } from '@shared/map'
import { descendants } from '../lib/candidates'

interface Props {
  candidates: MapCandidate[]
  onChange: (next: MapCandidate[]) => void
}

export function CandidateEditor({ candidates, onChange }: Props) {
  const remove = (index: number): void => {
    const target = candidates[index]
    if (target === undefined) return
    onChange(
      candidates
        .filter((_, current) => current !== index)
        .map((candidate) =>
          candidate.parentTempId === target.tempId
            ? { ...candidate, parentTempId: undefined }
            : candidate,
        ),
    )
  }

  const setTitle = (index: number, title: string): void => {
    onChange(
      candidates.map((candidate, current) =>
        current === index ? { ...candidate, title } : candidate,
      ),
    )
  }

  const setParent = (index: number, parentTempId: string): void => {
    onChange(
      candidates.map((candidate, current) => {
        if (current !== index) return candidate
        if (parentTempId === '') return { ...candidate, parentTempId: undefined }
        return { ...candidate, parentTempId }
      }),
    )
  }

  return (
    <ul className="candidates">
      {candidates.map((candidate, index) => {
        const forbidden = descendants(candidates, candidate.tempId)
        return (
          <li key={candidate.tempId} className="candidate-row">
            <span className="candidate-index">{index + 1}</span>
            <input
              className="candidate-title"
              value={candidate.title}
              maxLength={120}
              onChange={(event) => setTitle(index, event.target.value)}
              aria-label={`候选 ${index + 1} 的标题`}
            />
            <select
              className="candidate-parent"
              value={candidate.parentTempId ?? ''}
              onChange={(event) => setParent(index, event.target.value)}
              aria-label={`候选 ${index + 1} 的父级`}
            >
              <option value="">顶层</option>
              {candidates
                .filter(
                  (other) => other.tempId !== candidate.tempId && !forbidden.has(other.tempId),
                )
                .map((other) => (
                  <option key={other.tempId} value={other.tempId}>
                    属于：{other.title}
                  </option>
                ))}
            </select>
            <button type="button" className="link" onClick={() => remove(index)}>
              删除
            </button>
          </li>
        )
      })}
    </ul>
  )
}
