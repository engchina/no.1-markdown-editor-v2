export interface AILegacyRetrievalMetadata {
  query: string | null
  text: string
}

export function extractLegacyAIRetrievalMetadata(text: string): AILegacyRetrievalMetadata {
  const trimmedLeading = text.trimStart()
  if (!trimmedLeading.startsWith('{')) return { query: null, text }

  const prefixEnd = findLeadingJSONObjectEnd(trimmedLeading)
  if (prefixEnd === null) return { query: null, text }

  try {
    const parsed = JSON.parse(trimmedLeading.slice(0, prefixEnd)) as { query?: unknown }
    if (typeof parsed?.query !== 'string') return { query: null, text }

    return {
      query: parsed.query,
      text: trimmedLeading.slice(prefixEnd).replace(/^[\s\r\n]+/u, ''),
    }
  } catch {
    return { query: null, text }
  }
}

export function stripLegacyAIRetrievalQueryPrefix(text: string): string {
  return extractLegacyAIRetrievalMetadata(text).text
}

function findLeadingJSONObjectEnd(text: string): number | null {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (!character) continue

    if (escaped) {
      escaped = false
      continue
    }

    if (inString) {
      if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') {
      depth += 1
      continue
    }

    if (character === '}') {
      if (depth === 0) return null
      depth -= 1
      if (depth === 0) return index + 1
    }
  }

  return null
}
