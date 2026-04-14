export interface MarkdownRenderRequest {
  id: number
  markdown: string
  syntaxHighlightEngine?: 'highlightjs' | 'shiki'
}

export interface MarkdownRenderResponse {
  id: number
  html?: string
  error?: string
}
