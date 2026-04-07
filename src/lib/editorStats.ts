export function countDocumentStats(content: string): { words: number; chars: number } {
  const trimmed = content.trim()
  return {
    words: trimmed ? trimmed.split(/\s+/u).length : 0,
    chars: content.length,
  }
}
