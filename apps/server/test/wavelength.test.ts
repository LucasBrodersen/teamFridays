import { describe, expect, it } from 'vitest'
import { wavelength, type WavelengthState } from '../src/activities/wavelength'
import { ActivityError, type Actor } from '../src/activities/types'

const ids = ['h', 'a', 'b']
const ctx = { activeIds: ids }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const actorById = (id: string): Actor => ({ id, isHost: id === 'h', spectator: false })

function fresh(): WavelengthState {
  return wavelength.create({ type: 'wavelength' }, ctx)
}

describe('wavelength', () => {
  it('needs 3+ players and schedules one round per player', () => {
    expect(() => wavelength.create({ type: 'wavelength' }, { activeIds: ['a', 'b'] })).toThrow(
      ActivityError,
    )
    const state = fresh()
    expect(state.rounds).toHaveLength(3)
    expect(state.rounds.map((r) => r.giverId).sort()).toEqual([...ids].sort())
  })

  it('shows the target only to the clue-giver before the reveal', () => {
    const state = fresh()
    const giver = state.rounds[0]!.giverId
    const guesser = ids.find((id) => id !== giver)!
    expect(wavelength.view(state, giver, ctx).round?.target).toBe(state.rounds[0]!.target)
    const guesserView = wavelength.view(state, guesser, ctx)
    expect(guesserView.round?.target).toBeNull()
    expect(JSON.stringify(guesserView)).not.toContain('"target":' + state.rounds[0]!.target)
  })

  it('the clue opens guessing; the giver cannot guess; guesses stay hidden', () => {
    const state = fresh()
    const giver = state.rounds[0]!.giverId
    const guessers = ids.filter((id) => id !== giver)
    expect(() =>
      wavelength.action(state, { kind: 'wavelength/clue', text: 'x' }, actorById(guessers[0]!), ctx),
    ).toThrow(ActivityError)
    wavelength.action(state, { kind: 'wavelength/clue', text: 'lukewarm tea' }, actorById(giver), ctx)
    expect(state.phase).toBe('guessing')
    expect(() =>
      wavelength.action(state, { kind: 'wavelength/guess', value: 50 }, actorById(giver), ctx),
    ).toThrow(ActivityError)
    wavelength.action(state, { kind: 'wavelength/guess', value: 40 }, actorById(guessers[0]!), ctx)
    const view = wavelength.view(state, guessers[1]!, ctx)
    expect(view.round?.guessedIds).toEqual([guessers[0]])
    expect(view.round?.reveal).toBeNull()
  })

  it('scores the closest guesser and the giver when someone lands within 10', () => {
    const state = fresh()
    const round = state.rounds[0]!
    const guessers = ids.filter((id) => id !== round.giverId)
    wavelength.action(state, { kind: 'wavelength/clue', text: 'clue' }, actorById(round.giverId), ctx)
    const onTarget = round.target
    const wayOff = round.target >= 50 ? 0 : 100
    wavelength.action(
      state,
      { kind: 'wavelength/guess', value: onTarget },
      actorById(guessers[0]!),
      ctx,
    )
    wavelength.action(
      state,
      { kind: 'wavelength/guess', value: wayOff },
      actorById(guessers[1]!),
      ctx,
    )
    wavelength.action(state, { kind: 'wavelength/reveal' }, host, ctx)
    const reveal = wavelength.view(state, null, ctx).round!.reveal!
    expect(reveal.closestIds).toEqual([guessers[0]])
    expect(reveal.giverScored).toBe(true)
    expect(state.scores.get(guessers[0]!)).toBe(1)
    expect(state.scores.get(round.giverId)).toBe(1)
  })

  it('rotates through all rounds into results', () => {
    const state = fresh()
    for (let i = 0; i < 3; i++) {
      const round = state.rounds[i]!
      const guesser = ids.find((id) => id !== round.giverId)!
      wavelength.action(state, { kind: 'wavelength/clue', text: 'c' }, actorById(round.giverId), ctx)
      wavelength.action(state, { kind: 'wavelength/guess', value: 50 }, actorById(guesser), ctx)
      wavelength.action(state, { kind: 'wavelength/reveal' }, host, ctx)
      wavelength.action(state, { kind: 'wavelength/next' }, host, ctx)
    }
    expect(state.phase).toBe('results')
    expect(wavelength.view(state, null, ctx).scores).toHaveLength(3)
  })
})
