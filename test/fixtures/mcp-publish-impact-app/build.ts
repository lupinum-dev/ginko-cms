import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { build, type Rollup } from 'vite'

const extAppsEntry = fileURLToPath(import.meta.resolve('@modelcontextprotocol/ext-apps'))
const extAppsBridgeEntry = fileURLToPath(
  import.meta.resolve('@modelcontextprotocol/ext-apps/app-bridge'),
)
const mcpAppEntry = fileURLToPath(import.meta.resolve('better-convex-vue/mcp-app'))

function outputs(value: Rollup.RollupOutput | Rollup.RollupOutput[]) {
  return (Array.isArray(value) ? value : [value]).flatMap((result) => result.output)
}

async function bundle(entry: string, withVue: boolean) {
  const result = await build({
    build: {
      cssCodeSplit: false,
      emptyOutDir: false,
      lib: { entry, fileName: () => 'entry.js', formats: ['iife'], name: 'GinkoMcpAppProof' },
      minify: 'esbuild',
      rollupOptions: { output: { assetFileNames: 'style[extname]', inlineDynamicImports: true } },
      sourcemap: false,
      target: 'es2022',
      write: false,
    },
    configFile: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    logLevel: 'silent',
    plugins: withVue ? [vue()] : [],
    resolve: {
      alias: {
        '@modelcontextprotocol/ext-apps/app-bridge': extAppsBridgeEntry,
        '@modelcontextprotocol/ext-apps': extAppsEntry,
        'better-convex-vue/mcp-app': mcpAppEntry,
      },
      dedupe: ['vue'],
    },
  })
  const values = outputs(result as Rollup.RollupOutput | Rollup.RollupOutput[])
  const chunk = values.find(
    (value): value is Rollup.OutputChunk => value.type === 'chunk' && value.isEntry,
  )
  if (!chunk) throw new Error(`Vite emitted no entry for ${entry}.`)
  const css = values
    .filter(
      (value): value is Rollup.OutputAsset =>
        value.type === 'asset' && value.fileName.endsWith('.css'),
    )
    .map((value) =>
      typeof value.source === 'string' ? value.source : new TextDecoder().decode(value.source),
    )
    .join('\n')
  return { code: chunk.code, css, modules: Object.keys(chunk.modules).sort() }
}

function html(code: string, css: string) {
  return [
    '<!doctype html><html lang="en"><head><meta charset="UTF-8">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'\">",
    `<style>${css}</style></head><body><div id="app"></div>`,
    `<script>${code.replaceAll('</script', '<\\/script')}</script></body></html>`,
  ].join('')
}

export async function buildGinkoPublishImpactApp() {
  const [app, host] = await Promise.all([
    bundle(fileURLToPath(new URL('./main.ts', import.meta.url)), true),
    bundle(fileURLToPath(new URL('./host.ts', import.meta.url)), false),
  ])
  return {
    appHtml: html(app.code, app.css),
    appModules: app.modules,
    hostCode: host.code,
    mcpAppEntry,
  }
}
