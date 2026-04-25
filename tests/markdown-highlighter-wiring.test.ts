import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const syntaxHighlightSource = readFileSync(resolve('src/lib/markdownSyntaxHighlight.ts'), 'utf8')
const highlightJsSource = readFileSync(resolve('src/lib/markdownHighlightJs.ts'), 'utf8')
const markdownSources = [
  readFileSync(resolve('src/lib/markdown.ts'), 'utf8'),
  readFileSync(resolve('src/lib/markdownHtmlRender.ts'), 'utf8'),
  readFileSync(resolve('src/lib/markdownMathRender.ts'), 'utf8'),
  readFileSync(resolve('src/lib/markdownMathHtmlRender.ts'), 'utf8'),
  readFileSync(resolve('src/lib/markdownWorker.ts'), 'utf8'),
  readFileSync(resolve('src/lib/markdownWorkerHtmlRender.ts'), 'utf8'),
]

test('Markdown syntax highlighting loads Shiki on demand through the core rehype entry and a custom bundled highlighter', () => {
  assert.match(syntaxHighlightSource, /import\('\.\/markdownHighlightJs\.ts'\)/u)
  assert.match(syntaxHighlightSource, /import\('@shikijs\/rehype\/core'\)/u)
  assert.match(syntaxHighlightSource, /import\('shiki\/core'\)/u)
  assert.match(syntaxHighlightSource, /import\('shiki\/engine\/javascript'\)/u)
  assert.match(syntaxHighlightSource, /createBundledHighlighter\(/u)
  assert.match(syntaxHighlightSource, /createJavaScriptRegexEngine\(\)/u)
  assert.match(syntaxHighlightSource, /lazy:\s*true/u)
  assert.match(syntaxHighlightSource, /defaultLanguage:\s*'text'/u)
  assert.match(syntaxHighlightSource, /onError\(\)/u)
  assert.match(syntaxHighlightSource, /\.use\(rehypeHighlightSelectedLanguages\)/u)
  assert.match(syntaxHighlightSource, /attemptDynamicImportRecovery\(error\)/u)
  assert.doesNotMatch(syntaxHighlightSource, /import rehypeHighlightSelectedLanguages from '\.\/markdownHighlightJs\.ts'/u)
  assert.doesNotMatch(syntaxHighlightSource, /import\('@shikijs\/rehype'\)(?!\/core)/u)
  assert.doesNotMatch(syntaxHighlightSource, /import\('shiki\/langs'\)/u)
  assert.doesNotMatch(syntaxHighlightSource, /import\('shiki\/wasm'\)/u)
  assert.doesNotMatch(syntaxHighlightSource, /import\('shiki\/engine\/oniguruma'\)/u)
})

test('Markdown syntax highlighting only bundles the GitHub light and dark Shiki themes plus a curated language set', () => {
  assert.match(syntaxHighlightSource, /const SHIKI_BUNDLED_LANGUAGES = \{/u)
  assert.match(syntaxHighlightSource, /javascript: shikiLangJavaScript/u)
  assert.match(syntaxHighlightSource, /typescript: shikiLangTypeScript/u)
  assert.match(syntaxHighlightSource, /python: shikiLangPython/u)
  assert.match(syntaxHighlightSource, /shellscript: shikiLangShellscript/u)
  assert.match(syntaxHighlightSource, /dockerfile: shikiLangDocker/u)
  assert.doesNotMatch(syntaxHighlightSource, /cpp: /u)
  assert.doesNotMatch(syntaxHighlightSource, /emacs-lisp/u)
  assert.doesNotMatch(syntaxHighlightSource, /elisp/u)

  assert.match(syntaxHighlightSource, /const SHIKI_BUNDLED_THEMES = \{/u)
  assert.match(syntaxHighlightSource, /'github-light': \(\) => import\('@shikijs\/themes\/github-light'\)/u)
  assert.match(syntaxHighlightSource, /'github-dark': \(\) => import\('@shikijs\/themes\/github-dark'\)/u)
  assert.match(syntaxHighlightSource, /themes: SHIKI_BUNDLED_THEMES/u)
  assert.match(syntaxHighlightSource, /themes: \['github-light', 'github-dark'\]/u)
  assert.doesNotMatch(syntaxHighlightSource, /import\('shiki\/themes'\)/u)
})

test('Markdown highlight.js fallback uses a curated lowlight registry instead of the default common bundle', () => {
  assert.match(highlightJsSource, /createLowlight\(\{/u)
  assert.match(highlightJsSource, /import cpp from 'highlight\.js\/lib\/languages\/cpp'/u)
  assert.match(highlightJsSource, /import bash from 'highlight\.js\/lib\/languages\/bash'/u)
  assert.match(highlightJsSource, /import javascript from 'highlight\.js\/lib\/languages\/javascript'/u)
  assert.match(highlightJsSource, /lowlight\.registerAlias\(\{/u)
  assert.match(highlightJsSource, /tsx: 'typescript'/u)
  assert.match(highlightJsSource, /docker: 'dockerfile'/u)
  assert.match(highlightJsSource, /mermaid: 'plaintext'/u)
  assert.doesNotMatch(highlightJsSource, /from 'rehype-highlight'/u)
  assert.doesNotMatch(highlightJsSource, /from 'lowlight'\s*\nexport \{grammars as common\}/u)
})

test('Markdown renderers reuse the shared syntax-highlighting helper instead of statically importing Shiki', () => {
  for (const source of markdownSources) {
    assert.match(source, /applyMarkdownSyntaxHighlighting\(/u)
    assert.doesNotMatch(source, /import rehypeShiki from '@shikijs\/rehype'/u)
  }
})
