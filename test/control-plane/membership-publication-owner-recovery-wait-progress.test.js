// Paired witness for the membership owner's owner-recovery wait, driven from
// the production entry point (reconcileClusterMembership through the owner's
// own reconcile queue) on the real component substrate: real SQLite, cache,
// CDC, publication owner and the real priority-recovery owner (rebalancer).
//
// (a) While recovery is pending, the reconcile answers the named wait and the
//     queue goes idle after a bounded number of runs; no publication write.
// (b) When the recovery owner's progress event arrives (the target replica's
//     row becomes visible as active), the publication owner runs again from
//     current state and publishes the recovered node.
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
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
} from '../../src/control-plane/membership-publication-active-gate-reconcile.js';
import {
  MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT,
} from '../../src/control-plane/membership-publication-owner-recovery-wait.js';
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
// A hot loop is cut here so the old code fails instead of starving the event
// loop for ever; the repaired owner needs one run per wake.
const RUN_CAP = 25;
const SETTLE_TURNS = 30;

function ownerRecoveryWaitHandoff(publicationEpoch) {
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

function countOwnerRuns(f) {
  const runs = {activeGate: [], cluster: 0};
  const reconcileCluster = f.membership.reconcileClusterMembership
    .bind(f.membership);
  f.membership.reconcileClusterMembership = async (options = {}) => {
    runs.cluster += 1;
    if (runs.cluster > RUN_CAP) {
      // Hot loop: stop the owner's queue so the failure is reported.
      f.membership.reconcileQueue.shutdown();
      return {deferred: true, reason: 'witness_run_cap'};
    }
    return reconcileCluster(options);
  };
  const reconcileActiveGate = f.membership.reconcileActiveGateMembershipPublication
    .bind(f.membership);
  f.membership.reconcileActiveGateMembershipPublication = async (...args) => {
    const outcome = await reconcileActiveGate(...args);
    runs.activeGate.push(outcome);
    return outcome;
  };
  return runs;
}

async function settle(f) {
  for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await f.membership.reconcileQueue.awaitCurrentWorkIdle();
}

test('owner-recovery wait goes idle while recovery is pending and publishes on the recovery owner progress event', async (t) => {
  const f = await autonomousHandoffFixture(t, {publishedActiveNodeIds: [...PUBLISHED]});
  const runs = countOwnerRuns(f);
  const writesBefore = f.writes.length;
  const handoff = ownerRecoveryWaitHandoff(f.publication().publication_epoch);

  // (a) The production entry point, through the owner's own queue.
  f.membership.enqueueClusterMembershipReconcile(
    'witness_owner_recovery_wait',
    {publicationActiveGateHandoff: handoff},
  );
  await settle(f);

  assert.equal(f.membership.reconcileQueue.stopped, false,
    'the owner queue was not cut by the hot-loop cap');
  assert.ok(runs.cluster <= 2,
    `a pending recovery answers with a bounded number of runs, saw ${runs.cluster}`);
  assert.equal(f.membership.reconcileQueue.isCurrentWorkIdle(), true,
    'the owner queue goes idle while recovery is pending');
  assert.equal(f.membership.reconcileQueue.size, 0,
    'no self re-enqueued work remains');
  assert.ok(runs.activeGate.length >= 1);
  const waitOutcome = runs.activeGate[0];
  assert.equal(waitOutcome.state,
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.TARGET_BLOCKED);
  assert.equal(waitOutcome.ownerRecoveryWait,
    MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.AWAITING_RECOVERY_PROGRESS,
    'the wait is a named state');
  assert.ok(waitOutcome.retryAfterMs > 0, 'the wait carries its bound');
  assert.equal(f.writes.length, writesBefore, 'no publication write while waiting');
  assert.deepEqual(JSON.parse(f.publication().published_active_node_ids), PUBLISHED);

  // (b) The recovery owner's progress: the target replica's row is delivered
  // as active (the CDC delivery port into the cache). The real priority
  // recovery owner observes it and wakes the publication owner.
  f.blocked = false;
  const runsBeforeProgress = runs.cluster;
  const target = f.target();
  f.cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE',
    {...target, status: 'active', raft_role: 'follower'});
  await settle(f);

  assert.ok(runs.cluster > runsBeforeProgress,
    'the recovery owner progress event runs the publication owner again');
  assert.ok(runs.cluster - runsBeforeProgress <= RUN_CAP);
  assert.equal(f.membership.reconcileQueue.stopped, false);
  assert.deepEqual(
    JSON.parse(f.publication().published_active_node_ids),
    [...PUBLISHED, RECOVERING],
    'the resumed reconcile publishes the recovered node',
  );
  assert.ok(f.writes.slice(writesBefore).some((write) =>
    write.sql.includes(TABLES.CONTROL_PLANE_PUBLICATIONS) && write.changes > 0),
  'the publication SQL commits after the progress event');
  assert.equal(f.membership.reconcileQueue.isCurrentWorkIdle(), true);
  assert.deepEqual(f.errors, []);
});
