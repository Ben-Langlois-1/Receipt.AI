const OFFSET = 0xcbf29ce484222325n
const PRIME = 0x100000001b3n
const MASK = 0xffffffffffffffffn

export function externalId(value: string): string {
  let hash = OFFSET
  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0) ?? 0)
    hash = (hash * PRIME) & MASK
  }
  return hash.toString(16).padStart(16, '0')
}
