import { query } from '../_generated/server.js'

const EXPECTED_CONTENT_HASH = 'unbound'
const EXPECTED_PRESENTATION_HASH = 'unbound'
const SHA256 = /^[a-f0-9]{64}$/u

export type ExpectedCmsContractBinding = {
  _expectedContentHash: string
  _expectedPresentationHash: string
}

export const getExpectedCmsContractBinding = query({
  args: {},
  handler: () => ({
    contentHash: EXPECTED_CONTENT_HASH,
    presentationHash: EXPECTED_PRESENTATION_HASH,
  }),
})

export function bindExpectedCmsContract<TArgs extends Record<string, unknown>>(
  args: TArgs,
): TArgs & ExpectedCmsContractBinding {
  if (!SHA256.test(EXPECTED_CONTENT_HASH) || !SHA256.test(EXPECTED_PRESENTATION_HASH)) {
    throw new Error(
      'Ginko CMS host contract hashes are not bound. Run `pnpm exec ginko-cms deploy` before serving CMS writes.',
    )
  }
  return {
    ...args,
    _expectedContentHash: EXPECTED_CONTENT_HASH,
    _expectedPresentationHash: EXPECTED_PRESENTATION_HASH,
  }
}
