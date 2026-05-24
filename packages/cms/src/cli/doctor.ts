import type { CliIo } from './args.js'
import { runBridgeCheck } from './bridge.js'

export async function runDoctorCommand(cwd: string, io: CliIo): Promise<number> {
  return await runBridgeCheck(cwd, io, 'doctor')
}
