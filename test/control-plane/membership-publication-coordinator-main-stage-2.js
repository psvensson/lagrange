import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
} from '../../src/control-plane/membership-publication-coordinator-class-stage-3.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  shouldPreferAuthoritativeMembershipState,
} from '../../src/control-plane/membership-publication-coordinator-stage-2.js';
import {MEMBERSHIP_LIFECYCLE_STATE} from '../../src/control-plane/membership-lifecycle-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/control-plane-publication-merge.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  buildPublicationActiveGateHandoffContract,
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_REASON,
  PUBLICATION_ACTIVE_GATE_HANDOFF_STATE,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID, MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING, MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY, MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED, buildMembershipPublicationAckDeferralNodeRow, buildMembershipPublicationTrimEndpointRow, buildMembershipPublicationTrimServiceRow} from './membership-publication-coordinator-main-stage-1.js';

const PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH = 29;
const PUBLICATION_CONVERGENCE_REPAIR_NOW_MS = 1000;
const PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID = 'seed-node';
const PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID = 'node-1';
const PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID = 'node-2';
const PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID = 'node-1-ws';
const PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID = 'svc-1';
const PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS = 'ws://node-1:8082';
const PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT = 'ws';
const PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS = 'active';
const PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION = 'ready';
const PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT = 5000;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH = 31;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID = 'node-auth-refresh';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY = Object.freeze({
  satisfied: true,
  readyEligibleNodeCount: 1,
  totalPriorityPartitionCount: 1,
  blockedPartitionCount: 0,
});
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_PUBLICATION_ID =
  'publication-auth-refresh';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_MISSING_NODE_ID =
  'node-auth-refresh-missing';
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_READY_LEASE_EXPIRES_AT = 5000;
const PUBLICATION_CONVERGENCE_AUTH_REFRESH_NOW_MS = 2500;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID =
  'publication-handoff-target';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND =
  'cluster_membership';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH = 41;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NEXT_EPOCH = 42;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS = 3200;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_UPDATED_AT = 3201;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SINGLE_WRITE_ATTEMPT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_STALE_READBACK_COUNT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_PERSISTED_INDEX = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NO_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_AUTHORITATIVE_READ_ERROR =
  'explicit handoff target should not require authoritative node repair';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_BROAD_READ_ERROR =
  'active-gate owner reconcile should not read broad membership tables';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY = true;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER = false;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SKIP_CACHE_WAIT = true;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READ_PROFILE =
  'diagnostics';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_REASON_CODE =
  'durable_handoff_readback';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS = Object.freeze([
  'node-handoff-seed',
  'node-handoff-a',
  'node-handoff-b',
]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS = Object.freeze(
  [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS].sort((left, right) =>
    left.localeCompare(right),
  ),
);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS =
  Object.freeze([
    PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  ]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS = Object.freeze(
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(1),
);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS = Object.freeze([]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_A =
  'ready-node-handoff-a';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B =
  'ready-node-handoff-b';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH = 43;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OTHER_OWNER_KEY =
  'membership-publication:other-cluster';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUND = 1;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS = 1000;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_EMPTY_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_DEFERRED_SKIP_WRITE_READBACK = true;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_ENQUEUED =
  'enqueued';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_MERGED =
  'merged';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_REJECTED =
  'rejected';
const PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE =
  'owner_recovery_wake';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUNDED_REASON =
  'owner_queue_bounded';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_TEST_NAME =
  'reconcileActiveGateMembershipPublication accepts pending owner queue merge';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_OUTCOME_MESSAGE =
  'pending owner-key merge should expose an accepted critical convergence retry';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_MESSAGE =
  'pending owner-key merge should still reach the owner queue once';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_CONTEXT_MESSAGE =
  'pending owner-key merge should retain the complete handoff target';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ROW_MESSAGE =
  'pending owner-key merge should retain the complete latest publication row';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_COUNT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[1],
]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[2],
]);
const PUBLICATION_CONVERGENCE_HANDOFF_ONLY_PRELOADED_FIELD =
  'nodeRows';
const PUBLICATION_CONVERGENCE_HANDOFF_ONLY_ALLOW_EMPTY_FIELD =
  'allowEmptyPreloadedRows';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYABLE_DRAIN_FAILURE =
  'retryable_drain_failure';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE =
  'distributed_participant_failure';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_DISTRIBUTED_FAILURE_MESSAGE =
  'Distributed operation failed due to participant failures';
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRY_AFTER_MS = 37;
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_RETRYING_COUNT = 1;
const PUBLICATION_CONVERGENCE_OWNER_QUEUE_FIRST_CALL_COUNT = 1;
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_UNKNOWN_EPOCH = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_UNPUBLISHED_OBSERVATION =
  'unpublished_observation';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_NO_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_TEST_NAME =
  'reconcileClusterMembership preserves target-blocked active-gate handoff replay';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_CONTRACT_MESSAGE =
  'no-debt publication pending replay should emit an owner reconcile handoff';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_STATE_MESSAGE =
  'empty replay target should remain a typed owner outcome';
const PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_QUEUE_MESSAGE =
  'target-blocked replay should not enqueue downstream owner recovery work';

test('shouldPreferAuthoritativeMembershipState refreshes published count-only rows without lifecycle projection evidence',
  async (t) => {
    const preferAuthoritativeRead = shouldPreferAuthoritativeMembershipState({
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
        ],
        priority_partition_summary:
          PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
      },
    });
    const steadyProjectionRead =
      shouldPreferAuthoritativeMembershipState({
        latestPublicationRow: {
          publication_epoch: PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH,
          status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
          published_active_node_ids: [
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
          ],
          required_ack_node_ids: [
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
          ],
          acknowledged_node_ids: [
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
          ],
          priority_partition_summary:
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
          membership_lifecycle_summary: {
            publishedActiveNodeIds: [
              PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
            ],
            projectedServingNodeIds: [
              PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
            ],
            locallyEligibleNodeIds: [
              PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
            ],
          },
        },
      });

    t.equal(
      preferAuthoritativeRead,
      true,
      'count-only published rows without lifecycle projection evidence should refresh owner planning inputs',
    );
    t.equal(
      steadyProjectionRead,
      false,
      'published rows with explicit ACK and lifecycle projection evidence can stay on local planning inputs',
    );
    t.end();
  });

test('readPublicationPlanningSnapshot uses authoritative membership evidence for published rows without lifecycle projection evidence',
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_AUTH_REFRESH_PUBLICATION_ID,
      publication_kind: 'cluster_membership',
      publication_epoch: PUBLICATION_CONVERGENCE_AUTH_REFRESH_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const cachedNodeRows = [{
      [COLUMN.NODE_ID]: PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
      [COLUMN.STATUS]: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
      [COLUMN.CONNECTION_STATE]: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
      [COLUMN.READY_LEASE_EXPIRES_AT]:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_READY_LEASE_EXPIRES_AT,
    }];
    const authoritativeNodeRows = [
      ...cachedNodeRows,
      {
        [COLUMN.NODE_ID]: PUBLICATION_CONVERGENCE_AUTH_REFRESH_MISSING_NODE_ID,
        [COLUMN.STATUS]: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        [COLUMN.CONNECTION_STATE]:
          PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
        [COLUMN.READY_LEASE_EXPIRES_AT]:
          PUBLICATION_CONVERGENCE_AUTH_REFRESH_READY_LEASE_EXPIRES_AT,
      },
    ];
    const readinessRefreshModes = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
      },
      authoritativeControlPlaneView: {
        canRead() {
          return true;
        },
        async readRows(tableName, _sql, _params, options) {
          if (tableName !== TABLES.NODES) {
            return {success: true, rows: []};
          }
          return {
            success: true,
            rows:
              options.authoritativeReadMode ===
                CONTROL_PLANE_AUTHORITATIVE_READ_MODE
                  .OWNER_RPC_PREFERRED_SQL_FALLBACK ?
                authoritativeNodeRows :
                cachedNodeRows,
          };
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          readinessRefreshModes.push(options.allowAuthoritativeRefresh === true);
          return [];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
        async getMembershipPublicationPlanningSnapshotBestEffort() {
          return null;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return cachedNodeRows;
          }
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_AUTH_REFRESH_NOW_MS,
    });

    const snapshot = await coordinator.readPublicationPlanningSnapshot();

    t.same(
      readinessRefreshModes,
      [true],
      'lifecycle-thin published rows should ask readiness for authoritative planning evidence',
    );
    t.same(
      snapshot.nodeRows.map((row) => row[COLUMN.NODE_ID]).sort(),
      [
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_NODE_ID,
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_MISSING_NODE_ID,
      ],
      'planning should merge authoritative node rows instead of retaining the stale local cache only',
    );
    t.end();
  });

test('reconcileClusterMembership publishes explicit handoff target without authoritative node repair',
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND,
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const nodeReadModes = [];
    const readinessRefreshModes = [];
    const persistedRows = [];
    const persistOptions = [];
    const publicationReadOptions = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX
        ],
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication(_publicationId, options = {}) {
          publicationReadOptions.push(options);
          const persistedRow = persistedRows[persistedRows.length - 1];
          if (!persistedRow) {
            return latestPublicationRow;
          }
          return {
            ...persistedRow,
            reason_code:
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_REASON_CODE,
            updated_at:
              PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_UPDATED_AT,
          };
        },
        async upsertPublication(row, options = {}) {
          persistedRows.push(row);
          persistOptions.push(options);
        },
      },
      authoritativeControlPlaneView: {
        canRead() {
          return true;
        },
        async readRows(tableName, _sql, _params, options) {
          if (tableName === TABLES.NODES) {
            nodeReadModes.push(options.authoritativeReadMode);
            if (
              options.authoritativeReadMode !==
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
            ) {
              throw new Error(
                PUBLICATION_CONVERGENCE_HANDOFF_TARGET_AUTHORITATIVE_READ_ERROR,
              );
            }
          }
          return {
            success: true,
            rows: [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS],
          };
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          readinessRefreshModes.push(options.allowAuthoritativeRefresh === true);
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
        async getMembershipPublicationPlanningSnapshotBestEffort() {
          return null;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome = await coordinator.reconcileClusterMembership({
      preferAuthoritativeRead: true,
      publishedActiveNodeIds: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
      ],
      requiredAckNodeIds: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
      ],
      acknowledgedNodeIds: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
      ],
      readProfile:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READ_PROFILE,
      allowPendingVisibility:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY,
      allowPressureDefer:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
    });

    t.same(
      nodeReadModes,
      [CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY],
      'explicit handoff reconcile should avoid authoritative node repair reads',
    );
    t.same(
      readinessRefreshModes,
      [false],
      'explicit handoff reconcile should not ask readiness for authoritative refresh',
    );
    t.match(
      outcome.publicationRow,
      {
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NEXT_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
        reasonCode:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_REASON_CODE,
      },
      'explicit handoff target should return the durable readback publication row',
    );
    t.match(
      persistedRows[0],
      {
        publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NEXT_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
        required_ack_node_ids: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
        acknowledged_node_ids: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
      },
      'explicit handoff target should be persisted as the durable publication target',
    );
    t.equal(
      persistOptions[0]?.allowPendingVisibility,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY,
      'explicit handoff target should preserve pending visibility on the publication write',
    );
    t.equal(
      persistOptions[0]?.allowPressureDefer,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
      'explicit handoff target should bypass pressure deferral on the publication write',
    );
    t.match(
      publicationReadOptions[publicationReadOptions.length - 1],
      {
        readProfile:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READ_PROFILE,
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      },
      'explicit handoff target should verify the write through the diagnostics owner readback path',
    );
  });

test('reconcileActiveGateMembershipPublication owns handoff write visibility',
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND,
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const persistedRows = [];
    const persistOptions = [];
    const publicationReadOptions = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication(_publicationId, options = {}) {
          publicationReadOptions.push(options);
          const persistedRow = persistedRows[persistedRows.length - 1];
          return persistedRow ?
            {
              ...persistedRow,
              reason_code:
                PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_REASON_CODE,
              updated_at:
                PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_UPDATED_AT,
            } :
            latestPublicationRow;
        },
        async upsertPublication(row, options = {}) {
          persistedRows.push(row);
          persistOptions.push(options);
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          throw new Error(
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_BROAD_READ_ERROR,
          );
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication({
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        expectedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileNodeIds:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX,
          ),
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      });

    t.equal(
      outcome.state,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.PUBLISHED_VISIBLE,
      'owner handoff reconcile should report only durable visible publication success',
    );
    t.match(
      outcome.publicationRow,
      {
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NEXT_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS,
        ],
      },
      'owner outcome should carry the durable readback row that covers the handoff target',
    );
    t.equal(
      persistOptions[0]?.skipPublicationWriteReadback,
      false,
      'active-gate owner reconcile should keep write readback enabled',
    );
    t.equal(
      persistOptions[0]?.skipCacheWait,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SKIP_CACHE_WAIT,
      'active-gate owner reconcile should not wait on cache visibility before authoritative readback',
    );
    t.match(
      publicationReadOptions[publicationReadOptions.length - 1],
      {
        readProfile:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_READ_PROFILE,
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      },
      'active-gate owner reconcile should verify durable visibility through the publication owner',
    );
  });

test('reconcileActiveGateMembershipPublication uses handoff baseline under publication read pressure',
  async (t) => {
    const persistedRows = [];
    const listPublicationCalls = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      controlPlanePublicationsOwner: {
        async listPublications() {
          listPublicationCalls.push(true);
          throw new Error(
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_AUTHORITATIVE_READ_ERROR,
          );
        },
        async getPublication(publicationId) {
          return persistedRows.find(
            (row) => row.publication_id === publicationId,
          ) || null;
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
      systemTableCache: {
        getAll() {
          throw new Error(
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_BROAD_READ_ERROR,
          );
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication({
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        expectedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS,
        ],
        pendingRecoveryNodeIds: [],
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      });

    t.equal(
      outcome.state,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.PUBLISHED_VISIBLE,
      'handoff baseline should let the owner publish without a prior publication list read',
    );
    t.equal(
      listPublicationCalls.length,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NO_ENQUEUE_COUNT,
      'active-gate owner reconcile should not list publications before writing the explicit handoff target',
    );
    t.same(
      outcome.publicationRow.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'published row should cover the full active-gate handoff target',
    );
    t.equal(
      persistedRows.length > 0,
      true,
      'owner command should persist the handoff publication row under read pressure',
    );
  });

test('reconcileActiveGateMembershipPublication widens seed-only active-gate handoff fixture',
  async (t) => {
    const seedOnlyPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: 'cluster_membership',
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const activeNodeRows =
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.map((nodeId) => ({
        node_id: nodeId,
        status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        connection_state:
          PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
        ready_lease_expires_at:
          PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
      }));
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [seedOnlyPublicationRow]};
        },
        async getPublication() {
          return persistedRows[persistedRows.length - 1] ||
            seedOnlyPublicationRow;
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [seedOnlyPublicationRow];
          }
          if (tableName === TABLES.NODES) {
            return [...activeNodeRows];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication(
        {
          publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
          expectedNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileNodeIds: [
            ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS,
          ],
          pendingRecoveryNodeIds: [],
          nextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        },
        {
          nodeRows: activeNodeRows,
          priorityPartitionSummary:
            PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
        },
      );

    t.equal(
      outcome.state,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.PUBLISHED_VISIBLE,
      'seed-only active-gate fixture should become durable visible owner publication',
    );
    t.same(
      outcome.publicationRow.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'owner command should widen the published membership to all active handoff nodes',
    );
    t.equal(
      persistedRows.length > 0,
      true,
      'owner command should persist the widened publication row',
    );
  });

test('reconcileClusterMembership consumes active-gate owner reconcile handoff',
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: 'cluster_membership',
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      priority_partition_summary:
        PUBLICATION_CONVERGENCE_AUTH_REFRESH_PRIORITY_SUMMARY,
    };
    const persistedRows = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication() {
          return persistedRows[persistedRows.length - 1] ||
            latestPublicationRow;
        },
        async upsertPublication(row) {
          persistedRows.push(row);
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome = await coordinator.reconcileClusterMembership({
      publicationActiveGateHandoff: {
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
        reasonCode:
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
        runtimePromotionAllowed: false,
        expectedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_NODE_IDS,
        ],
      },
    });

    t.equal(
      outcome.publicationRow.status,
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      'owner reconcile handoff should close the durable publication when the target is fully acknowledged',
    );
    t.same(
      outcome.publicationRow.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'normal owner reconcile should publish the full active-gate handoff cohort',
    );
    t.same(
      persistedRows[0]?.published_active_node_ids,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'owner ingress should persist the widened handoff publication',
    );
  });

test(PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_TEST_NAME, async (t) => {
  const replayHandoffContract = buildPublicationActiveGateHandoffContract({
    publicationConvergence: {
      publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_UNKNOWN_EPOCH,
      recoveryProtocolState:
        PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_UNPUBLISHED_OBSERVATION,
      publicationPending: true,
      pendingAckNodeIds: [],
      pendingAckCount: 0,
      missingPublishedNodeIds: [],
      missingPublishedCount: 0,
      publishedActiveNodeIds: [],
      prioritySpreadPending: false,
    },
  });
  const enqueued = [];
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
    reconcileQueue: {
      enqueue(ownerKey, reason, context, options) {
        enqueued.push({ownerKey, reason, context, options});
        return true;
      },
    },
    now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
  });

  const outcome = await coordinator.reconcileClusterMembership({
    publicationActiveGateHandoff: replayHandoffContract,
  });

  t.match(
    replayHandoffContract,
    {
      state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.PENDING,
      reasonCode:
        PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      nextAction:
        PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
          .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      runtimePromotionAllowed: false,
      pendingReconcileCount:
        PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_NO_ENQUEUE_COUNT,
    },
    PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_CONTRACT_MESSAGE,
  );
  t.match(
    outcome,
    {
      state: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
        .TARGET_BLOCKED,
      target: {
        reconcileRequired: false,
        handoffContract: {
          state: PUBLICATION_ACTIVE_GATE_HANDOFF_STATE.UNAVAILABLE,
          reasonCode:
            PUBLICATION_ACTIVE_GATE_HANDOFF_REASON
              .EXPECTED_COHORT_UNAVAILABLE,
          nextAction:
            PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
              .OBSERVE_OWNER_HANDOFF,
        },
      },
    },
    PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_STATE_MESSAGE,
  );
  t.equal(
    enqueued.length,
    PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_NO_ENQUEUE_COUNT,
    PUBLICATION_CONVERGENCE_HANDOFF_REPLAY_QUEUE_MESSAGE,
  );
});

test('reconcileActiveGateMembershipPublication defers stale durable readback',
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: 'cluster_membership',
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
    };
    const pending = new Map();
    const enqueued = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX
        ],
      reconcileQueue: {
        pending,
        enqueue(ownerKey, reason, context, options) {
          enqueued.push({ownerKey, reason, context, options});
          pending.set(ownerKey, {context});
          return true;
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication() {
          return latestPublicationRow;
        },
        async upsertPublication(row) {
          return row;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication({
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        expectedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileNodeIds:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX,
          ),
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      });

    const ownerKey = coordinator.buildOwnerKey();
    t.equal(
      outcome.state,
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED,
      'stale durable readback should remain a deferred owner outcome',
    );
    t.equal(
      outcome.reasonCode,
      PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
      'stale durable readback should retain the owner handoff retry reason',
    );
    t.equal(
      outcome.retryAfterMs,
      PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS,
      'stale durable readback should expose the bounded owner retry delay',
    );
    t.equal(
      enqueued.length,
      1,
      'deferred durable visibility should requeue the owner reconcile path',
    );
    t.same(
      pending.get(ownerKey)?.context?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'deferred owner context should preserve the complete handoff target',
    );
    t.equal(
      pending.get(ownerKey)?.context?.skipPublicationWriteReadback,
      PUBLICATION_CONVERGENCE_DEFERRED_SKIP_WRITE_READBACK,
      'deferred owner retry should avoid immediate durable readback',
    );
    t.match(
      outcome.controlPlaneConvergence,
      {
        convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
        pressureOutcome:
          CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
        ownerKey,
        operation: PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE,
        queueBound: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUND,
        queueOutcome: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_ENQUEUED,
      },
      'deferred owner retry should expose the critical convergence queue admission',
    );
  });

test(PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_TEST_NAME,
  async (t) => {
    const latestPublicationRow = {
      publication_id: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLICATION_ID,
      publication_kind: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_KIND,
      publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
      status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
      published_active_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      required_ack_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
      acknowledged_node_ids: [
        ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
      ],
    };
    const pending = new Map();
    const enqueued = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId:
        PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_FIRST_NODE_INDEX
        ],
      reconcileQueue: {
        pending,
        get size() {
          return pending.size;
        },
        has(ownerKey) {
          return pending.has(ownerKey);
        },
        enqueue(ownerKey, reason, context, options) {
          enqueued.push({ownerKey, reason, context, options});
          const pendingEntry = pending.get(ownerKey);
          if (pendingEntry) {
            pendingEntry.context = context;
            return false;
          }
          pending.set(ownerKey, {context});
          return true;
        },
      },
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [latestPublicationRow]};
        },
        async getPublication() {
          return latestPublicationRow;
        },
        async upsertPublication(row) {
          return row;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
            return [latestPublicationRow];
          }
          return [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EMPTY_ROWS];
        },
      },
      now: () => PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS,
    });
    const ownerKey = coordinator.buildOwnerKey();
    pending.set(ownerKey, {
      context: {
        latestPublicationRow,
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
      },
    });

    const outcome =
      await coordinator.reconcileActiveGateMembershipPublication({
        publicationEpoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        expectedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileNodeIds:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_PENDING_START_INDEX,
          ),
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      });

    const mergedContext = pending.get(ownerKey)?.context;
    t.match(
      outcome,
      {
        state: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
          .WRITE_DEFERRED,
        enqueued: true,
        controlPlaneConvergenceClass:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
        controlPlanePressureOutcome:
          CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_ADMITTED,
        controlPlaneConvergence: {
          ownerKey,
          operation: PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE,
          queueBound: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUND,
          queueOutcome: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_MERGED,
        },
        reasonCode:
          PUBLICATION_ACTIVE_GATE_HANDOFF_REASON.OWNER_RECONCILE_PENDING,
        retryAfterMs: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_RETRY_AFTER_MS,
      },
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_OUTCOME_MESSAGE,
    );
    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_COUNT,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ENQUEUE_MESSAGE,
    );
    t.same(
      mergedContext?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_CONTEXT_MESSAGE,
    );
    t.same(
      mergedContext?.requiredAckNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_CONTEXT_MESSAGE,
    );
    t.same(
      mergedContext?.latestPublicationRow?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ROW_MESSAGE,
    );
    t.same(
      mergedContext?.latestPublicationRow?.requiredAckNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_MERGED_ROW_MESSAGE,
    );
  });

