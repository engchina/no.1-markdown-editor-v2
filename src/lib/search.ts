function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface DocumentSearchMatch {
  line: number
  column: number
  text: string
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

export function findDocumentMatches(
  doc: string,
  search: string,
  maxResults = Number.POSITIVE_INFINITY
): DocumentSearchMatch[] {
  if (!search || maxResults <= 0) return []

  const needle = search.toLowerCase()
  const lines = doc.split(/\r?\n/)
  const matches: DocumentSearchMatch[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]
    const column = text.toLowerCase().indexOf(needle)
    if (column === -1) continue

    matches.push({
      line: index + 1,
      column: column + 1,
      text: text.trim(),
    })

    if (matches.length >= maxResults) break
  }

  return matches
}
