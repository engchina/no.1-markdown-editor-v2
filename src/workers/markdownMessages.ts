export interface MarkdownRenderRequest {
  id: number
  markdown: string
}

export interface MarkdownRenderResponse {
  id: number
  html?: string
  error?: string
}
