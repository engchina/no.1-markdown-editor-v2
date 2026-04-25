import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf8')) as {
  version?: string
}
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'
const ACTIONABLE_CHUNK_SIZE_WARNING_LIMIT_KB = 560
const KNOWN_OPTIONAL_LARGE_CHUNK_PATTERN = /^assets\/zenuml-definition-[^/]+\.js$/u

const OPTIONAL_PREVIEW_CHUNK_PATTERN =
  /\/assets\/(?:MarkdownPreview|markdown(?:[A-Za-z]+)?|vendor-markdown(?:-(?:math|html))?|vendor-mermaid(?:-[^"]+)?|mermaid|.*katex[^"]*|.*rehype-katex[^"]*|.*zenuml[^"]*)/
const OPTIONAL_EDITOR_CHUNK_PATTERN =
  /\/assets\/(?:EditorPane|CodeMirrorEditor|vendor-editor(?:-[^"]+)?|optionalFeatures|formatCommands|wysiwyg|.*autocomplete[^"]*)/

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    {
      name: 'strip-optional-mermaid-preload',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/\n\s*<link rel="modulepreload" crossorigin href="([^"]+)">/g, (match, href) =>
          OPTIONAL_PREVIEW_CHUNK_PATTERN.test(href) || OPTIONAL_EDITOR_CHUNK_PATTERN.test(href) ? '' : match
        )
      },
    },
    {
      name: 'report-actionable-large-chunks',
      apply: 'build',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue

          const sizeKb = Buffer.byteLength(output.code, 'utf8') / 1024
          if (sizeKb <= ACTIONABLE_CHUNK_SIZE_WARNING_LIMIT_KB) continue
          if (KNOWN_OPTIONAL_LARGE_CHUNK_PATTERN.test(output.fileName)) continue

          this.warn(
            `Actionable chunk size ${sizeKb.toFixed(1)} kB exceeds ${ACTIONABLE_CHUNK_SIZE_WARNING_LIMIT_KB} kB: ${output.fileName}`
          )
        }
      },
    },
  ],
  resolve: {
    alias: [
      { find: /^@mermaid-js\/parser$/, replacement: path.resolve(__dirname, './src/lib/mermaidParser.ts') },
      { find: /^@mermaid-js\/parser-upstream$/, replacement: '@mermaid-js/parser' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  optimizeDeps: {
    // Mermaid only becomes reachable after the preview surface is mounted, so we
    // pre-bundle its runtime plus the upstream parser/runtime dependencies that
    // are used by common diagram families. Langium must be eagerly optimized so
    // the browser never falls back to its raw cancellation bridge modules under
    // /node_modules. ZenUML stays out of the default optimizer path because its
    // runtime is intentionally deferred until the user actually renders it.
    include: ['mermaid', '@mermaid-js/parser-upstream', 'langium'],
  },
  build: {
    // Mermaid's upstream parser core bundles several grammars into a single optional
    // lazy chunk, and the optional ZenUML runtime is significantly larger still.
    // We suppress Vite's generic warning and report actionable overages via the
    // custom plugin above so known cold-path bundles do not hide real regressions.
    chunkSizeWarningLimit: 4000,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => {
          const assetPath = `/assets/${dep.split('/').pop() ?? dep}`
          return !OPTIONAL_PREVIEW_CHUNK_PATTERN.test(assetPath) && !OPTIONAL_EDITOR_CHUNK_PATTERN.test(assetPath)
        })
      },
    },
    rollupOptions: {
      output: {
        chunkFileNames(chunkInfo) {
          const moduleIds = chunkInfo.moduleIds ?? []
          const isMarkdownHtmlSharedChunk =
            chunkInfo.name === 'index' &&
            moduleIds.some((id) =>
              id.includes('rehype-raw') ||
              id.includes('hast-util-raw') ||
              id.includes('hast-util-from-parse5') ||
              id.includes('hast-util-to-parse5') ||
              id.includes('parse5') ||
              id.includes('vfile-location')
            )

          if (isMarkdownHtmlSharedChunk) {
            return 'assets/vendor-markdown-html-[hash].js'
          }

          const isMermaidParserSharedChunk =
            chunkInfo.name === 'chunk' &&
            moduleIds.some((id) =>
              id.includes('@mermaid-js/parser/dist/chunks/mermaid-parser.core/chunk-') ||
              id.includes(`${path.sep}langium${path.sep}`) ||
              id.includes(`${path.sep}chevrotain${path.sep}`)
            )

          if (isMermaidParserSharedChunk) {
            return 'assets/vendor-mermaid-parser-core-[hash].js'
          }

          return 'assets/[name]-[hash].js'
        },
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          const mermaidParserRuntimeChunk = getMermaidParserRuntimeChunkName(normalizedId)
          const isMermaidParserLeafModule =
            /\/node_modules\/@mermaid-js\/parser\/dist\/chunks\/mermaid-parser\.core\/(?:architecture|gitGraph|info|packet|pie|radar|treemap|treeView|wardley)-/u.test(
              normalizedId
            )

          if (normalizedId.includes('/src/lib/mermaid.ts')) {
            return 'mermaid-utils'
          }

          if (normalizedId.includes('/src/lib/mermaidParser.ts') || isMermaidParserLeafModule) {
            return 'mermaid-parser'
          }

          if (normalizedId.includes('/node_modules/@iconify-json/logos/')) {
            return 'vendor-mermaid-icons'
          }

          if (!normalizedId.includes('/node_modules/')) return

          if (mermaidParserRuntimeChunk) {
            return mermaidParserRuntimeChunk
          }

          const isMarkdownHtmlDependency =
            normalizedId.includes('rehype-raw') ||
            normalizedId.includes('hast-util-raw') ||
            normalizedId.includes('hast-util-from-parse5') ||
            normalizedId.includes('hast-util-to-parse5') ||
            normalizedId.includes('parse5') ||
            normalizedId.includes('vfile-location')
          if (isMarkdownHtmlDependency) {
            return
          }

          const isMarkdownHighlightDependency =
            normalizedId.includes('/node_modules/lowlight/') ||
            normalizedId.includes('/node_modules/highlight.js/') ||
            normalizedId.includes('/node_modules/hast-util-to-text/')

          if (isMarkdownHighlightDependency) {
            return 'vendor-markdown-highlight'
          }

          if (normalizedId.includes('/node_modules/@codemirror/autocomplete/')) {
            return 'vendor-editor-autocomplete'
          }

          if (normalizedId.includes('/node_modules/@codemirror/language-data/')) {
            return 'vendor-editor-language-data'
          }

          if (normalizedId.includes('/node_modules/@codemirror/legacy-modes/')) {
            const isCommonLegacyMode =
              normalizedId.includes('/node_modules/@codemirror/legacy-modes/mode/shell') ||
              normalizedId.includes('/node_modules/@codemirror/legacy-modes/mode/diff')

            if (isCommonLegacyMode) {
              return 'vendor-editor-legacy-common'
            }

            // Let rare legacy modes stay module-split instead of merging them
            // back into a single cold-start chunk.
            return
          }

          if (
            normalizedId.includes('/node_modules/@codemirror/state/') ||
            normalizedId.includes('/node_modules/@marijn/find-cluster-break/')
          ) {
            return 'vendor-editor-state'
          }

          if (
            normalizedId.includes('/node_modules/@codemirror/view/') ||
            normalizedId.includes('/node_modules/crelt/') ||
            normalizedId.includes('/node_modules/style-mod/') ||
            normalizedId.includes('/node_modules/w3c-keyname/')
          ) {
            return 'vendor-editor-view'
          }

          if (normalizedId.includes('/node_modules/@codemirror/commands/')) {
            return 'vendor-editor-commands'
          }

          if (
            normalizedId.includes('/node_modules/@codemirror/language/') ||
            normalizedId.includes('/node_modules/@lezer/common/') ||
            normalizedId.includes('/node_modules/@lezer/highlight/') ||
            normalizedId.includes('/node_modules/@lezer/lr/')
          ) {
            return 'vendor-editor-language-core'
          }

          const isMarkdownLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-markdown/') ||
            normalizedId.includes('/node_modules/@lezer/markdown/')

          if (isMarkdownLanguageSupport) {
            return 'vendor-editor-language-markdown'
          }

          const isSqlLanguageSupport = normalizedId.includes('/node_modules/@codemirror/lang-sql/')

          if (isSqlLanguageSupport) {
            return 'vendor-editor-language-sql'
          }

          const isCppLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-cpp/') ||
            normalizedId.includes('/node_modules/@lezer/cpp/')

          if (isCppLanguageSupport) {
            return 'vendor-editor-language-cpp'
          }

          const isGoLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-go/') ||
            normalizedId.includes('/node_modules/@lezer/go/')

          if (isGoLanguageSupport) {
            return 'vendor-editor-language-go'
          }

          const isJavaLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-java/') ||
            normalizedId.includes('/node_modules/@lezer/java/')

          if (isJavaLanguageSupport) {
            return 'vendor-editor-language-java'
          }

          const isJsonLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-json/') ||
            normalizedId.includes('/node_modules/@lezer/json/')

          if (isJsonLanguageSupport) {
            return 'vendor-editor-language-json'
          }

          const isPhpLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-php/') ||
            normalizedId.includes('/node_modules/@lezer/php/')

          if (isPhpLanguageSupport) {
            return 'vendor-editor-language-php'
          }

          const isPythonLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-python/') ||
            normalizedId.includes('/node_modules/@lezer/python/')

          if (isPythonLanguageSupport) {
            return 'vendor-editor-language-python'
          }

          const isRustLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-rust/') ||
            normalizedId.includes('/node_modules/@lezer/rust/')

          if (isRustLanguageSupport) {
            return 'vendor-editor-language-rust'
          }

          const isXmlLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-xml/') ||
            normalizedId.includes('/node_modules/@lezer/xml/')

          if (isXmlLanguageSupport) {
            return 'vendor-editor-language-xml'
          }

          const isYamlLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-yaml/') ||
            normalizedId.includes('/node_modules/@lezer/yaml/')

          if (isYamlLanguageSupport) {
            return 'vendor-editor-language-yaml'
          }

          const isHtmlLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-html/') ||
            normalizedId.includes('/node_modules/@lezer/html/')

          if (isHtmlLanguageSupport) {
            return 'vendor-editor-language-html'
          }

          const isCssLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-css/') ||
            normalizedId.includes('/node_modules/@lezer/css/')

          if (isCssLanguageSupport) {
            return 'vendor-editor-language-css'
          }

          const isJavaScriptLanguageSupport =
            normalizedId.includes('/node_modules/@codemirror/lang-javascript/') ||
            normalizedId.includes('/node_modules/@codemirror/lint/') ||
            normalizedId.includes('/node_modules/@lezer/javascript/')

          if (isJavaScriptLanguageSupport) {
            return 'vendor-editor-language-javascript'
          }

          const isTemplateWebLanguage =
            normalizedId.includes('/node_modules/@codemirror/lang-angular/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-jinja/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-less/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-liquid/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-vue/')

          if (isTemplateWebLanguage) {
            return 'vendor-editor-language-web'
          }

          if (
            normalizedId.includes('/node_modules/@codemirror/lang-') ||
            normalizedId.includes('/node_modules/@lezer/markdown/') ||
            normalizedId.includes('/node_modules/@lezer/sass/')
          ) {
            return 'vendor-editor-language'
          }

          const isMermaidParserRuntimeDependency =
            normalizedId.includes('/node_modules/langium/') ||
            normalizedId.includes('/node_modules/chevrotain/')

          if (isMermaidParserRuntimeDependency) {
            return 'vendor-mermaid-parser-runtime'
          }

          if (
            normalizedId.includes('remark-math') ||
            normalizedId.includes('mdast-util-math') ||
            normalizedId.includes('micromark-extension-math') ||
            normalizedId.includes('rehype-katex') ||
            normalizedId.includes('/node_modules/katex/') ||
            normalizedId.includes('/katex/')
          ) {
            return 'vendor-markdown-math'
          }

          if (normalizedId.includes('/node_modules/@codemirror/search/')) {
            return 'vendor-editor-search'
          }

          if (
            normalizedId.includes('/node_modules/@codemirror/') ||
            normalizedId.includes('/codemirror/') ||
            normalizedId.includes('/node_modules/@lezer/')
          ) {
            return 'vendor-editor'
          }

          if (
            normalizedId.includes('remark') ||
            normalizedId.includes('rehype') ||
            normalizedId.includes('unified') ||
            normalizedId.includes('micromark') ||
            normalizedId.includes('mdast') ||
            normalizedId.includes('hast')
          ) {
            return 'vendor-markdown'
          }

          if (normalizedId.includes('/node_modules/@tauri-apps/')) {
            return 'vendor-tauri'
          }

          if (normalizedId.includes('/node_modules/react') || normalizedId.includes('/node_modules/scheduler/')) {
            return 'vendor-react'
          }

          if (
            normalizedId.includes('/node_modules/zustand/') ||
            normalizedId.includes('/node_modules/i18next/') ||
            normalizedId.includes('/node_modules/react-i18next/')
          ) {
            return 'vendor-state'
          }
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
      // 4. use polling if the environment variable is set (useful for some Windows setups)
      usePolling: process.env.VITE_USE_POLLING === 'true',
    },
  },
}))

function getMermaidParserRuntimeChunkName(normalizedId: string): string | null {
  if (!normalizedId.includes('/node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/chunk-')) {
    return null
  }

  const baseName = path.posix.basename(normalizedId, path.posix.extname(normalizedId))
  return `vendor-mermaid-parser-${baseName}`
}
