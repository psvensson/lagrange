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
  PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION,
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
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH = 41;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NEXT_EPOCH = 42;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NOW_MS = 3200;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_DURABLE_UPDATED_AT = 3201;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_AUTHORITATIVE_READ_ERROR =
  'explicit handoff target should not require authoritative node repair';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_BROAD_READ_ERROR =
  'active-gate owner reconcile should not read broad membership tables';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY = true;
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER = false;
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
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_EMPTY_ENQUEUE_COUNT = 0;
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_ENQUEUED =
  'enqueued';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_REJECTED =
  'rejected';
const PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE =
  'owner_recovery_wake';
const PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUNDED_REASON =
  'owner_queue_bounded';
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[1],
]);
const PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS = Object.freeze([
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
  PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[2],
]);

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
    const nodeReadModes = [];
    const readinessRefreshModes = [];
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
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(1),
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
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
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
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(1),
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
      false,
      'deferred owner retry should keep durable readback enabled',
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

test('reconcileActiveGateMembershipPublication reports bounded critical queue pressure',
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
    const pending = new Map([
      [PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OTHER_OWNER_KEY, {
        context: {},
      }],
    ]);
    const enqueued = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
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
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS.slice(1),
        nextAction:
          PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION
            .RECONCILE_OWNER_MEMBERSHIP_PUBLICATION,
      });

    t.equal(
      enqueued.length,
      PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_EMPTY_ENQUEUE_COUNT,
      'saturated critical convergence queue should not enqueue beyond the bound',
    );
    t.match(
      outcome,
      {
        state: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
          .WRITE_DEFERRED,
        enqueued: false,
        controlPlaneConvergenceClass:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
        controlPlanePressureOutcome:
          CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME.CRITICAL_REJECTED,
        controlPlaneConvergence: {
          ownerKey: coordinator.buildOwnerKey(),
          operation: PUBLICATION_CONVERGENCE_CRITICAL_OWNER_RECOVERY_WAKE,
          queueBound: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUND,
          queueOutcome:
            PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_OUTCOME_REJECTED,
          reasonCode: PUBLICATION_CONVERGENCE_CRITICAL_QUEUE_BOUNDED_REASON,
        },
      },
      'bounded critical convergence queue pressure should be typed instead of silently dropped',
    );
  });

test('enqueueClusterMembershipReconcile merges pending explicit handoff targets',
  async (t) => {
    const pending = new Map();
    const enqueued = [];
    const reconcileQueue = {
      pending,
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
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_NODE_IDS[0],
      reconcileQueue,
    });
    const ownerKey = coordinator.buildOwnerKey();

    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_A,
      {
        latestPublicationRow: {
          publication_epoch: PUBLICATION_CONVERGENCE_HANDOFF_TARGET_EPOCH,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_A_IDS,
        ],
        allowPendingVisibility:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY,
        allowPressureDefer:
          PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
      },
    );
    coordinator.enqueueClusterMembershipReconcile(
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_REASON_B,
      {
        latestPublicationRow: {
          publication_epoch:
            PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
        },
        publishedActiveNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
        requiredAckNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
        acknowledgedNodeIds: [
          ...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NODE_B_IDS,
        ],
      },
    );

    const mergedContext = pending.get(ownerKey)?.context;
    t.equal(
      enqueued.length,
      2,
      'both enqueue calls should reach the owner queue',
    );
    t.same(
      mergedContext?.publishedActiveNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'pending context should union explicit publication targets',
    );
    t.same(
      mergedContext?.requiredAckNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'pending context should union explicit ACK targets',
    );
    t.same(
      mergedContext?.acknowledgedNodeIds,
      [...PUBLICATION_CONVERGENCE_HANDOFF_TARGET_SORTED_NODE_IDS],
      'pending context should union explicit acknowledged nodes',
    );
    t.equal(
      mergedContext?.latestPublicationRow?.publication_epoch,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_QUEUE_NEWER_EPOCH,
      'pending context should retain the newest known publication row',
    );
    t.equal(
      mergedContext?.allowPendingVisibility,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PENDING_VISIBILITY,
      'pending context should retain pending visibility permission',
    );
    t.equal(
      mergedContext?.allowPressureDefer,
      PUBLICATION_CONVERGENCE_HANDOFF_TARGET_ALLOW_PRESSURE_DEFER,
      'pending context should retain the explicit non-deferred write option',
    );
  });

test('deriveMembershipPublicationCandidate promotes healthy projected members while publication acknowledgements are still pending',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.publicationEpoch,
      8,
      'convergence-time promotions should advance the publication epoch from the latest durable epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'healthy projected members should be promoted even while the current publication epoch is still awaiting acknowledgements',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
        memberStatesByNodeId: {
          'node-1': 'serving',
          'node-2': 'serving',
          'node-3': 'joining',
        },
      },
      'the promoted member should remain publish-pending while the new epoch converges',
    );
  });

test('deriveMembershipPublicationCandidate promotes recovery-eligible projected members while publication is not converged',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'ack-pending convergence should accept projected members that are recovery-eligible even before full traffic eligibility converges',
    );
    t.equal(
      candidate.membershipLifecycleSummary?.lifecycleState,
      MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
      'promoted recovery-eligible members should stay publish-pending until acknowledgements close the new epoch',
    );
  });

test('deriveMembershipPublicationCandidate closes unchanged recovery-eligible ACK debt through the publication owner',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      false,
      'the fixture must stay on the existing publication epoch',
    );
    t.equal(
      candidate.publicationStatus,
      'PUBLISHED',
      'unchanged recovery-eligible ACK debt should close through canonical owner planning',
    );
    t.same(
      candidate.acknowledgedNodeIds,
      ['node-1', 'node-2'],
      'the pending required node should be folded into the owner ACK set',
    );
    t.same(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-1': 'serving',
        'node-2': 'serving',
      },
      'ACK closure should publish the durable member state instead of preserving publish-pending debt',
    );
  });

test('deriveMembershipPublicationCandidate does not block recovery-eligible promotion while recovery epochs are open',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 6,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            processAlive: false,
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      recoveryEpochsByNodeId: {
        'node-2': [
          {
            epochId: 'node-2:1',
            open: true,
          },
        ],
        'node-3': [
          {
            epochId: 'node-3:1',
            open: true,
          },
        ],
      },
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
        {service_id: 'svc-3', node_id: 'node-3', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'open recovery epochs should not prevent promotion once recovery-eligible readiness is true',
    );
    t.match(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-2': 'catching_up',
        'node-3': 'catching_up',
      },
      'promoted members with open recovery epochs should remain marked as catching_up until convergence closes',
    );
  });

test('deriveMembershipPublicationCandidate promotes recovery-eligible joiners when publication health is still pending',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 17,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 16,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: false,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'ack-pending convergence should not deadlock on clusterMemberHealthy when controlPlaneRecoveryEligible is already true',
    );
    t.match(
      candidate.membershipLifecycleSummary?.memberStatesByNodeId,
      {
        'node-1': 'serving',
        'node-2': 'joining',
      },
      'recovery-eligible joiners should remain lifecycle-visible while the publication epoch converges',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        readinessDecisionDimensions: [
          'clusterMemberHealthy',
          'controlPlaneRecoveryEligible',
        ],
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
        readinessExcludedNodeIds: [],
        clusterMemberUnhealthyExcludedNodeIds: [],
      },
      'membership lifecycle diagnostics should capture that projection included the joiner via recovery eligibility',
    );
  });

test('deriveMembershipPublicationCandidate defers process-dead recovery joiners from publication acknowledgements',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING,
        published_active_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
        published_active_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        buildMembershipPublicationAckDeferralNodeRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
          MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY,
        ),
        buildMembershipPublicationAckDeferralNodeRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED,
        ),
      ],
      readinessEntries: [
        {
          nodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
          },
        },
        {
          nodeId: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
        },
      ],
      nodeEndpointRows: [
        buildMembershipPublicationTrimEndpointRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ),
        buildMembershipPublicationTrimEndpointRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ),
      ],
      serviceRows: [
        buildMembershipPublicationTrimServiceRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        ),
        buildMembershipPublicationTrimServiceRow(
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ),
      ],
      nowMs: MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS,
    });

    t.same(
      candidate.projectedServingNodeIds,
      [
        MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
        MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
      ],
      'the recovery-only node should remain visible in the observed projection',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'process-dead recovery-only nodes must not enter the ack-required publication set',
    );
    t.same(
      candidate.requiredAckNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'the publication should not require acknowledgement from the deferred node',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleIncludedNodeIds: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ],
        publicationAckDeferredNodeIds: [
          MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
        ],
        publicationAckDeferralReasonCodesByNodeId: {
          [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID]: [
            CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
          ],
        },
      },
      'publication diagnostics should retain the recovery projection and the ack deferral reason',
    );
    t.same(
      candidate.recoveryActiveNodeIds,
      [MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID],
      'deferred recovery projections should not hold the publication recovery gate open as missing published members',
    );
    t.same(
      candidate.missingPublishedRecoveryActiveNodeIds,
      [],
      'deferred recovery projections should not create publication trim debt',
    );
  });

test('deriveMembershipPublicationCandidate reopens a stale published membership for recovery-eligible joiners',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 17,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      latestPublishedPublicationRow: {
        publication_epoch: 17,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: false,
            controlPlanePublished: false,
            controlPlaneRecoveryEligible: true,
            controlPlaneWritable: false,
            repairEligible: false,
            serveEligible: false,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      true,
      'a stale published baseline should reopen when recovery-eligible joiners are visible',
    );
    t.equal(
      candidate.publicationEpoch,
      18,
      'the reopened publication should advance from the last published epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'recovery-eligible joiners should be promoted even when the latest epoch is currently published',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        readinessDecisionMode: 'cluster_member_or_recovery_eligible',
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: ['node-2'],
      },
      'the reopened publication should record that recovery eligibility drove the projection',
    );
    t.equal(
      candidate.membershipLifecycleSummary?.recoveryProtocolState,
      'publication_pending',
      'the reopened publication should expose the shared recovery protocol phase',
    );
    t.match(
      candidate.membershipLifecycleSummary?.participationByNodeId,
      {
        'node-1': {
          state: 'published_active',
        },
        'node-2': {
          state: 'recovery_pending_publish',
          recoverySource: 'recovery_eligible_projection',
        },
      },
      'the publication candidate should preserve canonical node participation states',
    );
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication when recovery eligibility proves missing members',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'the publication owner should schedule a bounded repair publication',
    );
    t.equal(
      candidate.publicationEpoch,
      PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH + 1,
      'the repair publication should advance the stale published epoch',
    );
    t.equal(
      candidate.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'missing published members must not remain classified as a closed published publication',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'recovery-eligible readiness is the bounded owner evidence for the missing member',
    );
    t.same(
      candidate.requiredAckNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'the reopened publication should require ACK evidence from the repaired cohort',
    );
    t.match(
      candidate.membershipLifecycleSummary?.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'the repair evidence should be visible in owner diagnostics',
    );
    t.end();
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication from priority recovery pending reason-only evidence',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          reasons: [
            {
              code: CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            },
          ],
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'reason-only priority recovery evidence should reopen stale published membership',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'priority recovery pending reason-only evidence should enter the repair cohort',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'publication diagnostics should identify the reason-only recovery projection',
    );
    t.end();
  });

test('deriveMembershipPublicationCandidate reopens count-only ACK complete publication from priority recovery pending blocked readiness evidence',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      latestPublishedPublicationRow: {
        publication_epoch: PUBLICATION_CONVERGENCE_STALE_PUBLISHED_EPOCH,
        status: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        required_ack_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
        acknowledged_node_ids: [
          PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        ],
      },
      nodeRows: [
        {
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          connection_state: PUBLICATION_CONVERGENCE_REPAIR_READY_CONNECTION,
          ready_lease_expires_at:
            PUBLICATION_CONVERGENCE_REPAIR_READY_LEASE_EXPIRES_AT,
        },
      ],
      readinessEntries: [
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        },
        {
          nodeId: PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: false,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
          },
          reasons: [
            {
              code: CONTROL_PLANE_READINESS_REASON
                .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
            },
          ],
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          transport_type: PUBLICATION_CONVERGENCE_REPAIR_TRANSPORT,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
          address: PUBLICATION_CONVERGENCE_REPAIR_ENDPOINT_ADDRESS,
        },
      ],
      serviceRows: [
        {
          service_id: PUBLICATION_CONVERGENCE_REPAIR_SERVICE_ID,
          node_id: PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
          status: PUBLICATION_CONVERGENCE_REPAIR_ACTIVE_STATUS,
        },
      ],
      nowMs: PUBLICATION_CONVERGENCE_REPAIR_NOW_MS,
    });

    t.equal(
      candidate.changed,
      true,
      'priority recovery pending readiness should reopen stale published membership even when serve dimensions are blocked',
    );
    t.equal(
      candidate.publicationStatus,
      CONTROL_PLANE_PUBLICATION_STATUS.OPEN,
      'blocked serve readiness should become an open repair publication instead of retaining stale published truth',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [
        PUBLICATION_CONVERGENCE_REPAIR_PUBLISHED_NODE_ID,
        PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
      ],
      'priority recovery pending readiness should enter the repair cohort',
    );
    t.match(
      candidate.projectionDiagnostics,
      {
        recoveryEligibleProjectionEnabled: true,
        recoveryEligibleIncludedNodeIds: [
          PUBLICATION_CONVERGENCE_REPAIR_MISSING_NODE_ID,
        ],
      },
      'publication diagnostics should identify the blocked readiness recovery projection',
    );
    t.end();
  });
