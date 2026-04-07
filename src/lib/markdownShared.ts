import { defaultSchema } from 'rehype-sanitize'
import { containsLikelyMath } from './markdownMath.ts'

export type FrontMatterMeta = Record<string, string>

export const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'data'],
  },
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripFrontMatter(markdown: string): { meta: FrontMatterMeta; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return { meta: {}, body: markdown }

  const meta: FrontMatterMeta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const dividerIndex = line.indexOf(':')
    if (dividerIndex <= 0) continue

    const key = line.slice(0, dividerIndex).trim()
    const value = line.slice(dividerIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) meta[key] = value
  }

  return {
    meta,
    body: markdown.slice(match[0].length).replace(/^\r?\n/, ''),
  }
}

export function buildFrontMatterHtml(meta: FrontMatterMeta): string {
  if (Object.keys(meta).length === 0) return ''

  const rows = Object.entries(meta)
    .map(
      ([key, value]) =>
        `<tr><td class="fm-key">${escapeHtml(key)}</td><td class="fm-val">${escapeHtml(value)}</td></tr>`
    )
    .join('')

  return `<div class="front-matter"><table>${rows}</table></div>`
}

export { containsLikelyMath }

export function buildStandaloneHtml(
  title: string,
  bodyHtml: string,
  options: {
    inlineKatexCss?: string
  } = {}
): string {
  const safeTitle = escapeHtml(title)
  const includesMath = bodyHtml.includes('class="katex"')
  const katexCssBlock = options.inlineKatexCss
    ? `<style data-katex-inline="true">\n${options.inlineKatexCss}\n</style>`
    : '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css" />'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  ${includesMath ? katexCssBlock : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.75;
      color: #1a1a1a;
      background: #fff;
      max-width: 800px;
      margin: 0 auto;
      padding: 48px 32px;
    }
    h1, h2, h3, h4, h5, h6 {
      font-weight: 700;
      line-height: 1.3;
      margin-top: 2em;
      margin-bottom: 0.5em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid #e5e7eb;
    }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    p { margin: 1em 0; }
    code {
      font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 0.875em;
      background: #f4f4f5;
      border-radius: 4px;
      padding: 0.15em 0.4em;
    }
    pre {
      background: #18181b;
      color: #d4d4d8;
      border-radius: 8px;
      padding: 20px;
      overflow-x: auto;
      margin: 1.5em 0;
    }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote {
      border-left: 4px solid #3b82f6;
      margin: 1em 0;
      padding: 0.5em 1em;
      color: #6b7280;
      font-style: italic;
    }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 16px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    tr:nth-child(even) td { background: #f9fafb; }
    img { max-width: 100%; border-radius: 4px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
    ul, ol { padding-left: 2em; }
    li { margin: 0.25em 0; }
    input[type="checkbox"] { margin-right: 6px; }
    .front-matter {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 1.5em;
      font-size: 0.8em;
    }
    .front-matter table { border: none; margin: 0; width: 100%; }
    .front-matter td { border: none; padding: 2px 8px 2px 0; }
    .fm-key { font-weight: 600; color: #2563eb; white-space: nowrap; padding-right: 16px; }
    .fm-val { color: #4b5563; }
    @media print {
      body { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}
