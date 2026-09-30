<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { HERD_PROMPTS, QUESTION_MAX_LENGTH, type HerdView } from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'

const props = defineProps<{ view: HerdView }>()
const room = useRoomStore()

const draftPrompt = ref('')
const draftAnswer = ref('')

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator)
const canWrite = computed(() => props.view.phase === 'collecting' && isActive.value)
const canAnswer = computed(() => props.view.phase === 'answering' && isActive.value)

function suggest(): void {
  draftPrompt.value = HERD_PROMPTS[Math.floor(Math.random() * HERD_PROMPTS.length)] ?? ''
}

function submitPrompt(): void {
  const prompt = draftPrompt.value.trim()
  if (prompt) room.sendAction({ kind: 'herd/submit-prompt', prompt })
}

function submitAnswer(): void {
  const text = draftAnswer.value.trim()
  if (text) room.sendAction({ kind: 'herd/answer', text })
}

watch(
  () => props.view.round?.number,
  () => {
    draftAnswer.value = ''
  },
)
</script>

<template>
  <div class="panel">
    <p class="kicker">Herd Mentality</p>

    <template v-if="view.phase === 'collecting'">
      <h2 class="title">Write a "name a…" prompt — the herd must agree!</h2>
      <UiProgressBar
        :value="view.submittedPromptIds.length"
        :max="activeCount"
        label="Prompts in"
      />
      <UiCard v-if="canWrite" class="form">
        <UiInput
          v-model="draftPrompt"
          label="Your prompt"
          placeholder="Name a breakfast food"
          :maxlength="QUESTION_MAX_LENGTH"
        />
        <div class="actions-row">
          <UiButton variant="ghost" size="sm" @click="suggest">Need inspiration?</UiButton>
          <UiButton :disabled="!draftPrompt.trim()" @click="submitPrompt">
            {{ view.yourPrompt ? 'Update prompt' : 'Submit prompt' }}
          </UiButton>
        </div>
        <p v-if="view.yourPrompt" class="submitted-note">Submitted ✓ — “{{ view.yourPrompt }}”</p>
      </UiCard>
      <p v-else-if="room.you?.spectator" class="muted">
        You joined mid-activity — you can play from the next one.
      </p>
      <div v-if="room.isHost" class="host-row">
        <UiButton
          variant="secondary"
          :disabled="view.submittedPromptIds.length === 0"
          @click="room.sendAction({ kind: 'herd/start' })"
        >
          Start ({{ view.submittedPromptIds.length }}/{{ activeCount }} prompts)
        </UiButton>
      </div>
    </template>

    <template v-else-if="view.round">
      <div class="round-meta">
        <UiBadge variant="accent">Round {{ view.round.number }} / {{ view.round.total }}</UiBadge>
        <span class="author">
          <UiAvatar :name="room.nameOf(view.round.authorId)" size="sm" />
          by {{ room.nameOf(view.round.authorId) }}
        </span>
      </div>
      <h2 class="title">{{ view.round.prompt }}</h2>
      <p class="muted">Match the majority — points only if your herd is the biggest!</p>

      <template v-if="view.phase === 'answering'">
        <UiProgressBar
          :value="view.round.submittedIds.length"
          :max="activeCount"
          label="Answers in"
        />
        <UiCard v-if="canAnswer" class="form">
          <UiInput
            v-model="draftAnswer"
            label="Your answer"
            :placeholder="view.round.yourAnswer ?? 'One or two words…'"
            :maxlength="60"
          />
          <div class="row-end">
            <UiButton :disabled="!draftAnswer.trim()" @click="submitAnswer">
              {{ view.round.yourAnswer ? 'Update answer' : 'Lock it in' }}
            </UiButton>
          </div>
        </UiCard>
        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.round.submittedIds.length === 0"
            @click="room.sendAction({ kind: 'herd/reveal' })"
          >
            Reveal ({{ view.round.submittedIds.length }}/{{ activeCount }})
          </UiButton>
        </div>
      </template>

      <template v-else-if="view.round.reveal">
        <div class="groups" aria-live="polite">
          <UiCard
            v-for="(group, i) in view.round.reveal.groups"
            :key="i"
            class="group"
            :class="{ winning: group.participantIds.some((id) => view.round!.reveal!.winnerIds.includes(id)) }"
          >
            <div class="group-head">
              <span class="group-answer">{{ group.answer }}</span>
              <UiBadge
                :variant="
                  group.participantIds.some((id) => view.round!.reveal!.winnerIds.includes(id))
                    ? 'success'
                    : 'neutral'
                "
              >
                {{ group.participantIds.length }}
              </UiBadge>
            </div>
            <p class="muted">{{ group.participantIds.map(room.nameOf).join(', ') }}</p>
          </UiCard>
        </div>
        <p v-if="view.round.reveal.winnerIds.length === 0" class="muted">
          No herd formed — everyone answered differently, no points!
        </p>
        <div v-if="room.isHost" class="host-row">
          <UiButton @click="room.sendAction({ kind: 'herd/next' })">
            {{ view.round.number < view.round.total ? 'Next prompt' : 'Show final scores' }}
          </UiButton>
        </div>
      </template>
    </template>

    <template v-else-if="view.phase === 'results'">
      <h2 class="title">Final scores 🏆</h2>
      <UiCard>
        <ol class="scores" aria-live="polite">
          <li v-for="(s, i) in view.scores" :key="s.participantId" class="score-row">
            <span class="rank">{{ i + 1 }}</span>
            <UiAvatar :name="room.nameOf(s.participantId)" size="sm" />
            <span>{{ room.nameOf(s.participantId) }}</span>
            <UiBadge :variant="s.score > 0 && i === 0 ? 'success' : 'neutral'">
              {{ s.score }} {{ s.score === 1 ? 'point' : 'points' }}
            </UiBadge>
          </li>
        </ol>
      </UiCard>
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
.title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}
.round-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.author {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.row-end {
  display: flex;
  justify-content: flex-end;
}
.host-row {
  display: flex;
}
.submitted-note {
  font-size: var(--font-size-sm);
  color: var(--color-success);
}
.muted {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}
.group.winning {
  border-color: var(--color-success);
}
.group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
.group-answer {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-lg);
}
.scores {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.score-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.score-row :last-child {
  margin-left: auto;
}
.rank {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-faint);
  width: 1.5em;
}
</style>
