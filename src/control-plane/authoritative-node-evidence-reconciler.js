import {assertCritical} from '../utils/assert.js';
import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {ControlPlaneDiagnosticsLedger} from
  './control-plane-diagnostics-ledger.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
} from './control-plane-cache-reconcile-constants.js';

const READINESS_DIAGNOSTICS_LEDGER_LIMIT = 128;
const EMPTY_STRING = '';
const EMPTY_LEDGER_ENTRIES = Object.freeze([]);
const EMPTY_REPAIR_ROWS = Object.freeze([]);
const DEFAULT_REPAIR_COOLDOWN_MS = 5000;
const DEFAULT_REPAIR_FAILURE_COOLDOWN_MS = 30000;
const DEFAULT_REPAIR_NO_CHANGE_COOLDOWN_MS = 15000;
const DEFAULT_REPAIR_QUERY_TIMEOUT_MS = 1500;
const DEFAULT_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS = 30000;
const REPAIR_STAGE = Object.freeze({
  SCHEDULED: 'scheduled',
  COOLDOWN_SKIPPED: 'cooldown_skipped',
  COMPLETED: 'completed',
  FAILED: 'failed',
});
const REPAIR_LANE_NAME = 'control-plane-readiness-repair';
const REPAIR_CAUSE_PREFIX = 'readiness-authoritative-cache-repair:';
const AUTHORITATIVE_REPAIR_INTENT = Object.freeze({
  REFRESH_EVIDENCE: CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE,
});
const AUTHORITATIVE_REPAIR_STATE = Object.freeze({
  VIEW_UNAVAILABLE: 'view_unavailable',
  SNAPSHOT_UNAVAILABLE: 'snapshot_unavailable',
  REPAIRED: 'repaired',
  UNCHANGED: 'unchanged',
});
const AUTHORITATIVE_TABLE_EVIDENCE_STATE = Object.freeze({
  UNAVAILABLE: 'unavailable',
  OBSERVED_ROWS: 'observed_rows',
  OBSERVED_EMPTY_CONFIRMED: 'observed_empty_confirmed',
  OBSERVED_EMPTY_UNCONFIRMED: 'observed_empty_unconfirmed',
});
const AUTHORITATIVE_CONFIRMED_EMPTY_SOURCE = Object.freeze({
  OWNER_RPC_LANE: 'owner_rpc_lane',
  SQL_QUERY_ENGINE: 'sql_query_engine',
});
const REPAIR_OUTCOME_FAILED = 'failed';
const REPAIR_OUTCOME_REPAIRED = 'repaired';
const REPAIR_OUTCOME_UNCHANGED = 'unchanged';
const REPAIR_FAILED_LOG_MESSAGE = 'Authoritative readiness repair failed';
const REPAIR_APPLIED_LOG_MESSAGE =
  'Repaired readiness cache from authoritative node/service/partition rows';
const REPAIR_REQUIRED_DEPENDENCY_ERROR_PREFIX =
  'AuthoritativeNodeEvidenceReconciler requires ';
const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_DEPENDENCY =
  'controlPlaneSystemTableGateway';
const UNKNOWN_AUTHORITATIVE_REPAIR_STATE_ERROR_PREFIX =
  'Unknown authoritative node repair state: ';

function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    fallback;
}

function buildRepairOutcome(options = {}) {
  return {
    repaired: options.repaired === true,
    outcome: options.outcome || REPAIR_OUTCOME_UNCHANGED,
    repairIntent:
      options.repairIntent || AUTHORITATIVE_REPAIR_INTENT.REFRESH_EVIDENCE,
    nodeRowCount: Number.isFinite(options.nodeRowCount) ?
      options.nodeRowCount :
      NUM.ZERO,
    serviceRowCount: Number.isFinite(options.serviceRowCount) ?
      options.serviceRowCount :
      NUM.ZERO,
    partitionRowCount: Number.isFinite(options.partitionRowCount) ?
      options.partitionRowCount :
      NUM.ZERO,
    nodeEvidenceState: options.nodeEvidenceState || null,
    serviceEvidenceState: options.serviceEvidenceState || null,
    partitionEvidenceState: options.partitionEvidenceState || null,
  };
}

function isConfirmedEmptyAuthoritativeRead(readResult = null) {
  const source = String(readResult?.source || '');
  return source === AUTHORITATIVE_CONFIRMED_EMPTY_SOURCE.OWNER_RPC_LANE ||
    source === AUTHORITATIVE_CONFIRMED_EMPTY_SOURCE.SQL_QUERY_ENGINE ||
    readResult?.usedSqlFallback === true;
}

function resolveAuthoritativeTableEvidence(readResult = null) {
  const rows = readResult?.success === true && Array.isArray(readResult?.rows) ?
    readResult.rows :
    EMPTY_REPAIR_ROWS;
  const rowCount = rows.length;
  if (readResult?.success !== true) {
    return Object.freeze({
      state: AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE,
      rows: EMPTY_REPAIR_ROWS,
      rowCount: NUM.ZERO,
    });
  }
  if (rowCount > NUM.ZERO) {
    return Object.freeze({
      state: AUTHORITATIVE_TABLE_EVIDENCE_STATE.OBSERVED_ROWS,
      rows,
      rowCount,
    });
  }
  return Object.freeze({
    state: isConfirmedEmptyAuthoritativeRead(readResult) ?
      AUTHORITATIVE_TABLE_EVIDENCE_STATE.OBSERVED_EMPTY_CONFIRMED :
      AUTHORITATIVE_TABLE_EVIDENCE_STATE.OBSERVED_EMPTY_UNCONFIRMED,
    rows,
    rowCount,
  });
}

function shouldApplyAuthoritativeTableEvidence(tableEvidence = null) {
  return tableEvidence?.state !==
    AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE;
}

class AuthoritativeNodeEvidenceReconciler {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.logger = options.logger || console;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.cacheMutationTarget = options.cacheMutationTarget || null;
    this.systemTableCache = options.systemTableCache || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.getAuthoritativeControlPlaneView =
      typeof options.getAuthoritativeControlPlaneView === TYPEOF.FUNCTION ?
        options.getAuthoritativeControlPlaneView :
        () => null;
    this.readNodeRow =
      typeof options.readNodeRow === TYPEOF.FUNCTION ?
        options.readNodeRow :
        async () => null;
    this.readNodeServiceRows =
      typeof options.readNodeServiceRows === TYPEOF.FUNCTION ?
        options.readNodeServiceRows :
        async () => [];
    this.readNodePartitionRows =
      typeof options.readNodePartitionRows === TYPEOF.FUNCTION ?
        options.readNodePartitionRows :
        async () => [];
    this.resolveDecisionDimension =
      typeof options.resolveDecisionDimension === TYPEOF.FUNCTION ?
        options.resolveDecisionDimension :
        () => null;
    this.getNodeTransportState =
      typeof options.getNodeTransportState === TYPEOF.FUNCTION ?
        options.getNodeTransportState :
        () => ({connected: false});
    this.shouldPreferLocalSelfNodeEvidence =
      typeof options.shouldPreferLocalSelfNodeEvidence === TYPEOF.FUNCTION ?
        options.shouldPreferLocalSelfNodeEvidence :
        () => false;
    this.hasFreshLocalReporterSuccess =
      typeof options.hasFreshLocalReporterSuccess === TYPEOF.FUNCTION ?
        options.hasFreshLocalReporterSuccess :
        () => false;
    this.buildNodeEvidence =
      typeof options.buildNodeEvidence === TYPEOF.FUNCTION ?
        options.buildNodeEvidence :
        () => null;
    this.isClusterMemberHealthy =
      typeof options.isClusterMemberHealthy === TYPEOF.FUNCTION ?
        options.isClusterMemberHealthy :
        () => false;
    this.hasRoutableService =
      typeof options.hasRoutableService === TYPEOF.FUNCTION ?
        options.hasRoutableService :
        () => false;
    this.hasWritableControlPlaneService =
      typeof options.hasWritableControlPlaneService === TYPEOF.FUNCTION ?
        options.hasWritableControlPlaneService :
        () => false;
    this.authoritativeReadinessRepairCooldownMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairCooldownMs,
        DEFAULT_REPAIR_COOLDOWN_MS,
      );
    this.authoritativeReadinessRepairFailureCooldownMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairFailureCooldownMs,
        DEFAULT_REPAIR_FAILURE_COOLDOWN_MS,
      );
    this.authoritativeReadinessRepairNoChangeCooldownMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairNoChangeCooldownMs,
        DEFAULT_REPAIR_NO_CHANGE_COOLDOWN_MS,
      );
    this.authoritativeReadinessRepairQueryTimeoutMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairQueryTimeoutMs,
        DEFAULT_REPAIR_QUERY_TIMEOUT_MS,
      );
    this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
        DEFAULT_REPAIR_STALE_HEARTBEAT_MAX_AGE_MS,
      );
    this.lastRepairAtMsByKey = new Map();
    this.lastRepairCooldownMsByKey = new Map();
    this.lastRepairByNodeId = new Map();
    this.repairLedger =
      options.authoritativeReadinessRepairLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.authoritativeReadinessRepairLedgerMaxEntries,
          READINESS_DIAGNOSTICS_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.repairLane =
      options.authoritativeReadinessRepairLane ||
      new OperationLane({
        name: REPAIR_LANE_NAME,
        workflowCoordinator: options.workflowCoordinator,
      });
  }

  canRepairNodeEvidence() {
    return Boolean(
      this.cdcIntegrationService &&
      typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead ===
        TYPEOF.FUNCTION &&
      this.cacheMutationTarget &&
      typeof this.cacheMutationTarget.applySystemTableChange ===
        TYPEOF.FUNCTION,
    );
  }

  getLatestRepair(nodeId) {
    return this.lastRepairByNodeId.get(nodeId || null) || null;
  }

  recordRepair(entry = {}) {
    if (!this.repairLedger) {
      return;
    }
    const recordedEntry = this.repairLedger.append(entry);
    const nodeId =
      typeof recordedEntry?.nodeId === TYPEOF.STRING &&
        recordedEntry.nodeId.length > NUM.ZERO ?
        recordedEntry.nodeId :
        null;
    if (nodeId) {
      this.lastRepairByNodeId.set(nodeId, Object.freeze({
        repairKey: recordedEntry.repairKey || null,
        stage: recordedEntry.stage || null,
        outcome: recordedEntry.outcome || null,
        repaired: recordedEntry.repaired === true,
        repairIntent: recordedEntry.repairIntent || null,
        nodeRowCount:
          Number.isFinite(recordedEntry.nodeRowCount) ?
            recordedEntry.nodeRowCount :
            null,
        serviceRowCount:
          Number.isFinite(recordedEntry.serviceRowCount) ?
            recordedEntry.serviceRowCount :
            null,
        partitionRowCount:
          Number.isFinite(recordedEntry.partitionRowCount) ?
            recordedEntry.partitionRowCount :
            null,
        nodeEvidenceState: recordedEntry.nodeEvidenceState || null,
        serviceEvidenceState: recordedEntry.serviceEvidenceState || null,
        partitionEvidenceState: recordedEntry.partitionEvidenceState || null,
        decisionDimension: recordedEntry.decisionDimension || null,
        error: recordedEntry.error || null,
        recordedAt: recordedEntry.recordedAt || null,
        recordedAtMs:
          Number.isFinite(recordedEntry.recordedAtMs) ?
            recordedEntry.recordedAtMs :
            null,
      }));
    }
  }

  getLedgerEntries(options = {}) {
    return this.repairLedger ?
      this.repairLedger.getEntries(options) :
      EMPTY_LEDGER_ENTRIES;
  }

  buildRepairKey(nodeId, _options = {}) {
    return String(nodeId || EMPTY_STRING);
  }

  shouldBypassCooldown(options = {}) {
    if (options.allowAuthoritativeRefresh !== true ||
        options.requireFreshOnIneligible !== true) {
      return false;
    }
    return true;
  }

  shouldRepairStaleHeartbeat(nodeEvidence) {
    const heartbeatAgeMs = Number(nodeEvidence?.heartbeatAgeMs);
    return Number.isFinite(heartbeatAgeMs) &&
      heartbeatAgeMs >
        this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs;
  }

  shouldRepairNodeEvidence(context = {}, options = {}) {
    if (!this.canRepairNodeEvidence()) {
      return false;
    }

    const nodeId = context?.nodeId || null;
    const nodeRow = context?.nodeRow || null;
    const serviceRows = Array.isArray(context?.serviceRows) ?
      context.serviceRows :
      [];
    if (this.shouldPreferLocalSelfNodeEvidence({
      nodeId,
      nodeRow,
      serviceRows,
    })) {
      return false;
    }

    if (options.forceAuthoritativeRefresh === true) {
      return true;
    }

    if (!nodeRow) {
      return true;
    }

    const transportState = this.getNodeTransportState(nodeId, nodeRow);
    if (!transportState?.connected) {
      return false;
    }

    const hasFreshLocalReporterSuccess =
      this.hasFreshLocalReporterSuccess(nodeId);
    const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
    if (this.shouldRepairStaleHeartbeat(nodeEvidence)) {
      return !hasFreshLocalReporterSuccess;
    }

    if (!this.isClusterMemberHealthy(nodeId, nodeRow)) {
      return !hasFreshLocalReporterSuccess;
    }

    return !this.hasRoutableService(serviceRows) ||
      !this.hasWritableControlPlaneService(serviceRows);
  }

  async maybeRepairNodeEvidence(context = {}, options = {}) {
    if (!this.shouldRepairNodeEvidence(context, options)) {
      return false;
    }
    return this.ensureNodeEvidence(context.nodeId, options);
  }

  async ensureNodeEvidence(nodeId, options = {}) {
    if (!nodeId || !this.canRepairNodeEvidence()) {
      return false;
    }
    const repairKey = this.buildRepairKey(nodeId, options);
    this.recordRepair({
      nodeId,
      repairKey,
      stage: REPAIR_STAGE.SCHEDULED,
      allowAuthoritativeRefresh: options.allowAuthoritativeRefresh === true,
      requireFreshOnIneligible: options.requireFreshOnIneligible === true,
      repairIntent: AUTHORITATIVE_REPAIR_INTENT.REFRESH_EVIDENCE,
      decisionDimension: this.resolveDecisionDimension(options),
    });
    return this.repairLane.run(
      {ownerKey: repairKey},
      async () => {
        const now = this.now();
        const lastRepairAt =
          this.lastRepairAtMsByKey.get(repairKey) || NUM.ZERO;
        const cooldownMs =
          this.lastRepairCooldownMsByKey.get(repairKey) ||
          this.authoritativeReadinessRepairCooldownMs;
        const bypassCooldown = this.shouldBypassCooldown(options);
        if (!bypassCooldown && (now - lastRepairAt) < cooldownMs) {
          this.recordRepair({
            nodeId,
            repairKey,
            stage: REPAIR_STAGE.COOLDOWN_SKIPPED,
            decisionDimension: this.resolveDecisionDimension(options),
            cooldownMs,
            lastRepairAtMs: lastRepairAt,
          });
          return false;
        }

        try {
          const repairResult = await this.repairNodeEvidence(nodeId, options);
          const normalizedRepairResult =
            this.normalizeRepairResult(repairResult);
          this.lastRepairCooldownMsByKey.set(
            repairKey,
            this.resolveCooldownMs(normalizedRepairResult),
          );
          this.recordRepair({
            nodeId,
            repairKey,
            stage: REPAIR_STAGE.COMPLETED,
            decisionDimension: this.resolveDecisionDimension(options),
            outcome: normalizedRepairResult.outcome,
            repaired: normalizedRepairResult.repaired === true,
            repairIntent: normalizedRepairResult.repairIntent,
            nodeRowCount: normalizedRepairResult.nodeRowCount,
            serviceRowCount: normalizedRepairResult.serviceRowCount,
            partitionRowCount: normalizedRepairResult.partitionRowCount,
            nodeEvidenceState: normalizedRepairResult.nodeEvidenceState,
            serviceEvidenceState: normalizedRepairResult.serviceEvidenceState,
            partitionEvidenceState:
              normalizedRepairResult.partitionEvidenceState,
          });
          return normalizedRepairResult.repaired === true;
        } catch (error) {
          this.lastRepairCooldownMsByKey.set(
            repairKey,
            this.authoritativeReadinessRepairFailureCooldownMs,
          );
          this.recordRepair({
            nodeId,
            repairKey,
            stage: REPAIR_STAGE.FAILED,
            decisionDimension: this.resolveDecisionDimension(options),
            repaired: false,
            outcome: REPAIR_OUTCOME_FAILED,
            repairIntent: AUTHORITATIVE_REPAIR_INTENT.REFRESH_EVIDENCE,
            error: error?.message || String(error),
          });
          this.logger.warn(
            REPAIR_FAILED_LOG_MESSAGE,
            {
              nodeId,
              error: error?.message || String(error),
              stack:
                String(error?.message || error || '').includes(
                  'Maximum call stack size exceeded',
                ) ?
                  (error?.stack || null) :
                  null,
            },
          );
          return false;
        } finally {
          this.lastRepairAtMsByKey.set(repairKey, this.now());
        }
      },
    );
  }

  async repairNodeEvidence(nodeId, _options = {}) {
    const repairContext = await this.collectRepairNodeEvidenceContext(nodeId);
    return this.buildRepairNodeEvidenceOutcome(nodeId, repairContext);
  }

  async collectRepairNodeEvidenceContext(nodeId) {
    const causeId = `${REPAIR_CAUSE_PREFIX}${nodeId}:${Date.now()}`;
    const repairIntent = AUTHORITATIVE_REPAIR_INTENT.REFRESH_EVIDENCE;
    const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
    if (!authoritativeControlPlaneView) {
      return {
        state: AUTHORITATIVE_REPAIR_STATE.VIEW_UNAVAILABLE,
        repairIntent,
        repairedRowCount: NUM.ZERO,
        nodeRowCount: NUM.ZERO,
        serviceRowCount: NUM.ZERO,
        partitionRowCount: NUM.ZERO,
        nodeEvidenceState: AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE,
        serviceEvidenceState: AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE,
        partitionEvidenceState:
          AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE,
      };
    }

    const snapshot = await authoritativeControlPlaneView.readNodeSnapshot(
      nodeId,
      {
        queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
      },
    );
    const nodeTableEvidence = resolveAuthoritativeTableEvidence(
      snapshot?.tables?.nodes,
    );
    const serviceTableEvidence = resolveAuthoritativeTableEvidence(
      snapshot?.tables?.services,
    );
    const partitionTableEvidence = resolveAuthoritativeTableEvidence(
      snapshot?.tables?.partitions,
    );
    const nodeRowCount = nodeTableEvidence.rowCount;
    const serviceRowCount = serviceTableEvidence.rowCount;
    const partitionRowCount = partitionTableEvidence.rowCount;
    const snapshotUnavailable =
      nodeTableEvidence.state ===
        AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE &&
      serviceTableEvidence.state ===
        AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE &&
      partitionTableEvidence.state ===
        AUTHORITATIVE_TABLE_EVIDENCE_STATE.UNAVAILABLE;
    let repairedRowCount = NUM.ZERO;

    if (!snapshotUnavailable) {
      const cachedNodeRow = await this.readNodeRow(nodeId);
      const cachedServiceRows = await this.readNodeServiceRows(nodeId);
      const cachedPartitionRows = await this.readNodePartitionRows(nodeId);
      if (shouldApplyAuthoritativeTableEvidence(nodeTableEvidence)) {
        repairedRowCount += await this.applyAuthoritativeRows(
          TABLES.NODES,
          nodeTableEvidence,
          cachedNodeRow ? [cachedNodeRow] : EMPTY_REPAIR_ROWS,
          causeId,
          repairIntent,
        );
      }
      if (shouldApplyAuthoritativeTableEvidence(serviceTableEvidence)) {
        repairedRowCount += await this.applyAuthoritativeRows(
          TABLES.SERVICES,
          serviceTableEvidence,
          cachedServiceRows,
          causeId,
          repairIntent,
        );
      }
      if (shouldApplyAuthoritativeTableEvidence(partitionTableEvidence)) {
        repairedRowCount += await this.applyAuthoritativeRows(
          TABLES.PARTITIONS,
          partitionTableEvidence,
          cachedPartitionRows,
          causeId,
          repairIntent,
        );
      }
    }

    const repairState = snapshotUnavailable ?
      AUTHORITATIVE_REPAIR_STATE.SNAPSHOT_UNAVAILABLE :
      repairedRowCount > NUM.ZERO ?
        AUTHORITATIVE_REPAIR_STATE.REPAIRED :
        AUTHORITATIVE_REPAIR_STATE.UNCHANGED;

    return {
      state: repairState,
      repairIntent,
      repairedRowCount,
      nodeRowCount,
      serviceRowCount,
      partitionRowCount,
      nodeEvidenceState: nodeTableEvidence.state,
      serviceEvidenceState: serviceTableEvidence.state,
      partitionEvidenceState: partitionTableEvidence.state,
    };
  }

  buildRepairNodeEvidenceOutcome(nodeId, repairContext = {}) {
    switch (repairContext.state) {
    case AUTHORITATIVE_REPAIR_STATE.VIEW_UNAVAILABLE:
    case AUTHORITATIVE_REPAIR_STATE.SNAPSHOT_UNAVAILABLE:
      return buildRepairOutcome({
        outcome: REPAIR_OUTCOME_FAILED,
        repairIntent: repairContext.repairIntent,
        nodeEvidenceState: repairContext.nodeEvidenceState,
        serviceEvidenceState: repairContext.serviceEvidenceState,
        partitionEvidenceState: repairContext.partitionEvidenceState,
      });
    case AUTHORITATIVE_REPAIR_STATE.REPAIRED:
      this.logger.warn(
        REPAIR_APPLIED_LOG_MESSAGE,
        {
          nodeId,
          repairIntent: repairContext.repairIntent,
          repairedRowCount: repairContext.repairedRowCount,
          repairedNodeRowCount: repairContext.nodeRowCount,
          repairedServiceRowCount: repairContext.serviceRowCount,
          repairedPartitionRowCount: repairContext.partitionRowCount,
          nodeEvidenceState: repairContext.nodeEvidenceState,
          serviceEvidenceState: repairContext.serviceEvidenceState,
          partitionEvidenceState: repairContext.partitionEvidenceState,
        },
      );
      return buildRepairOutcome({
        repaired: true,
        outcome: REPAIR_OUTCOME_REPAIRED,
        repairIntent: repairContext.repairIntent,
        nodeRowCount: repairContext.nodeRowCount,
        serviceRowCount: repairContext.serviceRowCount,
        partitionRowCount: repairContext.partitionRowCount,
        nodeEvidenceState: repairContext.nodeEvidenceState,
        serviceEvidenceState: repairContext.serviceEvidenceState,
        partitionEvidenceState: repairContext.partitionEvidenceState,
      });
    case AUTHORITATIVE_REPAIR_STATE.UNCHANGED:
      return buildRepairOutcome({
        outcome: REPAIR_OUTCOME_UNCHANGED,
        repairIntent: repairContext.repairIntent,
        nodeRowCount: repairContext.nodeRowCount,
        serviceRowCount: repairContext.serviceRowCount,
        partitionRowCount: repairContext.partitionRowCount,
        nodeEvidenceState: repairContext.nodeEvidenceState,
        serviceEvidenceState: repairContext.serviceEvidenceState,
        partitionEvidenceState: repairContext.partitionEvidenceState,
      });
    default:
      throw new Error(
        UNKNOWN_AUTHORITATIVE_REPAIR_STATE_ERROR_PREFIX +
          String(repairContext.state),
      );
    }
  }

  normalizeRepairResult(repairResult) {
    if (repairResult && typeof repairResult === TYPEOF.OBJECT) {
      return buildRepairOutcome({
        repaired: repairResult.repaired === true,
        outcome: String(repairResult.outcome || REPAIR_OUTCOME_UNCHANGED),
        repairIntent:
          repairResult.repairIntent ||
          AUTHORITATIVE_REPAIR_INTENT.REFRESH_EVIDENCE,
        nodeRowCount: Number.isFinite(repairResult.nodeRowCount) ?
          repairResult.nodeRowCount :
          NUM.ZERO,
        serviceRowCount: Number.isFinite(repairResult.serviceRowCount) ?
          repairResult.serviceRowCount :
          NUM.ZERO,
        partitionRowCount: Number.isFinite(repairResult.partitionRowCount) ?
          repairResult.partitionRowCount :
          NUM.ZERO,
        nodeEvidenceState: repairResult.nodeEvidenceState || null,
        serviceEvidenceState: repairResult.serviceEvidenceState || null,
        partitionEvidenceState: repairResult.partitionEvidenceState || null,
      });
    }
    return buildRepairOutcome({
      repaired: repairResult === true,
      outcome: repairResult === true ?
        REPAIR_OUTCOME_REPAIRED :
        REPAIR_OUTCOME_UNCHANGED,
    });
  }

  resolveCooldownMs(repairResult) {
    if (repairResult?.repaired === true ||
        repairResult?.outcome === REPAIR_OUTCOME_REPAIRED) {
      return this.authoritativeReadinessRepairCooldownMs;
    }
    if (repairResult?.outcome === REPAIR_OUTCOME_FAILED) {
      return this.authoritativeReadinessRepairFailureCooldownMs;
    }
    return this.authoritativeReadinessRepairNoChangeCooldownMs;
  }

  async applyAuthoritativeRows(
    tableName,
    tableEvidence,
    cachedRows,
    causeId,
    repairIntent,
  ) {
    const gateway = this.getControlPlaneSystemTableGateway();
    const result = await gateway.reconcileAuthoritativeCacheRows(
      tableName,
      tableEvidence?.rows || EMPTY_REPAIR_ROWS,
      {
        causeId,
        cachedRows,
        cacheMutationTarget: this.cacheMutationTarget,
        reconcileIntent:
          repairIntent || AUTHORITATIVE_REPAIR_INTENT.REFRESH_EVIDENCE,
        systemTableCache: this.systemTableCache,
      },
    );
    return result?.mutationCount || NUM.ZERO;
  }

  getControlPlaneSystemTableGateway() {
    return assertCritical(
      this.controlPlaneSystemTableGateway,
      REPAIR_REQUIRED_DEPENDENCY_ERROR_PREFIX +
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_DEPENDENCY,
    );
  }
}

export {AuthoritativeNodeEvidenceReconciler};
