/* eslint-disable unicorn/number-literal-case -- Oxfmt canonicalizes SHA-256 hex constants to lowercase. */

export type DurableSha256State = {
  words: number[]
  block: number[]
  bytesHashed: number
}

const INITIAL_HASH = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const

const ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24
  target[offset + 1] = value >>> 16
  target[offset + 2] = value >>> 8
  target[offset + 3] = value
}

function assertState(snapshot: DurableSha256State): void {
  if (
    snapshot.words.length !== 8 ||
    snapshot.words.some((word) => !Number.isSafeInteger(word) || word < 0 || word > 0xffffffff) ||
    snapshot.block.length >= 64 ||
    snapshot.block.some((byte) => !Number.isSafeInteger(byte) || byte < 0 || byte > 255) ||
    !Number.isSafeInteger(snapshot.bytesHashed) ||
    snapshot.bytesHashed < snapshot.block.length ||
    snapshot.bytesHashed % 64 !== snapshot.block.length
  ) {
    throw new Error('Portable durable SHA-256 state is invalid.')
  }
}

/** A serializable SHA-256 accumulator for page-boundary durable workflows. */
export class DurableSha256 {
  private readonly words: Uint32Array
  private readonly block = new Uint8Array(64)
  private blockLength: number
  private bytesHashed: number

  constructor(snapshot?: DurableSha256State) {
    if (snapshot) {
      assertState(snapshot)
      this.words = new Uint32Array(snapshot.words)
      this.block.set(snapshot.block)
      this.blockLength = snapshot.block.length
      this.bytesHashed = snapshot.bytesHashed
      return
    }
    this.words = new Uint32Array(INITIAL_HASH)
    this.blockLength = 0
    this.bytesHashed = 0
  }

  update(bytes: Uint8Array): void {
    this.bytesHashed += bytes.length
    let offset = 0
    while (offset < bytes.length) {
      const length = Math.min(bytes.length - offset, 64 - this.blockLength)
      this.block.set(bytes.subarray(offset, offset + length), this.blockLength)
      this.blockLength += length
      offset += length
      if (this.blockLength === 64) {
        this.compress(this.block)
        this.blockLength = 0
      }
    }
  }

  snapshot(): DurableSha256State {
    return {
      words: [...this.words],
      block: [...this.block.subarray(0, this.blockLength)],
      bytesHashed: this.bytesHashed,
    }
  }

  digestHex(): string {
    const copy = new DurableSha256(this.snapshot())
    return copy.finalizeHex()
  }

  private finalizeHex(): string {
    const bitLength = this.bytesHashed * 8
    this.block[this.blockLength++] = 0x80
    if (this.blockLength > 56) {
      this.block.fill(0, this.blockLength)
      this.compress(this.block)
      this.blockLength = 0
    }
    this.block.fill(0, this.blockLength, 56)
    writeUint32(this.block, 56, Math.floor(bitLength / 0x1_0000_0000))
    writeUint32(this.block, 60, bitLength >>> 0)
    this.compress(this.block)
    return [...this.words].map((word) => word.toString(16).padStart(8, '0')).join('')
  }

  private compress(block: Uint8Array): void {
    const schedule = new Uint32Array(64)
    for (let index = 0; index < 16; index += 1) {
      schedule[index] =
        ((block[index * 4]! << 24) |
          (block[index * 4 + 1]! << 16) |
          (block[index * 4 + 2]! << 8) |
          block[index * 4 + 3]!) >>>
        0
    }
    for (let index = 16; index < 64; index += 1) {
      const left = schedule[index - 15]!
      const right = schedule[index - 2]!
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3)
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10)
      schedule[index] = (schedule[index - 16]! + sigma0 + schedule[index - 7]! + sigma1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = this.words
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25)
      const choice = (e! & f!) ^ (~e! & g!)
      const temp1 = (h! + sigma1 + choice + ROUND_CONSTANTS[index]! + schedule[index]!) >>> 0
      const sigma0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22)
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!)
      const temp2 = (sigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d! + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    const values = [a!, b!, c!, d!, e!, f!, g!, h!]
    for (let index = 0; index < 8; index += 1) {
      this.words[index] = (this.words[index]! + values[index]!) >>> 0
    }
  }
}

export function createPortableRootHashState(): DurableSha256State {
  const hash = new DurableSha256()
  hash.update(new TextEncoder().encode('['))
  return hash.snapshot()
}
