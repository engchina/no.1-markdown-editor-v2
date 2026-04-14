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
  | 'wysiwyg'
  | 'chevronRight'
  | 'chevronDown'
  | 'alertCircle'
  | 'checkCircle'

const PATHS: Record<IconName, string> = {
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v16l-6-3-6 3V5a1 1 0 0 1 1-1z',
  bold: 'M14 12a4 4 0 0 0 0-8H6v8 M15 20a4 4 0 0 0 0-8H6v8',
  clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  code: 'M8 8l-4 4 4 4 M16 8l4 4-4 4',
  codeBlock: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z M8 9l-2 3 2 3 M16 9l2 3-2 3',
  copy: 'M9 9h10v11H9z M6 15H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  download: 'M12 3v11 M8 10l4 4 4-4 M5 21h14',
  edit: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z M15 5l4 4',
  eye: 'M2 12c2.5-4 6-6 10-6c4 0 7.5 2 10 6c-2.5 4-6 6-10 6c-4 0-7.5-2-10-6z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
  filePlus: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 12v6 M9 15h6',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderPlus: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 10v6 M9 13h6',
  folderOpen: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 1.8 2.8l-1 8A2 2 0 0 1 17.8 20H6.2a2 2 0 0 1-2-1.7L3 7z',
  focus: 'M15 3h6v6 M9 21H3v-6 M21 15v6h-6 M3 9V3h6',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  highlight: 'M9 11l-6 6v3h9l3-3 M22 12l-7-7-3 3 7 7 3-3 M3 21h12',
  hr: 'M4 12h2 M8 12h2 M12 12h2 M16 12h2 M20 12h2',
  image: 'M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  infoCircle: 'M12 12v4 M12 8h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  italic: 'M19 4h-9 M14 20H5 M15 4L9 20',
  keyboard: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M7 11h.01 M10 11h.01 M13 11h.01 M16 11h.01 M8 15h8',
  lineNumbers: 'M9 6h11 M9 12h11 M9 18h11 M5 6v0 M5 12v0 M5 18v0',
  link: 'M9 17H7A5 5 0 0 1 7 7h2 M15 7h2a5 5 0 1 1 0 10h-2 M8 12h8',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  orderedList: 'M10 6h10 M10 12h10 M10 18h10 M4 6h1v4 M4 10h2 M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  outline: 'M6 6h12 M6 12h12 M6 18h12 M3 6h.01 M3 12h.01 M3 18h.01',
  palette: 'M12 3a9 9 0 1 0 9 9c0 1.7-1.3 3-3 3h-1.2a1.8 1.8 0 1 0 0 3.6H18a6 6 0 0 0 0-12A9 9 0 0 0 12 3 M7.5 12h.01 M8.5 8h.01 M12.5 7h.01 M15.5 10h.01',
  panel: 'M3 4h18v16H3z M9 4v16',
  print: 'M6 9V4h12v5 M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1 M7 14h10v6H7z',
  quote: 'M3 21c3 0 7-1 7-8V5H3v8h4c0 4.4-1.8 6-4 6 M13 21c3 0 7-1 7-8V5h-7v8h4c0 4.4-1.8 6-4 6',
  replace: 'M4 7h8 M9 3l3 4-3 4 M20 17h-8 M15 13l-3 4 3 4',
  redo: 'M15 14l5-4-5-4 M20 10h-8a6 6 0 0 0-6 6v1',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v13a2 2 0 0 1-2 2z M7 3v5h8 M7 21v-8h10v8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
  search: 'M21 21l-4.3-4.3 M17 10a7 7 0 1 1-14 0a7 7 0 0 1 14 0',
  sparkles: 'm12 3 1.9 5.8a2 2 0 0 0 1.2 1.2L21 12l-5.8 1.9a2 2 0 0 0-1.2 1.2L12 21l-1.9-5.8a2 2 0 0 0-1.2-1.2L3 12l5.8-1.9a2 2 0 0 0 1.2-1.2L12 3Z M5 3l.4 1.1a1 1 0 0 0 .5.5L7 5 M19 17l.4 1.1a1 1 0 0 0 .5.5L21 19',
  split: 'M3 5h18v14H3z M12 5v14',
  strikethrough: 'M16 4H9a3 3 0 0 0-2.8 4 M14 12a4 4 0 0 1 0 8H6 M4 12h16',
  table: 'M3 5h18v14H3z M3 10h18 M8 5v14 M16 5v14',
  task: 'M9 11l2 2 4-4 M5 4h14v16H5z',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6',
  typewriter: 'M13 14h8 M8 14h5 M4 14h2 M4 18h13 M4 10h16 M4 6h13',
  undo: 'M9 14l-5-4 5-4 M4 10h8a6 6 0 0 1 6 6v1',
  underline: 'M8 4v8a4 4 0 0 0 8 0V4 M5 20h14',
  wrap: 'm3 11 3-3-3-3 M7 11h7a5 5 0 0 0 5-5v0a5 5 0 0 0-5-5H7',
  wysiwyg: 'M12 3l1.9 5.8a2 2 0 0 0 1.2 1.2L21 12l-5.8 1.9a2 2 0 0 0-1.2 1.2L12 21l-1.9-5.8a2 2 0 0 0-1.2-1.2L3 12l5.8-1.9a2 2 0 0 0 1.2-1.2L12 3Z M5 3l.4 1.1a1 1 0 0 0 .5.5L7 5l-1.1.4a1 1 0 0 0-.5.5L5 7l-.4-1.1a1 1 0 0 0-.5-.5L3 5l1.1-.4a1 1 0 0 0 .5-.5L5 3Z M19 17l.4 1.1a1 1 0 0 0 .5.5l1.1.4-1.1.4a1 1 0 0 0-.5.5L19 21l-.4-1.1a1 1 0 0 0-.5-.5l-1.1-.4 1.1-.4a1 1 0 0 0 .5-.5L19 17Z',
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
