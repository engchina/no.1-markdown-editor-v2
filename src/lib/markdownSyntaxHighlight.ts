import { attemptDynamicImportRecovery } from './vitePreloadRecovery.ts'

export type MarkdownSyntaxHighlightEngine = 'highlightjs' | 'shiki'

const shikiLangJavaScript = () => import('@shikijs/langs/javascript')
const shikiLangTypeScript = () => import('@shikijs/langs/typescript')
const shikiLangTsx = () => import('@shikijs/langs/tsx')
const shikiLangJsx = () => import('@shikijs/langs/jsx')
const shikiLangJson = () => import('@shikijs/langs/json')
const shikiLangJson5 = () => import('@shikijs/langs/json5')
const shikiLangJsonc = () => import('@shikijs/langs/jsonc')
const shikiLangHtml = () => import('@shikijs/langs/html')
const shikiLangCss = () => import('@shikijs/langs/css')
const shikiLangYaml = () => import('@shikijs/langs/yaml')
const shikiLangToml = () => import('@shikijs/langs/toml')
const shikiLangPython = () => import('@shikijs/langs/python')
const shikiLangGo = () => import('@shikijs/langs/go')
const shikiLangJava = () => import('@shikijs/langs/java')
const shikiLangRust = () => import('@shikijs/langs/rust')
const shikiLangSql = () => import('@shikijs/langs/sql')
const shikiLangXml = () => import('@shikijs/langs/xml')
const shikiLangDiff = () => import('@shikijs/langs/diff')
const shikiLangDocker = () => import('@shikijs/langs/docker')
const shikiLangIni = () => import('@shikijs/langs/ini')
const shikiLangShellscript = () => import('@shikijs/langs/shellscript')
const shikiLangShellsession = () => import('@shikijs/langs/shellsession')
const shikiLangMarkdown = () => import('@shikijs/langs/markdown')
const shikiLangPhp = () => import('@shikijs/langs/php')
const shikiLangC = () => import('@shikijs/langs/c')
const shikiLangVue = () => import('@shikijs/langs/vue')
const shikiLangSvelte = () => import('@shikijs/langs/svelte')
const shikiLangAstro = () => import('@shikijs/langs/astro')
const shikiLangBash = () => import('@shikijs/langs/bash')

const SHIKI_BUNDLED_LANGUAGES = {
  astro: shikiLangAstro,
  bash: shikiLangBash,
  c: shikiLangC,
  css: shikiLangCss,
  diff: shikiLangDiff,
  docker: shikiLangDocker,
  dockerfile: shikiLangDocker,
  go: shikiLangGo,
  html: shikiLangHtml,
  ini: shikiLangIni,
  java: shikiLangJava,
  javascript: shikiLangJavaScript,
  js: shikiLangJavaScript,
  cjs: shikiLangJavaScript,
  mjs: shikiLangJavaScript,
  json: shikiLangJson,
  json5: shikiLangJson5,
  jsonc: shikiLangJsonc,
  jsx: shikiLangJsx,
  markdown: shikiLangMarkdown,
  md: shikiLangMarkdown,
  php: shikiLangPhp,
  py: shikiLangPython,
  python: shikiLangPython,
  rust: shikiLangRust,
  rs: shikiLangRust,
  shellscript: shikiLangShellscript,
  shell: shikiLangShellscript,
  sh: shikiLangShellscript,
  zsh: shikiLangShellscript,
  shellsession: shikiLangShellsession,
  sql: shikiLangSql,
  svelte: shikiLangSvelte,
  toml: shikiLangToml,
  ts: shikiLangTypeScript,
  mts: shikiLangTypeScript,
  cts: shikiLangTypeScript,
  typescript: shikiLangTypeScript,
  tsx: shikiLangTsx,
  vue: shikiLangVue,
  xml: shikiLangXml,
  yaml: shikiLangYaml,
  yml: shikiLangYaml,
} as const

const SHIKI_BUNDLED_THEMES = {
  'github-light': () => import('@shikijs/themes/github-light'),
  'github-dark': () => import('@shikijs/themes/github-dark'),
} as const

const SHIKI_REHYPE_OPTIONS = {
  themes: { light: 'github-light', dark: 'github-dark' },
  defaultLanguage: 'text',
  lazy: true,
  onError() {
    // Let unsupported explicit languages fall through to the subsequent
    // Highlight.js pass instead of eagerly bundling every Shiki grammar.
  },
} as const

let rehypeShikiPluginPromise: Promise<() => ReturnType<(typeof import('@shikijs/rehype/core'))['default']>> | null = null
let rehypeHighlightJsPluginPromise: Promise<(typeof import('./markdownHighlightJs.ts'))['default']> | null = null

async function loadRehypeHighlightJsPlugin() {
  rehypeHighlightJsPluginPromise ??= import('./markdownHighlightJs.ts')
    .then((module) => module.default)
    .catch((error) => {
      rehypeHighlightJsPluginPromise = null
      attemptDynamicImportRecovery(error)
      throw error
    })

  return rehypeHighlightJsPluginPromise
}

async function loadRehypeShikiPlugin() {
  rehypeShikiPluginPromise ??= (async () => {
    const [
      { default: rehypeShikiFromHighlighter },
      { createBundledHighlighter },
      { createJavaScriptRegexEngine },
    ] = await Promise.all([
      import('@shikijs/rehype/core'),
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ])

    const createHighlighter = createBundledHighlighter({
      langs: SHIKI_BUNDLED_LANGUAGES,
      themes: SHIKI_BUNDLED_THEMES,
      // Markdown preview highlighting values smaller payload over edge-case
      // regex fidelity, so avoid the optional Oniguruma wasm runtime here.
      engine: () => createJavaScriptRegexEngine(),
    })

    const highlighter = await createHighlighter({
      langs: [],
      themes: ['github-light', 'github-dark'],
    })

    return function rehypeMarkdownShikiPlugin() {
      return rehypeShikiFromHighlighter(highlighter, SHIKI_REHYPE_OPTIONS)
    }
  })().catch((error) => {
      rehypeShikiPluginPromise = null
      attemptDynamicImportRecovery(error)
      throw error
    })

  return rehypeShikiPluginPromise
}

export async function applyMarkdownSyntaxHighlighting(
  processor: any,
  engine: MarkdownSyntaxHighlightEngine
) {
  const rehypeHighlightSelectedLanguages = await loadRehypeHighlightJsPlugin()

  if (engine !== 'shiki') {
    return processor.use(rehypeHighlightSelectedLanguages)
  }

  const rehypeShikiPlugin = await loadRehypeShikiPlugin()
  return processor
    .use(rehypeShikiPlugin)
    .use(rehypeHighlightSelectedLanguages)
}
