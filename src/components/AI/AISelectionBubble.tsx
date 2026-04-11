import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { SelectionBubbleSize } from '../../lib/ai/selectionBubble.ts'
import AppIcon from '../Icons/AppIcon'
import { dispatchEditorAIOpen } from '../../lib/ai/events.ts'
import { createAIQuickActionOpenDetail, type AIQuickAction } from '../../lib/ai/quickActions.ts'

interface Props {
  top: number
  left: number
  onSizeChange?: (size: SelectionBubbleSize) => void
}

const ACTIONS: AIQuickAction[] = ['ask', 'translate', 'summarize', 'explain', 'rewrite']

export default function AISelectionBubble({ top, left, onSizeChange }: Props) {
  const { t } = useTranslation()
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!onSizeChange) return

    const element = bubbleRef.current
    if (!element) return

    const reportSize = () => {
      const rect = element.getBoundingClientRect()
      onSizeChange({
        width: rect.width,
        height: rect.height,
      })
    }

    reportSize()

    if (typeof ResizeObserver !== 'function') return

    const observer = new ResizeObserver(reportSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onSizeChange])

  return (
    <div
      ref={bubbleRef}
      data-ai-selection-bubble="true"
      className="pointer-events-none absolute z-20"
      style={{
        top,
        left,
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1 shadow-xl glass-panel"
        style={{
          background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent) 14%, var(--border))',
        }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            color: 'var(--accent)',
          }}
          aria-hidden="true"
        >
          <AppIcon name="sparkles" size={14} />
        </span>
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            data-ai-selection-action={action}
            className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              color: 'var(--text-secondary)',
              background: 'transparent',
            }}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              dispatchEditorAIOpen(createAIQuickActionOpenDetail(action, t))
            }}
          >
            {t(`ai.quickActions.${action}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
