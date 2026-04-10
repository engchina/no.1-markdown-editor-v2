import {
  findWorkspaceDocumentReferences,
  type WorkspaceDocumentReference,
  type WorkspaceSearchableTab,
} from '../workspaceSearch.ts'
import type {
  AIWorkspaceExecutionHistoryRecord,
  AIWorkspaceExecutionHistoryTaskRecord,
} from './types.ts'

export type AIWorkspaceTaskAction = 'update-note' | 'create-note'
export type AIWorkspaceTaskPreflightStatus = 'ready' | 'waiting' | 'review' | 'blocked'
export type AIWorkspaceExecutionTaskRuntimeStatus = 'idle' | 'waiting' | 'running' | 'done' | 'error' | 'canceled'
export type AIWorkspaceExecutionTaskCompletionSource = 'manual-apply' | 'manual-open-draft' | 'agent'
export type AIWorkspaceTaskPreflightReason =
  | 'update-ready'
  | 'update-will-open'
  | 'update-target-produced-by-task'
  | 'dependency-pending'
  | 'dependency-cycle'
  | 'dependency-phase-order'
  | 'dependency-unresolved'
  | 'update-target-not-found'
  | 'update-target-dirty'
  | 'update-target-ambiguous'
  | 'update-target-low-confidence'
  | 'create-ready'
  | 'create-target-exists'

export interface AIWorkspaceExecutionTask {
  id: string
  action: AIWorkspaceTaskAction
  target: string
  title: string
  content: string
  dependsOn: string[]
  phase: string | null
}

export interface AIWorkspaceExecutionPlan {
  summary: string | null
  tasks: AIWorkspaceExecutionTask[]
}

export interface AIWorkspaceExecutionPhaseGroup {
  id: string
  label: string | null
  tasks: AIWorkspaceExecutionTask[]
}

export interface AIWorkspaceExecutionProducedDraft {
  tabId: string
  content: string
}

export interface AIWorkspaceExecutionTaskRuntimeState {
  status: AIWorkspaceExecutionTaskRuntimeStatus
  message?: string
  completionSource?: AIWorkspaceExecutionTaskCompletionSource
  completionAt?: number
  originRunId?: number | null
}

export type AIWorkspaceExecutionTaskReference = Pick<
  WorkspaceDocumentReference,
  'name' | 'path' | 'tabId' | 'source' | 'confidence' | 'ambiguous' | 'matchKind'
>

export interface AIWorkspaceExecutionTaskPreflight {
  taskId: string
  status: AIWorkspaceTaskPreflightStatus
  reason: AIWorkspaceTaskPreflightReason
  matchedReference: AIWorkspaceExecutionTaskReference | null
  alternatives: AIWorkspaceExecutionTaskReference[]
  overrideTarget: string | null
  dependencyTaskIds: string[]
  dependencyTaskTitles: string[]
  phaseOrderDependencyTaskIds?: string[]
  phaseOrderDependencyTaskTitles?: string[]
  unresolvedDependencies: string[]
  upstreamTaskId: string | null
  upstreamTaskTitle: string | null
}

export interface AIWorkspaceExecutionPreflight {
  tasks: Record<string, AIWorkspaceExecutionTaskPreflight>
  summary: {
    ready: number
    waiting: number
    review: number
    blocked: number
  }
}

const SUMMARY_PATTERN =
  /<!--\s*ai-workspace-summary\s*-->([\s\S]*?)<!--\s*\/ai-workspace-summary\s*-->/iu
const TASK_PATTERN =
  /<!--\s*ai-workspace-task\s+([^>]*)-->([\s\S]*?)<!--\s*\/ai-workspace-task\s*-->/giu
const ATTRIBUTE_PATTERN = /([a-z-]+)="([^"]*)"/giu

export function parseAIWorkspaceExecutionPlan(text: string): AIWorkspaceExecutionPlan | null {
  const source = text.trim()
  if (!source.includes('ai-workspace-task')) return null

  const summaryMatch = source.match(SUMMARY_PATTERN)
  const summary = summaryMatch?.[1]?.trim() || null
  const tasks: AIWorkspaceExecutionTask[] = []

  TASK_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TASK_PATTERN.exec(source))) {
    const attributes = parseTaskAttributes(match[1] ?? '')
    const content = match[2]?.trim() ?? ''
    const action = normalizeWorkspaceTaskAction(attributes.action)
    const target = attributes.target?.trim() ?? ''
    const title = attributes.title?.trim() ?? target

    if (!action || !target || !title || !content) continue

    tasks.push({
      id: `${action}:${target}:${tasks.length}`,
      action,
      target,
      title,
      content,
      dependsOn: splitWorkspaceDependencyAttribute(attributes['depends-on']),
      phase: normalizeWorkspaceTaskPhase(attributes.phase ?? attributes.stage),
    })
  }

  if (tasks.length === 0) return null

  return { summary, tasks }
}

export function groupAIWorkspaceExecutionTasksByPhase(
  tasks: readonly AIWorkspaceExecutionTask[]
): AIWorkspaceExecutionPhaseGroup[] {
  const groups: AIWorkspaceExecutionPhaseGroup[] = []
  let currentGroup: AIWorkspaceExecutionPhaseGroup | null = null
  let currentPhaseKey: string | null = null

  for (const task of tasks) {
    const phaseKey = normalizeWorkspaceTaskPhaseKey(task.phase)
    if (!currentGroup || currentPhaseKey !== phaseKey) {
      currentGroup = {
        id: `${phaseKey}:${groups.length}`,
        label: task.phase,
        tasks: [task],
      }
      groups.push(currentGroup)
      currentPhaseKey = phaseKey
      continue
    }

    currentGroup.tasks.push(task)
  }

  return groups
}

export function buildAIWorkspaceDraftTabName(task: AIWorkspaceExecutionTask): string {
  const normalizedTarget = task.target.trim()

  if (task.action === 'create-note') {
    return normalizedTarget || task.title
  }

  const base = normalizedTarget || task.title
  return /\(AI Draft\)$/u.test(base) ? base : `${base} (AI Draft)`
}

export function buildAIWorkspaceExecutionAgentResumeState(args: {
  tasks: readonly AIWorkspaceExecutionTask[]
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState | undefined>
}): {
  completedTaskIds: string[]
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState>
} {
  const completedTaskIds: string[] = []
  const taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState> = Object.fromEntries(
    args.tasks.map((task) => {
      const existing = args.taskStates[task.id]
      if (existing?.status === 'done') {
        completedTaskIds.push(task.id)
        return [task.id, existing] as const
      }

      return [task.id, { status: 'idle' as AIWorkspaceExecutionTaskRuntimeStatus }] as const
    })
  )

  return {
    completedTaskIds,
    taskStates,
  }
}

export function buildAIWorkspaceExecutionHistoryRecord(args: {
  execution: AIWorkspaceExecutionPlan
  taskStates: Record<string, AIWorkspaceExecutionTaskRuntimeState | undefined>
  updatedAt?: number
}): AIWorkspaceExecutionHistoryRecord {
  let completedCount = 0
  let failedCount = 0
  let waitingCount = 0

  const tasks: AIWorkspaceExecutionHistoryTaskRecord[] = args.execution.tasks.map((task) => {
    const state = args.taskStates[task.id]
    const status = state?.status ?? 'idle'
    if (status === 'done') completedCount += 1
    else if (status === 'waiting') waitingCount += 1
    else if (status === 'error' || status === 'canceled') failedCount += 1

    return {
      taskId: task.id,
      action: task.action,
      title: task.title,
      target: task.target,
      phase: task.phase,
      status,
      message: state?.message ?? null,
      completionSource: state?.completionSource ?? null,
      completionAt: state?.completionAt ?? null,
      originRunId: state?.originRunId ?? null,
    }
  })

  return {
    summary: args.execution.summary,
    taskCount: args.execution.tasks.length,
    completedCount,
    failedCount,
    waitingCount,
    updatedAt: args.updatedAt ?? Date.now(),
    tasks,
  }
}

export async function buildAIWorkspaceExecutionPreflight(args: {
  tasks: readonly AIWorkspaceExecutionTask[]
  tabs: Array<WorkspaceSearchableTab & { isDirty?: boolean }>
  rootPath: string | null
  targetOverrides?: Record<string, string | null | undefined>
  completedTaskIds?: readonly string[]
  producedDrafts?: Record<string, AIWorkspaceExecutionProducedDraft | undefined>
}): Promise<AIWorkspaceExecutionPreflight> {
  const tasks: Record<string, AIWorkspaceExecutionTaskPreflight> = {}
  let ready = 0
  let waiting = 0
  let review = 0
  let blocked = 0
  const referenceCache = new Map<string, Promise<WorkspaceDocumentReference[]>>()
  const dependencyAnalysis = resolveWorkspaceTaskDependencyAnalysis(args.tasks)

  for (const task of args.tasks) {
    const preflight = await buildWorkspaceTaskPreflight(task, args, referenceCache, dependencyAnalysis)
    tasks[task.id] = preflight

    if (preflight.status === 'ready') ready += 1
    else if (preflight.status === 'waiting') waiting += 1
    else if (preflight.status === 'review') review += 1
    else blocked += 1
  }

  return {
    tasks,
    summary: { ready, waiting, review, blocked },
  }
}

function parseTaskAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  ATTRIBUTE_PATTERN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = ATTRIBUTE_PATTERN.exec(source))) {
    attributes[match[1]] = match[2]
  }

  return attributes
}

function splitWorkspaceDependencyAttribute(value?: string) {
  if (!value) return []

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function normalizeWorkspaceTaskPhase(value?: string) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  return trimmed.replace(/\s+/gu, ' ')
}

function normalizeWorkspaceTaskPhaseKey(value: string | null) {
  return value ? normalizeWorkspaceTaskLookupValue(value) : '__default__'
}

function normalizeWorkspaceTaskAction(value?: string): AIWorkspaceTaskAction | null {
  if (value === 'update-note' || value === 'create-note') return value
  return null
}

function normalizeWorkspaceTaskLookupValue(value: string) {
  return value
    .trim()
    .replace(/\\/gu, '/')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .toLowerCase()
}

function resolveWorkspaceTaskDependencyAnalysis(tasks: readonly AIWorkspaceExecutionTask[]) {
  const lookup = new Map<string, AIWorkspaceExecutionTask[]>()
  const phaseGroupIndexByTaskId = Object.fromEntries(
    groupAIWorkspaceExecutionTasksByPhase(tasks).flatMap((phaseGroup, phaseIndex) =>
      phaseGroup.tasks.map((task) => [task.id, phaseIndex] as const)
    )
  )
  const taskById = Object.fromEntries(tasks.map((task) => [task.id, task]))

  for (const task of tasks) {
    for (const label of [task.target, task.title]) {
      const normalized = normalizeWorkspaceTaskLookupValue(label)
      if (!normalized) continue
      const existing = lookup.get(normalized)
      if (existing) existing.push(task)
      else lookup.set(normalized, [task])
    }
  }

  const taskIndex = Object.fromEntries(
    tasks.map((task) => {
      const resolvedTaskIds: string[] = []
      const resolvedTaskTitles: string[] = []
      const unresolvedDependencies: string[] = []

      for (const dependency of task.dependsOn) {
        const normalized = normalizeWorkspaceTaskLookupValue(dependency)
        const matches = (lookup.get(normalized) ?? []).filter((candidate) => candidate.id !== task.id)
        const uniqueMatches = matches.filter(
          (candidate, index, candidates) => candidates.findIndex((item) => item.id === candidate.id) === index
        )

        if (uniqueMatches.length === 1) {
          resolvedTaskIds.push(uniqueMatches[0]!.id)
          resolvedTaskTitles.push(uniqueMatches[0]!.title)
          continue
        }

        unresolvedDependencies.push(dependency)
      }

      return [
        task.id,
        {
          resolvedTaskIds,
          resolvedTaskTitles,
          phaseOrderDependencyTaskIds: resolvedTaskIds.filter((dependencyTaskId) => {
            const taskPhaseIndex = phaseGroupIndexByTaskId[task.id] ?? 0
            const dependencyPhaseIndex = phaseGroupIndexByTaskId[dependencyTaskId] ?? taskPhaseIndex
            return dependencyPhaseIndex > taskPhaseIndex
          }),
          phaseOrderDependencyTaskTitles: resolvedTaskIds
            .filter((dependencyTaskId) => {
              const taskPhaseIndex = phaseGroupIndexByTaskId[task.id] ?? 0
              const dependencyPhaseIndex = phaseGroupIndexByTaskId[dependencyTaskId] ?? taskPhaseIndex
              return dependencyPhaseIndex > taskPhaseIndex
            })
            .map((dependencyTaskId) => taskById[dependencyTaskId]?.title ?? dependencyTaskId),
          unresolvedDependencies,
        },
      ] as const
    })
  )

  return {
    taskIndex,
    cyclicTaskIds: detectWorkspaceTaskDependencyCycles(taskIndex),
  }
}

function detectWorkspaceTaskDependencyCycles(
  taskIndex: Record<
    string,
    {
      resolvedTaskIds: string[]
    }
  >
) {
  const visited = new Set<string>()
  const activeStack: string[] = []
  const activeIndex = new Map<string, number>()
  const cyclicTaskIds = new Set<string>()

  function visit(taskId: string) {
    const cycleStart = activeIndex.get(taskId)
    if (typeof cycleStart === 'number') {
      for (let index = cycleStart; index < activeStack.length; index += 1) {
        const cycleTaskId = activeStack[index]
        if (cycleTaskId) cyclicTaskIds.add(cycleTaskId)
      }
      cyclicTaskIds.add(taskId)
      return
    }

    if (visited.has(taskId)) return
    visited.add(taskId)

    activeIndex.set(taskId, activeStack.length)
    activeStack.push(taskId)

    for (const dependencyTaskId of taskIndex[taskId]?.resolvedTaskIds ?? []) {
      visit(dependencyTaskId)
    }

    activeStack.pop()
    activeIndex.delete(taskId)
  }

  for (const taskId of Object.keys(taskIndex)) {
    visit(taskId)
  }

  return cyclicTaskIds
}

async function buildWorkspaceTaskPreflight(
  task: AIWorkspaceExecutionTask,
  options: {
    tasks: readonly AIWorkspaceExecutionTask[]
    tabs: Array<WorkspaceSearchableTab & { isDirty?: boolean }>
    rootPath: string | null
    targetOverrides?: Record<string, string | null | undefined>
    completedTaskIds?: readonly string[]
    producedDrafts?: Record<string, AIWorkspaceExecutionProducedDraft | undefined>
  },
  referenceCache: Map<string, Promise<WorkspaceDocumentReference[]>>,
  dependencyAnalysis: {
    taskIndex: Record<
      string,
      {
        resolvedTaskIds: string[]
        resolvedTaskTitles: string[]
        phaseOrderDependencyTaskIds: string[]
        phaseOrderDependencyTaskTitles: string[]
        unresolvedDependencies: string[]
      }
    >
    cyclicTaskIds: Set<string>
  }
): Promise<AIWorkspaceExecutionTaskPreflight> {
  const overrideTarget = normalizeWorkspaceTaskOverride(options.targetOverrides?.[task.id] ?? null)
  const lookupTarget = overrideTarget ?? task.target
  const dependencyMeta = dependencyAnalysis.taskIndex[task.id] ?? {
    resolvedTaskIds: [],
    resolvedTaskTitles: [],
    phaseOrderDependencyTaskIds: [],
    phaseOrderDependencyTaskTitles: [],
    unresolvedDependencies: [],
  }
  const completedTaskIds = new Set(options.completedTaskIds ?? [])
  const producedDraftTarget = resolveWorkspaceExecutionProducedDraftTarget(
    task,
    {
      tasks: options.tasks,
      tabs: options.tabs,
      producedDrafts: options.producedDrafts,
    },
    dependencyMeta,
    overrideTarget
  )

  if (dependencyMeta.unresolvedDependencies.length > 0) {
    return {
      taskId: task.id,
      status: 'blocked',
      reason: 'dependency-unresolved',
      matchedReference: null,
      alternatives: [],
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  if (dependencyAnalysis.cyclicTaskIds.has(task.id)) {
    return {
      taskId: task.id,
      status: 'blocked',
      reason: 'dependency-cycle',
      matchedReference: null,
      alternatives: [],
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  if (dependencyMeta.phaseOrderDependencyTaskIds.length > 0) {
    return {
      taskId: task.id,
      status: 'blocked',
      reason: 'dependency-phase-order',
      matchedReference: null,
      alternatives: [],
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      phaseOrderDependencyTaskIds: dependencyMeta.phaseOrderDependencyTaskIds,
      phaseOrderDependencyTaskTitles: dependencyMeta.phaseOrderDependencyTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  const unmetDependencyTaskIds = dependencyMeta.resolvedTaskIds.filter((id) => !completedTaskIds.has(id))
  const hasPendingDependencies = unmetDependencyTaskIds.length > 0

  if (hasPendingDependencies) {
    return {
      taskId: task.id,
      status: 'waiting',
      reason: 'dependency-pending',
      matchedReference: producedDraftTarget?.reference ?? null,
      alternatives: producedDraftTarget ? [producedDraftTarget.reference] : [],
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: producedDraftTarget?.upstreamTask.id ?? null,
      upstreamTaskTitle: producedDraftTarget?.upstreamTask.title ?? null,
    }
  }

  if (task.action === 'create-note') {
    const references = await loadWorkspaceTaskReferences(lookupTarget, options, referenceCache)
    const matchedReference = references[0] ?? null
    const alternatives = references.map((reference) => toWorkspaceTaskPreflightReference(reference))
    if (matchedReference && matchedReference.confidence === 'high' && !matchedReference.ambiguous) {
      return {
        taskId: task.id,
        status: 'review',
        reason: 'create-target-exists',
        matchedReference: toWorkspaceTaskPreflightReference(matchedReference),
        alternatives,
        overrideTarget,
        dependencyTaskIds: dependencyMeta.resolvedTaskIds,
        dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
        unresolvedDependencies: dependencyMeta.unresolvedDependencies,
        upstreamTaskId: null,
        upstreamTaskTitle: null,
      }
    }

    return {
      taskId: task.id,
      status: 'ready',
      reason: 'create-ready',
      matchedReference: null,
      alternatives,
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  if (producedDraftTarget) {
    return {
      taskId: task.id,
      status: 'ready',
      reason: 'update-ready',
      matchedReference: producedDraftTarget.reference,
      alternatives: [producedDraftTarget.reference],
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: producedDraftTarget.upstreamTask.id,
      upstreamTaskTitle: producedDraftTarget.upstreamTask.title,
    }
  }

  const references = await loadWorkspaceTaskReferences(lookupTarget, options, referenceCache)
  const matchedReference = references[0] ?? null
  const alternatives = references.map((reference) => toWorkspaceTaskPreflightReference(reference))

  if (!matchedReference) {
    const upstreamTask = resolveWorkspaceExecutionDraftProducer(task, options.tasks)
    if (upstreamTask) {
      return {
        taskId: task.id,
        status: 'waiting',
        reason: 'update-target-produced-by-task',
        matchedReference: null,
        alternatives,
        overrideTarget,
        dependencyTaskIds: dependencyMeta.resolvedTaskIds,
        dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
        unresolvedDependencies: dependencyMeta.unresolvedDependencies,
        upstreamTaskId: upstreamTask.id,
        upstreamTaskTitle: upstreamTask.title,
      }
    }

    return {
      taskId: task.id,
      status: 'blocked',
      reason: 'update-target-not-found',
      matchedReference: null,
      alternatives,
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  if (matchedReference.ambiguous) {
    return {
      taskId: task.id,
      status: 'blocked',
      reason: 'update-target-ambiguous',
      matchedReference: toWorkspaceTaskPreflightReference(matchedReference),
      alternatives,
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  if (matchedReference.confidence === 'low') {
    return {
      taskId: task.id,
      status: 'blocked',
      reason: 'update-target-low-confidence',
      matchedReference: toWorkspaceTaskPreflightReference(matchedReference),
      alternatives,
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  if (matchedReference.confidence === 'medium') {
    return {
      taskId: task.id,
      status: 'review',
      reason: 'update-target-low-confidence',
      matchedReference: toWorkspaceTaskPreflightReference(matchedReference),
      alternatives,
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  const targetTab =
    matchedReference.tabId !== null
      ? options.tabs.find((tab) => tab.id === matchedReference.tabId) ?? null
      : null

  if (targetTab?.isDirty) {
    return {
      taskId: task.id,
      status: 'blocked',
      reason: 'update-target-dirty',
      matchedReference: toWorkspaceTaskPreflightReference(matchedReference),
      alternatives,
      overrideTarget,
      dependencyTaskIds: dependencyMeta.resolvedTaskIds,
      dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
      unresolvedDependencies: dependencyMeta.unresolvedDependencies,
      upstreamTaskId: null,
      upstreamTaskTitle: null,
    }
  }

  return {
    taskId: task.id,
    status: matchedReference.tabId ? 'ready' : 'review',
    reason: matchedReference.tabId ? 'update-ready' : 'update-will-open',
    matchedReference: toWorkspaceTaskPreflightReference(matchedReference),
    alternatives,
    overrideTarget,
    dependencyTaskIds: dependencyMeta.resolvedTaskIds,
    dependencyTaskTitles: dependencyMeta.resolvedTaskTitles,
    unresolvedDependencies: dependencyMeta.unresolvedDependencies,
    upstreamTaskId: null,
    upstreamTaskTitle: null,
  }
}

function resolveWorkspaceExecutionProducedDraftTarget(
  task: AIWorkspaceExecutionTask,
  options: {
    tasks: readonly AIWorkspaceExecutionTask[]
    tabs: Array<WorkspaceSearchableTab & { isDirty?: boolean }>
    producedDrafts?: Record<string, AIWorkspaceExecutionProducedDraft | undefined>
  },
  dependencyMeta: {
    resolvedTaskIds: string[]
    resolvedTaskTitles: string[]
    unresolvedDependencies: string[]
  },
  overrideTarget: string | null
) {
  if (task.action !== 'update-note' || overrideTarget) return null

  const upstreamTask = resolveWorkspaceExecutionDraftProducer(task, options.tasks)
  if (!upstreamTask || !dependencyMeta.resolvedTaskIds.includes(upstreamTask.id)) return null

  const producedDraft = options.producedDrafts?.[upstreamTask.id]
  if (!producedDraft) return null

  const targetTab = options.tabs.find((tab) => tab.id === producedDraft.tabId)
  if (!targetTab || targetTab.content !== producedDraft.content) return null

  return {
    upstreamTask,
    reference: {
      name: targetTab.name,
      path: targetTab.path,
      tabId: targetTab.id,
      source: 'tab',
      confidence: 'high',
      ambiguous: false,
      matchKind: 'exact-name',
    } satisfies AIWorkspaceExecutionTaskReference,
  }
}

function loadWorkspaceTaskReferences(
  query: string,
  options: {
    tabs: Array<WorkspaceSearchableTab & { isDirty?: boolean }>
    rootPath: string | null
    targetOverrides?: Record<string, string | null | undefined>
    producedDrafts?: Record<string, AIWorkspaceExecutionProducedDraft | undefined>
  },
  referenceCache: Map<string, Promise<WorkspaceDocumentReference[]>>
) {
  const cacheKey = query.trim().toLowerCase()
  const existing = referenceCache.get(cacheKey)
  if (existing) return existing

  const nextPromise = findWorkspaceDocumentReferences({
    query,
    tabs: options.tabs,
    rootPath: options.rootPath,
    limit: 4,
  })

  referenceCache.set(cacheKey, nextPromise)
  return nextPromise
}

function toWorkspaceTaskPreflightReference(
  reference: WorkspaceDocumentReference
): AIWorkspaceExecutionTaskReference {
  return {
    name: reference.name,
    path: reference.path,
    tabId: reference.tabId,
    source: reference.source,
    confidence: reference.confidence,
    ambiguous: reference.ambiguous,
    matchKind: reference.matchKind,
  }
}

function normalizeWorkspaceTaskOverride(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function resolveWorkspaceExecutionDraftProducer(
  task: AIWorkspaceExecutionTask,
  tasks: readonly AIWorkspaceExecutionTask[]
) {
  const taskIndex = tasks.findIndex((item) => item.id === task.id)
  if (taskIndex <= 0) return null

  const normalizedTarget = normalizeWorkspaceTaskLookupValue(task.target)
  if (!normalizedTarget) return null

  for (let index = taskIndex - 1; index >= 0; index -= 1) {
    const candidate = tasks[index]
    if (candidate?.action !== 'create-note') continue

    const candidateTarget = normalizeWorkspaceTaskLookupValue(candidate.target)
    const candidateTitle = normalizeWorkspaceTaskLookupValue(candidate.title)
    if (candidateTarget === normalizedTarget || candidateTitle === normalizedTarget) {
      return candidate
    }
  }

  return null
}
