import { compareOrderRank } from '@lupinum/ginko-cms-contract/shared/order.js'

const ORDER_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export { compareOrderRank }

export function rankBetween(left?: string | null, right?: string | null): string {
  let a = left ?? ''
  let b = right ?? ''

  if (a && b && compareOrderRank(a, b) >= 0) {
    throw new Error('Invalid rank range')
  }

  let index = 0
  let prefix = ''

  while (true) {
    const leftChar = index < a.length ? a[index]! : ORDER_ALPHABET[0]!
    const rightChar = index < b.length ? b[index]! : ORDER_ALPHABET[ORDER_ALPHABET.length - 1]!
    const leftIndex = ORDER_ALPHABET.indexOf(leftChar)
    const rightIndex = ORDER_ALPHABET.indexOf(rightChar)

    if (rightIndex - leftIndex > 1) {
      return prefix + ORDER_ALPHABET[Math.floor((leftIndex + rightIndex) / 2)]!
    }

    prefix += leftChar
    a = `${a}${ORDER_ALPHABET[0]!}`
    b = `${b}${ORDER_ALPHABET[ORDER_ALPHABET.length - 1]!}`
    index += 1
  }
}

export function rankAfter(rank?: string | null): string {
  return rankBetween(rank ?? undefined, undefined)
}
