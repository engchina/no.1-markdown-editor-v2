import assert from 'node:assert/strict'
import test from 'node:test'
import { extractHeadings, slugifyHeading } from '../src/lib/outline.ts'

test('slugifyHeading normalizes mixed punctuation and accents', () => {
  assert.equal(slugifyHeading('  Café: Hello, World!  '), 'cafe-hello-world')
  assert.equal(slugifyHeading('こんにちは 世界'), 'こんにちは-世界')
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
    { level: 1, text: 'Intro', id: 'intro' },
    { level: 2, text: 'Intro', id: 'intro-1' },
    { level: 3, text: 'Intro', id: 'intro-2' },
    { level: 1, text: 'Café', id: 'cafe' },
    { level: 1, text: 'こんにちは 世界', id: 'こんにちは-世界' },
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
    { level: 1, text: 'Title Setext', id: 'title-setext' },
    { level: 2, text: 'Subtitle Setext', id: 'subtitle-setext' },
    { level: 1, text: 'Final Heading', id: 'final-heading' },
  ])
})
