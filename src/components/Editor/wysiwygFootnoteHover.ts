import { hoverTooltip } from '@codemirror/view'
import { stripFrontMatter } from '../../lib/markdownShared.ts'
import { findBlockFootnoteRanges, findInlineFootnoteRanges } from './wysiwygFootnote.ts'
import { renderInlineMarkdownFragment } from './wysiwygInlineMarkdown.ts'
import { collectReferenceDefinitionMarkdown } from './wysiwygReferenceLinks.ts'

export const wysiwygFootnoteHoverTooltip = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos)
  const lineText = line.text
  
  const localPos = pos - line.from
  const inlineRanges = findInlineFootnoteRanges(lineText)
  
  const match = inlineRanges.find(r => localPos >= r.from && localPos <= r.to)
  if (!match) return null
  
  const label = match.label
  const fullText = view.state.doc.toString()
  const blockRanges = findBlockFootnoteRanges(fullText)
  const referenceDefinitionsMarkdown = collectReferenceDefinitionMarkdown(stripFrontMatter(fullText).body)
  
  const blockMatch = blockRanges.find(r => r.label === label)
  if (!blockMatch) return null
  
  let endPos = fullText.indexOf('\n\n', blockMatch.to)
  if (endPos === -1) endPos = fullText.length
  
  const nextFootnote = blockRanges.find(r => r.from > blockMatch.to)
  if (nextFootnote && nextFootnote.from < endPos) endPos = nextFootnote.from
  
  const footnoteContent = fullText.slice(blockMatch.to, endPos).trim()
  
  return {
    pos: line.from + match.from,
    end: line.from + match.to,
    above: true,
    create() {
      const dom = document.createElement('div')
      dom.className = 'cm-wysiwyg-footnote-tooltip ProseMirror prose dark:prose-invert prose-sm'
      // Use rendering logic to present formatted markdown
      dom.innerHTML = footnoteContent
        ? renderInlineMarkdownFragment(footnoteContent, { referenceDefinitionsMarkdown })
        : ''
      return { dom }
    }
  }
}, {
  // Option: show it fairly quickly and keep it close
  hideOnChange: true,
  hoverTime: 300
})
