import { describe, expect, it } from 'vitest'
import { TENNIS } from '@team-fridays/shared'
import { tennis, type TennisState } from '../src/activities/tennis'
import { ActivityError, type Actor } from '../src/activities/types'

const ctx = { activeIds: ['h', 'a'] }
const host: Actor = { id: 'h', isHost: true, spectator: false }
const actorById = (id: string): Actor => ({ id, isHost: id === 'h', spectator: false })

const TICKS_PER_SECOND = 1000 / TENNIS.TICK_MS
const COUNTDOWN_TICKS = TENNIS.COUNTDOWN_SECONDS * TICKS_PER_SECOND
const PAUSE_TICKS = TENNIS.POINT_PAUSE_SECONDS * TICKS_PER_SECOND

const tick = (state: TennisState, c = ctx) => tennis.tick!(state, c)

function playing(c = ctx): TennisState {
  const state = tennis.create({ type: 'tennis' }, c)
  tennis.action(state, { kind: 'tennis/start' }, host, c)
  for (let i = 0; i < COUNTDOWN_TICKS; i++) tick(state, c)
  return state
}

function server(state: TennisState) {
  return state.players.get(state.ball.heldBy!)!
}

describe('tennis setup', () => {
  it('needs 2+ players and drafts at most 4 onto the court', () => {
    expect(() => tennis.create({ type: 'tennis' }, { activeIds: ['x'] })).toThrow(ActivityError)
    const big = { activeIds: ['h', 'a', 'b', 'c', 'd', 'e', 'f'] }
    const state = tennis.create({ type: 'tennis' }, big)
    expect(state.players.size).toBe(4)
    const teams = [...state.players.values()].map((p) => p.team)
    expect(teams.filter((t) => t === 'red')).toHaveLength(2)
    expect(teams.filter((t) => t === 'blue')).toHaveLength(2)
  })

  it('spectators in the room cannot move or hit', () => {
    const big = { activeIds: ['h', 'a', 'b', 'c', 'd', 'e'] }
    const state = playing(big)
    const benched = big.activeIds.find((id) => !state.players.has(id))!
    expect(() =>
      tennis.action(state, { kind: 'tennis/move', dx: 1, dy: 0 }, actorById(benched), big),
    ).toThrow(ActivityError)
  })

  it('runs the countdown, then a player of the serving team holds the ball', () => {
    const state = playing()
    expect(state.phase).toBe('playing')
    expect(state.ball.heldBy).not.toBeNull()
    expect(server(state).team).toBe(state.serveTeam)
  })
})

describe('movement and hitting', () => {
  it('clamps players to their own half, away from the net', () => {
    const state = playing()
    const red = [...state.players.values()].find((p) => p.team === 'red')!
    tennis.action(state, { kind: 'tennis/move', dx: 1, dy: 0 }, actorById(red.id), ctx)
    for (let i = 0; i < 200; i++) tick(state)
    expect(red.x).toBe(TENNIS.COURT_WIDTH / 2 - TENNIS.NET_MARGIN)
  })

  it('serving launches toward the enemy half with a clamped crossing angle', () => {
    const state = playing()
    const srv = server(state)
    // Aim backwards on purpose — the launch still crosses toward the enemy.
    const backwards = srv.team === 'red' ? 0 : TENNIS.COURT_WIDTH
    tennis.action(state, { kind: 'tennis/hit', x: backwards, y: srv.y }, actorById(srv.id), ctx)
    expect(state.ball.heldBy).toBeNull()
    if (srv.team === 'red') expect(state.ball.vx).toBeGreaterThan(0)
    else expect(state.ball.vx).toBeLessThan(0)
  })

  it('only the holder can serve, and swings have a cooldown', () => {
    const state = playing()
    const srv = server(state)
    const opponent = [...state.players.values()].find((p) => p.team !== srv.team)!
    expect(() =>
      tennis.action(state, { kind: 'tennis/hit', x: 400, y: 250 }, actorById(opponent.id), ctx),
    ).toThrow(ActivityError)
    tennis.action(state, { kind: 'tennis/hit', x: 400, y: 250 }, actorById(srv.id), ctx)
    expect(() =>
      tennis.action(state, { kind: 'tennis/hit', x: 400, y: 250 }, actorById(srv.id), ctx),
    ).toThrow(ActivityError) // still swinging
  })

  it('reports the hitter as mid-swing briefly, and nobody at match start', () => {
    const state = playing()
    const view0 = tennis.view(state, null, ctx)
    expect(view0.players.every((p) => !p.swinging)).toBe(true)
    const srv = server(state)
    tennis.action(state, { kind: 'tennis/hit', x: 400, y: 250 }, actorById(srv.id), ctx)
    expect(
      tennis.view(state, null, ctx).players.find((p) => p.id === srv.id)?.swinging,
    ).toBe(true)
    for (let i = 0; i < TENNIS.SWING_TICKS + 1; i++) tick(state)
    expect(
      tennis.view(state, null, ctx).players.find((p) => p.id === srv.id)?.swinging,
    ).toBe(false)
  })

  it('rejects swings when the loose ball is out of reach', () => {
    const state = playing()
    const srv = server(state)
    tennis.action(state, { kind: 'tennis/hit', x: 400, y: 250 }, actorById(srv.id), ctx)
    const opponent = [...state.players.values()].find((p) => p.team !== srv.team)!
    state.ball.x = opponent.x + TENNIS.HIT_REACH + 50
    state.ball.y = opponent.y
    expect(() =>
      tennis.action(state, { kind: 'tennis/hit', x: 100, y: 250 }, actorById(opponent.id), ctx),
    ).toThrow(ActivityError)
  })

  it('calls a ball crossing the side line out, scoring against the hitter', () => {
    const state = playing()
    const srv = server(state)
    const enemy = srv.team === 'red' ? 'blue' : 'red'
    // Aim almost straight at the side line; the clamp keeps it legal but it flies out.
    tennis.action(state, { kind: 'tennis/hit', x: srv.x, y: -2000 }, actorById(srv.id), ctx)
    for (let i = 0; i < 100 && state.pauseTicks === 0; i++) tick(state)
    expect(state.points[enemy]).toBe(1)
    expect(state.banner).toContain('Out!')
  })

  it('auto-serves when the holder sits on the ball too long', () => {
    const state = playing()
    for (let i = 0; i < TENNIS.AUTO_SERVE_SECONDS * TICKS_PER_SECOND + 1; i++) tick(state)
    expect(state.ball.heldBy).toBeNull()
    expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(TENNIS.BALL_SPEED, 0)
  })
})

describe('scoring', () => {
  function concede(state: TennisState, losingTeam: 'red' | 'blue'): void {
    // Drive the ball over the losing team's baseline.
    state.pauseTicks = 0
    state.ball.heldBy = null
    state.ball.x = losingTeam === 'red' ? 2 : TENNIS.COURT_WIDTH - 2
    state.ball.y = 250
    state.ball.vx = losingTeam === 'red' ? -TENNIS.BALL_SPEED : TENNIS.BALL_SPEED
    state.ball.vy = 0
    tick(state)
  }

  it('scores tennis-style and keeps the same server for the whole game', () => {
    const state = playing()
    const firstServer = server(state)
    const servingTeam = state.serveTeam
    concede(state, 'red')
    expect(state.points.blue).toBe(1)
    expect(tennis.view(state, null, ctx).points.blue).toBe('15')
    expect(state.banner).toContain('Point — Team blue')
    expect(state.serveTeam).toBe(servingTeam)
    for (let i = 0; i < PAUSE_TICKS; i++) tick(state)
    expect(state.ball.heldBy).toBe(firstServer.id)
  })

  it('hands the serve to the other team after each game, rotating partners', () => {
    const big = { activeIds: ['h', 'a', 'b', 'c'] }
    const state = playing(big)
    const firstServer = server(state)
    const firstTeam = state.serveTeam
    for (let p = 0; p < 4; p++) {
      concede(state, 'red')
      for (let i = 0; i < PAUSE_TICKS; i++) tick(state, big)
    }
    expect(state.games.blue).toBe(1)
    expect(state.serveTeam).toBe(firstTeam === 'red' ? 'blue' : 'red')
    expect(server(state).team).toBe(state.serveTeam)
    for (let p = 0; p < 4; p++) {
      concede(state, 'blue')
      for (let i = 0; i < PAUSE_TICKS; i++) tick(state, big)
    }
    // 1–1: the first team serves again, now through its other player.
    expect(state.winner).toBeNull()
    expect(state.serveTeam).toBe(firstTeam)
    expect(server(state).team).toBe(firstTeam)
    expect(server(state).id).not.toBe(firstServer.id)
  })

  it('wins a game at the 4th point and the match at 2 games', () => {
    const state = playing()
    for (let g = 0; g < 2; g++) {
      for (let p = 0; p < 4; p++) {
        concede(state, 'red')
        if (!(g === 1 && p === 3)) for (let i = 0; i < PAUSE_TICKS; i++) tick(state)
      }
    }
    expect(state.games.blue).toBe(2)
    expect(state.winner).toBe('blue')
    for (let i = 0; i < PAUSE_TICKS; i++) tick(state)
    expect(state.phase).toBe('finished')
    expect(tick(state)).toBe(false)
  })

  it('restart redraws the court and resets the score', () => {
    const state = playing()
    concede(state, 'red')
    tennis.action(state, { kind: 'tennis/restart' }, host, ctx)
    expect(state.phase).toBe('countdown')
    expect(state.points).toEqual({ red: 0, blue: 0 })
    expect(state.games).toEqual({ red: 0, blue: 0 })
    expect(state.winner).toBeNull()
  })
})
