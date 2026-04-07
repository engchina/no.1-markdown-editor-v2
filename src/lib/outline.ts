export interface OutlineHeading {
  level: number
  text: string
  id: string
  line: number
}

export function slugifyHeading(text: string): string {
  const slug = text
    .trim()
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\u3040-\u30ff\u3400-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'section'
}

export function extractHeadings(markdown: string): OutlineHeading[] {
  const lines = markdown.split(/\r?\n/)
  const headings: OutlineHeading[] = []
  const slugCounts = new Map<string, number>()
  let inFrontMatter = false
  let frontMatterHandled = false
  let fenceMarker: string | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    if (!frontMatterHandled && index === 0 && line.trim() === '---') {
      inFrontMatter = true
      frontMatterHandled = true
      continue
    }

    if (inFrontMatter) {
      if (line.trim() === '---') inFrontMatter = false
      continue
    }

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fenceMarker === null) {
        fenceMarker = marker
        continue
      }
      if (fenceMarker === marker) {
        fenceMarker = null
        continue
      }
    }

    if (fenceMarker) continue

    const atxMatch = line.match(/^\s{0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/)
    if (atxMatch) {
      pushHeading(headings, slugCounts, atxMatch[1].length, atxMatch[2], index + 1)
      continue
    }

    const nextLine = lines[index + 1]
    const setextMatch =
      nextLine?.match(/^\s{0,3}(=+|-+)\s*$/) &&
      line.trim() !== '' &&
      !/^\s{0,3}(>|[-*+]\s|\d+\.\s)/.test(line)
    if (!setextMatch) continue

    const level = nextLine.includes('=') ? 1 : 2
    pushHeading(headings, slugCounts, level, line, index + 1)
    index += 1
  }

  return headings
}

function pushHeading(
  headings: OutlineHeading[],
  slugCounts: Map<string, number>,
  level: number,
  rawText: string,
  line: number
) {
  const text = rawText.trim()
  if (!text) return

  const baseId = slugifyHeading(text)
  const count = slugCounts.get(baseId) ?? 0
  slugCounts.set(baseId, count + 1)

  headings.push({
    level,
    text,
    id: count === 0 ? baseId : `${baseId}-${count}`,
    line,
  })
}
