import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';

test('recovery retains an older obligation without acquiring its occupied owner key',
  async () => {
    const coordinator = new DurableWorkflowCoordinator();
    await coordinator.registerWorkflow({workflowId: 'new', ownerKey: 'shared',
      status: 'ACTIVE'});
    const restored = coordinator.recover({workflows: [
      {workflowId: 'old', ownerKey: 'shared', status: 'ACTIVE'},
    ], isTerminalWorkflow: (workflow) => workflow.status === 'DONE'});
    assert.ok(restored.restoredWorkflowIds.has('old'));
    assert.equal(coordinator.getWorkflowByOwnerKey('shared').workflowId, 'new');
    assert.equal(coordinator.getWorkflowById('old').workflowId, 'old');
    coordinator.removeWorkflow('old');
    assert.equal(coordinator.getWorkflowByOwnerKey('shared').workflowId, 'new');
  });

test('a stale active row cannot resurrect a known ended workflow', async () => {
  const coordinator = new DurableWorkflowCoordinator();
  await coordinator.registerWorkflow({workflowId: 'old', ownerKey: 'shared',
    status: 'DONE'});
  const restored = coordinator.recover({workflows: [
    {workflowId: 'old', ownerKey: 'shared', status: 'ACTIVE'},
  ], isTerminalWorkflow: (workflow) => workflow.status === 'DONE'});
  assert.equal(restored.restoredWorkflowIds.size, 0);
  assert.equal(coordinator.getWorkflowById('old').status, 'DONE');
});
