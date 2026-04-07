function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface CountSearchMatchesOptions {
  caseSensitive?: boolean
  regexp?: boolean
  wholeWord?: boolean
}

export function countSearchMatches(
  doc: string,
  search: string,
  options: CountSearchMatchesOptions = {}
): number {
  if (!search) return 0

  const caseSensitive = options.caseSensitive ?? false
  const regexp = options.regexp ?? false
  const wholeWord = options.wholeWord ?? false

  if (regexp || wholeWord) {
    try {
      const source = regexp ? search : `\\b${escapeRegex(search)}\\b`
      const flags = caseSensitive ? 'g' : 'gi'
      const matches = doc.match(new RegExp(source, flags))
      return matches?.length ?? 0
    } catch {
      return 0
    }
  }

  const needle = caseSensitive ? search : search.toLowerCase()
  const haystack = caseSensitive ? doc : doc.toLowerCase()
  const step = Math.max(needle.length, 1)

  let count = 0
  let position = 0

  while ((position = haystack.indexOf(needle, position)) !== -1) {
    count += 1
    position += step
  }

  return count
}
