<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAME_MAX_LENGTH } from '@team-fridays/shared'
import { activityPanels } from '../components/activities/registry'
import ActivityPicker from '../components/room/ActivityPicker.vue'
import ParticipantList from '../components/room/ParticipantList.vue'
import ReactionsBar from '../components/room/ReactionsBar.vue'
import ReactionsOverlay from '../components/room/ReactionsOverlay.vue'
import WheelModal from '../components/room/WheelModal.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiCard from '../components/ui/UiCard.vue'
import UiInput from '../components/ui/UiInput.vue'
import { useRoomStore } from '../stores/room'
import { useToastsStore } from '../stores/toasts'

const route = useRoute()
const router = useRouter()
const room = useRoomStore()
const toasts = useToastsStore()

const code = computed(() => String(route.params.code ?? '').toUpperCase())
const needsName = ref(false)
const joinName = ref('')
const busy = ref(false)
const presentation = ref(false)

const inRoom = computed(() => room.snapshot?.code === code.value)

onMounted(async () => {
  if (inRoom.value) return
  const restored = await room.tryRejoin(code.value)
  if (!restored) needsName.value = true
})

watch(
  () => room.roomClosed,
  (closed) => {
    if (closed) {
      toasts.push('The room was closed')
      router.push('/')
    }
  },
)

async function join(): Promise<void> {
  if (!joinName.value.trim() || busy.value) return
  busy.value = true
  try {
    await room.join(code.value, joinName.value.trim())
    needsName.value = false
  } catch (err) {
    toasts.push(err instanceof Error ? err.message : 'Could not join', 'error')
  } finally {
    busy.value = false
  }
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toasts.push('Link copied', 'success')
  } catch {
    toasts.push(`Room code: ${code.value}`)
  }
}

async function leave(): Promise<void> {
  await room.leave()
  await router.push('/')
}
</script>

<template>
  <div class="room" :class="{ presentation }">
    <header class="topbar">
      <div class="left">
        <button class="code" :title="'Copy invite link'" @click="copyLink">
          {{ code }} <span class="copy-hint">copy link</span>
        </button>
        <span
          v-if="inRoom"
          class="status"
          :class="{ online: room.connected }"
          :title="room.connected ? 'Connected' : 'Reconnecting…'"
        />
        <span v-if="inRoom && !room.connected" class="reconnecting" role="status">
          Reconnecting…
        </span>
      </div>
      <div class="right">
        <template v-if="inRoom && room.isHost">
          <UiButton variant="ghost" size="sm" @click="presentation = !presentation">
            {{ presentation ? 'Exit presentation' : 'Presentation mode' }}
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="room.spinWheel()">Wheel of names</UiButton>
          <UiButton
            v-if="room.snapshot?.activity"
            variant="secondary"
            size="sm"
            @click="room.endActivity()"
          >
            End activity
          </UiButton>
          <UiButton variant="danger" size="sm" @click="room.closeRoom()">Close room</UiButton>
        </template>
        <UiButton v-if="inRoom && !room.isHost" variant="ghost" size="sm" @click="leave">
          Leave
        </UiButton>
      </div>
    </header>

    <main v-if="!inRoom" class="gate">
      <UiCard v-if="needsName" class="gate-card">
        <h2 class="gate-title">Join {{ code }}</h2>
        <form class="gate-form" @submit.prevent="join">
          <UiInput
            v-model="joinName"
            label="Your name"
            placeholder="e.g. Ana"
            :maxlength="NAME_MAX_LENGTH"
            autofocus
          />
          <UiButton type="submit" size="lg" :disabled="!joinName.trim() || busy">Join</UiButton>
        </form>
      </UiCard>
      <p v-else class="gate-loading">Connecting…</p>
    </main>

    <div v-else class="layout">
      <main class="stage">
        <template v-if="room.snapshot?.activity">
          <component
            :is="activityPanels[room.snapshot.activity.type]"
            :view="room.snapshot.activity"
          />
        </template>
        <template v-else>
          <ActivityPicker v-if="room.isHost" />
          <div v-else class="waiting">
            <h2 class="waiting-title">Waiting for the host to start an activity</h2>
            <p class="waiting-sub">Say hi with a reaction in the meantime 👋</p>
          </div>
        </template>
      </main>
      <aside class="sidebar">
        <UiCard class="sidebar-card">
          <ParticipantList />
        </UiCard>
        <UiCard class="sidebar-card">
          <ReactionsBar />
        </UiCard>
      </aside>
    </div>

    <ReactionsOverlay />
    <WheelModal />
  </div>
</template>

<style scoped>
.room {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-wrap: wrap;
}
.left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.code {
  font-family: var(--font-family-mono);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-sunken);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}
.copy-hint {
  font-family: var(--font-family);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
  color: var(--color-text-faint);
}
.status {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--color-danger);
}
.status.online {
  background: var(--color-success);
}
.reconnecting {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.gate {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}
.gate-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.gate-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
}
.gate-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.gate-loading {
  color: var(--color-text-muted);
}
.layout {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: var(--space-5);
  padding: var(--space-5);
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}
.stage {
  min-width: 0;
}
.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.waiting {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-7) 0;
  text-align: center;
}
.waiting-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
}
.waiting-sub {
  color: var(--color-text-muted);
}

/* Presentation mode: results-focused, large type for the shared screen. */
.presentation .stage {
  font-size: var(--font-size-lg);
}
.presentation .stage :deep(h2) {
  font-size: var(--font-size-3xl);
}
.presentation .sidebar {
  display: none;
}
.presentation .layout {
  grid-template-columns: 1fr;
  max-width: 1400px;
}

@media (max-width: 800px) {
  .layout {
    grid-template-columns: 1fr;
    padding: var(--space-4);
  }
  .sidebar {
    order: 2;
  }
}
</style>
