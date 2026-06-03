/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */
import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
  ADMIN_ERROR_MESSAGE,
} from './admin-constants.js';
import {
  filterActiveServingPartitionRows,
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../control-plane/control-plane-snapshot-owner.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';
import {buildCanonicalPublicationRecoveryEvidence} from '../control-plane/publication-recovery-evidence.js';
// ── file-local constants ────────────────────────────────────────────────────
const ADMIN_CONTROL_SNAPSHOT_LITERAL = Object.freeze({
  VALUE: '',
  READY: 'ready',
  UPDATEDAT: 'updatedAt',
  UPDATED_AT: 'updated_at',
  UNKNOWN_ERROR: 'unknown_error',
  PUBLISHED: 'PUBLISHED',
  NODEID: 'nodeId',
  ID: 'id',
  NAME: 'name',
  CAPTUREDAT: 'capturedAt',
  SOURCELEADERNODEID: 'sourceLeaderNodeId',
  DECISIONTIMESTAMP: 'decisionTimestamp',
  FAILEDAT: 'failedAt',
  NEXTATTEMPTAT: 'nextAttemptAt',
  TABLEID: 'tableId',
  TABLE_NAME: 'table_name',
  TABLENAME: 'tableName',
  PARTITIONSTATE: 'partitionState',
  REPLICAID: 'replicaId',
  RAFTROLE: 'raftRole',
  STATUS: 'status',
  ADDRESS: 'address',
});
const CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS = 5000;
const CONTROL_PLANE_SNAPSHOT_OWNER_RESOLVE_METHOD = 'resolveControlSnapshot';
const CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY =
  'partitionLeaderAuthority';
const CONTROL_SNAPSHOT_FIELD_OBSERVATION_MODE = 'observationMode';
const CONTROL_SNAPSHOT_FIELD_ADMIN_OBSERVATION = 'adminObservation';
const CONTROL_SNAPSHOT_FIELD_SNAPSHOT_OBSERVATION = 'snapshotObservation';
const CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION = 'snapshotRevision';
const CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD =
  'publicationConvergence';
const CONTROL_SNAPSHOT_PUBLICATION_EPOCH_FIELD = 'publicationEpoch';
const CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD =
  'publicationActiveGateHandoff';
const CONTROL_SNAPSHOT_ACTIVE_GATE_CATCHUP_FENCE_FIELD =
  'activeGateCatchupFence';
const CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD =
  'activeGateOwnerCohort';
const CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD =
  'membershipPublicationHandoffOutcome';
const CONTROL_SNAPSHOT_AUTHORITY_INTEGER_STATE_AVAILABLE = 'available';
const CONTROL_SNAPSHOT_AUTHORITY_INTEGER_STATE_UNAVAILABLE = 'unavailable';
const CONTROL_SNAPSHOT_ADMIN_OBSERVATION_SCHEMA_VERSION = 1;
const CONTROL_SNAPSHOT_ADMIN_OBSERVATION_SOURCE =
  ADMIN_CONTROL_SNAPSHOT.TABLE_NAME;
const CONTROL_SNAPSHOT_OBSERVATION_REFRESH_APPLIED =
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.APPLIED;
const CONTROL_SNAPSHOT_OBSERVATION_REFRESH_SCHEDULED =
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED;
const CONTROL_SNAPSHOT_OBSERVATION_REFRESH_IN_FLIGHT =
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IN_FLIGHT;
const CONTROL_SNAPSHOT_OBSERVATION_REFRESH_DEFERRED =
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED;
const CONTROL_SNAPSHOT_OBSERVATION_REFRESH_FAILED =
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.FAILED;
const CONTROL_SNAPSHOT_OBSERVATION_STATE_FRESH =
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH;
const CONTROL_SNAPSHOT_OBSERVATION_STATE_STALE_USABLE =
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE;
const CONTROL_SNAPSHOT_OBSERVATION_STATE_DEFERRED =
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH;
const CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED =
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FAILED;
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
const CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE = Object.freeze({
  AVAILABLE: 'available',
});
function hasDurablePublishedMembershipObservation(
  publicationDiagnostics = null,
) {
  if (
    !publicationDiagnostics ||
    typeof publicationDiagnostics !== TYPEOF.OBJECT
  ) {
    return false;
  }
  if (
    publicationDiagnostics?.publicationObservation?.state ===
    CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE.AVAILABLE
  ) {
    return true;
  }
  if (
    publicationDiagnostics?.publishedActiveNodeIdsPresent === true ||
    Array.isArray(publicationDiagnostics?.publishedActiveNodeIds)
  ) {
    return true;
  }
  const publicationStatus = String(
    publicationDiagnostics?.status ||
      publicationDiagnostics?.publicationStatus ||
      publicationDiagnostics?.publicationObservation?.status ||
      ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
  ).toUpperCase();
  return publicationStatus === ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED;
}
function selectDurablePublishedMembershipObservation(
  publicationDiagnostics = null,
) {
  return hasDurablePublishedMembershipObservation(publicationDiagnostics) ?
    publicationDiagnostics :
    null;
}

function resolveControlSnapshotPublicationEpochDescriptor(
  controlPlaneDiagnostics,
) {
  const publicationEpoch =
    controlPlaneDiagnostics?.[CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD]?.[
      CONTROL_SNAPSHOT_PUBLICATION_EPOCH_FIELD
    ];
  return Number.isInteger(publicationEpoch) ?
    {
      state: CONTROL_SNAPSHOT_AUTHORITY_INTEGER_STATE_AVAILABLE,
      value: publicationEpoch,
    } :
    {
      state: CONTROL_SNAPSHOT_AUTHORITY_INTEGER_STATE_UNAVAILABLE,
    };
}

function attachControlSnapshotAuthorityCertificateRevision(snapshot) {
  if (
    !snapshot ||
    typeof snapshot !== TYPEOF.OBJECT ||
    Array.isArray(snapshot)
  ) {
    return snapshot;
  }
  const snapshotRevision = snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_REVISION];
  if (!Number.isInteger(snapshotRevision)) {
    return snapshot;
  }
  const authority =
    snapshot[CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY];
  if (
    !authority ||
    typeof authority !== TYPEOF.OBJECT ||
    Array.isArray(authority)
  ) {
    return snapshot;
  }
  const revisionedAuthority = {};
  for (const [partitionId, certificate] of Object.entries(authority)) {
    if (
      !certificate ||
      typeof certificate !== TYPEOF.OBJECT ||
      Array.isArray(certificate)
    ) {
      continue;
    }
    revisionedAuthority[partitionId] = {
      ...certificate,
      snapshotRevision,
    };
  }
  return {
    ...snapshot,
    [CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY]: revisionedAuthority,
  };
}

function isControlSnapshotObservationMode(value) {
  return Object.values(ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE).includes(value);
}

function resolveControlSnapshotObservationMode(snapshot, options = {}) {
  if (isControlSnapshotObservationMode(options.observationMode)) {
    return options.observationMode;
  }
  const snapshotObservation =
    snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_OBSERVATION];
  const refreshState = snapshotObservation?.refreshState;
  if (refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_APPLIED) {
    return options.forceAuthoritativeRepair === true ?
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR :
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.SCHEDULED_REPAIR;
  }
  if (refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_SCHEDULED) {
    return ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.SCHEDULED_REPAIR;
  }
  if (
    refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_IN_FLIGHT ||
    refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_DEFERRED
  ) {
    return ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED;
  }
  if (refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_FAILED) {
    return ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_FAILED;
  }
  const observationState = snapshotObservation?.state;
  if (observationState === CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED) {
    return ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_FAILED;
  }
  if (
    observationState === CONTROL_SNAPSHOT_OBSERVATION_STATE_STALE_USABLE ||
    observationState === CONTROL_SNAPSHOT_OBSERVATION_STATE_DEFERRED
  ) {
    return ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED;
  }
  if (observationState === CONTROL_SNAPSHOT_OBSERVATION_STATE_FRESH) {
    return ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FRESH_OWNER;
  }
  return options.sharedOwnerResolved === true ?
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FRESH_OWNER :
    ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.LOCAL_CACHE;
}

function normalizeControlSnapshotObservationReasonCodes(snapshot, options = {}) {
  return uniqueSorted([
    ...(Array.isArray(options.repairEvaluation?.triggerCodes) ?
      options.repairEvaluation.triggerCodes :
      ADMIN_CACHE_DUMP.EMPTY),
    ...(Array.isArray(
      snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_OBSERVATION]?.reasonCodes,
    ) ?
      snapshot[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_OBSERVATION].reasonCodes :
      ADMIN_CACHE_DUMP.EMPTY),
  ]);
}

function buildControlSnapshotAdminObservation(snapshot, mode, options = {}) {
  const snapshotObservation =
    snapshot?.[CONTROL_SNAPSHOT_FIELD_SNAPSHOT_OBSERVATION];
  const refreshState = snapshotObservation?.refreshState;
  return {
    schemaVersion: CONTROL_SNAPSHOT_ADMIN_OBSERVATION_SCHEMA_VERSION,
    source: CONTROL_SNAPSHOT_ADMIN_OBSERVATION_SOURCE,
    mode,
    sharedOwnerResolved: options.sharedOwnerResolved === true,
    repair: {
      applied:
        options.repair?.applied === true ||
        refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_APPLIED,
      forced: options.forceAuthoritativeRepair === true,
      deferred:
        options.repairDeferred === true ||
        refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_IN_FLIGHT ||
        refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_DEFERRED,
      failed:
        options.repairFailed === true ||
        refreshState === CONTROL_SNAPSHOT_OBSERVATION_REFRESH_FAILED ||
        snapshotObservation?.state === CONTROL_SNAPSHOT_OBSERVATION_STATE_FAILED,
      triggerCodes: normalizeControlSnapshotObservationReasonCodes(
        snapshot,
        options,
      ),
    },
  };
}

function attachControlSnapshotObservationMode(snapshot, options = {}) {
  if (
    !snapshot ||
    typeof snapshot !== TYPEOF.OBJECT ||
    Array.isArray(snapshot)
  ) {
    return snapshot;
  }
  const mode = resolveControlSnapshotObservationMode(snapshot, options);
  return {
    ...snapshot,
    [CONTROL_SNAPSHOT_FIELD_OBSERVATION_MODE]: mode,
    [CONTROL_SNAPSHOT_FIELD_ADMIN_OBSERVATION]:
      buildControlSnapshotAdminObservation(snapshot, mode, options),
  };
}
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart1 {
  /**
   * @param {Object} deps
   * @param {Object} deps.systemTableCache
   * @param {string} deps.nodeId
   * @param {Function|null} deps.resolveLocalPartitionServices
   */
  constructor(deps = {}) {
    this.systemTableCache = deps.systemTableCache || null;
    this.nodeId = deps.nodeId || null;
    this.cacheMutationTarget = deps.cacheMutationTarget || null;
    this.sqlQueryEngine = deps.sqlQueryEngine || null;
    this.messageRouter = deps.messageRouter || null;
    this.cdcIntegrationService = deps.cdcIntegrationService || null;
    this.controlPlaneSystemTableGateway =
      deps.controlPlaneSystemTableGateway || null;
    this.controlPlaneReadinessService =
      deps.controlPlaneReadinessService || null;
    this.controlPlaneSnapshotOwner = deps.controlPlaneSnapshotOwner || null;
    this.startupRecoveryCoordinator =
      deps.startupRecoveryCoordinator ||
      new StartupRecoveryCoordinator({
        readinessState: deps.bootstrapReadinessState || null,
        now: deps.nowFn,
      });
    this.heartbeatService = deps.heartbeatService || null;
    this.readinessSnapshotCacheMaxAgeMs =
      Number.isFinite(deps.readinessSnapshotCacheMaxAgeMs) &&
      deps.readinessSnapshotCacheMaxAgeMs > NUM.ZERO ?
        Math.floor(deps.readinessSnapshotCacheMaxAgeMs) :
        CONTROL_PLANE_DIAGNOSTICS_READINESS_CACHE_MAX_AGE_MS;
    this.ensureAuthoritativeDiscoveryCacheRepair =
      typeof deps.ensureAuthoritativeDiscoveryCacheRepair === TYPEOF.FUNCTION ?
        deps.ensureAuthoritativeDiscoveryCacheRepair :
        null;
    this.resolveLocalPartitionServices =
      typeof deps.resolveLocalPartitionServices === TYPEOF.FUNCTION ?
        deps.resolveLocalPartitionServices :
        null;
    this.nowFn =
      typeof deps.nowFn === TYPEOF.FUNCTION ? deps.nowFn : () => Date.now();
  }
  /**
   * Build local control snapshot payload from system cache only.
   * @return {Object}
   */
  async buildLocalControlSnapshot(options = {}) {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION
    ) {
      throw new Error(ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE);
    }
    const tableRows = this.systemTableCache.getAll(TABLES.TABLES);
    const partitionRows = this.systemTableCache.getAll(TABLES.PARTITIONS);
    const replicaOperationRows = this.systemTableCache.getAll(
      TABLES.REPLICA_OPERATIONS,
    );
    const capturedAt = this.nowFn();
    const preferAuthoritativePublicationRead =
      options.preferAuthoritativePublicationRead === true ||
      options.allowAuthoritativeRepair === true ||
      options.forceAuthoritativeRepair === true;
    const reconcileAuthoritativeMembershipPublication =
      options.reconcileAuthoritativeMembershipPublication === true;
    const controlPlaneDiagnostics =
      await this.buildControlPlaneDiagnosticsSnapshot({
        capturedAt,
        tableRows,
        preferAuthoritativePublicationRead,
        reconcileAuthoritativeMembershipPublication,
        publicationActiveGateHandoff: options.publicationActiveGateHandoff,
        allowAuthoritativeReadinessRefresh:
          options.allowAuthoritativeReadinessRefresh,
        allowStaleReadinessOnCacheChange:
          options.allowStaleReadinessOnCacheChange,
        allowAuthoritativePublishedMembershipRecovery:
          options.allowAuthoritativePublishedMembershipRecovery === true,
      });
    const nodeRows = this.systemTableCache.getAll(TABLES.NODES);
    const serviceRows = this.systemTableCache.getAll(TABLES.SERVICES);
    const nodeEndpointRows = this.systemTableCache.getAll(
      TABLES.NODE_ENDPOINTS,
    );
    const publicationRows = this.systemTableCache.getAll(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
    );
    const publicationRowsForActiveNodeResolution = Array.isArray(
      publicationRows,
    ) ?
      publicationRows.slice() :
      [];
    const publishedMembershipObservation =
      selectDurablePublishedMembershipObservation(
        controlPlaneDiagnostics?.publishedMembershipObservation,
      );
    if (publishedMembershipObservation) {
      publicationRowsForActiveNodeResolution.push(
        publishedMembershipObservation,
      );
    }
    const activeNodeViews = this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      controlPlaneDiagnostics,
      publicationRowsForActiveNodeResolution,
    );
    if (
      controlPlaneDiagnostics &&
      typeof controlPlaneDiagnostics === TYPEOF.OBJECT
    ) {
      const publicationActiveGateHandoff =
        this.resolvePublicationActiveGateHandoffContract({
          nodeRows,
          activeNodeViews,
          controlPlaneDiagnostics,
          nowMs: capturedAt,
        });
      controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
      ] = publicationActiveGateHandoff;
      const readinessEntries = Object.values(
        controlPlaneDiagnostics.readinessByNodeId || {},
      );
      const reevaluatedEvidence =
        this.resolveCanonicalPublicationRecoveryEvidenceDiagnostics(
          readinessEntries,
          controlPlaneDiagnostics.publicationConvergence,
          controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots,
          {
            logsTable: controlPlaneDiagnostics.logsTable,
            publicationActiveGateHandoff,
          },
        );
      const resolvedConvergence =
        reevaluatedEvidence.publicationConvergence ||
        controlPlaneDiagnostics.publicationConvergence;
      const resolvedConvergenceGate =
        reevaluatedEvidence.publicationConvergenceGate ||
        controlPlaneDiagnostics.publicationConvergenceGate;
      const reevaluatedPriorityObservation =
        reevaluatedEvidence.priorityRecoveryObservation ||
        buildCanonicalPublicationRecoveryEvidence({
          publicationConvergence: resolvedConvergence,
          publicationConvergenceGate: resolvedConvergenceGate,
          priorityRecoveryDecisionSnapshots:
            controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots,
          logsTable: controlPlaneDiagnostics.logsTable,
          publicationActiveGateHandoff,
        }).priorityRecoveryObservation;

      controlPlaneDiagnostics.publicationConvergence = resolvedConvergence;
      controlPlaneDiagnostics.publicationConvergenceGate = resolvedConvergenceGate;
      controlPlaneDiagnostics.priorityRecoveryObservation = reevaluatedPriorityObservation;
      controlPlaneDiagnostics[CONTROL_SNAPSHOT_ACTIVE_GATE_CATCHUP_FENCE_FIELD] =
        publicationActiveGateHandoff.activeGateCatchupFence;
      if (
        controlPlaneDiagnostics[
          CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
        ] &&
        typeof controlPlaneDiagnostics[
          CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
        ] === TYPEOF.OBJECT
      ) {
        controlPlaneDiagnostics[
          CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
        ][CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD] =
          publicationActiveGateHandoff;
        controlPlaneDiagnostics[
          CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
        ][CONTROL_SNAPSHOT_ACTIVE_GATE_CATCHUP_FENCE_FIELD] =
          publicationActiveGateHandoff.activeGateCatchupFence;
      }
      controlPlaneDiagnostics[CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD] =
        this.resolveActiveGateOwnerCohortSnapshot({
          nodeRows,
          activeNodeViews,
          publicationActiveGateHandoff,
          controlPlaneDiagnostics,
          nowMs: capturedAt,
        });
      if (
        reconcileAuthoritativeMembershipPublication === true &&
        typeof this.reconcileAuthoritativeMembershipPublicationFromHandoff ===
          TYPEOF.FUNCTION
      ) {
        const membershipPublicationHandoffOutcome =
          await this.reconcileAuthoritativeMembershipPublicationFromHandoff(
            publicationActiveGateHandoff,
            {
              ...options,
              reconcileAuthoritativeMembershipPublication: true,
            },
          );
        if (
          membershipPublicationHandoffOutcome &&
          typeof membershipPublicationHandoffOutcome === TYPEOF.OBJECT
        ) {
          controlPlaneDiagnostics[
            CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
          ] = membershipPublicationHandoffOutcome;
          const publicationConvergence =
            controlPlaneDiagnostics[
              CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
            ];
          if (
            publicationConvergence &&
            typeof publicationConvergence === TYPEOF.OBJECT &&
            !Array.isArray(publicationConvergence)
          ) {
            controlPlaneDiagnostics[
              CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
            ] = {
              ...publicationConvergence,
              [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
                membershipPublicationHandoffOutcome,
            };
          }
          controlPlaneDiagnostics[
            CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
          ] = {
            ...controlPlaneDiagnostics[
              CONTROL_SNAPSHOT_ACTIVE_GATE_OWNER_COHORT_FIELD
            ],
            [CONTROL_SNAPSHOT_MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD]:
              membershipPublicationHandoffOutcome,
          };
        }
      }
      controlPlaneDiagnostics.activeNodeViews = {
        authoritativeSource: activeNodeViews.authoritativeSource,
        authoritativeNodeIds: [...activeNodeViews.authoritativeActiveNodeIds],
        projectedServingNodeIds: [...activeNodeViews.projectedServingNodeIds],
        locallyEligibleNodeIds: [...activeNodeViews.locallyEligibleNodeIds],
        suspectedOrTransitioningNodeIds: [
          ...activeNodeViews.suspectedOrTransitioningNodeIds,
        ],
        membershipFreeze: activeNodeViews.membershipFreeze,
        effectiveSource: activeNodeViews.effectiveSource,
        effectiveNodeIds: [...activeNodeViews.effectiveActiveNodeIds],
        projectedNodeIds: [...activeNodeViews.projectedActiveNodeIds],
        publishedNodeIds: Array.isArray(activeNodeViews.publishedActiveNodeIds) ?
          [...activeNodeViews.publishedActiveNodeIds] :
          [],
        publishedMembershipAvailable:
          activeNodeViews.publishedMembershipAvailable === true,
      };
    }
    const activePartitionRows = filterActiveServingPartitionRows(
      partitionRows,
      tableRows,
    );
    const activePartitionIdSet = new Set(
      activePartitionRows
        .map((row) =>
          firstStringField(row, COLUMN.PARTITION_ID, 'partitionId', 'id'),
        )
        .filter(Boolean),
    );
    const activePartitionServiceRows = serviceRows.filter((serviceRow) => {
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partitionId',
        'id',
      );
      return partitionId && activePartitionIdSet.has(partitionId);
    });
    const partitionIds = uniqueSorted(
      activePartitionRows
        .map((row) => firstStringField(row, COLUMN.PARTITION_ID, 'id'))
        .filter(Boolean),
    );
    const publicationEpochDescriptor =
      resolveControlSnapshotPublicationEpochDescriptor(
        controlPlaneDiagnostics,
      );
    const leaderSummaryOptions =
      publicationEpochDescriptor.state ===
      CONTROL_SNAPSHOT_AUTHORITY_INTEGER_STATE_AVAILABLE ?
        {
          publicationEpoch: publicationEpochDescriptor.value,
        } :
        {};
    const leaderSummary = this.buildControlSnapshotLeaderSummary(
      activePartitionRows,
      activePartitionServiceRows,
      leaderSummaryOptions,
    );
    const voterCounts = this.buildControlSnapshotVoterCounts(
      activePartitionServiceRows,
    );
    const replicaOperations =
      this.buildControlSnapshotReplicaOperationSummary(replicaOperationRows, options);
    return {
      schemaVersion: ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION,
      nodeId: this.nodeId,
      capturedAt,
      nodes: [...activeNodeViews.effectiveActiveNodeIds],
      publishedNodes: Array.isArray(activeNodeViews.publishedActiveNodeIds) ?
        [...activeNodeViews.publishedActiveNodeIds] :
        [],
      projectedNodes: [...activeNodeViews.projectedServingNodeIds],
      suspectedOrTransitioningNodes: [
        ...activeNodeViews.suspectedOrTransitioningNodeIds,
      ],
      partitions: partitionIds,
      cdcTelemetry: this.buildLocalCdcTelemetry(),
      controlPlaneDiagnostics,
      leaders: leaderSummary.leaders,
      [CONTROL_SNAPSHOT_FIELD_PARTITION_LEADER_AUTHORITY]:
        leaderSummary.partitionLeaderAuthority,
      replicaRoles: leaderSummary.replicaRoles,
      replicaRoleDiagnostics: leaderSummary.replicaRoleDiagnostics,
      voterCounts,
      replicaOperations,
    };
  }
  async resolveSharedControlSnapshot(localSnapshot, options = {}) {
    const owner = this.controlPlaneSnapshotOwner;
    if (
      !owner ||
      typeof owner[CONTROL_PLANE_SNAPSHOT_OWNER_RESOLVE_METHOD] !==
        TYPEOF.FUNCTION
    ) {
      return attachControlSnapshotObservationMode(localSnapshot, {
        ...options,
        sharedOwnerResolved: false,
      });
    }
    const sharedSnapshot = await owner[CONTROL_PLANE_SNAPSHOT_OWNER_RESOLVE_METHOD](
      localSnapshot,
      options,
    );
    return attachControlSnapshotObservationMode(
      attachControlSnapshotObservationActiveGateHandoff(
        attachControlSnapshotAuthorityCertificateRevision(sharedSnapshot),
        this,
        options,
      ),
      {
        ...options,
        sharedOwnerResolved: true,
      },
    );
  }
}
const CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD =
  'controlPlaneDiagnostics';
const CONTROL_SNAPSHOT_READINESS_BY_NODE_ID_FIELD = 'readinessByNodeId';
const CONTROL_SNAPSHOT_REASON_CODES_FIELD = 'reasonCodes';
function isControlSnapshotPlainRecord(value) {
  return value && typeof value === TYPEOF.OBJECT && !Array.isArray(value);
}
function resolveControlSnapshotLocalNodeId(snapshot = null, owner = null) {
  const snapshotNodeId = snapshot?.[ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID];
  if (
    typeof snapshotNodeId === TYPEOF.STRING &&
    snapshotNodeId.length > NUM.ZERO
  ) {
    return snapshotNodeId;
  }
  return typeof owner?.nodeId === TYPEOF.STRING &&
    owner.nodeId.length > NUM.ZERO ?
    owner.nodeId :
    ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE;
}
function buildControlSnapshotObservationReadinessByNodeId(
  snapshot = null,
  owner = null,
  options = {},
) {
  const controlPlaneDiagnostics =
    snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
  const nodeId = resolveControlSnapshotLocalNodeId(snapshot, owner);
  const observationReasonCodes =
    normalizeControlSnapshotObservationReasonCodes(snapshot, options);
  if (
    !isControlSnapshotPlainRecord(controlPlaneDiagnostics) ||
    nodeId.length === NUM.ZERO ||
    observationReasonCodes.length === NUM.ZERO
  ) {
    return controlPlaneDiagnostics?.[
      CONTROL_SNAPSHOT_READINESS_BY_NODE_ID_FIELD
    ];
  }
  const readinessByNodeId = isControlSnapshotPlainRecord(
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_READINESS_BY_NODE_ID_FIELD
    ],
  ) ?
    controlPlaneDiagnostics[
      CONTROL_SNAPSHOT_READINESS_BY_NODE_ID_FIELD
    ] :
    {};
  const readinessEntry = isControlSnapshotPlainRecord(
    readinessByNodeId[nodeId],
  ) ?
    readinessByNodeId[nodeId] :
    {};
  return {
    ...readinessByNodeId,
    [nodeId]: {
      ...readinessEntry,
      [CONTROL_SNAPSHOT_REASON_CODES_FIELD]: uniqueSorted([
        ...(Array.isArray(
          readinessEntry[CONTROL_SNAPSHOT_REASON_CODES_FIELD],
        ) ?
          readinessEntry[CONTROL_SNAPSHOT_REASON_CODES_FIELD] :
          []),
        ...observationReasonCodes,
      ]),
    },
  };
}
function attachControlSnapshotObservationActiveGateHandoff(
  snapshot = null,
  owner = null,
  options = {},
) {
  const controlPlaneDiagnostics =
    snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
  if (
    !isControlSnapshotPlainRecord(snapshot) ||
    !isControlSnapshotPlainRecord(controlPlaneDiagnostics) ||
    typeof owner?.resolvePublicationActiveGateHandoffContract !==
      TYPEOF.FUNCTION
  ) {
    return snapshot;
  }
  const readinessByNodeId = buildControlSnapshotObservationReadinessByNodeId(
    snapshot,
    owner,
    options,
  );
  if (!isControlSnapshotPlainRecord(readinessByNodeId)) {
    return snapshot;
  }
  const publicationActiveGateHandoff =
    owner.resolvePublicationActiveGateHandoffContract({
      controlPlaneDiagnostics,
      activeNodeViews: controlPlaneDiagnostics.activeNodeViews,
      publicationConvergence:
        controlPlaneDiagnostics[
          CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
        ],
      readinessByNodeId,
    });
  const publicationConvergence = isControlSnapshotPlainRecord(
    controlPlaneDiagnostics[CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD],
  ) ?
    {
      ...controlPlaneDiagnostics[
        CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD
      ],
      [CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD]:
        publicationActiveGateHandoff,
      [CONTROL_SNAPSHOT_ACTIVE_GATE_CATCHUP_FENCE_FIELD]:
        publicationActiveGateHandoff.activeGateCatchupFence,
    } :
    controlPlaneDiagnostics[CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD];
  return {
    ...snapshot,
    [CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD]: {
      ...controlPlaneDiagnostics,
      [CONTROL_SNAPSHOT_READINESS_BY_NODE_ID_FIELD]: readinessByNodeId,
      [CONTROL_SNAPSHOT_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD]:
        publicationActiveGateHandoff,
      [CONTROL_SNAPSHOT_ACTIVE_GATE_CATCHUP_FENCE_FIELD]:
        publicationActiveGateHandoff.activeGateCatchupFence,
      [CONTROL_SNAPSHOT_PUBLICATION_CONVERGENCE_FIELD]: publicationConvergence,
    },
  };
}
export {AdminControlSnapshotPart1};
