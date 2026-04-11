import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAnchoredOverlayStyle } from '../../hooks/useAnchoredOverlayStyle'
import UpdateSettingsSection from './UpdateSettingsSection'

interface Props {
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

export default function AboutPanel({ onClose, triggerRef }: Props) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayStyle = useAnchoredOverlayStyle(triggerRef, { align: 'right', width: 344 })

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return

      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, triggerRef])

  if (typeof document === 'undefined' || overlayStyle === null) return null

  return createPortal(
    <div
      ref={panelRef}
      data-about-panel="true"
      className="fixed z-[80] rounded-xl shadow-2xl overflow-hidden animate-in glass-panel"
      style={{
        ...overlayStyle,
        background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
        borderColor: 'color-mix(in srgb, var(--border) 88%, transparent)',
      }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          {t('updates.about')}
        </h3>
      </div>

      <div className="p-4 max-h-[70vh] overflow-y-auto">
        <UpdateSettingsSection showSectionLabel={false} />
      </div>
    </div>,
    document.body
  )
}
