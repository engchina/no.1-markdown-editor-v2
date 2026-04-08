import assert from 'node:assert/strict'
import test from 'node:test'
import { extractHeadings, slugifyHeading } from '../src/lib/outline.ts'

test('slugifyHeading normalizes mixed punctuation and accents', () => {
  assert.equal(slugifyHeading('  Café: Hello, World!  '), 'cafe-hello-world')
  assert.equal(slugifyHeading('こんにちは 世界'), 'こんにちは-世界')
  assert.equal(slugifyHeading('デ'), 'デ')
  assert.equal(slugifyHeading('プ'), 'プ')
  assert.equal(slugifyHeading('-'), 'section')
})

test('extractHeadings returns stable deduplicated ids', () => {
  const markdown = [
    '# Intro',
    '## Intro',
    '### Intro',
    '# Café',
    '# こんにちは 世界',
  ].join('\n')

  const headings = extractHeadings(markdown)

  assert.deepEqual(headings, [
    { level: 1, text: 'Intro', id: 'intro', line: 1 },
    { level: 2, text: 'Intro', id: 'intro-1', line: 2 },
    { level: 3, text: 'Intro', id: 'intro-2', line: 3 },
    { level: 1, text: 'Café', id: 'cafe', line: 4 },
    { level: 1, text: 'こんにちは 世界', id: 'こんにちは-世界', line: 5 },
  ])
})

test('extractHeadings supports setext headings and ignores fenced code blocks', () => {
  const markdown = [
    'Title Setext',
    '===========',
    '',
    'Subtitle Setext',
    '----------------',
    '',
    '```md',
    '# Not a heading',
    'Another line',
    '```',
    '',
    '# Final Heading ###',
  ].join('\n')

  const headings = extractHeadings(markdown)

  assert.deepEqual(headings, [
    { level: 1, text: 'Title Setext', id: 'title-setext', line: 1 },
    { level: 2, text: 'Subtitle Setext', id: 'subtitle-setext', line: 4 },
    { level: 1, text: 'Final Heading', id: 'final-heading', line: 12 },
  ])
})

test('extractHeadings keeps heading ids stable for voiced kana and symbol-only titles', () => {
  const markdown = [
    '# デ',
    '# -',
    '# *',
    '# プ',
  ].join('\n')

  const headings = extractHeadings(markdown)

  assert.deepEqual(headings, [
    { level: 1, text: 'デ', id: 'デ', line: 1 },
    { level: 1, text: '-', id: 'section', line: 2 },
    { level: 1, text: '*', id: 'section-1', line: 3 },
    { level: 1, text: 'プ', id: 'プ', line: 4 },
  ])
})
