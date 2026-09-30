import {
  SNOWFIGHT,
  type ActivityAction,
  type ActivityConfig,
  type SnowfightTeam,
  type SnowfightView,
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
  TICK_MS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  BALL_RADIUS,
  BALL_SPEED,
  THROW_COOLDOWN_TICKS,
  MAX_HP,
  ROUND_SECONDS,
  BARRIER_BUILD_SECONDS,
  BARRIER_HP,
  BARRIER_WIDTH,
  BARRIER_HEIGHT,
  BARRIER_OFFSET,
  COUNTDOWN_SECONDS,
} = SNOWFIGHT

const BARRIER_BUILD_TICKS = BARRIER_BUILD_SECONDS * (1000 / TICK_MS)
const COUNTDOWN_TICKS = COUNTDOWN_SECONDS * (1000 / TICK_MS)
const TICKS_PER_SECOND = 1000 / TICK_MS

const DT = TICK_MS / 1000
const DIAGONAL = Math.SQRT1_2

interface Player {
  id: string
  team: SnowfightTeam
  x: number
  y: number
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
  hp: number
  frozen: boolean
  lastThrowTick: number
  hits: number
  /** Rooted while set; the barrier appears at (x, y) when ticksLeft reaches 0. */
  building: { ticksLeft: number; x: number; y: number } | null
}

interface Barrier {
  id: number
  ownerId: string
  team: SnowfightTeam
  x: number
  y: number
  hp: number
}

interface Snowball {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  ownerId: string
  team: SnowfightTeam
}

export interface SnowfightState {
  phase: 'lobby' | 'countdown' | 'playing' | 'finished'
  countdownTicks: number
  players: Map<string, Player>
  snowballs: Snowball[]
  barriers: Barrier[]
  tickCount: number
  ticksRemaining: number
  winner: SnowfightTeam | 'draw' | null
  nextBallId: number
  nextBarrierId: number
}

function spawnPlayers(activeIds: string[]): Map<string, Player> {
  const players = new Map<string, Player>()
  // Alternate teams for balance; spread each team vertically on its own side.
  const teams: SnowfightTeam[] = ['red', 'blue']
  const counts = { red: 0, blue: 0 }
  const perTeam = { red: Math.ceil(activeIds.length / 2), blue: Math.floor(activeIds.length / 2) }
  activeIds.forEach((id, i) => {
    const team = teams[i % 2] as SnowfightTeam
    counts[team] += 1
    players.set(id, {
      id,
      team,
      x: team === 'red' ? ARENA_WIDTH * 0.15 : ARENA_WIDTH * 0.85,
      y: (ARENA_HEIGHT * counts[team]) / (perTeam[team] + 1),
      dx: 0,
      dy: 0,
      hp: MAX_HP,
      frozen: false,
      lastThrowTick: -THROW_COOLDOWN_TICKS,
      hits: 0,
      building: null,
    })
  })
  return players
}

function freshState(ctx: ActivityCtx): SnowfightState {
  if (ctx.activeIds.length < 2) throw new ActivityError('Need at least 2 players')
  return {
    phase: 'lobby',
    countdownTicks: COUNTDOWN_TICKS,
    players: spawnPlayers(ctx.activeIds),
    snowballs: [],
    barriers: [],
    tickCount: 0,
    ticksRemaining: ROUND_SECONDS * (1000 / TICK_MS),
    winner: null,
    nextBallId: 1,
    nextBarrierId: 1,
  }
}

function alivePlayers(state: SnowfightState, team: SnowfightTeam): Player[] {
  return [...state.players.values()].filter((p) => p.team === team && !p.frozen)
}

function teamHp(state: SnowfightState, team: SnowfightTeam): number {
  return [...state.players.values()]
    .filter((p) => p.team === team)
    .reduce((sum, p) => sum + p.hp, 0)
}

function finish(state: SnowfightState, winner: SnowfightTeam | 'draw'): void {
  state.phase = 'finished'
  state.winner = winner
  state.snowballs = []
  for (const p of state.players.values()) {
    p.dx = 0
    p.dy = 0
    p.building = null
  }
}

function requirePlayer(state: SnowfightState, actor: Actor, ctx: ActivityCtx): Player {
  requireActive(actor, ctx)
  const player = state.players.get(actor.id)
  if (!player) throw new ActivityError('You are not in this round — wait for the next one')
  if (player.frozen) throw new ActivityError('You are frozen — wait for the next round')
  if (state.phase !== 'playing') throw new ActivityError('The round is not running')
  return player
}

export const snowfight: ActivityDefinition<SnowfightState, SnowfightView> = {
  type: 'snowfight',
  tickIntervalMs: TICK_MS,

  create(config: ActivityConfig, ctx: ActivityCtx): SnowfightState {
    if (config.type !== 'snowfight') throw new ActivityError('Invalid config')
    return freshState(ctx)
  },

  action(state, action: ActivityAction, actor: Actor, ctx: ActivityCtx): void {
    switch (action.kind) {
      case 'snowfight/start':
        requireHost(actor)
        if (state.phase !== 'lobby') throw new ActivityError('The round already started')
        state.phase = 'countdown'
        state.countdownTicks = COUNTDOWN_TICKS
        return
      case 'snowfight/move': {
        const player = requirePlayer(state, actor, ctx)
        // Moving abandons a build in progress.
        if (player.building && (action.dx !== 0 || action.dy !== 0)) player.building = null
        player.dx = action.dx
        player.dy = action.dy
        return
      }
      case 'snowfight/build': {
        const player = requirePlayer(state, actor, ctx)
        if (player.building) throw new ActivityError('Already building')
        if (state.barriers.some((b) => b.ownerId === player.id))
          throw new ActivityError('Your barrier is still standing')
        const towardEnemy = player.team === 'red' ? 1 : -1
        player.building = {
          ticksLeft: BARRIER_BUILD_TICKS,
          x: Math.min(
            Math.max(player.x + towardEnemy * BARRIER_OFFSET, BARRIER_WIDTH / 2),
            ARENA_WIDTH - BARRIER_WIDTH / 2,
          ),
          y: Math.min(
            Math.max(player.y, BARRIER_HEIGHT / 2),
            ARENA_HEIGHT - BARRIER_HEIGHT / 2,
          ),
        }
        player.dx = 0
        player.dy = 0
        return
      }
      case 'snowfight/throw': {
        const player = requirePlayer(state, actor, ctx)
        if (player.building) throw new ActivityError('Finish building first')
        if (state.tickCount - player.lastThrowTick < THROW_COOLDOWN_TICKS)
          throw new ActivityError('Still packing the next snowball')
        const distX = action.x - player.x
        const distY = action.y - player.y
        const length = Math.hypot(distX, distY)
        if (length < 1) return
        player.lastThrowTick = state.tickCount
        state.snowballs.push({
          id: state.nextBallId++,
          x: player.x,
          y: player.y,
          vx: (distX / length) * BALL_SPEED,
          vy: (distY / length) * BALL_SPEED,
          ownerId: player.id,
          team: player.team,
        })
        return
      }
      case 'snowfight/restart': {
        requireHost(actor)
        Object.assign(state, freshState(ctx))
        // A rematch skips the ready screen but still gets the 3-2-1.
        state.phase = 'countdown'
        return
      }
      default:
        throw new ActivityError('Invalid action for this activity')
    }
  },

  /** Advances the simulation one step. Returns whether clients need an update. */
  tick(state): boolean {
    if (state.phase === 'countdown') {
      state.countdownTicks -= 1
      if (state.countdownTicks <= 0) {
        state.phase = 'playing'
        return true
      }
      // The countdown display only changes on whole seconds.
      return state.countdownTicks % TICKS_PER_SECOND === 0
    }
    if (state.phase !== 'playing') return false
    state.tickCount += 1
    state.ticksRemaining -= 1

    let moved = false
    for (const p of state.players.values()) {
      if (p.building) {
        p.building.ticksLeft -= 1
        if (p.building.ticksLeft <= 0) {
          state.barriers.push({
            id: state.nextBarrierId++,
            ownerId: p.id,
            team: p.team,
            x: p.building.x,
            y: p.building.y,
            hp: BARRIER_HP,
          })
          p.building = null
        }
        moved = true
        continue
      }
      if (p.frozen || (p.dx === 0 && p.dy === 0)) continue
      const scale = p.dx !== 0 && p.dy !== 0 ? DIAGONAL : 1
      p.x += p.dx * PLAYER_SPEED * scale * DT
      p.y += p.dy * PLAYER_SPEED * scale * DT
      p.x = Math.min(Math.max(p.x, PLAYER_RADIUS), ARENA_WIDTH - PLAYER_RADIUS)
      p.y = Math.min(Math.max(p.y, PLAYER_RADIUS), ARENA_HEIGHT - PLAYER_RADIUS)
      moved = true
    }

    let impact = false
    if (state.snowballs.length > 0) {
      const survivors: Snowball[] = []
      for (const ball of state.snowballs) {
        ball.x += ball.vx * DT
        ball.y += ball.vy * DT
        if (
          ball.x < -BALL_RADIUS ||
          ball.x > ARENA_WIDTH + BALL_RADIUS ||
          ball.y < -BALL_RADIUS ||
          ball.y > ARENA_HEIGHT + BALL_RADIUS
        ) {
          impact = true
          continue
        }
        // Barriers are cover: they intercept enemy snowballs before players.
        let blocked = false
        for (const barrier of state.barriers) {
          if (barrier.team === ball.team) continue
          if (
            Math.abs(ball.x - barrier.x) <= BARRIER_WIDTH / 2 + BALL_RADIUS &&
            Math.abs(ball.y - barrier.y) <= BARRIER_HEIGHT / 2 + BALL_RADIUS
          ) {
            barrier.hp -= 1
            if (barrier.hp <= 0)
              state.barriers = state.barriers.filter((b) => b.id !== barrier.id)
            blocked = true
            impact = true
            break
          }
        }
        if (blocked) continue

        let hitSomeone = false
        for (const p of state.players.values()) {
          if (p.team === ball.team || p.frozen) continue
          if (Math.hypot(p.x - ball.x, p.y - ball.y) <= PLAYER_RADIUS + BALL_RADIUS) {
            p.hp -= 1
            // A hit interrupts the build — that's the risk of building in the open.
            p.building = null
            if (p.hp <= 0) {
              p.frozen = true
              p.dx = 0
              p.dy = 0
            }
            const owner = state.players.get(ball.ownerId)
            if (owner) owner.hits += 1
            hitSomeone = true
            impact = true
            break
          }
        }
        if (!hitSomeone) survivors.push(ball)
      }
      state.snowballs = survivors
    }

    let roundOver = true
    if (alivePlayers(state, 'red').length === 0) finish(state, 'blue')
    else if (alivePlayers(state, 'blue').length === 0) finish(state, 'red')
    else if (state.ticksRemaining <= 0) {
      const red = teamHp(state, 'red')
      const blue = teamHp(state, 'blue')
      finish(state, red === blue ? 'draw' : red > blue ? 'red' : 'blue')
    } else {
      roundOver = false
    }

    // Skip idle broadcasts; the timer UI only needs a refresh once per second.
    return (
      moved ||
      impact ||
      roundOver ||
      state.snowballs.length > 0 ||
      state.ticksRemaining % (1000 / TICK_MS) === 0
    )
  },

  view(state): SnowfightView {
    return {
      type: 'snowfight',
      phase: state.phase,
      countdownSeconds:
        state.phase === 'countdown' ? Math.ceil(state.countdownTicks / TICKS_PER_SECOND) : 0,
      secondsRemaining: Math.max(0, Math.ceil(state.ticksRemaining / (1000 / TICK_MS))),
      winner: state.winner,
      players: [...state.players.values()].map((p) => ({
        id: p.id,
        team: p.team,
        x: Math.round(p.x),
        y: Math.round(p.y),
        hp: p.hp,
        frozen: p.frozen,
        hits: p.hits,
        building: p.building
          ? {
              progress: 1 - p.building.ticksLeft / BARRIER_BUILD_TICKS,
              x: Math.round(p.building.x),
              y: Math.round(p.building.y),
            }
          : null,
      })),
      snowballs: state.snowballs.map((b) => ({
        id: b.id,
        x: Math.round(b.x),
        y: Math.round(b.y),
        team: b.team,
      })),
      barriers: state.barriers.map((b) => ({
        id: b.id,
        team: b.team,
        x: b.x,
        y: b.y,
        hp: b.hp,
      })),
    }
  },
}
