import { useTranslation } from 'react-i18next'
import { useFileTree, type FileNode } from '../../hooks/useFileTree'
import { useEditorStore } from '../../store/editor'
import AppIcon from '../Icons/AppIcon'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export default function FileTree() {
  const { t } = useTranslation()
  const { rootPath, tree, loading, openFolder, toggleDir, openFile } = useFileTree()
  const { tabs, activeTabId } = useEditorStore()

  if (!isTauri) {
    return (
      <div className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <p>{t('sidebar.desktopOnly')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {rootPath ? rootPath.split(/[\\/]/).pop() : t('sidebar.files')}
        </span>
        <button
          onClick={() => { void openFolder() }}
          title={t('sidebar.openFolder')}
          className="text-xs rounded px-1.5 py-0.5 transition-colors"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}
        >
          {t('sidebar.openFolder')}
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{t('sidebar.loading')}</div>
        )}
        {!rootPath && !loading && (
          <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            <p>{t('sidebar.noFiles')}</p>
            <button
              onClick={() => { void openFolder() }}
              className="mt-2 px-3 py-1 rounded text-xs transition-colors"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {t('sidebar.openFolder')}
            </button>
          </div>
        )}
        {tree.map((node, idx) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            pathInTree={[idx]}
            onToggle={toggleDir}
            onOpen={openFile}
            activeFilePath={tabs.find((t) => t.id === activeTabId)?.path ?? null}
          />
        ))}
      </div>
    </div>
  )
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  pathInTree: number[]
  onToggle: (node: FileNode, path: number[]) => void
  onOpen: (node: FileNode) => void
  activeFilePath: string | null
}

function TreeNode({ node, depth, pathInTree, onToggle, onOpen, activeFilePath }: TreeNodeProps) {
  const { t } = useTranslation()
  const isActive = node.type === 'file' && node.path === activeFilePath
  const indentPx = 12 + depth * 14

  return (
    <>
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer select-none transition-colors rounded mx-1"
        style={{
          paddingLeft: `${indentPx}px`,
          paddingRight: '8px',
          background: isActive ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        }}
        onClick={() => {
          if (node.type === 'dir') onToggle(node, pathInTree)
          else onOpen(node)
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isActive
            ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
            : 'transparent'
        }}
      >
        {node.type === 'dir' ? (
          <span className="flex items-center justify-center" style={{ minWidth: '14px', color: 'var(--text-muted)' }}>
            <AppIcon name={node.expanded ? 'chevronDown' : 'chevronRight'} size={12} />
          </span>
        ) : (
          <span className="text-xs" style={{ minWidth: '14px', opacity: 0 }}>·</span>
        )}
        <span className="flex items-center justify-center" style={{ marginRight: '4px', color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
          <AppIcon
            name={node.type === 'dir' ? (node.expanded ? 'folderOpen' : 'folder') : 'file'}
            size={14}
          />
        </span>
        <span
          className="text-xs truncate"
          style={{ fontWeight: node.type === 'dir' ? 500 : 400 }}
        >
          {node.name}
        </span>
      </div>

      {/* Children */}
      {node.type === 'dir' && node.expanded && node.children && (
        <>
          {node.children.length === 0 && (
            <div
              className="text-xs py-0.5"
              style={{ paddingLeft: `${indentPx + 28}px`, color: 'var(--text-muted)' }}
            >
              {t('sidebar.emptyFolder')}
            </div>
          )}
          {node.children.map((child, i) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              pathInTree={[...pathInTree, i]}
              onToggle={onToggle}
              onOpen={onOpen}
              activeFilePath={activeFilePath}
            />
          ))}
        </>
      )}
    </>
  )
}
