import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  type StringStream,
} from '@codemirror/language'

function legacy(parser: Parameters<typeof StreamLanguage.define>[0]) {
  return new LanguageSupport(StreamLanguage.define(parser))
}

const plainTextParser = {
  startState() {
    return null
  },
  token(stream: StringStream) {
    // Plain-text fences don't style tokens, but StreamLanguage still
    // requires each token call to consume input.
    stream.skipToEnd()
    return null
  },
}

const plainTextMarkdownCodeLanguage = LanguageDescription.of({
  name: 'Plain Text',
  alias: ['text', 'txt', 'plaintext', 'plain', 'mermaid', 'zenuml'],
  support: legacy(plainTextParser),
})

const commonMarkdownCodeLanguages = [
  plainTextMarkdownCodeLanguage,
  LanguageDescription.of({
    name: 'C',
    extensions: ['c', 'h', 'ino'],
    load() {
      return import('@codemirror/lang-cpp').then((module) => module.cpp())
    },
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['cpp', 'c++', 'cc', 'cxx'],
    extensions: ['cpp', 'c++', 'cc', 'cxx', 'hpp', 'h++', 'hh', 'hxx'],
    load() {
      return import('@codemirror/lang-cpp').then((module) => module.cpp())
    },
  }),
  LanguageDescription.of({
    name: 'CSS',
    extensions: ['css'],
    load() {
      return import('@codemirror/lang-css').then((module) => module.css())
    },
  }),
  LanguageDescription.of({
    name: 'Diff',
    alias: ['patch'],
    extensions: ['diff', 'patch'],
    load() {
      return import('@codemirror/legacy-modes/mode/diff').then((module) => legacy(module.diff))
    },
  }),
  LanguageDescription.of({
    name: 'Go',
    extensions: ['go'],
    load() {
      return import('@codemirror/lang-go').then((module) => module.go())
    },
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['xhtml'],
    extensions: ['html', 'htm'],
    load() {
      return import('@codemirror/lang-html').then((module) => module.html())
    },
  }),
  LanguageDescription.of({
    name: 'Java',
    extensions: ['java'],
    load() {
      return import('@codemirror/lang-java').then((module) => module.java())
    },
  }),
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['javascript', 'ecmascript', 'js', 'node', 'mjs', 'cjs'],
    extensions: ['js', 'mjs', 'cjs'],
    load() {
      return import('@codemirror/lang-javascript').then((module) => module.javascript())
    },
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json', 'json5', 'jsonc'],
    extensions: ['json', 'map'],
    load() {
      return import('@codemirror/lang-json').then((module) => module.json())
    },
  }),
  LanguageDescription.of({
    name: 'JSX',
    alias: ['jsx'],
    extensions: ['jsx'],
    load() {
      return import('@codemirror/lang-javascript').then((module) => module.javascript({ jsx: true }))
    },
  }),
  LanguageDescription.of({
    name: 'Markdown',
    alias: ['md'],
    extensions: ['md', 'markdown', 'mkd'],
    load() {
      return import('@codemirror/lang-markdown').then((module) => module.markdown())
    },
  }),
  LanguageDescription.of({
    name: 'PHP',
    extensions: ['php', 'php3', 'php4', 'php5', 'php7', 'phtml'],
    load() {
      return import('@codemirror/lang-php').then((module) => module.php())
    },
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py'],
    extensions: ['py', 'pyw'],
    load() {
      return import('@codemirror/lang-python').then((module) => module.python())
    },
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rs'],
    extensions: ['rs'],
    load() {
      return import('@codemirror/lang-rust').then((module) => module.rust())
    },
  }),
  LanguageDescription.of({
    name: 'Shell',
    alias: ['shell', 'shellscript', 'bash', 'sh', 'zsh'],
    extensions: ['sh'],
    load() {
      return import('@codemirror/legacy-modes/mode/shell').then((module) => legacy(module.shell))
    },
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql', 'mysql', 'postgres', 'postgresql', 'sqlite'],
    extensions: ['sql'],
    load() {
      return import('@codemirror/lang-sql').then((module) => module.sql())
    },
  }),
  LanguageDescription.of({
    name: 'TSX',
    alias: ['tsx'],
    extensions: ['tsx'],
    load() {
      return import('@codemirror/lang-javascript').then((module) =>
        module.javascript({ jsx: true, typescript: true })
      )
    },
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['typescript', 'ts', 'mts', 'cts'],
    extensions: ['ts', 'mts', 'cts'],
    load() {
      return import('@codemirror/lang-javascript').then((module) =>
        module.javascript({ typescript: true })
      )
    },
  }),
  LanguageDescription.of({
    name: 'XML',
    alias: ['xml', 'svg', 'rss', 'wsdl', 'xsd'],
    extensions: ['xml', 'xsl', 'xsd', 'svg'],
    load() {
      return import('@codemirror/lang-xml').then((module) => module.xml())
    },
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yaml', 'yml'],
    extensions: ['yaml', 'yml'],
    load() {
      return import('@codemirror/lang-yaml').then((module) => module.yaml())
    },
  }),
] as const

const fallbackMarkdownCodeLanguages = new Map<string, LanguageDescription>()

function normalizeMarkdownCodeLanguageInfo(info: string): string {
  const trimmed = info.trim()
  if (!trimmed) return ''

  const match = /^[^\s,[\]{}()]+/.exec(trimmed)
  return (match?.[0] ?? trimmed).toLowerCase()
}

function createFallbackMarkdownCodeLanguageDescription(info: string): LanguageDescription {
  return LanguageDescription.of({
    name: info,
    alias: [info],
    load: async () => {
      const { languages } = await import('@codemirror/language-data')
      const matched =
        LanguageDescription.matchLanguageName(languages, info) ??
        LanguageDescription.matchLanguageName(languages, info.replace(/[-_]+/g, ' '))

      return matched?.load() ?? plainTextMarkdownCodeLanguage.load()
    },
  })
}

export function resolveMarkdownCodeLanguage(info: string): LanguageDescription | null {
  const normalizedInfo = normalizeMarkdownCodeLanguageInfo(info)
  if (!normalizedInfo) return null

  const commonLanguage =
    LanguageDescription.matchLanguageName(commonMarkdownCodeLanguages, normalizedInfo, false) ??
    LanguageDescription.matchLanguageName(commonMarkdownCodeLanguages, normalizedInfo)
  if (commonLanguage) return commonLanguage

  let fallbackLanguage = fallbackMarkdownCodeLanguages.get(normalizedInfo)
  if (!fallbackLanguage) {
    fallbackLanguage = createFallbackMarkdownCodeLanguageDescription(normalizedInfo)
    fallbackMarkdownCodeLanguages.set(normalizedInfo, fallbackLanguage)
  }
  return fallbackLanguage
}
