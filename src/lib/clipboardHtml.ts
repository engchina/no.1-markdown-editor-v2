function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildPlainTextClipboardHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

export async function renderClipboardHtmlFromMarkdown(
  markdown: string,
  mermaidTheme: 'default' | 'dark' = 'default'
): Promise<string> {
  const { renderMarkdown } = await import('./markdown.ts')

  let bodyHtml = await renderMarkdown(markdown)
  if (bodyHtml.includes('language-mermaid')) {
    const { renderMermaidInHtml } = await import('./mermaid.ts')
    bodyHtml = await renderMermaidInHtml(bodyHtml, mermaidTheme)
  }

  return bodyHtml
}
