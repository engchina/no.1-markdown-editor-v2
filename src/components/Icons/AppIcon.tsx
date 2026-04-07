import type { CSSProperties } from 'react'

export type IconName =
  | 'bold'
  | 'clock'
  | 'code'
  | 'copy'
  | 'eye'
  | 'file'
  | 'filePlus'
  | 'folder'
  | 'folderOpen'
  | 'focus'
  | 'globe'
  | 'hr'
  | 'image'
  | 'infoCircle'
  | 'italic'
  | 'lineNumbers'
  | 'link'
  | 'list'
  | 'orderedList'
  | 'outline'
  | 'palette'
  | 'panel'
  | 'print'
  | 'quote'
  | 'replace'
  | 'save'
  | 'search'
  | 'sparkles'
  | 'split'
  | 'strikethrough'
  | 'table'
  | 'task'
  | 'trash'
  | 'typewriter'
  | 'wrap'
  | 'chevronRight'
  | 'chevronDown'
  | 'alertCircle'
  | 'checkCircle'

const PATHS: Record<IconName, string> = {
  bold: 'M7 5h6a3 3 0 1 1 0 6H7z M7 11h7a3 3 0 1 1 0 6H7z',
  clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  code: 'M8 8l-4 4 4 4 M16 8l4 4-4 4',
  copy: 'M9 9h10v11H9z M6 15H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  eye: 'M2 12c2.5-4 6-6 10-6c4 0 7.5 2 10 6c-2.5 4-6 6-10 6c-4 0-7.5-2-10-6z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  filePlus: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 12v6 M9 15h6',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderOpen: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 1.8 2.8l-1 8A2 2 0 0 1 17.8 20H6.2a2 2 0 0 1-2-1.7L3 7z',
  focus: 'M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M16 21h3a2 2 0 0 0 2-2v-3',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  hr: 'M4 12h16',
  image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1 M8 9h.01 M6 17l4-4 3 3 3-4 2 5',
  infoCircle: 'M12 12v4 M12 8h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  italic: 'M14 4h5 M5 20h5 M14 4L10 20',
  lineNumbers: 'M9 6h11 M9 12h11 M9 18h11 M5 6h.01 M5 12h.01 M5 18h.01',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1.5 1.5 M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7L13.5 19.5',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  orderedList: 'M10 6h10 M10 12h10 M10 18h10 M4 7h2l-1 1v1 M4 13h2v2H4l2 2 M4 17h2v3',
  outline: 'M6 6h12 M6 12h12 M6 18h12 M3 6h.01 M3 12h.01 M3 18h.01',
  palette: 'M12 3a9 9 0 1 0 9 9c0 1.7-1.3 3-3 3h-1.2a1.8 1.8 0 1 0 0 3.6H18a6 6 0 0 0 0-12A9 9 0 0 0 12 3 M7.5 12h.01 M8.5 8h.01 M12.5 7h.01 M15.5 10h.01',
  panel: 'M3 4h18v16H3z M9 4v16',
  print: 'M6 9V4h12v5 M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1 M7 14h10v6H7z',
  quote: 'M7 7h4v5H6v-3a2 2 0 0 1 2-2 M17 7h4v5h-5v-3a2 2 0 0 1 2-2',
  replace: 'M4 7h8 M9 3l3 4-3 4 M20 17h-8 M15 13l-3 4 3 4',
  save: 'M5 3h11l5 5v13H5z M8 3v5h8 M8 21v-7h8v7',
  search: 'M11 19a8 8 0 1 1 5.3-14l4.2 4.2',
  sparkles: 'M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3 M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z',
  split: 'M3 5h18v14H3z M12 5v14',
  strikethrough: 'M5 12h14 M7 7.5a3 3 0 0 1 3-2.5h1a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h1a3 3 0 0 0 3-2.5',
  table: 'M3 5h18v14H3z M3 10h18 M8 5v14 M16 5v14',
  task: 'M9 11l2 2 4-4 M5 4h14v16H5z',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
  typewriter: 'M4 8h16v8H4z M6 16v4h12v-4 M8 8V5h8v3 M8 12h.01 M12 12h.01 M16 12h.01',
  wrap: 'M4 7h11a4 4 0 1 1 0 8H8 M8 11l-4 4 4 4 M14 17h1',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  alertCircle: 'M12 8v5 M12 16h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  checkCircle: 'M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
}

interface AppIconProps {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}

export default function AppIcon({ name, size = 16, className, style }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
