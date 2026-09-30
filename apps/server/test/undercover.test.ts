import { describe, expect, it } from 'vitest'
import { undercover, type UndercoverState } from '../src/activities/undercover'
import { ActivityError, type Actor } from '../src/activities/types'

const ids = ['h', 'a', 'b', 'c', 'd']
const ctx = { activeIds: ids }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const actorById = (id: string): Actor => ({ id, isHost: id === 'h', spectator: false })

function fresh(): UndercoverState {
  return undercover.create({ type: 'undercover' }, ctx)
}

describe('undercover', () => {
  it('needs 4+ players and deals 1 imposter for a small group', () => {
    expect(() => undercover.create({ type: 'undercover' }, { activeIds: ['a', 'b', 'c'] })).toThrow(
      ActivityError,
    )
    const state = fresh()
    expect(state.imposterIds.size).toBe(1)
    const big = undercover.create(
      { type: 'undercover' },
      { activeIds: Array.from({ length: 14 }, (_, i) => `p${i}`) },
    )
    expect(big.imposterIds.size).toBe(3)
  })

  it('shows each player only their own word — and never their role', () => {
    const state = fresh()
    const imposter = [...state.imposterIds][0]!
    const citizen = ids.find((id) => !state.imposterIds.has(id))!
    const imposterView = undercover.view(state, imposter, ctx)
    expect(imposterView.yourWord).toBe(state.imposterWord)
    const serialized = JSON.stringify(imposterView)
    expect(serialized).not.toContain('citizenWord')
    expect(serialized).not.toContain('imposterIds')
    // The citizen's view contains no trace of the imposter word.
    expect(JSON.stringify(undercover.view(state, citizen, ctx))).not.toContain(state.imposterWord)
  })

  it('hides clues until the host opens the vote', () => {
    const state = fresh()
    undercover.action(state, { kind: 'undercover/clue', text: 'bitter' }, actorById('a'), ctx)
    expect(undercover.view(state, 'b', ctx).clues).toBeNull()
    expect(undercover.view(state, 'b', ctx).cluesSubmittedIds).toEqual(['a'])
    undercover.action(state, { kind: 'undercover/to-voting' }, host, ctx)
    expect(undercover.view(state, 'b', ctx).clues).toEqual([
      { participantId: 'a', text: 'bitter' },
    ])
  })

  it('citizens win only when the single top-voted player is an imposter; ties save them', () => {
    const state = fresh()
    const imposter = [...state.imposterIds][0]!
    const citizens = ids.filter((id) => !state.imposterIds.has(id))
    undercover.action(state, { kind: 'undercover/clue', text: 'hmm' }, actorById(citizens[0]!), ctx)
    undercover.action(state, { kind: 'undercover/to-voting' }, host, ctx)
    for (const id of citizens)
      undercover.action(
        state,
        { kind: 'undercover/vote', suspectId: imposter },
        actorById(id),
        ctx,
      )
    undercover.action(state, { kind: 'undercover/reveal' }, host, ctx)
    expect(state.winner).toBe('citizens')
    const reveal = undercover.view(state, null, ctx).reveal!
    expect(reveal.imposterIds).toEqual([imposter])
    expect(reveal.winner).toBe('citizens')

    // Tie case → imposters slip away.
    const tie = fresh()
    const tieImposter = [...tie.imposterIds][0]!
    const tieCitizens = ids.filter((id) => !tie.imposterIds.has(id))
    undercover.action(tie, { kind: 'undercover/clue', text: 'x' }, actorById(tieCitizens[0]!), ctx)
    undercover.action(tie, { kind: 'undercover/to-voting' }, host, ctx)
    undercover.action(
      tie,
      { kind: 'undercover/vote', suspectId: tieImposter },
      actorById(tieCitizens[0]!),
      ctx,
    )
    undercover.action(
      tie,
      { kind: 'undercover/vote', suspectId: tieCitizens[0]! },
      actorById(tieCitizens[1]!),
      ctx,
    )
    undercover.action(tie, { kind: 'undercover/reveal' }, host, ctx)
    expect(tie.winner).toBe('imposters')
  })

  it('blocks self-votes and redeals on restart', () => {
    const state = fresh()
    undercover.action(state, { kind: 'undercover/clue', text: 'x' }, actorById('a'), ctx)
    undercover.action(state, { kind: 'undercover/to-voting' }, host, ctx)
    expect(() =>
      undercover.action(state, { kind: 'undercover/vote', suspectId: 'a' }, actorById('a'), ctx),
    ).toThrow(ActivityError)
    undercover.action(state, { kind: 'undercover/restart' }, host, ctx)
    expect(state.phase).toBe('clues')
    expect(state.clues.size).toBe(0)
    expect(state.words.size).toBe(ids.length)
  })
})
