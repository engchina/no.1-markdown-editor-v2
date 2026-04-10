import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAIWorkspaceExecutionAgentResumeState,
  buildAIWorkspaceExecutionPreflight,
  buildAIWorkspaceDraftTabName,
  groupAIWorkspaceExecutionTasksByPhase,
  parseAIWorkspaceExecutionPlan,
} from '../src/lib/ai/workspaceExecution.ts'

test('parseAIWorkspaceExecutionPlan extracts summary and structured note tasks from AI output', () => {
  const plan = parseAIWorkspaceExecutionPlan([
    '<!-- ai-workspace-summary -->',
    '- Coordinate the attached notes.',
    '<!-- /ai-workspace-summary -->',
    '',
    '<!-- ai-workspace-task action="update-note" target="project-plan.md" title="project-plan.md Draft" depends-on="release-checklist.md" -->',
    '# Project Plan Update',
    '',
    '- Align milestones.',
    '<!-- /ai-workspace-task -->',
    '',
    '<!-- ai-workspace-task action="create-note" target="release-checklist.md" title="release-checklist.md" -->',
    '# Release Checklist',
    '',
    '- Verify owners.',
    '<!-- /ai-workspace-task -->',
  ].join('\n'))

  assert.ok(plan)
  assert.match(plan?.summary ?? '', /Coordinate the attached notes/u)
  assert.deepEqual(
    plan?.tasks.map((task) => ({
      action: task.action,
      target: task.target,
      title: task.title,
      dependsOn: task.dependsOn,
      phase: task.phase,
    })),
    [
      {
        action: 'update-note',
        target: 'project-plan.md',
        title: 'project-plan.md Draft',
        dependsOn: ['release-checklist.md'],
        phase: null,
      },
      {
        action: 'create-note',
        target: 'release-checklist.md',
        title: 'release-checklist.md',
        dependsOn: [],
        phase: null,
      },
    ]
  )
})

test('parseAIWorkspaceExecutionPlan captures optional phase metadata and groups contiguous task phases without reordering', () => {
  const plan = parseAIWorkspaceExecutionPlan([
    '<!-- ai-workspace-task action="create-note" target="research.md" title="Research" phase="Planning" -->',
    '# Research',
    '<!-- /ai-workspace-task -->',
    '',
    '<!-- ai-workspace-task action="update-note" target="outline.md" title="Outline" phase="Planning" -->',
    '# Outline',
    '<!-- /ai-workspace-task -->',
    '',
    '<!-- ai-workspace-task action="update-note" target="draft.md" title="Draft" stage="Drafting" -->',
    '# Draft',
    '<!-- /ai-workspace-task -->',
    '',
    '<!-- ai-workspace-task action="update-note" target="appendix.md" title="Appendix" phase="Planning" -->',
    '# Appendix',
    '<!-- /ai-workspace-task -->',
  ].join('\n'))

  assert.ok(plan)
  assert.deepEqual(
    plan?.tasks.map((task) => ({ title: task.title, phase: task.phase })),
    [
      { title: 'Research', phase: 'Planning' },
      { title: 'Outline', phase: 'Planning' },
      { title: 'Draft', phase: 'Drafting' },
      { title: 'Appendix', phase: 'Planning' },
    ]
  )
  assert.deepEqual(
    groupAIWorkspaceExecutionTasksByPhase(plan?.tasks ?? []).map((group) => ({
      label: group.label,
      titles: group.tasks.map((task) => task.title),
    })),
    [
      { label: 'Planning', titles: ['Research', 'Outline'] },
      { label: 'Drafting', titles: ['Draft'] },
      { label: 'Planning', titles: ['Appendix'] },
    ]
  )
})

test('buildAIWorkspaceDraftTabName keeps create-note targets clean and marks update-note drafts explicitly', () => {
  assert.equal(
    buildAIWorkspaceDraftTabName({
      id: '1',
      action: 'create-note',
      target: 'release-checklist.md',
      title: 'release-checklist.md',
      content: '# Release Checklist',
      dependsOn: [],
      phase: null,
    }),
    'release-checklist.md'
  )

  assert.equal(
    buildAIWorkspaceDraftTabName({
      id: '2',
      action: 'update-note',
      target: 'project-plan.md',
      title: 'project-plan.md Draft',
      content: '# Project Plan Update',
      dependsOn: [],
      phase: null,
    }),
    'project-plan.md (AI Draft)'
  )
})

test('buildAIWorkspaceExecutionAgentResumeState preserves done tasks and resets retryable states before rerunning the agent', () => {
  const resumeState = buildAIWorkspaceExecutionAgentResumeState({
    tasks: [
      {
        id: 'done-task',
        action: 'update-note',
        target: 'done.md',
        title: 'Done Task',
        content: '# Done',
        dependsOn: [],
        phase: 'Planning',
      },
      {
        id: 'waiting-task',
        action: 'update-note',
        target: 'waiting.md',
        title: 'Waiting Task',
        content: '# Waiting',
        dependsOn: [],
        phase: 'Planning',
      },
      {
        id: 'error-task',
        action: 'create-note',
        target: 'error.md',
        title: 'Error Task',
        content: '# Error',
        dependsOn: [],
        phase: 'Delivery',
      },
    ],
    taskStates: {
      'done-task': {
        status: 'done',
        message: 'Applied earlier',
        completionSource: 'manual-apply',
        completionAt: 1700000000000,
        originRunId: null,
      },
      'waiting-task': { status: 'waiting', message: 'Waiting on prerequisites' },
      'error-task': { status: 'error', message: 'Need retry' },
    },
  })

  assert.deepEqual(resumeState.completedTaskIds, ['done-task'])
  assert.deepEqual(resumeState.taskStates, {
    'done-task': {
      status: 'done',
      message: 'Applied earlier',
      completionSource: 'manual-apply',
      completionAt: 1700000000000,
      originRunId: null,
    },
    'waiting-task': { status: 'idle' },
    'error-task': { status: 'idle' },
  })
})

test('buildAIWorkspaceExecutionPreflight marks ready review and blocked tasks before execution', async () => {
  const preflight = await buildAIWorkspaceExecutionPreflight({
    tasks: [
      {
        id: 'update-clean',
        action: 'update-note',
        target: 'project-plan.md',
        title: 'Project Plan',
        content: '# Updated plan',
        dependsOn: [],
        phase: 'Planning',
      },
      {
        id: 'update-dirty',
        action: 'update-note',
        target: 'retro.md',
        title: 'Retro',
        content: '# Updated retro',
        dependsOn: [],
        phase: 'Planning',
      },
      {
        id: 'update-missing',
        action: 'update-note',
        target: 'missing.md',
        title: 'Missing',
        content: '# Missing',
        dependsOn: [],
        phase: 'Drafting',
      },
      {
        id: 'update-review',
        action: 'update-note',
        target: 'project pl',
        title: 'Project Plan Partial',
        content: '# Partial',
        dependsOn: [],
        phase: 'Drafting',
      },
      {
        id: 'create-followup',
        action: 'create-note',
        target: 'followup-plan.md',
        title: 'Followup Plan',
        content: '# Followup Plan',
        dependsOn: [],
        phase: 'Drafting',
      },
      {
        id: 'update-followup',
        action: 'update-note',
        target: 'followup-plan.md',
        title: 'Followup Plan Update',
        content: '# Update Followup',
        dependsOn: ['Followup Plan'],
        phase: 'Review',
      },
      {
        id: 'update-explicit-unresolved',
        action: 'update-note',
        target: 'project-plan.md',
        title: 'Plan Needs Inputs',
        content: '# Needs Inputs',
        dependsOn: ['missing dependency'],
        phase: 'Review',
      },
      {
        id: 'update-ambiguous',
        action: 'update-note',
        target: 'project',
        title: 'Project Broad',
        content: '# Broad',
        dependsOn: [],
        phase: 'Review',
      },
      {
        id: 'create-existing',
        action: 'create-note',
        target: 'release-checklist.md',
        title: 'Release Checklist',
        content: '# Release Checklist',
        dependsOn: [],
        phase: 'Delivery',
      },
      {
        id: 'create-new',
        action: 'create-note',
        target: 'fresh-note.md',
        title: 'Fresh Note',
        content: '# Fresh Note',
        dependsOn: [],
        phase: 'Delivery',
      },
    ],
    tabs: [
      {
        id: 'tab-clean',
        name: 'project-plan.md',
        path: 'notes/project-plan.md',
        content: '# Plan',
        isDirty: false,
      },
      {
        id: 'tab-dirty',
        name: 'retro.md',
        path: 'notes/retro.md',
        content: '# Retro',
        isDirty: true,
      },
      {
        id: 'tab-existing',
        name: 'release-checklist.md',
        path: 'notes/release-checklist.md',
        content: '# Checklist',
        isDirty: false,
      },
      {
        id: 'tab-project-2',
        name: 'project-retrospective.md',
        path: 'notes/project-retrospective.md',
        content: '# Retro',
        isDirty: false,
      },
    ],
    rootPath: null,
  })

  assert.deepEqual(preflight.summary, {
    ready: 3,
    waiting: 1,
    review: 2,
    blocked: 4,
  })
  assert.equal(preflight.tasks['update-clean']?.status, 'ready')
  assert.equal(preflight.tasks['update-clean']?.reason, 'update-ready')
  assert.equal(preflight.tasks['update-dirty']?.status, 'blocked')
  assert.equal(preflight.tasks['update-dirty']?.reason, 'update-target-dirty')
  assert.equal(preflight.tasks['update-missing']?.status, 'blocked')
  assert.equal(preflight.tasks['update-missing']?.reason, 'update-target-not-found')
  assert.equal(preflight.tasks['update-review']?.status, 'review')
  assert.equal(preflight.tasks['update-review']?.reason, 'update-target-low-confidence')
  assert.equal(preflight.tasks['update-followup']?.status, 'waiting')
  assert.equal(preflight.tasks['update-followup']?.reason, 'dependency-pending')
  assert.deepEqual(preflight.tasks['update-followup']?.dependencyTaskTitles, ['Followup Plan'])
  assert.equal(preflight.tasks['update-explicit-unresolved']?.status, 'blocked')
  assert.equal(preflight.tasks['update-explicit-unresolved']?.reason, 'dependency-unresolved')
  assert.deepEqual(preflight.tasks['update-explicit-unresolved']?.unresolvedDependencies, ['missing dependency'])
  assert.equal(preflight.tasks['update-ambiguous']?.status, 'blocked')
  assert.equal(preflight.tasks['update-ambiguous']?.reason, 'update-target-ambiguous')
  assert.equal(preflight.tasks['create-existing']?.status, 'review')
  assert.equal(preflight.tasks['create-existing']?.reason, 'create-target-exists')
  assert.equal(preflight.tasks['create-new']?.status, 'ready')
  assert.equal(preflight.tasks['create-new']?.reason, 'create-ready')
})

test('buildAIWorkspaceExecutionPreflight routes dependent update tasks to a produced create-note draft', async () => {
  const preflight = await buildAIWorkspaceExecutionPreflight({
    tasks: [
      {
        id: 'create-followup',
        action: 'create-note',
        target: 'followup-plan.md',
        title: 'Followup Plan',
        content: '# Followup Plan\n\n- Initial draft',
        dependsOn: [],
        phase: 'Drafting',
      },
      {
        id: 'update-followup',
        action: 'update-note',
        target: 'followup-plan.md',
        title: 'Followup Plan Update',
        content: '# Followup Plan\n\n- Finalized draft',
        dependsOn: ['Followup Plan'],
        phase: 'Review',
      },
    ],
    tabs: [
      {
        id: 'draft-followup',
        name: 'followup-plan.md',
        path: null,
        content: '# Followup Plan\n\n- Initial draft',
        isDirty: true,
      },
    ],
    rootPath: null,
    completedTaskIds: ['create-followup'],
    producedDrafts: {
      'create-followup': {
        tabId: 'draft-followup',
        content: '# Followup Plan\n\n- Initial draft',
      },
    },
  })

  assert.equal(preflight.tasks['update-followup']?.status, 'ready')
  assert.equal(preflight.tasks['update-followup']?.reason, 'update-ready')
  assert.equal(preflight.tasks['update-followup']?.matchedReference?.tabId, 'draft-followup')
  assert.equal(preflight.tasks['update-followup']?.upstreamTaskId, 'create-followup')
  assert.deepEqual(preflight.summary, {
    ready: 1,
    waiting: 0,
    review: 1,
    blocked: 0,
  })
})

test('buildAIWorkspaceExecutionPreflight marks update tasks as waiting when an upstream create-note has not produced the draft yet', async () => {
  const preflight = await buildAIWorkspaceExecutionPreflight({
    tasks: [
      {
        id: 'create-followup',
        action: 'create-note',
        target: 'followup-plan.md',
        title: 'Followup Plan',
        content: '# Followup Plan\n\n- Initial draft',
        dependsOn: [],
        phase: 'Drafting',
      },
      {
        id: 'update-followup',
        action: 'update-note',
        target: 'followup-plan.md',
        title: 'Followup Plan Update',
        content: '# Followup Plan\n\n- Finalized draft',
        dependsOn: [],
        phase: 'Review',
      },
    ],
    tabs: [],
    rootPath: null,
  })

  assert.equal(preflight.tasks['update-followup']?.status, 'waiting')
  assert.equal(preflight.tasks['update-followup']?.reason, 'update-target-produced-by-task')
  assert.equal(preflight.summary.waiting, 1)
})

test('buildAIWorkspaceExecutionPreflight blocks dependency cycles across workspace tasks', async () => {
  const preflight = await buildAIWorkspaceExecutionPreflight({
    tasks: [
      {
        id: 'task-a',
        action: 'update-note',
        target: 'a.md',
        title: 'Task A',
        content: '# A',
        dependsOn: ['Task B'],
        phase: 'Planning',
      },
      {
        id: 'task-b',
        action: 'update-note',
        target: 'b.md',
        title: 'Task B',
        content: '# B',
        dependsOn: ['Task A'],
        phase: 'Planning',
      },
    ],
    tabs: [
      {
        id: 'tab-a',
        name: 'a.md',
        path: 'notes/a.md',
        content: '# A',
        isDirty: false,
      },
      {
        id: 'tab-b',
        name: 'b.md',
        path: 'notes/b.md',
        content: '# B',
        isDirty: false,
      },
    ],
    rootPath: null,
  })

  assert.equal(preflight.tasks['task-a']?.status, 'blocked')
  assert.equal(preflight.tasks['task-a']?.reason, 'dependency-cycle')
  assert.deepEqual(preflight.tasks['task-a']?.dependencyTaskTitles, ['Task B'])
  assert.equal(preflight.tasks['task-b']?.status, 'blocked')
  assert.equal(preflight.tasks['task-b']?.reason, 'dependency-cycle')
  assert.deepEqual(preflight.summary, {
    ready: 0,
    waiting: 0,
    review: 0,
    blocked: 2,
  })
})

test('buildAIWorkspaceExecutionPreflight keeps create-note tasks waiting until their dependencies complete', async () => {
  const preflight = await buildAIWorkspaceExecutionPreflight({
    tasks: [
      {
        id: 'outline',
        action: 'update-note',
        target: 'outline.md',
        title: 'Outline',
        content: '# Outline',
        dependsOn: [],
        phase: 'Planning',
      },
      {
        id: 'appendix',
        action: 'create-note',
        target: 'appendix.md',
        title: 'Appendix',
        content: '# Appendix',
        dependsOn: ['Outline'],
        phase: 'Delivery',
      },
    ],
    tabs: [
      {
        id: 'outline-tab',
        name: 'outline.md',
        path: 'notes/outline.md',
        content: '# Outline',
        isDirty: false,
      },
    ],
    rootPath: null,
  })

  assert.equal(preflight.tasks['appendix']?.status, 'waiting')
  assert.equal(preflight.tasks['appendix']?.reason, 'dependency-pending')
  assert.equal(preflight.summary.waiting, 1)
})

test('buildAIWorkspaceExecutionPreflight blocks tasks that depend on a later phase', async () => {
  const preflight = await buildAIWorkspaceExecutionPreflight({
    tasks: [
      {
        id: 'planning-summary',
        action: 'update-note',
        target: 'summary.md',
        title: 'Planning Summary',
        content: '# Summary',
        dependsOn: ['Launch Checklist'],
        phase: 'Planning',
      },
      {
        id: 'launch-checklist',
        action: 'update-note',
        target: 'launch-checklist.md',
        title: 'Launch Checklist',
        content: '# Launch Checklist',
        dependsOn: [],
        phase: 'Delivery',
      },
    ],
    tabs: [
      {
        id: 'summary-tab',
        name: 'summary.md',
        path: 'notes/summary.md',
        content: '# Summary',
        isDirty: false,
      },
      {
        id: 'launch-tab',
        name: 'launch-checklist.md',
        path: 'notes/launch-checklist.md',
        content: '# Launch Checklist',
        isDirty: false,
      },
    ],
    rootPath: null,
  })

  assert.equal(preflight.tasks['planning-summary']?.status, 'blocked')
  assert.equal(preflight.tasks['planning-summary']?.reason, 'dependency-phase-order')
  assert.deepEqual(preflight.tasks['planning-summary']?.phaseOrderDependencyTaskTitles, ['Launch Checklist'])
  assert.deepEqual(preflight.summary, {
    ready: 1,
    waiting: 0,
    review: 0,
    blocked: 1,
  })
})

test('buildAIWorkspaceExecutionPreflight keeps produced drafts blocked once they diverge from the tracked workflow content', async () => {
  const preflight = await buildAIWorkspaceExecutionPreflight({
    tasks: [
      {
        id: 'create-followup',
        action: 'create-note',
        target: 'followup-plan.md',
        title: 'Followup Plan',
        content: '# Followup Plan\n\n- Initial draft',
        dependsOn: [],
        phase: 'Drafting',
      },
      {
        id: 'update-followup',
        action: 'update-note',
        target: 'followup-plan.md',
        title: 'Followup Plan Update',
        content: '# Followup Plan\n\n- Finalized draft',
        dependsOn: ['Followup Plan'],
        phase: 'Review',
      },
    ],
    tabs: [
      {
        id: 'draft-followup',
        name: 'followup-plan.md',
        path: null,
        content: '# Followup Plan\n\n- User edited draft',
        isDirty: true,
      },
    ],
    rootPath: null,
    completedTaskIds: ['create-followup'],
    producedDrafts: {
      'create-followup': {
        tabId: 'draft-followup',
        content: '# Followup Plan\n\n- Initial draft',
      },
    },
  })

  assert.equal(preflight.tasks['update-followup']?.status, 'blocked')
  assert.equal(preflight.tasks['update-followup']?.reason, 'update-target-dirty')
  assert.equal(preflight.tasks['update-followup']?.matchedReference?.tabId, 'draft-followup')
})
