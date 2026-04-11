import { prepareMarkdownInsertion, type MarkdownInsertionPlan } from './markdownInsertion.ts'

export type ImageMarkdownInsertionPlan = MarkdownInsertionPlan

export function prepareImageMarkdownInsertion(
  markdownText: string,
  followingText = ''
): ImageMarkdownInsertionPlan {
  return prepareMarkdownInsertion(markdownText, followingText)
}
