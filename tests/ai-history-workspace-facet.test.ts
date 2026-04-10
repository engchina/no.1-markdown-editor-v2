import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasAIHistoryWorkspaceExecution,
  isAIHistoryWorkspaceExecutionCompleted,
  isAIHistoryWorkspaceExecutionNeedingAttention,
  matchesAIHistoryWorkspaceFacet,
} from '../src/lib/ai/historyWorkspaceFacet.ts'

const baseEntry = {
  workspaceExecution: {
    summary: '- Workspace run',
    taskCount: 2,
    completedCount: 1,
    failedCount: 0,
    waitingCount: 1,
    updatedAt: 1,
    tasks: [],
  },
}

test('workspace history facet helpers detect presence completion and attention correctly', () => {
  assert.equal(hasAIHistoryWorkspaceExecution(baseEntry), true)
  assert.equal(isAIHistoryWorkspaceExecutionCompleted(baseEntry), false)
  assert.equal(isAIHistoryWorkspaceExecutionNeedingAttention(baseEntry), true)

  assert.equal(
    isAIHistoryWorkspaceExecutionCompleted({
      workspaceExecution: {
        ...baseEntry.workspaceExecution,
        completedCount: 2,
        failedCount: 0,
        waitingCount: 0,
      },
    }),
    true
  )

  assert.equal(
    isAIHistoryWorkspaceExecutionNeedingAttention({
      workspaceExecution: {
        ...baseEntry.workspaceExecution,
        completedCount: 2,
        failedCount: 0,
        waitingCount: 0,
      },
    }),
    false
  )
})

test('workspace history facet matcher filters entries by requested workspace state', () => {
  const completedEntry = {
    workspaceExecution: {
      ...baseEntry.workspaceExecution,
      completedCount: 2,
      failedCount: 0,
      waitingCount: 0,
    },
  }
  const passiveEntry = { workspaceExecution: null }

  assert.equal(matchesAIHistoryWorkspaceFacet(passiveEntry, 'all'), true)
  assert.equal(matchesAIHistoryWorkspaceFacet(passiveEntry, 'workspace'), false)
  assert.equal(matchesAIHistoryWorkspaceFacet(baseEntry, 'workspace'), true)
  assert.equal(matchesAIHistoryWorkspaceFacet(completedEntry, 'workspace-completed'), true)
  assert.equal(matchesAIHistoryWorkspaceFacet(baseEntry, 'workspace-completed'), false)
  assert.equal(matchesAIHistoryWorkspaceFacet(baseEntry, 'workspace-attention'), true)
  assert.equal(matchesAIHistoryWorkspaceFacet(completedEntry, 'workspace-attention'), false)
})
