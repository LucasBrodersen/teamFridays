<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ANSWER_MAX_LENGTH,
  ICEBREAKER_QUESTIONS,
  QUESTION_MAX_LENGTH,
  type IcebreakerView,
} from '@team-fridays/shared'
import { useRoomStore } from '../../stores/room'
import UiAvatar from '../ui/UiAvatar.vue'
import UiBadge from '../ui/UiBadge.vue'
import UiButton from '../ui/UiButton.vue'
import UiCard from '../ui/UiCard.vue'
import UiInput from '../ui/UiInput.vue'
import UiProgressBar from '../ui/UiProgressBar.vue'
import UiTextarea from '../ui/UiTextarea.vue'

const props = defineProps<{ view: IcebreakerView }>()
const room = useRoomStore()

const draftQuestion = ref('')
const draftAnswer = ref('')

const activeCount = computed(() => room.participants.filter((p) => !p.spectator).length)
const isActive = computed(() => !room.you?.spectator)
const canWrite = computed(() => props.view.phase === 'collecting' && isActive.value)
const canAnswer = computed(() => props.view.phase === 'answering' && isActive.value)

function suggest(): void {
  draftQuestion.value =
    ICEBREAKER_QUESTIONS[Math.floor(Math.random() * ICEBREAKER_QUESTIONS.length)] ?? ''
}

function submitQuestion(): void {
  const question = draftQuestion.value.trim()
  if (!question) return
  room.sendAction({ kind: 'icebreaker/submit-question', question })
}

function submitAnswer(): void {
  const text = draftAnswer.value.trim()
  if (!text) return
  room.sendAction({ kind: 'icebreaker/submit', text })
}

// Fresh answer box for every round, for every participant.
watch(
  () => props.view.round?.number,
  () => {
    draftAnswer.value = ''
  },
)
</script>

<template>
  <div class="panel">
    <p class="kicker">Icebreaker</p>

    <!-- Phase 1: everyone writes a question -->
    <template v-if="view.phase === 'collecting'">
      <h2 class="question">Write an icebreaker question for the team</h2>
      <UiProgressBar
        :value="view.submittedQuestionIds.length"
        :max="activeCount"
        label="Questions in"
      />

      <UiCard v-if="canWrite" class="form">
        <UiInput
          v-model="draftQuestion"
          label="Your question"
          placeholder="e.g. What was your first job?"
          :maxlength="QUESTION_MAX_LENGTH"
        />
        <div class="actions-row">
          <UiButton variant="ghost" size="sm" @click="suggest">Need inspiration?</UiButton>
          <UiButton :disabled="!draftQuestion.trim()" @click="submitQuestion">
            {{ view.yourQuestion ? 'Update question' : 'Submit question' }}
          </UiButton>
        </div>
        <p v-if="view.yourQuestion" class="submitted-note">
          Submitted ✓ — “{{ view.yourQuestion }}”
        </p>
      </UiCard>
      <p v-else-if="room.you?.spectator" class="muted">
        You joined mid-activity — you can play from the next one.
      </p>

      <div v-if="room.isHost" class="host-row">
        <UiButton
          variant="secondary"
          :disabled="view.submittedQuestionIds.length === 0"
          @click="room.sendAction({ kind: 'icebreaker/start' })"
        >
          Start ({{ view.submittedQuestionIds.length }}/{{ activeCount }} questions)
        </UiButton>
      </div>
    </template>

    <!-- Phase 2 + 3: rotating rounds -->
    <template v-else-if="view.round">
      <div class="round-meta">
        <UiBadge variant="accent">Question {{ view.round.number }} / {{ view.round.total }}</UiBadge>
        <span class="author">
          <UiAvatar :name="room.nameOf(view.round.authorId)" size="sm" />
          asked by {{ room.nameOf(view.round.authorId) }}
        </span>
      </div>
      <h2 class="question">{{ view.round.question }}</h2>

      <template v-if="view.phase === 'answering'">
        <UiProgressBar
          :value="view.round.submittedIds.length"
          :max="activeCount"
          label="Answers in"
        />

        <UiCard v-if="canAnswer" class="form">
          <UiTextarea
            v-model="draftAnswer"
            :label="
              view.round.yourAnswer ? 'Your answer (submitted — you can update it)' : 'Your answer'
            "
            :placeholder="view.round.yourAnswer ?? 'Type your answer…'"
            :maxlength="ANSWER_MAX_LENGTH"
          />
          <div class="row-end">
            <UiButton :disabled="!draftAnswer.trim()" @click="submitAnswer">
              {{ view.round.yourAnswer ? 'Update answer' : 'Submit answer' }}
            </UiButton>
          </div>
        </UiCard>

        <div v-if="room.isHost" class="host-row">
          <UiButton
            variant="secondary"
            :disabled="view.round.submittedIds.length === 0"
            @click="room.sendAction({ kind: 'icebreaker/reveal' })"
          >
            Reveal ({{ view.round.submittedIds.length }}/{{ activeCount }})
          </UiButton>
        </div>
      </template>

      <template v-else>
        <div class="answers" aria-live="polite">
          <UiCard v-for="a in view.round.answers" :key="a.participantId" class="answer">
            <div class="author-line">
              <UiAvatar :name="room.nameOf(a.participantId)" size="sm" />
              <span class="author-name">{{ room.nameOf(a.participantId) }}</span>
            </div>
            <p class="text">{{ a.text }}</p>
          </UiCard>
        </div>
        <div v-if="room.isHost" class="host-row">
          <UiButton @click="room.sendAction({ kind: 'icebreaker/next' })">
            {{ view.round.number < view.round.total ? 'Next question' : 'Finish' }}
          </UiButton>
        </div>
      </template>
    </template>

    <!-- Phase 4: wrap -->
    <template v-else-if="view.phase === 'done'">
      <UiCard class="done">
        <h2 class="question">That's a wrap 🎉</h2>
        <p class="muted">All questions answered. The host can end the activity.</p>
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
.question {
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
  gap: var(--space-2);
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
.answers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-3);
}
.answer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.author-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.author-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}
.text {
  font-size: var(--font-size-md);
}
.done {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
