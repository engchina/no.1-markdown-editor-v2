import { claimHeadingId, createHeadingIdState, type HeadingIdState, slugifyHeading } from './headingIds.ts'

export interface OutlineHeading {
  level: number
  text: string
  id: string
  line: number
}

export { slugifyHeading }

export function extractHeadings(markdown: string): OutlineHeading[] {
  const lines = markdown.split(/\r?\n/)
  const headings: OutlineHeading[] = []
  const headingIds = createHeadingIdState()
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
      pushHeading(headings, headingIds, atxMatch[1].length, atxMatch[2], index + 1)
      continue
    }

    const nextLine = lines[index + 1]
    const setextMatch =
      nextLine?.match(/^\s{0,3}(=+|-+)\s*$/) &&
      line.trim() !== '' &&
      !/^\s{0,3}(>|[-*+]\s|\d+\.\s)/.test(line)
    if (!setextMatch) continue

    const level = nextLine.includes('=') ? 1 : 2
    pushHeading(headings, headingIds, level, line, index + 1)
    index += 1
  }

  return headings
}

function pushHeading(
  headings: OutlineHeading[],
  headingIds: HeadingIdState,
  level: number,
  rawText: string,
  line: number
) {
  const text = rawText.trim()
  if (!text) return

  headings.push({
    level,
    text,
    id: claimHeadingId(text, headingIds),
    line,
  })
}
