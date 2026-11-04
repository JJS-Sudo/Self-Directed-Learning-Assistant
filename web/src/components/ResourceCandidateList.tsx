import type { ResourceCandidateDto } from '@shared/resources'
import { RESOURCE_LEVELS, RESOURCE_MEDIA } from '@shared/resources'

interface Props {
  candidates: ResourceCandidateDto[]
  selected: ReadonlySet<string>
  onToggle: (url: string) => void
  onChange: (url: string, patch: Partial<ResourceCandidateDto>) => void
}

export function ResourceCandidateList({ candidates, selected, onToggle, onChange }: Props) {
  return (
    <ul className="resource-candidates">
      {candidates.map((candidate) => (
        <li key={candidate.url} className="resource-card">
          <label className="resource-check">
            <input
              type="checkbox"
              checked={selected.has(candidate.url)}
              onChange={() => onToggle(candidate.url)}
              aria-label={`选择 ${candidate.title}`}
            />
          </label>

          <div className="resource-body">
            <input
              className="resource-title"
              aria-label={`标题 ${candidate.title}`}
              value={candidate.title}
              onChange={(event) => onChange(candidate.url, { title: event.target.value })}
            />
            <a className="resource-url" href={candidate.url} target="_blank" rel="noreferrer">
              {candidate.url}
            </a>
            {candidate.snippet !== '' && <p className="resource-snippet">{candidate.snippet}</p>}

            <div className="resource-fields">
              <label className="field">
                <span>等级</span>
                <select
                  aria-label={`等级 ${candidate.title}`}
                  value={candidate.level ?? ''}
                  onChange={(event) =>
                    onChange(candidate.url, {
                      level: event.target.value === '' ? undefined : event.target.value,
                    })
                  }
                >
                  <option value="">未定</option>
                  {RESOURCE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>媒介</span>
                <select
                  aria-label={`媒介 ${candidate.title}`}
                  value={candidate.media ?? ''}
                  onChange={(event) =>
                    onChange(candidate.url, {
                      media: event.target.value === '' ? undefined : event.target.value,
                    })
                  }
                >
                  <option value="">未定</option>
                  {RESOURCE_MEDIA.map((media) => (
                    <option key={media} value={media}>
                      {media}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>时长（分钟）</span>
                <input
                  aria-label={`时长 ${candidate.title}`}
                  type="number"
                  min={1}
                  value={candidate.durationMin ?? ''}
                  onChange={(event) =>
                    onChange(candidate.url, {
                      durationMin:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
