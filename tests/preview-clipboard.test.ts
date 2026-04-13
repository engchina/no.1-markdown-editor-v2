import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFragment } from 'parse5'
import { convertPreviewSelectionHtmlToMarkdown } from '../src/lib/previewClipboard.ts'

interface Parse5Node {
  nodeName: string
  tagName?: string
  value?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: Parse5Node[]
}

test('convertPreviewSelectionHtmlToMarkdown preserves footnotes and in-document links from preview html', () => {
  const originalDomParser = globalThis.DOMParser
  globalThis.DOMParser = FakeDOMParser as unknown as typeof DOMParser

  try {
    const markdown = convertPreviewSelectionHtmlToMarkdown(
      [
        '<p>一个具有注脚的文本。<sup><a href="#user-content-fn-1" data-footnote-ref>1</a></sup></p>',
        '<h2 id="overview">Overview</h2>',
        '<p><a href="#overview">Jump</a></p>',
        '<p><a href="./guide.md">Doc</a></p>',
        '<p><a href="https://example.com/docs">Site</a></p>',
        '<section data-footnotes class="footnotes">',
        '  <ol>',
        '    <li id="user-content-fn-1">',
        '      <p>注脚的解释 <a href="#user-content-fnref-1" data-footnote-backref>↩</a></p>',
        '    </li>',
        '  </ol>',
        '</section>',
      ].join(''),
      '一个具有注脚的文本。1\nOverview\nJump\n注脚的解释 ↩'
    )

    assert.equal(
      markdown,
      [
        '一个具有注脚的文本。[^1]',
        '',
        '## Overview',
        '',
        '[Jump](#overview)',
        '',
        '[Doc](./guide.md)',
        '',
        '[Site](https://example.com/docs)',
        '',
        '[^1]: 注脚的解释',
      ].join('\n')
    )
  } finally {
    globalThis.DOMParser = originalDomParser
  }
})

test('convertPreviewSelectionHtmlToMarkdown prefers preview image source metadata over placeholder urls', () => {
  const originalDomParser = globalThis.DOMParser
  globalThis.DOMParser = FakeDOMParser as unknown as typeof DOMParser

  try {
    const markdown = convertPreviewSelectionHtmlToMarkdown(
      [
        '<p><img src="data:image/svg+xml;charset=UTF-8,placeholder" data-local-src="./images/hero.png" alt="Hero" /></p>',
        '<p><img src="data:image/svg+xml;charset=UTF-8,placeholder" data-external-src="https://example.com/cover.png" alt="Cover" /></p>',
      ].join(''),
      'Hero\nCover'
    )

    assert.equal(
      markdown,
      [
        '![Hero](./images/hero.png)',
        '',
        '![Cover](https://example.com/cover.png)',
      ].join('\n')
    )
  } finally {
    globalThis.DOMParser = originalDomParser
  }
})

class FakeDOMParser {
  parseFromString(html: string): { body: { childNodes: FakeDomNode[] } } {
    const fragment = parseFragment(html) as Parse5Node

    return {
      body: {
        childNodes: (fragment.childNodes ?? [])
          .map((node) => parse5NodeToFakeDomNode(node))
          .filter((node): node is FakeDomNode => node !== null),
      },
    }
  }
}

interface FakeDomAttribute {
  name: string
  value: string
}

interface FakeDomNode {
  nodeType: number
  textContent?: string
  tagName?: string
  attributes?: FakeDomAttribute[]
  childNodes: FakeDomNode[]
}

function parse5NodeToFakeDomNode(node: Parse5Node): FakeDomNode | null {
  if (node.nodeName === '#text') {
    return {
      nodeType: 3,
      textContent: node.value ?? '',
      childNodes: [],
    }
  }

  if (node.nodeName.startsWith('#')) {
    return {
      nodeType: 8,
      textContent: node.value ?? '',
      childNodes: [],
    }
  }

  return {
    nodeType: 1,
    tagName: (node.tagName ?? '').toUpperCase(),
    attributes: (node.attrs ?? []).map((attribute) => ({ name: attribute.name, value: attribute.value })),
    childNodes: (node.childNodes ?? [])
      .map((child) => parse5NodeToFakeDomNode(child))
      .filter((child): child is FakeDomNode => child !== null),
  }
}
