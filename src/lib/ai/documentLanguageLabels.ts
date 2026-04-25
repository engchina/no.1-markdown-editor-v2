import type { DocumentLanguage } from '../documentLanguage.ts'

export function getAIDocumentLanguageLabelKey(
  language: DocumentLanguage | string | null | undefined
): string | null {
  if (typeof language !== 'string') return null

  switch (language.trim().toLowerCase()) {
    case 'en':
      return 'ai.documentLanguageValue.en'
    case 'ja':
      return 'ai.documentLanguageValue.ja'
    case 'zh':
      return 'ai.documentLanguageValue.zh'
    case 'mixed':
      return 'ai.documentLanguageValue.mixed'
    default:
      return null
  }
}
