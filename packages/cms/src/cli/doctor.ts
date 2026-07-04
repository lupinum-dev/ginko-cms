import { checkConvexComponentInstall } from '../module/convex.js'
import type { CliIo } from './args.js'
import { write } from './args.js'

export async function runDoctorCommand(cwd: string, io: CliIo): Promise<number> {
  const issues = checkConvexComponentInstall(cwd)
  if (issues.length === 0) {
    write(io.stdout, `Ginko CMS doctor passed in ${cwd}.\n`)
    return 0
  }

  write(io.stderr, `Ginko CMS doctor has ${issues.length} issue(s) in ${cwd}:\n`)
  for (const issue of issues) {
    write(io.stderr, `  ${issue.message}\n`)
    write(io.stderr, `    Fix: ${issue.fix}\n`)
  }
  return 1
}
