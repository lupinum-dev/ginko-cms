export interface GinkoCmsExpectedContractHashes {
  expectedContentHash: string
  expectedPresentationHash: string
}

export interface GinkoCmsInstalledContractStatus {
  installedContentHash: string | null
  installedPresentationHash: string | null
  transitionState: 'ready' | 'locked' | null
  transitionRunId: string | null
}

export type GinkoCmsContractWriteBlocker =
  | 'contract_missing'
  | 'transition_locked'
  | 'content_mismatch'
  | 'presentation_mismatch'

export interface GinkoCmsContractCompatibility
  extends GinkoCmsExpectedContractHashes, GinkoCmsInstalledContractStatus {
  contentMatches: boolean
  presentationMatches: boolean
  writable: boolean
  blockers: GinkoCmsContractWriteBlocker[]
}

export function resolveContractCompatibility(
  expected: GinkoCmsExpectedContractHashes,
  installed: GinkoCmsInstalledContractStatus,
): GinkoCmsContractCompatibility {
  const blockers: GinkoCmsContractWriteBlocker[] = []
  const missing =
    installed.installedContentHash === null ||
    installed.installedPresentationHash === null ||
    installed.transitionState === null
  const contentMatches = installed.installedContentHash === expected.expectedContentHash
  const presentationMatches =
    installed.installedPresentationHash === expected.expectedPresentationHash

  if (missing) blockers.push('contract_missing')
  if (installed.transitionState === 'locked') blockers.push('transition_locked')
  if (!missing && !contentMatches) blockers.push('content_mismatch')
  if (!missing && !presentationMatches) blockers.push('presentation_mismatch')

  return {
    ...expected,
    ...installed,
    contentMatches,
    presentationMatches,
    writable: blockers.length === 0,
    blockers,
  }
}

function contractWriteBlockMessage(blockers: GinkoCmsContractWriteBlocker[]): string {
  if (blockers.includes('contract_missing')) {
    return 'No CMS contract is installed. Install the host contract with `ginko-cms push` before editing.'
  }
  if (blockers.includes('transition_locked')) {
    return 'CMS writes are locked while a contract transition is active. Resume or inspect the transition from the owner CLI.'
  }
  if (blockers.includes('content_mismatch') && blockers.includes('presentation_mismatch')) {
    return 'The installed CMS content and presentation contracts do not match this host. Run `ginko-cms push --check` and install or transition the contract.'
  }
  if (blockers.includes('content_mismatch')) {
    return 'The installed CMS content contract does not match this host. Run `ginko-cms push --check` and install or transition the contract.'
  }
  return 'The installed CMS presentation contract does not match this host. Run `ginko-cms push --check` and install the presentation contract.'
}

export class GinkoCmsContractWriteBlockedError extends Error {
  readonly code = 'CMS_CONTRACT_WRITE_BLOCKED'
  readonly compatibility: GinkoCmsContractCompatibility

  constructor(compatibility: GinkoCmsContractCompatibility) {
    super(contractWriteBlockMessage(compatibility.blockers))
    this.name = 'GinkoCmsContractWriteBlockedError'
    this.compatibility = compatibility
  }
}

export async function assertHostContractWritable(
  expected: GinkoCmsExpectedContractHashes,
  readInstalled: () => Promise<GinkoCmsInstalledContractStatus>,
): Promise<GinkoCmsContractCompatibility> {
  const compatibility = resolveContractCompatibility(expected, await readInstalled())
  if (!compatibility.writable) throw new GinkoCmsContractWriteBlockedError(compatibility)
  return compatibility
}
