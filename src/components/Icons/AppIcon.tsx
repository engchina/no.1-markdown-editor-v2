import type { CSSProperties } from 'react'

export type IconName =
  | 'bookmark'
  | 'bold'
  | 'clock'
  | 'code'
  | 'codeBlock'
  | 'copy'
  | 'download'
  | 'edit'
  | 'eye'
  | 'file'
  | 'filePlus'
  | 'folder'
  | 'folderPlus'
  | 'folderOpen'
  | 'focus'
  | 'globe'
  | 'highlight'
  | 'hr'
  | 'image'
  | 'infoCircle'
  | 'italic'
  | 'keyboard'
  | 'lineNumbers'
  | 'link'
  | 'list'
  | 'more'
  | 'orderedList'
  | 'outline'
  | 'palette'
  | 'panel'
  | 'print'
  | 'quote'
  | 'replace'
  | 'redo'
  | 'save'
  | 'settings'
  | 'search'
  | 'sparkles'
  | 'split'
  | 'strikethrough'
  | 'table'
  | 'task'
  | 'trash'
  | 'typewriter'
  | 'undo'
  | 'underline'
  | 'wrap'
  | 'chevronRight'
  | 'chevronDown'
  | 'alertCircle'
  | 'checkCircle'

const PATHS: Record<IconName, string> = {
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v16l-6-3-6 3V5a1 1 0 0 1 1-1z',
  bold: 'M7 5h6a3 3 0 1 1 0 6H7z M7 11h7a3 3 0 1 1 0 6H7z',
  clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  code: 'M8 8l-4 4 4 4 M16 8l4 4-4 4',
  codeBlock: 'M5.5 6.5h13 M5.5 17.5h13 M9 10l-2 2 2 2 M15 10l2 2-2 2',
  copy: 'M9 9h10v11H9z M6 15H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  download: 'M12 3v11 M8 10l4 4 4-4 M5 21h14',
  edit: 'M4 20h4l10-10-4-4L4 16v4 M13 7l4 4 M15 5l2-2 4 4-2 2',
  eye: 'M2 12c2.5-4 6-6 10-6c4 0 7.5 2 10 6c-2.5 4-6 6-10 6c-4 0-7.5-2-10-6z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  filePlus: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 12v6 M9 15h6',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderPlus: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 10v6 M9 13h6',
  folderOpen: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 1.8 2.8l-1 8A2 2 0 0 1 17.8 20H6.2a2 2 0 0 1-2-1.7L3 7z',
  focus: 'M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M16 21h3a2 2 0 0 0 2-2v-3',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  highlight: 'M9 11l-6 6v3h9l3-3 M22 12l-7-7-3 3 7 7 3-3 M3 21h12',
  hr: 'M4 12h16',
  image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1 M8 9h.01 M6 17l4-4 3 3 3-4 2 5',
  infoCircle: 'M12 12v4 M12 8h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  italic: 'M19 4h-9 M14 20H5 M15 4L9 20',
  keyboard: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M7 11h.01 M10 11h.01 M13 11h.01 M16 11h.01 M8 15h8',
  lineNumbers: 'M9 6h11 M9 12h11 M9 18h11 M5 6h.01 M5 12h.01 M5 18h.01',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1.5 1.5 M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7L13.5 19.5',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  orderedList: 'M10 6h10 M10 12h10 M10 18h10 M4 7h2l-1 1v1 M4 13h2v2H4l2 2 M4 17h2v3',
  outline: 'M6 6h12 M6 12h12 M6 18h12 M3 6h.01 M3 12h.01 M3 18h.01',
  palette: 'M12 3a9 9 0 1 0 9 9c0 1.7-1.3 3-3 3h-1.2a1.8 1.8 0 1 0 0 3.6H18a6 6 0 0 0 0-12A9 9 0 0 0 12 3 M7.5 12h.01 M8.5 8h.01 M12.5 7h.01 M15.5 10h.01',
  panel: 'M3 4h18v16H3z M9 4v16',
  print: 'M6 9V4h12v5 M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1 M7 14h10v6H7z',
  quote: 'M5 4v16 M9 7h10 M9 12h7 M9 17h10',
  replace: 'M4 7h8 M9 3l3 4-3 4 M20 17h-8 M15 13l-3 4 3 4',
  redo: 'M15 14l5-4-5-4 M20 10h-8a6 6 0 0 0-6 6v1',
  save: 'M5 3h11l5 5v13H5z M8 3v5h8 M8 21v-7h8v7',
  settings: 'M12 3l1.2 2.5 2.7.4.9 2.6 2.3 1-1 2.5 1 2.5-2.3 1-.9 2.6-2.7.4L12 21l-1.2-2.5-2.7-.4-.9-2.6-2.3-1 1-2.5-1-2.5 2.3-1 .9-2.6 2.7-.4L12 3 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  search: 'M21 21l-4.3-4.3 M17 10a7 7 0 1 1-14 0a7 7 0 0 1 14 0',
  sparkles: 'M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3 M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z',
  split: 'M3 5h18v14H3z M12 5v14',
  strikethrough: 'M4.5 12h15 M16.5 6.5H9.75Q7.25 6.5 7.25 9Q7.25 11 10 11H14Q16.75 11 16.75 13.5Q16.75 17 13.5 17H7.5',
  table: 'M3 5h18v14H3z M3 10h18 M8 5v14 M16 5v14',
  task: 'M9 11l2 2 4-4 M5 4h14v16H5z',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
  typewriter: 'M4 8h16v8H4z M6 16v4h12v-4 M8 8V5h8v3 M8 12h.01 M12 12h.01 M16 12h.01',
  undo: 'M9 14l-5-4 5-4 M4 10h8a6 6 0 0 1 6 6v1',
  underline: 'M8 4v8a4 4 0 0 0 8 0V4 M5 20h14',
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
