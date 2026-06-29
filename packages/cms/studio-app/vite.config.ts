import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

// Studio admin SPA. Built independently of the Nuxt module so the studio's
// dependency graph (TipTap, reka-ui, etc.) doesn't bleed into the consumer
// site's bundle. The Nuxt module mounts this app via a single host page.
//
// Production uses relative chunk/preload URLs so the Nuxt module can serve the
// same bundle from a versioned asset base. In dev the studio runs on its own
// Vite server and the host page loads from `${GINKO_STUDIO_DEV_SERVER}`.
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: command === 'build' ? './' : '/',
  plugins: [
    vue(),
    tailwindcss(),
    // Bare-named components (e.g. <SidebarProvider>, <StudioSidebar>,
    // <CmsCommandPalette>) used to resolve through Nuxt's global
    // addComponentsDir. In the SPA we use unplugin-vue-components to scan
    // src/components/** and emit imports automatically. UI primitives,
    // studio components, and the editor tree are all here.
    Components({
      dirs: [
        fileURLToPath(new URL('./src/components', import.meta.url)),
        fileURLToPath(new URL('./src/editor/ui', import.meta.url)),
      ],
      extensions: ['vue'],
      deep: true,
      dts: fileURLToPath(new URL('./components.d.ts', import.meta.url)),
    }),
  ],
  resolve: {
    alias: {
      // Re-use the public-surface schemas/locales directly from the cms
      // package source. The SPA bundle is independent of dist/, so these
      // paths are resolved against src/ at build time.
      '@public': fileURLToPath(new URL('../src/public', import.meta.url)),
      '@contract': fileURLToPath(new URL('../../contract/src', import.meta.url)),
    },
  },
  server: {
    port: 5252,
    strictPort: true,
    fs: {
      // Allow cross-root reads so the SPA can pull from src/public and the
      // sibling contract package.
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/studio-app', import.meta.url)),
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Stable names for the two entry assets so the Nuxt host page can
        // hardcode `<script src=".../main.js">` and `<link href=".../main.css">`.
        // Lazy-loaded chunks keep content hashes — they're referenced by the
        // entry, not by the host page.
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? info.name ?? ''
          if (name.endsWith('.css')) return 'assets/main.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
}))
