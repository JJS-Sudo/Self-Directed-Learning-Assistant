import type { GeneratedStageDto } from '@shared/path'

interface Props {
  stages: GeneratedStageDto[]
  nodeTitle: (id: string) => string
  onChange: (next: GeneratedStageDto[]) => void
}

function update(
  stages: GeneratedStageDto[],
  index: number,
  patch: Partial<GeneratedStageDto>,
): GeneratedStageDto[] {
  return stages.map((stage, current) => (current === index ? { ...stage, ...patch } : stage))
}

export function PathStageEditor({ stages, nodeTitle, onChange }: Props) {
  return (
    <ul className="stages">
      {stages.map((stage, index) => (
        <li key={stage.tempId} className="stage-card">
          <div className="stage-head">
            <span className="candidate-index">{index + 1}</span>
            <input
              className="candidate-title"
              aria-label={`第 ${index + 1} 段标题`}
              value={stage.title}
              onChange={(event) => onChange(update(stages, index, { title: event.target.value }))}
            />
            <input
              className="stage-estimate"
              aria-label={`第 ${index + 1} 段估时`}
              value={stage.estimate}
              onChange={(event) =>
                onChange(update(stages, index, { estimate: event.target.value }))
              }
            />
            <button
              type="button"
              className="link"
              onClick={() => onChange(stages.filter((_, current) => current !== index))}
            >
              删除
            </button>
          </div>

          <p className="stage-nodes">
            节点：{stage.nodeIds.map((id) => nodeTitle(id)).join('、') || '（无）'}
          </p>

          <label className="field field-wide">
            <span>检验信号（一行一条）</span>
            <textarea
              aria-label={`第 ${index + 1} 段检验信号`}
              rows={2}
              value={stage.checks.join('\n')}
              onChange={(event) =>
                onChange(
                  update(stages, index, {
                    checks: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  }),
                )
              }
            />
          </label>

          <ul className="stage-questions">
            {stage.questions.map((question) => (
              <li key={question.tempId}>
                <span className="phase-tag">{question.kind}</span>
                <span className="question-stem">{question.stem}</span>
                {question.answer !== undefined && (
                  <span className="question-answer">答案：{question.answer}</span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
