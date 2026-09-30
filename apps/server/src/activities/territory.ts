import {
  TERRITORY,
  type ActivityAction,
  type ActivityConfig,
  type SnowfightTeam,
  type TerritoryView,
} from '@team-fridays/shared'
import {
  ActivityError,
  requireActive,
  requireHost,
  type ActivityCtx,
  type ActivityDefinition,
  type Actor,
} from './types'

const {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
  TICK_MS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  ROUND_SECONDS,
  COUNTDOWN_SECONDS,
} = TERRITORY

const DT = TICK_MS / 1000
const DIAGONAL = Math.SQRT1_2
const TICKS_PER_SECOND = 1000 / TICK_MS
const COUNTDOWN_TICKS = COUNTDOWN_SECONDS * TICKS_PER_SECOND

interface Player {
  id: string
  team: SnowfightTeam
  x: number
  y: number
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
}

export interface TerritoryState {
  phase: 'lobby' | 'countdown' | 'playing' | 'finished'
  countdownTicks: number
  players: Map<string, Player>
  /** Row-major cells: 0 unpainted, 1 red, 2 blue. */
  grid: Uint8Array
  counts: { red: number; blue: number }
  ticksRemaining: number
  winner: SnowfightTeam | 'draw' | null
}

function freshState(ctx: ActivityCtx): TerritoryState {
  if (ctx.activeIds.length < 2) throw new ActivityError('Need at least 2 players')
  const players = new Map<string, Player>()
  const counts = { red: 0, blue: 0 }
  const perTeam = { red: Math.ceil(ctx.activeIds.length / 2), blue: Math.floor(ctx.activeIds.length / 2) }
  ctx.activeIds.forEach((id, i) => {
    const team: SnowfightTeam = i % 2 === 0 ? 'red' : 'blue'
    counts[team] += 1
    players.set(id, {
      id,
      team,
      x: team === 'red' ? ARENA_WIDTH * 0.1 : ARENA_WIDTH * 0.9,
      y: (ARENA_HEIGHT * counts[team]) / (perTeam[team] + 1),
      dx: 0,
      dy: 0,
    })
  })
  return {
    phase: 'lobby',
    countdownTicks: COUNTDOWN_TICKS,
    players,
    grid: new Uint8Array(GRID_COLS * GRID_ROWS),
    counts: { red: 0, blue: 0 },
    ticksRemaining: ROUND_SECONDS * TICKS_PER_SECOND,
    winner: null,
  }
}

/** Paint every cell the player's circle overlaps. Returns whether anything changed. */
function paint(state: TerritoryState, player: Player): boolean {
  const teamValue = player.team === 'red' ? 1 : 2
  let changed = false
  const minCol = Math.max(0, Math.floor((player.x - PLAYER_RADIUS) / CELL_SIZE))
  const maxCol = Math.min(GRID_COLS - 1, Math.floor((player.x + PLAYER_RADIUS) / CELL_SIZE))
  const minRow = Math.max(0, Math.floor((player.y - PLAYER_RADIUS) / CELL_SIZE))
  const maxRow = Math.min(GRID_ROWS - 1, Math.floor((player.y + PLAYER_RADIUS) / CELL_SIZE))
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const index = row * GRID_COLS + col
      const previous = state.grid[index]
      if (previous === teamValue) continue
      if (previous === 1) state.counts.red -= 1
      else if (previous === 2) state.counts.blue -= 1
      state.grid[index] = teamValue
      if (teamValue === 1) state.counts.red += 1
      else state.counts.blue += 1
      changed = true
    }
  }
  return changed
}

export const territory: ActivityDefinition<TerritoryState, TerritoryView> = {
  type: 'territory',
  tickIntervalMs: TICK_MS,

  create(config: ActivityConfig, ctx: ActivityCtx): TerritoryState {
    if (config.type !== 'territory') throw new ActivityError('Invalid config')
    return freshState(ctx)
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'territory/start':
        requireHost(actor)
        if (state.phase !== 'lobby') throw new ActivityError('The round already started')
        state.phase = 'countdown'
        state.countdownTicks = COUNTDOWN_TICKS
        return
      case 'territory/move': {
        requireActive(actor, ctx)
        if (state.phase !== 'playing') throw new ActivityError('The round is not running')
        const player = state.players.get(actor.id)
        if (!player) throw new ActivityError('You are not in this round')
        player.dx = action.dx
        player.dy = action.dy
        return
      }
      case 'territory/restart':
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
        // Paint everyone's spawn so the map starts alive.
        for (const p of state.players.values()) paint(state, p)
        return true
      }
      return state.countdownTicks % TICKS_PER_SECOND === 0
    }
    if (state.phase !== 'playing') return false
    state.ticksRemaining -= 1

    let changed = false
    for (const p of state.players.values()) {
      if (p.dx === 0 && p.dy === 0) continue
      const scale = p.dx !== 0 && p.dy !== 0 ? DIAGONAL : 1
      p.x += p.dx * PLAYER_SPEED * scale * DT
      p.y += p.dy * PLAYER_SPEED * scale * DT
      p.x = Math.min(Math.max(p.x, PLAYER_RADIUS), ARENA_WIDTH - PLAYER_RADIUS)
      p.y = Math.min(Math.max(p.y, PLAYER_RADIUS), ARENA_HEIGHT - PLAYER_RADIUS)
      paint(state, p)
      changed = true
    }

    if (state.ticksRemaining <= 0) {
      state.phase = 'finished'
      state.winner =
        state.counts.red === state.counts.blue
          ? 'draw'
          : state.counts.red > state.counts.blue
            ? 'red'
            : 'blue'
      for (const p of state.players.values()) {
        p.dx = 0
        p.dy = 0
      }
      return true
    }
    return changed || state.ticksRemaining % TICKS_PER_SECOND === 0
  },

  view(state): TerritoryView {
    return {
      type: 'territory',
      phase: state.phase,
      countdownSeconds:
        state.phase === 'countdown' ? Math.ceil(state.countdownTicks / TICKS_PER_SECOND) : 0,
      secondsRemaining: Math.max(0, Math.ceil(state.ticksRemaining / TICKS_PER_SECOND)),
      players: [...state.players.values()].map((p) => ({
        id: p.id,
        team: p.team,
        x: Math.round(p.x),
        y: Math.round(p.y),
      })),
      grid: Array.from(state.grid, (v) => String(v)).join(''),
      counts: { ...state.counts },
      winner: state.winner,
    }
  },
}
