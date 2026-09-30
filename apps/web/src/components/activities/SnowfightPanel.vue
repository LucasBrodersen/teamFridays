<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SNOWFIGHT, type SnowfightView } from '@team-fridays/shared'
import { initials } from '../../lib/avatar'
import { useRoomStore } from '../../stores/room'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'

const props = defineProps<{ view: SnowfightView }>()
const room = useRoomStore()

const {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_RADIUS,
  BALL_RADIUS,
  THROW_COOLDOWN_TICKS,
  TICK_MS,
  BARRIER_WIDTH,
  BARRIER_HEIGHT,
  BARRIER_BUILD_SECONDS,
  MAX_HP,
} = SNOWFIGHT

const canvasEl = ref<HTMLCanvasElement | null>(null)

const me = computed(() =>
  props.view.players.find((p) => p.id === room.you?.participantId) ?? null,
)
const canPlay = computed(
  () => props.view.phase === 'playing' && me.value !== null && !me.value.frozen,
)
const redAlive = computed(
  () => props.view.players.filter((p) => p.team === 'red' && !p.frozen).length,
)
const blueAlive = computed(
  () => props.view.players.filter((p) => p.team === 'blue' && !p.frozen).length,
)
const clock = computed(() => {
  const s = props.view.secondsRemaining
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const topThrowers = computed(() =>
  [...props.view.players]
    .filter((p) => p.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3),
)
const hostName = computed(() => room.participants.find((p) => p.isHost)?.name ?? 'the host')

// ---------- Input ----------

const held = new Set<string>()
let sentDx = 0
let sentDy = 0
let lastThrowAt = 0

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
  if (canPlay.value) room.sendAction({ kind: 'snowfight/move', dx: nx, dy: ny })
}

function sendBuild(): void {
  if (canPlay.value) room.sendAction({ kind: 'snowfight/build' })
}

function onKeyDown(e: KeyboardEvent): void {
  if (!canPlay.value) return
  if (e.key === 'b' || e.key === ' ') {
    e.preventDefault()
    sendBuild()
    return
  }
  if (!(e.key in KEYS)) return
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
  if (!canPlay.value || !canvasEl.value) return
  const now = performance.now()
  if (now - lastThrowAt < THROW_COOLDOWN_TICKS * TICK_MS) return
  lastThrowAt = now
  const rect = canvasEl.value.getBoundingClientRect()
  const x = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * ARENA_WIDTH, 0), ARENA_WIDTH)
  const y = Math.min(
    Math.max(((e.clientY - rect.top) / rect.height) * ARENA_HEIGHT, 0),
    ARENA_HEIGHT,
  )
  room.sendAction({ kind: 'snowfight/throw', x, y })
}

// ---------- Rendering ----------
// Snapshots arrive ~20 times/s; positions are smoothed toward their latest
// server value each animation frame so motion looks continuous.

const displayed = new Map<number | string, { x: number; y: number }>()
let raf = 0

function smoothTo(key: number | string, x: number, y: number, factor: number) {
  const cur = displayed.get(key)
  if (!cur) {
    const fresh = { x, y }
    displayed.set(key, fresh)
    return fresh
  }
  cur.x += (x - cur.x) * factor
  cur.y += (y - cur.y) * factor
  return cur
}

function token(name: string): string {
  return getComputedStyle(canvasEl.value ?? document.documentElement)
    .getPropertyValue(name)
    .trim()
}

function draw(): void {
  const canvas = canvasEl.value
  const g = canvas?.getContext('2d')
  if (!canvas || !g) return
  const view = props.view

  g.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT)
  g.fillStyle = token('--color-arena')
  g.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT)
  g.strokeStyle = token('--color-arena-line')
  g.setLineDash([8, 10])
  g.beginPath()
  g.moveTo(ARENA_WIDTH / 2, 0)
  g.lineTo(ARENA_WIDTH / 2, ARENA_HEIGHT)
  g.stroke()
  g.setLineDash([])

  const teamColor = {
    red: token('--color-team-red'),
    blue: token('--color-team-blue'),
  }

  // Barriers and build ghosts sit on the ground, under balls and players.
  for (const barrier of view.barriers) {
    g.fillStyle = teamColor[barrier.team]
    g.globalAlpha = 0.4 + 0.6 * (barrier.hp / SNOWFIGHT.BARRIER_HP)
    g.beginPath()
    g.roundRect(
      barrier.x - BARRIER_WIDTH / 2,
      barrier.y - BARRIER_HEIGHT / 2,
      BARRIER_WIDTH,
      BARRIER_HEIGHT,
      6,
    )
    g.fill()
    g.globalAlpha = 1
    g.fillStyle = '#ffffff'
    for (let i = 0; i < barrier.hp; i++) {
      g.beginPath()
      g.arc(barrier.x, barrier.y - 12 + i * 12, 2.5, 0, Math.PI * 2)
      g.fill()
    }
  }
  for (const p of view.players) {
    if (!p.building) continue
    const ghost = p.building
    g.strokeStyle = teamColor[p.team]
    g.setLineDash([4, 4])
    g.strokeRect(
      ghost.x - BARRIER_WIDTH / 2,
      ghost.y - BARRIER_HEIGHT / 2,
      BARRIER_WIDTH,
      BARRIER_HEIGHT,
    )
    g.setLineDash([])
    g.globalAlpha = 0.5
    g.fillStyle = teamColor[p.team]
    const grown = BARRIER_HEIGHT * ghost.progress
    g.fillRect(
      ghost.x - BARRIER_WIDTH / 2,
      ghost.y + BARRIER_HEIGHT / 2 - grown,
      BARRIER_WIDTH,
      grown,
    )
    g.globalAlpha = 1
  }

  const seen = new Set<number | string>()
  for (const ball of view.snowballs) {
    seen.add(ball.id)
    const pos = smoothTo(ball.id, ball.x, ball.y, 0.55)
    g.beginPath()
    g.arc(pos.x, pos.y, BALL_RADIUS, 0, Math.PI * 2)
    g.fillStyle = token('--color-surface')
    g.fill()
    g.strokeStyle = teamColor[ball.team]
    g.stroke()
  }

  for (const p of view.players) {
    seen.add(p.id)
    const pos = smoothTo(p.id, p.x, p.y, 0.4)
    const isYou = p.id === room.you?.participantId
    g.globalAlpha = p.frozen ? 0.35 : 1
    g.beginPath()
    g.arc(pos.x, pos.y, PLAYER_RADIUS, 0, Math.PI * 2)
    g.fillStyle = teamColor[p.team]
    g.fill()
    if (isYou) {
      g.lineWidth = 3
      g.strokeStyle = token('--color-text')
      g.stroke()
      g.lineWidth = 1
    }
    g.fillStyle = '#ffffff'
    g.font = `600 11px ${token('--font-family')}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(initials(room.nameOf(p.id)), pos.x, pos.y)

    g.font = `500 10px ${token('--font-family')}`
    g.fillStyle = token('--color-text-muted')
    g.fillText(room.nameOf(p.id), pos.x, pos.y - PLAYER_RADIUS - 14)
    if (!p.frozen) {
      for (let i = 0; i < p.hp; i++) {
        g.beginPath()
        g.arc(pos.x - 8 + i * 8, pos.y - PLAYER_RADIUS - 5, 2.5, 0, Math.PI * 2)
        g.fillStyle = teamColor[p.team]
        g.fill()
      }
    } else {
      g.fillText('❄', pos.x, pos.y - PLAYER_RADIUS - 4)
    }
    g.globalAlpha = 1
  }

  for (const key of displayed.keys()) if (!seen.has(key)) displayed.delete(key)
  raf = requestAnimationFrame(draw)
}

watch(canPlay, (can) => {
  if (!can && (sentDx !== 0 || sentDy !== 0)) {
    held.clear()
    sentDx = 0
    sentDy = 0
  }
})

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  raf = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  cancelAnimationFrame(raf)
  if (canPlay.value && (sentDx !== 0 || sentDy !== 0))
    room.sendAction({ kind: 'snowfight/move', dx: 0, dy: 0 })
})
</script>

<template>
  <div class="panel">
    <p class="kicker">Snowball Fight</p>

    <div class="hud">
      <span class="team red">
        <UiBadge variant="danger">Red</UiBadge> {{ redAlive }} standing
      </span>
      <span class="clock" aria-live="off">{{ clock }}</span>
      <span class="team blue">
        {{ blueAlive }} standing <UiBadge variant="accent">Blue</UiBadge>
      </span>
    </div>

    <div class="arena-wrap">
      <canvas
        ref="canvasEl"
        class="arena"
        :width="ARENA_WIDTH"
        :height="ARENA_HEIGHT"
        :class="{ playable: canPlay }"
        @click="onCanvasClick"
      />
      <div v-if="view.phase === 'lobby'" class="banner" role="status">
        <UiCard class="banner-card">
          <h2 class="banner-title">Get ready! ❄️</h2>
          <p class="banner-sub">Find your teammates on the field — red left, blue right.</p>
          <UiButton
            v-if="room.isHost"
            size="lg"
            @click="room.sendAction({ kind: 'snowfight/start' })"
          >
            Start round
          </UiButton>
          <p v-else class="banner-sub">Waiting for {{ hostName }} to start…</p>
        </UiCard>
      </div>
      <div
        v-else-if="view.phase === 'countdown'"
        class="banner countdown"
        role="status"
        aria-live="assertive"
      >
        <span :key="view.countdownSeconds" class="countdown-number">
          {{ view.countdownSeconds }}
        </span>
      </div>
      <div v-else-if="view.phase === 'finished'" class="banner" role="status">
        <UiCard class="banner-card">
          <h2 class="banner-title">
            <template v-if="view.winner === 'draw'">It's a draw!</template>
            <template v-else>Team {{ view.winner }} wins! 🏆</template>
          </h2>
          <ol v-if="topThrowers.length" class="throwers">
            <li v-for="p in topThrowers" :key="p.id">
              {{ room.nameOf(p.id) }} — {{ p.hits }} {{ p.hits === 1 ? 'hit' : 'hits' }}
            </li>
          </ol>
          <UiButton v-if="room.isHost" @click="room.sendAction({ kind: 'snowfight/restart' })">
            Another round
          </UiButton>
        </UiCard>
      </div>
    </div>

    <p class="help">
      <template v-if="canPlay">
        Move with <kbd>WASD</kbd>/<kbd>arrows</kbd>, click the arena to throw, <kbd>B</kbd> to
        build a wall ({{ BARRIER_BUILD_SECONDS }}s, hold still!). Take {{ MAX_HP }} hits and
        you're frozen!
      </template>
      <template v-else-if="view.phase === 'lobby' || view.phase === 'countdown'">
        Controls: <kbd>WASD</kbd>/<kbd>arrows</kbd> to move, click to throw, <kbd>B</kbd> to build
        a wall. Take {{ MAX_HP }} hits and you're frozen!
      </template>
      <template v-else-if="me?.frozen">You're frozen ❄ — cheer for your team!</template>
      <template v-else-if="!me && view.phase === 'playing'">
        Spectating this round — you're in from the next one.
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
      <span />
      <button class="dpad-btn build" aria-label="Build a wall" @click="sendBuild">🧱</button>
      <span />
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
.team {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.clock {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.arena-wrap {
  position: relative;
}
.arena {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-arena);
}
.arena.playable {
  cursor: crosshair;
}
.banner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.banner-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  box-shadow: var(--shadow-lg);
}
.banner-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  text-transform: capitalize;
}
.banner-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.banner.countdown {
  background: var(--color-overlay);
  border-radius: var(--radius-lg);
}
.countdown-number {
  font-size: 7rem;
  font-weight: var(--font-weight-bold);
  color: var(--color-on-accent);
  animation: countdown-pop var(--motion-slow) var(--motion-ease);
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
.throwers {
  margin: 0;
  padding: 0 0 0 var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
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
.dpad-btn:active {
  background: var(--color-accent-soft);
}
@media (max-width: 800px), (pointer: coarse) {
  .dpad {
    display: grid;
  }
}
</style>
