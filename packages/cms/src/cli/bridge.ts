import { type CliIo, usage, write } from './args.js'

export async function writeBridgeFiles(_cwd: string) {
  throw new Error('TODO(trellis-cutover): restore direct-template component install in Phase 7')
}

export async function runBridgeCheck(cwd: string, io: CliIo, label = 'component install') {
  write(
    io.stderr,
    `Ginko CMS ${label} is disabled during the hard cutover in ${cwd}. Restore it in Phase 7.\n`,
  )
  return 1
}

export async function runBridgeCommand(args: string[], cwd: string, io: CliIo): Promise<number> {
  const subcommand = args[1]
  if (!subcommand || ['--help', '-h'].includes(subcommand)) {
    write(io.stdout, usage())
    return 0
  }

  if (subcommand === 'check' || subcommand === 'inspect') {
    return await runBridgeCheck(cwd, io)
  }

  throw new Error('TODO(trellis-cutover): restore direct-template component install in Phase 7')
}

