import { query } from '../_generated/server.js'

const EXPECTED_CONTENT_HASH = '3428fce0867f71bb4b7b2df8f39fbbdc6044380a6d3da3d8401887d239934efa'
const PRESENTATION_HASH = 'ce5dc433d79767ec1e8dbbeb4dad13d69c5f41ac70f8607a5b2b6ac6ed2a04c6'
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
