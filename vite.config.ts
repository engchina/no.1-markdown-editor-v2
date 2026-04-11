import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf8')) as {
  version?: string
}
const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'

const OPTIONAL_PREVIEW_CHUNK_PATTERN =
  /\/assets\/(?:MarkdownPreview|markdown(?:[A-Za-z]+)?|vendor-markdown(?:-(?:math|html))?|vendor-mermaid(?:-[^"]+)?|mermaid|.*katex[^"]*|.*rehype-katex[^"]*)/
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
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mermaid-js/parser': path.resolve(__dirname, './src/lib/mermaidParser.ts'),
    },
  },
  optimizeDeps: {
    // Mermaid only becomes reachable after the preview surface is mounted, so we
    // pre-bundle it up front to avoid late dev-time optimizer churn.
    include: ['mermaid'],
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
            /\/node_modules\/@mermaid-js\/parser\/dist\/chunks\/mermaid-parser\.core\/(?:architecture|gitGraph|info|packet|pie|radar|treeView|wardley)-/u.test(
              normalizedId
            )

          if (normalizedId.includes('/src/lib/mermaid.ts')) {
            return 'mermaid-utils'
          }

          if (normalizedId.includes('/src/lib/mermaidParser.ts') || isMermaidParserLeafModule) {
            return 'mermaid-parser'
          }

          if (!id.includes('node_modules')) return

          if (mermaidParserRuntimeChunk) {
            return mermaidParserRuntimeChunk
          }

          const isMarkdownHtmlDependency =
            id.includes('rehype-raw') ||
            id.includes('hast-util-raw') ||
            id.includes('hast-util-from-parse5') ||
            id.includes('hast-util-to-parse5') ||
            id.includes('parse5') ||
            id.includes('vfile-location')
          if (isMarkdownHtmlDependency) {
            return
          }

          if (id.includes('@codemirror/autocomplete')) {
            return 'vendor-editor-autocomplete'
          }

          if (
            id.includes('@codemirror/lang-html') ||
            id.includes('@codemirror/lang-css') ||
            id.includes('@codemirror/lang-javascript') ||
            id.includes('@lezer/html') ||
            id.includes('@lezer/css') ||
            id.includes('@lezer/javascript')
          ) {
            return 'vendor-editor-language-web'
          }

          if (id.includes(`${path.sep}langium${path.sep}`)) {
            return 'vendor-mermaid-parser-langium'
          }

          if (id.includes(`${path.sep}chevrotain${path.sep}`)) {
            return 'vendor-mermaid-parser-chevrotain'
          }

          if (
            id.includes('remark-math') ||
            id.includes('mdast-util-math') ||
            id.includes('micromark-extension-math') ||
            id.includes('rehype-katex') ||
            id.includes(`${path.sep}katex${path.sep}`) ||
            id.includes('/katex/')
          ) {
            return 'vendor-markdown-math'
          }

          if (id.includes('@codemirror/search')) {
            return 'vendor-editor-search'
          }

          if (
            id.includes('@codemirror/lang-markdown') ||
            id.includes('@lezer/markdown')
          ) {
            return 'vendor-editor-language'
          }

          if (
            id.includes('@codemirror') ||
            id.includes('/codemirror/') ||
            id.includes('@lezer')
          ) {
            return 'vendor-editor'
          }

          if (
            id.includes('remark') ||
            id.includes('rehype') ||
            id.includes('unified') ||
            id.includes('micromark') ||
            id.includes('mdast') ||
            id.includes('hast')
          ) {
            return 'vendor-markdown'
          }

          if (id.includes('@tauri-apps')) {
            return 'vendor-tauri'
          }

          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react'
          }

          if (id.includes('zustand') || id.includes('i18next') || id.includes('react-i18next')) {
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
