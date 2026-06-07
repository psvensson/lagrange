import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {TABLES} from '../../src/constants/tables.js';
import {
  HeartbeatService,
} from '../../src/control-plane/heartbeat-service.js';
import {
  initEnv,
} from './heartbeat-memory-trend-test-helpers.js';

const RECONCILE_WORK_DURATION_MS = 1200;
const POLL_INTERVAL_MS = 25;
const POLL_TIMEOUT_MS = 4000;
const OWNER_NODE_ID = 'owner-node';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Regression guard for the rolling-restart livelock: a previous working-tree
// change wrapped the owner membership-publication reconcile in a 1000ms
// Promise.race. Under transport saturation the reconcile always exceeded the
// race window, rejected with deferRetry, and the OwnerKeyReconcileQueue retried
// forever — missingPublishedCount stayed > 0 and the active gate never went
// green. The reconcile must be allowed to complete; only its own bounded
// retry/defer paths may reschedule it.
test('a membership-publication owner reconcile that runs longer than one ' +
  'second is not killed by a queue race and the queue still drains',
async (t) => {
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: OWNER_NODE_ID,
  });
  let reconcileCalls = 0;
  let reconcileCompleted = false;
  coordinator.reconcileClusterMembership = async () => {
    reconcileCalls += 1;
    await delay(RECONCILE_WORK_DURATION_MS);
    reconcileCompleted = true;
    return {outcome: 'published'};
  };

  let drainDeferred = false;
  coordinator.reconcileQueue.on('retryable_drain_deferred', () => {
    drainDeferred = true;
  });
  coordinator.reconcileQueue.on('retryable_drain_failure', () => {
    drainDeferred = true;
  });

  const accepted = coordinator.enqueueClusterMembershipReconcile(
    'rolling-restart-regression',
    {
      publicationActiveGateHandoff: {
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      },
    },
  );
  t.equal(accepted, true,
    'the owner reconcile should be accepted onto the queue');

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (
    Date.now() < deadline &&
    (!reconcileCompleted || coordinator.reconcileQueue.inFlight.size > 0)
  ) {
    await delay(POLL_INTERVAL_MS);
  }

  t.equal(reconcileCalls, 1, 'the reconcile work should run exactly once');
  t.equal(reconcileCompleted, true,
    'the >1s reconcile work should run to completion, not be aborted by a ' +
    'timeout race');
  t.equal(drainDeferred, false,
    'no retryable-drain timeout/deferral should fire for slow-but-healthy ' +
    'reconcile work');
  t.equal(coordinator.reconcileQueue.inFlight.size, 0,
    'the owner key should be released and the queue drained');
  t.equal(coordinator.reconcileQueue.pending.size, 0,
    'no pending owner work should remain after the drain');
});

// Regression guard for the scheduled membership-publication reconcile tick:
// the heartbeat watchdog does not cancel an in-flight reconcile, so without a
// single-flight guard two overlapping heartbeat ticks could both drive the
// owner reconcile. The tick must short-circuit while a prior tick is still in
// flight, then resume once it clears.
test('the scheduled membership-publication reconcile tick single-flights ' +
  'while a prior tick is still in flight', async (t) => {
  initEnv();

  let snapshotReads = 0;
  let releaseSnapshot;
  const firstSnapshotGate = new Promise((resolve) => {
    releaseSnapshot = resolve;
  });

  const service = new HeartbeatService({
    nodeId: OWNER_NODE_ID,
    nodeAddress: '10.0.0.1:8080',
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: {
      get: () => null,
      getAll: (table) => (table === TABLES.PARTITIONS ?
        [{
          table_id: TABLES.CONTROL_PLANE_PUBLICATIONS,
          leader_node_id: OWNER_NODE_ID,
        }] :
        []),
    },
    membershipPublicationService: {
      readPublicationPlanningSnapshot: async () => {
        snapshotReads += 1;
        if (snapshotReads === 1) {
          await firstSnapshotGate;
        }
        return null;
      },
      reconcileActiveGateMembershipPublication: async () => {},
    },
  });

  const firstTick = service.runScheduledMembershipPublicationReconcileTick();
  // Yield so the first tick reaches and parks on the snapshot read.
  await delay(POLL_INTERVAL_MS);
  t.equal(snapshotReads, 1,
    'the first tick should be in flight at the snapshot read');

  await service.runScheduledMembershipPublicationReconcileTick();
  t.equal(snapshotReads, 1,
    'a concurrent tick must short-circuit instead of starting a second read');

  releaseSnapshot();
  await firstTick;
  t.equal(service.scheduledReconcileTickInFlight, false,
    'the in-flight guard should clear once the tick finishes');

  await service.runScheduledMembershipPublicationReconcileTick();
  t.equal(snapshotReads, 2,
    'a later tick should run normally once the guard has cleared');
});
