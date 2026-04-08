import assert from 'node:assert/strict'
import test from 'node:test'
import { getTaskCheckboxChange } from '../src/components/Editor/taskCheckbox.ts'

test('getTaskCheckboxChange toggles unchecked tasks to checked', () => {
  assert.deepEqual(getTaskCheckboxChange('- [ ] Ship feature', 10), {
    from: 12,
    to: 15,
    insert: '[x]',
  })
})

test('getTaskCheckboxChange toggles checked tasks to unchecked', () => {
  assert.deepEqual(getTaskCheckboxChange('  - [x] Review notes', 4), {
    from: 8,
    to: 11,
    insert: '[ ]',
  })
})

test('getTaskCheckboxChange ignores non-task lines', () => {
  assert.equal(getTaskCheckboxChange('Plain paragraph', 0), null)
})
