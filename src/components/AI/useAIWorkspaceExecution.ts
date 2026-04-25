import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAIStore } from '../../store/ai'
import { useEditorStore } from '../../store/editor'
import { useFileTreeStore } from '../../store/fileTree'
import {
  buildAIWorkspaceExecutionAgentResumeState,
  buildAIWorkspaceExecutionHistoryRecord,
  buildAIWorkspaceExecutionPreflight,
  buildAIWorkspaceDraftTabName,
  groupAIWorkspaceExecutionTasksByPhase,
  parseAIWorkspaceExecutionPlan,
  type AIWorkspaceExecutionPreflight,
  type AIWorkspaceExecutionPlan,
  type AIWorkspaceExecutionProducedDraft,
  type AIWorkspaceExecutionTask,
  type AIWorkspaceExecutionTaskPreflight,
  type AIWorkspaceExecutionTaskRuntimeState,
} from '../../lib/ai/workspaceExecution.ts'
import { findWorkspaceDocumentReferences } from '../../lib/workspaceSearch.ts'
import { pushErrorNotice, pushInfoNotice, pushSuccessNotice } from '../../lib/notices'
import { primeAIUndoHistorySnapshot } from '../../lib/editorStateCache.ts'
import { createAIProvenanceMark } from '../../lib/ai/provenance.ts'
import { openDesktopDocumentPath } from '../../lib/desktopFileOpen.ts'
import {
  buildWorkspaceExecutionPhaseStalledMessage,
  buildWorkspaceExecutionResumedLogMessage,
  formatWorkspaceExecutionPhaseHeading,
  formatWorkspacePreflightMessage,
  type WorkspaceAgentSessionLogEntry,
  type WorkspaceAgentSessionState,
  type WorkspaceExecutionPreflightState,
  type WorkspaceExecutionTaskStatus,
} from './AIWorkspaceExecutionShared'

interface WorkspaceHistoryBinding {
  tabId: string
  tabPath: string | null
  entryId: string
}

interface WorkspaceTaskRunResult {
  success: boolean
  canceled?: boolean
  message: string
}

interface UseAIWorkspaceExecutionArgs {
  normalizedDraft: string
  t: (key: string, values?: Record<string, string | number>) => string
}

interface UseAIWorkspaceExecutionResult {
  workspaceExecution: AIWorkspaceExecutionPlan | null
  workspaceExecutionPhaseGroups: ReturnType<typeof groupAIWorkspaceExecutionTasksByPhase>
  hasWorkspaceExecutionTasks: boolean
  workspaceExecutionStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
  workspaceTaskTargetOverrides: Record<string, string | null>
  workspacePreflight: WorkspaceExecutionPreflightState
  workspaceAgentSession: WorkspaceAgentSessionState | null
  canRunWorkspaceAgent: boolean
  clearWorkspaceHistoryBinding: () => void
  bindWorkspaceHistoryForDraft: (binding: WorkspaceHistoryBinding, draftText: string) => void
  handleOpenWorkspaceTaskDraft: (task: AIWorkspaceExecutionTask) => { tabId: string; name: string }
  openAllWorkspaceTaskDrafts: () => void
  setWorkspaceTaskTargetOverride: (taskId: string, target: string | null) => void
  executeWorkspaceTask: (task: AIWorkspaceExecutionTask) => Promise<boolean>
  cancelWorkspaceAgentRun: () => void
  runWorkspaceAgent: () => Promise<void>
}

export function useAIWorkspaceExecution({
  normalizedDraft,
  t,
}: UseAIWorkspaceExecutionArgs): UseAIWorkspaceExecutionResult {
  const openTabs = useEditorStore((state) => state.tabs)
  const addTab = useEditorStore((state) => state.addTab)
  const rootPath = useFileTreeStore((state) => state.rootPath)
  const setProvenanceMarks = useAIStore((state) => state.setProvenanceMarks)
  const updateSessionHistory = useAIStore((state) => state.updateSessionHistory)

  const [workspaceExecutionStates, setWorkspaceExecutionStates] = useState<Record<string, AIWorkspaceExecutionTaskRuntimeState>>({})
  const [workspaceProducedDrafts, setWorkspaceProducedDrafts] = useState<Record<string, AIWorkspaceExecutionProducedDraft>>({})
  const [workspaceTaskTargetOverrides, setWorkspaceTaskTargetOverrides] = useState<Record<string, string | null>>({})
  const [workspaceHistoryBinding, setWorkspaceHistoryBindingState] = useState<WorkspaceHistoryBinding | null>(null)
  const [workspacePreflight, setWorkspacePreflight] = useState<WorkspaceExecutionPreflightState>({
    status: 'idle',
    data: null,
    errorMessage: null,
  })
  const [workspaceAgentSession, setWorkspaceAgentSession] = useState<WorkspaceAgentSessionState | null>(null)
  const workspaceAgentRunIdRef = useRef(0)
  const workspacePreflightRequestIdRef = useRef(0)
  const workspaceProducedDraftsRef = useRef<Record<string, AIWorkspaceExecutionProducedDraft>>({})

  const workspaceExecution = useMemo(
    () => parseAIWorkspaceExecutionPlan(normalizedDraft),
    [normalizedDraft]
  )
  const workspaceExecutionPhaseGroups = useMemo(
    () => (workspaceExecution ? groupAIWorkspaceExecutionTasksByPhase(workspaceExecution.tasks) : []),
    [workspaceExecution]
  )
  const hasWorkspaceExecutionTasks = (workspaceExecution?.tasks.length ?? 0) > 0
  const completedWorkspaceTaskIds = useMemo(
    () =>
      Object.entries(workspaceExecutionStates)
        .filter(([, state]) => state.status === 'done')
        .map(([taskId]) => taskId),
    [workspaceExecutionStates]
  )

  const canRunWorkspaceAgent =
    hasWorkspaceExecutionTasks &&
    workspaceAgentSession?.status !== 'running' &&
    workspacePreflight.status !== 'loading' &&
    canStartWorkspaceAgent({
      phaseGroups: workspaceExecutionPhaseGroups,
      preflight: workspacePreflight.data,
      taskStates: workspaceExecutionStates,
    })

  useEffect(() => {
    setWorkspaceExecutionStates({})
    workspaceProducedDraftsRef.current = {}
    setWorkspaceProducedDrafts({})
    setWorkspaceTaskTargetOverrides({})
    setWorkspaceAgentSession(null)
    if (!workspaceExecution) {
      setWorkspaceHistoryBindingState(null)
    }
    workspaceAgentRunIdRef.current += 1
  }, [normalizedDraft, workspaceExecution])

  useEffect(() => {
    const requestId = workspacePreflightRequestIdRef.current + 1
    workspacePreflightRequestIdRef.current = requestId

    if (!workspaceExecution) {
      setWorkspacePreflight({
        status: 'idle',
        data: null,
        errorMessage: null,
      })
      return
    }

    setWorkspacePreflight((current) => ({
      status: 'loading',
      data: current.data,
      errorMessage: null,
    }))

    void buildAIWorkspaceExecutionPreflight({
      tasks: workspaceExecution.tasks,
      tabs: useEditorStore.getState().tabs,
      rootPath,
      targetOverrides: workspaceTaskTargetOverrides,
      completedTaskIds: completedWorkspaceTaskIds,
      producedDrafts: workspaceProducedDrafts,
    })
      .then((data) => {
        if (workspacePreflightRequestIdRef.current !== requestId) return
        setWorkspacePreflight({
          status: 'ready',
          data,
          errorMessage: null,
        })
      })
      .catch((error) => {
        if (workspacePreflightRequestIdRef.current !== requestId) return
        setWorkspacePreflight((current) => ({
          status: 'error',
          data: current.data,
          errorMessage: error instanceof Error ? error.message : String(error),
        }))
      })
  }, [completedWorkspaceTaskIds, openTabs, rootPath, workspaceExecution, workspaceProducedDrafts, workspaceTaskTargetOverrides])

  useEffect(() => {
    if (!workspaceExecution || !workspaceHistoryBinding) return

    updateSessionHistory(
      workspaceHistoryBinding.tabId,
      workspaceHistoryBinding.tabPath,
      workspaceHistoryBinding.entryId,
      {
        workspaceExecution: buildAIWorkspaceExecutionHistoryRecord({
          execution: workspaceExecution,
          taskStates: workspaceExecutionStates,
        }),
        updatedAt: Date.now(),
      }
    )
  }, [updateSessionHistory, workspaceExecution, workspaceExecutionStates, workspaceHistoryBinding])

  const clearWorkspaceHistoryBinding = useCallback(() => {
    setWorkspaceHistoryBindingState(null)
  }, [])

  const bindWorkspaceHistoryForDraft = useCallback((binding: WorkspaceHistoryBinding, draftText: string) => {
    setWorkspaceHistoryBindingState(parseAIWorkspaceExecutionPlan(draftText) ? binding : null)
  }, [])

  const setWorkspaceProducedDraft = useCallback((taskId: string, draft: AIWorkspaceExecutionProducedDraft) => {
    workspaceProducedDraftsRef.current = {
      ...workspaceProducedDraftsRef.current,
      [taskId]: draft,
    }
    setWorkspaceProducedDrafts(workspaceProducedDraftsRef.current)
  }, [])

  const openWorkspaceTaskDraft = useCallback((task: AIWorkspaceExecutionTask): { tabId: string; name: string } => {
    const draftName = buildAIWorkspaceDraftTabName(task)
    const tabId = addTab({
      name: draftName,
      content: task.content,
      savedContent: '',
      isDirty: true,
    })
    primeAIUndoHistorySnapshot({
      tabId,
      beforeContent: '',
      afterContent: task.content,
    })

    setProvenanceMarks(tabId, [
      createAIProvenanceMark({
        from: 0,
        to: task.content.length,
        badge: t('ai.provenance.badge'),
        detail: t('ai.provenance.workspaceTaskDetail'),
        kind: 'new-note',
      }),
    ])

    if (task.action === 'create-note') {
      setWorkspaceProducedDraft(task.id, {
        tabId,
        content: task.content,
      })
    }

    return { tabId, name: draftName }
  }, [addTab, setProvenanceMarks, setWorkspaceProducedDraft, t])

  const handleOpenWorkspaceTaskDraft = useCallback((task: AIWorkspaceExecutionTask) => {
    const openedDraft = openWorkspaceTaskDraft(task)
    if (task.action === 'create-note') {
      setWorkspaceExecutionStates((state) => ({
        ...state,
        [task.id]: {
          status: 'done',
          message: t('ai.workspaceExecution.taskDraftOpened', { target: openedDraft.name }),
          completionSource: 'manual-open-draft',
          completionAt: Date.now(),
          originRunId: null,
        },
      }))
    }
    return openedDraft
  }, [openWorkspaceTaskDraft, t])

  const openAllWorkspaceTaskDrafts = useCallback(() => {
    if (!workspaceExecution || workspaceAgentSession?.status === 'running') return
    for (const task of workspaceExecution.tasks) {
      handleOpenWorkspaceTaskDraft(task)
    }
  }, [handleOpenWorkspaceTaskDraft, workspaceAgentSession?.status, workspaceExecution])

  const setWorkspaceTaskTargetOverride = useCallback((taskId: string, target: string | null) => {
    setWorkspaceTaskTargetOverrides((current) => {
      const normalizedTarget = target?.trim() ?? null
      if (!normalizedTarget) {
        if (!(taskId in current)) return current
        const next = { ...current }
        delete next[taskId]
        return next
      }

      if (current[taskId] === normalizedTarget) return current
      return {
        ...current,
        [taskId]: normalizedTarget,
      }
    })
  }, [])

  const runWorkspaceTask = useCallback(async (
    task: AIWorkspaceExecutionTask,
    options: {
      suppressNotices?: boolean
      runId?: number
      preflight?: AIWorkspaceExecutionTaskPreflight | null
    } = {}
  ): Promise<WorkspaceTaskRunResult> => {
    const isCanceled = () =>
      typeof options.runId === 'number' && workspaceAgentRunIdRef.current !== options.runId

    if (isCanceled()) {
      return {
        success: false,
        canceled: true,
        message: t('ai.workspaceExecution.agentCanceled'),
      }
    }

    if (task.action === 'create-note') {
      const openedDraft = openWorkspaceTaskDraft(task)
      return {
        success: true,
        message: t('ai.workspaceExecution.taskDraftOpened', { target: openedDraft.name }),
      }
    }

    const directProducedDraft =
      options.preflight?.upstreamTaskId &&
      options.preflight.matchedReference?.tabId &&
      workspaceProducedDraftsRef.current[options.preflight.upstreamTaskId]?.tabId === options.preflight.matchedReference.tabId
        ? {
            upstreamTaskId: options.preflight.upstreamTaskId,
            tabId: options.preflight.matchedReference.tabId,
            content: workspaceProducedDraftsRef.current[options.preflight.upstreamTaskId]?.content ?? '',
          }
        : null
    const directDraftTab = directProducedDraft
      ? useEditorStore
          .getState()
          .tabs.find(
            (tab) =>
              tab.id === directProducedDraft.tabId &&
              tab.content === directProducedDraft.content
          ) ?? null
      : null

    if (directProducedDraft && directDraftTab) {
      primeAIUndoHistorySnapshot({
        tabId: directDraftTab.id,
        beforeContent: directDraftTab.content,
        afterContent: task.content,
      })
      useEditorStore.getState().updateTabContent(directDraftTab.id, task.content)
      setProvenanceMarks(directDraftTab.id, [
        createAIProvenanceMark({
          from: 0,
          to: task.content.length,
          badge: t('ai.provenance.badge'),
          detail: t('ai.provenance.workspaceTaskDetail'),
          kind: 'apply',
        }),
      ])
      setWorkspaceProducedDraft(directProducedDraft.upstreamTaskId, {
        tabId: directDraftTab.id,
        content: task.content,
      })

      const message = t('ai.workspaceExecution.taskApplied', { target: directDraftTab.name })
      if (!options.suppressNotices) {
        pushSuccessNotice('notices.aiWorkspaceTaskAppliedTitle', 'notices.aiWorkspaceTaskAppliedMessage', {
          values: { target: directDraftTab.name },
        })
      }

      return { success: true, message }
    }

    const resolvedTarget = workspaceTaskTargetOverrides[task.id]?.trim() || task.target
    const references = await findWorkspaceDocumentReferences({
      query: resolvedTarget,
      tabs: useEditorStore.getState().tabs,
      rootPath,
      limit: 1,
    })
    if (isCanceled()) {
      return {
        success: false,
        canceled: true,
        message: t('ai.workspaceExecution.agentCanceled'),
      }
    }
    const reference = references[0]

    if (!reference) {
      const message = t('ai.workspaceExecution.targetNotFound', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushErrorNotice('notices.aiWorkspaceTaskErrorTitle', 'notices.aiWorkspaceTaskErrorMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    if (reference.ambiguous) {
      const message = t('ai.workspaceExecution.targetAmbiguous', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushInfoNotice('notices.aiWorkspaceTaskBlockedTitle', 'notices.aiWorkspaceTaskBlockedMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    if (reference.confidence === 'low') {
      const message = t('ai.workspaceExecution.targetLowConfidence', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushInfoNotice('notices.aiWorkspaceTaskBlockedTitle', 'notices.aiWorkspaceTaskBlockedMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    let tabId = reference.tabId
    if (!tabId && reference.path) {
      const opened = await openDesktopDocumentPath(reference.path)
      if (isCanceled()) {
        return {
          success: false,
          canceled: true,
          message: t('ai.workspaceExecution.agentCanceled'),
        }
      }
      if (!opened) {
        const message = t('ai.workspaceExecution.targetOpenFailed', { target: reference.path })
        if (!options.suppressNotices) {
          pushErrorNotice('notices.aiWorkspaceTaskErrorTitle', 'notices.aiWorkspaceTaskErrorMessage', {
            values: { reason: message },
          })
        }
        return { success: false, message }
      }

      tabId = useEditorStore.getState().tabs.find((tab) => tab.path === reference.path)?.id ?? null
    }

    const targetTab = useEditorStore.getState().tabs.find((tab) => tab.id === tabId)
    if (!targetTab) {
      const message = t('ai.workspaceExecution.targetNotFound', { target: resolvedTarget })
      if (!options.suppressNotices) {
        pushErrorNotice('notices.aiWorkspaceTaskErrorTitle', 'notices.aiWorkspaceTaskErrorMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    if (targetTab.isDirty) {
      const message = t('ai.workspaceExecution.targetDirty', { target: targetTab.name })
      if (!options.suppressNotices) {
        pushInfoNotice('notices.aiWorkspaceTaskBlockedTitle', 'notices.aiWorkspaceTaskBlockedMessage', {
          values: { reason: message },
        })
      }
      return { success: false, message }
    }

    primeAIUndoHistorySnapshot({
      tabId: targetTab.id,
      beforeContent: targetTab.content,
      afterContent: task.content,
    })
    useEditorStore.getState().updateTabContent(targetTab.id, task.content)
    setProvenanceMarks(targetTab.id, [
      createAIProvenanceMark({
        from: 0,
        to: task.content.length,
        badge: t('ai.provenance.badge'),
        detail: t('ai.provenance.workspaceTaskDetail'),
        kind: 'apply',
      }),
    ])

    const message = t('ai.workspaceExecution.taskApplied', { target: targetTab.name })
    if (!options.suppressNotices) {
      pushSuccessNotice('notices.aiWorkspaceTaskAppliedTitle', 'notices.aiWorkspaceTaskAppliedMessage', {
        values: { target: targetTab.name },
      })
    }

    return { success: true, message }
  }, [openWorkspaceTaskDraft, rootPath, setProvenanceMarks, setWorkspaceProducedDraft, t, workspaceTaskTargetOverrides])

  const executeWorkspaceTask = useCallback(async (task: AIWorkspaceExecutionTask): Promise<boolean> => {
    if (workspaceAgentSession?.status === 'running') return false
    const preflightEntry = workspacePreflight.data?.tasks[task.id]
    if (preflightEntry?.status === 'blocked' || preflightEntry?.status === 'waiting') {
      const message = formatWorkspacePreflightMessage(preflightEntry, task, t)
      setWorkspaceExecutionStates((state) => ({
        ...state,
        [task.id]: {
          status: preflightEntry.status === 'waiting' ? 'waiting' : 'error',
          message,
        },
      }))
      return false
    }

    setWorkspaceExecutionStates((state) => ({
      ...state,
      [task.id]: { status: 'running' },
    }))

    const result = await runWorkspaceTask(task, { preflight: preflightEntry })
    if (result.canceled) return false

    setWorkspaceExecutionStates((state) => ({
      ...state,
      [task.id]: {
        status: result.success ? 'done' : 'error',
        message: result.message,
        completionSource: result.success ? 'manual-apply' : undefined,
        completionAt: result.success ? Date.now() : undefined,
        originRunId: result.success ? null : undefined,
      },
    }))
    return result.success
  }, [runWorkspaceTask, t, workspaceAgentSession?.status, workspacePreflight.data])

  const cancelWorkspaceAgentRun = useCallback(() => {
    const currentTaskId = workspaceAgentSession?.currentTaskId ?? null
    const currentTask = currentTaskId
      ? workspaceExecution?.tasks.find((task) => task.id === currentTaskId) ?? null
      : null
    const canceledMessage = t('ai.workspaceExecution.agentCanceled')

    workspaceAgentRunIdRef.current += 1
    if (currentTaskId) {
      setWorkspaceExecutionStates((state) => ({
        ...state,
        [currentTaskId]: {
          status: 'canceled',
          message: canceledMessage,
        },
      }))
    }
    setWorkspaceAgentSession((session) =>
      session
        ? {
            ...session,
            status: 'canceled',
            currentTaskId: null,
            logs:
              currentTask && session.currentTaskId === currentTask.id
                ? [
                    ...session.logs,
                    {
                      id: `${currentTask.id}:canceled:${session.logs.length}`,
                      taskId: currentTask.id,
                      title: currentTask.title,
                      status: 'canceled',
                      message: canceledMessage,
                    },
                  ]
                : session.logs,
          }
        : null
    )
    pushInfoNotice('notices.aiWorkspaceAgentCanceledTitle', 'notices.aiWorkspaceAgentCanceledMessage')
  }, [t, workspaceAgentSession, workspaceExecution])

  const runWorkspaceAgent = useCallback(async () => {
    if (!workspaceExecution || workspaceAgentSession?.status === 'running') return
    const phaseGroups = groupAIWorkspaceExecutionTasksByPhase(workspaceExecution.tasks)
    if (
      workspacePreflight.status === 'loading' ||
      !canStartWorkspaceAgent({
        phaseGroups,
        preflight: workspacePreflight.data,
        taskStates: workspaceExecutionStates,
      })
    ) {
      return
    }

    const runId = workspaceAgentRunIdRef.current + 1
    workspaceAgentRunIdRef.current = runId
    const resumeState = buildAIWorkspaceExecutionAgentResumeState({
      tasks: workspaceExecution.tasks,
      taskStates: workspaceExecutionStates,
    })
    const resumedLogs: WorkspaceAgentSessionLogEntry[] = resumeState.completedTaskIds.flatMap((taskId, index) => {
      const task = workspaceExecution.tasks.find((item) => item.id === taskId)
      if (!task) return []

      const completionSource = resumeState.taskStates[taskId]?.completionSource
      const completionAt = resumeState.taskStates[taskId]?.completionAt
      const originRunId = resumeState.taskStates[taskId]?.originRunId
      return [{
        id: `${task.id}:resumed:${index}`,
        taskId: task.id,
        title: task.title,
        status: 'done',
        message: buildWorkspaceExecutionResumedLogMessage(completionSource, originRunId, t),
        completionSource,
        completionAt,
        originRunId,
      }]
    })
    setWorkspaceExecutionStates(resumeState.taskStates)
    setWorkspaceAgentSession({
      status: 'running',
      total: workspaceExecution.tasks.length,
      completed: resumeState.completedTaskIds.length,
      failed: 0,
      currentTaskId: null,
      logs: resumedLogs,
    })

    let appliedCount = resumeState.completedTaskIds.length
    let failedCount = 0
    const logs: WorkspaceAgentSessionLogEntry[] = [...resumedLogs]
    const completedTaskIds = new Set<string>(resumeState.completedTaskIds)
    const queuedPhaseGroups = phaseGroups.map((phaseGroup) => ({
      ...phaseGroup,
      tasks: [...phaseGroup.tasks],
    }))

    phaseLoop: for (let phaseIndex = 0; phaseIndex < queuedPhaseGroups.length; phaseIndex += 1) {
      const phaseGroup = queuedPhaseGroups[phaseIndex]
      if (!phaseGroup) continue

      while (phaseGroup.tasks.length > 0) {
        if (workspaceAgentRunIdRef.current !== runId) return
        const iterationPreflight = await buildAIWorkspaceExecutionPreflight({
          tasks: workspaceExecution.tasks,
          tabs: useEditorStore.getState().tabs,
          rootPath,
          targetOverrides: workspaceTaskTargetOverrides,
          completedTaskIds: [...completedTaskIds],
          producedDrafts: workspaceProducedDraftsRef.current,
        })
        if (workspaceAgentRunIdRef.current !== runId) return

        const waitingStateUpdates = Object.fromEntries(
          phaseGroup.tasks
            .map((task) => {
              const meta = iterationPreflight.tasks[task.id]
              if (!meta) return null
              if (meta.status === 'waiting') {
                return [
                  task.id,
                  {
                    status: 'waiting' as WorkspaceExecutionTaskStatus,
                    message: formatWorkspacePreflightMessage(meta, task, t),
                  },
                ] as const
              }

              return [task.id, { status: 'idle' as WorkspaceExecutionTaskStatus }] as const
            })
            .filter((entry): entry is [string, AIWorkspaceExecutionTaskRuntimeState] => entry !== null)
        )
        setWorkspaceExecutionStates((state) => {
          let changed = false
          const nextState = { ...state }

          for (const [taskId, update] of Object.entries(waitingStateUpdates)) {
            const current = nextState[taskId]
            if (current?.status === 'done' || current?.status === 'running' || current?.status === 'error' || current?.status === 'canceled') {
              continue
            }

            const nextMessage = update.message
            if (current?.status === update.status && current?.message === nextMessage) continue
            nextState[taskId] = nextMessage ? { status: update.status, message: nextMessage } : { status: update.status }
            changed = true
          }

          return changed ? nextState : state
        })

        const nextTaskIndex = phaseGroup.tasks.findIndex((task) => {
          const meta = iterationPreflight.tasks[task.id]
          if (!meta || meta.status === 'blocked' || meta.status === 'waiting') return false
          return true
        })

        if (nextTaskIndex === -1) {
          const waitingTasks = phaseGroup.tasks.filter((task) => iterationPreflight.tasks[task.id]?.status === 'waiting')
          const hasWaitingOnly = waitingTasks.length === phaseGroup.tasks.length && waitingTasks.length > 0
          const stalledMessage = hasWaitingOnly
            ? buildWorkspaceExecutionPhaseStalledMessage({
                phaseGroup,
                phaseIndex,
                tasks: waitingTasks,
                preflight: iterationPreflight,
                t,
              })
            : null

          for (const task of phaseGroup.tasks) {
            const meta = iterationPreflight.tasks[task.id]
            const message =
              stalledMessage && meta?.status === 'waiting'
                ? stalledMessage
                : meta
                  ? formatWorkspacePreflightMessage(meta, task, t)
                  : t('ai.workspaceExecution.preflightBlockedDetail')

            failedCount += 1
            logs.push({
              id: `${task.id}:${logs.length}`,
              taskId: task.id,
              title: task.title,
              status: 'error',
              message,
            })
            setWorkspaceExecutionStates((state) => ({
              ...state,
              [task.id]: {
                status: 'error',
                message,
              },
            }))
          }

          const blockedPhaseLabel = formatWorkspaceExecutionPhaseHeading(phaseGroup, phaseIndex, t)
          const deferredMessage = t('ai.workspaceExecution.phaseBlockedByEarlierPhase', {
            phase: blockedPhaseLabel,
          })

          for (const laterPhase of queuedPhaseGroups.slice(phaseIndex + 1)) {
            for (const task of laterPhase.tasks) {
              failedCount += 1
              logs.push({
                id: `${task.id}:${logs.length}`,
                taskId: task.id,
                title: task.title,
                status: 'error',
                message: deferredMessage,
              })
              setWorkspaceExecutionStates((state) => ({
                ...state,
                [task.id]: {
                  status: 'error',
                  message: deferredMessage,
                },
              }))
            }
          }
          break phaseLoop
        }

        const [task] = phaseGroup.tasks.splice(nextTaskIndex, 1)
        if (!task) break

        setWorkspaceExecutionStates((state) => ({
          ...state,
          [task.id]: { status: 'running' },
        }))
        setWorkspaceAgentSession((session) =>
          session
            ? {
                ...session,
                currentTaskId: task.id,
              }
            : session
        )

        const result = await runWorkspaceTask(task, {
          suppressNotices: true,
          runId,
          preflight: iterationPreflight.tasks[task.id] ?? null,
        })
        if (workspaceAgentRunIdRef.current !== runId) return

        if (result.success) {
          appliedCount += 1
          completedTaskIds.add(task.id)
        } else {
          failedCount += 1
        }

        const completionAt = result.success ? Date.now() : undefined
        const originRunId = result.success ? runId : undefined

        logs.push({
          id: `${task.id}:${logs.length}`,
          taskId: task.id,
          title: task.title,
          status: result.success ? 'done' : 'error',
          message: result.message,
          completionSource: result.success ? 'agent' : undefined,
          completionAt,
          originRunId,
        })

        setWorkspaceExecutionStates((state) => ({
          ...state,
          [task.id]: {
            status: result.success ? 'done' : 'error',
            message: result.message,
            completionSource: result.success ? 'agent' : undefined,
            completionAt,
            originRunId,
          },
        }))
        setWorkspaceAgentSession((session) =>
          session
            ? {
                ...session,
                completed: appliedCount,
                failed: failedCount,
                currentTaskId: null,
                logs: [...logs],
              }
            : session
        )
      }
    }

    if (workspaceAgentRunIdRef.current !== runId) return

    setWorkspaceAgentSession((session) =>
      session
        ? {
            ...session,
            status: 'completed',
            completed: appliedCount,
            failed: failedCount,
            currentTaskId: null,
            logs: [...logs],
          }
        : session
    )
    pushInfoNotice('notices.aiWorkspaceExecutionSummaryTitle', 'notices.aiWorkspaceExecutionSummaryMessage', {
      values: {
        count: appliedCount,
        total: workspaceExecution.tasks.length,
      },
    })
  }, [
    rootPath,
    runWorkspaceTask,
    t,
    workspaceAgentSession?.status,
    workspaceExecution,
    workspaceExecutionStates,
    workspacePreflight.data,
    workspacePreflight.status,
    workspaceTaskTargetOverrides,
  ])

  return {
    workspaceExecution,
    workspaceExecutionPhaseGroups,
    hasWorkspaceExecutionTasks,
    workspaceExecutionStates,
    workspaceTaskTargetOverrides,
    workspacePreflight,
    workspaceAgentSession,
    canRunWorkspaceAgent,
    clearWorkspaceHistoryBinding,
    bindWorkspaceHistoryForDraft,
    handleOpenWorkspaceTaskDraft,
    openAllWorkspaceTaskDrafts,
    setWorkspaceTaskTargetOverride,
    executeWorkspaceTask,
    cancelWorkspaceAgentRun,
    runWorkspaceAgent,
  }
}

function canStartWorkspaceAgent(args: {
  phaseGroups: ReturnType<typeof groupAIWorkspaceExecutionTasksByPhase>
  preflight: AIWorkspaceExecutionPreflight | null
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
}) {
  const nextPhaseGroup = args.phaseGroups.find((phaseGroup) =>
    phaseGroup.tasks.some((task) => args.taskStates[task.id]?.status !== 'done')
  )
  if (!nextPhaseGroup || !args.preflight) return false

  let hasPendingTask = false
  for (const task of nextPhaseGroup.tasks) {
    if (args.taskStates[task.id]?.status === 'done') continue
    hasPendingTask = true
    const preflightTask = args.preflight.tasks[task.id]
    if (preflightTask?.status === 'blocked') {
      return false
    }
  }

  return hasPendingTask
}
