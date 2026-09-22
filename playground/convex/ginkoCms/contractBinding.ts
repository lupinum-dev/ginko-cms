import { query } from '../_generated/server.js'

const EXPECTED_CONTENT_HASH = 'ad85b95c65c5a1af504294f1b50b0fb49e5eb17ccc7a7d33eddd9e3c98eba7cc'
const PRESENTATION_HASH = 'dfd3d359eb209fa0dc509506f0f9fc2e830e0bb366590f19f1ea3d5713a5416d'
const SHA256 = /^[a-f0-9]{64}$/u

export type ExpectedCmsContractBinding = {
  _expectedContentHash: string
  _expectedPresentationHash: string
}

export const getExpectedCmsContractBinding = query({
  args: {},
  handler: () => ({
    contentHash: EXPECTED_CONTENT_HASH,
    presentationHash: PRESENTATION_HASH,
  }),
})

export function bindExpectedCmsContract<TArgs extends Record<string, unknown>>(
  args: TArgs,
): TArgs & ExpectedCmsContractBinding {
  if (!SHA256.test(EXPECTED_CONTENT_HASH) || !SHA256.test(PRESENTATION_HASH)) {
    throw new Error(
      'Ginko CMS host contract hashes are not bound. Run `pnpm exec ginko-cms deploy` before serving CMS writes.',
    )
  }
  return {
    ...args,
    _expectedContentHash: EXPECTED_CONTENT_HASH,
    _expectedPresentationHash: PRESENTATION_HASH,
  }
}
