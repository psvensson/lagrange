// Paired witnesses for the active-gate handoff's recovery evidence, driven
// from the production entry point (reconcileClusterMembership through the
// owner's own reconcile queue) on the real component substrate the
// owner-recovery-wait witness uses: real SQLite, cache, CDC, publication
// owner, readiness service and the real priority-recovery owner (rebalancer).
// The handoff is the contract's own build from the owner's planning snapshot
// and the readiness owner's entries; nothing in it is written by hand.
//
// W1 formation shape: two nodes published, a third READY node missing, the
//    publication recovery gate active. The readiness owner reports recovery
//    pending on EVERY node (a cluster fact). The owner publishes the third
//    node; it never waits for a gate that publishing helps clear.
// W2 a genuine recovery wait: every node published, the gate active because
//    priority spread is pending. Nothing is left for the publication owner:
//    it answers the named wait, runs a bounded number of times, writes
//    nothing, and runs again from current state on the recovery owner's
//    progress event.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {buildReadinessByNodeId} from
  '../../src/control-plane/active-node-projection.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  buildPublicationActiveGateHandoffContract,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {
  buildPublicationActiveGateMembershipConvergence,
} from '../../src/control-plane/publication-active-gate-handoff-contract-helpers.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE,
} from '../../src/control-plane/publication-active-gate-handoff-contract-recovery-evidence.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
} from '../../src/control-plane/membership-publication-active-gate-reconcile.js';
import {
  MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT,
} from '../../src/control-plane/membership-publication-owner-recovery-wait.js';
import {
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {
  resetFixtureSingletons,
  clearFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';
import {autonomousHandoffFixture, tick} from
  '../admin/completed-placement-autonomous-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const NODES = Object.freeze(['node-1', 'node-2', 'node-3']);
const PUBLISHED = Object.freeze(['node-1', 'node-2']);
const MISSING = 'node-3';
const RECOVERY_PENDING =
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;
// A hot loop is cut here so a spinning owner fails instead of starving the
// event loop for ever.
const RUN_CAP = 25;
const SETTLE_TURNS = 30;

// The handoff as its producers build it: the owner's planning snapshot, the
// snapshot owner's convergence, and the readiness owner's entries.
async function buildProductionHandoff(f) {
  const planningSnapshot = await f.membership.readPublicationPlanningSnapshot({
    readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
  });
  const readinessByNodeId = buildReadinessByNodeId({
    readinessEntries: await f.readiness.getAllNodeReadiness({
      allowAuthoritativeRefresh: true,
    }),
  });
  return {
    readinessByNodeId,
    handoff: buildPublicationActiveGateHandoffContract({
      nodeRows: planningSnapshot.nodeRows,
      readinessByNodeId,
      publicationConvergence:
        buildPublicationActiveGateMembershipConvergence(planningSnapshot),
    }),
  };
}

function reasonCodesOf(readinessEntry) {
  return readinessEntry.reasons.map((reason) => reason.code);
}

function countOwnerRuns(f) {
  const runs = {activeGate: [], cluster: []};
  const reconcileCluster = f.membership.reconcileClusterMembership
    .bind(f.membership);
  f.membership.reconcileClusterMembership = async (options = {}) => {
    if (runs.cluster.length >= RUN_CAP) {
      f.membership.reconcileQueue.shutdown();
      return {deferred: true, reason: 'witness_run_cap'};
    }
    const run = {routedHandoff: Boolean(options.publicationActiveGateHandoff)};
    runs.cluster.push(run);
    run.outcome = await reconcileCluster(options);
    return run.outcome;
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

function publishedNodeIds(f) {
  return JSON.parse(f.publication().published_active_node_ids);
}

test('W1 formation: a READY node missing from the publication is published while the recovery gate is active, and the gate then clears', async (t) => {
  const f = await autonomousHandoffFixture(t, {publishedActiveNodeIds: [...PUBLISHED]});
  f.blocked = false;
  const runs = countOwnerRuns(f);
  const epochBefore = f.publication().publication_epoch;
  const {handoff, readinessByNodeId} = await buildProductionHandoff(f);

  // The readiness owner states recovery pending on the published nodes and
  // on the missing node alike: it is the cluster's gate, not a node's state.
  for (const nodeId of NODES) {
    assert.ok(reasonCodesOf(readinessByNodeId[nodeId]).includes(RECOVERY_PENDING),
      `${nodeId} carries the cluster recovery reason`);
  }
  assert.equal(handoff.recoveryGate.state,
    PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.ACTIVE);
  assert.deepEqual(handoff.missingPublishedNodeIds, [MISSING]);
  assert.deepEqual(handoff.pendingRecoveryNodeIds, [],
    'the cluster gate lists no node as waiting');
  assert.deepEqual(handoff.pendingReconcileNodeIds, [MISSING]);
  assert.equal(handoff.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
      .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION);

  f.membership.enqueueClusterMembershipReconcile(
    'witness_formation_missing_node',
    {publicationActiveGateHandoff: handoff},
  );
  await settle(f);

  assert.equal(f.membership.reconcileQueue.stopped, false,
    'the owner queue was not cut by the hot-loop cap');
  assert.equal(runs.activeGate.length, 1, 'one handoff-routed owner run');
  assert.equal(runs.activeGate[0].state,
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.PUBLISHED_VISIBLE);
  assert.equal(runs.activeGate[0].ownerRecoveryWait,
    MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.NOT_WAITING);
  assert.deepEqual(runs.activeGate[0].target.publishedActiveNodeIds, NODES,
    'the missing node is a reconcile target');
  assert.deepEqual(publishedNodeIds(f), NODES,
    'the durable publication row covers three nodes');
  assert.ok(f.publication().publication_epoch > epochBefore);
  assert.equal(f.membership.reconcileQueue.isCurrentWorkIdle(), true);
  assert.equal(f.membership.reconcileQueue.size, 0, 'no re-enqueued work');

  // The owner's driver cadence delivers the committed row to the cache; the
  // readiness owner then no longer reports the gate.
  await tick(f);
  const after = await buildProductionHandoff(f);
  for (const nodeId of NODES) {
    assert.ok(
      !reasonCodesOf(after.readinessByNodeId[nodeId]).includes(RECOVERY_PENDING),
      `${nodeId} no longer carries the cluster recovery reason`);
  }
  assert.equal(after.handoff.recoveryGate.state,
    PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.CLEAR);
  assert.deepEqual(after.handoff.missingPublishedNodeIds, []);
  assert.notEqual(after.handoff.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY);
  assert.deepEqual(f.errors, []);
});

test('W2 recovery wait: with every node published and priority spread pending the owner waits without spinning and runs again on the recovery owner progress event', async (t) => {
  const f = await autonomousHandoffFixture(t);
  f.blocked = false;
  const runs = countOwnerRuns(f);
  const writesBefore = f.writes.length;
  const {handoff} = await buildProductionHandoff(f);

  assert.deepEqual(handoff.missingPublishedNodeIds, []);
  assert.deepEqual(handoff.pendingRecoveryNodeIds, []);
  assert.equal(handoff.recoveryGate.state,
    PUBLICATION_ACTIVE_GATE_HANDOFF_RECOVERY_GATE_STATE.ACTIVE);
  assert.equal(handoff.nextAction,
    PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION.WAIT_OWNER_RECOVERY,
    'nothing to publish and the gate active: the recovery owner is what remains');

  f.membership.enqueueClusterMembershipReconcile(
    'witness_recovery_gate_wait',
    {publicationActiveGateHandoff: handoff},
  );
  await settle(f);

  assert.equal(f.membership.reconcileQueue.stopped, false);
  assert.ok(runs.cluster.length <= 2,
    `a gate wait answers with a bounded number of runs, saw ${runs.cluster.length}`);
  assert.equal(runs.activeGate.length, 1);
  const waitOutcome = runs.activeGate[0];
  assert.equal(waitOutcome.state,
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.TARGET_BLOCKED);
  assert.equal(waitOutcome.ownerRecoveryWait,
    MEMBERSHIP_PUBLICATION_OWNER_RECOVERY_WAIT.AWAITING_RECOVERY_PROGRESS,
    'the wait is a named state although no node is listed');
  assert.equal(waitOutcome.target.pendingRecoveryCount, 0);
  assert.ok(waitOutcome.retryAfterMs > 0, 'the wait carries its bound');
  assert.equal(f.membership.reconcileQueue.isCurrentWorkIdle(), true,
    'the owner queue goes idle while it waits');
  assert.equal(f.membership.reconcileQueue.size, 0,
    'no self re-enqueued work remains');
  assert.equal(f.writes.length, writesBefore, 'no publication write while waiting');

  // The recovery owner's progress: the target replica's row is delivered as
  // active. The real priority-recovery owner observes it and wakes the
  // publication owner, which re-derives from current rows (no handoff).
  const runsBeforeProgress = runs.cluster.length;
  f.cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE',
    {...f.target(), status: 'active', raft_role: 'follower'});
  await settle(f);

  const resumed = runs.cluster.slice(runsBeforeProgress);
  assert.ok(resumed.length >= 1,
    'the recovery owner progress event runs the publication owner again');
  assert.ok(resumed.length <= RUN_CAP);
  assert.equal(f.membership.reconcileQueue.stopped, false);
  assert.ok(resumed.every((run) => run.routedHandoff === false),
    'the resumed run carries no captured handoff');
  assert.equal(
    resumed.at(-1).outcome.candidate.priorityPartitionSummary.satisfied,
    true,
    'the resumed run derives the completed spread from current rows',
  );
  assert.equal(f.membership.reconcileQueue.isCurrentWorkIdle(), true);
  assert.deepEqual(f.errors, []);
});
