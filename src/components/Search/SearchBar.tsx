import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditorView } from '@codemirror/view'
import { countSearchMatches } from '../../lib/search'
import type { SearchSupport } from '../Editor/optionalFeatures'
import AppIcon from '../Icons/AppIcon'

interface Props {
  editorView: EditorView | null
  searchSupport: SearchSupport | null
  loading: boolean
  showReplace: boolean
  onClose: () => void
}

export default function SearchBar({ editorView, searchSupport, loading, showReplace, onClose }: Props) {
  const { t } = useTranslation()
  const inputId = useId()
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [matchCount, setMatchCount] = useState<string>('')
  const [hasNoMatches, setHasNoMatches] = useState(false)
  const [hasReplace, setHasReplace] = useState(showReplace)

  const findRef = useRef<HTMLInputElement>(null)
  const findInputId = `${inputId}-find`
  const replaceInputId = `${inputId}-replace`

  useEffect(() => {
    setHasReplace(showReplace)
  }, [showReplace])

  useEffect(() => {
    if (loading) return
    findRef.current?.focus()
    findRef.current?.select()
  }, [loading])

  useEffect(() => {
    if (!editorView || !searchSupport) return

    const query = searchSupport.readQuery(editorView)
    const selection = editorView.state.selection.main
    const selectedText =
      selection.empty || selection.from === selection.to ? '' : editorView.state.sliceDoc(selection.from, selection.to)

    setCaseSensitive(query.caseSensitive)
    setUseRegex(query.regexp)
    setWholeWord(query.wholeWord)
    setReplaceText(query.replace)
    setFindText(query.search || selectedText)
  }, [editorView, searchSupport])

  const runSearch = useCallback(
    (find: string, opts?: { cs?: boolean; re?: boolean; ww?: boolean }) => {
      if (!editorView || !searchSupport) return

      const cs = opts?.cs ?? caseSensitive
      const re = opts?.re ?? useRegex
      const ww = opts?.ww ?? wholeWord

      if (!find) {
        searchSupport.applyQuery(editorView, {
          search: '',
          caseSensitive: cs,
          regexp: re,
          wholeWord: ww,
          replace: replaceText,
        })
        setMatchCount('')
        setHasNoMatches(false)
        return
      }

      searchSupport.applyQuery(editorView, {
        search: find,
        caseSensitive: cs,
        regexp: re,
        wholeWord: ww,
        replace: replaceText,
      })

      const count = countSearchMatches(editorView.state.doc.toString(), find, {
        caseSensitive: cs,
        regexp: re,
        wholeWord: ww,
      })
      setHasNoMatches(count === 0)
      setMatchCount(count === 0 ? t('search.noMatches') : t('search.matches', { count }))
    },
    [caseSensitive, editorView, replaceText, searchSupport, t, useRegex, wholeWord]
  )

  useEffect(() => {
    runSearch(findText)
  }, [findText, runSearch])

  const replaceOne = useCallback(() => {
    if (!editorView || !searchSupport || !findText) return

    searchSupport.replaceNext(editorView, {
      search: findText,
      caseSensitive,
      regexp: useRegex,
      wholeWord,
      replace: replaceText,
    })
    runSearch(findText)
  }, [caseSensitive, editorView, findText, replaceText, runSearch, searchSupport, useRegex, wholeWord])

  const replaceEveryMatch = useCallback(() => {
    if (!editorView || !searchSupport || !findText) return

    searchSupport.replaceAll(editorView, {
      search: findText,
      caseSensitive,
      regexp: useRegex,
      wholeWord,
      replace: replaceText,
    })
    runSearch(findText)
  }, [caseSensitive, editorView, findText, replaceText, runSearch, searchSupport, useRegex, wholeWord])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!editorView || !searchSupport) {
        if (event.key === 'Escape') onClose()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (event.shiftKey) {
          searchSupport.findPrevious(editorView)
        } else {
          searchSupport.findNext(editorView)
        }
      } else if (event.key === 'Escape') {
        onClose()
      }
    },
    [editorView, onClose, searchSupport]
  )

  const toggleOpt = (opt: 'cs' | 're' | 'ww') => {
    if (opt === 'cs') setCaseSensitive((value) => { runSearch(findText, { cs: !value }); return !value })
    if (opt === 're') setUseRegex((value) => { runSearch(findText, { re: !value }); return !value })
    if (opt === 'ww') setWholeWord((value) => { runSearch(findText, { ww: !value }); return !value })
  }

  if (loading || !searchSupport) {
    return (
      <div className="search-bar search-bar--loading">
        <span className="search-bar__loading">{t('search.loading')}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="search-bar__icon-button search-bar__icon-button--ghost"
          title={t('search.close')}
          aria-label={t('search.close')}
        >
          <AppIcon name="x" size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="search-bar" data-replace={hasReplace ? 'true' : 'false'}>
      <div className="search-bar__row">
        <label className="search-bar__label" htmlFor={findInputId}>
          {t('search.find')}
        </label>
        <div className={`search-bar__field${hasNoMatches ? ' search-bar__field--invalid' : ''}`}>
          <AppIcon name="search" size={15} className="search-bar__field-icon" />
          <input
            id={findInputId}
            ref={findRef}
            type="text"
            value={findText}
            onChange={(event) => setFindText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.searchPlaceholder')}
            className="search-bar__input"
          />
          {matchCount && (
            <span className={`search-bar__match-count${hasNoMatches ? ' search-bar__match-count--empty' : ''}`}>
              {matchCount}
            </span>
          )}
        </div>
        <div className="search-bar__controls">
          <div className="search-bar__toggle-group">
            <button
              type="button"
              className="search-bar__toggle"
              aria-pressed={caseSensitive}
              onClick={() => toggleOpt('cs')}
              title={t('search.caseSensitive')}
            >
              Aa
            </button>
            <button
              type="button"
              className="search-bar__toggle"
              aria-pressed={wholeWord}
              onClick={() => toggleOpt('ww')}
              title={t('search.wholeWord')}
            >
              W
            </button>
            <button
              type="button"
              className="search-bar__toggle"
              aria-pressed={useRegex}
              onClick={() => toggleOpt('re')}
              title={t('search.useRegex')}
            >
              .*
            </button>
          </div>
          <div className="search-bar__button-group">
            <button
              type="button"
              title={t('search.previous')}
              aria-label={t('search.previous')}
              onClick={() => editorView && searchSupport.findPrevious(editorView)}
              className="search-bar__icon-button"
            >
              <AppIcon name="arrowUp" size={15} />
            </button>
            <button
              type="button"
              title={t('search.next')}
              aria-label={t('search.next')}
              onClick={() => editorView && searchSupport.findNext(editorView)}
              className="search-bar__icon-button"
            >
              <AppIcon name="arrowDown" size={15} />
            </button>
          </div>
          <button
            type="button"
            disabled={!findText}
            onClick={() => editorView && searchSupport.selectAll(editorView)}
            className="search-bar__text-button"
            title={t('search.selectAll')}
          >
            {t('search.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => setHasReplace((value) => !value)}
            className="search-bar__text-button search-bar__text-button--muted"
          >
            {hasReplace ? t('search.hideReplace') : t('search.showReplace')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="search-bar__icon-button search-bar__icon-button--ghost"
            title={t('search.close')}
            aria-label={t('search.close')}
          >
            <AppIcon name="x" size={15} />
          </button>
        </div>
      </div>

      {hasReplace && (
        <div className="search-bar__row search-bar__row--replace">
          <label className="search-bar__label" htmlFor={replaceInputId}>
            {t('search.replace')}
          </label>
          <div className="search-bar__field">
            <AppIcon name="replace" size={15} className="search-bar__field-icon" />
            <input
              id={replaceInputId}
              type="text"
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  replaceOne()
                  return
                }
                if (event.key === 'Escape') onClose()
              }}
              placeholder={t('search.replacePlaceholder')}
              className="search-bar__input"
            />
          </div>
          <div className="search-bar__controls search-bar__replace-actions">
            <button
              type="button"
              disabled={!findText}
              onClick={replaceOne}
              className="search-bar__text-button"
            >
              {t('search.replaceOne')}
            </button>
            <button
              type="button"
              disabled={!findText}
              onClick={replaceEveryMatch}
              className="search-bar__text-button search-bar__text-button--primary"
            >
              {t('search.replaceAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
