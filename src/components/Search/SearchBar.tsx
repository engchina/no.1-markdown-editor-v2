import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditorView } from '@codemirror/view'
import { countSearchMatches } from '../../lib/search'
import type { SearchSupport } from '../Editor/optionalFeatures'

interface Props {
  editorView: EditorView | null
  searchSupport: SearchSupport | null
  loading: boolean
  showReplace: boolean
  onClose: () => void
}

export default function SearchBar({ editorView, searchSupport, loading, showReplace, onClose }: Props) {
  const { t } = useTranslation()
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [matchCount, setMatchCount] = useState<string>('')
  const [hasNoMatches, setHasNoMatches] = useState(false)
  const [hasReplace, setHasReplace] = useState(showReplace)

  const findRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHasReplace(showReplace)
  }, [showReplace])

  useEffect(() => {
    if (!loading) findRef.current?.focus()
  }, [loading])

  const runSearch = useCallback(
    (find: string, opts?: { cs?: boolean; re?: boolean; ww?: boolean }) => {
      if (!editorView || !searchSupport) return

      const cs = opts?.cs ?? caseSensitive
      const re = opts?.re ?? useRegex
      const ww = opts?.ww ?? wholeWord

      if (!find) {
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

  const btnStyle = (active: boolean) => ({
    background: active ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: '4px',
    padding: '1px 6px',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  })

  if (loading || !searchSupport) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('search.loading')}</span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-sm"
          style={{ color: 'var(--text-muted)' }}
          title={t('search.close')}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 flex-shrink-0"
      style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)', minWidth: '52px' }}>{t('search.find')}</span>
        <div
          className="flex-1 flex items-center gap-1 rounded px-2"
          style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)', height: '26px' }}
        >
          <input
            ref={findRef}
            type="text"
            value={findText}
            onChange={(event) => setFindText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.searchPlaceholder')}
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--text-primary)' }}
          />
          {matchCount && (
            <span className="text-xs flex-shrink-0" style={{ color: hasNoMatches ? '#ef4444' : 'var(--text-muted)' }}>
              {matchCount}
            </span>
          )}
        </div>
        <button style={btnStyle(caseSensitive)} onClick={() => toggleOpt('cs')} title={t('search.caseSensitive')}>Aa</button>
        <button style={btnStyle(wholeWord)} onClick={() => toggleOpt('ww')} title={t('search.wholeWord')}>W</button>
        <button style={btnStyle(useRegex)} onClick={() => toggleOpt('re')} title={t('search.useRegex')}>.*</button>
        <button
          title={t('search.previous')}
          onClick={() => editorView && searchSupport.findPrevious(editorView)}
          className="w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >↑</button>
        <button
          title={t('search.next')}
          onClick={() => editorView && searchSupport.findNext(editorView)}
          className="w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >↓</button>
        <button
          onClick={() => setHasReplace((value) => !value)}
          className="text-xs px-2 h-6 rounded"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >{hasReplace ? t('search.hideReplace') : t('search.showReplace')}</button>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-sm"
          style={{ color: 'var(--text-muted)' }}
          title={t('search.close')}
        >×</button>
      </div>

      {hasReplace && (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)', minWidth: '52px' }}>{t('search.replace')}</span>
          <div
            className="flex-1 flex items-center gap-1 rounded px-2"
            style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)', height: '26px' }}
          >
            <input
              type="text"
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
              placeholder={t('search.replacePlaceholder')}
              className="flex-1 bg-transparent outline-none text-xs"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
          <button
            disabled={!findText}
            onClick={() => {
              if (!editorView) return
              searchSupport.replaceNext(editorView, {
                search: findText,
                caseSensitive,
                regexp: useRegex,
                wholeWord,
                replace: replaceText,
              })
            }}
            className="text-xs px-2 h-6 rounded disabled:opacity-40"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >{t('search.replaceOne')}</button>
          <button
            disabled={!findText}
            onClick={() => {
              if (!editorView) return
              searchSupport.replaceAll(editorView, {
                search: findText,
                caseSensitive,
                regexp: useRegex,
                wholeWord,
                replace: replaceText,
              })
              runSearch(findText)
            }}
            className="text-xs px-2 h-6 rounded disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'white', border: 'none' }}
          >{t('search.replaceAll')}</button>
        </div>
      )}
    </div>
  )
}
