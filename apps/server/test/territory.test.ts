import { describe, expect, it } from 'vitest'
import { TERRITORY } from '@team-fridays/shared'
import { territory, type TerritoryState } from '../src/activities/territory'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const ana: Actor = { id: 'a', isHost: false, spectator: false }

const TICKS_PER_SECOND = 1000 / TERRITORY.TICK_MS
const COUNTDOWN_TICKS = TERRITORY.COUNTDOWN_SECONDS * TICKS_PER_SECOND

const tick = (state: TerritoryState) => territory.tick!(state, ctx)

function playing(): TerritoryState {
  const state = territory.create({ type: 'territory' }, ctx)
  territory.action(state, { kind: 'territory/start' }, host, ctx)
  for (let i = 0; i < COUNTDOWN_TICKS; i++) tick(state)
  return state
}

describe('territory paint', () => {
  it('starts in a lobby, runs the countdown, then paints the spawns', () => {
    const state = territory.create({ type: 'territory' }, ctx)
    expect(state.phase).toBe('lobby')
    expect(tick(state)).toBe(false)
    expect(() =>
      territory.action(state, { kind: 'territory/move', dx: 1, dy: 0 }, host, ctx),
    ).toThrow(ActivityError)
    territory.action(state, { kind: 'territory/start' }, host, ctx)
    for (let i = 0; i < COUNTDOWN_TICKS; i++) tick(state)
    expect(state.phase).toBe('playing')
    expect(state.counts.red).toBeGreaterThan(0)
    expect(state.counts.blue).toBeGreaterThan(0)
  })

  it('paints cells while moving and keeps counts consistent with the grid', () => {
    const state = playing()
    territory.action(state, { kind: 'territory/move', dx: 1, dy: 0 }, host, ctx)
    for (let i = 0; i < 20; i++) tick(state)
    const gridRed = [...state.grid].filter((v) => v === 1).length
    const gridBlue = [...state.grid].filter((v) => v === 2).length
    expect(state.counts.red).toBe(gridRed)
    expect(state.counts.blue).toBe(gridBlue)
    expect(gridRed).toBeGreaterThan(2)
  })

  it('repaints enemy cells, transferring the count', () => {
    const state = playing()
    const red = state.players.get('h')!
    const blue = state.players.get('a')!
    // Move blue onto red's painted spawn area.
    blue.x = red.x
    blue.y = red.y
    territory.action(state, { kind: 'territory/move', dx: 0, dy: 1 }, ana, ctx)
    const redBefore = state.counts.red
    for (let i = 0; i < 5; i++) tick(state)
    expect(state.counts.red).toBeLessThan(redBefore)
    const gridRed = [...state.grid].filter((v) => v === 1).length
    expect(state.counts.red).toBe(gridRed)
  })

  it('finishes on the timer with the bigger territory winning', () => {
    const state = playing()
    territory.action(state, { kind: 'territory/move', dx: 1, dy: 0 }, host, ctx)
    for (let i = 0; i < 10; i++) tick(state)
    state.ticksRemaining = 1
    tick(state)
    expect(state.phase).toBe('finished')
    expect(state.winner).toBe('red')
    expect(tick(state)).toBe(false)
  })

  it('restart deals a fresh board through the countdown', () => {
    const state = playing()
    territory.action(state, { kind: 'territory/move', dx: 1, dy: 0 }, host, ctx)
    for (let i = 0; i < 10; i++) tick(state)
    territory.action(state, { kind: 'territory/restart' }, host, ctx)
    expect(state.phase).toBe('countdown')
    expect(state.counts).toEqual({ red: 0, blue: 0 })
    expect([...state.grid].every((v) => v === 0)).toBe(true)
  })

  it('serializes the grid as a compact string view', () => {
    const state = playing()
    const view = territory.view(state, 'h', ctx)
    expect(view.grid).toHaveLength(TERRITORY.GRID_COLS * TERRITORY.GRID_ROWS)
    expect(view.counts.red).toBe([...view.grid].filter((c) => c === '1').length)
  })
})
