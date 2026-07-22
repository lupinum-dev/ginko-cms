import { createApp } from 'vue'

import PublishImpact from './PublishImpact.vue'

const app = createApp(PublishImpact)
const teardown = () => app.unmount()
window.addEventListener('ginko:publish-impact-teardown', teardown, { once: true })
app.mount('#app')
