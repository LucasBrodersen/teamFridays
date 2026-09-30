import { describe, expect, it } from 'vitest'
import { SNOWFIGHT } from '@team-fridays/shared'
import { snowfight, type SnowfightState } from '../src/activities/snowfight'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['a', 'b', 'c', 'd'] }
const host: Actor = { id: 'a', isHost: true, spectator: false }
const bob: Actor = { id: 'b', isHost: false, spectator: false }
const late: Actor = { id: 'x', isHost: false, spectator: true }

function fresh(c = ctx): SnowfightState {
  return snowfight.create({ type: 'snowfight' }, c)
}

function player(state: SnowfightState, id: string) {
  const p = state.players.get(id)
  if (!p) throw new Error(`no player ${id}`)
  return p
}

const tick = (state: SnowfightState) => snowfight.tick!(state, ctx)

const COUNTDOWN_TICKS = SNOWFIGHT.COUNTDOWN_SECONDS * (1000 / SNOWFIGHT.TICK_MS)

/** Host presses start and the 3-2-1 countdown elapses. */
function begin(state: SnowfightState): SnowfightState {
  snowfight.action(state, { kind: 'snowfight/start' }, host, ctx)
  for (let i = 0; i < COUNTDOWN_TICKS; i++) tick(state)
  return state
}

describe('snowfight setup', () => {
  it('assigns everyone to balanced teams on their own side', () => {
    const state = fresh()
    expect(state.players.size).toBe(4)
    const red = [...state.players.values()].filter((p) => p.team === 'red')
    const blue = [...state.players.values()].filter((p) => p.team === 'blue')
    expect(red).toHaveLength(2)
    expect(blue).toHaveLength(2)
    for (const p of red) expect(p.x).toBeLessThan(SNOWFIGHT.ARENA_WIDTH / 2)
    for (const p of blue) expect(p.x).toBeGreaterThan(SNOWFIGHT.ARENA_WIDTH / 2)
  })

  it('requires at least 2 players', () => {
    expect(() => fresh({ activeIds: ['a'] })).toThrow(ActivityError)
  })

  it('blocks spectators from acting', () => {
    const state = begin(fresh())
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/move', dx: 1, dy: 0 }, late, ctx),
    ).toThrow(ActivityError)
  })
})

describe('movement', () => {
  it('moves with input and clamps to the arena', () => {
    const state = begin(fresh())
    const p = player(state, 'a')
    p.x = 100
    p.y = 100
    snowfight.action(state, { kind: 'snowfight/move', dx: 1, dy: 0 }, host, ctx)
    tick(state)
    expect(p.x).toBeCloseTo(100 + SNOWFIGHT.PLAYER_SPEED * (SNOWFIGHT.TICK_MS / 1000))

    p.x = SNOWFIGHT.ARENA_WIDTH - SNOWFIGHT.PLAYER_RADIUS - 1
    for (let i = 0; i < 10; i++) tick(state)
    expect(p.x).toBe(SNOWFIGHT.ARENA_WIDTH - SNOWFIGHT.PLAYER_RADIUS)
  })
})

describe('snowballs', () => {
  it('throws toward a target and enforces the cooldown', () => {
    const state = begin(fresh())
    snowfight.action(state, { kind: 'snowfight/throw', x: 400, y: 250 }, host, ctx)
    expect(state.snowballs).toHaveLength(1)
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/throw', x: 400, y: 250 }, host, ctx),
    ).toThrow(ActivityError)
  })

  it('hits an enemy, credits the thrower, and passes through teammates', () => {
    const state = begin(fresh())
    const a = player(state, 'a') // red
    const c = player(state, 'c') // red teammate
    const b = player(state, 'b') // blue
    a.x = 100
    a.y = 100
    c.x = 160
    c.y = 100 // directly in the flight path
    b.x = 300
    b.y = 100
    snowfight.action(state, { kind: 'snowfight/throw', x: 300, y: 100 }, host, ctx)
    for (let i = 0; i < 30 && state.snowballs.length > 0; i++) tick(state)
    expect(c.hp).toBe(SNOWFIGHT.MAX_HP)
    expect(b.hp).toBe(SNOWFIGHT.MAX_HP - 1)
    expect(a.hits).toBe(1)
    expect(state.snowballs).toHaveLength(0)
  })

  it('freezes a player at 0 hp and finishes when a team is wiped', () => {
    const state = begin(fresh({ activeIds: ['a', 'b'] }))
    const a = player(state, 'a')
    const b = player(state, 'b')
    a.x = 100
    a.y = 100
    b.x = 200
    b.y = 100
    b.hp = 1
    snowfight.action(state, { kind: 'snowfight/throw', x: 200, y: 100 }, host, ctx)
    for (let i = 0; i < 20 && state.phase === 'playing'; i++) tick(state)
    expect(b.frozen).toBe(true)
    expect(state.phase).toBe('finished')
    expect(state.winner).toBe('red')
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/move', dx: 1, dy: 0 }, bob, ctx),
    ).toThrow(ActivityError)
  })

  it('decides by remaining hp when the timer runs out', () => {
    const state = begin(fresh())
    player(state, 'b').hp = 1
    state.ticksRemaining = 1
    tick(state)
    expect(state.phase).toBe('finished')
    expect(state.winner).toBe('red')
  })
})

describe('barriers', () => {
  const BUILD_TICKS = SNOWFIGHT.BARRIER_BUILD_SECONDS * (1000 / SNOWFIGHT.TICK_MS)

  it('builds a barrier in front of the player after 3 seconds', () => {
    const state = begin(fresh())
    const a = player(state, 'a') // red
    a.x = 100
    a.y = 100
    snowfight.action(state, { kind: 'snowfight/build' }, host, ctx)
    expect(a.building).not.toBeNull()
    for (let i = 0; i < BUILD_TICKS - 1; i++) tick(state)
    expect(state.barriers).toHaveLength(0) // not done yet
    tick(state)
    expect(a.building).toBeNull()
    expect(state.barriers).toHaveLength(1)
    expect(state.barriers[0]).toMatchObject({
      team: 'red',
      x: 100 + SNOWFIGHT.BARRIER_OFFSET,
      hp: SNOWFIGHT.BARRIER_HP,
    })
  })

  it('roots the builder: moving cancels, throwing is rejected, one wall at a time', () => {
    const state = begin(fresh())
    snowfight.action(state, { kind: 'snowfight/build' }, host, ctx)
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/build' }, host, ctx),
    ).toThrow(ActivityError)
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/throw', x: 400, y: 250 }, host, ctx),
    ).toThrow(ActivityError)
    snowfight.action(state, { kind: 'snowfight/move', dx: 1, dy: 0 }, host, ctx)
    expect(player(state, 'a').building).toBeNull() // moving abandoned the build

    // Finish a build, then a second one is blocked while the wall stands.
    snowfight.action(state, { kind: 'snowfight/move', dx: 0, dy: 0 }, host, ctx)
    snowfight.action(state, { kind: 'snowfight/build' }, host, ctx)
    for (let i = 0; i < BUILD_TICKS; i++) tick(state)
    expect(state.barriers).toHaveLength(1)
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/build' }, host, ctx),
    ).toThrow(ActivityError)
  })

  it('leaves the builder vulnerable: a hit hurts and interrupts the build', () => {
    const state = begin(fresh())
    const a = player(state, 'a') // red
    const b = player(state, 'b') // blue
    a.x = 100
    a.y = 100
    b.x = 300
    b.y = 100
    snowfight.action(state, { kind: 'snowfight/build' }, host, ctx)
    snowfight.action(state, { kind: 'snowfight/throw', x: 100, y: 100 }, bob, ctx)
    for (let i = 0; i < 20 && state.snowballs.length > 0; i++) tick(state)
    expect(a.hp).toBe(SNOWFIGHT.MAX_HP - 1)
    expect(a.building).toBeNull()
    expect(state.barriers).toHaveLength(0)
  })

  it('absorbs 3 enemy hits then breaks, while friendly balls pass through', () => {
    const state = begin(fresh())
    const a = player(state, 'a') // red
    const b = player(state, 'b') // blue
    a.x = 100
    a.y = 100
    b.x = 300
    b.y = 100
    snowfight.action(state, { kind: 'snowfight/build' }, host, ctx)
    for (let i = 0; i < BUILD_TICKS; i++) tick(state)
    expect(state.barriers).toHaveLength(1) // wall at x=148, between a and b

    // Friendly ball ignores the wall and hits the enemy behind it.
    snowfight.action(state, { kind: 'snowfight/throw', x: 300, y: 100 }, host, ctx)
    for (let i = 0; i < 20 && state.snowballs.length > 0; i++) tick(state)
    expect(b.hp).toBe(SNOWFIGHT.MAX_HP - 1)
    expect(state.barriers[0]?.hp).toBe(SNOWFIGHT.BARRIER_HP)

    // Enemy balls chip the wall instead of the player hiding behind it.
    for (let shot = 0; shot < 3; shot++) {
      state.players.get('b')!.lastThrowTick = -100 // skip cooldown between shots
      snowfight.action(state, { kind: 'snowfight/throw', x: 100, y: 100 }, bob, ctx)
      for (let i = 0; i < 20 && state.snowballs.length > 0; i++) tick(state)
    }
    expect(a.hp).toBe(SNOWFIGHT.MAX_HP) // never touched
    expect(state.barriers).toHaveLength(0) // wall broke on the 3rd hit
  })

  it('clears barriers and builds on restart', () => {
    const state = begin(fresh())
    snowfight.action(state, { kind: 'snowfight/build' }, host, ctx)
    for (let i = 0; i < BUILD_TICKS; i++) tick(state)
    snowfight.action(state, { kind: 'snowfight/build' }, bob, ctx)
    expect(state.barriers).toHaveLength(1)
    snowfight.action(state, { kind: 'snowfight/restart' }, host, ctx)
    expect(state.barriers).toHaveLength(0)
    expect(player(state, 'b').building).toBeNull()
  })
})

describe('pre-game countdown', () => {
  it('starts in a ready lobby where nobody can act', () => {
    const state = fresh()
    expect(state.phase).toBe('lobby')
    expect(tick(state)).toBe(false)
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/move', dx: 1, dy: 0 }, host, ctx),
    ).toThrow(ActivityError)
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/throw', x: 400, y: 250 }, bob, ctx),
    ).toThrow(ActivityError)
    expect(() => snowfight.action(state, { kind: 'snowfight/build' }, bob, ctx)).toThrow(
      ActivityError,
    )
  })

  it('only the host can trigger the countdown, once', () => {
    const state = fresh()
    expect(() => snowfight.action(state, { kind: 'snowfight/start' }, bob, ctx)).toThrow(
      ActivityError,
    )
    snowfight.action(state, { kind: 'snowfight/start' }, host, ctx)
    expect(state.phase).toBe('countdown')
    expect(() => snowfight.action(state, { kind: 'snowfight/start' }, host, ctx)).toThrow(
      ActivityError,
    )
  })

  it('counts 3-2-1 and only then starts play, with the full round clock', () => {
    const state = fresh()
    snowfight.action(state, { kind: 'snowfight/start' }, host, ctx)
    expect(snowfight.view(state, null, ctx).countdownSeconds).toBe(SNOWFIGHT.COUNTDOWN_SECONDS)
    // Still counting one tick before the end; inputs stay blocked.
    for (let i = 0; i < COUNTDOWN_TICKS - 1; i++) tick(state)
    expect(state.phase).toBe('countdown')
    expect(snowfight.view(state, null, ctx).countdownSeconds).toBe(1)
    expect(() =>
      snowfight.action(state, { kind: 'snowfight/move', dx: 1, dy: 0 }, host, ctx),
    ).toThrow(ActivityError)
    tick(state)
    expect(state.phase).toBe('playing')
    const view = snowfight.view(state, null, ctx)
    expect(view.countdownSeconds).toBe(0)
    expect(view.secondsRemaining).toBe(SNOWFIGHT.ROUND_SECONDS)
    snowfight.action(state, { kind: 'snowfight/move', dx: 1, dy: 0 }, host, ctx)
  })
})

describe('rounds', () => {
  it('lets only the host restart, resetting the round', () => {
    const state = begin(fresh())
    player(state, 'b').hp = 1
    player(state, 'b').frozen = true
    expect(() => snowfight.action(state, { kind: 'snowfight/restart' }, bob, ctx)).toThrow(
      ActivityError,
    )
    snowfight.action(state, { kind: 'snowfight/restart' }, host, ctx)
    expect(player(state, 'b').hp).toBe(SNOWFIGHT.MAX_HP)
    expect(player(state, 'b').frozen).toBe(false)
    // A rematch re-enters through the countdown, not straight into play.
    expect(state.phase).toBe('countdown')
    for (let i = 0; i < COUNTDOWN_TICKS; i++) tick(state)
    expect(state.phase).toBe('playing')
  })

  it('stops simulating after the round is finished', () => {
    const state = begin(fresh())
    state.phase = 'finished'
    expect(tick(state)).toBe(false)
  })

  it('serializes a spectator-safe view with rounded coordinates', () => {
    const state = begin(fresh())
    const view = snowfight.view(state, null, ctx)
    expect(view.players).toHaveLength(4)
    expect(view.secondsRemaining).toBe(SNOWFIGHT.ROUND_SECONDS)
    for (const p of view.players) expect(Number.isInteger(p.x)).toBe(true)
  })
})
