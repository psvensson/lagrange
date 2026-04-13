// @ts-nocheck
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {
  NODE_LIFECYCLE_LOAD_READY_STATES,
  NODE_LIFECYCLE_REPAIR_ONLY_STATES,
  isLoadReadyNodeLifecycleState,
  isRepairOnlyNodeLifecycleState,
} from '../../src/node/node-lifecycle-state-machine-constants.js';
import {
  REPLICA_STATE_MACHINE_LOAD_READY_STATES,
  REPLICA_STATE_MACHINE_REPAIR_ONLY_STATES,
  isLoadReadyReplicaRaftRole,
  isRepairOnlyReplicaRaftRole,
} from '../../src/node/replica-state-machine-constants.js';

test('lifecycle readiness constants classify load-ready node states explicitly', async () => {
  assert.deepEqual(
    NODE_LIFECYCLE_LOAD_READY_STATES,
    [NODE_STATE.READY, NODE_STATE.ACTIVE],
  );
  assert.equal(isLoadReadyNodeLifecycleState(NODE_STATE.READY), true);
  assert.equal(isLoadReadyNodeLifecycleState(NODE_STATE.ACTIVE), true);
  assert.equal(isLoadReadyNodeLifecycleState(NODE_STATE.JOINING), false);
  assert.equal(isRepairOnlyNodeLifecycleState(NODE_STATE.JOINING), true);
  assert.equal(isRepairOnlyNodeLifecycleState(NODE_STATE.DRAINING), true);
  assert.equal(
    NODE_LIFECYCLE_REPAIR_ONLY_STATES.includes(NODE_STATE.SHUTTING_DOWN),
    true,
  );
});

test('lifecycle readiness constants classify stable replica roles and repair-only states',
  async () => {
    assert.deepEqual(REPLICA_STATE_MACHINE_LOAD_READY_STATES, ['active']);
    assert.deepEqual(
      REPLICA_STATE_MACHINE_REPAIR_ONLY_STATES,
      ['pending', 'creating', 'syncing', 'removing', 'failed'],
    );
    assert.equal(isLoadReadyReplicaRaftRole('leader'), true);
    assert.equal(isLoadReadyReplicaRaftRole('follower'), true);
    assert.equal(isLoadReadyReplicaRaftRole('candidate'), false);
    assert.equal(isLoadReadyReplicaRaftRole('learner'), false);
    assert.equal(isRepairOnlyReplicaRaftRole('candidate'), true);
    assert.equal(isRepairOnlyReplicaRaftRole('learner'), true);
  });
