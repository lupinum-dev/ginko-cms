export const MEMBER_INVITATION_SAFE_ERROR =
  'This invitation cannot be accepted. Ask the CMS owner for a new invitation.'

const MIN_TOKEN_LENGTH = 32
const MAX_TOKEN_LENGTH = 512

export async function memberInvitationTokenProof(rawToken: string): Promise<string | null> {
  if (rawToken.length < MIN_TOKEN_LENGTH || rawToken.length > MAX_TOKEN_LENGTH) return null
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(rawToken),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function readMemberInvitationToken(hash: string): string {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  return new URLSearchParams(fragment).get('token') ?? ''
}

export function removeInvitationTokenFromAddress(): void {
  if (typeof window === 'undefined') return
  const address = new URL(window.location.href)
  if (!address.hash) return
  address.hash = ''
  window.history.replaceState(window.history.state, '', address)
}
