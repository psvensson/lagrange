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
import {COLUMN, NUM, TABLES, TIME_MS, TYPEOF} from '../constants/index.js';
import {PARTITION_TRANSITION_METADATA_FIELD} from '../partition/partition-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {CONTROL_PLANE_DELIVERY_PRIORITY} from '../control-plane/control-plane-constants.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  CONSISTENCY_MISMATCH_KIND,
} from './admin-constants.js';
import {
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';
import {buildCanonicalPublicationRecoveryEvidence} from '../control-plane/publication-recovery-evidence.js';
import {buildPublicationRecoveryProtocolSnapshot} from '../control-plane/recovery-protocol-snapshot.js';
import {buildPublicationRecoveryGateSnapshot} from '../control-plane/publication-recovery-gate.js';
import {normalizeControlPlanePublicationRow} from '../control-plane/system-row-normalizers.js';
import {
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {StartupRecoveryCoordinator} from '../bootstrap/startup-recovery-coordinator.js';
import {assignAdminControlSnapshotReadinessDiagnosticsMethods} from './admin-control-snapshot-readiness-diagnostics-methods.js';
import {assignAdminControlSnapshotLocalDiagnosticsMethods} from './admin-control-snapshot-local-diagnostics-methods.js';
import {AdminControlSnapshot} from './admin-control-snapshot-leadership-summary.js';
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
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const PARTITION_STATE_UNKNOWN = 'unknown';
const SQL_DIAGNOSTICS_REPLICA_COUNT = NUM.THREE;
const CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT = 64;
const MANAGED_SPLIT_WORKFLOW_TYPE = 'managed_split';
const CDC_TELEMETRY_MODE = Object.freeze({
  STEADY: 'steady',
  CATCHUP: 'catchup',
});
const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';
const CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD = 'nodeStatePublication';
const CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD =
  'getControlPlanePublicationStorySync';
const AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP =
  'leader_resolution_gap';
const AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT = 'query_timeout';
const AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE =
  'control_plane_backpressure';
const CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS = Object.freeze([
  'leader is unknown',
  'leader unknown',
  'no handler',
  'no leader',
  'partition_service_not_found',
  'partition service not found',
]);
const MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS = 'diagnostics';
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
function toNonNegativeInteger(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }
  return Math.floor(parsedValue);
}
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === 'string' && value.length > 0,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.length > 0 &&
    causeChain.every(
      (value) => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    )
  );
}
function hasPressureOrTimeoutRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === 'string' && value.length > 0,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_QUERY_TIMEOUT) ||
    causeChain.includes(AUTHORITATIVE_REPAIR_CAUSE_CONTROL_PLANE_BACKPRESSURE)
  );
}
function isRecoverableControlSnapshotPublicationReadError(error = null) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.length > 0 &&
    CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    )
  );
}
function buildMembershipPublicationReadOptions(options = {}) {
  return options.readSource ===
    MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED ?
    {
      readSource:
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS,
      deliveryPriority: CONTROL_PLANE_DELIVERY_PRIORITY.READINESS,
    } :
    {readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE_DIAGNOSTICS};
}
function attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot;
  }
  const activeProjection =
    options.repairEvaluation?.nodeCoverage?.activeProjection || null;
  snapshot.authoritativeRepair = {
    applied: options.repair?.applied === true,
    forced: options.forceAuthoritativeRepair === true,
    triggerCodes: Array.isArray(options.repairEvaluation?.triggerCodes) ?
      [...options.repairEvaluation.triggerCodes] :
      ADMIN_CACHE_DUMP.EMPTY,
    activeProjectionCoverageGap: activeProjection?.hasCoverageGap === true,
    activeProjectionMissingNodeIds: Array.isArray(
      activeProjection?.missingNodeIds,
    ) ?
      [...activeProjection.missingNodeIds] :
      ADMIN_CACHE_DUMP.EMPTY,
  };
  return snapshot;
}
function resolvePublicationOrderingValue(row, keys = []) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}
function isMembershipPublicationRow(row) {
  const normalizedRow = normalizeControlPlanePublicationRow(row);
  const publicationKind = String(
    normalizedRow.publicationKind || '',
  ).toLowerCase();
  return (
    publicationKind.length === 0 ||
    publicationKind === MEMBERSHIP_PUBLICATION_KIND
  );
}
function resolveLatestMembershipPublicationRow(
  publicationRows = [],
  options = {},
) {
  const expectedStatus =
    typeof options.status === 'string' ?
      options.status.toUpperCase() :
      null;
  const normalizedRows = (Array.isArray(publicationRows) ? publicationRows : [])
    .filter((row) => row && typeof row === 'object')
    .filter((row) => isMembershipPublicationRow(row))
    .map((row) => normalizeControlPlanePublicationRow(row))
    .filter((row) => {
      if (expectedStatus && row.status !== expectedStatus) {
        return false;
      }
      return Boolean(
        row.publicationId ||
        row.publicationEpoch ||
        row.status ||
        (Array.isArray(row.publishedActiveNodeIds) &&
          row.publishedActiveNodeIds.length > 0),
      );
    });
  if (normalizedRows.length === 0) {
    return null;
  }
  normalizedRows.sort((left, right) => {
    const publicationEpochDelta =
      resolvePublicationOrderingValue(right, [
        'publicationEpoch',
        'publication_epoch',
      ]) -
      resolvePublicationOrderingValue(left, [
        'publicationEpoch',
        'publication_epoch',
      ]);
    if (publicationEpochDelta !== 0) {
      return publicationEpochDelta;
    }
    const publishedAtDelta =
      resolvePublicationOrderingValue(right, ['publishedAt', 'published_at']) -
      resolvePublicationOrderingValue(left, ['publishedAt', 'published_at']);
    if (publishedAtDelta !== 0) {
      return publishedAtDelta;
    }
    return (
      resolvePublicationOrderingValue(right, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ]) -
      resolvePublicationOrderingValue(left, [
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATEDAT,
        ADMIN_CONTROL_SNAPSHOT_LITERAL.UPDATED_AT,
      ])
    );
  });
  return normalizedRows[0] || null;
}
const CONTROL_SNAPSHOT_PUBLICATION_OBSERVATION_STATE = Object.freeze({
  AVAILABLE: 'available',
});
function hasDurablePublishedMembershipObservation(
  publicationDiagnostics = null,
) {
  if (
    !publicationDiagnostics ||
    typeof publicationDiagnostics !== 'object'
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
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
assignAdminControlSnapshotReadinessDiagnosticsMethods(AdminControlSnapshot, {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  AUTHORITATIVE_REPAIR_TRIGGER,
  COLUMN,
  CONSISTENCY_MISMATCH_KIND,
  CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
  CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD,
  CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD,
  CONTROL_PLANE_READINESS_DIMENSION,
  MANAGED_SPLIT_WORKFLOW_TYPE,
  MEMBERSHIP_PUBLICATION_KIND,
  NUM,
  PARTITION_TRANSITION_METADATA_FIELD,
  PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE,
  PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE,
  PRIORITY_RECOVERY_CORRELATION_KEY,
  PRIORITY_RECOVERY_PROGRESS_CLASS_IDS,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_SEMANTIC_STATE_IDS,
  PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS,
  TYPEOF,
  StartupRecoveryCoordinator,
  attachAuthoritativeRepairDiagnostics,
  buildMembershipPublicationReadOptions,
  buildCanonicalPublicationRecoveryEvidence,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
  firstStringField,
  hasDurablePublishedMembershipObservation,
  hasOnlyLeaderResolutionGapRepairCause,
  hasPressureOrTimeoutRepairCause,
  isRecoverableControlSnapshotPublicationReadError,
  normalizeControlPlanePublicationRow,
  resolveLatestMembershipPublicationRow,
  resolvePublicationOrderingValue,
  selectDurablePublishedMembershipObservation,
  uniqueSorted,
});
assignAdminControlSnapshotLocalDiagnosticsMethods(AdminControlSnapshot, {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  CDC_TELEMETRY_MODE,
  COLUMN,
  NUM,
  PARTITION_STATE_UNKNOWN,
  SERVICE_TYPE_PARTITION,
  SQL_DIAGNOSTICS_REPLICA_COUNT,
  STATUS_ACTIVE,
  TABLES,
  TIME_MS,
  TYPEOF,
  firstStringField,
  toNonNegativeInteger,
  uniqueSorted,
});
export {AdminControlSnapshot};
import {MEMBERSHIP_PUBLICATION_READ_SOURCE} from
  '../control-plane/membership-publication-row-contract.js';
