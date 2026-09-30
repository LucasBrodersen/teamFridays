import { describe, expect, it } from 'vitest'
import { twoTruths, type TwoTruthsState } from '../src/activities/twoTruths'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a', 'b'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const ana: Actor = { id: 'a', isHost: false, spectator: false }
const ben: Actor = { id: 'b', isHost: false, spectator: false }

const statements: [string, string, string] = ['I ran a marathon', 'I met a president', 'I can juggle']

function submitted(): TwoTruthsState {
  const state = twoTruths.create({ type: 'two-truths' }, ctx)
  twoTruths.action(state, { kind: 'two-truths/submit', statements, lieIndex: 1 }, host, ctx)
  twoTruths.action(state, { kind: 'two-truths/submit', statements, lieIndex: 0 }, ana, ctx)
  twoTruths.action(state, { kind: 'two-truths/submit', statements, lieIndex: 2 }, ben, ctx)
  return state
}

describe('two truths and a lie', () => {
  it('tracks the lie through the shuffle at submission time', () => {
    const state = twoTruths.create({ type: 'two-truths' }, ctx)
    twoTruths.action(state, { kind: 'two-truths/submit', statements, lieIndex: 1 }, ana, ctx)
    const stored = state.submissions.get('a')!
    expect(stored.statements).toHaveLength(3)
    expect(stored.statements[stored.lieIndex]).toBe('I met a president')
  })

  it('hides other submissions and the lie during collecting', () => {
    const state = twoTruths.create({ type: 'two-truths' }, ctx)
    twoTruths.action(state, { kind: 'two-truths/submit', statements, lieIndex: 1 }, ana, ctx)
    const benView = twoTruths.view(state, 'b', ctx)
    expect(benView.current).toBeNull()
    expect(benView.submittedIds).toEqual(['a'])
    expect(JSON.stringify(benView)).not.toContain('marathon')
  })

  it('requires at least 2 submissions to start, host-only', () => {
    const state = twoTruths.create({ type: 'two-truths' }, ctx)
    twoTruths.action(state, { kind: 'two-truths/submit', statements, lieIndex: 0 }, ana, ctx)
    expect(() => twoTruths.action(state, { kind: 'two-truths/start' }, host, ctx)).toThrow(
      ActivityError,
    )
    twoTruths.action(state, { kind: 'two-truths/submit', statements, lieIndex: 0 }, ben, ctx)
    expect(() => twoTruths.action(state, { kind: 'two-truths/start' }, ana, ctx)).toThrow(
      ActivityError,
    )
    // Force-advance: host can start with 2/3 submitted.
    twoTruths.action(state, { kind: 'two-truths/start' }, host, ctx)
    expect(state.phase).toBe('presenting')
    expect(state.order.sort()).toEqual(['a', 'b'])
  })

  it('hides the lie and vote choices while voting, then reveals and scores', () => {
    const state = submitted()
    twoTruths.action(state, { kind: 'two-truths/start' }, host, ctx)
    const targetId = state.order[0]!
    const lie = state.submissions.get(targetId)!.lieIndex
    const voters = [host, ana, ben].filter((p) => p.id !== targetId)

    twoTruths.action(state, { kind: 'two-truths/vote', statementIndex: lie }, voters[0]!, ctx)
    const midView = twoTruths.view(state, voters[1]!.id, ctx)
    expect(midView.current?.lieIndex).toBeNull()
    expect(midView.current?.votes).toBeNull()
    expect(midView.current?.votedIds).toEqual([voters[0]!.id])

    const wrong = (lie + 1) % 3
    twoTruths.action(state, { kind: 'two-truths/vote', statementIndex: wrong }, voters[1]!, ctx)
    twoTruths.action(state, { kind: 'two-truths/reveal' }, host, ctx)

    const revealedView = twoTruths.view(state, targetId, ctx)
    expect(revealedView.current?.lieIndex).toBe(lie)
    expect(state.scores.get(voters[0]!.id)).toBe(1)
    expect(state.scores.get(voters[1]!.id)).toBeUndefined()
  })

  it('blocks the target from voting on themselves', () => {
    const state = submitted()
    twoTruths.action(state, { kind: 'two-truths/start' }, host, ctx)
    const target = [host, ana, ben].find((p) => p.id === state.order[0])!
    expect(() =>
      twoTruths.action(state, { kind: 'two-truths/vote', statementIndex: 0 }, target, ctx),
    ).toThrow(ActivityError)
  })

  it('walks through all turns and ends in results', () => {
    const state = submitted()
    twoTruths.action(state, { kind: 'two-truths/start' }, host, ctx)
    for (let i = 0; i < 3; i++) {
      twoTruths.action(state, { kind: 'two-truths/reveal' }, host, ctx)
      twoTruths.action(state, { kind: 'two-truths/next' }, host, ctx)
    }
    expect(state.phase).toBe('results')
    const view = twoTruths.view(state, 'h', ctx)
    expect(view.current).toBeNull()
  })
})
