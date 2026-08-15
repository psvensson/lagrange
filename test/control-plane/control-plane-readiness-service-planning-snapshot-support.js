import {test} from '../../src/test-helpers/tap.js';
import {
  createAccountingService,
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';
import {
  NUM,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../../src/cdc/cdc-integration-service.js';
import {
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
} from '../../src/control-plane/priority-recovery-snapshot.js';

const TEST_STARTUP_ADMISSION_STATE_BLOCKED = 'blocked';

const TEST_STARTUP_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';

const TEST_PRIORITY_RECOVERY_PENDING_REASON =
  'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING';

const TEST_PRIORITY_SERVE_NODE_ID = 'node-priority-recovery-serve';

const TEST_PRIORITY_SERVE_PARTITION_ID = 'replica_operations-p1';

const TEST_PRIORITY_SERVE_EPOCH = 44;

const TEST_PRIORITY_SERVE_OBSERVED_AT = '2026-04-23T09:05:00.000Z';

const TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT =
  '2026-04-23T09:04:00.000Z';

const TEST_PRIORITY_SERVE_READY_LEASE_EXPIRES_AT = 2000;

const TEST_PRIORITY_SERVE_LAST_HEARTBEAT = 1000;

const TEST_PRIORITY_SERVE_BUDGET_BYTES = 1000;

const TEST_COUNT_ONLY_ACK_DEBT_COUNT = 1;

const TEST_COUNT_ONLY_ACK_NODE_ID = 'node-count-only-ack-debt';

const TEST_COUNT_ONLY_ACK_OBSERVED_AT = 1900;

const TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH = 52;

const TEST_COUNT_ONLY_ACK_PUBLICATION_CREATED_AT = 1500;

const TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY = Object.freeze({
  satisfied: true,
  requiredDistinctNodeCount: 3,
  missingPartitionIds: Object.freeze([]),
  blockedPartitions: Object.freeze([]),
});

const TEST_LOCAL_CLUSTER_INCARNATION_FENCE_BLOCKED = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze([
    TEST_STARTUP_ADMISSION_REASON_CLUSTER_INTEGRITY,
  ]),
  localIdentityState: 'mismatched',
  durableMembershipState: 'present',
  peerProofState: 'recovered',
});

test('ControlPlaneReadinessService prefers the async planning snapshot when it arrives within the best-effort budget',
  async (t) => {
    let planningPublicationReadOptions = null;
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-best-effort-async',
      systemTableCache: createCache(),
      membershipPublicationService: {
        async getLatestPublicationForNode(_nodeId, options = {}) {
          planningPublicationReadOptions = options;
          return {
            publicationEpoch: 22,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-best-effort-async'],
          };
        },
        getLatestPublicationForNodeSync() {
          return {
            publicationEpoch: 21,
            status: 'PUBLISHED',
            createdAt: 1100,
            publishedActiveNodeIds: ['node-best-effort-async'],
          };
        },
      },
      now: () => 1500,
    });

    const snapshot =
      await readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
        'node-best-effort-async',
        1500,
      );

    t.equal(
      snapshot?.publishedPlanningEpoch,
      22,
      'best-effort planning should use the fresher async owner snapshot when it is available',
    );
    t.equal(
      planningPublicationReadOptions?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_PREFERRED_SQL_FALLBACK,
      'best-effort planning reads should use the best-effort owner-RPC publication mode',
    );
    t.equal(
      planningPublicationReadOptions?.localReadConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
      'best-effort planning reads should read from local leaders where available',
    );
    t.equal(
      planningPublicationReadOptions?.replicaFallbackConsistency,
      LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
      'best-effort planning reads should allow any-replica fallback when the leader path is unavailable',
    );
    t.equal(
      planningPublicationReadOptions?.workClass,
      'control-plane-planning',
      'best-effort planning reads should be labeled with the planning work class',
    );
    t.equal(
      planningPublicationReadOptions?.queryTimeoutMs,
      NUM.THOUSAND,
      'best-effort planning reads should use the readiness planning budget for owner read timeout',
    );
  });

test('ControlPlaneReadinessService falls back to the sync planning snapshot when the best-effort refresh times out',
  async (t) => {
    const timeoutHandle = {
      id: 'planning-timeout',
      unrefCalled: false,
      unref() {
        this.unrefCalled = true;
      },
    };
    let clearedHandle = null;
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-best-effort-timeout',
      systemTableCache: createCache(),
      membershipPublicationService: {
        async getLatestPublicationForNode() {
          return new Promise(() => {});
        },
        getLatestPublicationForNodeSync() {
          return {
            publicationEpoch: 23,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-best-effort-timeout'],
          };
        },
      },
      membershipPublicationPlanningSnapshotRefreshTimeoutMs: 5,
      setTimeoutFn(fn) {
        fn();
        return timeoutHandle;
      },
      clearTimeoutFn(handle) {
        clearedHandle = handle;
      },
      now: () => 1500,
    });

    const snapshot =
      await readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
        'node-best-effort-timeout',
        1500,
      );

    t.equal(
      snapshot?.publishedPlanningEpoch,
      23,
      'best-effort planning should fall back to the sync snapshot when async repair stalls',
    );
    t.equal(
      clearedHandle,
      timeoutHandle,
      'best-effort planning should clear the timeout handle after the owner fallback resolves',
    );
    t.equal(
      timeoutHandle.unrefCalled,
      true,
      'best-effort planning timeout should be unrefed so owner fallback does not pin process exit',
    );
  });

test('ControlPlaneReadinessService exposes canonical priority-recovery planning answer sync surface',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-sync-contract',
      systemTableCache: createCache(),
      membershipPublicationService: {
        getLatestPublicationForNodeSync() {
          return {
            publicationEpoch: 33,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-priority-sync-contract'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
            },
          };
        },
      },
      now: () => 1500,
    });

    const answer =
      readinessService.getPriorityRecoveryPlanningAnswerSync(
        'node-priority-sync-contract',
        1500,
      );

    t.equal(
      answer?.publishedPlanningEpoch,
      33,
      'canonical sync planning answer should stay on the owner surface',
    );
    t.equal(
      answer?.recoveryProtocolState,
      'steady_published',
      'canonical sync planning answer should preserve recovery protocol visibility',
    );
    t.end();
  });

test('ControlPlaneReadinessService enriches the local planning answer with startup admission evidence',
  (t) => {
    const nodeId = 'node-priority-local-admission';
    const readinessService = new ControlPlaneReadinessService({
      nodeId,
      systemTableCache: createCache(),
      getLocalClusterIncarnationFence: () =>
        TEST_LOCAL_CLUSTER_INCARNATION_FENCE_BLOCKED,
      membershipPublicationService: {
        getLatestPublicationForNodeSync(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 35,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: [nodeId],
            requiredAckNodeIds: [nodeId],
            acknowledgedNodeIds: [nodeId],
          };
        },
      },
      now: () => 1500,
    });

    const answer =
      readinessService.getPriorityRecoveryPlanningAnswerSync(
        nodeId,
        1500,
      );

    t.equal(
      answer?.admissionState,
      TEST_STARTUP_ADMISSION_STATE_BLOCKED,
      'local planning answers should preserve the startup-owned admission block',
    );
    t.same(
      answer?.admissionReasonCodes,
      [TEST_STARTUP_ADMISSION_REASON_CLUSTER_INTEGRITY],
      'local planning answers should carry the canonical admission reason codes',
    );
    t.same(
      answer?.clusterIncarnationFence,
      TEST_LOCAL_CLUSTER_INCARNATION_FENCE_BLOCKED,
      'local planning answers should keep the startup fence evidence attached',
    );
    t.end();
  });

test('ControlPlaneReadinessService exposes canonical priority-recovery planning answer best-effort surface',
  async (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-best-effort-contract',
      systemTableCache: createCache(),
      membershipPublicationService: {
        async getLatestPublicationForNode() {
          return {
            publicationEpoch: 34,
            status: 'PUBLISHED',
            createdAt: 1450,
            publishedActiveNodeIds: ['node-priority-best-effort-contract'],
          };
        },
        getLatestPublicationForNodeSync() {
          return {
            publicationEpoch: 31,
            status: 'PUBLISHED',
            createdAt: 1100,
            publishedActiveNodeIds: ['node-priority-best-effort-contract'],
          };
        },
      },
      now: () => 1500,
    });

    const answer =
      await readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
        'node-priority-best-effort-contract',
        1500,
      );

    t.equal(
      answer?.publishedPlanningEpoch,
      34,
      'canonical best-effort planning answer should prefer refreshed owner snapshots',
    );
  });

test('ControlPlaneReadinessService reuses the last active sync priority-recovery planning answer inside stale grace',
  (t) => {
    const nodeId = 'node-priority-sync-stale-grace';
    let now = 1500;
    let publicationRow = {
      publicationEpoch: 41,
      status: 'PUBLISHED',
      createdAt: 1200,
      publishedActiveNodeIds: ['seed-node'],
      priorityPartitionSummary: {
        satisfied: false,
      },
    };
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'seed-node',
      systemTableCache: createCache(),
      membershipPublicationService: {
        getLatestPublicationForNodeSync(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return publicationRow;
        },
        getLatestMembershipPublicationEpochStatusForNodeSync(targetNodeId) {
          return targetNodeId === nodeId ? publicationRow : null;
        },
      },
      now: () => now,
    });

    const activeAnswer = readinessService.getPriorityRecoveryPlanningAnswerSync(
      nodeId,
      now,
    );

    t.equal(
      activeAnswer?.priorityRecoveryActive,
      true,
      'sync planning answer should surface the active recovery state',
    );

    publicationRow = {
      publicationEpoch: 42,
      status: 'PUBLISHED',
      createdAt: 1600,
      publishedActiveNodeIds: [nodeId],
    };
    now = 1600;

    const retainedAnswer =
      readinessService.getPriorityRecoveryPlanningAnswerSync(
        nodeId,
        now,
      );

    t.equal(
      retainedAnswer?.priorityRecoveryActive,
      true,
      'sync planning answer should retain the last active recovery state while the planning lane is incomplete',
    );
    t.same(
      retainedAnswer?.priorityRecoveryReasonCodes,
      [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      'retained sync planning answer should preserve only the still-active publication-gate reasons from the current planning evidence',
    );
    t.equal(
      retainedAnswer?.publicationRecoveryGate?.active,
      true,
      'retained sync planning answer should preserve the shared active recovery gate',
    );
    t.same(
      retainedAnswer?.publicationRecoveryGate?.reasonCodes,
      [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
      'retained sync planning answer should preserve only the still-active shared gate reasons',
    );

    publicationRow = {
      publicationEpoch: 43,
      status: 'PUBLISHED',
      createdAt: 1700,
      publishedActiveNodeIds: [nodeId],
    };
    now += DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS + 1;

    const expiredAnswer = readinessService.getPriorityRecoveryPlanningAnswerSync(
      nodeId,
      now,
    );

    t.equal(
      expiredAnswer?.priorityRecoveryActive,
      false,
      'sync planning answer should clear the retained recovery state once stale grace expires',
    );
    t.equal(
      expiredAnswer?.publicationRecoveryGate?.active,
      false,
      'sync planning answer should clear the retained shared recovery gate once stale grace expires',
    );
    t.end();
  });

test('ControlPlaneReadinessService retains a fresher async priority-recovery planning answer across sync epoch regression',
  async (t) => {
    const LOCAL_NODE_ID = 'seed-node';
    const TARGET_NODE_ID = 'node-priority-async-regression';
    const ACTIVE_PUBLICATION_EPOCH = 52;
    const STABLE_PUBLICATION_EPOCH = 51;
    const INITIAL_OBSERVED_AT = 1500;
    const SYNC_REGRESSION_OBSERVED_AT = 1600;
    const SETTLED_OBSERVED_AT = 1700;
    const PUBLISHED_STATUS = 'PUBLISHED';
    const ACK_PENDING_STATUS = 'ACK_PENDING';
    const ACTIVE_REASON_CODES = Object.freeze([
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    ]);
    const ACTIVE_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: false,
    });
    const SETTLED_PRIORITY_PARTITION_SUMMARY = Object.freeze({
      satisfied: true,
    });

    let now = INITIAL_OBSERVED_AT;
    let publicationRow = {
      publicationEpoch: STABLE_PUBLICATION_EPOCH,
      status: PUBLISHED_STATUS,
      createdAt: 1200,
      publishedActiveNodeIds: [TARGET_NODE_ID],
      priorityPartitionSummary: SETTLED_PRIORITY_PARTITION_SUMMARY,
    };
    const readinessService = new ControlPlaneReadinessService({
      nodeId: LOCAL_NODE_ID,
      systemTableCache: createCache(),
      membershipPublicationService: {
        getLatestPublicationForNodeSync(targetNodeId) {
          if (targetNodeId !== TARGET_NODE_ID) {
            return null;
          }
          return publicationRow;
        },
        getLatestMembershipPublicationEpochStatusForNodeSync(targetNodeId) {
          return targetNodeId === TARGET_NODE_ID ? publicationRow : null;
        },
        async deriveClusterMembershipCandidate(options = {}) {
          if (options.publisherNodeId !== TARGET_NODE_ID) {
            return null;
          }
          return {
            publicationEpoch: ACTIVE_PUBLICATION_EPOCH,
            publicationStatus: ACK_PENDING_STATUS,
            priorityPartitionSummary: ACTIVE_PRIORITY_PARTITION_SUMMARY,
            priorityRecoveryReasonCodes: ACTIVE_REASON_CODES,
            priorityRecoveryActive: true,
          };
        },
      },
      now: () => now,
    });

    const bestEffortAnswer =
      await readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
        TARGET_NODE_ID,
        INITIAL_OBSERVED_AT,
      );

    t.equal(
      bestEffortAnswer?.priorityRecoveryActive,
      true,
      'best-effort planning should capture the fresher active recovery epoch',
    );
    t.equal(
      bestEffortAnswer?.publicationRecoveryGate?.active,
      true,
      'best-effort planning should expose the shared active recovery gate',
    );
    t.equal(
      bestEffortAnswer?.publicationEpoch,
      ACTIVE_PUBLICATION_EPOCH,
      'best-effort planning should expose the fresher publication epoch',
    );

    now = SYNC_REGRESSION_OBSERVED_AT;
    publicationRow = {
      publicationEpoch: STABLE_PUBLICATION_EPOCH,
      status: PUBLISHED_STATUS,
      createdAt: SYNC_REGRESSION_OBSERVED_AT,
      publishedActiveNodeIds: [TARGET_NODE_ID],
      priorityPartitionSummary: SETTLED_PRIORITY_PARTITION_SUMMARY,
    };

    const retainedAnswer =
      readinessService.getPriorityRecoveryPlanningAnswerSync(
        TARGET_NODE_ID,
        SYNC_REGRESSION_OBSERVED_AT,
      );

    t.equal(
      retainedAnswer?.priorityRecoveryActive,
      true,
      'sync planning should retain the fresher active recovery witness when the visible publication epoch regresses',
    );
    t.equal(
      retainedAnswer?.publicationEpoch,
      ACTIVE_PUBLICATION_EPOCH,
      'sync planning should keep the newer active publication epoch during regression',
    );
    t.same(
      retainedAnswer?.priorityRecoveryReasonCodes,
      ACTIVE_REASON_CODES,
      'sync planning should preserve the retained active recovery reasons during regression',
    );
    t.equal(
      retainedAnswer?.publicationRecoveryGate?.active,
      true,
      'sync planning should preserve the retained shared active recovery gate during regression',
    );

    now = SETTLED_OBSERVED_AT;
    publicationRow = {
      publicationEpoch: ACTIVE_PUBLICATION_EPOCH,
      status: PUBLISHED_STATUS,
      createdAt: SETTLED_OBSERVED_AT,
      publishedActiveNodeIds: [TARGET_NODE_ID],
      priorityPartitionSummary: SETTLED_PRIORITY_PARTITION_SUMMARY,
    };

    const settledAnswer =
      readinessService.getPriorityRecoveryPlanningAnswerSync(
        TARGET_NODE_ID,
        SETTLED_OBSERVED_AT,
      );

    t.equal(
      settledAnswer?.priorityRecoveryActive,
      false,
      'sync planning should clear the retained active witness once the newer epoch settles',
    );
    t.equal(
      settledAnswer?.publicationRecoveryGate?.active,
      false,
      'sync planning should clear the retained shared recovery gate once the newer epoch settles',
    );
    t.equal(
      settledAnswer?.publicationEpoch,
      ACTIVE_PUBLICATION_EPOCH,
      'sync planning should return the settled newer epoch once it becomes durably visible',
    );
    t.end();
  });

test('ControlPlaneReadinessService exposes a readiness-owned current published membership epoch',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-current-epoch',
      systemTableCache: createCache(),
      membershipPublicationService: {
        getLatestPublicationForNodeSync() {
          return {
            publicationEpoch: 24,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['node-current-epoch'],
          };
        },
      },
      now: () => 1500,
    });

    t.equal(
      readinessService.getCurrentPublishedMembershipEpochSync(
        'node-current-epoch',
        1500,
      ),
      24,
      'published membership epoch should come from the readiness-owned planning surface',
    );

    readinessService.getMembershipPublicationPlanningSnapshotSync = () => null;
    readinessService.getMembershipPublicationDiagnosticsSync = () => ({
      publicationEpoch: 25,
      status: 'PUBLISHED',
    });

    t.equal(
      readinessService.getCurrentPublishedMembershipEpochSync(
        'node-current-epoch',
        1500,
      ),
      null,
      'owner-owned epoch reads should fail closed when the planning answer is unavailable',
    );
    t.end();
  });

test('ControlPlaneReadinessService projects control-plane writable blockers through the canonical recovery projection',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'seed-node',
      systemTableCache: createCache(),
      now: () => 1500,
    });

    const projection = readinessService.getPriorityControlPlaneRecoveryState({
      observedAt: 1500,
      membershipPublication: {
        publicationEpoch: 24,
        status: 'PUBLISHED',
        createdAt: 1200,
      },
      membershipPublicationPlanningSnapshot: {
        publicationEpoch: 24,
        publicationStatus: 'PUBLISHED',
        priorityPartitionSummary: {
          satisfied: true,
        },
      },
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
          true,
      },
    });

    t.equal(
      projection.publicationRecoveryGate.active,
      false,
      'settled publication gate should stay ready',
    );
    t.same(
      projection.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE],
      'readiness projection should add the canonical writable blocker without rebuilding gate meaning locally',
    );
    t.equal(
      projection.active,
      false,
      'runtime blockers must not reopen publication-gate recovery once the gate is ready',
    );
    t.equal(
      projection.publicationGateReady,
      true,
      'the projection should expose the canonical gate as ready',
    );
    t.same(
      projection.runtimeBlockerReasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE],
      'runtime blockers should stay separate from the publication gate reasons',
    );
    t.end();
  });

export {
  TEST_COUNT_ONLY_ACK_DEBT_COUNT,
  TEST_COUNT_ONLY_ACK_NODE_ID,
  TEST_COUNT_ONLY_ACK_OBSERVED_AT,
  TEST_COUNT_ONLY_ACK_PUBLICATION_CREATED_AT,
  TEST_COUNT_ONLY_ACK_PUBLICATION_EPOCH,
  TEST_COUNT_ONLY_ACK_READY_PARTITION_SUMMARY,
  TEST_LOCAL_CLUSTER_INCARNATION_FENCE_BLOCKED,
  TEST_PRIORITY_RECOVERY_PENDING_REASON,
  TEST_PRIORITY_SERVE_BUDGET_BYTES,
  TEST_PRIORITY_SERVE_EPOCH,
  TEST_PRIORITY_SERVE_LAST_HEARTBEAT,
  TEST_PRIORITY_SERVE_NODE_ID,
  TEST_PRIORITY_SERVE_OBSERVED_AT,
  TEST_PRIORITY_SERVE_PARTITION_ID,
  TEST_PRIORITY_SERVE_PUBLICATION_CREATED_AT,
  TEST_PRIORITY_SERVE_READY_LEASE_EXPIRES_AT,
  TEST_STARTUP_ADMISSION_REASON_CLUSTER_INTEGRITY,
  TEST_STARTUP_ADMISSION_STATE_BLOCKED,
  createAccountingService,
  createActiveNode,
  createCache,
  createMessageGroupService,
  createPublicationService,
};
