<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TENNIS, type TennisView } from '@team-fridays/shared'
import { initials } from '../../lib/avatar'
import { useRoomStore } from '../../stores/room'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'

const props = defineProps<{ view: TennisView }>()
const room = useRoomStore()

const { COURT_WIDTH, COURT_HEIGHT, PLAYER_RADIUS, BALL_RADIUS, HIT_REACH } = TENNIS

const canvasEl = ref<HTMLCanvasElement | null>(null)

const me = computed(() => props.view.players.find((p) => p.id === room.you?.participantId))
const canPlay = computed(() => props.view.phase === 'playing' && me.value !== undefined)
const hostName = computed(() => room.participants.find((p) => p.isHost)?.name ?? 'the host')
const redNames = computed(() =>
  props.view.players.filter((p) => p.team === 'red').map((p) => room.nameOf(p.id)).join(' & '),
)
const blueNames = computed(() =>
  props.view.players.filter((p) => p.team === 'blue').map((p) => room.nameOf(p.id)).join(' & '),
)

// ---------- Input ----------

const held = new Set<string>()
let sentDx = 0
let sentDy = 0

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  w: [0, -1],
  s: [0, 1],
}

function axis(value: number): -1 | 0 | 1 {
  return value < 0 ? -1 : value > 0 ? 1 : 0
}

function sendMove(): void {
  let dx = 0
  let dy = 0
  for (const key of held) {
    const vec = KEYS[key]
    if (vec) {
      dx += vec[0]
      dy += vec[1]
    }
  }
  const nx = axis(dx)
  const ny = axis(dy)
  if (nx === sentDx && ny === sentDy) return
  sentDx = nx
  sentDy = ny
  if (canPlay.value) room.sendAction({ kind: 'tennis/move', dx: nx, dy: ny })
}

function onKeyDown(e: KeyboardEvent): void {
  if (!(e.key in KEYS) || !canPlay.value) return
  e.preventDefault()
  held.add(e.key)
  sendMove()
}

function onKeyUp(e: KeyboardEvent): void {
  if (!(e.key in KEYS)) return
  held.delete(e.key)
  sendMove()
}

function press(key: string): void {
  held.add(key)
  sendMove()
}

function release(key: string): void {
  held.delete(key)
  sendMove()
}

function onCanvasClick(e: MouseEvent): void {
  if (!canPlay.value || !canvasEl.value || !me.value) return
  const ball = props.view.ball
  if (!ball) return
  // Swing only when it can land: your serve, or a loose ball within reach.
  const reachable =
    ball.heldBy === me.value.id ||
    (ball.heldBy === null &&
      Math.hypot(ball.x - me.value.x, ball.y - me.value.y) <= HIT_REACH + 25)
  if (!reachable) return
  const rect = canvasEl.value.getBoundingClientRect()
  const x = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * COURT_WIDTH, 0), COURT_WIDTH)
  const y = Math.min(
    Math.max(((e.clientY - rect.top) / rect.height) * COURT_HEIGHT, 0),
    COURT_HEIGHT,
  )
  room.sendAction({ kind: 'tennis/hit', x, y })
}

// ---------- Rendering ----------

const displayed = new Map<string, { x: number; y: number }>()
let raf = 0

function token(name: string): string {
  return getComputedStyle(canvasEl.value ?? document.documentElement)
    .getPropertyValue(name)
    .trim()
}

function drawCourt(g: CanvasRenderingContext2D): void {
  g.fillStyle = token('--color-court')
  g.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT)
  g.strokeStyle = token('--color-court-line')
  g.lineWidth = 2
  // Outer lines, service boxes, centre line.
  g.strokeRect(14, 14, COURT_WIDTH - 28, COURT_HEIGHT - 28)
  const serviceL = COURT_WIDTH / 2 - 150
  const serviceR = COURT_WIDTH / 2 + 150
  g.beginPath()
  g.moveTo(serviceL, 14)
  g.lineTo(serviceL, COURT_HEIGHT - 14)
  g.moveTo(serviceR, 14)
  g.lineTo(serviceR, COURT_HEIGHT - 14)
  g.moveTo(serviceL, COURT_HEIGHT / 2)
  g.lineTo(serviceR, COURT_HEIGHT / 2)
  g.stroke()
  // The net.
  g.lineWidth = 5
  g.strokeStyle = token('--color-text')
  g.globalAlpha = 0.6
  g.beginPath()
  g.moveTo(COURT_WIDTH / 2, 6)
  g.lineTo(COURT_WIDTH / 2, COURT_HEIGHT - 6)
  g.stroke()
  g.globalAlpha = 1
  g.lineWidth = 1
}

function draw(): void {
  const canvas = canvasEl.value
  const g = canvas?.getContext('2d')
  if (!canvas || !g) return
  const view = props.view

  drawCourt(g)
  const teamColor = { red: token('--color-team-red'), blue: token('--color-team-blue') }

  const seen = new Set<string>()
  for (const p of view.players) {
    seen.add(p.id)
    let pos = displayed.get(p.id)
    if (!pos) {
      pos = { x: p.x, y: p.y }
      displayed.set(p.id, pos)
    } else {
      pos.x += (p.x - pos.x) * 0.45
      pos.y += (p.y - pos.y) * 0.45
    }
    const isYou = p.id === room.you?.participantId
    g.beginPath()
    g.arc(pos.x, pos.y, PLAYER_RADIUS, 0, Math.PI * 2)
    g.fillStyle = teamColor[p.team]
    g.fill()
    if (isYou) {
      g.lineWidth = 3
      g.strokeStyle = token('--color-court-line')
      g.stroke()
      g.lineWidth = 1
    }
    g.fillStyle = '#ffffff'
    g.font = `600 10px ${token('--font-family')}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(initials(room.nameOf(p.id)), pos.x, pos.y)
    g.fillStyle = token('--color-court-line')
    g.font = `500 10px ${token('--font-family')}`
    g.fillText(room.nameOf(p.id), pos.x, pos.y - PLAYER_RADIUS - 8)
  }
  for (const key of displayed.keys()) if (!seen.has(key)) displayed.delete(key)

  if (view.ball) {
    let pos = displayed.get('__ball')
    if (!pos) {
      pos = { x: view.ball.x, y: view.ball.y }
      displayed.set('__ball', pos)
    } else {
      pos.x += (view.ball.x - pos.x) * 0.6
      pos.y += (view.ball.y - pos.y) * 0.6
    }
    g.beginPath()
    g.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2)
    g.fillStyle = token('--color-ball')
    g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.3)'
    g.stroke()
    // Pulse a ring around a held serve so everyone knows who must hit.
    if (view.ball.heldBy) {
      g.beginPath()
      g.arc(pos.x, pos.y, BALL_RADIUS + 5 + 3 * Math.sin(performance.now() / 200), 0, Math.PI * 2)
      g.strokeStyle = token('--color-ball')
      g.stroke()
    }
  }

  raf = requestAnimationFrame(draw)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  raf = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="panel">
    <p class="kicker">Tennis</p>

    <div class="hud">
      <span class="side">
        <UiBadge variant="danger">Red</UiBadge>
        <span class="names">{{ redNames }}</span>
        <span v-if="view.serveTeam === 'red'" class="serve" title="Serving">🎾</span>
      </span>
      <span class="scoreboard" aria-live="off">
        <span class="games">{{ view.games.red }}</span>
        <span class="points">{{ view.points.red }} – {{ view.points.blue }}</span>
        <span class="games">{{ view.games.blue }}</span>
      </span>
      <span class="side right">
        <span v-if="view.serveTeam === 'blue'" class="serve" title="Serving">🎾</span>
        <span class="names">{{ blueNames }}</span>
        <UiBadge variant="accent">Blue</UiBadge>
      </span>
    </div>

    <div class="arena-wrap">
      <canvas
        ref="canvasEl"
        class="court"
        :class="{ playable: canPlay }"
        :width="COURT_WIDTH"
        :height="COURT_HEIGHT"
        @click="onCanvasClick"
      />
      <div v-if="view.phase === 'lobby'" class="overlay" role="status">
        <UiCard class="overlay-card">
          <h2 class="overlay-title">On court 🎾</h2>
          <p class="overlay-sub">
            <strong>{{ redNames }}</strong> vs <strong>{{ blueNames }}</strong>
            <template v-if="!me"> — you're in the stands this match</template>
          </p>
          <p class="overlay-sub">First to {{ TENNIS.GAMES_TO_WIN }} games. Rematches redraw the court.</p>
          <UiButton v-if="room.isHost" size="lg" @click="room.sendAction({ kind: 'tennis/start' })">
            Start match
          </UiButton>
          <p v-else class="overlay-sub">Waiting for {{ hostName }} to start…</p>
        </UiCard>
      </div>
      <div
        v-else-if="view.phase === 'countdown'"
        class="overlay dim"
        role="status"
        aria-live="assertive"
      >
        <span :key="view.countdownSeconds" class="countdown-number">
          {{ view.countdownSeconds }}
        </span>
      </div>
      <div v-else-if="view.banner && view.phase === 'playing'" class="overlay" aria-live="polite">
        <span class="banner-text">{{ view.banner }}</span>
      </div>
      <div v-else-if="view.phase === 'finished'" class="overlay" role="status">
        <UiCard class="overlay-card">
          <h2 class="overlay-title">
            Game, set, match — Team {{ view.winner }}! 🏆
          </h2>
          <p class="overlay-sub">
            {{ view.winner === 'red' ? redNames : blueNames }} take it
            {{ view.games.red }}–{{ view.games.blue }}
          </p>
          <UiButton v-if="room.isHost" @click="room.sendAction({ kind: 'tennis/restart' })">
            Rematch — redraw the court
          </UiButton>
        </UiCard>
      </div>
    </div>

    <p class="help">
      <template v-if="canPlay">
        Move with <kbd>WASD</kbd>/<kbd>arrows</kbd> — when the ball is near you (or it's your
        serve), <strong>click where you want to hit it</strong>.
      </template>
      <template v-else-if="me">
        Controls: <kbd>WASD</kbd>/<kbd>arrows</kbd> to move, click to aim your shot.
      </template>
      <template v-else-if="view.phase !== 'lobby'">
        Spectating — cheer with reactions! Rematches redraw the court.
      </template>
    </p>

    <div v-if="canPlay" class="dpad" aria-label="Movement controls">
      <span />
      <button
        class="dpad-btn"
        aria-label="Up"
        @pointerdown.prevent="press('ArrowUp')"
        @pointerup="release('ArrowUp')"
        @pointerleave="release('ArrowUp')"
      >
        ▲
      </button>
      <span />
      <button
        class="dpad-btn"
        aria-label="Left"
        @pointerdown.prevent="press('ArrowLeft')"
        @pointerup="release('ArrowLeft')"
        @pointerleave="release('ArrowLeft')"
      >
        ◀
      </button>
      <button
        class="dpad-btn"
        aria-label="Down"
        @pointerdown.prevent="press('ArrowDown')"
        @pointerup="release('ArrowDown')"
        @pointerleave="release('ArrowDown')"
      >
        ▼
      </button>
      <button
        class="dpad-btn"
        aria-label="Right"
        @pointerdown.prevent="press('ArrowRight')"
        @pointerup="release('ArrowRight')"
        @pointerleave="release('ArrowRight')"
      >
        ▶
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.kicker {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-accent);
}
.hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.side {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.side.right {
  justify-content: flex-end;
}
.names {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.serve {
  font-size: var(--font-size-sm);
}
.scoreboard {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-3);
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}
.points {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
}
.games {
  font-size: var(--font-size-md);
  color: var(--color-text-muted);
}
.arena-wrap {
  position: relative;
}
.court {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.court.playable {
  cursor: crosshair;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.overlay-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}
.overlay-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  text-transform: capitalize;
}
.overlay-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}
.overlay.dim {
  background: var(--color-overlay);
  border-radius: var(--radius-lg);
}
.countdown-number {
  font-size: 7rem;
  font-weight: var(--font-weight-bold);
  color: var(--color-on-accent);
  animation: countdown-pop var(--motion-slow) var(--motion-ease);
}
.banner-text {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-on-accent);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  animation: countdown-pop var(--motion-slow) var(--motion-ease);
  text-transform: capitalize;
}
@keyframes countdown-pop {
  from {
    transform: scale(1.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.help {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  min-height: 1.5em;
}
kbd {
  font-family: var(--font-family-mono);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
}
.dpad {
  display: none;
  grid-template-columns: repeat(3, 56px);
  gap: var(--space-1);
  justify-content: center;
}
.dpad-btn {
  height: 48px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--font-size-md);
  color: var(--color-text-muted);
  touch-action: none;
}
@media (max-width: 800px), (pointer: coarse) {
  .dpad {
    display: grid;
  }
}
</style>
