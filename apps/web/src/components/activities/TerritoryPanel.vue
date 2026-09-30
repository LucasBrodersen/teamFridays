<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TERRITORY, type TerritoryView } from '@team-fridays/shared'
import { initials } from '../../lib/avatar'
import { useRoomStore } from '../../stores/room'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'

const props = defineProps<{ view: TerritoryView }>()
const room = useRoomStore()

const { ARENA_WIDTH, ARENA_HEIGHT, CELL_SIZE, GRID_COLS, PLAYER_RADIUS } = TERRITORY

const canvasEl = ref<HTMLCanvasElement | null>(null)

const me = computed(() => props.view.players.find((p) => p.id === room.you?.participantId))
const canPlay = computed(() => props.view.phase === 'playing' && me.value !== undefined)
const clock = computed(() => {
  const s = props.view.secondsRemaining
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const totalCells = TERRITORY.GRID_COLS * TERRITORY.GRID_ROWS
const redPercent = computed(() => Math.round((props.view.counts.red / totalCells) * 100))
const bluePercent = computed(() => Math.round((props.view.counts.blue / totalCells) * 100))
const hostName = computed(() => room.participants.find((p) => p.isHost)?.name ?? 'the host')

// ---------- Input (same scheme as the snowball fight) ----------

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
  if (canPlay.value) room.sendAction({ kind: 'territory/move', dx: nx, dy: ny })
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

// ---------- Rendering ----------

const displayed = new Map<string, { x: number; y: number }>()
let raf = 0

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

  g.fillStyle = token('--color-arena')
  g.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT)

  const teamColor = { red: token('--color-team-red'), blue: token('--color-team-blue') }
  g.globalAlpha = 0.55
  for (let i = 0; i < view.grid.length; i++) {
    const cell = view.grid[i]
    if (cell === '0') continue
    g.fillStyle = cell === '1' ? teamColor.red : teamColor.blue
    g.fillRect((i % GRID_COLS) * CELL_SIZE, Math.floor(i / GRID_COLS) * CELL_SIZE, CELL_SIZE, CELL_SIZE)
  }
  g.globalAlpha = 1

  const seen = new Set<string>()
  for (const p of view.players) {
    seen.add(p.id)
    let pos = displayed.get(p.id)
    if (!pos) {
      pos = { x: p.x, y: p.y }
      displayed.set(p.id, pos)
    } else {
      pos.x += (p.x - pos.x) * 0.4
      pos.y += (p.y - pos.y) * 0.4
    }
    const isYou = p.id === room.you?.participantId
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
    g.font = `600 10px ${token('--font-family')}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(initials(room.nameOf(p.id)), pos.x, pos.y)
  }
  for (const key of displayed.keys()) if (!seen.has(key)) displayed.delete(key)

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
    <p class="kicker">Territory Paint</p>

    <div class="hud">
      <span class="team"><UiBadge variant="danger">Red</UiBadge> {{ redPercent }}%</span>
      <span class="clock">{{ clock }}</span>
      <span class="team">{{ bluePercent }}% <UiBadge variant="accent">Blue</UiBadge></span>
    </div>

    <div class="score-bar">
      <div class="fill-red" :style="{ width: `${redPercent}%` }" />
      <div class="fill-blue" :style="{ width: `${bluePercent}%` }" />
    </div>

    <div class="arena-wrap">
      <canvas
        ref="canvasEl"
        class="arena"
        :width="ARENA_WIDTH"
        :height="ARENA_HEIGHT"
      />
      <div v-if="view.phase === 'lobby'" class="banner" role="status">
        <UiCard class="banner-card">
          <h2 class="banner-title">Paint the town! 🎨</h2>
          <p class="banner-sub">Cover more ground than the other team in 90 seconds.</p>
          <UiButton
            v-if="room.isHost"
            size="lg"
            @click="room.sendAction({ kind: 'territory/start' })"
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
            <template v-if="view.winner === 'draw'">Dead heat — it's a draw!</template>
            <template v-else>Team {{ view.winner }} takes it! 🏆</template>
          </h2>
          <p class="banner-sub">{{ redPercent }}% red vs {{ bluePercent }}% blue</p>
          <UiButton v-if="room.isHost" @click="room.sendAction({ kind: 'territory/restart' })">
            Another round
          </UiButton>
        </UiCard>
      </div>
    </div>

    <p class="help">
      <template v-if="canPlay">
        Move with <kbd>WASD</kbd>/<kbd>arrows</kbd> — every step paints your team's color.
        Repaint theirs!
      </template>
      <template v-else-if="view.phase === 'lobby' || view.phase === 'countdown'">
        Controls: <kbd>WASD</kbd>/<kbd>arrows</kbd> to move. Walk everywhere — your trail is your
        territory.
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
}
.team {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.clock {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.score-bar {
  display: flex;
  height: 10px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-surface-sunken);
}
.fill-red {
  background: var(--color-team-red);
  transition: width var(--motion-slow) var(--motion-ease);
}
.fill-blue {
  background: var(--color-team-blue);
  transition: width var(--motion-slow) var(--motion-ease);
  margin-left: auto;
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
