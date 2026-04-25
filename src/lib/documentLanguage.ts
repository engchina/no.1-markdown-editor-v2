export type DocumentLanguage = 'zh' | 'en' | 'ja' | 'mixed'
export type SpellcheckMode = 'system' | 'off' | 'document-language'
export type SpellcheckLanguage = Exclude<DocumentLanguage, 'mixed'>

const HAN_CHARACTER_PATTERN = /\p{Script=Han}/gu
const HIRAGANA_PATTERN = /\p{Script=Hiragana}/gu
const KATAKANA_PATTERN = /\p{Script=Katakana}/gu
const LATIN_PATTERN = /\p{Script=Latin}/gu

export interface DocumentSpellcheckConfig {
  spellcheck: boolean
  lang: SpellcheckLanguage | null
  documentLanguage: DocumentLanguage
}

export function detectDocumentLanguage(content: string): DocumentLanguage {
  const hanCount = countMatches(content, HAN_CHARACTER_PATTERN)
  const hiraganaCount = countMatches(content, HIRAGANA_PATTERN)
  const katakanaCount = countMatches(content, KATAKANA_PATTERN)
  const latinCount = countMatches(content, LATIN_PATTERN)

  if (hiraganaCount + katakanaCount > 0) return 'ja'
  if (hanCount > 0 && latinCount === 0) return 'zh'
  if (latinCount > 0 && hanCount === 0) return 'en'
  if (hanCount > 0 || latinCount > 0) return 'mixed'
  return 'mixed'
}

export function resolveDocumentSpellcheckConfig(
  documentLanguage: DocumentLanguage,
  spellcheckMode: SpellcheckMode
): DocumentSpellcheckConfig {
  if (spellcheckMode === 'off') {
    return {
      spellcheck: false,
      lang: null,
      documentLanguage,
    }
  }

  if (spellcheckMode === 'system') {
    return {
      spellcheck: true,
      lang: null,
      documentLanguage,
    }
  }

  return {
    spellcheck: true,
    lang: isSpellcheckLanguage(documentLanguage) ? documentLanguage : null,
    documentLanguage,
  }
}

function isSpellcheckLanguage(value: DocumentLanguage): value is SpellcheckLanguage {
  return value === 'en' || value === 'ja' || value === 'zh'
}

function countMatches(content: string, pattern: RegExp): number {
  return Array.from(content.matchAll(pattern)).length
}
