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
import {NUM, TYPEOF} from '../constants/index.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from './admin-constants.js';
import {
} from '../control-plane/active-node-projection.js';
import {
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {AdminControlSnapshotPart1} from './admin-control-snapshot-class-part-1.js';
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
const CONTROL_SNAPSHOT_REPAIR_REASON = 'control_snapshot';
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
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
function hasOnlyLeaderResolutionGapRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
    ) :
    ADMIN_CACHE_DUMP.EMPTY;
  return (
    causeChain.length > NUM.ZERO &&
    causeChain.every(
      (value) => value === AUTHORITATIVE_REPAIR_CAUSE_LEADER_RESOLUTION_GAP,
    )
  );
}
function hasPressureOrTimeoutRepairCause(repair = null) {
  const causeChain = Array.isArray(repair?.causeChain) ?
    repair.causeChain.filter(
      (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
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
    message.length > NUM.ZERO &&
    CONTROL_SNAPSHOT_PUBLICATION_READ_REPAIR_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    )
  );
}
function buildAuthoritativeControlSnapshotRepairFailure(detail, cause = null) {
  const error = new Error(
    'Authoritative control snapshot repair failed: ' +
      String(detail || 'unknown_error'),
  );
  if (cause) {
    error.cause = cause;
  }
  return error;
}
function isReadyLocalQueryTransportDiagnostic(localQueryTransport = null) {
  if (!localQueryTransport || typeof localQueryTransport !== TYPEOF.OBJECT) {
    return false;
  }
  if (localQueryTransport.ready === true) {
    return true;
  }
  return (
    String(
      localQueryTransport.state || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE,
    ).toLowerCase() === ADMIN_CONTROL_SNAPSHOT_LITERAL.READY
  );
}
function attachAuthoritativeRepairDiagnostics(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
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
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart2 extends AdminControlSnapshotPart1 {
  /**
   * Resolve one local control snapshot with optional authoritative
   * cache repair when partition topology appears incomplete.
   * @return {Promise<Object>}
   */
  async resolveLocalControlSnapshot(options = {}) {
    const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
    const allowAuthoritativeRepair = options.allowAuthoritativeRepair === true;
    let snapshot = null;
    try {
      snapshot = await this.buildLocalControlSnapshot(options);
    } catch (error) {
      if (
        !forceAuthoritativeRepair ||
        !this.canRunAuthoritativeControlSnapshotRepair() ||
        !isRecoverableControlSnapshotPublicationReadError(error)
      ) {
        throw error;
      }
      let repair = null;
      try {
        repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
          reason: CONTROL_SNAPSHOT_REPAIR_REASON,
          bypassReuse: true,
        });
      } catch (repairError) {
        throw buildAuthoritativeControlSnapshotRepairFailure(
          repairError?.message || repairError,
          repairError,
        );
      }
      if (repair?.applied !== true) {
        const errors = Array.isArray(repair?.errors) ?
          repair.errors :
          ADMIN_CACHE_DUMP.EMPTY;
        const detail =
          errors[NUM.ZERO] ||
          repair?.error ||
          (repair?.skipped === true ? 'repair_skipped' : 'repair_not_applied');
        throw buildAuthoritativeControlSnapshotRepairFailure(detail);
      }
      const repairedSnapshot = await this.buildLocalControlSnapshot({
        ...options,
        preferAuthoritativePublicationRead: true,
        reconcileAuthoritativeMembershipPublication: true,
      });
      const repairedEvaluation =
        this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot);
      return this.resolveSharedControlSnapshot(
        attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
          repair,
          repairEvaluation: repairedEvaluation,
          forceAuthoritativeRepair,
        }),
        {
          ...options,
          observationMode:
            ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR,
          repair,
          repairEvaluation: repairedEvaluation,
        },
      );
    }
    const repairEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(snapshot);
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      return this.resolveSharedControlSnapshot(snapshot, options);
    }
    if (
      forceAuthoritativeRepair !== true &&
      !shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        forceAuthoritativeRepair,
        allowAuthoritativeRepair,
      })
    ) {
      return this.resolveSharedControlSnapshot(
        snapshot,
        repairEvaluation?.shouldRepair === true ?
          {
            ...options,
            observationMode:
                ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
            repairEvaluation,
            repairDeferred: true,
          } :
          options,
      );
    }
    const canDegradeRepairFailure =
      this.canDegradeAuthoritativeControlSnapshotRepairFailure({
        forceAuthoritativeRepair,
        repairEvaluation,
      });
    let repair = null;
    try {
      repair = await this.ensureAuthoritativeDiscoveryCacheRepair({
        reason: CONTROL_SNAPSHOT_REPAIR_REASON,
        bypassReuse: forceAuthoritativeRepair,
        triggerCodes: repairEvaluation?.triggerCodes,
      });
    } catch (error) {
      if (canDegradeRepairFailure) {
        return this.resolveSharedControlSnapshot(snapshot, {
          ...options,
          observationMode:
            ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          repairEvaluation,
          repairDeferred: true,
        });
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        error?.message || error || ADMIN_CONTROL_SNAPSHOT_LITERAL.UNKNOWN_ERROR,
        error,
      );
    }
    if (repair?.applied !== true) {
      if (canDegradeRepairFailure) {
        return this.resolveSharedControlSnapshot(snapshot, {
          ...options,
          observationMode:
            ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          repair,
          repairEvaluation,
          repairDeferred: true,
        });
      }
      if (
        this.canDegradeAuthoritativeControlSnapshotRepairFailure({
          forceAuthoritativeRepair,
          repairEvaluation,
          repair,
        })
      ) {
        return this.resolveSharedControlSnapshot(snapshot, {
          ...options,
          observationMode:
            ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          repair,
          repairEvaluation,
          repairDeferred: true,
        });
      }
      const errors = Array.isArray(repair?.errors) ?
        repair.errors :
        ADMIN_CACHE_DUMP.EMPTY;
      const detail =
        errors[NUM.ZERO] ||
        repair?.error ||
        (repair?.skipped === true ? 'repair_skipped' : 'repair_not_applied');
      throw buildAuthoritativeControlSnapshotRepairFailure(detail);
    }
    const repairedSnapshot = await this.buildLocalControlSnapshot({
      ...options,
      preferAuthoritativePublicationRead: true,
      reconcileAuthoritativeMembershipPublication: true,
    });
    const repairedEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot);
    return this.resolveSharedControlSnapshot(
      attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
        repair,
        repairEvaluation: repairedEvaluation,
        forceAuthoritativeRepair,
      }),
      {
        ...options,
        observationMode: forceAuthoritativeRepair ?
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR :
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.SCHEDULED_REPAIR,
        repair,
        repairEvaluation: repairedEvaluation,
      },
    );
  }
  canDegradeAuthoritativeControlSnapshotRepairFailure(options = {}) {
    if (
      options.forceAuthoritativeRepair !== true &&
      hasOnlyLeaderResolutionGapRepairCause(options.repair) &&
      isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport)
    ) {
      return true;
    }
    if (
      options.forceAuthoritativeRepair !== true &&
      hasPressureOrTimeoutRepairCause(options.repair) &&
      isReadyLocalQueryTransportDiagnostic(options.repair?.localQueryTransport)
    ) {
      return true;
    }
    if (
      hasAuthoritativeRepairTrigger(
        options.repairEvaluation,
        AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
      ) ||
      options.repairEvaluation?.nodeCoverage?.activeProjection
        ?.hasCoverageGap === true
    ) {
      return false;
    }
    if (isReplicaOperationsOnlyRepairScope(options.repairEvaluation)) {
      return true;
    }
    const failedTables = Array.isArray(options.repair?.failedTables) ?
      options.repair.failedTables.filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ) :
      ADMIN_CACHE_DUMP.EMPTY;
    return isReplicaOperationsOnlyTableSet(failedTables);
  }
  resolveControlSnapshotActiveNodeIds(
    nodeRows = [],
    serviceRows = [],
    nodeEndpointRows = [],
    controlPlaneDiagnostics = null,
    publicationRows = [],
  ) {
    return this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      controlPlaneDiagnostics,
      publicationRows,
    ).authoritativeActiveNodeIds;
  }
}
export {AdminControlSnapshotPart2};
