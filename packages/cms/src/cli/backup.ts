import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { type CliIo, type ConvexClientFactory, readFlag, stableJson, usage, write } from './args.js'
import { deployKey, publicConvexUrl } from './env.js'

type BackupScope = 'full' | 'collection' | 'entry' | 'asset'

type BackupExportArgs = {
  scope: BackupScope
  out: string
  collectionId?: string
  entryId?: string
  assetId?: string
}

function parseBackupScope(value: string | undefined): BackupScope {
  if (value === 'full' || value === 'collection' || value === 'entry' || value === 'asset') {
    return value
  }
  throw new Error('backup export requires --scope full|collection|entry|asset.')
}

function parseBackupExportArgs(args: string[], cwd: string): BackupExportArgs {
  const scope = parseBackupScope(readFlag(args, '--scope'))
  const out = readFlag(args, '--out')
  if (!out) throw new Error('backup export requires --out <file>.')
  const collectionId = readFlag(args, '--collection-id')
  const entryId = readFlag(args, '--entry-id')
  const assetId = readFlag(args, '--asset-id')
  if (scope === 'collection' && !collectionId) {
    throw new Error('backup export --scope collection requires --collection-id <id>.')
  }
  if (scope === 'entry' && !entryId) {
    throw new Error('backup export --scope entry requires --entry-id <id>.')
  }
  if (scope === 'asset' && !assetId) {
    throw new Error('backup export --scope asset requires --asset-id <id>.')
  }
  return {
    scope,
    out: resolve(cwd, out),
    ...(collectionId ? { collectionId } : {}),
    ...(entryId ? { entryId } : {}),
    ...(assetId ? { assetId } : {}),
  }
}

export async function runBackupCommand(
  args: string[],
  cwd: string,
  io: CliIo,
  convexClientFactory: ConvexClientFactory = (url) => new ConvexHttpClient(url),
): Promise<number> {
  const subcommand = args[1]
  if (!subcommand || ['--help', '-h'].includes(subcommand)) {
    write(io.stdout, usage())
    return 0
  }
  if (!['export', 'download', 'verify'].includes(subcommand)) {
    throw new Error(`Unknown backup command "${subcommand}".`)
  }

  const client = convexClientFactory(publicConvexUrl(cwd))
  if (!client.setAdminAuth) {
    throw new Error('ginko-cms backup requires a Convex client with admin auth support.')
  }
  client.setAdminAuth(deployKey(cwd))

  if (subcommand === 'export') {
    const parsed = parseBackupExportArgs(args.slice(2), cwd)
    const exported = (await client.action(anyApi.ginkoCms.backup.exportBackup, {
      scope: parsed.scope,
      ...(parsed.collectionId ? { collectionId: parsed.collectionId } : {}),
      ...(parsed.entryId ? { entryId: parsed.entryId } : {}),
      ...(parsed.assetId ? { assetId: parsed.assetId } : {}),
    })) as {
      artifactId: string
      checksum: string
      counts: Record<string, number>
    }
    const downloaded = (await client.action(anyApi.ginkoCms.backup.downloadBackup, {
      artifactId: exported.artifactId,
    })) as { archiveJson: string; checksum: string }
    mkdirSync(dirname(parsed.out), { recursive: true })
    writeFileSync(parsed.out, downloaded.archiveJson, 'utf8')
    write(
      io.stdout,
      `Ginko CMS backup exported: artifactId=${exported.artifactId}, checksum=${downloaded.checksum}, out=${parsed.out}, counts=${stableJson(exported.counts)}.\n`,
    )
    return 0
  }

  if (subcommand === 'download') {
    const artifactId = readFlag(args, '--artifact-id')
    const out = readFlag(args, '--out')
    if (!artifactId) throw new Error('backup download requires --artifact-id <id>.')
    if (!out) throw new Error('backup download requires --out <file>.')
    const downloaded = (await client.action(anyApi.ginkoCms.backup.downloadBackup, {
      artifactId,
    })) as { archiveJson: string; checksum: string }
    const outPath = resolve(cwd, out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, downloaded.archiveJson, 'utf8')
    write(
      io.stdout,
      `Ginko CMS backup downloaded: artifactId=${artifactId}, checksum=${downloaded.checksum}, out=${outPath}.\n`,
    )
    return 0
  }

  if (subcommand === 'verify') {
    const artifactId = readFlag(args, '--artifact-id')
    if (!artifactId) throw new Error('backup verify requires --artifact-id <id>.')
    const result = (await client.action(anyApi.ginkoCms.backup.verifyBackup, {
      artifactId,
    })) as {
      ok: boolean
      checksumMatches: boolean
      currentDataMatches: boolean
    }
    const status = result.ok ? 'ok' : 'failed'
    write(
      result.ok ? io.stdout : io.stderr,
      `Ginko CMS backup verify ${status}: artifactId=${artifactId}, checksumMatches=${result.checksumMatches}, currentDataMatches=${result.currentDataMatches}.\n`,
    )
    return result.ok ? 0 : 1
  }

  throw new Error(`Unknown backup command "${subcommand}".`)
}
