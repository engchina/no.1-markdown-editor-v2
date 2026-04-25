import type {
  AIWorkspaceExecutionPhaseGroup,
  AIWorkspaceExecutionPreflight,
  AIWorkspaceExecutionTask,
  AIWorkspaceExecutionTaskCompletionSource,
  AIWorkspaceExecutionTaskPreflight,
  AIWorkspaceExecutionTaskRuntimeStatus,
} from '../../lib/ai/workspaceExecution.ts'

export type WorkspaceExecutionTaskStatus = AIWorkspaceExecutionTaskRuntimeStatus

export interface WorkspaceAgentSessionLogEntry {
  id: string
  taskId: string
  title: string
  status: 'done' | 'error' | 'canceled'
  message: string
  completionSource?: AIWorkspaceExecutionTaskCompletionSource
  completionAt?: number
  originRunId?: number | null
}

export interface WorkspaceAgentSessionState {
  status: 'running' | 'completed' | 'canceled'
  total: number
  completed: number
  failed: number
  currentTaskId: string | null
  logs: WorkspaceAgentSessionLogEntry[]
}

export type WorkspaceExecutionPreflightState =
  | { status: 'idle'; data: null; errorMessage: null }
  | { status: 'loading'; data: AIWorkspaceExecutionPreflight | null; errorMessage: null }
  | { status: 'ready'; data: AIWorkspaceExecutionPreflight; errorMessage: null }
  | { status: 'error'; data: AIWorkspaceExecutionPreflight | null; errorMessage: string }

export function buildWorkspaceExecutionResumedLogMessage(
  completionSource: AIWorkspaceExecutionTaskCompletionSource | undefined,
  originRunId: number | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  switch (completionSource) {
    case 'manual-apply':
      return t('ai.workspaceExecution.agentLogResumedManualApply')
    case 'manual-open-draft':
      return t('ai.workspaceExecution.agentLogResumedManualOpenDraft')
    case 'agent':
      return typeof originRunId === 'number'
        ? t('ai.workspaceExecution.agentLogResumedAgentRun', { runId: originRunId })
        : t('ai.workspaceExecution.agentLogResumedAgent')
    default:
      return t('ai.workspaceExecution.agentLogResumed')
  }
}

export function formatWorkspaceExecutionPhaseHeading(
  phaseGroup: AIWorkspaceExecutionPhaseGroup,
  phaseIndex: number,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return `${t('ai.workspaceExecution.phaseLabel', { index: phaseIndex + 1 })} · ${getWorkspaceExecutionPhaseName(phaseGroup.label, t)}`
}

export function getWorkspaceExecutionPhaseName(
  phaseLabel: string | null,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return phaseLabel ?? t('ai.workspaceExecution.phaseDefault')
}

export function formatWorkspacePreflightMessage(
  preflight: AIWorkspaceExecutionTaskPreflight,
  task: AIWorkspaceExecutionTask,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return getWorkspaceExecutionPreflightMeta(preflight, false, task, t).detail
}

export function buildWorkspaceExecutionPhaseStalledMessage(args: {
  phaseGroup: AIWorkspaceExecutionPhaseGroup
  phaseIndex: number
  tasks: AIWorkspaceExecutionTask[]
  preflight: AIWorkspaceExecutionPreflight
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const dependencyLabels = Array.from(
    new Set(
      args.tasks.flatMap((task) => {
        const meta = args.preflight.tasks[task.id]
        if (!meta) return []

        return [
          ...meta.dependencyTaskTitles,
          ...(meta.upstreamTaskTitle ? [meta.upstreamTaskTitle] : []),
        ].filter((value): value is string => value.trim().length > 0)
      })
    )
  )
  const phase = formatWorkspaceExecutionPhaseHeading(args.phaseGroup, args.phaseIndex, args.t)

  if (dependencyLabels.length > 0) {
    return args.t('ai.workspaceExecution.phaseStalledDependencies', {
      phase,
      dependencies: dependencyLabels.join(', '),
    })
  }

  return args.t('ai.workspaceExecution.phaseStalled', { phase })
}

export function isManualWorkspaceExecutionCompletionSource(
  source: AIWorkspaceExecutionTaskCompletionSource | undefined
) {
  return source === 'manual-apply' || source === 'manual-open-draft'
}

export function formatWorkspaceExecutionCompletionMeta(args: {
  completionAt?: number
  originRunId?: number | null
  t: (key: string, values?: Record<string, string | number>) => string
}) {
  const parts: string[] = []

  if (typeof args.completionAt === 'number') {
    parts.push(
      args.t('ai.workspaceExecution.completionAt', {
        time: formatWorkspaceExecutionTimestamp(args.completionAt),
      })
    )
  }

  if (typeof args.originRunId === 'number') {
    parts.push(args.t('ai.workspaceExecution.originRun', { runId: args.originRunId }))
  }

  return parts.join(' · ')
}

export function getWorkspaceExecutionCompletionSourceTone(
  source: AIWorkspaceExecutionTaskCompletionSource
): 'success' | 'info' | 'accent' {
  switch (source) {
    case 'agent':
      return 'success'
    case 'manual-apply':
      return 'accent'
    case 'manual-open-draft':
    default:
      return 'info'
  }
}

export function getWorkspaceExecutionTaskStatusMeta(
  status: WorkspaceExecutionTaskStatus,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  switch (status) {
    case 'waiting':
      return { label: t('ai.workspaceExecution.statusWaiting'), color: '#2563eb' }
    case 'running':
      return { label: t('ai.workspaceExecution.statusRunning'), color: 'var(--accent)' }
    case 'done':
      return { label: t('ai.workspaceExecution.statusDone'), color: '#15803d' }
    case 'canceled':
      return { label: t('ai.workspaceExecution.statusCanceled'), color: '#b45309' }
    case 'error':
      return { label: t('ai.workspaceExecution.statusError'), color: '#b91c1c' }
    case 'idle':
    default:
      return { label: t('ai.workspaceExecution.statusReady'), color: 'var(--text-muted)' }
  }
}

export function getWorkspaceExecutionPreflightMeta(
  preflight: AIWorkspaceExecutionTaskPreflight | null,
  loading: boolean,
  task: AIWorkspaceExecutionTask,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  if (loading) {
    return {
      label: t('ai.workspaceExecution.preflightLoading'),
      detail: t('ai.workspaceExecution.preflightLoadingDetail'),
      color: 'var(--text-primary)',
      colorMuted: 'var(--text-muted)',
      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
      background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
    }
  }

  if (!preflight) {
    return {
      label: t('ai.workspaceExecution.preflightUnknown'),
      detail: t('ai.workspaceExecution.preflightUnknownDetail'),
      color: 'var(--text-muted)',
      colorMuted: 'var(--text-muted)',
      borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
      background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
    }
  }

  switch (preflight.reason) {
    case 'update-ready':
      return {
        label: t('ai.workspaceExecution.preflightReady'),
        detail: preflight.matchedReference
          ? t('ai.workspaceExecution.preflightTaskUpdateReady', { target: preflight.matchedReference.name })
          : t('ai.workspaceExecution.preflightReadyDetail'),
        color: '#15803d',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #16a34a 28%, var(--border))',
        background: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
      }
    case 'update-will-open':
      return {
        label: t('ai.workspaceExecution.preflightReview'),
        detail: preflight.matchedReference?.path
          ? t('ai.workspaceExecution.preflightTaskWillOpen', { target: preflight.matchedReference.path })
          : t('ai.workspaceExecution.preflightReviewDetail'),
        color: '#b45309',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
      }
    case 'update-target-produced-by-task':
      return {
        label: t('ai.workspaceExecution.preflightWaiting'),
        detail: preflight.upstreamTaskTitle
          ? t('ai.workspaceExecution.preflightTaskProducedByTask', { task: preflight.upstreamTaskTitle })
          : t('ai.workspaceExecution.preflightWaitingDetail'),
        color: '#2563eb',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #2563eb 28%, var(--border))',
        background: 'color-mix(in srgb, #2563eb 10%, var(--bg-primary))',
      }
    case 'dependency-pending':
      return {
        label: t('ai.workspaceExecution.preflightWaiting'),
        detail: preflight.dependencyTaskTitles.length > 0
          ? t('ai.workspaceExecution.preflightTaskDependencyPending', {
              dependencies: preflight.dependencyTaskTitles.join(', '),
            })
          : t('ai.workspaceExecution.preflightWaitingDetail'),
        color: '#2563eb',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #2563eb 28%, var(--border))',
        background: 'color-mix(in srgb, #2563eb 10%, var(--bg-primary))',
      }
    case 'dependency-cycle':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: preflight.dependencyTaskTitles.length > 0
          ? t('ai.workspaceExecution.preflightTaskDependencyCycle', {
              dependencies: preflight.dependencyTaskTitles.join(', '),
            })
          : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'dependency-phase-order':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail:
          (preflight.phaseOrderDependencyTaskTitles?.length ?? 0) > 0
            ? t('ai.workspaceExecution.preflightTaskDependencyPhaseOrder', {
                dependencies: preflight.phaseOrderDependencyTaskTitles?.join(', ') ?? '',
              })
            : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'dependency-unresolved':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: preflight.unresolvedDependencies.length > 0
          ? t('ai.workspaceExecution.preflightDependencyUnresolved', {
              dependencies: preflight.unresolvedDependencies.join(', '),
            })
          : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'update-target-dirty':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: preflight.matchedReference
          ? t('ai.workspaceExecution.preflightTaskDirty', { target: preflight.matchedReference.name })
          : t('ai.workspaceExecution.preflightBlockedDetail'),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'update-target-ambiguous':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: t('ai.workspaceExecution.preflightTaskAmbiguous', { target: task.target }),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'update-target-low-confidence':
      return {
        label: preflight.status === 'blocked'
          ? t('ai.workspaceExecution.preflightBlocked')
          : t('ai.workspaceExecution.preflightReview'),
        detail: t('ai.workspaceExecution.preflightTaskLowConfidence', { target: task.target }),
        color: preflight.status === 'blocked' ? '#b91c1c' : '#b45309',
        colorMuted: preflight.status === 'blocked' ? '#b91c1c' : 'var(--text-muted)',
        borderColor:
          preflight.status === 'blocked'
            ? 'color-mix(in srgb, #dc2626 28%, var(--border))'
            : 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background:
          preflight.status === 'blocked'
            ? 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))'
            : 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
      }
    case 'update-target-not-found':
      return {
        label: t('ai.workspaceExecution.preflightBlocked'),
        detail: t('ai.workspaceExecution.preflightTaskMissing', { target: task.target }),
        color: '#b91c1c',
        colorMuted: '#b91c1c',
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
      }
    case 'create-target-exists':
      return {
        label: t('ai.workspaceExecution.preflightReview'),
        detail: preflight.matchedReference
          ? t('ai.workspaceExecution.preflightTaskCreateExists', { target: preflight.matchedReference.name })
          : t('ai.workspaceExecution.preflightReviewDetail'),
        color: '#b45309',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
      }
    case 'create-ready':
    default:
      return {
        label: t('ai.workspaceExecution.preflightReady'),
        detail: t('ai.workspaceExecution.preflightTaskCreateReady', { target: task.target }),
        color: '#15803d',
        colorMuted: 'var(--text-muted)',
        borderColor: 'color-mix(in srgb, #16a34a 28%, var(--border))',
        background: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
      }
  }
}

function formatWorkspaceExecutionTimestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}
