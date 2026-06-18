import t from 'tap';
import {
  MembershipPublicationCoordinatorReconcile,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';

// Workstream A: the always-on owner-membership driver. Test gating + lifecycle
// directly via the prototype methods with a mock `this`.
const drive =
  MembershipPublicationCoordinatorReconcile.prototype.driveOwnerMembershipReconcile;
const start =
  MembershipPublicationCoordinatorReconcile.prototype.startOwnerMembershipDriver;
const stop =
  MembershipPublicationCoordinatorReconcile.prototype.stopOwnerMembershipDriver;

function leaderCache(leaderNodeId) {
  return {
    get: (table, key) =>
      table === 'partitions' && key === 'control_plane_publications-p1' ?
        {leader_node_id: leaderNodeId} :
        null,
    find: () => null,
  };
}

// The driver emits console-only convergence decision traces and readiness trace
// fields on every path; stub them on the mock `this`.
const traceStubs = () => ({
  _emitConvergenceDecisionTrace: () => {},
  _buildPublicationReadinessTraceFields: () => ({}),
});

t.test('drive: no-op when this node is NOT the publications leader', async (t) => {
  let planningCalls = 0;
  const ctx = {
    nodeId: 'seed',
    systemTableCache: leaderCache('other'), // leader is someone else
    readPublicationPlanningSnapshot: async () => {
      planningCalls += 1; return null;
    },
    reconcileActiveGateMembershipPublication: async () => {},
    logger: {},
    ...traceStubs(),
  };
  t.equal(await drive.call(ctx), false, 'returns false');
  t.equal(planningCalls, 0, 'gated before reading planning snapshot');
});

t.test('drive: no-op while a prior drive is in flight', async (t) => {
  let planningCalls = 0;
  const ctx = {
    nodeId: 'seed',
    ownerMembershipReconcileInFlight: true,
    systemTableCache: leaderCache('seed'),
    readPublicationPlanningSnapshot: async () => {
      planningCalls += 1; return null;
    },
    logger: {},
    ...traceStubs(),
  };
  t.equal(await drive.call(ctx), false);
  t.equal(planningCalls, 0, 'in-flight guard short-circuits');
});

t.test('drive: leader passes the gate and reads the planning snapshot', async (t) => {
  let planningCalls = 0;
  const ctx = {
    nodeId: 'seed',
    systemTableCache: leaderCache('seed'),
    readPublicationPlanningSnapshot: async () => {
      planningCalls += 1; return null;
    },
    reconcileActiveGateMembershipPublication: async () => {},
    assertSingleMembershipPartition: () => {},
    logger: {},
    ...traceStubs(),
  };
  t.equal(await drive.call(ctx), false, 'null snapshot -> false');
  t.equal(planningCalls, 1, 'leader proceeds past the gate');
  t.equal(ctx.ownerMembershipReconcileInFlight, false, 'in-flight reset in finally');
});

// CL-001 variant A guard: an OPEN publication whose published set has NO deficit
// (missingPublishedCount === 0) but is still awaiting a recovery-eligible ack must
// re-drive the owner reconcile to CLOSE it, instead of skipping with no-deficit.
function ackCompletionCtx({
  recoveryEligible,
  dimensions,
  publicationStatus = 'OPEN',
} = {}) {
  let reconcileCalls = 0;
  // recoveryEligible is the legacy single-dimension shorthand; dimensions lets a
  // case set the full readiness shape (clusterMemberHealthy/processAlive) directly.
  const peerDimensions =
    dimensions || {controlPlaneRecoveryEligible: recoveryEligible};
  const ctx = {
    nodeId: 'seed',
    systemTableCache: leaderCache('seed'),
    assertSingleMembershipPartition: () => {},
    now: () => 1,
    reconcileActiveGateMembershipPublication: async () => {
      reconcileCalls += 1;
    },
    readPublicationPlanningSnapshot: async () => ({
      // empty nodeRows -> expectedNodeIds empty -> missingPublishedCount === 0,
      // isolating the ack-completion path.
      nodeRows: [],
      readinessByNodeId: {
        peer: {dimensions: peerDimensions},
      },
      latestPublicationRow: {
        publicationEpoch: 20,
        status: publicationStatus,
        publishedActiveNodeIds: ['seed', 'peer'],
        requiredAckNodeIds: ['seed', 'peer'],
        acknowledgedNodeIds: ['seed'],
      },
      latestPublishedPublicationRow: null,
    }),
    logger: {warn: () => {}},
    ...traceStubs(),
  };
  return {ctx, reconcileCalls: () => reconcileCalls};
}

t.test('drive: re-drives an OPEN publication awaiting a recovery-eligible ack (CL-001)', async (t) => {
  const {ctx, reconcileCalls} = ackCompletionCtx({recoveryEligible: true});
  const drove = await drive.call(ctx);
  t.equal(drove, true, 'drives despite zero published-set deficit');
  t.equal(reconcileCalls(), 1, 'reconcile invoked to close the OPEN publication');
});

t.test('drive: re-drives an ACK_PENDING publication awaiting a recovery-eligible ack (CL-001)', async (t) => {
  const {ctx, reconcileCalls} = ackCompletionCtx({
    publicationStatus: 'ACK_PENDING',
    recoveryEligible: true,
  });
  const drove = await drive.call(ctx);
  t.equal(drove, true, 'drives despite zero published-set deficit');
  t.equal(
    reconcileCalls(),
    1,
    'reconcile invoked to close the ACK_PENDING publication',
  );
});

// CL-001 broadening (gate 20260613T075853Z): the recurring wedge is an OPEN
// publication whose pending-ack node is cluster-member-healthy (rejoined-then-
// graduated) but NOT recovery-eligible. The close lane defaults such a node to
// ELIGIBLE and carries it, so the owner must re-drive to close — the narrow
// recovery-eligible-only guard left this inert.
t.test('drive: re-drives when the pending-ack node is cluster-member-healthy and alive (CL-001 broadening)', async (t) => {
  const {ctx, reconcileCalls} = ackCompletionCtx({
    dimensions: {
      controlPlaneRecoveryEligible: false,
      clusterMemberHealthy: true,
      processAlive: true,
    },
  });
  const drove = await drive.call(ctx);
  t.equal(drove, true, 'drives: a healthy pending ack is carried by the close lane');
  t.equal(reconcileCalls(), 1, 'reconcile invoked to close the OPEN publication');
});

t.test('drive: does NOT re-drive when the pending-ack node is neither recovery-eligible nor cluster-member-healthy (thrash guard)', async (t) => {
  const {ctx, reconcileCalls} = ackCompletionCtx({recoveryEligible: false});
  const drove = await drive.call(ctx);
  t.equal(drove, false, 'skips: a non-eligible pending ack must not spin the driver');
  t.equal(reconcileCalls(), 0, 'no reconcile when the ack cannot complete');
});

// process-not-alive must NOT drive even if marked cluster-member-healthy: the
// close lane DEFERS a process-not-alive node, so re-driving would spin without
// closing. This node belongs to steady-trim, not owner re-drive.
t.test('drive: does NOT re-drive a process-not-alive pending node even if cluster-member-healthy (thrash guard)', async (t) => {
  const {ctx, reconcileCalls} = ackCompletionCtx({
    dimensions: {
      controlPlaneRecoveryEligible: false,
      clusterMemberHealthy: true,
      processAlive: false,
    },
  });
  const drove = await drive.call(ctx);
  t.equal(drove, false, 'skips: a dead required-ack node falls to steady-trim');
  t.equal(reconcileCalls(), 0, 'no reconcile for a process-not-alive pending node');
});

t.test('B4 tripwire: assertSingleMembershipPartition', async (t) => {
  const assertFn =
    MembershipPublicationCoordinatorReconcile.prototype.assertSingleMembershipPartition;
  // single partition -> no error, asserted latches true
  let errors = 0;
  const single = {
    nodeId: 'seed',
    logger: {error: () => {
      errors += 1;
    }},
    systemTableCache: {getAll: () => [{table_id: 'control_plane_publications', partition_id: 'control_plane_publications-p1'}]},
  };
  assertFn.call(single);
  t.equal(errors, 0, 'single partition -> no critical log');
  t.equal(single.membershipSinglePartitionAsserted, true, 'latched');
  // multi partition -> critical error
  let multiErrors = 0;
  const multi = {
    nodeId: 'seed',
    logger: {error: () => {
      multiErrors += 1;
    }},
    systemTableCache: {getAll: () => [
      {table_id: 'control_plane_publications', partition_id: 'control_plane_publications-p1'},
      {table_id: 'control_plane_publications', partition_id: 'control_plane_publications-p2'},
    ]},
  };
  assertFn.call(multi);
  t.equal(multiErrors, 1, 'multi partition -> critical log');
  t.notOk(multi.membershipSinglePartitionAsserted, 'not latched while violated');
});

t.test('start: no-op when explicitly disabled', async (t) => {
  let intervals = 0;
  const ctx = {};
  start.call(ctx, {enabled: false, setIntervalFn: () => {
    intervals += 1;
  }});
  t.equal(intervals, 0);
  t.equal(ctx.ownerMembershipDriverTimer, undefined);
});

t.test('start: defaults enabled when no explicit option is provided', async (t) => {
  const priorFlag = process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN;
  delete process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN;
  t.teardown(() => {
    if (priorFlag === undefined) {
      delete process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN;
      return;
    }
    process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN = priorFlag;
  });
  let intervals = 0;
  const fakeTimer = {unref() {}};
  const ctx = {};
  start.call(ctx, {setIntervalFn: () => {
    intervals += 1; return fakeTimer;
  }});
  t.equal(intervals, 1, 'interval started with legacy flag unset');
  t.equal(ctx.ownerMembershipDriverTimer, fakeTimer);
  stop.call(ctx);
});

t.test('start/stop: enabled starts an interval; stop clears it', async (t) => {
  let intervals = 0;
  const fakeTimer = {unref() {}};
  const ctx = {};
  start.call(ctx, {enabled: true, setIntervalFn: () => {
    intervals += 1; return fakeTimer;
  }});
  t.equal(intervals, 1, 'interval started');
  t.equal(ctx.ownerMembershipDriverTimer, fakeTimer);
  // second start is idempotent
  start.call(ctx, {enabled: true, setIntervalFn: () => {
    intervals += 1;
  }});
  t.equal(intervals, 1, 'start is idempotent');
  stop.call(ctx);
  t.equal(ctx.ownerMembershipDriverTimer, null, 'stopped');
});
