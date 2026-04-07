import { keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

export interface SearchOptions {
  search: string
  caseSensitive: boolean
  regexp: boolean
  wholeWord: boolean
  replace?: string
}

export interface SearchSupport {
  extensions: Extension[]
  applyQuery: (view: EditorView, options: SearchOptions) => void
  findNext: (view: EditorView) => void
  findPrevious: (view: EditorView) => void
  replaceNext: (view: EditorView, options: SearchOptions) => void
  replaceAll: (view: EditorView, options: SearchOptions) => void
}

let searchSupportPromise: Promise<SearchSupport> | null = null
let autocompleteExtensionsPromise: Promise<Extension[]> | null = null
let markdownLanguageExtensionsPromise: Promise<Extension[]> | null = null

function createMarkdownSnippetSource(autocomplete: typeof import('@codemirror/autocomplete')) {
  const snippets = [
    autocomplete.snippetCompletion('# ${title}', { label: 'h1', detail: 'Heading 1', type: 'keyword' }),
    autocomplete.snippetCompletion('## ${title}', { label: 'h2', detail: 'Heading 2', type: 'keyword' }),
    autocomplete.snippetCompletion('### ${title}', { label: 'h3', detail: 'Heading 3', type: 'keyword' }),
    autocomplete.snippetCompletion('- [ ] ${task}', { label: 'task', detail: 'Task list item', type: 'keyword' }),
    autocomplete.snippetCompletion('> ${quote}', { label: 'quote', detail: 'Blockquote', type: 'keyword' }),
    autocomplete.snippetCompletion('[${label}](${url})', { label: 'link', detail: 'Markdown link', type: 'keyword' }),
    autocomplete.snippetCompletion('![${alt}](${url})', { label: 'image', detail: 'Markdown image', type: 'keyword' }),
    autocomplete.snippetCompletion('```\\n${code}\\n```', { label: 'code', detail: 'Code fence', type: 'keyword' }),
    autocomplete.snippetCompletion('```mermaid\\n${diagram}\\n```', { label: 'mermaid', detail: 'Mermaid block', type: 'keyword' }),
    autocomplete.snippetCompletion('| Column | Column |\\n| --- | --- |\\n| ${value1} | ${value2} |', {
      label: 'table',
      detail: 'Markdown table',
      type: 'keyword',
    }),
  ]

  return (context: import('@codemirror/autocomplete').CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    const slashMatch = before.match(/(?:^|\s)\/([a-z0-9-]*)$/i)

    if (!slashMatch) {
      if (!context.explicit) return null
      return {
        from: context.pos,
        options: snippets,
        filter: false,
      }
    }

    const typed = slashMatch[1].toLowerCase()
    const from = context.pos - typed.length - 1
    const options = snippets.filter((item) => item.label.toLowerCase().includes(typed))
    if (options.length === 0) return null

    return {
      from,
      options,
      validFor: /^[a-z0-9-]*$/i,
    }
  }
}

export async function loadSearchSupport(): Promise<SearchSupport> {
  searchSupportPromise ??= (async () => {
    const search = await import('@codemirror/search')

    const createQuery = (options: SearchOptions) =>
      new search.SearchQuery({
        search: options.search,
        caseSensitive: options.caseSensitive,
        regexp: options.regexp,
        wholeWord: options.wholeWord,
        replace: options.replace ?? '',
      })

    return {
      extensions: [
        search.highlightSelectionMatches(),
        keymap.of(search.searchKeymap),
      ],
      applyQuery(view, options) {
        view.dispatch({ effects: search.setSearchQuery.of(createQuery(options)) })
      },
      findNext(view) {
        search.findNext(view)
      },
      findPrevious(view) {
        search.findPrevious(view)
      },
      replaceNext(view, options) {
        view.dispatch({ effects: search.setSearchQuery.of(createQuery(options)) })
        search.replaceNext(view)
      },
      replaceAll(view, options) {
        view.dispatch({ effects: search.setSearchQuery.of(createQuery(options)) })
        search.replaceAll(view)
      },
    }
  })()

  return searchSupportPromise
}

export async function loadAutocompleteExtensions(): Promise<Extension[]> {
  autocompleteExtensionsPromise ??= (async () => {
    const autocomplete = await import('@codemirror/autocomplete')

    return [
      autocomplete.closeBrackets(),
      autocomplete.autocompletion({
        override: [createMarkdownSnippetSource(autocomplete)],
        activateOnTyping: true,
        defaultKeymap: false,
      }),
      keymap.of([...autocomplete.closeBracketsKeymap, ...autocomplete.completionKeymap]),
    ]
  })()

  return autocompleteExtensionsPromise
}

export async function loadMarkdownLanguageExtensions(): Promise<Extension[]> {
  markdownLanguageExtensionsPromise ??= (async () => {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')

    return [
      markdown({
        base: markdownLanguage,
        addKeymap: true,
      }),
    ]
  })()

  return markdownLanguageExtensionsPromise
}
