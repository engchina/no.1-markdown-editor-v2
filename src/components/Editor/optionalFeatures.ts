import { EditorView, keymap } from '@codemirror/view'
import { Prec, type Extension } from '@codemirror/state'
import i18n from '../../i18n/index.ts'
import { dispatchEditorAIOpen } from '../../lib/ai/events.ts'
import {
  createAISlashCommandEntries,
  matchAISlashCommandQuery,
  resolveAISlashCommandTrigger,
  type AISlashCommandEntry,
} from '../../lib/ai/slashCommands.ts'
import { resolveMarkdownCodeLanguage } from './markdownCodeLanguages'

export interface SearchOptions {
  search: string
  caseSensitive: boolean
  regexp: boolean
  wholeWord: boolean
  replace?: string
}

export interface SearchQuerySnapshot {
  search: string
  caseSensitive: boolean
  regexp: boolean
  wholeWord: boolean
  replace: string
  valid: boolean
}

export interface SearchSupport {
  extensions: Extension[]
  applyQuery: (view: EditorView, options: SearchOptions) => void
  readQuery: (view: EditorView) => SearchQuerySnapshot
  openPanel: (view: EditorView) => void
  closePanel: (view: EditorView) => void
  findNext: (view: EditorView) => void
  findPrevious: (view: EditorView) => void
  replaceNext: (view: EditorView, options: SearchOptions) => void
  replaceAll: (view: EditorView, options: SearchOptions) => void
  selectAll: (view: EditorView) => void
}

let searchSupportPromise: Promise<SearchSupport> | null = null
let autocompleteExtensionsPromise: Promise<Extension[]> | null = null
let markdownLanguageExtensionsPromise: Promise<Extension[]> | null = null

function applyAISlashCommand(
  view: EditorView,
  entry: AISlashCommandEntry,
  from: number,
  to: number,
  closeCompletion?: (view: EditorView) => boolean
) {
  view.dispatch({
    changes: { from, to, insert: '' },
    selection: { anchor: from },
  })
  closeCompletion?.(view)
  dispatchEditorAIOpen(entry.openDetail)
}

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
  const slashCommands = createAISlashCommandEntries(i18n.t.bind(i18n)).map((entry) => ({
    label: entry.label,
    detail: entry.detail,
    type: 'keyword' as const,
    boost: 100,
    section: i18n.t('ai.slash.group'),
    apply(view: EditorView, _completion: unknown, from: number, to: number) {
      applyAISlashCommand(view, entry, from, to, autocomplete.closeCompletion)
    },
  }))

  return (context: import('@codemirror/autocomplete').CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    const slashMatch = matchAISlashCommandQuery(before)

    if (!slashMatch) {
      if (!context.explicit) return null
      return {
        from: context.pos,
        options: snippets,
        filter: false,
      }
    }

    const typed = slashMatch.query
    const from = line.from + slashMatch.from
    const options = slashCommands.filter((item) => item.label.toLowerCase().includes(typed))
    if (options.length === 0) return null

    return {
      from,
      options,
      filter: false,
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

    const readQuery = (view: EditorView): SearchQuerySnapshot => {
      const query = search.getSearchQuery(view.state)
      return {
        search: query.search,
        caseSensitive: query.caseSensitive,
        regexp: query.regexp,
        wholeWord: query.wholeWord,
        replace: query.replace,
        valid: query.valid,
      }
    }

    const dispatchSearchEvent = (type: 'editor:search' | 'editor:search-close', replace = false): boolean => {
      if (typeof document === 'undefined') return false
      document.dispatchEvent(
        type === 'editor:search'
          ? new CustomEvent(type, { detail: { replace } })
          : new CustomEvent(type)
      )
      return true
    }

    const hasValidQuery = (view: EditorView) => readQuery(view).valid

    const selectionMatchesQuery = (view: EditorView): boolean => {
      const query = search.getSearchQuery(view.state)
      if (!query.valid) return false

      const selection = view.state.selection.main
      if (selection.empty) return false

      const match = query.getCursor(view.state, selection.from, selection.to).next()
      return !match.done && match.value.from === selection.from && match.value.to === selection.to
    }

    const runSearchCommand = (view: EditorView, command: (view: EditorView) => boolean): void => {
      if (!hasValidQuery(view)) {
        dispatchSearchEvent('editor:search')
        return
      }
      command(view)
    }

    const createHiddenPanel = () => {
      const dom = document.createElement('div')
      dom.setAttribute('aria-hidden', 'true')
      dom.style.position = 'absolute'
      dom.style.width = '0'
      dom.style.height = '0'
      dom.style.overflow = 'hidden'
      dom.style.pointerEvents = 'none'
      dom.style.opacity = '0'
      return { dom }
    }

    return {
      extensions: [
        search.search({
          top: true,
          createPanel: createHiddenPanel,
        }),
        search.highlightSelectionMatches(),
        keymap.of([
          {
            key: 'F3',
            run: (view) => {
              runSearchCommand(view, search.findNext)
              return true
            },
            shift: (view) => {
              runSearchCommand(view, search.findPrevious)
              return true
            },
            scope: 'editor search-panel',
            preventDefault: true,
          },
          {
            key: 'Mod-g',
            run: (view) => {
              runSearchCommand(view, search.findNext)
              return true
            },
            shift: (view) => {
              runSearchCommand(view, search.findPrevious)
              return true
            },
            scope: 'editor search-panel',
            preventDefault: true,
          },
          { key: 'Mod-Shift-l', run: search.selectSelectionMatches },
          { key: 'Mod-Alt-g', run: search.gotoLine },
          { key: 'Mod-d', run: search.selectNextOccurrence, preventDefault: true },
        ]),
      ],
      applyQuery(view, options) {
        view.dispatch({ effects: search.setSearchQuery.of(createQuery(options)) })
      },
      readQuery,
      openPanel(view) {
        search.openSearchPanel(view)
      },
      closePanel(view) {
        search.closeSearchPanel(view)
      },
      findNext(view) {
        runSearchCommand(view, search.findNext)
      },
      findPrevious(view) {
        runSearchCommand(view, search.findPrevious)
      },
      replaceNext(view, options) {
        view.dispatch({ effects: search.setSearchQuery.of(createQuery(options)) })
        if (!hasValidQuery(view)) {
          dispatchSearchEvent('editor:search', true)
          return
        }
        if (!selectionMatchesQuery(view)) {
          search.findNext(view)
        }
        search.replaceNext(view)
      },
      replaceAll(view, options) {
        view.dispatch({ effects: search.setSearchQuery.of(createQuery(options)) })
        if (!hasValidQuery(view)) {
          dispatchSearchEvent('editor:search', true)
          return
        }
        search.replaceAll(view)
      },
      selectAll(view) {
        if (!hasValidQuery(view)) {
          dispatchSearchEvent('editor:search')
          return
        }
        search.selectMatches(view)
      },
    }
  })()

  return searchSupportPromise
}

export async function loadAutocompleteExtensions(): Promise<Extension[]> {
  autocompleteExtensionsPromise ??= (async () => {
    const autocomplete = await import('@codemirror/autocomplete')
    const slashCommandEntries = createAISlashCommandEntries(i18n.t.bind(i18n))

    const runExactAISlashCommand = (view: EditorView): boolean => {
      if (autocomplete.completionStatus(view.state) === 'active') return false

      const selection = view.state.selection.main
      if (!selection.empty) return false

      const line = view.state.doc.lineAt(selection.head)
      const before = line.text.slice(0, selection.head - line.from)
      const match = resolveAISlashCommandTrigger(before, slashCommandEntries)
      if (!match) return false
      if (before.slice(0, match.from).trim().length > 0) return false

      applyAISlashCommand(view, match.entry, line.from + match.from, line.from + match.to)
      return true
    }

    return [
      autocomplete.closeBrackets(),
      autocomplete.autocompletion({
        override: [createMarkdownSnippetSource(autocomplete)],
        activateOnTyping: true,
        defaultKeymap: true,
        interactionDelay: 0,
      }),
      EditorView.inputHandler.of((view, from, _to, text, _insert) => {
        if (text !== '/') return false

        const line = view.state.doc.lineAt(from)
        const before = line.text.slice(0, from - line.from)
        const nextBefore = `${before}${text}`
        if (!matchAISlashCommandQuery(nextBefore)) return false

        view.dispatch({
          changes: { from, to: from, insert: text },
          selection: { anchor: from + text.length },
          userEvent: 'input.type',
        })
        return true
      }),
      Prec.highest(
        keymap.of([
          {
            key: 'Enter',
            run: runExactAISlashCommand,
          },
          {
            key: 'Space',
            run: runExactAISlashCommand,
          },
        ])
      ),
      keymap.of([...autocomplete.closeBracketsKeymap]),
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
        codeLanguages: resolveMarkdownCodeLanguage,
      }),
    ]
  })()

  return markdownLanguageExtensionsPromise
}
