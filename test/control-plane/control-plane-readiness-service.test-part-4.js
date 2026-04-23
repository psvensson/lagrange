import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  NUM,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
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

const TEST_DESCRIPTOR_STATE = Object.freeze({
  NONE: 'none',
});
const TEST_MISSING_NODE_READINESS_STATE = Object.freeze({
  SELF_RUNTIME_GRACE: 'self_runtime_grace',
});
const TEST_PROVISIONING_STATE = Object.freeze({
  CONVERGENCE_GRACE: 'convergence_grace',
  STEADY: 'steady',
});
const TEST_RUNTIME_AUTHORITY_PUBLICATION_STATE = Object.freeze({
  HEALTHY: 'healthy',
});
const TEST_RUNTIME_AUTHORITY_REPAIR_STATE = Object.freeze({
  NOT_ATTEMPTED: 'not_attempted',
});
const TEST_RUNTIME_AUTHORITY_STATE = Object.freeze({
  CONFIRMED: 'confirmed',
  ESTABLISHING: 'establishing',
  RETAINED: 'retained',
});
const TEST_RUNTIME_AUTHORITY_VISIBILITY_STATE = Object.freeze({
  CONFIRMED: 'confirmed',
  PENDING_PUBLICATION: 'pending_publication',
  RETAINED_LOCAL_RUNTIME: 'retained_local_runtime',
});
const TEST_STARTUP_ADMISSION_STATE_BLOCKED = 'blocked';
const TEST_STARTUP_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';
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

function createCache({nodes = [], services = []} = {}) {
  const nodeRows = new Map(nodes.map((row) => [row[COLUMN.NODE_ID], row]));
  const serviceRows = new Map(
    services.map((row) => [row[COLUMN.SERVICE_ID], row]),
  );
  const listeners = new Set();

  function notify(tableName, operation, row) {
    for (const listener of listeners) {
      listener(tableName, operation, row, null);
    }
  }

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [...nodeRows.values()];
      }
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()];
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICES) {
        return [];
      }
      return [...serviceRows.values()].filter((row) => predicate(row));
    },
    applySystemTableChange(tableName, operation, row) {
      const normalizedOperation = String(operation || '').toUpperCase();
      if (tableName === TABLES.NODES) {
        const key = row?.[COLUMN.NODE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          nodeRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = nodeRows.get(key) || {};
        nodeRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, nodeRows.get(key));
      }
      if (tableName === TABLES.SERVICES) {
        const key = row?.[COLUMN.SERVICE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          serviceRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = serviceRows.get(key) || {};
        serviceRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, serviceRows.get(key));
      }
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
  };
}

function createAccountingService(snapshots = {}) {
  return {
    async getCapacitySnapshotForNode(nodeId) {
      return snapshots[nodeId] || null;
    },
  };
}

function createPublicationService(snapshot) {
  return {
    getPublicationModeDiagnostics() {
      return snapshot;
    },
  };
}

function createActiveNode(nodeId) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: 2000,
    [COLUMN.LAST_HEARTBEAT]: 1000,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 20,
    [COLUMN.DISK_USAGE_PERCENT]: 30,
    [COLUMN.STORAGE_BUDGET_BYTES]: 1000,
  };
}

function createMessageGroupService(nodeId) {
  return {
    [COLUMN.SERVICE_ID]: `mg-${nodeId}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/message-group/mg-${nodeId}`,
  };
}

function createPartitionService(nodeId, serviceId = `part-${nodeId}`) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/${serviceId}`,
  };
}

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
      await readinessService.getPriorityRecoveryPlanningAnswerBestEffort(
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
      activeAnswer?.priorityRecoveryReasonCodes,
      'retained sync planning answer should preserve the last active recovery reasons',
    );
    t.equal(
      retainedAnswer?.publicationRecoveryGate?.active,
      true,
      'retained sync planning answer should preserve the shared active recovery gate',
    );
    t.same(
      retainedAnswer?.publicationRecoveryGate?.reasonCodes,
      activeAnswer?.publicationRecoveryGate?.reasonCodes,
      'retained sync planning answer should preserve the shared gate reasons',
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
      await readinessService.getPriorityRecoveryPlanningAnswerBestEffort(
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
      true,
      'readiness-side blockers should keep the recovery projection active',
    );
    t.end();
  });

test('ControlPlaneReadinessService projects recovery eligibility blockers without overriding publication-gate blockers',
  (t) => {
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'seed-node',
      systemTableCache: createCache(),
      now: () => 1500,
    });

    const settledProjection =
      readinessService.getPriorityControlPlaneRecoveryState({
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
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
            false,
        },
      });

    t.same(
      settledProjection.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING],
      'recovery eligibility should project one explicit blocker when publication has already settled',
    );

    const pendingProjection =
      readinessService.getPriorityControlPlaneRecoveryState({
        observedAt: 1600,
        membershipPublication: {
          publicationEpoch: 25,
          status: 'ACK_PENDING',
          createdAt: 1300,
        },
        membershipPublicationPlanningSnapshot: {
          publicationEpoch: 25,
          publicationStatus: 'ACK_PENDING',
          requiredAckNodeIds: ['seed-node', 'node-b'],
          acknowledgedNodeIds: ['seed-node'],
        },
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
          [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
            false,
        },
      });

    t.same(
      pendingProjection.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
      'publication-gate blockers should remain canonical without an extra recovery-eligibility shadow blocker',
    );
    t.end();
  });

test('ControlPlaneReadinessService preserves source snapshot version in membership publication diagnostics',
  async (t) => {
    const nodeId = 'node-publication-source-version';
    const cache = createCache({
      nodes: [createActiveNode(nodeId)],
      services: [createMessageGroupService(nodeId)],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId,
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        [nodeId]: {
          nodeId,
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        getLatestPublicationForNode(targetNodeId) {
          if (targetNodeId !== nodeId) {
            return null;
          }
          return {
            publicationEpoch: 12,
            status: 'PUBLISHED',
            publishedActiveNodeIds: [nodeId],
            requiredAckNodeIds: [nodeId],
            acknowledgedNodeIds: [nodeId],
            sourceTopologyEpoch: 8,
            sourceSnapshotVersion: 34,
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(nodeId);

    t.equal(readiness.membershipPublication.publicationEpoch, 12);
    t.equal(readiness.membershipPublication.sourceSnapshotVersion, 34);
    t.end();
  });

test('ControlPlaneReadinessService reports stale published priority summaries without enqueueing reconcile from the read path',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-refresh')],
      services: [createMessageGroupService('node-priority-refresh')],
    });
    const queueEnqueues = [];
    const stalePublication = {
      publicationEpoch: 17,
      status: 'PUBLISHED',
      createdAt: 1200,
      publishedActiveNodeIds: ['node-priority-refresh'],
      priorityPartitionSummary: {
        satisfied: false,
        missingPartitionIds: ['sql_write_operations-p1'],
      },
    };
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-refresh',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-refresh': {
          nodeId: 'node-priority-refresh',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        async getLatestPublicationForNode() {
          return stalePublication;
        },
        enqueueClusterMembershipReconcile(reason, context) {
          queueEnqueues.push({reason, context});
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-refresh',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, true);
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD],
    );
    t.match(
      readiness.priorityControlPlaneRecovery.priorityRecoveryObservation,
      {
        publicationStatus: 'PUBLISHED',
        recoveryProtocolState: 'priority_spread_pending',
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        priorityPartitionSummary: {
          satisfied: false,
          missingPartitionIds: ['sql_write_operations-p1'],
        },
        priorityRecoveryBlockedPartitionCount: 1,
        priorityRecoveryPartitionSnapshots: [],
      },
      'readiness should expose the shared priority-recovery observation contract',
    );
    t.equal(
      queueEnqueues.length,
      0,
      'readiness reads should no longer enqueue reconcile from stale publication observation',
    );
    t.end();
  });

test('ControlPlaneReadinessService keeps priority control-plane recovery mode active when published membership excludes the target node',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-priority-missing')],
      services: [createMessageGroupService('node-priority-missing')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-priority-missing',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-priority-missing': {
          nodeId: 'node-priority-missing',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      membershipPublicationService: {
        getLatestPublicationForNode() {
          return {
            publicationEpoch: 16,
            status: 'PUBLISHED',
            createdAt: 1200,
            publishedActiveNodeIds: ['different-node'],
            priorityPartitionSummary: {
              satisfied: true,
              missingPartitionIds: [],
            },
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness(
      'node-priority-missing',
    );

    t.equal(readiness.priorityControlPlaneRecovery.active, true);
    t.same(
      readiness.priorityControlPlaneRecovery.reasonCodes,
      [CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING],
      'published membership that does not include the target node must remain in recovery mode',
    );
    t.end();
  });

test('ControlPlaneReadinessService marks hard-pressure nodes ineligible',
  async (t) => {
    const overloadedNode = {
      ...createActiveNode('node-3'),
      [COLUMN.CPU_USAGE_PERCENT]: 100,
    };
    const cache = createCache({
      nodes: [overloadedNode],
      services: [createMessageGroupService('node-3')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-3',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-3': {
          nodeId: 'node-3',
          budgetBytes: 1000,
          pressureState: 'hard',
        },
      }),
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-3');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.dimensions.loadReady, false);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(reasonCodes.includes(CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY));
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService fails closed without storage owner',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-4')],
      services: [createMessageGroupService('node-4')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-4',
      systemTableCache: cache,
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-4');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(readiness.capacity, null);
    t.equal(readiness.dimensions.placementEligible, false);
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE,
      ),
    );
    t.end();
  });

test('ControlPlaneReadinessService warns once when non-strict storage owner ' +
  'is unavailable',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-4-warn')],
    services: [createMessageGroupService('node-4-warn')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-4-warn',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });
  const warnCalls = [];
  const errorCalls = [];
  readinessService.logger = {
    warn(message, details) {
      warnCalls.push({message, details});
    },
    error(message, details) {
      errorCalls.push({message, details});
    },
  };

  await readinessService.getNodeReadiness('node-4-warn');
  await readinessService.getNodeReadiness('node-4-warn');

  t.equal(warnCalls.length, 1);
  t.equal(errorCalls.length, 0);
  t.match(warnCalls[0], {
    message: 'ControlPlaneReadinessService missing storage accounting owner',
    details: {
      nodeId: 'node-4-warn',
      owner: 'StorageCapacityAccountingService',
      strictOwnerDependencies: false,
    },
  });
  t.end();
});

test('ControlPlaneReadinessService fails closed without publication owner',
  async (t) => {
    let statsCalls = 0;
    const cache = createCache({
      nodes: [createActiveNode('node-5')],
      services: [createMessageGroupService('node-5')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-5',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-5': {
          nodeId: 'node-5',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      cdcGroupPropagationService: {
        getStats() {
          statsCalls += 1;
          return {
            lastFallbackReason: 'should_not_be_used',
          };
        },
      },
      now: () => 1500,
    });

    const readiness = await readinessService.getNodeReadiness('node-5');
    const reasonCodes = readiness.reasons.map((reason) => reason.code);

    t.equal(
      readiness.publication.currentMode,
      CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
    );
    t.equal(readiness.dimensions.metadataPublicationHealthy, false);
    t.equal(readiness.dimensions.controlPlaneWritable, false);
    t.ok(
      reasonCodes.includes(
        CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY,
      ),
    );
    t.equal(statsCalls, 0, 'readiness should not synthesize publication via getStats fallback');
    t.end();
  });

test('ControlPlaneReadinessService warns once when non-strict publication ' +
  'owner is unavailable',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-5-warn')],
    services: [createMessageGroupService('node-5-warn')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-5-warn',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-5-warn': {
        nodeId: 'node-5-warn',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    now: () => 1500,
  });
  const warnCalls = [];
  const errorCalls = [];
  readinessService.logger = {
    warn(message, details) {
      warnCalls.push({message, details});
    },
    error(message, details) {
      errorCalls.push({message, details});
    },
  };

  await readinessService.getNodeReadiness('node-5-warn');
  await readinessService.getNodeReadiness('node-5-warn');

  t.equal(warnCalls.length, 1);
  t.equal(errorCalls.length, 0);
  t.match(warnCalls[0], {
    message: 'ControlPlaneReadinessService missing CDC publication owner',
    details: {
      nodeId: 'node-5-warn',
      owner: 'CDCGroupPropagationService',
      strictOwnerDependencies: false,
    },
  });
  t.end();
});

test('ControlPlaneReadinessService strict mode throws without storage owner',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-strict-storage')],
      services: [createMessageGroupService('node-strict-storage')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-strict-storage',
      systemTableCache: cache,
      cdcGroupPropagationService: createPublicationService({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
      strictOwnerDependencies: true,
      now: () => 1500,
    });

    await t.rejects(
      readinessService.getNodeReadiness('node-strict-storage'),
      /storageAccountingService/,
      'strict readiness path must fail loudly when storage owner is absent',
    );
    t.end();
  });

test('ControlPlaneReadinessService strict mode throws without publication owner',
  async (t) => {
    const cache = createCache({
      nodes: [createActiveNode('node-strict-publication')],
      services: [createMessageGroupService('node-strict-publication')],
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'node-strict-publication',
      systemTableCache: cache,
      storageAccountingService: createAccountingService({
        'node-strict-publication': {
          nodeId: 'node-strict-publication',
          budgetBytes: 1000,
          pressureState: 'normal',
        },
      }),
      strictOwnerDependencies: true,
      now: () => 1500,
    });

    await t.rejects(
      readinessService.getNodeReadiness('node-strict-publication'),
      /cdcGroupPropagationService/,
      'strict readiness path must fail loudly when publication owner is absent',
    );
    t.end();
  });

// ── repairEligible / serveEligible stratification (task 6.1) ────────

test('readiness snapshot includes repairEligible and serveEligible ' +
  'dimensions from one shared snapshot ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-strat')],
    services: [createMessageGroupService('node-strat')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-strat',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-strat': {
        nodeId: 'node-strat',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness('node-strat');

  t.equal(readiness.dimensions.repairEligible, true,
    'fully ready node must be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, true,
    'fully ready node must be serve-eligible');
  t.end();
});

test('repairEligible=true and serveEligible=false when loadReady=false ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const overloadedNode = {
    ...createActiveNode('node-warm'),
    [COLUMN.CPU_USAGE_PERCENT]: 100,
  };
  const cache = createCache({
    nodes: [overloadedNode],
    services: [createMessageGroupService('node-warm')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-warm',
    systemTableCache: cache,
    storageAccountingService: createAccountingService({
      'node-warm': {
        nodeId: 'node-warm',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness('node-warm');

  t.equal(readiness.dimensions.loadReady, false,
    'node under load must not be load-ready');
  t.equal(readiness.dimensions.repairEligible, true,
    'node under load must still be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'node under load must not be serve-eligible');
  t.end();
});

test('serveEligible remains true while placementEligible is false when ' +
  'capacity is missing ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-nocap')],
    services: [createMessageGroupService('node-nocap')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-nocap',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = await readinessService.getNodeReadiness('node-nocap');

  t.equal(readiness.dimensions.repairEligible, true,
    'node without capacity data must still be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, true,
    'node without capacity data must still be serve-eligible');
  t.equal(readiness.dimensions.placementEligible, false,
    'node without capacity data must not be placement-eligible');
  t.end();
});

test('both repairEligible and serveEligible false when cluster member ' +
  'unhealthy ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const now = 200000;
  const cache = createCache({
    nodes: [{
      ...createActiveNode('node-unhealthy'),
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now - 60000,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now - 30000,
    }],
    services: [createMessageGroupService('node-unhealthy')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    messageRouter: {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    },
    storageAccountingService: createAccountingService({
      'node-unhealthy': {
        nodeId: 'node-unhealthy',
        budgetBytes: 1000,
        pressureState: 'normal',
      },
    }),
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => now,
  });

  const readiness =
    await readinessService.getNodeReadiness('node-unhealthy');

  t.equal(readiness.dimensions.clusterMemberHealthy, false,
    'stale disconnected node must not be cluster-member-healthy');
  t.equal(readiness.dimensions.repairEligible, false,
    'unhealthy node must not be repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'unhealthy node must not be serve-eligible');
  t.end();
});

test('sync snapshot includes repairEligible and serveEligible ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const overloadedNode = {
    ...createActiveNode('node-sync'),
    [COLUMN.CPU_USAGE_PERCENT]: 100,
  };
  const cache = createCache({
    nodes: [overloadedNode],
    services: [createMessageGroupService('node-sync')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-sync',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = readinessService.getNodeReadinessSync('node-sync');

  t.equal(readiness.dimensions.repairEligible, true,
    'sync snapshot must include repair-eligible');
  t.equal(readiness.dimensions.serveEligible, false,
    'sync snapshot must reflect serve-ineligible when load not ready');
  t.end();
});

test('sync snapshot keeps serveEligible true when capacity is unavailable ' +
  'but load and transport are healthy ' +
  '(uses ControlPlaneReadinessService as canonical readiness owner)',
async (t) => {
  const cache = createCache({
    nodes: [createActiveNode('node-sync-nocap')],
    services: [createMessageGroupService('node-sync-nocap')],
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-sync-nocap',
    systemTableCache: cache,
    cdcGroupPropagationService: createPublicationService({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      reasonCode: null,
      enteredAt: '2026-03-04T00:00:00.000Z',
      recentTransitions: [],
    }),
    now: () => 1500,
  });

  const readiness = readinessService.getNodeReadinessSync('node-sync-nocap');

  t.equal(readiness.dimensions.repairEligible, true,
    'sync snapshot must include repair-eligible');
  t.equal(readiness.dimensions.serveEligible, true,
    'sync snapshot must keep serve-eligible without capacity data');
  t.equal(readiness.dimensions.placementEligible, false,
    'sync snapshot must still fail closed for placement eligibility');
  t.end();
});
