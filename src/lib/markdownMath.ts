export function containsLikelyMath(markdown: string): boolean {
  if (!markdown) return false

  return (
    /(^|\r?\n)\$\$[\s\S]+?\$\$(?=\r?\n|$)/.test(markdown) ||
    /(^|\r?\n)```math[\t ]*\r?\n[\s\S]+?\r?\n```/.test(markdown) ||
    /(^|[^\\])\$(?:[^$\r\n\\]|\\.)+\$/.test(markdown)
  )
}
