<script setup lang="ts">
import { useMcpApp } from 'better-convex-vue/mcp-app'
import { computed, ref, toRaw, watch, watchEffect } from 'vue'

type PublishInput = {
  agentRunId: string
  entryId: string
  locales: string[]
  expectedVersion: number
  message?: string
}

type ImpactIssue = { code: string; message: string }
type ImpactEffect = {
  kind: string
  summary: string
  count?: number | null
  minimumCount?: number
  countLabel?: string
}

const { app, hostCapabilities, hostContext, phase, toolInput, toolResult } = useMcpApp({
  autoResize: false,
  capabilities: {},
  implementation: { name: 'ginko-publish-impact', version: '0.0.0' },
})
const input = ref<PublishInput>()
const allowed = ref<boolean>()
const summary = ref('Waiting for publish impact')
const blockers = ref<ImpactIssue[]>([])
const warnings = ref<ImpactIssue[]>([])
const effects = ref<ImpactEffect[]>([])
const publicChanged = ref<boolean>()
const status = ref<'connecting' | 'ready' | 'refreshing' | 'denied' | 'error'>('connecting')

const canRefresh = computed(() => phase.value === 'ready' && input.value !== undefined)
const canOpenStudio = computed(() => hostCapabilities.value?.openLinks !== undefined)

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function parseInput(value: unknown): PublishInput | undefined {
  const candidate = record(value)
  if (!candidate) return undefined
  if (
    typeof candidate.agentRunId !== 'string' ||
    typeof candidate.entryId !== 'string' ||
    !Array.isArray(candidate.locales) ||
    !candidate.locales.every((locale) => typeof locale === 'string') ||
    typeof candidate.expectedVersion !== 'number'
  ) {
    return undefined
  }
  return {
    agentRunId: candidate.agentRunId,
    entryId: candidate.entryId,
    locales: candidate.locales,
    expectedVersion: candidate.expectedVersion,
    ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
  }
}

function parseIssues(value: unknown): ImpactIssue[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: ImpactIssue[] = []
  for (const candidate of value) {
    const issue = record(candidate)
    if (!issue || typeof issue.code !== 'string' || typeof issue.message !== 'string') {
      return undefined
    }
    result.push({ code: issue.code, message: issue.message })
  }
  return result
}

function parseEffects(value: unknown): ImpactEffect[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: ImpactEffect[] = []
  for (const candidate of value) {
    const effect = record(candidate)
    if (!effect || typeof effect.kind !== 'string' || typeof effect.summary !== 'string') {
      return undefined
    }
    if (effect.count !== undefined && effect.count !== null && typeof effect.count !== 'number') {
      return undefined
    }
    if (effect.minimumCount !== undefined && typeof effect.minimumCount !== 'number') {
      return undefined
    }
    if (effect.countLabel !== undefined && typeof effect.countLabel !== 'string') {
      return undefined
    }
    result.push({
      kind: effect.kind,
      summary: effect.summary,
      ...(effect.count === undefined ? {} : { count: effect.count as number | null }),
      ...(typeof effect.minimumCount === 'number' ? { minimumCount: effect.minimumCount } : {}),
      ...(typeof effect.countLabel === 'string' ? { countLabel: effect.countLabel } : {}),
    })
  }
  return result
}

function receiveResult(value: unknown): void {
  const result = record(value)
  const structured = record(result?.structuredContent)
  const preview = record(structured?.preview)
  const nextBlockers = parseIssues(preview?.blockers)
  const nextWarnings = parseIssues(preview?.warnings)
  const nextEffects = parseEffects(preview?.effects)
  if (
    result?.isError === true ||
    !structured ||
    !preview ||
    typeof preview.allowed !== 'boolean' ||
    typeof preview.summary !== 'string' ||
    typeof structured.publicChanged !== 'boolean' ||
    !nextBlockers ||
    !nextWarnings ||
    !nextEffects
  ) {
    status.value = result?.isError === true ? 'denied' : 'error'
    return
  }
  allowed.value = preview.allowed
  summary.value = preview.summary
  blockers.value = nextBlockers
  warnings.value = nextWarnings
  effects.value = nextEffects
  publicChanged.value = structured.publicChanged
  status.value = 'ready'
}

async function refresh(): Promise<void> {
  if (!canRefresh.value || !input.value) return
  status.value = 'refreshing'
  try {
    receiveResult(
      await app.callServerTool({
        arguments: structuredClone(toRaw(input.value)),
        name: 'preview-publish',
      }),
    )
  } catch {
    status.value = 'denied'
  }
}

async function openStudio(): Promise<void> {
  if (!canOpenStudio.value) return
  try {
    const result = await app.openLink({ url: 'https://ginko.example.test/studio/reviews' })
    status.value = result.isError ? 'denied' : 'error'
  } catch {
    status.value = 'denied'
  }
}

watch(toolInput, (value) => {
  const parsed = parseInput(value?.arguments)
  if (parsed) input.value = parsed
})
watch(toolResult, (value) => {
  if (value) receiveResult(value)
})
watch(phase, (value) => {
  if (value === 'ready') status.value = 'ready'
  if (value === 'error') status.value = 'error'
  if (value === 'closed') {
    window.setTimeout(() => window.dispatchEvent(new Event('ginko:publish-impact-teardown')), 0)
  }
})
watchEffect(() => {
  document.documentElement.dataset.theme = hostContext.value?.theme ?? 'light'
})
</script>

<template>
  <main data-testid="publish-impact">
    <header>
      <p>Ginko CMS publish impact</p>
      <h1 data-testid="summary">{{ summary }}</h1>
      <p data-testid="status">{{ status }}</p>
      <p data-testid="allowed">Allowed: {{ String(allowed ?? false) }}</p>
      <p data-testid="entry">{{ input?.entryId ?? 'No entry' }}</p>
    </header>

    <section aria-label="Blockers">
      <h2>Blockers</h2>
      <ul data-testid="blockers">
        <li v-for="blocker in blockers" :key="blocker.code">
          <strong>{{ blocker.code }}</strong> {{ blocker.message }}
        </li>
      </ul>
    </section>

    <section aria-label="Warnings">
      <h2>Warnings</h2>
      <ul data-testid="warnings">
        <li v-for="warning in warnings" :key="warning.code">
          <strong>{{ warning.code }}</strong> {{ warning.message }}
        </li>
      </ul>
    </section>

    <section aria-label="Effects">
      <h2>Effects</h2>
      <ul data-testid="effects">
        <li v-for="effect in effects" :key="`${effect.kind}:${effect.summary}`">
          <strong>{{ effect.kind }}</strong> {{ effect.summary }}
          <span v-if="effect.countLabel"> ({{ effect.countLabel }})</span>
          <span v-else-if="effect.count !== undefined && effect.count !== null">
            ({{ effect.count }})
          </span>
          <span v-else-if="effect.minimumCount !== undefined">
            (at least {{ effect.minimumCount }})
          </span>
        </li>
      </ul>
    </section>

    <p data-testid="public-changed">Public changed: {{ String(publicChanged ?? false) }}</p>
    <nav aria-label="Publish impact actions">
      <button data-testid="refresh" type="button" :disabled="!canRefresh" @click="refresh">
        Refresh impact
      </button>
      <button
        data-testid="open-studio"
        type="button"
        :disabled="!canOpenStudio"
        @click="openStudio"
      >
        Open authenticated Studio review
      </button>
    </nav>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}
:global(body) {
  margin: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
main {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}
h1,
h2,
p {
  margin: 0;
}
section {
  border-block-start: 1px solid currentColor;
  padding-block-start: 0.75rem;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
button {
  padding: 0.5rem 0.75rem;
}
</style>
