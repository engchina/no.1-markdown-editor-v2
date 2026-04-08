const LATIN_DIACRITIC_PATTERN = /(\p{Script=Latin})\p{Mark}+/gu
const NON_ALPHANUMERIC_PATTERN = /[^\p{Letter}\p{Number}]+/gu
const EDGE_SEPARATOR_PATTERN = /^-+|-+$/g

export interface HeadingIdState {
  counts: Map<string, number>
  reserved: Set<string>
}

export function createHeadingIdState(reservedIds: Iterable<string> = []): HeadingIdState {
  return {
    counts: new Map(),
    reserved: new Set(reservedIds),
  }
}

export function slugifyHeading(text: string): string {
  const slug = text
    .trim()
    .normalize('NFKD')
    .replace(LATIN_DIACRITIC_PATTERN, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, '-')
    .replace(EDGE_SEPARATOR_PATTERN, '')

  return slug || 'section'
}

export function reserveHeadingId(id: string, state: HeadingIdState) {
  const normalizedId = id.trim()
  if (!normalizedId) return
  state.reserved.add(normalizedId)
}

export function claimHeadingId(text: string, state: HeadingIdState): string {
  const baseId = slugifyHeading(text)
  let count = state.counts.get(baseId) ?? 0
  let candidate = formatHeadingId(baseId, count)

  while (state.reserved.has(candidate)) {
    count += 1
    candidate = formatHeadingId(baseId, count)
  }

  state.counts.set(baseId, count + 1)
  state.reserved.add(candidate)
  return candidate
}

function formatHeadingId(baseId: string, count: number): string {
  return count === 0 ? baseId : `${baseId}-${count}`
}
