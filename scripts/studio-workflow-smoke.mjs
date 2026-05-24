import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const tempDir = await mkdtemp(join(tmpdir(), 'ginko-studio-workflow-smoke-'))
const vueEntry = resolve(repoRoot, 'node_modules/vue/dist/vue.esm-bundler.js')

function fsImport(path) {
  return `/@fs/${resolve(repoRoot, path)}`
}

const main = `
import { createApp, defineComponent, h, reactive, ref } from 'vue'
import StudioEntryPublicWorkflowPanel from '${fsImport('packages/cms/studio-app/src/components/studio/editor/StudioEntryPublicWorkflowPanel.vue')}'
import StudioEntryTranslationReadinessPanel from '${fsImport('packages/cms/studio-app/src/components/studio/editor/StudioEntryTranslationReadinessPanel.vue')}'
import StudioPublishDialog from '${fsImport('packages/cms/studio-app/src/components/studio/editor/StudioPublishDialog.vue')}'
import { provideStudioEntryEditorContext } from '${fsImport('packages/cms/studio-app/src/composables/internal/studioEntryEditorContext.ts')}'

const Badge = defineComponent({
  props: { variant: String },
  template: '<span class="badge"><slot /></span>',
})
const Button = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, size: String, variant: String },
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" v-bind="$attrs" @click="$emit(\\'click\\')"><slot /></button>',
})
const Dialog = defineComponent({
  props: { open: Boolean },
  template: '<div v-if="open" class="dialog"><slot /></div>',
})
const Passthrough = { template: '<div><slot /></div>' }
const Textarea = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue'],
  template: '<textarea :value="modelValue" :placeholder="placeholder" />',
})

const baseDiagnostic = {
  code: 'route_collision',
  href: '/docs',
  message: 'Route collision found.',
  path: '/docs',
  severity: 'error',
}

const publicVisibility = {
  error: null,
  errorMessage: '',
  globalDiagnostics: [],
  isRouteBacked: true,
  localeRows: [
    {
      current: true,
      diagnostics: [],
      draftPath: '/hello',
      draftState: 'Draft exists',
      hiddenDiagnosticCount: 0,
      href: '/hello',
      label: 'Public',
      locale: 'en',
      missingRequiredFields: [],
      nav: 'included',
      path: '/hello',
      publishedPath: '/hello',
      publishedState: 'Published',
      reasons: [],
      search: 'included',
      secondaryLabels: [],
      sitemap: 'included',
      visibleDiagnostics: [],
    },
    {
      current: false,
      diagnostics: [baseDiagnostic],
      draftPath: '/hallo',
      draftState: 'Draft exists',
      hiddenDiagnosticCount: 1,
      href: '/de/hallo',
      label: 'Blocked',
      locale: 'de',
      missingRequiredFields: ['body'],
      nav: 'excluded',
      path: '/hallo',
      publishedPath: null,
      publishedState: 'Draft only',
      reasons: ['Missing required fields'],
      search: 'excluded',
      secondaryLabels: ['Parent not public'],
      sitemap: 'excluded',
      visibleDiagnostics: [baseDiagnostic],
    },
  ],
  pending: false,
  publishedLocales: ['en'],
  status: 'Visibility by locale',
}

const routeStates = {
  idle: { diagnostics: [], hiddenDiagnosticCount: 0, message: '', state: 'idle' },
  pending: { diagnostics: [], hiddenDiagnosticCount: 0, message: 'Validating public routes...', state: 'pending' },
  error: { diagnostics: [], hiddenDiagnosticCount: 0, message: 'Route validation failed.', state: 'error' },
  empty: { diagnostics: [], hiddenDiagnosticCount: 0, message: 'Site route validation: no diagnostics.', state: 'empty' },
  missing: { diagnostics: [], hiddenDiagnosticCount: 0, message: 'Route validation returned no usable result.', state: 'missing' },
  found: { diagnostics: [baseDiagnostic], hiddenDiagnosticCount: 2, message: 'Site route validation: 3 diagnostics.', state: 'found' },
}

function impactState(state) {
  const common = {
    error: null,
    locales: [],
    message: state,
    pending: state === 'pending',
    state,
    status: state,
  }
  if (state === 'ready' || state === 'blocked' || state === 'no_changes') {
    common.message = state === 'ready' ? 'Ready to publish' : state === 'blocked' ? 'Publish is blocked' : 'No public changes'
    common.locales = [{
      blockingDiagnostics: state === 'blocked' ? [baseDiagnostic] : [],
      changes: [{ kind: 'route', label: 'Route', before: '/old', after: '/hello' }],
      currentHref: '/old',
      currentPath: '/old',
      hiddenBlockerCount: 0,
      label: common.message,
      locale: 'en',
      nav: { before: false, after: true },
      nextHref: '/hello',
      nextPath: '/hello',
      search: { before: false, after: true },
      sitemap: { before: false, after: true },
      status: state,
      visibleBlockers: state === 'blocked' ? [baseDiagnostic] : [],
      visibleWarnings: [],
      warnings: [],
    }]
  }
  if (state === 'stale') common.message = 'Publish impact preview is stale. Preview again before publishing.'
  if (state === 'error') common.message = 'Publish impact preview failed.'
  return common
}

function reviewState(state) {
  const hasConfirmation = state === 'ready' || state === 'no_changes'
  return {
    blocked: state === 'blocked',
    confirmationExpiresAt: hasConfirmation ? Date.now() + 60_000 : null,
    confirmationToken: hasConfirmation ? 'browser-smoke-confirmation-token' : null,
    failed: state === 'failed' || state === 'error',
    label: state === 'no_changes' ? 'No changes' : state.charAt(0).toUpperCase() + state.slice(1),
    locales: ['en'],
    message: state === 'ready' ? 'Ready to publish' : state + ' message',
    previewHash: hasConfirmation ? 'preview-hash-browser-smoke' : null,
    stale: state === 'stale',
    state,
  }
}

const App = defineComponent({
  setup() {
    const routeRequested = ref(false)
    const routeState = ref(routeStates.idle)
    const impactRequested = ref(true)
    const previewScope = ref('publish')
    const impact = ref(impactState('ready'))
    const review = ref(reviewState('ready'))
    const dialogState = ref('ready')

    const editor = reactive({
      loader: {
        currentLocale: 'en',
        entry: { publishedAt: 1, status: 'published' },
        entryId: 'entry-1',
        locales: [{ code: 'en' }],
        t: (key) => key,
      },
      publishing: {
        confirmPublish: () => {},
        publishMessage: '',
        publishMode: 'single',
        publishReadiness: reviewState(dialogState.value),
        showPublishDialog: true,
      },
    })

    function setRoute(name) {
      routeRequested.value = name !== 'idle'
      routeState.value = routeStates[name]
    }
    function setImpact(name, scope = 'publish') {
      impactRequested.value = true
      previewScope.value = scope
      impact.value = impactState(name)
      review.value = reviewState(name === 'error' ? 'failed' : name)
    }
    function setDialog(name) {
      dialogState.value = name
      editor.publishing.publishReadiness = reviewState(name)
    }

    provideStudioEntryEditorContext(editor)

    return {
      publicVisibility,
      routeRequested,
      routeState,
      impactRequested,
      previewScope,
      impact,
      review,
      setRoute,
      setImpact,
      setDialog,
    }
  },
  components: { StudioEntryPublicWorkflowPanel, StudioEntryTranslationReadinessPanel, StudioPublishDialog },
  template: \`
    <main>
      <div id="route-buttons">
        <button v-for="name in ['idle','pending','error','empty','missing','found']" :key="name" @click="setRoute(name)">route {{ name }}</button>
      </div>
      <div id="impact-buttons">
        <button v-for="name in ['ready','blocked','stale','error','no_changes','pending']" :key="name" @click="setImpact(name)">impact {{ name }}</button>
        <button @click="setImpact('ready', 'workflow')">impact workflow</button>
      </div>
      <div id="dialog-buttons">
        <button v-for="name in ['ready','no_changes','blocked','stale','pending','failed']" :key="name" @click="setDialog(name)">dialog {{ name }}</button>
      </div>
      <StudioEntryPublicWorkflowPanel
        :public-visibility="publicVisibility"
        :route-validation-requested="routeRequested"
        :route-validation-state="routeState"
        :publish-impact-requested="impactRequested"
        :publish-impact="impact"
        :preview-scope="previewScope"
        :publish-review="review"
        selected-publish-impact-locale="de"
      />
      <StudioEntryTranslationReadinessPanel
        current-locale="en"
        :saving="false"
        :items="[{
          draftPath: '/hallo',
          exists: true,
          impactLabel: 'Ready',
          label: 'Deutsch',
          locale: 'de',
          missingFields: [],
          missingRoute: false,
          parentBlocked: false,
          published: false,
          status: 'ready',
          suggestedAction: 'Read-only readiness is ready for review.'
        }]"
      />
      <StudioPublishDialog />
    </main>
  \`,
})

createApp(App)
  .component('Badge', Badge)
  .component('Button', Button)
  .component('Dialog', Dialog)
  .component('DialogContent', Passthrough)
  .component('DialogDescription', Passthrough)
  .component('DialogFooter', Passthrough)
  .component('DialogHeader', Passthrough)
  .component('DialogTitle', Passthrough)
  .component('Globe', Passthrough)
  .component('Label', { template: '<label><slot /></label>' })
  .component('Loader2', Passthrough)
  .component('Textarea', Textarea)
  .mount('#app')
`

let browser
let server

try {
  await mkdir(join(tempDir, 'src'))
  await writeFile(
    join(tempDir, 'index.html'),
    '<div id="app"></div><script type="module" src="/src/main.js"></script>',
  )
  await writeFile(join(tempDir, 'src/main.js'), main)

  server = await createServer({
    root: tempDir,
    logLevel: 'silent',
    plugins: [vue()],
    server: {
      fs: { allow: [repoRoot, tempDir] },
      host: '127.0.0.1',
      port: 0,
    },
    resolve: {
      alias: {
        vue: vueEntry,
        '@public': resolve(repoRoot, 'packages/cms/src/public'),
        '@contract': resolve(repoRoot, 'packages/contract/src'),
      },
    },
  })
  await server.listen()
  const address = server.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port')
  const url = `http://127.0.0.1:${address.port}/`

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const browserMessages = []
  page.on('console', (message) => browserMessages.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', (error) => browserMessages.push(`pageerror: ${error.message}`))
  await page.goto(url)
  try {
    await page.getByText('Publishing diagnostics').waitFor()
  } catch (error) {
    console.error(browserMessages.join('\n'))
    console.error(await page.content())
    throw error
  }
  await page.getByText('Visibility by locale').waitFor()
  await page.getByText('/de/hallo').first().waitFor()
  await page.getByText('Translation readiness', { exact: true }).waitFor()
  await page.getByText('Read-only review for non-current locales').waitFor()

  for (const [button, expected] of [
    ['route pending', 'Validating public routes...'],
    ['route error', 'Route validation failed.'],
    ['route empty', 'Site route validation: no diagnostics.'],
    ['route missing', 'Route validation returned no usable result.'],
    ['route found', 'Route collision found.'],
  ]) {
    await page.getByRole('button', { name: button }).click()
    await page.getByText(expected).first().waitFor()
  }

  for (const [button, expected] of [
    ['impact ready', 'Ready to publish'],
    ['impact blocked', 'Publish is blocked'],
    ['impact stale', 'Publish impact preview is stale. Preview again before publishing.'],
    ['impact error', 'Publish impact preview failed.'],
    ['impact no_changes', 'No public changes'],
  ]) {
    await page.getByRole('button', { name: button }).click()
    await page.getByText(expected).first().waitFor()
  }

  await page.getByRole('button', { name: 'impact workflow' }).click()
  await page.getByText('Read-only readiness preview').waitFor()
  await page.getByText('It does not confirm the header Publish action.').waitFor()

  for (const name of ['blocked', 'stale', 'pending', 'failed', 'no_changes']) {
    await page.getByRole('button', { name: `dialog ${name}` }).click()
    const publish = page.getByRole('button', { name: /ginkoCms.common.publish/ }).last()
    await publish.waitFor()
    if (!(await publish.isDisabled())) {
      throw new Error(`expected publish dialog confirm to be disabled for ${name}`)
    }
  }

  for (const name of ['ready']) {
    await page.getByRole('button', { name: `dialog ${name}` }).click()
    const publish = page.getByRole('button', { name: /ginkoCms.common.publish/ }).last()
    await publish.waitFor()
    if (await publish.isDisabled()) {
      throw new Error(`expected publish dialog confirm to be enabled for ${name}`)
    }
  }

  console.log('studio workflow browser smoke ok')
} finally {
  await browser?.close()
  await server?.close()
  await rm(tempDir, { recursive: true, force: true })
}
