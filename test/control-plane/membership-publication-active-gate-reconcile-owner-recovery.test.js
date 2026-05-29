import {test} from '../../src/test-helpers/tap.js';
import {
  reconcileActiveGateMembershipPublication,
} from '../../src/control-plane/membership-publication-active-gate-reconcile.js';
import {SnapshotService} from '../../src/control-plane/snapshot-service.js';

const OWNER_RECOVERY_LOCAL_NODE_ID = 'node-2';
const OWNER_RECOVERY_SCHEMA_VERSION = 1;
const OWNER_RECOVERY_PUBLICATION_EPOCH = 3;
const OWNER_RECOVERY_PENDING_STATE = 'pending';
const OWNER_RECOVERY_PENDING_REASON = 'owner_reconcile_pending';
const OWNER_RECOVERY_WAIT_ACTION = 'wait_owner_recovery';
const OWNER_RECOVERY_TARGET_BLOCKED = 'target_blocked';
const OWNER_RECOVERY_DRAINED_QUEUE_COUNT = 1;
const OWNER_RECOVERY_ENQUEUED_COUNT = 1;
const OWNER_RECOVERY_RECONCILE_REASON =
  'active_gate_handoff_owner_reconcile';
const OWNER_RECOVERY_RUNTIME_PROMOTION_ALLOWED = false;
const OWNER_RECOVERY_RECONCILE_REQUIRED = false;
const OWNER_RECOVERY_PUBLISHED_NODE_IDS = Object.freeze(['node-1']);
const OWNER_RECOVERY_PENDING_NODE_IDS = Object.freeze(['node-2']);
const OWNER_RECOVERY_EXPECTED_NODE_IDS = Object.freeze([
  ...OWNER_RECOVERY_PUBLISHED_NODE_IDS,
  ...OWNER_RECOVERY_PENDING_NODE_IDS,
]);
const OWNER_RECOVERY_EMPTY_DRAIN_COUNT = 0;

function buildOwnerRecoveryWaitHandoff() {
  return {
    schemaVersion: OWNER_RECOVERY_SCHEMA_VERSION,
    publicationEpoch: OWNER_RECOVERY_PUBLICATION_EPOCH,
    expectedNodeIds: [...OWNER_RECOVERY_EXPECTED_NODE_IDS],
    publishedActiveNodeIds: [...OWNER_RECOVERY_PUBLISHED_NODE_IDS],
    pendingRecoveryNodeIds: [...OWNER_RECOVERY_PENDING_NODE_IDS],
    pendingRecoveryCount: OWNER_RECOVERY_PENDING_NODE_IDS.length,
    runtimePromotionAllowed: OWNER_RECOVERY_RUNTIME_PROMOTION_ALLOWED,
    state: OWNER_RECOVERY_PENDING_STATE,
    reasonCode: OWNER_RECOVERY_PENDING_REASON,
    nextAction: OWNER_RECOVERY_WAIT_ACTION,
  };
}

function buildOwnerRecoveryCoordinator() {
  return {
    buildOwnerKey() {
      return OWNER_RECOVERY_LOCAL_NODE_ID;
    },
  };
}

function buildOwnerRecoveryEnqueueCoordinator(enqueueCalls) {
  return {
    buildOwnerKey() {
      return OWNER_RECOVERY_LOCAL_NODE_ID;
    },
    enqueueClusterMembershipReconcile(reason, context) {
      enqueueCalls.push({reason, context});
      return true;
    },
  };
}

test('active-gate owner recovery wait reports drained snapshot reentry',
  async (t) => {
    const originalDrainQueueForSnapshot = SnapshotService.drainQueueForSnapshot;
    SnapshotService.drainQueueForSnapshot =
      async () => OWNER_RECOVERY_DRAINED_QUEUE_COUNT;
    try {
      const publicationOutcome = await reconcileActiveGateMembershipPublication(
        buildOwnerRecoveryCoordinator(),
        buildOwnerRecoveryWaitHandoff(),
      );

      t.match(
        publicationOutcome,
        {
          state: OWNER_RECOVERY_TARGET_BLOCKED,
          enqueued: true,
          target: {
            reconcileRequired: OWNER_RECOVERY_RECONCILE_REQUIRED,
            pendingRecoveryNodeIds: [...OWNER_RECOVERY_PENDING_NODE_IDS],
          },
        },
        'owner-recovery wait should expose successful snapshot drain as bounded reentry',
      );
    } finally {
      SnapshotService.drainQueueForSnapshot = originalDrainQueueForSnapshot;
    }
  });

test('active-gate owner recovery wait enqueues owner wake reentry',
  async (t) => {
    const enqueueCalls = [];
    const originalDrainQueueForSnapshot = SnapshotService.drainQueueForSnapshot;
    const originalIsQueuePressureDetected =
      SnapshotService.isQueuePressureDetected;
    SnapshotService.isQueuePressureDetected = () => false;
    SnapshotService.drainQueueForSnapshot =
      async () => OWNER_RECOVERY_EMPTY_DRAIN_COUNT;
    try {
      const publicationOutcome = await reconcileActiveGateMembershipPublication(
        buildOwnerRecoveryEnqueueCoordinator(enqueueCalls),
        buildOwnerRecoveryWaitHandoff(),
      );

      t.match(
        publicationOutcome,
        {
          state: OWNER_RECOVERY_TARGET_BLOCKED,
          enqueued: true,
          target: {
            pendingRecoveryNodeIds: [...OWNER_RECOVERY_PENDING_NODE_IDS],
          },
        },
        'owner-recovery wait should expose accepted owner wake as bounded reentry',
      );
      t.equal(
        enqueueCalls.length,
        OWNER_RECOVERY_ENQUEUED_COUNT,
        'owner-recovery wait should enqueue one owner wake',
      );
      t.match(
        enqueueCalls[0],
        {
          reason: OWNER_RECOVERY_RECONCILE_REASON,
          context: {
            publicationActiveGateHandoff: {
              nextAction: OWNER_RECOVERY_WAIT_ACTION,
            },
          },
        },
        'owner wake should carry the active-gate handoff context',
      );
    } finally {
      SnapshotService.drainQueueForSnapshot = originalDrainQueueForSnapshot;
      SnapshotService.isQueuePressureDetected =
        originalIsQueuePressureDetected;
    }
  });

test('active-gate owner recovery wait reports queue pressure reentry',
  async (t) => {
    const originalDrainQueueForSnapshot = SnapshotService.drainQueueForSnapshot;
    const originalIsQueuePressureDetected =
      SnapshotService.isQueuePressureDetected;
    SnapshotService.isQueuePressureDetected = () => true;
    SnapshotService.drainQueueForSnapshot =
      async () => OWNER_RECOVERY_EMPTY_DRAIN_COUNT;
    try {
      const publicationOutcome = await reconcileActiveGateMembershipPublication(
        buildOwnerRecoveryCoordinator(),
        buildOwnerRecoveryWaitHandoff(),
      );

      t.match(
        publicationOutcome,
        {
          state: OWNER_RECOVERY_TARGET_BLOCKED,
          enqueued: true,
          target: {
            pendingRecoveryNodeIds: [...OWNER_RECOVERY_PENDING_NODE_IDS],
          },
        },
        'owner-recovery wait should expose queue pressure reset as bounded reentry',
      );
    } finally {
      SnapshotService.drainQueueForSnapshot = originalDrainQueueForSnapshot;
      SnapshotService.isQueuePressureDetected =
        originalIsQueuePressureDetected;
    }
  });
