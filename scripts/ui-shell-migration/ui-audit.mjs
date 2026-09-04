#!/usr/bin/env node
// UI shell migration audit harness.
//
// Subcommands:
//   capture <outDir> [--base URL] [--studio PATH] [--start]
//   compare <baselineDir> <candidateDir> <diffDir> [--threshold N]
//
// Run with env loaded so it can sign in:
//   node --env-file-if-exists=.env.local scripts/ui-shell-migration/ui-audit.mjs capture .ui-audit/baseline
//
// Credentials come from CMS_SMOKE_EMAIL / CMS_SMOKE_PASSWORD and are never printed.

const HELP = `ui-audit — Studio UI screenshot & pixel-diff harness (Phase 0 tooling)

USAGE
  node --env-file-if-exists=.env.local scripts/ui-shell-migration/ui-audit.mjs <command> [args]

COMMANDS
  capture <outDir> [options]
      Sign in to the Studio, discover a content collection + entry at runtime,
      and screenshot every Studio route across 3 viewports x 2 color modes.
      Writes <outDir>/<route>--<viewport>--<mode>.png plus <outDir>/manifest.json.

      Options:
        --base <url>      Playground base URL.        Default: http://localhost:3000
        --studio <path>   Studio mount path.          Default: /studio
        --start           Start the playground dev server if it is not already
                          running (off by default; assumes the server is up).

      Env overrides:
        CMS_SMOKE_EMAIL / CMS_SMOKE_PASSWORD   Required. Sign-in credentials.
        CMS_AUDIT_COLLECTION                     Force the content collection slug.
        CMS_AUDIT_ENTRY_ID                       Force the entry id for the edit route.

  compare <baselineDir> <candidateDir> <diffDir> [--threshold <0..1>]
      Pixel-diff PNGs that share a filename between the two directories. Writes
      diff PNGs for changed files plus <diffDir>/report.json and a console
      summary (identical / changed / added / removed with % changed pixels).
      Requires devDependencies: pixelmatch, pngjs.

  help | --help | -h
      Show this message.

ROUTES CAPTURED (logical keys — filenames stay stable across runs)
  home, model, assets, activity, agents, reviews, settings, site-data,
  content-list (/content/:collection), content-new (/content/:collection/new),
  content-edit (/content/:collection/:id)
`

function parseFlags(args) {
  const positionals = []
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--start') {
      flags.start = true
    } else if (arg === '--base' || arg === '--studio' || arg === '--threshold') {
      flags[arg.slice(2)] = args[++i]
    } else if (arg.startsWith('--')) {
      // Support --key=value form too.
      const eq = arg.indexOf('=')
      if (eq !== -1) flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      else flags[arg.slice(2)] = true
    } else {
      positionals.push(arg)
    }
  }
  return { positionals, flags }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP)
    process.exit(command ? 0 : 1)
  }

  const { positionals, flags } = parseFlags(rest)

  if (command === 'capture') {
    const outDir = positionals[0]
    if (!outDir) {
      console.error('capture requires an <outDir> argument.\n')
      console.log(HELP)
      process.exit(1)
    }
    const { normalizeBase, normalizeStudio } = await import('./shared.mjs')
    const { runCapture } = await import('./capture.mjs')
    await runCapture({
      outDir,
      base: normalizeBase(flags.base ?? 'http://localhost:3000'),
      studio: normalizeStudio(flags.studio ?? '/studio'),
      start: Boolean(flags.start),
    })
    return
  }

  if (command === 'compare') {
    const [baselineDir, candidateDir, diffDir] = positionals
    if (!baselineDir || !candidateDir || !diffDir) {
      console.error('compare requires <baselineDir> <candidateDir> <diffDir> arguments.\n')
      console.log(HELP)
      process.exit(1)
    }
    const { runCompare } = await import('./compare.mjs')
    await runCompare({
      baselineDir,
      candidateDir,
      diffDir,
      threshold: flags.threshold !== undefined ? Number(flags.threshold) : 0.1,
    })
    return
  }

  console.error(`Unknown command: ${command}\n`)
  console.log(HELP)
  process.exit(1)
}

main().catch((error) => {
  console.error(`ui-audit failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
