import { describe, expect, it } from 'vitest'
import { toEdgeDtos } from '../src/api/map.js'

describe('候选边 DTO', () => {
  it('把内部 fromTempId/toTempId 映射成接口的 from/to', () => {
    expect(
      toEdgeDtos([
        { fromTempId: '1-n1', toTempId: '1-n2', type: 'parent' },
        { fromTempId: '1-n3', toTempId: '1-n4', type: 'related' },
      ]),
    ).toEqual([
      { from: '1-n1', to: '1-n2', type: 'parent' },
      { from: '1-n3', to: '1-n4', type: 'related' },
    ])
  })

  it('空数组', () => {
    expect(toEdgeDtos([])).toEqual([])
  })
})
