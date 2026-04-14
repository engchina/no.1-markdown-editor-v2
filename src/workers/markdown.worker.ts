/// <reference lib="webworker" />

import { renderMarkdownInWorker } from '../lib/markdownWorker'
import type { MarkdownRenderRequest, MarkdownRenderResponse } from './markdownMessages'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<MarkdownRenderRequest>) => {
  const { id, markdown, syntaxHighlightEngine } = event.data

  try {
    const html = await renderMarkdownInWorker(markdown, syntaxHighlightEngine)
    const response: MarkdownRenderResponse = { id, html }
    self.postMessage(response)
  } catch (error) {
    const response: MarkdownRenderResponse = {
      id,
      error: error instanceof Error ? error.message : 'Unknown markdown rendering error',
    }
    self.postMessage(response)
  }
}

export {}
