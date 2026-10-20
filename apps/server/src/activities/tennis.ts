import {
  TENNIS,
  TENNIS_POINT_LABELS,
  type ActivityAction,
  type ActivityConfig,
  type SnowfightTeam,
  type TennisView,
} from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  shuffle,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

const {
  COURT_WIDTH,
  COURT_HEIGHT,
  TICK_MS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  BALL_RADIUS,
  BALL_SPEED,
  HIT_REACH,
  HIT_COOLDOWN_TICKS,
  NET_MARGIN,
  MAX_PLAYERS,
  GAMES_TO_WIN,
  COUNTDOWN_SECONDS,
  AUTO_SERVE_SECONDS,
  POINT_PAUSE_SECONDS,
} = TENNIS

const DT = TICK_MS / 1000
const DIAGONAL = Math.SQRT1_2
const TICKS_PER_SECOND = 1000 / TICK_MS
const COUNTDOWN_TICKS = COUNTDOWN_SECONDS * TICKS_PER_SECOND
const AUTO_SERVE_TICKS = AUTO_SERVE_SECONDS * TICKS_PER_SECOND
const POINT_PAUSE_TICKS = POINT_PAUSE_SECONDS * TICKS_PER_SECOND
/** A hit must send the ball meaningfully toward the enemy half. */
const MIN_CROSS_COMPONENT = 0.35

interface Player {
  id: string
  team: SnowfightTeam
  x: number
  y: number
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
  lastHitTick: number
}

export interface TennisState {
  phase: 'lobby' | 'countdown' | 'playing' | 'finished'
  countdownTicks: number
  tickCount: number
  players: Map<string, Player>
  ball: { x: number; y: number; vx: number; vy: number; heldBy: string | null }
  points: { red: number; blue: number }
  games: { red: number; blue: number }
  serveTeam: SnowfightTeam
  serveIndex: { red: number; blue: number }
  lastHitTeam: SnowfightTeam | null
  autoServeTicks: number
  pauseTicks: number
  banner: string | null
  winner: SnowfightTeam | null
}

const other = (team: SnowfightTeam): SnowfightTeam => (team === 'red' ? 'blue' : 'red')

function freshState(ctx: ActivityCtx): TennisState {
  if (ctx.activeIds.length < 2) throw new ActivityError('Need at least 2 players')
  // Up to 4 play; in a bigger room, the court is drawn at random and the rest watch.
  const court = shuffle(ctx.activeIds).slice(0, Math.min(MAX_PLAYERS, ctx.activeIds.length))
  const players = new Map<string, Player>()
  const counts = { red: 0, blue: 0 }
  const perTeam = { red: Math.ceil(court.length / 2), blue: Math.floor(court.length / 2) }
  court.forEach((id, i) => {
    const team: SnowfightTeam = i % 2 === 0 ? 'red' : 'blue'
    counts[team] += 1
    players.set(id, {
      id,
      team,
      x: team === 'red' ? COURT_WIDTH * 0.2 : COURT_WIDTH * 0.8,
      y: (COURT_HEIGHT * counts[team]) / (perTeam[team] + 1),
      dx: 0,
      dy: 0,
      lastHitTick: -1000,
    })
  })
  return {
    phase: 'lobby',
    countdownTicks: COUNTDOWN_TICKS,
    tickCount: 0,
    players,
    ball: { x: COURT_WIDTH / 2, y: COURT_HEIGHT / 2, vx: 0, vy: 0, heldBy: null },
    points: { red: 0, blue: 0 },
    games: { red: 0, blue: 0 },
    serveTeam: Math.random() < 0.5 ? 'red' : 'blue',
    serveIndex: { red: 0, blue: 0 },
    lastHitTeam: null,
    autoServeTicks: AUTO_SERVE_TICKS,
    pauseTicks: 0,
    banner: null,
    winner: null,
  }
}

/** Hand the ball to the serving team's current server (same player for the whole game). */
function startServe(state: TennisState): void {
  const members = [...state.players.values()].filter((p) => p.team === state.serveTeam)
  const server = members[state.serveIndex[state.serveTeam] % members.length] as Player
  state.ball = { x: server.x, y: server.y, vx: 0, vy: 0, heldBy: server.id }
  state.autoServeTicks = AUTO_SERVE_TICKS
  state.banner = null
}

/** Direction-clamped launch: the ball always travels toward the enemy half. */
function launch(state: TennisState, hitter: Player, targetX: number, targetY: number): void {
  let nx = targetX - state.ball.x
  let ny = targetY - state.ball.y
  const len = Math.hypot(nx, ny)
  if (len < 1) {
    nx = hitter.team === 'red' ? 1 : -1
    ny = 0
  } else {
    nx /= len
    ny /= len
  }
  if (hitter.team === 'red') nx = Math.max(nx, MIN_CROSS_COMPONENT)
  else nx = Math.min(nx, -MIN_CROSS_COMPONENT)
  const norm = Math.hypot(nx, ny)
  state.ball.vx = (nx / norm) * BALL_SPEED
  state.ball.vy = (ny / norm) * BALL_SPEED
  state.ball.heldBy = null
  state.lastHitTeam = hitter.team
  hitter.lastHitTick = state.tickCount
}

function scorePoint(state: TennisState, team: SnowfightTeam, reason = ''): void {
  const prefix = reason ? `${reason} ` : ''
  state.points[team] += 1
  if (state.points[team] >= 4) {
    state.games[team] += 1
    state.points.red = 0
    state.points.blue = 0
    if (state.games[team] >= GAMES_TO_WIN) {
      state.winner = team
      state.banner = `${prefix}Game, set, match — Team ${team}! 🏆`
    } else {
      state.banner = `${prefix}Game — Team ${team}!`
    }
    // Like real tennis: the serve changes sides every game, and the team
    // that just served rotates to its next server for their next turn.
    state.serveIndex[state.serveTeam] += 1
    state.serveTeam = other(state.serveTeam)
  } else {
    state.banner = `${prefix}Point — Team ${team}!`
  }
  state.ball.vx = 0
  state.ball.vy = 0
  state.ball.heldBy = null
  state.pauseTicks = POINT_PAUSE_TICKS
}

function courtPlayer(state: TennisState, actor: Actor, ctx: ActivityCtx): Player {
  requireActive(actor, ctx)
  const player = state.players.get(actor.id)
  if (!player) throw new ActivityError('You are watching this match — rematches redraw the court')
  if (state.phase !== 'playing') throw new ActivityError('The match is not running')
  return player
}

export const tennis: ActivityDefinition<TennisState, TennisView> = {
  type: 'tennis',
  tickIntervalMs: TICK_MS,

  create(config: ActivityConfig, ctx: ActivityCtx): TennisState {
    if (config.type !== 'tennis') throw new ActivityError('Invalid config')
    return freshState(ctx)
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'tennis/start':
        requireHost(actor)
        if (state.phase !== 'lobby') throw new ActivityError('The match already started')
        state.phase = 'countdown'
        state.countdownTicks = COUNTDOWN_TICKS
        return
      case 'tennis/move': {
        const player = courtPlayer(state, actor, ctx)
        player.dx = action.dx
        player.dy = action.dy
        return
      }
      case 'tennis/hit': {
        const player = courtPlayer(state, actor, ctx)
        if (state.pauseTicks > 0) throw new ActivityError('Wait for the next serve')
        if (state.tickCount - player.lastHitTick < HIT_COOLDOWN_TICKS)
          throw new ActivityError('Still swinging')
        const held = state.ball.heldBy
        if (held !== null && held !== player.id)
          throw new ActivityError('Not your serve')
        if (held === null && Math.hypot(state.ball.x - player.x, state.ball.y - player.y) > HIT_REACH)
          throw new ActivityError('Too far from the ball')
        launch(state, player, action.x, action.y)
        return
      }
      case 'tennis/restart':
        requireHost(actor)
        Object.assign(state, freshState(ctx))
        state.phase = 'countdown'
        return
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  tick(state): boolean {
    if (state.phase === 'countdown') {
      state.countdownTicks -= 1
      if (state.countdownTicks <= 0) {
        state.phase = 'playing'
        startServe(state)
        return true
      }
      return state.countdownTicks % TICKS_PER_SECOND === 0
    }
    if (state.phase !== 'playing') return false
    state.tickCount += 1

    if (state.pauseTicks > 0) {
      state.pauseTicks -= 1
      if (state.pauseTicks === 0) {
        if (state.winner) state.phase = 'finished'
        else startServe(state)
        return true
      }
      return false
    }

    let changed = false
    for (const p of state.players.values()) {
      if (p.dx === 0 && p.dy === 0) continue
      const scale = p.dx !== 0 && p.dy !== 0 ? DIAGONAL : 1
      p.x += p.dx * PLAYER_SPEED * scale * DT
      p.y += p.dy * PLAYER_SPEED * scale * DT
      const [minX, maxX] =
        p.team === 'red'
          ? [PLAYER_RADIUS, COURT_WIDTH / 2 - NET_MARGIN]
          : [COURT_WIDTH / 2 + NET_MARGIN, COURT_WIDTH - PLAYER_RADIUS]
      p.x = Math.min(Math.max(p.x, minX), maxX)
      p.y = Math.min(Math.max(p.y, PLAYER_RADIUS), COURT_HEIGHT - PLAYER_RADIUS)
      changed = true
    }

    const ball = state.ball
    if (ball.heldBy) {
      const holder = state.players.get(ball.heldBy)
      if (holder) {
        ball.x = holder.x + (holder.team === 'red' ? 20 : -20)
        ball.y = holder.y
      }
      state.autoServeTicks -= 1
      if (state.autoServeTicks <= 0 && holder) {
        launch(
          state,
          holder,
          holder.team === 'red' ? COURT_WIDTH * 0.75 : COURT_WIDTH * 0.25,
          Math.random() * COURT_HEIGHT,
        )
        changed = true
      }
    } else if (ball.vx !== 0 || ball.vy !== 0) {
      ball.x += ball.vx * DT
      ball.y += ball.vy * DT
      // Crossing a side line is out: the point goes against whoever hit the ball.
      if (ball.y < -BALL_RADIUS || ball.y > COURT_HEIGHT + BALL_RADIUS) {
        scorePoint(state, other(state.lastHitTeam ?? state.serveTeam), 'Out!')
      } else if (ball.x < -BALL_RADIUS) scorePoint(state, 'blue')
      else if (ball.x > COURT_WIDTH + BALL_RADIUS) scorePoint(state, 'red')
      changed = true
    }
    return changed
  },

  view(state): TennisView {
    return {
      type: 'tennis',
      phase: state.phase,
      countdownSeconds:
        state.phase === 'countdown' ? Math.ceil(state.countdownTicks / TICKS_PER_SECOND) : 0,
      players: [...state.players.values()].map((p) => ({
        id: p.id,
        team: p.team,
        x: Math.round(p.x),
        y: Math.round(p.y),
        swinging:
          state.phase === 'playing' && state.tickCount - p.lastHitTick < TENNIS.SWING_TICKS,
      })),
      ball:
        state.phase === 'playing' || state.phase === 'finished'
          ? { x: Math.round(state.ball.x), y: Math.round(state.ball.y), heldBy: state.ball.heldBy }
          : null,
      points: {
        red: TENNIS_POINT_LABELS[Math.min(state.points.red, 3)] as string,
        blue: TENNIS_POINT_LABELS[Math.min(state.points.blue, 3)] as string,
      },
      games: { ...state.games },
      serveTeam: state.phase === 'playing' ? state.serveTeam : null,
      banner: state.banner,
      winner: state.winner,
    }
  },
}
