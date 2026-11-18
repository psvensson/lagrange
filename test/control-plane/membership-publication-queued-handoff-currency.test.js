// Paired witness for the membership owner's queue merge: a handoff captured
// by an earlier enqueue never outlives a later wake that carries none.
//
// An admin-queued handoff (WAIT_OWNER_RECOVERY for node-3) is still pending
// when the recovery owner's progress wake for the same owner key arrives.
// The merged run must derive from current rows (node-3 has recovered), so it
// publishes node-3 once; it must not re-evaluate the stale handoff and answer
// the owner-recovery wait.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {
  resetFixtureSingletons,
  clearFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';
import {autonomousHandoffFixture} from
  '../admin/completed-placement-autonomous-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PUBLISHED = Object.freeze(['node-1', 'node-2']);
const RECOVERING = 'node-3';
const HANDOFF_FIELD = 'publicationActiveGateHandoff';
const SETTLE_TURNS = 30;

function staleOwnerRecoveryWaitHandoff(publicationEpoch) {
  return {
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    publicationEpoch,
    expectedNodeIds: [...PUBLISHED, RECOVERING],
    publishedActiveNodeIds: [...PUBLISHED],
    missingPublishedNodeIds: [RECOVERING],
    pendingRecoveryNodeIds: [RECOVERING],
    pendingRecoveryCount: 1,
    runtimePromotionAllowed: false,
    state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
    reasonCode: PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
    nextAction: PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
  };
}

async function settle(f) {
  for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await f.membership.reconcileQueue.awaitCurrentWorkIdle();
}

test('an older queued handoff merged with a newer progress wake runs against current rows', async (t) => {
  const f = await autonomousHandoffFixture(t, {publishedActiveNodeIds: [...PUBLISHED]});
  const runs = [];
  const reconcileCluster = f.membership.reconcileClusterMembership
    .bind(f.membership);
  f.membership.reconcileClusterMembership = async (options = {}) => {
    runs.push(Object.hasOwn(options, HANDOFF_FIELD));
    return reconcileCluster(options);
  };
  const handoffRuns = [];
  const reconcileActiveGate = f.membership.reconcileActiveGateMembershipPublication
    .bind(f.membership);
  f.membership.reconcileActiveGateMembershipPublication = async (...args) => {
    const outcome = await reconcileActiveGate(...args);
    handoffRuns.push(outcome);
    return outcome;
  };

  // The admin path queues a handoff captured while node-3 was recovering.
  f.membership.enqueueClusterMembershipReconcile('admin_handoff', {
    [HANDOFF_FIELD]: staleOwnerRecoveryWaitHandoff(
      f.publication().publication_epoch),
  });
  // Before it drains, node-3 recovers and the recovery owner's progress wake
  // (no handoff) merges into the same pending item.
  f.blocked = false;
  f.cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE',
    {...f.target(), status: 'active', raft_role: 'follower'});
  f.membership.enqueueClusterMembershipReconcile('priority_recovery_progress');
  await settle(f);

  assert.ok(runs.length >= 1, 'the merged item ran');
  assert.equal(runs[0], false,
    'the merged run carries no captured handoff');
  assert.deepEqual(handoffRuns, [],
    'the stale owner-recovery handoff is never re-evaluated');
  assert.deepEqual(
    JSON.parse(f.publication().published_active_node_ids),
    [...PUBLISHED, RECOVERING],
    'the run published the recovered node from current rows',
  );
  assert.equal(f.membership.reconcileQueue.isCurrentWorkIdle(), true);
  assert.deepEqual(f.errors, []);
});
