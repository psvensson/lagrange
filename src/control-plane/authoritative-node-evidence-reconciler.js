import {assertCritical} from '../utils/assert.js';
import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {ControlPlaneDiagnosticsLedger} from
  './control-plane-diagnostics-ledger.js';
import {OperationLane} from '../workflow/operation-lane.js';

const READINESS_DIAGNOSTICS_LEDGER_LIMIT = 128;

function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    fallback;
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
        5000,
      );
    this.authoritativeReadinessRepairFailureCooldownMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairFailureCooldownMs,
        30000,
      );
    this.authoritativeReadinessRepairNoChangeCooldownMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairNoChangeCooldownMs,
        15000,
      );
    this.authoritativeReadinessRepairQueryTimeoutMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairQueryTimeoutMs,
        1500,
      );
    this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
      normalizePositiveInteger(
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
        30000,
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
        name: 'control-plane-readiness-repair',
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
        nodeRowCount:
          Number.isFinite(recordedEntry.nodeRowCount) ?
            recordedEntry.nodeRowCount :
            null,
        serviceRowCount:
          Number.isFinite(recordedEntry.serviceRowCount) ?
            recordedEntry.serviceRowCount :
            null,
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
      Object.freeze([]);
  }

  buildRepairKey(nodeId, _options = {}) {
    return String(nodeId || '');
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
      stage: 'scheduled',
      allowAuthoritativeRefresh: options.allowAuthoritativeRefresh === true,
      requireFreshOnIneligible: options.requireFreshOnIneligible === true,
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
            stage: 'cooldown_skipped',
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
            stage: 'completed',
            decisionDimension: this.resolveDecisionDimension(options),
            outcome: normalizedRepairResult.outcome,
            repaired: normalizedRepairResult.repaired === true,
            nodeRowCount: normalizedRepairResult.nodeRowCount,
            serviceRowCount: normalizedRepairResult.serviceRowCount,
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
            stage: 'failed',
            decisionDimension: this.resolveDecisionDimension(options),
            repaired: false,
            outcome: 'failed',
            error: error?.message || String(error),
          });
          this.logger.warn(
            'Authoritative readiness repair failed',
            {
              nodeId,
              error: error?.message || String(error),
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
    const causeId = `readiness-authoritative-cache-repair:${nodeId}:${Date.now()}`;
    const authoritativeControlPlaneView = this.getAuthoritativeControlPlaneView();
    if (!authoritativeControlPlaneView) {
      return {
        repaired: false,
        outcome: 'failed',
      };
    }
    const snapshot = await authoritativeControlPlaneView.readNodeSnapshot(
      nodeId,
      {
        queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
      },
    );
    const nodeRows = snapshot.tables.nodes.success ? snapshot.nodeRows : null;
    const serviceRows =
      snapshot.tables.services.success ? snapshot.serviceRows : null;

    if (!nodeRows && !serviceRows) {
      return {
        repaired: false,
        outcome: 'failed',
        nodeRowCount: NUM.ZERO,
        serviceRowCount: NUM.ZERO,
      };
    }

    let repairedRowCount = NUM.ZERO;
    const cachedNodeRow = await this.readNodeRow(nodeId);
    const cachedServiceRows = await this.readNodeServiceRows(nodeId);
    if (nodeRows) {
      repairedRowCount += await this.applyAuthoritativeRows(
        TABLES.NODES,
        nodeRows,
        cachedNodeRow ? [cachedNodeRow] : [],
        causeId,
      );
    }
    if (serviceRows) {
      repairedRowCount += await this.applyAuthoritativeRows(
        TABLES.SERVICES,
        serviceRows,
        cachedServiceRows,
        causeId,
      );
    }

    if (repairedRowCount > NUM.ZERO) {
      this.logger.warn(
        'Repaired readiness cache from authoritative node/service rows',
        {
          nodeId,
          repairedRowCount,
          repairedNodeRowCount: Array.isArray(nodeRows) ? nodeRows.length : 0,
          repairedServiceRowCount:
            Array.isArray(serviceRows) ? serviceRows.length : 0,
        },
      );
      return {
        repaired: true,
        outcome: 'repaired',
        nodeRowCount: Array.isArray(nodeRows) ? nodeRows.length : NUM.ZERO,
        serviceRowCount:
          Array.isArray(serviceRows) ? serviceRows.length : NUM.ZERO,
      };
    }

    return {
      repaired: false,
      outcome: 'unchanged',
      nodeRowCount: Array.isArray(nodeRows) ? nodeRows.length : NUM.ZERO,
      serviceRowCount:
        Array.isArray(serviceRows) ? serviceRows.length : NUM.ZERO,
    };
  }

  normalizeRepairResult(repairResult) {
    if (repairResult && typeof repairResult === TYPEOF.OBJECT) {
      return {
        repaired: repairResult.repaired === true,
        outcome: String(repairResult.outcome || 'unchanged'),
        nodeRowCount: Number.isFinite(repairResult.nodeRowCount) ?
          repairResult.nodeRowCount :
          NUM.ZERO,
        serviceRowCount: Number.isFinite(repairResult.serviceRowCount) ?
          repairResult.serviceRowCount :
          NUM.ZERO,
      };
    }
    return {
      repaired: repairResult === true,
      outcome: repairResult === true ? 'repaired' : 'unchanged',
      nodeRowCount: NUM.ZERO,
      serviceRowCount: NUM.ZERO,
    };
  }

  resolveCooldownMs(repairResult) {
    if (repairResult?.repaired === true ||
        repairResult?.outcome === 'repaired') {
      return this.authoritativeReadinessRepairCooldownMs;
    }
    if (repairResult?.outcome === 'failed') {
      return this.authoritativeReadinessRepairFailureCooldownMs;
    }
    return this.authoritativeReadinessRepairNoChangeCooldownMs;
  }

  async applyAuthoritativeRows(tableName, rows, cachedRows, causeId) {
    const gateway = this.getControlPlaneSystemTableGateway();
    const result = await gateway.reconcileAuthoritativeCacheRows(
      tableName,
      rows,
      {
        causeId,
        cachedRows,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache,
      },
    );
    return result?.mutationCount || NUM.ZERO;
  }

  getControlPlaneSystemTableGateway() {
    return assertCritical(
      this.controlPlaneSystemTableGateway,
      'AuthoritativeNodeEvidenceReconciler requires ' +
        'controlPlaneSystemTableGateway',
    );
  }
}

export {AuthoritativeNodeEvidenceReconciler};
