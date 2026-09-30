<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UndercoverView } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'

const props = defineProps<{ view: UndercoverView }>()
const room = useRoomStore()

const draftClue = ref('')

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator && props.view.yourWord !== null)
const suspects = computed(() =>
  room.participants.filter((p) => !p.spectator && p.id !== room.you?.participantId),
)

function submitClue(): void {
  const text = draftClue.value.trim()
  if (text) room.sendAction({ kind: 'undercover/clue', text })
}

watch(
  () => props.view.phase,
  (phase) => {
    if (phase === 'clues') draftClue.value = ''
  },
)
</script>

<template>
  <div class="panel">
    <p class="kicker">Undercover</p>

    <UiCard v-if="view.yourWord" class="word-card">
      <span class="word-label">Your secret word</span>
      <span class="word">{{ view.yourWord }}</span>
      <p class="muted">
        {{ view.imposterCount }} of you got a <em>different</em> word — and nobody knows which
        side they're on. Give a clue about your word: specific enough to look loyal, vague enough
        to survive.
      </p>
    </UiCard>
    <p v-else class="muted">You're spectating this round.</p>

    <template v-if="view.phase === 'clues'">
      <UiProgressBar :value="view.cluesSubmittedIds.length" :max="activeCount" label="Clues in" />
      <UiCard v-if="isActive" class="form">
        <UiInput
          v-model="draftClue"
          label="Your one-word clue"
          placeholder="One word…"
          :maxlength="30"
        />
        <div class="row-end">
          <UiButton :disabled="!draftClue.trim()" @click="submitClue">
            {{ view.cluesSubmittedIds.includes(room.you?.participantId ?? '') ? 'Update clue' : 'Submit clue' }}
          </UiButton>
        </div>
      </UiCard>
      <div v-if="room.isHost" class="host-row">
        <UiButton
          variant="secondary"
          :disabled="view.cluesSubmittedIds.length === 0"
          @click="room.sendAction({ kind: 'undercover/to-voting' })"
        >
          Show clues &amp; open the vote ({{ view.cluesSubmittedIds.length }}/{{ activeCount }})
        </UiButton>
      </div>
    </template>

    <template v-else>
      <UiCard class="stack">
        <span class="word-label">The clues</span>
        <ul class="clues">
          <li v-for="c in view.clues" :key="c.participantId" class="clue">
            <UiAvatar :name="room.nameOf(c.participantId)" size="sm" />
            <span class="clue-name">{{ room.nameOf(c.participantId) }}:</span>
            <span class="clue-text">“{{ c.text }}”</span>
          </li>
        </ul>
      </UiCard>

      <template v-if="view.phase === 'voting'">
        <p class="muted">Discuss out loud, then vote: who has the other word?</p>
        <div class="suspects">
          <button
            v-for="p in suspects"
            :key="p.id"
            class="suspect"
            :class="{ chosen: view.yourVote === p.id }"
            :disabled="!isActive"
            @click="room.sendAction({ kind: 'undercover/vote', suspectId: p.id })"
          >
            <UiAvatar :name="p.name" size="sm" />
            <span>{{ p.name }}</span>
          </button>
        </div>
        <UiProgressBar :value="view.votedIds.length" :max="activeCount" label="Votes in" />
        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.votedIds.length === 0"
            @click="room.sendAction({ kind: 'undercover/reveal' })"
          >
            Reveal ({{ view.votedIds.length }}/{{ activeCount }})
          </UiButton>
        </div>
      </template>

      <template v-else-if="view.reveal">
        <UiCard class="stack" aria-live="polite">
          <h2 class="verdict">
            {{ view.reveal.winner === 'citizens' ? 'The team wins! 🕵️' : 'The undercover crew got away! 🎭' }}
          </h2>
          <p class="muted">
            Undercover: <strong>{{ view.reveal.imposterIds.map(room.nameOf).join(', ') }}</strong>
            (word: “{{ view.reveal.imposterWord }}”) — everyone else had
            “{{ view.reveal.citizenWord }}”.
          </p>
          <ul class="votes">
            <li v-for="v in view.reveal.votes" :key="v.voterId">
              {{ room.nameOf(v.voterId) }} voted {{ room.nameOf(v.suspectId) }}
            </li>
          </ul>
        </UiCard>
        <div v-if="room.isHost" class="host-row">
          <UiButton @click="room.sendAction({ kind: 'undercover/restart' })">
            Another round (new words)
          </UiButton>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.kicker {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-accent);
}
.word-card,
.stack,
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.word-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
}
.word {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
}
.verdict {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
}
.row-end {
  display: flex;
  justify-content: flex-end;
}
.host-row {
  display: flex;
}
.muted {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.clues {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.clue {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.clue-name {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.clue-text {
  font-weight: var(--font-weight-semibold);
}
.suspects {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-2);
}
.suspect {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  font-size: var(--font-size-sm);
}
.suspect:hover:not(:disabled) {
  border-color: var(--color-border-strong);
}
.suspect.chosen {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}
.votes {
  margin: 0;
  padding-left: var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
</style>
