import { normalizeClipboardPlainText } from './clipboardHtml.ts'
import { convertClipboardHtmlToMarkdown } from './pasteHtml.ts'

export interface PreviewSelectionFragment {
  html: string
  plainText: string
}

export function extractPreviewSelectionFragment(
  selection: Selection,
  preview: HTMLElement
): PreviewSelectionFragment | null {
  if (selection.isCollapsed || selection.rangeCount !== 1) return null

  const range = selection.getRangeAt(0)
  if (!preview.contains(range.commonAncestorContainer)) return null

  const container = preview.ownerDocument.createElement('div')
  container.append(range.cloneContents())

  return {
    html: container.innerHTML,
    plainText: selection.toString(),
  }
}

export function convertPreviewSelectionHtmlToMarkdown(selectionHtml: string, plainText: string): string {
  const normalizedPlainText = normalizeClipboardPlainText(plainText)
  return convertClipboardHtmlToMarkdown(selectionHtml, normalizedPlainText) ?? normalizedPlainText
}
