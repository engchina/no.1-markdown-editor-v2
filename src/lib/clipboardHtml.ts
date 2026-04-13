function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeClipboardPlainText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

export interface ClipboardPayload {
  plainText: string
  html: string
}

export function buildPlainTextClipboardHtml(text: string): string {
  return normalizeClipboardPlainText(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

export function buildMarkdownSafeClipboardPayload(markdown: string): ClipboardPayload {
  const plainText = normalizeClipboardPlainText(markdown)
  return {
    plainText,
    html: buildPlainTextClipboardHtml(plainText),
  }
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

export async function buildRichClipboardPayload(
  markdown: string,
  mermaidTheme: 'default' | 'dark' = 'default'
): Promise<ClipboardPayload> {
  const plainText = normalizeClipboardPlainText(markdown)
  return {
    plainText,
    html: await renderClipboardHtmlFromMarkdown(plainText, mermaidTheme),
  }
}

export function writeClipboardEventPayload(event: ClipboardEvent, payload: ClipboardPayload): boolean {
  const clipboardData = event.clipboardData
  if (!clipboardData) return false

  clipboardData.setData('text/plain', payload.plainText)
  clipboardData.setData('text/html', payload.html)
  return true
}

export async function writeClipboardPayload(payload: ClipboardPayload): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Rich clipboard write is unavailable')
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([payload.html], { type: 'text/html' }),
      'text/plain': new Blob([payload.plainText], { type: 'text/plain' }),
    }),
  ])
}
