import { describe, expect, it } from 'vitest'
import { herd, normalizeAnswer, type HerdState } from '../src/activities/herd'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a', 'b', 'c'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const ana: Actor = { id: 'a', isHost: false, spectator: false }
const ben: Actor = { id: 'b', isHost: false, spectator: false }
const cara: Actor = { id: 'c', isHost: false, spectator: false }

function started(): HerdState {
  const state = herd.create({ type: 'herd' }, ctx)
  herd.action(state, { kind: 'herd/submit-prompt', prompt: 'Name a breakfast food' }, ana, ctx)
  herd.action(state, { kind: 'herd/start' }, host, ctx)
  return state
}

const answer = (state: HerdState, actor: Actor, text: string) =>
  herd.action(state, { kind: 'herd/answer', text }, actor, ctx)

describe('herd mentality', () => {
  it('normalizes answers into herds', () => {
    expect(normalizeAnswer('  Cold  Pizza! ')).toBe('cold pizza')
    expect(normalizeAnswer('EGGS')).toBe(normalizeAnswer('eggs.'))
  })

  it('hides answers until the reveal', () => {
    const state = started()
    answer(state, ana, 'eggs')
    const view = herd.view(state, 'b', ctx)
    expect(view.round?.reveal).toBeNull()
    expect(view.round?.submittedIds).toEqual(['a'])
    expect(JSON.stringify(view)).not.toContain('eggs')
  })

  it('scores everyone in the biggest herd; lone answers never score', () => {
    const state = started()
    answer(state, host, 'Eggs')
    answer(state, ana, 'eggs!')
    answer(state, ben, 'pancakes')
    answer(state, cara, 'toast')
    herd.action(state, { kind: 'herd/reveal' }, host, ctx)
    const reveal = herd.view(state, null, ctx).round!.reveal!
    expect(reveal.groups[0]?.participantIds.sort()).toEqual(['a', 'h'])
    expect(reveal.winnerIds.sort()).toEqual(['a', 'h'])
    expect(state.scores.get('h')).toBe(1)
    expect(state.scores.get('b')).toBeUndefined()
  })

  it('gives no points when everyone answers differently', () => {
    const state = started()
    answer(state, host, 'eggs')
    answer(state, ana, 'toast')
    herd.action(state, { kind: 'herd/reveal' }, host, ctx)
    expect(herd.view(state, null, ctx).round!.reveal!.winnerIds).toEqual([])
    expect(state.scores.size).toBe(0)
  })

  it('walks the rotation to results', () => {
    const state = started()
    answer(state, ana, 'eggs')
    herd.action(state, { kind: 'herd/reveal' }, host, ctx)
    expect(() => herd.action(state, { kind: 'herd/next' }, ana, ctx)).toThrow(ActivityError)
    herd.action(state, { kind: 'herd/next' }, host, ctx)
    expect(state.phase).toBe('results')
  })
})
