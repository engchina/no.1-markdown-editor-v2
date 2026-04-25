import { useTranslation } from 'react-i18next'
import type {
  AIWorkspaceExecutionPhaseGroup,
  AIWorkspaceExecutionPlan,
  AIWorkspaceExecutionPreflight,
  AIWorkspaceExecutionTask,
  AIWorkspaceExecutionTaskPreflight,
  AIWorkspaceExecutionTaskRuntimeState,
} from '../../lib/ai/workspaceExecution.ts'
import {
  formatWorkspaceExecutionCompletionMeta,
  formatWorkspaceExecutionPhaseHeading,
  getWorkspaceExecutionPhaseName,
  getWorkspaceExecutionCompletionSourceTone,
  getWorkspaceExecutionPreflightMeta,
  getWorkspaceExecutionTaskStatusMeta,
  isManualWorkspaceExecutionCompletionSource,
  type WorkspaceAgentSessionState,
  type WorkspaceExecutionPreflightState,
} from './AIWorkspaceExecutionShared'

interface Props {
  execution: AIWorkspaceExecutionPlan | null
  phaseGroups: AIWorkspaceExecutionPhaseGroup[]
  onOpenDraft: (task: AIWorkspaceExecutionTask) => void
  onExecuteTask: (task: AIWorkspaceExecutionTask) => Promise<boolean>
  onSetTargetOverride: (taskId: string, target: string | null) => void
  targetOverrides: Record<string, string | null>
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
  agentSession: WorkspaceAgentSessionState | null
  preflightState: WorkspaceExecutionPreflightState
}

export default function AIWorkspaceExecutionPanel({
  execution,
  phaseGroups,
  onOpenDraft,
  onExecuteTask,
  onSetTargetOverride,
  targetOverrides,
  taskStates,
  agentSession,
  preflightState,
}: Props) {
  const { t } = useTranslation()
  const agentRunning = agentSession?.status === 'running'
  const showPhaseHeaders = phaseGroups.length > 1 || phaseGroups.some((phaseGroup) => phaseGroup.label !== null)
  const currentPhaseIndex = agentSession?.currentTaskId
    ? phaseGroups.findIndex((phaseGroup) =>
        phaseGroup.tasks.some((task) => task.id === agentSession.currentTaskId)
      )
    : -1
  const currentPhase = currentPhaseIndex >= 0 ? phaseGroups[currentPhaseIndex] ?? null : null

  if (!execution) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('ai.result.empty')}</p>
  }

  const blockedTaskCount = preflightState.data?.summary.blocked ?? 0
  const waitingTaskCount = preflightState.data?.summary.waiting ?? 0
  const reviewTaskCount = preflightState.data?.summary.review ?? 0
  const readyTaskCount = preflightState.data?.summary.ready ?? 0
  const completedByAgentCount = Object.values(taskStates).filter(
    (taskState) => taskState.status === 'done' && taskState.completionSource === 'agent'
  ).length
  const completedManuallyCount = Object.values(taskStates).filter(
    (taskState) => taskState.status === 'done' && isManualWorkspaceExecutionCompletionSource(taskState.completionSource)
  ).length

  return (
    <div className="grid gap-4">
      {agentSession && (
        <section
          data-ai-workspace-agent-session="true"
          className="rounded-2xl border px-4 py-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
              {t('ai.workspaceExecution.agentTitle')}
            </div>
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
                color:
                  agentSession.status === 'running'
                    ? 'var(--accent)'
                    : agentSession.status === 'completed'
                      ? '#15803d'
                      : '#b45309',
              }}
            >
              {agentSession.status === 'running'
                ? t('ai.workspaceExecution.agentStatusRunning')
                : agentSession.status === 'completed'
                  ? t('ai.workspaceExecution.agentStatusCompleted')
                  : t('ai.workspaceExecution.agentStatusCanceled')}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricCompleted')} value={String(agentSession.completed)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricCompletedByAgent')} value={String(completedByAgentCount)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricCompletedManual')} value={String(completedManuallyCount)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricFailed')} value={String(agentSession.failed)} />
            <WorkspaceExecutionMetric label={t('ai.workspaceExecution.metricTotal')} value={String(agentSession.total)} />
          </div>

          {currentPhase && currentPhaseIndex >= 0 && (
            <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {t('ai.workspaceExecution.agentCurrentPhase', {
                phase: formatWorkspaceExecutionPhaseHeading(currentPhase, currentPhaseIndex, t),
              })}
            </div>
          )}

          {agentSession.logs.length > 0 && (
            <div className="mt-4 grid gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.workspaceExecution.agentLogTitle')}
              </div>
              {agentSession.logs.map((entry) => (
                <div
                  key={entry.id}
                  data-ai-workspace-agent-log={entry.id}
                  className="rounded-xl border px-3 py-2"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {entry.title}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {entry.status === 'done' && entry.completionSource && (
                        <PeekInlinePill
                          label={t(`ai.workspaceExecution.completionSource.${entry.completionSource}`)}
                          tone={getWorkspaceExecutionCompletionSourceTone(entry.completionSource)}
                        />
                      )}
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                        style={{
                          borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                          background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
                          color:
                            entry.status === 'done'
                              ? '#15803d'
                              : entry.status === 'error'
                                ? '#b91c1c'
                                : '#b45309',
                        }}
                      >
                        {entry.status === 'done'
                          ? t('ai.workspaceExecution.statusDone')
                          : entry.status === 'error'
                            ? t('ai.workspaceExecution.statusError')
                            : t('ai.workspaceExecution.statusCanceled')}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                    {entry.message}
                  </div>
                  {entry.status === 'done' && (entry.completionAt || typeof entry.originRunId === 'number') && (
                    <div className="mt-1 text-[10px] leading-5" style={{ color: 'var(--text-muted)' }}>
                      {formatWorkspaceExecutionCompletionMeta({
                        completionAt: entry.completionAt,
                        originRunId: entry.originRunId,
                        t,
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {execution.summary && (
        <section
          className="rounded-2xl border px-4 py-4"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.workspaceExecution.summary')}
          </div>
          <pre
            className="mt-3 whitespace-pre-wrap break-words text-sm"
            style={{ color: 'var(--text-primary)', fontFamily: 'inherit' }}
          >
            {execution.summary}
          </pre>
        </section>
      )}

      <section
        data-ai-workspace-preflight="true"
        className="rounded-2xl border px-4 py-4"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
            {t('ai.workspaceExecution.preflightTitle')}
          </div>
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 90%, transparent)',
              color:
                preflightState.status === 'loading'
                  ? 'var(--text-primary)'
                  : blockedTaskCount > 0
                    ? '#b91c1c'
                    : waitingTaskCount > 0
                      ? '#2563eb'
                      : reviewTaskCount > 0
                        ? '#b45309'
                        : '#15803d',
            }}
          >
            {preflightState.status === 'loading'
              ? t('ai.workspaceExecution.preflightLoading')
              : blockedTaskCount > 0
                ? t('ai.workspaceExecution.preflightBlocked')
                : waitingTaskCount > 0
                  ? t('ai.workspaceExecution.preflightWaiting')
                  : reviewTaskCount > 0
                    ? t('ai.workspaceExecution.preflightReview')
                    : t('ai.workspaceExecution.preflightReady')}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightReadyCount')} value={String(readyTaskCount)} />
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightWaitingCount')} value={String(waitingTaskCount)} />
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightReviewCount')} value={String(reviewTaskCount)} />
          <WorkspaceExecutionMetric label={t('ai.workspaceExecution.preflightBlockedCount')} value={String(blockedTaskCount)} />
        </div>

        {preflightState.status === 'error' && preflightState.errorMessage && (
          <div className="mt-3 text-[11px] leading-5" style={{ color: '#b91c1c' }}>
            {preflightState.errorMessage}
          </div>
        )}

        {preflightState.status !== 'error' && (
          <div className="mt-3 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
            {blockedTaskCount > 0
              ? t('ai.workspaceExecution.preflightBlockedDetail')
              : waitingTaskCount > 0
                ? t('ai.workspaceExecution.preflightWaitingDetail')
                : reviewTaskCount > 0
                  ? t('ai.workspaceExecution.preflightReviewDetail')
                  : t('ai.workspaceExecution.preflightReadyDetail')}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          {t('ai.workspaceExecution.tasksTitle')}
        </div>
        {phaseGroups.map((phaseGroup, phaseIndex) => (
          <AIWorkspaceExecutionPhaseSection
            key={phaseGroup.id}
            phaseGroup={phaseGroup}
            phaseIndex={phaseIndex}
            showHeader={showPhaseHeaders}
            isCurrentPhase={currentPhaseIndex === phaseIndex}
            taskStates={taskStates}
            preflightState={preflightState}
            agentRunning={agentRunning}
            onExecuteTask={onExecuteTask}
            onOpenDraft={onOpenDraft}
            onSetTargetOverride={onSetTargetOverride}
            targetOverrides={targetOverrides}
          />
        ))}
      </section>
    </div>
  )
}

function AIWorkspaceExecutionPhaseSection({
  phaseGroup,
  phaseIndex,
  showHeader,
  isCurrentPhase,
  taskStates,
  preflightState,
  agentRunning,
  onExecuteTask,
  onOpenDraft,
  onSetTargetOverride,
  targetOverrides,
}: {
  phaseGroup: AIWorkspaceExecutionPhaseGroup
  phaseIndex: number
  showHeader: boolean
  isCurrentPhase: boolean
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
  preflightState: WorkspaceExecutionPreflightState
  agentRunning: boolean
  onExecuteTask: (task: AIWorkspaceExecutionTask) => Promise<boolean>
  onOpenDraft: (task: AIWorkspaceExecutionTask) => void
  onSetTargetOverride: (taskId: string, target: string | null) => void
  targetOverrides: Record<string, string | null>
}) {
  const { t } = useTranslation()
  const phaseSummary = buildWorkspaceExecutionPhaseSummary({
    phaseGroup,
    taskStates,
    preflight: preflightState.data,
  })

  return (
    <section data-ai-workspace-phase={phaseGroup.id} className="grid gap-3">
      {showHeader && (
        <div
          data-ai-workspace-phase-summary={phaseGroup.id}
          className="rounded-2xl border px-4 py-4"
          style={{
            borderColor: isCurrentPhase
              ? 'color-mix(in srgb, var(--accent) 28%, var(--border))'
              : 'color-mix(in srgb, var(--border) 82%, transparent)',
            background: isCurrentPhase
              ? 'color-mix(in srgb, var(--accent) 7%, var(--bg-secondary))'
              : 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                {t('ai.workspaceExecution.phaseLabel', { index: phaseIndex + 1 })}
              </div>
              <div className="mt-1 break-words text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {getWorkspaceExecutionPhaseName(phaseGroup.label, t)}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {isCurrentPhase && <PeekInlinePill label={t('ai.workspaceExecution.phaseCurrent')} tone="accent" />}
              <PeekInlinePill label={`${phaseSummary.total} ${t('ai.workspaceExecution.phaseTasks')}`} />
              {phaseSummary.done > 0 && (
                <PeekInlinePill label={`${phaseSummary.done} ${t('ai.workspaceExecution.phaseDone')}`} tone="success" />
              )}
              {phaseSummary.waiting > 0 && (
                <PeekInlinePill label={`${phaseSummary.waiting} ${t('ai.workspaceExecution.phaseWaiting')}`} tone="info" />
              )}
              {phaseSummary.running > 0 && (
                <PeekInlinePill label={`${phaseSummary.running} ${t('ai.workspaceExecution.phaseRunning')}`} tone="accent" />
              )}
              {phaseSummary.review > 0 && (
                <PeekInlinePill label={`${phaseSummary.review} ${t('ai.workspaceExecution.phaseReview')}`} tone="warning" />
              )}
              {phaseSummary.blocked > 0 && (
                <PeekInlinePill label={`${phaseSummary.blocked} ${t('ai.workspaceExecution.phaseBlocked')}`} tone="danger" />
              )}
            </div>
          </div>
        </div>
      )}

      {phaseGroup.tasks.map((task) => (
        <AIWorkspaceExecutionTaskCard
          key={task.id}
          task={task}
          taskState={taskStates[task.id]}
          preflight={preflightState.data?.tasks[task.id] ?? null}
          preflightLoading={preflightState.status === 'loading'}
          agentRunning={agentRunning}
          onExecuteTask={onExecuteTask}
          onOpenDraft={onOpenDraft}
          onSetTargetOverride={onSetTargetOverride}
          targetOverride={targetOverrides[task.id] ?? null}
        />
      ))}
    </section>
  )
}

function AIWorkspaceExecutionTaskCard({
  task,
  taskState,
  preflight,
  preflightLoading,
  agentRunning,
  onExecuteTask,
  onOpenDraft,
  onSetTargetOverride,
  targetOverride,
}: {
  task: AIWorkspaceExecutionTask
  taskState: AIWorkspaceExecutionTaskRuntimeState | undefined
  preflight: AIWorkspaceExecutionTaskPreflight | null
  preflightLoading: boolean
  agentRunning: boolean
  onExecuteTask: (task: AIWorkspaceExecutionTask) => Promise<boolean>
  onOpenDraft: (task: AIWorkspaceExecutionTask) => void
  onSetTargetOverride: (taskId: string, target: string | null) => void
  targetOverride: string | null
}) {
  const { t } = useTranslation()
  const effectiveTaskStatus =
    taskState?.status ??
    (preflight?.status === 'waiting' ? 'waiting' : 'idle')
  const statusMeta = getWorkspaceExecutionTaskStatusMeta(effectiveTaskStatus, t)
  const preflightMeta = getWorkspaceExecutionPreflightMeta(preflight, preflightLoading, task, t)
  const executeBlocked =
    preflight?.status === 'blocked' ||
    preflight?.status === 'waiting'

  return (
    <article
      data-ai-workspace-task={task.id}
      className="rounded-2xl border px-4 py-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
              background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
              color: statusMeta.color,
            }}
          >
            {statusMeta.label}
          </span>
          <span
            data-ai-workspace-task-preflight={task.id}
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              borderColor: preflightMeta.borderColor,
              background: preflightMeta.background,
              color: preflightMeta.color,
            }}
          >
            {preflightMeta.label}
          </span>
          {effectiveTaskStatus === 'done' && taskState?.completionSource && (
            <PeekInlinePill
              label={t(`ai.workspaceExecution.completionSource.${taskState.completionSource}`)}
              tone={getWorkspaceExecutionCompletionSourceTone(taskState.completionSource)}
            />
          )}
        </div>
        {taskState?.message && (
          <span className="max-w-[50%] truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {taskState.message}
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {task.title}
          </div>
          <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
            {task.target}
          </div>
          <div className="mt-2 text-[11px] leading-5" style={{ color: preflightMeta.colorMuted }}>
            {preflightMeta.detail}
          </div>
          {effectiveTaskStatus === 'done' && (taskState?.completionAt || typeof taskState?.originRunId === 'number') && (
            <div className="mt-1 text-[10px] leading-5" style={{ color: 'var(--text-muted)' }}>
              {formatWorkspaceExecutionCompletionMeta({
                completionAt: taskState?.completionAt,
                originRunId: taskState?.originRunId,
                t,
              })}
            </div>
          )}
          {preflight && preflight.dependencyTaskTitles.length > 0 && (
            <div
              data-ai-workspace-task-dependencies={task.id}
              className="mt-2 flex flex-wrap gap-2"
            >
              {preflight.dependencyTaskTitles.map((dependencyTitle) => (
                <PeekInlinePill key={`${task.id}:${dependencyTitle}`} label={dependencyTitle} />
              ))}
            </div>
          )}
          {preflight && preflight.unresolvedDependencies.length > 0 && (
            <div
              data-ai-workspace-task-unresolved-dependencies={task.id}
              className="mt-2 text-[11px] leading-5"
              style={{ color: '#b91c1c' }}
            >
              {t('ai.workspaceExecution.preflightDependencyUnresolved', {
                dependencies: preflight.unresolvedDependencies.join(', '),
              })}
            </div>
          )}
        </div>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{
            borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
            background: 'color-mix(in srgb, var(--bg-secondary) 76%, transparent)',
            color: 'var(--text-muted)',
          }}
        >
          {task.action === 'create-note'
            ? t('ai.workspaceExecution.actionCreate')
            : t('ai.workspaceExecution.actionUpdate')}
        </span>
      </div>

      <pre
        className="mt-3 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-3 text-xs"
        style={{
          borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)',
          background: 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        }}
      >
        {task.content}
      </pre>

      {task.action === 'update-note' &&
        preflight &&
        (targetOverride !== null ||
          preflight.reason === 'update-target-ambiguous' ||
          preflight.reason === 'update-target-low-confidence') &&
        preflight.alternatives.length > 0 && (
          <div
            data-ai-workspace-task-target-resolution={task.id}
            className="mt-3 rounded-xl border px-3 py-3"
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
              background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.workspaceExecution.resolveTargetTitle')}
                </div>
                <div className="mt-1 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                  {t('ai.workspaceExecution.resolveTargetDetail')}
                </div>
              </div>
              {targetOverride && (
                <button
                  type="button"
                  data-ai-workspace-task-target-clear={task.id}
                  onClick={() => onSetTargetOverride(task.id, null)}
                  className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
                    background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {t('ai.workspaceExecution.resolveTargetClear')}
                </button>
              )}
            </div>

            {targetOverride && (
              <div className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-muted)' }}>
                {t('ai.workspaceExecution.resolveTargetUsing', { target: targetOverride })}
              </div>
            )}

            <div className="mt-3 grid gap-2">
              {preflight.alternatives.map((candidate) => {
                const candidateKey = candidate.path ?? candidate.name
                const selected = targetOverride === candidateKey
                return (
                  <button
                    key={`${task.id}:${candidateKey}`}
                    type="button"
                    data-ai-workspace-task-target-option={candidateKey}
                    onClick={() => onSetTargetOverride(task.id, candidateKey)}
                    className="cursor-pointer rounded-xl border px-3 py-3 text-left transition-colors"
                    style={{
                      borderColor: selected
                        ? 'color-mix(in srgb, var(--accent) 24%, var(--border))'
                        : 'color-mix(in srgb, var(--border) 76%, transparent)',
                      background: selected
                        ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))'
                        : 'color-mix(in srgb, var(--bg-secondary) 70%, transparent)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {candidate.name}
                        </div>
                        <div className="mt-1 break-words text-[11px] leading-4" style={{ color: 'var(--text-muted)' }}>
                          {candidate.path ?? candidate.name}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <PeekInlinePill label={t(`ai.workspaceExecution.targetConfidence.${candidate.confidence}`)} />
                        <PeekInlinePill label={t(`ai.workspaceExecution.targetSource.${candidate.source}`)} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      <div className="mt-3 flex flex-wrap gap-2">
        {task.action === 'update-note' && (
          <button
            type="button"
            onClick={() => void onExecuteTask(task)}
            data-ai-workspace-task-execute={task.id}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
            disabled={agentRunning || preflightLoading || executeBlocked}
          >
            {t('ai.workspaceExecution.executeTask')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenDraft(task)}
          data-ai-workspace-task-open={task.id}
          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            background: 'var(--accent)',
            color: 'white',
          }}
          disabled={agentRunning}
        >
          {t('ai.workspaceExecution.openDraft')}
        </button>
      </div>
    </article>
  )
}

function buildWorkspaceExecutionPhaseSummary(args: {
  phaseGroup: AIWorkspaceExecutionPhaseGroup
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
  preflight: AIWorkspaceExecutionPreflight | null
}) {
  let done = 0
  let waiting = 0
  let running = 0
  let review = 0
  let blocked = 0

  for (const task of args.phaseGroup.tasks) {
    const taskState = args.taskStates[task.id]?.status ?? 'idle'
    if (taskState === 'done') {
      done += 1
      continue
    }

    if (taskState === 'waiting') {
      waiting += 1
      continue
    }

    if (taskState === 'running') {
      running += 1
      continue
    }

    if (taskState === 'error' || taskState === 'canceled') {
      blocked += 1
      continue
    }

    const preflightStatus = args.preflight?.tasks[task.id]?.status
    if (preflightStatus === 'blocked') {
      blocked += 1
      continue
    }

    if (preflightStatus === 'waiting') {
      waiting += 1
      continue
    }

    if (preflightStatus === 'review') {
      review += 1
    }
  }

  return {
    total: args.phaseGroup.tasks.length,
    done,
    waiting,
    running,
    review,
    blocked,
  }
}

function WorkspaceExecutionMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      className="rounded-xl border px-3 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 76%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function PeekInlinePill({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const palette = getPeekInlinePillPalette(tone)

  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        borderColor: palette.borderColor,
        background: palette.background,
        color: palette.color,
      }}
    >
      {label}
    </span>
  )
}

function getPeekInlinePillPalette(tone: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info') {
  switch (tone) {
    case 'accent':
      return {
        borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-primary))',
        color: 'var(--accent)',
      }
    case 'info':
      return {
        borderColor: 'color-mix(in srgb, #2563eb 28%, var(--border))',
        background: 'color-mix(in srgb, #2563eb 10%, var(--bg-primary))',
        color: '#2563eb',
      }
    case 'success':
      return {
        borderColor: 'color-mix(in srgb, #16a34a 28%, var(--border))',
        background: 'color-mix(in srgb, #16a34a 10%, var(--bg-primary))',
        color: '#15803d',
      }
    case 'warning':
      return {
        borderColor: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
        background: 'color-mix(in srgb, #f59e0b 10%, var(--bg-primary))',
        color: '#b45309',
      }
    case 'danger':
      return {
        borderColor: 'color-mix(in srgb, #dc2626 28%, var(--border))',
        background: 'color-mix(in srgb, #dc2626 8%, var(--bg-primary))',
        color: '#b91c1c',
      }
    case 'default':
    default:
      return {
        borderColor: 'color-mix(in srgb, var(--border) 72%, transparent)',
        background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)',
        color: 'var(--text-muted)',
      }
  }
}
