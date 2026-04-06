import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {
  COLUMN,
  NUM,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  compareNodeHeartbeatWatermarks,
  isNodeRecordReady,
  isNodeReadyLeaseExplicitlyCleared,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {PRESSURE_STATE} from '../rebalancer/storage-capacity-constants.js';
import {AuthoritativeControlPlaneView} from
  './authoritative-control-plane-view.js';
import {
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
} from '../cdc/cdc-integration-service.js';
import {
  createControlPlaneRuntimeBundle,
} from './control-plane-runtime-bundle.js';
import {
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
} from './control-plane-readiness-constants.js';
import {
  compactEligibilitySnapshot,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
} from './eligibility-snapshot.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './control-plane-publication-merge.js';
import {ControlPlaneDiagnosticsLedger} from
  './control-plane-diagnostics-ledger.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {AuthoritativeNodeEvidenceReconciler} from
  './authoritative-node-evidence-reconciler.js';

const PUBLICATION_REASON_CONFIG_SAFE_MODE = 'config_safe_mode';
const AUTHORITATIVE_READINESS_REPAIR = Object.freeze({
  COOLDOWN_MS: 5000,
  FAILURE_COOLDOWN_MS: 30000,
  NO_CHANGE_COOLDOWN_MS: 15000,
  QUERY_TIMEOUT_MS: 1500,
  STALE_HEARTBEAT_MAX_AGE_MS: 10000,
});
const READINESS_TRANSITION_HISTORY_LIMIT = 32;
const READINESS_DIAGNOSTICS_LEDGER_LIMIT = 128;
const RECOVERY_EPOCH_HISTORY_LIMIT = 8;
const RECOVERY_EPOCH_EVENT_LIMIT = 32;
const READINESS_ERROR_MSG = Object.freeze({
  STORAGE_ACCOUNTING_OWNER_REQUIRED:
    'ControlPlaneReadinessService requires ' +
    'storageAccountingService for strict readiness evaluation',
  PUBLICATION_OWNER_REQUIRED:
    'ControlPlaneReadinessService requires ' +
    'cdcGroupPropagationService for strict readiness evaluation',
});
const MEMBERSHIP_PUBLICATION_READ_OPTIONS = Object.freeze({
  preferAuthoritativeRead: true,
  preferOwnerRpcRead: true,
  requireOwnerRpcRead: true,
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  replicaFallbackConsistency:
    LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
});

function buildReason(
  code,
  dimension,
  sourceOwner,
  observedAt,
  details = null,
) {
  const reason = {
    code,
    dimension,
    sourceOwner,
    observedAt,
  };
  if (details && typeof details === 'object') {
    reason.details = details;
  }
  return Object.freeze(reason);
}

function normalizeIsoTimestamp(nowValue) {
  return new Date(nowValue).toISOString();
}

function normalizePositiveInteger(value, fallback = NUM.ZERO) {
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    fallback;
}

function normalizeDiagnosticTimestampMs(value) {
  if (Number.isFinite(value)) {
    return value;
  }
  if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > NUM.ZERO),
  )];
}

function normalizeLocalQueryTransportEvidence(readiness) {
  if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
    return Object.freeze({
      state: 'unknown',
      ready: null,
      reason: null,
      retryAfterMs: null,
    });
  }
  const ready = typeof readiness.ready === 'boolean' ? readiness.ready : null;
  return Object.freeze({
    state:
      ready === true ?
        'ready' :
        ready === false ?
          'deferred' :
          'unknown',
    ready,
    reason:
      typeof readiness.reason === TYPEOF.STRING &&
        readiness.reason.length > NUM.ZERO ?
        readiness.reason :
        null,
    retryAfterMs:
      Number.isFinite(readiness.retryAfterMs) &&
        readiness.retryAfterMs > NUM.ZERO ?
        Math.floor(readiness.retryAfterMs) :
        null,
  });
}

function normalizeControlPlaneParticipationKind(value) {
  if (value === CONTROL_PLANE_PARTICIPATION_KIND
    .REPLICA_OPERATION_OWNER_READ) {
    return CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ;
  }
  if (value === CONTROL_PLANE_PARTICIPATION_KIND
    .CONTROL_PLANE_RECOVERY) {
    return CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY;
  }
  return CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ;
}

function resolveParticipationDecisionDimension(
  participationKind,
  decisionDimension,
) {
  if (typeof decisionDimension === TYPEOF.STRING &&
      decisionDimension.length > NUM.ZERO) {
    return decisionDimension;
  }
  switch (participationKind) {
    case CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY:
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    case CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ:
    case CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ:
    default:
      return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }
}

function buildParticipationErrorCode(participation) {
  if (participation?.reasonCode ===
      CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY) {
    return 'ROUTER_QUERY_TRANSPORT_NOT_READY';
  }
  return participation?.decision ===
    CONTROL_PLANE_PARTICIPATION_DECISION.DEFER ?
    'CONTROL_PLANE_PARTICIPATION_DEFERRED' :
    'CONTROL_PLANE_PARTICIPATION_BLOCKED';
}

function buildParticipationErrorMessage(participation) {
  if (participation?.reasonCode ===
      CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY &&
      typeof participation?.localQueryTransport?.reason === TYPEOF.STRING &&
      participation.localQueryTransport.reason.length > NUM.ZERO) {
    return participation.localQueryTransport.reason;
  }
  return participation?.decision ===
    CONTROL_PLANE_PARTICIPATION_DECISION.DEFER ?
    'Control-plane participation deferred by canonical readiness' :
    'Control-plane participation blocked by canonical readiness';
}

function shouldAllowLocalExecutionForParticipation({
  localNodeId = null,
  targetNodeId = null,
  participationKind = null,
  localQueryTransport = null,
} = {}) {
  if (localNodeId !== targetNodeId) {
    return false;
  }
  if (participationKind !==
      CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ &&
      participationKind !==
        CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY) {
    return false;
  }
  if (localQueryTransport?.ready !== false) {
    return false;
  }
  return true;
}

class ControlPlaneReadinessService {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.nodesOwner = options.nodesOwner || null;
    this.servicesOwner = options.servicesOwner || null;
    this.messageRouter = options.messageRouter || null;
    this.nodeLifecycleStateMachine = options.nodeLifecycleStateMachine || null;
    this.storageAccountingService = options.storageAccountingService || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.cacheMutationTarget =
      options.cacheMutationTarget ||
      options.systemTableCache ||
      null;
    this.cdcGroupPropagationService = options.cdcGroupPropagationService || null;
    this.heartbeatService = options.heartbeatService || null;
    this.membershipPublicationService =
      options.membershipPublicationService || null;
    this.strictOwnerDependencies = options.strictOwnerDependencies === true;
    this.clusterMemberStaleHeartbeatMaxAgeMs =
      Number.isFinite(options.clusterMemberStaleHeartbeatMaxAgeMs) &&
        options.clusterMemberStaleHeartbeatMaxAgeMs > NUM.ZERO ?
        Math.floor(options.clusterMemberStaleHeartbeatMaxAgeMs) :
        CONTROL_PLANE_READINESS_DEFAULT
          .CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS;
    this.authoritativeReadinessRepairCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairCooldownMs) &&
        options.authoritativeReadinessRepairCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.COOLDOWN_MS;
    this.authoritativeReadinessRepairFailureCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairFailureCooldownMs) &&
        options.authoritativeReadinessRepairFailureCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairFailureCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.FAILURE_COOLDOWN_MS;
    this.authoritativeReadinessRepairNoChangeCooldownMs =
      Number.isFinite(options.authoritativeReadinessRepairNoChangeCooldownMs) &&
        options.authoritativeReadinessRepairNoChangeCooldownMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairNoChangeCooldownMs) :
        AUTHORITATIVE_READINESS_REPAIR.NO_CHANGE_COOLDOWN_MS;
    this.authoritativeReadinessRepairQueryTimeoutMs =
      Number.isFinite(options.authoritativeReadinessRepairQueryTimeoutMs) &&
        options.authoritativeReadinessRepairQueryTimeoutMs > NUM.ZERO ?
        Math.floor(options.authoritativeReadinessRepairQueryTimeoutMs) :
        AUTHORITATIVE_READINESS_REPAIR.QUERY_TIMEOUT_MS;
    this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs =
      Number.isFinite(
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      ) &&
        options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs > NUM.ZERO ?
        Math.floor(
          options.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
        ) :
        AUTHORITATIVE_READINESS_REPAIR.STALE_HEARTBEAT_MAX_AGE_MS;
    this.membershipPublicationDiagnosticsQueryTimeoutMs =
      Number.isFinite(options.membershipPublicationDiagnosticsQueryTimeoutMs) &&
        options.membershipPublicationDiagnosticsQueryTimeoutMs > NUM.ZERO ?
        Math.floor(options.membershipPublicationDiagnosticsQueryTimeoutMs) :
        CONTROL_PLANE_READINESS_DEFAULT
          .MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS;
    this.membershipPublicationReadOptions = Object.freeze({
      ...MEMBERSHIP_PUBLICATION_READ_OPTIONS,
      queryTimeoutMs: this.membershipPublicationDiagnosticsQueryTimeoutMs,
    });
    this.loggedMissingStorageAccountingOwner = false;
    this.loggedMissingPublicationOwner = false;
    this.readinessTransitionHistoryLimit =
      Number.isInteger(options.readinessTransitionHistoryLimit) &&
        options.readinessTransitionHistoryLimit > NUM.ZERO ?
        Math.floor(options.readinessTransitionHistoryLimit) :
        READINESS_TRANSITION_HISTORY_LIMIT;
    this.readinessTransitionHistoryByNodeId = new Map();
    this.lastReadinessEvaluationByNodeId = new Map();
    this.lastReadinessSnapshotByNodeId = new Map();
    this.lastReadinessSnapshotAtMsByNodeId = new Map();
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId = new Map();
    this.recoveryEpochHistoryLimit =
      Number.isInteger(options.recoveryEpochHistoryLimit) &&
        options.recoveryEpochHistoryLimit > NUM.ZERO ?
        Math.floor(options.recoveryEpochHistoryLimit) :
        RECOVERY_EPOCH_HISTORY_LIMIT;
    this.recoveryEpochEventLimit =
      Number.isInteger(options.recoveryEpochEventLimit) &&
        options.recoveryEpochEventLimit > NUM.ZERO ?
        Math.floor(options.recoveryEpochEventLimit) :
        RECOVERY_EPOCH_EVENT_LIMIT;
    this.currentRecoveryEpochByNodeId = new Map();
    this.recoveryEpochHistoryByNodeId = new Map();
    this.authoritativeControlPlaneView =
      options.authoritativeControlPlaneView || null;
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway ||
      (this.cdcIntegrationService || this.systemTableCache || this.messageRouter ?
        createControlPlaneRuntimeBundle({
          nodeId: this.nodeId,
          cdcIntegrationService: this.cdcIntegrationService,
          systemTableCache: this.systemTableCache,
          messageRouter: this.messageRouter,
          now: options.now,
        }).controlPlaneSystemTableGateway :
        null);
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.participationDecisionLedger =
      options.participationDecisionLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.participationDecisionLedgerMaxEntries,
          READINESS_DIAGNOSTICS_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.authoritativeReadinessRepairLedger =
      options.authoritativeReadinessRepairLedger ||
      new ControlPlaneDiagnosticsLedger({
        maxEntries: normalizePositiveInteger(
          options.authoritativeReadinessRepairLedgerMaxEntries,
          READINESS_DIAGNOSTICS_LEDGER_LIMIT,
        ),
        now: this.now,
      });
    this.readinessOperationWorkflowCoordinator =
      options.readinessOperationWorkflowCoordinator ||
      new DurableWorkflowCoordinator({
        now: this.now,
      });
    this.readinessEvaluationLane =
      options.readinessEvaluationLane ||
      new OperationLane({
        name: 'control-plane-readiness-evaluation',
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
      });
    this.cacheChangeListener = null;
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CONTROL_PLANE_READINESS_SUBSYSTEM) :
      console;
    this.authoritativeNodeEvidenceReconciler =
      options.authoritativeNodeEvidenceReconciler ||
      new AuthoritativeNodeEvidenceReconciler({
        nodeId: this.nodeId,
        now: this.now,
        logger: this.logger,
        cdcIntegrationService: this.cdcIntegrationService,
        cacheMutationTarget: this.cacheMutationTarget,
        systemTableCache: this.systemTableCache,
        controlPlaneSystemTableGateway: this.controlPlaneSystemTableGateway,
        getAuthoritativeControlPlaneView: () =>
          this.getAuthoritativeControlPlaneView(),
        readNodeRow: (nodeId) => this.readNodeRow(nodeId),
        readNodeServiceRows: (nodeId) => this.readNodeServiceRows(nodeId),
        resolveDecisionDimension: (repairOptions) =>
          this.resolveReadinessDecisionDimension(repairOptions),
        getNodeTransportState: (nodeId, nodeRow) =>
          this.getNodeTransportState(nodeId, nodeRow),
        shouldPreferLocalSelfNodeEvidence: (context) =>
          this.shouldPreferLocalSelfNodeEvidence(context),
        hasFreshLocalReporterSuccess: (nodeId) =>
          this.hasFreshLocalReporterSuccess(nodeId),
        buildNodeEvidence: (nodeId, nodeRow) =>
          this.buildNodeEvidence(nodeId, nodeRow),
        isClusterMemberHealthy: (nodeId, nodeRow) =>
          this.isClusterMemberHealthy(nodeId, nodeRow),
        hasRoutableService: (serviceRows) =>
          this.hasRoutableService(serviceRows),
        hasWritableControlPlaneService: (serviceRows) =>
          this.hasWritableControlPlaneService(serviceRows),
        workflowCoordinator: this.readinessOperationWorkflowCoordinator,
        authoritativeReadinessRepairLedger:
          options.authoritativeReadinessRepairLedger,
        authoritativeReadinessRepairLedgerMaxEntries:
          options.authoritativeReadinessRepairLedgerMaxEntries,
        authoritativeReadinessRepairLane:
          options.authoritativeReadinessRepairLane,
        authoritativeReadinessRepairCooldownMs:
          this.authoritativeReadinessRepairCooldownMs,
        authoritativeReadinessRepairFailureCooldownMs:
          this.authoritativeReadinessRepairFailureCooldownMs,
        authoritativeReadinessRepairNoChangeCooldownMs:
          this.authoritativeReadinessRepairNoChangeCooldownMs,
        authoritativeReadinessRepairQueryTimeoutMs:
          this.authoritativeReadinessRepairQueryTimeoutMs,
        authoritativeReadinessRepairStaleHeartbeatMaxAgeMs:
          this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      });
    this.subscribeToCacheChanges();
  }

  /**
   * Log one-time diagnostics for missing readiness owners.
   * In non-strict mode the service degrades intentionally, so warn instead
   * of emitting a hard-error signal.
   * @param {string} message
   * @param {string} owner
   * @private
   */
  logMissingOwner(message, owner) {
    const level = this.strictOwnerDependencies ? 'error' : 'warn';
    const logFn = typeof this.logger?.[level] === TYPEOF.FUNCTION ?
      this.logger[level].bind(this.logger) :
      null;
    if (!logFn) {
      return;
    }

    logFn(message, {
      nodeId: this.nodeId,
      owner,
      strictOwnerDependencies: this.strictOwnerDependencies,
    });
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    const previousSystemTableCache = this.systemTableCache;
    const systemTableCacheProvided =
      Object.hasOwn(options, 'systemTableCache');
    const cacheMutationTargetProvided =
      Object.hasOwn(options, 'cacheMutationTarget');

    if (systemTableCacheProvided) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (cacheMutationTargetProvided) {
      this.cacheMutationTarget = options.cacheMutationTarget || null;
    } else if (systemTableCacheProvided) {
      this.cacheMutationTarget = this.systemTableCache;
    }
    if (Object.hasOwn(options, 'messageRouter')) {
      this.messageRouter = options.messageRouter || null;
    }
    if (Object.hasOwn(options, 'cdcIntegrationService')) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (Object.hasOwn(options, 'storageAccountingService')) {
      this.storageAccountingService =
        options.storageAccountingService || null;
    }
    if (Object.hasOwn(options, 'cdcGroupPropagationService')) {
      this.cdcGroupPropagationService =
        options.cdcGroupPropagationService || null;
    }
    if (Object.hasOwn(options, 'membershipPublicationService')) {
      this.membershipPublicationService =
        options.membershipPublicationService || null;
    }
    if (this.authoritativeControlPlaneView &&
        typeof this.authoritativeControlPlaneView
          .syncOwnerDependencies === TYPEOF.FUNCTION) {
      this.authoritativeControlPlaneView.syncOwnerDependencies({
        cdcIntegrationService: this.cdcIntegrationService,
        messageRouter: this.messageRouter,
      });
    }

    if (systemTableCacheProvided &&
        previousSystemTableCache !== this.systemTableCache) {
      if (this.cacheChangeListener &&
          typeof previousSystemTableCache?.offCacheChange ===
            TYPEOF.FUNCTION) {
        previousSystemTableCache.offCacheChange(this.cacheChangeListener);
      }
      this.cacheChangeListener = null;
      this.subscribeToCacheChanges();
    }
  }

  /**
   * Build readiness for every known node.
   * @return {Promise<Object[]>}
   */
  async getAllNodeReadiness(options = {}) {
    const nodeRows = await this.readNodeRows(options);
    const serviceRows = await this.readAllNodeServiceRows(options);
    const bulkNodeRowsAreAuthoritative =
      options.allowAuthoritativeRefresh === true &&
      this.nodesOwner &&
      typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION;
    const bulkServiceRowsAreAuthoritative =
      options.allowAuthoritativeRefresh === true &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServices === TYPEOF.FUNCTION;
    const nodeIds = new Set();
    for (const nodeRow of nodeRows) {
      const nodeId = nodeRow?.[COLUMN.NODE_ID] || null;
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    if (serviceRows.length > NUM.ZERO ||
        typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION) {
      const nodeEndpointRows =
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
      for (const serviceRow of serviceRows) {
        const nodeId = serviceRow?.[COLUMN.NODE_ID] || null;
        if (nodeId) {
          nodeIds.add(nodeId);
        }
      }
      for (const endpointRow of nodeEndpointRows) {
        const nodeId = endpointRow?.[COLUMN.NODE_ID] || null;
        if (nodeId) {
          nodeIds.add(nodeId);
        }
      }
    }
    for (const nodeId of this.lastReadinessSnapshotByNodeId.keys()) {
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }
    const readiness = [];

    for (const nodeId of [...nodeIds].sort()) {
      readiness.push(await this.getNodeReadiness(nodeId, {
        ...options,
        allNodeRows: bulkNodeRowsAreAuthoritative ? nodeRows : null,
        allServiceRows: bulkServiceRowsAreAuthoritative ? serviceRows : null,
      }));
    }

    return readiness;
  }

  /**
   * Build readiness for one node.
   * @readModel READINESS_NODE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_SERVICE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_CAPACITY — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async getNodeReadiness(nodeId, options = {}) {
    const maxCachedAgeMs = normalizePositiveInteger(options.maxCachedAgeMs);
    const cachedSnapshot = this.getCachedReadinessSnapshot(
      nodeId,
      maxCachedAgeMs,
      options,
    );
    if (cachedSnapshot) {
      const snapshotInvalidated = this.isReadinessSnapshotInvalidated(nodeId);
      if (this.shouldPreferBackgroundRefreshOnIneligible(
        cachedSnapshot,
        options,
      )) {
        this.maybeStartBackgroundReadinessRefresh(nodeId, options);
        return cachedSnapshot;
      }
      if (this.shouldBypassCachedSnapshot(cachedSnapshot, options)) {
        // Fall through to a fresh owner-path evaluation when cached readiness
        // is currently ineligible for the requested decision.
      } else if (options.allowStaleOnCacheChange === true && snapshotInvalidated) {
        this.maybeStartBackgroundReadinessRefresh(nodeId, options);
        return cachedSnapshot;
      } else {
        return cachedSnapshot;
      }
    }

    const evaluationKey = this.buildReadinessEvaluationKey(nodeId, options);
    return this.readinessEvaluationLane.run(
      {ownerKey: evaluationKey},
      async () => this.evaluateNodeReadiness(nodeId, options),
    );
  }

  /**
   * Build readiness for one node without consulting the short-lived snapshot
   * cache. Callers that need hot-path deduplication should use
   * `getNodeReadiness`.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   * @private
   */
  async evaluateNodeReadiness(nodeId, options = {}) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const publication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication = await this.getMembershipPublicationDiagnostics(
      nodeId,
      observedAt,
    );
    let nodeRow = await this.readNodeRow(nodeId, options);
    let serviceRows = await this.readNodeServiceRows(nodeId, options);

    if (options.allowAuthoritativeRefresh === true) {
      const repaired = await this.authoritativeNodeEvidenceReconciler
        .maybeRepairNodeEvidence(
        {
          nodeId,
          nodeRow,
          serviceRows,
        },
        options,
      );
      if (repaired) {
        nodeRow = await this.readNodeRow(nodeId, options);
        serviceRows = await this.readNodeServiceRows(nodeId, options);
      }
    }

    if (!nodeRow) {
      const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(
        nodeId,
        null,
        publication,
        membershipPublication,
      );
      if (fresherStoredSnapshot) {
        return fresherStoredSnapshot;
      }
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
        membershipPublication,
      );
      this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        nodeEvidence: null,
        dimensions: missingReadiness.dimensions,
        reasons: missingReadiness.reasons,
        priorityControlPlaneRecovery:
          missingReadiness.priorityControlPlaneRecovery,
      });
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions: this.getReadinessTransitionHistory(nodeId),
      });
      this.storeReadinessSnapshot(nodeId, snapshot);
      return snapshot;
    }

    const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
    const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
    const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
    const dimensions = this.buildDimensions({
      nodeId,
      nodeRow,
      nodeEvidence,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
    });
    const priorityControlPlaneRecovery =
      this.getPriorityControlPlaneRecoveryState({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        dimensions,
      });
    const reasons = this.buildReasons({
      nodeId,
      nodeRow,
      nodeEvidence,
      dimensions,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
      priorityControlPlaneRecovery,
      observedAt,
    });

    const snapshot = Object.freeze({
      ...createEligibilitySnapshot({
        nodeId,
        lifecycleState,
        publication,
        membershipPublication,
        priorityControlPlaneRecovery,
        capacity,
        nodeEvidence,
        observedAt,
        dimensions,
        reasons,
      }),
      recentTransitions: this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        nodeEvidence,
        dimensions,
        reasons,
        priorityControlPlaneRecovery,
      }),
    });
    this.storeReadinessSnapshot(nodeId, snapshot);
    return snapshot;
  }

  /**
   * Synchronous readiness snapshot for a single node.
   * Computes all dimensions that do not require async capacity lookup.
   * `placementEligible` is conservatively false when capacity is
   * unavailable synchronously, but `serveEligible` remains a pure
   * traffic-admission signal so routing does not fail closed on
   * unavailable placement accounting alone.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Object|null} Frozen readiness snapshot or null.
   */
  getNodeReadinessSync(nodeId, options = {}) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const nodeRow = this.getNodeRow(nodeId);
    const publication = this.getPublicationDiagnostics(observedAt);
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
    );
    const serviceRows = this.getNodeServiceRows(nodeId);
    const fresherStoredSnapshot = this.getFresherStoredReadinessSnapshot(
      nodeId,
      nodeRow,
      publication,
      membershipPublication,
    );

    if (fresherStoredSnapshot) {
      this.maybeStartBackgroundSyncReadinessRefresh(
        {
          nodeId,
          nodeRow,
          serviceRows,
          snapshot: fresherStoredSnapshot,
        },
        options,
      );
      return fresherStoredSnapshot;
    }

    if (!nodeRow) {
      const missingReadiness = this.buildMissingNodeReadiness(
        nodeId,
        observedAt,
        publication,
        membershipPublication,
      );
      this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        nodeEvidence: null,
        dimensions: missingReadiness.dimensions,
        reasons: missingReadiness.reasons,
        priorityControlPlaneRecovery:
          missingReadiness.priorityControlPlaneRecovery,
      });
      const snapshot = Object.freeze({
        ...missingReadiness,
        recentTransitions: this.getReadinessTransitionHistory(nodeId),
      });
      this.storeReadinessSnapshot(nodeId, snapshot);
      this.maybeStartBackgroundSyncReadinessRefresh(
        {
          nodeId,
          nodeRow,
          serviceRows,
          snapshot,
        },
        options,
      );
      return snapshot;
    }

    const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
    const nodeEvidence = this.buildNodeEvidence(nodeId, nodeRow);
    const capacity = this.getCapacitySnapshotSync(nodeId, nodeRow);
    const dimensions = this.buildDimensions({
      nodeId,
      nodeRow,
      nodeEvidence,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
    });
    const priorityControlPlaneRecovery =
      this.getPriorityControlPlaneRecoveryState({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        dimensions,
      });
    const reasons = this.buildReasons({
      nodeId,
      nodeRow,
      nodeEvidence,
      dimensions,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      membershipPublication,
      priorityControlPlaneRecovery,
      observedAt,
    });

    const snapshot = Object.freeze({
      ...createEligibilitySnapshot({
        nodeId,
        lifecycleState,
        publication,
        membershipPublication,
        priorityControlPlaneRecovery,
        capacity,
        nodeEvidence,
        observedAt,
        dimensions,
        reasons,
      }),
      recentTransitions: this.recordReadinessTransition({
        nodeId,
        observedAt,
        publication,
        membershipPublication,
        nodeEvidence,
        dimensions,
        reasons,
        priorityControlPlaneRecovery,
      }),
    });
    this.storeReadinessSnapshot(nodeId, snapshot);
    this.maybeStartBackgroundSyncReadinessRefresh(
      {
        nodeId,
        nodeRow,
        serviceRows,
        snapshot,
      },
      options,
    );
    return snapshot;
  }

  /**
   * Return one canonical control-plane participation decision for the
   * requested node and work kind.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async getControlPlaneParticipation(nodeId, options = {}) {
    const participationKind = normalizeControlPlaneParticipationKind(
      options?.participationKind,
    );
    const decisionDimension = resolveParticipationDecisionDimension(
      participationKind,
      options?.decisionDimension,
    );
    const readiness = await this.getNodeReadiness(nodeId, {
      ...options,
      decisionDimension,
    });
    return this.buildControlPlaneParticipation({
      nodeId,
      readiness,
      participationKind,
      decisionDimension,
      tableName: options?.tableName || null,
      partitionId: options?.partitionId || null,
    });
  }

  /**
   * Return one synchronous canonical control-plane participation decision.
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Object}
   */
  getControlPlaneParticipationSync(nodeId, options = {}) {
    const participationKind = normalizeControlPlaneParticipationKind(
      options?.participationKind,
    );
    const decisionDimension = resolveParticipationDecisionDimension(
      participationKind,
      options?.decisionDimension,
    );
    const readiness = this.getNodeReadinessSync(nodeId, {
      ...options,
      decisionDimension,
    });
    return this.buildControlPlaneParticipation({
      nodeId,
      readiness,
      participationKind,
      decisionDimension,
      tableName: options?.tableName || null,
      partitionId: options?.partitionId || null,
    });
  }

  /**
   * Build one bounded participation decision from the canonical readiness
   * snapshot.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildControlPlaneParticipation(context) {
    const snapshot =
      context?.readiness &&
      typeof context.readiness === TYPEOF.OBJECT ?
        context.readiness :
        null;
    const decisionDimension = resolveParticipationDecisionDimension(
      normalizeControlPlaneParticipationKind(context?.participationKind),
      context?.decisionDimension,
    );
    const decision = snapshot?.dimensions &&
      typeof snapshot.dimensions === TYPEOF.OBJECT ?
      evaluateEligibilityDecision(snapshot, decisionDimension) :
      Object.freeze({
        nodeId: context?.nodeId || null,
        decisionDimension,
        eligible: false,
        failedDimensions: Object.freeze([decisionDimension]),
        reasonCodes: Object.freeze([]),
      });
    const summary = compactEligibilitySnapshot(snapshot, decisionDimension);
    const cacheWatermark = this.buildStoredReadinessSnapshotWatermark(snapshot);
    const localQueryTransport = snapshot?.nodeEvidence ?
      Object.freeze({
        state: snapshot.nodeEvidence.localQueryTransportState || null,
        ready:
          typeof snapshot.nodeEvidence.localQueryTransportReady === 'boolean' ?
            snapshot.nodeEvidence.localQueryTransportReady :
            null,
        reason: snapshot.nodeEvidence.localQueryTransportReason || null,
        retryAfterMs:
          Number.isFinite(
            snapshot.nodeEvidence.localQueryTransportRetryAfterMs,
          ) ?
            snapshot.nodeEvidence.localQueryTransportRetryAfterMs :
            null,
      }) :
      null;
    const transportState = snapshot?.nodeEvidence ?
      Object.freeze({
        connected: snapshot.nodeEvidence.transportConnected === true,
        rowState: snapshot.nodeEvidence.rowConnectionState || null,
        routerState: snapshot.nodeEvidence.routerConnectionState || null,
        localQueryTransportState:
          snapshot.nodeEvidence.localQueryTransportState || null,
        localQueryTransportReady:
          typeof snapshot.nodeEvidence.localQueryTransportReady === 'boolean' ?
            snapshot.nodeEvidence.localQueryTransportReady :
            null,
        localQueryTransportReason:
          snapshot.nodeEvidence.localQueryTransportReason || null,
        localQueryTransportRetryAfterMs:
          Number.isFinite(
            snapshot.nodeEvidence.localQueryTransportRetryAfterMs,
          ) ?
            snapshot.nodeEvidence.localQueryTransportRetryAfterMs :
            null,
      }) :
      null;
    const authoritativeRepair = this.getLatestAuthoritativeReadinessRepair(
      context?.nodeId || null,
    );
    const reasonCodes = Array.isArray(decision?.reasonCodes) ?
      decision.reasonCodes :
      Object.freeze([]);
    const localExecutionAllowed = shouldAllowLocalExecutionForParticipation({
      localNodeId: this.nodeId,
      targetNodeId: context?.nodeId || null,
      participationKind: normalizeControlPlaneParticipationKind(
        context?.participationKind,
      ),
      localQueryTransport,
    });
    const reasonCode =
      reasonCodes.length > NUM.ZERO ? reasonCodes[NUM.ZERO] : null;
    const deferRetry =
      reasonCode ===
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY &&
      Number.isFinite(localQueryTransport?.retryAfterMs) &&
      localQueryTransport.retryAfterMs > NUM.ZERO;
    const participation = {
      nodeId: context?.nodeId || null,
      tableName:
        typeof context?.tableName === TYPEOF.STRING &&
          context.tableName.length > NUM.ZERO ?
          context.tableName :
          null,
      partitionId:
        typeof context?.partitionId === TYPEOF.STRING &&
          context.partitionId.length > NUM.ZERO ?
          context.partitionId :
          null,
      participationKind: normalizeControlPlaneParticipationKind(
        context?.participationKind,
      ),
      decisionDimension,
      eligible: decision?.eligible === true,
      decision:
        decision?.eligible === true ?
          CONTROL_PLANE_PARTICIPATION_DECISION.READY :
          (
            deferRetry ?
              CONTROL_PLANE_PARTICIPATION_DECISION.DEFER :
              CONTROL_PLANE_PARTICIPATION_DECISION.BLOCKED
          ),
      reasonCode,
      reasonCodes,
      retryAfterMs:
        Number.isFinite(localQueryTransport?.retryAfterMs) &&
          localQueryTransport.retryAfterMs > NUM.ZERO ?
          localQueryTransport.retryAfterMs :
          null,
      deferRetry,
      localExecutionAllowed,
      errorCode: null,
      error: null,
      cacheWatermark,
      transportState,
      lifecyclePhase:
        typeof snapshot?.lifecycleState === TYPEOF.STRING &&
          snapshot.lifecycleState.length > NUM.ZERO ?
          snapshot.lifecycleState :
          (summary?.lifecycleState || null),
      authoritativeRepair,
      localQueryTransport,
      snapshot,
      failedDimensions: Array.isArray(decision?.failedDimensions) ?
        decision.failedDimensions :
        Object.freeze([]),
      summary: summary ? Object.freeze({
        decisionDimension: summary.decisionDimension || decisionDimension,
        observedAt: summary.observedAt || null,
        lifecycleState: summary.lifecycleState || null,
        reasonCodes: summary.reasonCodes || Object.freeze([]),
        failedDimensions: Array.isArray(decision?.failedDimensions) ?
          decision.failedDimensions :
          Object.freeze([]),
      }) : null,
    };

    if (participation.decision !==
        CONTROL_PLANE_PARTICIPATION_DECISION.READY) {
      participation.errorCode = buildParticipationErrorCode(participation);
      participation.error = buildParticipationErrorMessage(participation);
    }

    const frozenParticipation = Object.freeze(participation);
    this.recordParticipationDecision(frozenParticipation);
    return frozenParticipation;
  }

  /**
   * Persist one bounded participation-decision record for diagnostics.
   * @param {Object|null} participation
   * @return {void}
   * @private
   */
  recordParticipationDecision(participation) {
    if (!participation || !this.participationDecisionLedger) {
      return;
    }
    this.participationDecisionLedger.append({
      nodeId: participation.nodeId || null,
      tableName: participation.tableName || null,
      partitionId: participation.partitionId || null,
      participationKind: participation.participationKind || null,
      decisionDimension: participation.decisionDimension || null,
      decision: participation.decision || null,
      eligible: participation.eligible === true,
      reasonCode: participation.reasonCode || null,
      reasonCodes: Array.isArray(participation.reasonCodes) ?
        [...participation.reasonCodes] :
        [],
      failedDimensions: Array.isArray(participation.failedDimensions) ?
        [...participation.failedDimensions] :
        [],
      localExecutionAllowed: participation.localExecutionAllowed === true,
      cacheWatermark:
        participation.cacheWatermark &&
          typeof participation.cacheWatermark === TYPEOF.OBJECT ?
          {...participation.cacheWatermark} :
          null,
      transportState:
        participation.transportState &&
          typeof participation.transportState === TYPEOF.OBJECT ?
          {...participation.transportState} :
          null,
      authoritativeRepair:
        participation.authoritativeRepair &&
          typeof participation.authoritativeRepair === TYPEOF.OBJECT ?
          {...participation.authoritativeRepair} :
          null,
      lifecyclePhase: participation.lifecyclePhase || null,
      lifecycleState: participation.summary?.lifecycleState || null,
      observedAt: participation.summary?.observedAt || null,
    });
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getParticipationDecisionLedgerEntries(options = {}) {
    return this.participationDecisionLedger ?
      this.participationDecisionLedger.getEntries(options) :
      Object.freeze([]);
  }

  /**
   * @param {Object} entry
   * @return {void}
   * @private
   */
  recordAuthoritativeReadinessRepair(entry = {}) {
    this.authoritativeNodeEvidenceReconciler.recordRepair(entry);
  }

  /**
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getLatestAuthoritativeReadinessRepair(nodeId) {
    return this.authoritativeNodeEvidenceReconciler.getLatestRepair(nodeId);
  }

  /**
   * @param {Object} [options={}]
   * @return {Object[]}
   */
  getAuthoritativeReadinessRepairLedgerEntries(options = {}) {
    return this.authoritativeNodeEvidenceReconciler.getLedgerEntries(options);
  }

  /**
   * Reuse one previously-computed readiness snapshot when it is fresher than
   * the currently visible cache row. This bridges short read-cache lag after a
   * canonical owner-path refresh without reopening the sync call path to I/O.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @param {Object|null} publication
   * @param {Object|null} membershipPublication
   * @return {Object|null}
   * @private
   */
  getFresherStoredReadinessSnapshot(
    nodeId,
    nodeRow,
    publication,
    membershipPublication,
  ) {
    const storedSnapshot =
      this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    if (!storedSnapshot ||
        !this.isStoredReadinessSnapshotFresh(
          storedSnapshot,
          capturedAtMs,
        )) {
      return null;
    }

    const storedWatermark =
      this.buildStoredReadinessSnapshotWatermark(storedSnapshot);
    if (!storedWatermark) {
      return null;
    }

    if (nodeRow &&
        compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) <= NUM.ZERO) {
      return null;
    }

    return Object.freeze({
      ...storedSnapshot,
      publication: publication && typeof publication === TYPEOF.OBJECT ?
        Object.freeze({...publication}) :
        null,
      membershipPublication:
        membershipPublication && typeof membershipPublication === TYPEOF.OBJECT ?
          Object.freeze({...membershipPublication}) :
          null,
      recentTransitions: this.getReadinessTransitionHistory(nodeId),
    });
  }

  /**
   * Return true when one stored readiness snapshot is still safe to reuse for
   * hot-path sync consumers.
   * @param {Object|null} snapshot
   * @param {number|null} capturedAtMs
   * @return {boolean}
   * @private
   */
  isStoredReadinessSnapshotFresh(snapshot, capturedAtMs) {
    if (!snapshot || !Number.isFinite(capturedAtMs)) {
      return false;
    }

    const now = this.now();
    if ((now - capturedAtMs) > this.clusterMemberStaleHeartbeatMaxAgeMs) {
      return false;
    }

    const readyLeaseExpiresAt = Number(
      snapshot?.nodeEvidence?.readyLeaseExpiresAt,
    );
    if (Number.isFinite(readyLeaseExpiresAt) &&
        readyLeaseExpiresAt <= now) {
      return false;
    }

    return true;
  }

  /**
   * Build a comparable node watermark from one stored readiness snapshot.
   * @param {Object|null} snapshot
   * @return {Object|null}
   * @private
   */
  buildStoredReadinessSnapshotWatermark(snapshot) {
    const nodeEvidence = snapshot?.nodeEvidence;
    if (!nodeEvidence || typeof nodeEvidence !== TYPEOF.OBJECT) {
      return null;
    }

    const watermark = {};
    const lastHeartbeat = Number(nodeEvidence.lastHeartbeat);
    if (Number.isFinite(lastHeartbeat)) {
      watermark.lastHeartbeat = lastHeartbeat;
    }
    const readyLeaseExpiresAt = Number(nodeEvidence.readyLeaseExpiresAt);
    if (Number.isFinite(readyLeaseExpiresAt)) {
      watermark.readyLeaseExpiresAt = readyLeaseExpiresAt;
    }
    if (typeof nodeEvidence.rowConnectionState === TYPEOF.STRING &&
        nodeEvidence.rowConnectionState.length > NUM.ZERO) {
      watermark.connectionState = nodeEvidence.rowConnectionState;
    }

    return Object.keys(watermark).length > NUM.ZERO ?
      Object.freeze(watermark) :
      null;
  }

  /**
   * Return one recent readiness snapshot when available.
   * @param {string} nodeId
   * @param {number} maxCachedAgeMs
   * @return {Object|null}
   * @private
   */
  getCachedReadinessSnapshot(nodeId, maxCachedAgeMs, options = {}) {
    if (!nodeId || maxCachedAgeMs <= NUM.ZERO) {
      return null;
    }
    const snapshot = this.lastReadinessSnapshotByNodeId.get(nodeId) || null;
    const capturedAtMs =
      this.lastReadinessSnapshotAtMsByNodeId.get(nodeId) || null;
    if (!snapshot || !Number.isFinite(capturedAtMs)) {
      return null;
    }
    if ((this.now() - capturedAtMs) > maxCachedAgeMs) {
      return null;
    }
    if (this.isReadinessSnapshotInvalidated(nodeId, capturedAtMs) &&
        options.allowStaleOnCacheChange !== true) {
      return null;
    }
    return snapshot;
  }

  /**
   * Return true when callers should bypass cached readiness and refresh
   * synchronously before making a gating decision.
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  shouldBypassCachedSnapshot(snapshot, options = {}) {
    if (options.requireFreshOnIneligible !== true) {
      return false;
    }
    const decisionDimension =
      this.resolveReadinessDecisionDimension(options);
    const dimensions = snapshot?.dimensions;
    if (!dimensions || typeof dimensions !== TYPEOF.OBJECT) {
      return true;
    }
    return dimensions[decisionDimension] !== true;
  }

  /**
   * Return true when callers should reuse a recent cached ineligible snapshot
   * immediately and refresh the canonical readiness owner in the background.
   * @param {Object|null} snapshot
   * @param {Object} [options]
   * @return {boolean}
   * @private
   */
  shouldPreferBackgroundRefreshOnIneligible(snapshot, options = {}) {
    if (options.allowAuthoritativeRefresh !== true ||
        options.preferBackgroundRefreshOnIneligible !== true) {
      return false;
    }
    const dimensions = snapshot?.dimensions;
    if (!dimensions || typeof dimensions !== TYPEOF.OBJECT) {
      return false;
    }
    const decisionDimension =
      this.resolveReadinessDecisionDimension(options);
    return dimensions[decisionDimension] !== true;
  }

  /**
   * Resolve the caller's gating dimension with a stable serve default.
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  resolveReadinessDecisionDimension(options = {}) {
    return typeof options.decisionDimension === TYPEOF.STRING &&
      options.decisionDimension.length > NUM.ZERO ?
      options.decisionDimension :
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  }

  /**
   * Persist one recent readiness snapshot for hot-path reuse.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @private
   */
  storeReadinessSnapshot(nodeId, snapshot) {
    if (!nodeId || !snapshot) {
      return;
    }
    const capturedAtMs = this.now();
    this.lastReadinessSnapshotByNodeId.set(nodeId, snapshot);
    this.lastReadinessSnapshotAtMsByNodeId.set(nodeId, capturedAtMs);
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.delete(nodeId);
    this.recordRecoveryEpochObservation(nodeId, snapshot, capturedAtMs);
  }

  /**
   * Track restart/recovery epochs as bounded per-node timelines keyed by the
   * canonical readiness owner, so harness diagnostics can inspect progress
   * directly instead of inferring it from raw logs.
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number} observedAtMs
   * @return {void}
   * @private
   */
  recordRecoveryEpochObservation(nodeId, snapshot, observedAtMs) {
    const summary = this.buildRecoveryEpochSummary(nodeId, snapshot, observedAtMs);
    const recoveryActive = summary.recoveryActive === true;
    const currentEpoch = this.currentRecoveryEpochByNodeId.get(nodeId) || null;
    if (!currentEpoch && !recoveryActive) {
      return;
    }

    if (!currentEpoch && recoveryActive) {
      const history =
        this.recoveryEpochHistoryByNodeId.get(nodeId) || [];
      const epoch = {
        epochId: `${nodeId}:${history.length + this.currentRecoveryEpochByNodeId.size + 1}`,
        nodeId,
        startedAt: summary.observedAt,
        startedAtMs: observedAtMs,
        open: true,
        events: [summary],
      };
      this.currentRecoveryEpochByNodeId.set(nodeId, epoch);
      return;
    }

    if (!currentEpoch) {
      return;
    }

    const lastEvent = currentEpoch.events[currentEpoch.events.length - 1] || null;
    if (!lastEvent ||
        JSON.stringify(lastEvent) !== JSON.stringify(summary)) {
      currentEpoch.events.push(summary);
      if (currentEpoch.events.length > this.recoveryEpochEventLimit) {
        currentEpoch.events.splice(
          0,
          currentEpoch.events.length - this.recoveryEpochEventLimit,
        );
      }
    }

    if (!recoveryActive) {
      currentEpoch.open = false;
      currentEpoch.endedAt = summary.observedAt;
      currentEpoch.endedAtMs = observedAtMs;
      this.currentRecoveryEpochByNodeId.delete(nodeId);
      const history =
        this.recoveryEpochHistoryByNodeId.get(nodeId) || [];
      history.push(Object.freeze({
        ...currentEpoch,
        events: Object.freeze(currentEpoch.events.map((event) =>
          Object.freeze({...event}),
        )),
      }));
      while (history.length > this.recoveryEpochHistoryLimit) {
        history.shift();
      }
      this.recoveryEpochHistoryByNodeId.set(nodeId, history);
    }
  }

  /**
   * @param {string} nodeId
   * @param {Object|null} snapshot
   * @param {number} observedAtMs
   * @return {Object}
   * @private
   */
  buildRecoveryEpochSummary(nodeId, snapshot, observedAtMs) {
    const dimensions = snapshot?.dimensions &&
      typeof snapshot.dimensions === TYPEOF.OBJECT ?
      snapshot.dimensions :
      {};
    const reasonCodes = Array.isArray(snapshot?.reasons) ?
      [...new Set(snapshot.reasons
        .map((reason) => String(reason?.code || ''))
        .filter(Boolean))] :
      [];
    return Object.freeze({
      nodeId,
      observedAt: snapshot?.observedAt || normalizeIsoTimestamp(observedAtMs),
      observedAtMs,
      lifecycleState: snapshot?.lifecycleState || null,
      processAlive:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true,
      clusterMemberHealthy:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] === true,
      controlPlaneWritable:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
        ] === true,
      controlPlanePublished:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
        ] === true,
      controlPlaneRecoveryEligible:
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] === true,
      repairEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
      serveEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
      priorityControlPlaneRecoveryActive:
        snapshot?.priorityControlPlaneRecovery?.active === true,
      priorityControlPlaneRecoveryReasonCodes:
        Array.isArray(snapshot?.priorityControlPlaneRecovery?.reasonCodes) ?
          Object.freeze([...snapshot.priorityControlPlaneRecovery.reasonCodes]) :
          Object.freeze([]),
      reasonCodes: Object.freeze(reasonCodes),
      recoveryActive: !(
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION
            .CONTROL_PLANE_RECOVERY_ELIGIBLE
        ] === true &&
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
        ] === true &&
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
        ] === true &&
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] === true &&
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true
      ),
    });
  }

  /**
   * @return {Object}
   */
  getRecoveryEpochHistoryByNodeId() {
    const entries = {};
    for (const [nodeId, history] of this.recoveryEpochHistoryByNodeId.entries()) {
      entries[nodeId] = Array.isArray(history) ?
        history.map((epoch) => Object.freeze({
          ...epoch,
          events: Object.freeze(
            (Array.isArray(epoch.events) ? epoch.events : []).map((event) =>
              Object.freeze({...event}),
            ),
          ),
        })) :
        [];
    }
    for (const [nodeId, epoch] of this.currentRecoveryEpochByNodeId.entries()) {
      entries[nodeId] = Object.freeze([
        ...(Array.isArray(entries[nodeId]) ? entries[nodeId] : []),
        Object.freeze({
          ...epoch,
          events: Object.freeze(
            (Array.isArray(epoch.events) ? epoch.events : []).map((event) =>
              Object.freeze({...event}),
            ),
          ),
        }),
      ]);
    }
    return Object.freeze(entries);
  }

  /**
   * Build one stable single-flight key for readiness evaluations.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {string}
   * @private
   */
  buildReadinessEvaluationKey(nodeId, options = {}) {
    return String(nodeId || '') +
      '::refresh=' +
      String(options.allowAuthoritativeRefresh === true) +
      '::stale=' +
      String(options.allowStaleOnCacheChange === true);
  }

  /**
   * Subscribe to node/service cache changes so hot-path readiness reuse does
   * not outlive fresh cluster evidence.
   * @private
   */
  subscribeToCacheChanges() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.onCacheChange !== TYPEOF.FUNCTION) {
      return;
    }
    this.cacheChangeListener = (tableName, _operation, record) => {
      this.handleCacheChange(tableName, record);
    };
    this.systemTableCache.onCacheChange(this.cacheChangeListener);
  }

  /**
   * Invalidate cached readiness snapshots affected by one cache change.
   * @param {string} tableName
   * @param {Object|null} record
   * @private
   */
  handleCacheChange(tableName, record) {
    if (tableName !== TABLES.NODES && tableName !== TABLES.SERVICES) {
      return;
    }
    const nodeId = String(
      record?.[COLUMN.NODE_ID] ??
        record?.node_id ??
        '',
    );
    if (!nodeId) {
      return;
    }
    this.lastReadinessSnapshotInvalidatedAtMsByNodeId.set(
      nodeId,
      this.now(),
    );
  }

  /**
   * Determine whether one cached readiness snapshot was invalidated by a
   * subsequent node/service cache mutation.
   * @param {string} nodeId
   * @param {number|null} [capturedAtMs]
   * @return {boolean}
   * @private
   */
  isReadinessSnapshotInvalidated(nodeId, capturedAtMs = null) {
    if (!nodeId) {
      return false;
    }
    const invalidatedAtMs = Number(
      this.lastReadinessSnapshotInvalidatedAtMsByNodeId.get(nodeId),
    );
    if (!Number.isFinite(invalidatedAtMs) || invalidatedAtMs <= NUM.ZERO) {
      return false;
    }
    const snapshotAtMs = Number.isFinite(capturedAtMs) ?
      capturedAtMs :
      Number(this.lastReadinessSnapshotAtMsByNodeId.get(nodeId));
    if (!Number.isFinite(snapshotAtMs) || snapshotAtMs <= NUM.ZERO) {
      return true;
    }
    return invalidatedAtMs >= snapshotAtMs;
  }

  /**
   * Start one deduped asynchronous readiness refresh when a hot-path caller is
   * allowed to reuse a recently invalidated snapshot.
   * @param {string} nodeId
   * @param {Object} [options]
   * @private
   */
  maybeStartBackgroundReadinessRefresh(nodeId, options = {}) {
    if (!nodeId) {
      return;
    }
    const evaluationKey = this.buildReadinessEvaluationKey(nodeId, options);
    this.readinessEvaluationLane.run(
      {ownerKey: evaluationKey},
      async () => this.evaluateNodeReadiness(nodeId, options),
    ).catch((_error) => null);
  }

  /**
   * Start one background owner-path refresh for sync callers when the visible
   * snapshot is ineligible for the requested decision and connected evidence
   * suggests the cache may be stale.
   * @param {Object} context
   * @param {Object} [options]
   * @private
   */
  maybeStartBackgroundSyncReadinessRefresh(context = {}, options = {}) {
    if (options.allowAuthoritativeRefresh !== true) {
      return;
    }
    if (!this.shouldBypassCachedSnapshot(context.snapshot, options)) {
      return;
    }
    this.authoritativeNodeEvidenceReconciler
      .maybeRepairNodeEvidence(context, options)
      .catch((_error) => null);
  }

  /**
   * Resolve local heartbeat publication diagnostics when available.
   * @return {Object|null}
   * @private
   */
  getHeartbeatPublicationDiagnostics() {
    if (!this.heartbeatService ||
        typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !==
          TYPEOF.FUNCTION) {
      return null;
    }
    try {
      const diagnostics =
        this.heartbeatService.getHeartbeatPublicationDiagnostics();
      return diagnostics && typeof diagnostics === TYPEOF.OBJECT ?
        diagnostics :
        null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Treat fresh local node_state_reporter success as self-liveness evidence
   * when the local cache lags the control-plane round-trip for this node.
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  hasFreshLocalReporterSuccess(nodeId) {
    if (nodeId !== this.nodeId) {
      return false;
    }

    const diagnostics = this.getHeartbeatPublicationDiagnostics();
    if (!diagnostics ||
        diagnostics.publicationPath !== 'node_state_reporter') {
      return false;
    }

    const lastSuccessAtMs =
      normalizeDiagnosticTimestampMs(diagnostics.lastSuccessAt);
    if (!Number.isFinite(lastSuccessAtMs)) {
      return false;
    }

    const lastFailureAtMs =
      normalizeDiagnosticTimestampMs(diagnostics.lastFailureAt);
    if (Number(diagnostics.consecutiveFailures) > NUM.ZERO ||
        (Number.isFinite(lastFailureAtMs) &&
          lastFailureAtMs > lastSuccessAtMs)) {
      return this.shouldGraceTimedOutLocalReporterFailure({
        diagnostics,
        lastSuccessAtMs,
        lastFailureAtMs,
      });
    }

    return (this.now() - lastSuccessAtMs) <=
      this.clusterMemberStaleHeartbeatMaxAgeMs;
  }

  /**
   * Keep self-readiness open through one timed-out reporter attempt when the
   * last canonically visible reporter heartbeat is still fresh. This prevents
   * load-lane self denial while the bounded authoritative repair path is
   * timing out under transient control-plane pressure.
   * @param {Object} context
   * @param {Object} context.diagnostics
   * @param {number} context.lastSuccessAtMs
   * @param {number} context.lastFailureAtMs
   * @return {boolean}
   * @private
   */
  shouldGraceTimedOutLocalReporterFailure(context = {}) {
    const diagnostics = context?.diagnostics || {};
    const lastSuccessAtMs = Number(context?.lastSuccessAtMs);
    const lastFailureAtMs = Number(context?.lastFailureAtMs);
    if (!Number.isFinite(lastSuccessAtMs)) {
      return false;
    }

    if ((this.now() - lastSuccessAtMs) >
        this.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs) {
      return false;
    }

    if (!Number.isFinite(lastFailureAtMs) ||
        lastFailureAtMs <= lastSuccessAtMs) {
      return false;
    }

    if (String(diagnostics?.lastFailureStage || '') !== 'attempt_timeout') {
      return false;
    }

    return Number(diagnostics?.consecutiveFailures) <= NUM.ONE;
  }

  /**
   * Resolve publication diagnostics from the canonical publication owner.
   * @param {string} observedAt
   * @return {Object}
   * @private
   */
  getPublicationDiagnostics(observedAt) {
    if (this.cdcGroupPropagationService &&
        typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics ===
          TYPEOF.FUNCTION) {
      return this.cdcGroupPropagationService.getPublicationModeDiagnostics();
    }

    if (!this.loggedMissingPublicationOwner) {
      this.loggedMissingPublicationOwner = true;
      this.logMissingOwner(
        'ControlPlaneReadinessService missing CDC publication owner',
        CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.PUBLICATION_OWNER_REQUIRED);
    }

    return Object.freeze({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
      reasonCode: 'publication_owner_unavailable',
      enteredAt: observedAt,
      recentTransitions: Object.freeze([]),
    });
  }

  /**
   * Build the readiness dimensions.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildDimensions(context) {
    const localQueryTransportRoutable =
      this.isLocalQueryTransportRoutableForNode(
        context.nodeId,
        context.nodeEvidence,
      );
    const publicationHealthy = this.isPublicationHealthy(context.publication);
    const processAlive =
      !CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(
        String(context.lifecycleState || ''),
      );
    const clusterMemberHealthy = this.isClusterMemberHealthy(
      context.nodeId,
      context.nodeRow,
    );
    const writableControlPlaneService =
      this.hasWritableControlPlaneService(context.serviceRows);
    const serveEligibleControlPlaneService =
      this.hasServeEligibleControlPlaneService(context.serviceRows);
    const routingReady =
      this.hasRoutableService(context.serviceRows) &&
      localQueryTransportRoutable;
    const loadReady = this.isLoadReady(context.nodeRow);
    const controlPlanePublished = this.isControlPlanePublished(
      context.membershipPublication,
    );
    const recoveryEligible =
      this.isControlPlaneRecoveryEligible({
        ...context,
        routingReady,
        writableControlPlaneService,
        publicationHealthy,
        controlPlanePublished,
        clusterMemberHealthy,
      });
    const controlPlaneWritable = clusterMemberHealthy &&
      routingReady &&
      writableControlPlaneService &&
      publicationHealthy;
    const placementEligible = processAlive &&
      clusterMemberHealthy &&
      routingReady &&
      loadReady &&
      controlPlaneWritable &&
      publicationHealthy &&
      this.isCapacityPlacementEligible(context.capacity);

    const repairEligible = processAlive &&
      clusterMemberHealthy &&
      routingReady &&
      controlPlaneWritable &&
      publicationHealthy;

    const transportState = this.getNodeTransportState(
      context.nodeId,
      context.nodeRow,
    );
    const transportNotExplicitlyNegative =
      transportState.routerState !== STATE.DISCONNECTED;

    const serveEligible = repairEligible &&
      loadReady &&
      transportNotExplicitlyNegative &&
      serveEligibleControlPlaneService;

    return Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: processAlive,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        clusterMemberHealthy,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: routingReady,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: loadReady,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
        placementEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        controlPlaneWritable,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]:
        controlPlanePublished,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]:
        recoveryEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        publicationHealthy,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
        repairEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]:
        serveEligible,
    });
  }

  /**
   * Recovery admission is broader than ordinary routed traffic: internal
   * control-plane repair must stay possible while cached lifecycle or lease
   * evidence is still converging, as long as transport and service evidence
   * show a reachable control-plane path.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  isControlPlaneRecoveryEligible(context = {}) {
    const priorityRecoveryActive =
      this.isPriorityControlPlaneRecoveryActive(context.membershipPublication);
    if (context.routingReady !== true ||
        context.writableControlPlaneService !== true ||
        context.publicationHealthy !== true ||
        (context.controlPlanePublished !== true && !priorityRecoveryActive)) {
      return false;
    }
    if (context.clusterMemberHealthy === true) {
      return true;
    }
    return this.shouldAllowTransportBackedRecoveryGrace(context);
  }

  isPriorityControlPlaneRecoveryActive(membershipPublication = null) {
    if (!membershipPublication ||
        typeof membershipPublication !== TYPEOF.OBJECT) {
      return false;
    }
    const publicationPending = membershipPublication.status &&
      String(membershipPublication.status).toUpperCase() !==
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
    if (publicationPending) {
      return true;
    }
    const priorityPartitionSummary =
      membershipPublication.priorityPartitionSummary;
    return Boolean(
      priorityPartitionSummary &&
      typeof priorityPartitionSummary === TYPEOF.OBJECT &&
      priorityPartitionSummary.satisfied === false,
    );
  }

  /**
   * Bound recovery-only grace to nodes that still present live transport and
   * active control-plane service evidence, even if lifecycle or lease rows lag.
   * @param {Object} context
   * @return {boolean}
   * @private
   */
  shouldAllowTransportBackedRecoveryGrace(context = {}) {
    const nodeEvidence = context.nodeEvidence &&
      typeof context.nodeEvidence === TYPEOF.OBJECT ?
      context.nodeEvidence :
      null;
    if (nodeEvidence?.transportConnected !== true) {
      return false;
    }
    return this.hasRoutableService(
      Array.isArray(context.serviceRows) ? context.serviceRows : [],
    ) &&
      this.hasWritableControlPlaneService(
        Array.isArray(context.serviceRows) ? context.serviceRows : [],
      );
  }

  /**
   * Determine whether metadata publication mode supports control-plane writes.
   * Grouped mode is healthy, and explicit config-safe-mode repair-only remains
   * healthy because it is a canonical direct-fanout mode rather than runtime
   * degradation.
   * @param {Object} publication
   * @return {boolean}
   * @private
   */
  isPublicationHealthy(publication) {
    const currentMode = publication?.currentMode || null;
    if (currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED) {
      return true;
    }
    if (currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY &&
        publication?.reasonCode === PUBLICATION_REASON_CONFIG_SAFE_MODE) {
      return true;
    }
    return false;
  }

  isControlPlanePublished(membershipPublication) {
    if (!membershipPublication || typeof membershipPublication !== TYPEOF.OBJECT) {
      return true;
    }
    return String(membershipPublication.status || '').toUpperCase() ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }

  /**
   * Build structured reasons for non-ready dimensions.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  buildReasons(context) {
    const reasons = [];
    const dimensions = context.dimensions;
    const localQueryTransportBlocked =
      this.isLocalQueryTransportBlockedForNode(
        context.nodeId,
        context.nodeEvidence,
      );

    if (!dimensions.processAlive) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
        CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
        CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
        context.observedAt,
      ));
    }
    if (!dimensions.clusterMemberHealthy) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
        CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
        CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
        context.observedAt,
        context.nodeEvidence ||
          this.buildNodeEvidence(context.nodeId, context.nodeRow),
      ));
    }
    if (!dimensions.routingReady) {
      if (localQueryTransportBlocked) {
        reasons.push(buildReason(
          CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
          CONTROL_PLANE_READINESS_OWNER.MESSAGE_ROUTER,
          context.observedAt,
          {
            localQueryTransportState:
              context.nodeEvidence?.localQueryTransportState || null,
            localQueryTransportReason:
              context.nodeEvidence?.localQueryTransportReason || null,
            localQueryTransportRetryAfterMs:
              Number.isFinite(
                context.nodeEvidence?.localQueryTransportRetryAfterMs,
              ) ?
                context.nodeEvidence.localQueryTransportRetryAfterMs :
                null,
          },
        ));
      } else {
        reasons.push(buildReason(
          CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
          CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
          CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
          context.observedAt,
        ));
      }
    }
    if (!dimensions.loadReady) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY,
        CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!dimensions.metadataPublicationHealthy) {
      reasons.push(buildReason(
        context.publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY ?
          CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY :
          CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
        CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
        CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
        context.observedAt,
      ));
    }
    if (!dimensions.controlPlaneWritable) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!dimensions.controlPlanePublished) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
        CONTROL_PLANE_READINESS_OWNER.MEMBERSHIP_PUBLICATION,
        context.observedAt,
        context.membershipPublication || null,
      ));
    }
    if (!this.isCapacityPlacementEligible(context.capacity)) {
      const code = this.getCapacityReasonCode(context.capacity);
      if (code) {
        reasons.push(buildReason(
          code,
          CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
          CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
          context.observedAt,
        ));
      }
    }

    return Object.freeze(reasons);
  }

  /**
   * Return whether one node remains eligible for routed control-plane reads
   * given locally observable query/data-plane transport evidence.
   * Only the self node has direct local transport evidence.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportRoutableForNode(nodeId, nodeEvidence = null) {
    if (nodeId !== this.nodeId) {
      return true;
    }
    return nodeEvidence?.localQueryTransportReady !== false;
  }

  /**
   * Return true when one node's routed-read eligibility is blocked by the
   * canonical local query/data-plane transport owner.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportBlockedForNode(nodeId, nodeEvidence = null) {
    return nodeId === this.nodeId &&
      nodeEvidence?.localQueryTransportReady === false;
  }

  /**
   * Build readiness for a missing node row.
   * @param {string} nodeId
   * @param {string} observedAt
   * @param {Object} publication
   * @return {Object}
   * @private
   */
  buildMissingNodeReadiness(
    nodeId,
    observedAt,
    publication,
    membershipPublication = null,
  ) {
    const dimensions = Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]:
        this.isControlPlanePublished(membershipPublication),
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    });
    const reasons = Object.freeze([
      buildReason(
        CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
        CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        observedAt,
      ),
    ]);

    return createEligibilitySnapshot({
      nodeId,
      lifecycleState: null,
      publication,
      membershipPublication,
      capacity: null,
      nodeEvidence: null,
      observedAt,
      dimensions,
      reasons,
    });
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      now: this.now,
      queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
    });
    return this.authoritativeControlPlaneView;
  }

  /**
   * Build node-row liveness evidence used by readiness diagnostics.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @return {Object|null}
   * @private
   */
  buildNodeEvidence(nodeId, nodeRow) {
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return null;
    }
    return this.buildClusterMemberHealthDetails(nodeId, nodeRow);
  }

  /**
   * Record one readiness transition when repair/serve eligibility flips.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  recordReadinessTransition(context) {
    const currentState = this.buildReadinessTransitionState(context);
    const previousState =
      this.lastReadinessEvaluationByNodeId.get(context.nodeId) || null;
    this.lastReadinessEvaluationByNodeId.set(context.nodeId, currentState);

    if (!previousState) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const flippedDimensions = [];
    if (previousState.serveEligible !== currentState.serveEligible) {
      flippedDimensions.push(
        CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      );
    }
    if (previousState.repairEligible !== currentState.repairEligible) {
      flippedDimensions.push(
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );
    }
    if (flippedDimensions.length === NUM.ZERO) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const entry = Object.freeze({
      nodeId: context.nodeId,
      observedAt: currentState.observedAt,
      observedAtMs: currentState.observedAtMs,
      previousServeEligible: previousState.serveEligible,
      serveEligible: currentState.serveEligible,
      previousRepairEligible: previousState.repairEligible,
      repairEligible: currentState.repairEligible,
      previousReasonCodes: Object.freeze([...previousState.reasonCodes]),
      reasonCodes: Object.freeze([...currentState.reasonCodes]),
      flippedDimensions: Object.freeze(flippedDimensions),
      rawInputs: Object.freeze({...currentState.rawInputs}),
    });
    const history =
      this.readinessTransitionHistoryByNodeId.get(context.nodeId) || [];
    const nextHistory = [...history, entry];
    while (nextHistory.length > this.readinessTransitionHistoryLimit) {
      nextHistory.shift();
    }
    this.readinessTransitionHistoryByNodeId.set(context.nodeId, nextHistory);
    return this.getReadinessTransitionHistory(context.nodeId);
  }

  /**
   * Return one defensive copy of readiness transition history.
   * @param {string} nodeId
   * @return {Object[]}
   */
  getReadinessTransitionHistory(nodeId) {
    const history = this.readinessTransitionHistoryByNodeId.get(nodeId);
    if (!Array.isArray(history) || history.length === NUM.ZERO) {
      return Object.freeze([]);
    }
    return Object.freeze(history.map((entry) => Object.freeze({
      ...entry,
      previousReasonCodes: Array.isArray(entry.previousReasonCodes) ?
        Object.freeze([...entry.previousReasonCodes]) :
        Object.freeze([]),
      reasonCodes: Array.isArray(entry.reasonCodes) ?
        Object.freeze([...entry.reasonCodes]) :
        Object.freeze([]),
      flippedDimensions: Array.isArray(entry.flippedDimensions) ?
        Object.freeze([...entry.flippedDimensions]) :
        Object.freeze([]),
      rawInputs: entry.rawInputs && typeof entry.rawInputs === TYPEOF.OBJECT ?
        Object.freeze({...entry.rawInputs}) :
        Object.freeze({}),
    })));
  }

  /**
   * Return transition history for every tracked node.
   * @return {Object}
   */
  getReadinessTransitionHistoryByNodeId() {
    const entries = {};
    for (const nodeId of this.readinessTransitionHistoryByNodeId.keys()) {
      entries[nodeId] = this.getReadinessTransitionHistory(nodeId);
    }
    return Object.freeze(entries);
  }

  /**
   * Normalize one readiness state for transition tracking.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildReadinessTransitionState(context) {
    const observedAtMs = this.now();
    const observedAt = typeof context.observedAt === TYPEOF.STRING &&
      context.observedAt.length > NUM.ZERO ?
      context.observedAt :
      normalizeIsoTimestamp(observedAtMs);
    const reasonCodes = Array.isArray(context.reasons) ?
      [...new Set(
        context.reasons
          .map((reason) => String(reason?.code || ''))
          .filter(Boolean),
      )].sort() :
      [];
    const nodeEvidence = context.nodeEvidence &&
      typeof context.nodeEvidence === TYPEOF.OBJECT ?
      context.nodeEvidence :
      {};
    const dimensions = context.dimensions &&
      typeof context.dimensions === TYPEOF.OBJECT ?
      context.dimensions :
      {};
    const publication = context.publication &&
      typeof context.publication === TYPEOF.OBJECT ?
      context.publication :
      {};
    const priorityControlPlaneRecovery =
      context.priorityControlPlaneRecovery &&
      typeof context.priorityControlPlaneRecovery === TYPEOF.OBJECT ?
        context.priorityControlPlaneRecovery :
        {};

    return Object.freeze({
      observedAt,
      observedAtMs,
      serveEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
      repairEligible:
        dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
      reasonCodes: Object.freeze(reasonCodes),
      rawInputs: Object.freeze({
        lastHeartbeat: Number.isFinite(nodeEvidence.lastHeartbeat) ?
          nodeEvidence.lastHeartbeat :
          null,
        heartbeatAgeMs: Number.isFinite(nodeEvidence.heartbeatAgeMs) ?
          nodeEvidence.heartbeatAgeMs :
          null,
        readyLeaseExpiresAt: Number.isFinite(nodeEvidence.readyLeaseExpiresAt) ?
          nodeEvidence.readyLeaseExpiresAt :
          null,
        readyLeaseLagMs: Number.isFinite(nodeEvidence.readyLeaseAgeMs) ?
          nodeEvidence.readyLeaseAgeMs :
          null,
        staleHeartbeatLimitMs:
          Number.isFinite(nodeEvidence.staleHeartbeatLimitMs) ?
            nodeEvidence.staleHeartbeatLimitMs :
            null,
        controlPlaneWritable:
          dimensions[
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
          ] === true,
        controlPlanePublished:
          dimensions[
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
          ] === true,
        routingReady:
          dimensions[CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY] === true,
        loadReady:
          dimensions[CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY] === true,
        clusterMemberHealthy:
          dimensions[
            CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
          ] === true,
        metadataPublicationHealthy:
          dimensions[
            CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY
          ] === true,
        localQueryTransportState:
          typeof nodeEvidence.localQueryTransportState === TYPEOF.STRING ?
            nodeEvidence.localQueryTransportState :
            null,
        localQueryTransportReady:
          typeof nodeEvidence.localQueryTransportReady === 'boolean' ?
            nodeEvidence.localQueryTransportReady :
            null,
        localQueryTransportReason:
          typeof nodeEvidence.localQueryTransportReason === TYPEOF.STRING ?
            nodeEvidence.localQueryTransportReason :
            null,
        localQueryTransportRetryAfterMs:
          Number.isFinite(nodeEvidence.localQueryTransportRetryAfterMs) ?
            nodeEvidence.localQueryTransportRetryAfterMs :
            null,
        publicationMode:
          typeof publication.currentMode === TYPEOF.STRING ?
            publication.currentMode :
            null,
        publicationReasonCode:
          typeof publication.reasonCode === TYPEOF.STRING ?
            publication.reasonCode :
            null,
        membershipPublicationStatus:
          typeof context.membershipPublication?.status === TYPEOF.STRING ?
            context.membershipPublication.status :
            null,
        priorityControlPlaneRecoveryActive:
          priorityControlPlaneRecovery.active === true,
        priorityControlPlaneRecoveryReasonCodes:
          Array.isArray(priorityControlPlaneRecovery.reasonCodes) ?
            Object.freeze([...priorityControlPlaneRecovery.reasonCodes]) :
            Object.freeze([]),
      }),
    });
  }

  async getMembershipPublicationDiagnostics(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    const readOptions = this.membershipPublicationReadOptions;
    let row = null;
    if (typeof service.getLatestPublicationForNode === TYPEOF.FUNCTION) {
      row = await service.getLatestPublicationForNode(
        nodeId,
        readOptions,
      );
    } else if (typeof service.getLatestClusterPublication === TYPEOF.FUNCTION) {
      row = await service.getLatestClusterPublication(
        readOptions,
      );
    }
    row = await this.refreshStalePriorityPartitionSummary(
      row,
      readOptions,
    );
    return this.buildMembershipPublicationDiagnostics(row, observedAt);
  }

  getMembershipPublicationDiagnosticsSync(nodeId, observedAt) {
    const service = this.membershipPublicationService;
    if (!service || typeof service !== TYPEOF.OBJECT) {
      return null;
    }
    const readOptions = this.membershipPublicationReadOptions;
    let row = null;
    if (typeof service.getLatestPublicationForNodeSync === TYPEOF.FUNCTION) {
      row = service.getLatestPublicationForNodeSync(nodeId, readOptions);
    } else if (typeof service.getLatestClusterPublicationSync === TYPEOF.FUNCTION) {
      row = service.getLatestClusterPublicationSync(readOptions);
    }
    return this.buildMembershipPublicationDiagnostics(row, observedAt);
  }

  async getMembershipPublicationPlanningSnapshot(nodeId, observedAt) {
    const membershipPublication = await this.getMembershipPublicationDiagnostics(
      nodeId,
      observedAt,
    );
    return this.buildMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
    });
  }

  getMembershipPublicationPlanningSnapshotSync(nodeId, observedAt) {
    const membershipPublication = this.getMembershipPublicationDiagnosticsSync(
      nodeId,
      observedAt,
    );
    return this.buildMembershipPublicationPlanningSnapshot({
      nodeId,
      observedAt,
      membershipPublication,
    });
  }

  async refreshStalePriorityPartitionSummary(row, readOptions) {
    const service = this.membershipPublicationService;
    if (!row || typeof row !== TYPEOF.OBJECT ||
        !service || typeof service !== TYPEOF.OBJECT ||
        typeof service.reconcileClusterMembership !== TYPEOF.FUNCTION) {
      return row;
    }
    const status = String(row.status || '').toUpperCase();
    const priorityPartitionSummary =
      row.priorityPartitionSummary ?? row.priority_partition_summary ?? null;
    if (status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
        !priorityPartitionSummary ||
        typeof priorityPartitionSummary !== TYPEOF.OBJECT ||
        priorityPartitionSummary.satisfied !== false) {
      return row;
    }
    const reconcileResult = await service.reconcileClusterMembership({
      ...(readOptions || {}),
      latestPublicationRow: row,
      latestPublishedPublicationRow: row,
    });
    return reconcileResult?.publicationRow || row;
  }

  buildMembershipPublicationDiagnostics(row, observedAt) {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return null;
    }

    const publicationEpoch = Number(
      row.publicationEpoch ?? row.publication_epoch,
    );
    const sourceSnapshotVersion = Number(
      row.sourceSnapshotVersion ?? row.source_snapshot_version,
    );
    const publishedActiveNodeIdsPresent = Array.isArray(
      row.publishedActiveNodeIds ?? row.published_active_node_ids,
    );
    const createdAt = normalizeDiagnosticTimestampMs(
      row.createdAt ?? row.created_at ?? observedAt,
    );
    const updatedAt = normalizeDiagnosticTimestampMs(
      row.updatedAt ?? row.updated_at ?? createdAt,
    );
    const priorityPartitionSummary =
      row.priorityPartitionSummary ?? row.priority_partition_summary ?? null;
    return Object.freeze({
      publicationEpoch: Number.isFinite(publicationEpoch) ? publicationEpoch : null,
      sourceSnapshotVersion:
        Number.isFinite(sourceSnapshotVersion) ? sourceSnapshotVersion : null,
      status: typeof row.status === TYPEOF.STRING ? row.status : null,
      publishedActiveNodeIdsPresent,
      publishedActiveNodeIds: publishedActiveNodeIdsPresent ?
        Object.freeze([
          ...(row.publishedActiveNodeIds ?? row.published_active_node_ids),
        ]) :
        Object.freeze([]),
      requiredAckNodeIds: Array.isArray(
        row.requiredAckNodeIds ?? row.required_ack_node_ids,
      ) ?
        Object.freeze([
          ...(row.requiredAckNodeIds ?? row.required_ack_node_ids),
        ]) :
        Object.freeze([]),
      acknowledgedNodeIds: Array.isArray(
        row.acknowledgedNodeIds ?? row.acknowledged_node_ids,
      ) ?
        Object.freeze([
          ...(row.acknowledgedNodeIds ?? row.acknowledged_node_ids),
        ]) :
        Object.freeze([]),
      priorityPartitionSummary:
        priorityPartitionSummary && typeof priorityPartitionSummary === TYPEOF.OBJECT ?
          Object.freeze({...priorityPartitionSummary}) :
          null,
      membershipLifecycleSummary:
        row.membershipLifecycleSummary &&
        typeof row.membershipLifecycleSummary === TYPEOF.OBJECT ?
          Object.freeze({...row.membershipLifecycleSummary}) :
          row.membership_lifecycle_summary &&
          typeof row.membership_lifecycle_summary === TYPEOF.OBJECT ?
            Object.freeze({...row.membership_lifecycle_summary}) :
            null,
      createdAt,
      updatedAt,
    });
  }

  buildMembershipPublicationPlanningSnapshot(context = {}) {
    const membershipPublication =
      context.membershipPublication &&
      typeof context.membershipPublication === TYPEOF.OBJECT ?
        context.membershipPublication :
        null;
    if (!membershipPublication) {
      return null;
    }

    const publicationEpoch = Number(membershipPublication.publicationEpoch);
    const publicationStatus =
      typeof membershipPublication.status === TYPEOF.STRING ?
        membershipPublication.status :
        null;
    const publicationStatusNormalized = publicationStatus ?
      String(publicationStatus).toUpperCase() :
      '';
    const publishedActiveNodeIds = normalizeNodeIdList(
      membershipPublication.publishedActiveNodeIds,
    );
    const publishedActiveNodeIdsPresent =
      membershipPublication.publishedActiveNodeIdsPresent === true ||
      Array.isArray(membershipPublication.publishedActiveNodeIds);
    const targetNodeId =
      typeof context.nodeId === TYPEOF.STRING ?
        String(context.nodeId).trim() :
        '';
    const priorityPartitionSummary =
      membershipPublication.priorityPartitionSummary &&
      typeof membershipPublication.priorityPartitionSummary === TYPEOF.OBJECT ?
        membershipPublication.priorityPartitionSummary :
        null;
    const publicationPending = publicationStatusNormalized.length > NUM.ZERO &&
      publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
    const publicationExcludesTargetNode = publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
      publishedActiveNodeIdsPresent &&
      targetNodeId.length > NUM.ZERO &&
      !publishedActiveNodeIds.includes(targetNodeId);
    const priorityRecoveryReasonCodes = [];
    if (publicationPending || publicationExcludesTargetNode) {
      priorityRecoveryReasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      );
    }
    if (priorityPartitionSummary?.satisfied === false) {
      priorityRecoveryReasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      );
    }
    const dedupedReasonCodes = Object.freeze([...new Set(
      priorityRecoveryReasonCodes,
    )]);
    const publishedPlanningEpoch = publicationStatusNormalized ===
      CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
      Number.isInteger(publicationEpoch) ?
      publicationEpoch :
      null;
    let publishedMembershipIncludesTargetNode = null;
    if (publicationStatusNormalized ===
        CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
        targetNodeId.length > NUM.ZERO) {
      publishedMembershipIncludesTargetNode =
        !publicationExcludesTargetNode;
    }

    return Object.freeze({
      publicationEpoch: Number.isFinite(publicationEpoch) ? publicationEpoch : null,
      publicationStatus,
      publicationStatusNormalized,
      publishedActiveNodeIdsPresent,
      publishedActiveNodeIds: Object.freeze([...publishedActiveNodeIds]),
      priorityPartitionSummary:
        priorityPartitionSummary && typeof priorityPartitionSummary === TYPEOF.OBJECT ?
          Object.freeze({...priorityPartitionSummary}) :
          null,
      targetNodeId: targetNodeId || null,
      publicationPending,
      publicationExcludesTargetNode,
      publishedMembershipIncludesTargetNode,
      publishedPlanningEpoch,
      priorityRecoveryActive: dedupedReasonCodes.length > NUM.ZERO,
      priorityRecoveryReasonCodes: dedupedReasonCodes,
    });
  }

  getCapacitySnapshotSync(nodeId, _nodeRow) {
    if (this.storageAccountingService &&
        typeof this.storageAccountingService.getCapacitySnapshotForNodeSync ===
          TYPEOF.FUNCTION) {
      return this.storageAccountingService.getCapacitySnapshotForNodeSync(nodeId);
    }

    return null;
  }

  getPriorityControlPlaneRecoveryState(context = {}) {
    const dimensions = context.dimensions && typeof context.dimensions === TYPEOF.OBJECT ?
      context.dimensions :
      {};
    const membershipPublication =
      context.membershipPublication &&
      typeof context.membershipPublication === TYPEOF.OBJECT ?
        context.membershipPublication :
        null;
    const planningSnapshot = this.buildMembershipPublicationPlanningSnapshot({
      nodeId: context.nodeId,
      observedAt: context.observedAt,
      membershipPublication,
    });
    const priorityPartitionSummary =
      planningSnapshot?.priorityPartitionSummary || null;
    const reasonCodes = Array.isArray(
      planningSnapshot?.priorityRecoveryReasonCodes,
    ) ?
      [...planningSnapshot.priorityRecoveryReasonCodes] :
      [];
    if (dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
    ] !== true) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
      );
    }
    const publicationPendingReasonCodePresent = reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
    );
    const controlPlaneNotWritable = reasonCodes.includes(
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
    );
    if (dimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] !== true &&
      !publicationPendingReasonCodePresent &&
      !controlPlaneNotWritable) {
      reasonCodes.push(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.RECOVERY_ELIGIBILITY_PENDING,
      );
    }

    const dedupedReasonCodes = Object.freeze([...new Set(reasonCodes)]);
    const enteredAt = membershipPublication?.createdAt ||
      membershipPublication?.updatedAt ||
      normalizeDiagnosticTimestampMs(context.observedAt) ||
      this.now();

    return Object.freeze({
      active: dedupedReasonCodes.length > NUM.ZERO,
      reasonCodes: dedupedReasonCodes,
      publicationEpoch: planningSnapshot?.publicationEpoch ??
        membershipPublication?.publicationEpoch ??
        null,
      publicationStatus: planningSnapshot?.publicationStatus ??
        (membershipPublication?.status || null),
      priorityPartitionSummary,
      enteredAt,
    });
  }

  /**
   * Return true when the local node already has stronger self-owned readiness
   * evidence than an immediate authoritative repair would provide.
   *
   * The local node's active status plus locally hosted control-plane services
   * are sufficient to keep self admission open while CDC catches up. Forcing a
   * synchronous read-your-own-write round-trip to the seed on every stale local
   * heartbeat only recreates the chokepoint we are trying to avoid.
   *
   * @param {Object} context
   * @param {string|null} context.nodeId
   * @param {Object|null} context.nodeRow
   * @param {Object[]} context.serviceRows
   * @return {boolean}
   * @private
   */
  shouldPreferLocalSelfNodeEvidence(context = {}) {
    const nodeId = context?.nodeId || null;
    if (!nodeId || nodeId !== this.nodeId) {
      return false;
    }

    const nodeRow = context?.nodeRow || null;
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return false;
    }

    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();
    if (status !== SERVICE_STATUS.ACTIVE) {
      return false;
    }

    const serviceRows = Array.isArray(context?.serviceRows) ?
      context.serviceRows :
      [];
    return this.hasRoutableService(serviceRows) &&
      this.hasWritableControlPlaneService(serviceRows);
  }

  async readNodeRow(nodeId, options = {}) {
    if (Array.isArray(options.allNodeRows)) {
      return options.allNodeRows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
        null;
    }
    if (options.allowAuthoritativeRefresh === true &&
        this.nodesOwner &&
        typeof this.nodesOwner.getNode === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.getNode(nodeId, options);
      return result?.rows?.[0] || null;
    }
    if (this.nodesOwner &&
        typeof this.nodesOwner.getNodeFromCache === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.getNodeFromCache(nodeId, options);
      return result?.rows?.[0] || null;
    }
    return this.getNodeRow(nodeId);
  }

  async readNodeRows(options = {}) {
    if (options.allowAuthoritativeRefresh === true &&
        this.nodesOwner &&
        typeof this.nodesOwner.listNodes === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.listNodes(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (this.nodesOwner &&
        typeof this.nodesOwner.listNodesFromCache === TYPEOF.FUNCTION) {
      const result = await this.nodesOwner.listNodesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeRows();
  }

  async readNodeServiceRows(nodeId, options = {}) {
    if (Array.isArray(options.allServiceRows)) {
      return options.allServiceRows.filter((row) => row?.[COLUMN.NODE_ID] === nodeId);
    }
    if (options.allowAuthoritativeRefresh === true &&
        this.servicesOwner &&
        typeof this.servicesOwner.listServices === TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ?
        result.rows.filter((row) => row?.[COLUMN.NODE_ID] === nodeId) :
        [];
    }
    if (this.servicesOwner &&
        typeof this.servicesOwner.listServicesForNodeFromCache ===
          TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServicesForNodeFromCache(
        nodeId,
        options,
      );
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeServiceRows(nodeId);
  }

  async readAllNodeServiceRows(options = {}) {
    if (options.allowAuthoritativeRefresh === true &&
        this.servicesOwner &&
        typeof this.servicesOwner.listServices === TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (this.servicesOwner &&
        typeof this.servicesOwner.listServicesFromCache === TYPEOF.FUNCTION) {
      const result = await this.servicesOwner.listServicesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES) || [];
  }

  /**
   * Resolve one node row from cache.
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getNodeRow(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }
    if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {
      return this.systemTableCache.get(TABLES.NODES, nodeId) || null;
    }

    return this.getNodeRows().find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
      null;
  }

  /**
   * Resolve all node rows from cache.
   * @return {Object[]}
   * @private
   */
  getNodeRows() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.NODES);
  }

  /**
   * Resolve service rows for one node.
   * @param {string} nodeId
   * @return {Object[]}
   * @private
   */
  getNodeServiceRows(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }
    if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {
      return this.systemTableCache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.NODE_ID] === nodeId;
      });
    }
    if (typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES).filter((row) => {
      return row?.[COLUMN.NODE_ID] === nodeId;
    });
  }

  /**
   * Resolve the canonical lifecycle state for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {string|null}
   * @private
   */
  getLifecycleState(nodeId, nodeRow) {
    if (nodeId === this.nodeId &&
        this.nodeLifecycleStateMachine &&
        typeof this.nodeLifecycleStateMachine.getState === TYPEOF.FUNCTION) {
      return this.nodeLifecycleStateMachine.getState();
    }
    return nodeRow?.[COLUMN.STATUS] || null;
  }

  /**
   * Resolve the storage snapshot for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Promise<Object|null>}
   * @private
   */
  async getCapacitySnapshot(nodeId, _nodeRow) {
    if (this.storageAccountingService &&
        typeof this.storageAccountingService.getCapacitySnapshotForNode ===
          TYPEOF.FUNCTION) {
      return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
    }

    if (!this.loggedMissingStorageAccountingOwner) {
      this.loggedMissingStorageAccountingOwner = true;
      this.logMissingOwner(
        'ControlPlaneReadinessService missing storage accounting owner',
        CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.STORAGE_ACCOUNTING_OWNER_REQUIRED);
    }

    return null;
  }

  /**
   * Return true when the node has at least one active addressed service.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasRoutableService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    if (!serviceRows.some((serviceRow) => {
      return typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    })) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
        SERVICE_STATUS.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
  }

  /**
   * Return true when the node has an active message-group control-plane path.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasWritableControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    if (this.hasActiveAddressedMessageGroupService(serviceRows)) {
      return true;
    }
    return this.hasStartupControlPlaneWriteGrace(serviceRows);
  }

  hasServeEligibleControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    return this.hasActiveAddressedMessageGroupService(serviceRows);
  }

  hasActiveAddressedMessageGroupService(serviceRows) {
    return serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
  }

  hasStartupControlPlaneWriteGrace(serviceRows) {
    const messageGroupRows = serviceRows.filter((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (messageGroupRows.length === NUM.ZERO) {
      return false;
    }

    const hasStoppedMessageGroupRow = messageGroupRows.some((serviceRow) => {
      return String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
        SERVICE_STATUS.STOPPED &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
    if (!hasStoppedMessageGroupRow) {
      return false;
    }

    return serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
  }

  /**
   * Return true when node resource usage is below the blocking threshold.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isLoadReady(nodeRow) {
    const loadValues = [
      Number(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]),
    ];

    return loadValues.every((value) => {
      return !Number.isFinite(value) ||
        value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
    });
  }

  /**
   * Return true when storage state permits placement.
   * @param {Object|null} capacity
   * @return {boolean}
   * @private
   */
  isCapacityPlacementEligible(capacity) {
    if (!capacity) {
      return false;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
      return false;
    }
    return !CONTROL_PLANE_READINESS_DEFAULT
      .PLACEMENT_BLOCKING_PRESSURE_STATES.includes(
        String(capacity.pressureState || ''),
      );
  }

  /**
   * Map storage state to a stable readiness reason code.
   * @param {Object|null} capacity
   * @return {string|null}
   * @private
   */
  getCapacityReasonCode(capacity) {
    if (!capacity) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (capacity.pressureState === PRESSURE_STATE.HARD) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD;
    }
    if (capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED;
    }
    return null;
  }

  /**
   * Build structured diagnostics for one cluster-member-health miss.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Object}
   * @private
   */
  buildClusterMemberHealthDetails(nodeId, nodeRow) {
    const now = this.now();
    const transportState = this.getNodeTransportState(nodeId, nodeRow);
    const localQueryTransport = this.getLocalQueryTransportEvidence(nodeId);
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    const readyLeaseExpiresAt = Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]);
    const heartbeatAgeMs = Number.isFinite(lastHeartbeat) ?
      now - lastHeartbeat :
      null;
    const readyLeaseAgeMs = Number.isFinite(readyLeaseExpiresAt) ?
      now - readyLeaseExpiresAt :
      null;
    const status = String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase();

    return Object.freeze({
      status: status.length > NUM.ZERO ? status : null,
      rowConnectionState: transportState.rowState,
      routerConnectionState: transportState.routerState,
      transportConnected: transportState.connected,
      localQueryTransportState: localQueryTransport?.state || null,
      localQueryTransportReady:
        typeof localQueryTransport?.ready === 'boolean' ?
          localQueryTransport.ready :
          null,
      localQueryTransportReason: localQueryTransport?.reason || null,
      localQueryTransportRetryAfterMs:
        Number.isFinite(localQueryTransport?.retryAfterMs) ?
          localQueryTransport.retryAfterMs :
          null,
      lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
      heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
      readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ?
        readyLeaseExpiresAt :
        null,
      readyLeaseAgeMs: Number.isFinite(readyLeaseAgeMs) ? readyLeaseAgeMs : null,
      staleHeartbeatLimitMs: this.clusterMemberStaleHeartbeatMaxAgeMs,
      readyNow: isNodeRecordReady(nodeRow, {now}),
      readyWhenWritten: wasNodeRecordReadyWhenWritten(nodeRow, {now}),
    });
  }

  /**
   * Resolve bounded local query/data-plane transport evidence for self-node
   * readiness diagnostics.
   * @param {string} nodeId
   * @return {{state:string,ready:boolean|null,reason:string|null,retryAfterMs:number|null}|null}
   * @private
   */
  getLocalQueryTransportEvidence(nodeId) {
    if (nodeId !== this.nodeId) {
      return null;
    }
    if (!this.messageRouter ||
        typeof this.messageRouter.getQueryDataPlaneTransportReadiness !==
          TYPEOF.FUNCTION) {
      return normalizeLocalQueryTransportEvidence(null);
    }
    return normalizeLocalQueryTransportEvidence(
      this.messageRouter.getQueryDataPlaneTransportReadiness(),
    );
  }

  /**
   * Resolve transport connectivity evidence from row and live router state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {{connected:boolean,rowState:string|null,routerState:string|null}}
   * @private
   */
  getNodeTransportState(nodeId, nodeRow) {
    let routerState = null;
    if (nodeId &&
        this.messageRouter &&
        typeof this.messageRouter.getConnectionState === TYPEOF.FUNCTION) {
      routerState = String(
        this.messageRouter.getConnectionState(nodeId) || '',
      ).toLowerCase();
    }

    const rowStateRaw = String(nodeRow?.[COLUMN.CONNECTION_STATE] || '')
      .toLowerCase();
    const normalizedRowState = rowStateRaw.length > NUM.ZERO ?
      rowStateRaw :
      null;
    const normalizedRouterState =
      typeof routerState === TYPEOF.STRING && routerState.length > NUM.ZERO ?
        routerState :
        null;

    let connected = false;
    if (normalizedRouterState === STATE.DISCONNECTED) {
      connected = false;
    } else if (
      normalizedRouterState === STATE.CONNECTED ||
      normalizedRouterState === STATE.READY
    ) {
      connected = true;
    } else {
      connected = normalizedRowState === STATE.CONNECTED ||
        normalizedRowState === STATE.READY;
    }

    return Object.freeze({
      connected,
      rowState: normalizedRowState,
      routerState: normalizedRouterState,
    });
  }

  /**
   * Return true when a node row encodes a transport-connected state.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isNodeTransportConnected(nodeId, nodeRow) {
    return this.getNodeTransportState(nodeId, nodeRow).connected;
  }

  /**
   * Return true when heartbeat evidence is recent enough for stale-lease grace.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isRecentHeartbeat(nodeRow) {
    const lastHeartbeat = Number(nodeRow?.[COLUMN.LAST_HEARTBEAT]);
    if (!Number.isFinite(lastHeartbeat)) {
      return false;
    }
    return (this.now() - lastHeartbeat) <=
      this.clusterMemberStaleHeartbeatMaxAgeMs;
  }

  /**
   * Evaluate cluster membership health using canonical readiness row data and
   * live transport connectivity when available.
   *
   * Node rows with valid leases are healthy. Rows that were ready when written
   * remain healthy through short cache-propagation lag as long as transport is
   * connected and heartbeat evidence is still fresh.
   *
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isClusterMemberHealthy(nodeId, nodeRow) {
    const hasLeaseField = Number.isFinite(Number(
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT],
    ));
    const hasStatusField = typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
      nodeRow[COLUMN.STATUS].length > NUM.ZERO;

    if (!hasLeaseField && !hasStatusField) {
      return !!nodeRow;
    }

    const now = this.now();
    if (isNodeRecordReady(nodeRow, {now})) {
      return true;
    }

    const statusActive =
      String(nodeRow?.[COLUMN.STATUS] || '').toLowerCase() ===
        SERVICE_STATUS.ACTIVE;

    if (!statusActive) {
      return false;
    }

    if (nodeId !== this.nodeId &&
        isNodeReadyLeaseExplicitlyCleared(nodeRow)) {
      return false;
    }

    // §1.4.12 self-node fast path: a running node evaluating its own
    // cluster membership is trivially healthy — it is alive and
    // executing this check. This is the strongest possible signal,
    // stronger than any cache lease or transport evidence. Without
    // this, CDC propagation delays during topology changes (splits,
    // rebalance) cause the local cache lease to expire before the
    // heartbeat CDC event propagates back, leading to self-denial
    // of load-lane admission.
    if (nodeId === this.nodeId) {
      return true;
    }

    if (!this.isNodeTransportConnected(nodeId, nodeRow)) {
      return false;
    }

    return false;
  }

  /**
   * Build a compact snapshot summary suitable for persistence
   * alongside admission, dispatch, and progression decisions.
   *
   * Extracts only the key fields needed for diagnostics linkage
   * without the full verbose snapshot (publication details, capacity
   * breakdown, etc.).
   *
   * @param {Object|null} snapshot - Frozen readiness snapshot from
   *   getNodeReadiness / getNodeReadinessSync.
   * @param {string|null} [decisionDimension] - Canonical dimension used by
   *   the caller when evaluating this snapshot.
   * @return {Object|null} Compact frozen summary or null.
   */
  static compactSnapshotSummary(snapshot, decisionDimension = null) {
    return compactEligibilitySnapshot(snapshot, decisionDimension);
  }
}

export {ControlPlaneReadinessService};
