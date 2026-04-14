import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf8')) as {
  version?: string
}
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'

const OPTIONAL_PREVIEW_CHUNK_PATTERN =
  /\/assets\/(?:MarkdownPreview|markdown(?:[A-Za-z]+)?|vendor-markdown(?:-(?:math|html))?|vendor-mermaid(?:-[^"]+)?|mermaid|.*katex[^"]*|.*rehype-katex[^"]*|.*zenuml[^"]*)/
const OPTIONAL_EDITOR_CHUNK_PATTERN =
  /\/assets\/(?:EditorPane|CodeMirrorEditor|vendor-editor(?:-(?:search|language|language-web|autocomplete))?|optionalFeatures|formatCommands|wysiwyg|.*autocomplete[^"]*)/

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
    // pre-bundle its runtime, the upstream parser package, ZenUML's external
    // diagram bridge, and their parser/runtime dependencies up front to avoid
    // late dev-time optimizer churn the first time a diagram is rendered.
    // Langium must be eagerly optimized so the browser never falls back to its
    // raw cancellation bridge modules under /node_modules.
    include: ['mermaid', '@mermaid-js/parser-upstream', '@mermaid-js/mermaid-zenuml', '@zenuml/core', 'langium'],
  },
  build: {
    // Mermaid's upstream parser core bundles several grammars into a single optional
    // lazy chunk. It's not on the initial load path, so we allow a slightly higher
    // warning threshold to keep build output actionable for real regressions.
    chunkSizeWarningLimit: 560,
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

          if (normalizedId.includes('/node_modules/@codemirror/autocomplete/')) {
            return 'vendor-editor-autocomplete'
          }

          const isCodeMirrorWebLanguage =
            normalizedId.includes('/node_modules/@codemirror/lang-html/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-css/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-javascript/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-angular/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-jinja/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-less/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-liquid/') ||
            normalizedId.includes('/node_modules/@codemirror/lang-vue/')

          const isLezerWebLanguage =
            normalizedId.includes('/node_modules/@lezer/html/') ||
            normalizedId.includes('/node_modules/@lezer/css/') ||
            normalizedId.includes('/node_modules/@lezer/javascript/')

          if (isCodeMirrorWebLanguage || isLezerWebLanguage) {
            return 'vendor-editor-language-web'
          }

          if (
            normalizedId.includes('/node_modules/@codemirror/lang-') ||
            normalizedId.includes('/node_modules/@codemirror/language-data/') ||
            normalizedId.includes('/node_modules/@codemirror/legacy-modes/') ||
            normalizedId.includes('/node_modules/@lezer/markdown/')
          ) {
            return 'vendor-editor-language'
          }

          if (normalizedId.includes('/node_modules/langium/')) {
            return 'vendor-mermaid-parser-langium'
          }

          if (normalizedId.includes('/node_modules/chevrotain/')) {
            return 'vendor-mermaid-parser-chevrotain'
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
