import type { Root } from 'hast'
import { toText } from 'hast-util-to-text'
import { createLowlight } from 'lowlight'
import { visit } from 'unist-util-visit'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const lowlight = createLowlight({
  bash,
  c,
  cpp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  markdown,
  php,
  plaintext,
  python,
  rust,
  shell,
  sql,
  typescript,
  xml,
  yaml,
})

lowlight.registerAlias({
  cjs: 'javascript',
  docker: 'dockerfile',
  html: 'xml',
  js: 'javascript',
  json5: 'json',
  jsonc: 'json',
  markdown: 'markdown',
  md: 'markdown',
  mermaid: 'plaintext',
  mjs: 'javascript',
  mts: 'typescript',
  plaintext: 'plaintext',
  py: 'python',
  rs: 'rust',
  shellscript: 'shell',
  sh: 'shell',
  svg: 'xml',
  text: 'plaintext',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'plaintext',
  typescript: 'typescript',
  xhtml: 'xml',
  xml: 'xml',
  yml: 'yaml',
  zenuml: 'plaintext',
  zsh: 'shell',
})

function getCodeBlockLanguage(node: { properties: { className?: unknown } }): false | string | undefined {
  const className = node.properties.className
  if (!Array.isArray(className)) return

  let language: string | undefined

  for (const entry of className) {
    const value = String(entry)

    if (value === 'no-highlight' || value === 'nohighlight') {
      return false
    }

    if (!language && value.startsWith('lang-')) {
      language = value.slice(5)
    }

    if (!language && value.startsWith('language-')) {
      language = value.slice(9)
    }
  }

  return language
}

function isShikiRenderedCode(node: {
  properties: { className?: unknown }
}, parent: { properties: { className?: unknown } }): boolean {
  const classNames = [
    ...(Array.isArray(node.properties.className) ? node.properties.className : []),
    ...(Array.isArray(parent.properties.className) ? parent.properties.className : []),
  ].map(String)

  return classNames.includes('shiki')
}

export default function rehypeHighlightSelectedLanguages() {
  return function (tree: Root) {
    visit(tree, 'element', (node: any, _index, parent: any) => {
      if (node.tagName !== 'code' || !parent || parent.type !== 'element' || parent.tagName !== 'pre') {
        return
      }

      if (isShikiRenderedCode(node, parent)) return

      const language = getCodeBlockLanguage(node)
      if (language === false) return
      if (!language) return

      if (!Array.isArray(node.properties.className)) {
        node.properties.className = []
      }

      if (!node.properties.className.includes('hljs')) {
        node.properties.className.unshift('hljs')
      }

      const text = toText(node, { whitespace: 'pre' })
      let result

      try {
        result = lowlight.highlight(language, text, { prefix: 'hljs-' })
      } catch {
        return
      }

      if (result.children.length > 0) {
        node.children = result.children as typeof node.children
      }
    })
  }
}
