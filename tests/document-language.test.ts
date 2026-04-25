import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectDocumentLanguage,
  resolveDocumentSpellcheckConfig,
} from '../src/lib/documentLanguage.ts'

test('detectDocumentLanguage recognizes english, chinese, japanese, and mixed content', () => {
  assert.equal(detectDocumentLanguage('Hello world'), 'en')
  assert.equal(detectDocumentLanguage('这是一个测试'), 'zh')
  assert.equal(detectDocumentLanguage('これはテストです'), 'ja')
  assert.equal(detectDocumentLanguage('Hello 世界'), 'mixed')
})

test('resolveDocumentSpellcheckConfig maps system, off, and document-language modes cleanly', () => {
  assert.deepEqual(resolveDocumentSpellcheckConfig('en', 'document-language'), {
    spellcheck: true,
    lang: 'en',
    documentLanguage: 'en',
  })
  assert.deepEqual(resolveDocumentSpellcheckConfig('ja', 'system'), {
    spellcheck: true,
    lang: null,
    documentLanguage: 'ja',
  })
  assert.deepEqual(resolveDocumentSpellcheckConfig('mixed', 'document-language'), {
    spellcheck: true,
    lang: null,
    documentLanguage: 'mixed',
  })
  assert.deepEqual(resolveDocumentSpellcheckConfig('zh', 'off'), {
    spellcheck: false,
    lang: null,
    documentLanguage: 'zh',
  })
})
