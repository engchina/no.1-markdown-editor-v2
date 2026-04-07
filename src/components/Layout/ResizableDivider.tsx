import { useRef, useCallback } from 'react'

interface Props {
  onResize: (delta: number, totalWidth: number) => void
}

export default function ResizableDivider({ onResize }: Props) {
  const isDragging = useRef(false)
  const startX = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true
      startX.current = e.clientX
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return
        const delta = ev.clientX - startX.current
        startX.current = ev.clientX
        onResize(delta, window.innerWidth)
      }

      const onMouseUp = () => {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [onResize]
  )

  return (
    <div
      className="panel-divider flex-shrink-0 cursor-col-resize transition-colors"
      style={{ width: '4px', background: 'var(--border)' }}
      onMouseDown={onMouseDown}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--border)')}
    />
  )
}
