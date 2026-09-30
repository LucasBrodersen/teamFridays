<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NAME_MAX_LENGTH } from '@team-fridays/shared'
import UiButton from '../components/ui/UiButton.vue'
import UiCard from '../components/ui/UiCard.vue'
import UiInput from '../components/ui/UiInput.vue'
import { useRoomStore } from '../stores/room'
import { useToastsStore } from '../stores/toasts'

const router = useRouter()
const room = useRoomStore()
const toasts = useToastsStore()

const hostName = ref('')
const joinName = ref('')
const joinCode = ref('')
const busy = ref(false)

async function create(): Promise<void> {
  if (!hostName.value.trim() || busy.value) return
  busy.value = true
  try {
    const code = await room.createRoom(hostName.value.trim())
    await router.push(`/room/${code}`)
  } catch (err) {
    toasts.push(err instanceof Error ? err.message : 'Could not create the room', 'error')
  } finally {
    busy.value = false
  }
}

async function join(): Promise<void> {
  const code = joinCode.value.trim().toUpperCase()
  if (!code || !joinName.value.trim() || busy.value) return
  busy.value = true
  try {
    await room.join(code, joinName.value.trim())
    await router.push(`/room/${code}`)
  } catch (err) {
    toasts.push(err instanceof Error ? err.message : 'Could not join the room', 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="landing">
    <header class="hero">
      <h1 class="brand">Team Fridays</h1>
      <p class="tagline">Icebreakers and games for the Friday team meeting.</p>
    </header>

    <div class="cards">
      <UiCard class="card">
        <h2 class="card-title">Start a session</h2>
        <form class="form" @submit.prevent="create">
          <UiInput
            v-model="hostName"
            label="Your name"
            placeholder="e.g. Lucas"
            :maxlength="NAME_MAX_LENGTH"
            autofocus
          />
          <UiButton type="submit" size="lg" :disabled="!hostName.trim() || busy">
            Create room
          </UiButton>
        </form>
      </UiCard>

      <UiCard class="card">
        <h2 class="card-title">Join a session</h2>
        <form class="form" @submit.prevent="join">
          <UiInput v-model="joinCode" label="Room code" placeholder="FRI-XXXX" :maxlength="8" />
          <UiInput
            v-model="joinName"
            label="Your name"
            placeholder="e.g. Ana"
            :maxlength="NAME_MAX_LENGTH"
          />
          <UiButton
            type="submit"
            size="lg"
            variant="secondary"
            :disabled="!joinCode.trim() || !joinName.trim() || busy"
          >
            Join room
          </UiButton>
        </form>
      </UiCard>
    </div>
  </main>
</template>

<style scoped>
.landing {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}
.hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.brand {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.02em;
}
.tagline {
  color: var(--color-text-muted);
  font-size: var(--font-size-lg);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.card-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
</style>
