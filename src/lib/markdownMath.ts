export function containsLikelyMath(markdown: string): boolean {
  if (!markdown) return false

  const markdownWithoutInlineCode = markdown.replace(/(`+)(.+?)\1/g, '')

  return (
    /(^|\r?\n)\$\$[\s\S]+?\$\$(?=\r?\n|$)/.test(markdown) ||
    /(^|\r?\n)```math[\t ]*\r?\n[\s\S]+?\r?\n```/.test(markdown) ||
    /(^|[^\\])\$(?:[^$\r\n\\]|\\.)+\$/.test(markdownWithoutInlineCode)
  )
}
