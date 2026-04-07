import { defaultSchema } from 'rehype-sanitize'
import { containsLikelyMath } from './markdownMath.ts'

export type FrontMatterMeta = Record<string, string>

export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), 'u'])),
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
      --md-block-space: 1em;
      --md-quote-space: 0.75em;
    }
    body > * {
      margin-top: 0;
      margin-bottom: 0;
    }
    body > * + * {
      margin-top: var(--md-block-space);
    }
    h1, h2, h3, h4, h5, h6 {
      line-height: 1.3;
      margin: 0;
    }
    h1, h2 { font-weight: 700; }
    h3, h4, h5, h6 { font-weight: 600; }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    p { margin: 0; }
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
      margin: 0;
      padding: 20px;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote {
      position: relative;
      margin: 0;
      padding: 0.75em 1em 0.75em 1.375em;
      color: #4b5563;
      font-style: italic;
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.03));
      border-radius: 0 12px 12px 0;
    }
    blockquote::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.55em;
      bottom: 0.55em;
      width: 3px;
      border-radius: 999px;
      background: #3b82f6;
    }
    blockquote > * { margin-top: 0; margin-bottom: 0; }
    blockquote > * + * { margin-top: var(--md-quote-space); }
    table { border-collapse: collapse; width: 100%; margin: 0; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 16px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    tr:nth-child(even) td { background: #f9fafb; }
    img { max-width: 100%; border-radius: 4px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 0; }
    ul, ol { padding-left: 2em; margin: 0; }
    li { margin: 0.25em 0; }
    input[type="checkbox"] { margin-right: 6px; }
    .front-matter {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 0;
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
