import {createAdminControlSnapshotPublicationConvergenceDiagnosticsMethods} from
  './admin-control-snapshot-publication-convergence-diagnostics.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOSS_ACCOUNTING_PROP = 'lossAccounting';
const METHOD_GET_LOSS_ACCOUNTING = 'getLossAccounting';
const METHOD_GET_PARTICIPATION_LEDGER_LOSS_ACCOUNTING =
  'getParticipationDecisionLedgerLossAccounting';
const METHOD_GET_PARTICIPATION_LOSS_ACCOUNTING =
  'getParticipationDecisionLossAccounting';
const METHOD_GET_REPAIR_LEDGER_LOSS_ACCOUNTING =
  'getAuthoritativeReadinessRepairLedgerLossAccounting';
const METHOD_GET_REPAIR_LOSS_ACCOUNTING =
  'getAuthoritativeReadinessRepairLossAccounting';
const METHOD_GET_OPERATION_LEDGER_LOSS_ACCOUNTING =
  'getControlPlaneOperationLedgerLossAccounting';
const METHOD_GET_OPERATION_LOSS_ACCOUNTING =
  'getControlPlaneOperationLossAccounting';
const ZERO_LOSS_ACCOUNTING = Object.freeze({
  evictedKeys: 0,
  overwrittenEntries: 0,
  droppedSamples: 0,
  truncatedStrings: 0,
  truncatedArrays: 0,
  truncatedObjects: 0,
  totalLossEvents: 0,
});

function toNonNegativeLossCount(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function isFrozenLossAccountingSnapshot(candidate) {
  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      Object.isFrozen(candidate) &&
      Number.isInteger(candidate.evictedKeys) &&
      Number.isInteger(candidate.overwrittenEntries) &&
      Number.isInteger(candidate.droppedSamples) &&
      Number.isInteger(candidate.truncatedStrings) &&
      Number.isInteger(candidate.truncatedArrays) &&
      Number.isInteger(candidate.truncatedObjects) &&
      Number.isInteger(candidate.totalLossEvents),
  );
}

function normalizeLossAccounting(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  if (isFrozenLossAccountingSnapshot(candidate)) {
    return candidate;
  }
  const evictedKeys = toNonNegativeLossCount(candidate.evictedKeys);
  const overwrittenEntries = toNonNegativeLossCount(
    candidate.overwrittenEntries,
  );
  const droppedSamples = toNonNegativeLossCount(candidate.droppedSamples);
  const truncatedStrings = toNonNegativeLossCount(candidate.truncatedStrings);
  const truncatedArrays = toNonNegativeLossCount(candidate.truncatedArrays);
  const truncatedObjects = toNonNegativeLossCount(candidate.truncatedObjects);
  const totalLossEvents =
    evictedKeys +
    overwrittenEntries +
    droppedSamples +
    truncatedStrings +
    truncatedArrays +
    truncatedObjects;
  return Object.freeze({
    evictedKeys,
    overwrittenEntries,
    droppedSamples,
    truncatedStrings,
    truncatedArrays,
    truncatedObjects,
    totalLossEvents,
  });
}

function invokeLossAccountingGetter(owner, methodName) {
  const fn = owner?.[methodName];
  if (typeof fn !== 'function') {
    return null;
  }
  try {
    return normalizeLossAccounting(fn.call(owner));
  } catch (_error) {
    return null;
  }
}

function resolveFirstLossAccounting(candidates = []) {
  for (const candidate of candidates) {
    const normalized = normalizeLossAccounting(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function combineLossAccountingSnapshots({
  participationDecisions,
  authoritativeReadinessRepairs,
  controlPlaneOperations,
}) {
  const uniqueSnapshots = new Set(
    [
      participationDecisions,
      authoritativeReadinessRepairs,
      controlPlaneOperations,
    ].filter(Boolean),
  );
  const totals = {
    evictedKeys: 0,
    overwrittenEntries: 0,
    droppedSamples: 0,
    truncatedStrings: 0,
    truncatedArrays: 0,
    truncatedObjects: 0,
  };
  for (const snapshot of uniqueSnapshots) {
    totals.evictedKeys += toNonNegativeLossCount(snapshot.evictedKeys);
    totals.overwrittenEntries += toNonNegativeLossCount(
      snapshot.overwrittenEntries,
    );
    totals.droppedSamples += toNonNegativeLossCount(snapshot.droppedSamples);
    totals.truncatedStrings += toNonNegativeLossCount(
      snapshot.truncatedStrings,
    );
    totals.truncatedArrays += toNonNegativeLossCount(snapshot.truncatedArrays);
    totals.truncatedObjects += toNonNegativeLossCount(
      snapshot.truncatedObjects,
    );
  }
  const combined = normalizeLossAccounting(totals) || ZERO_LOSS_ACCOUNTING;
  const byLedger = Object.freeze({
    participationDecisions: participationDecisions || ZERO_LOSS_ACCOUNTING,
    authoritativeReadinessRepairs:
      authoritativeReadinessRepairs || ZERO_LOSS_ACCOUNTING,
    controlPlaneOperations: controlPlaneOperations || ZERO_LOSS_ACCOUNTING,
  });
  const result = {...combined};
  Object.defineProperties(result, {
    byLedger: {value: byLedger, enumerable: false},
    participationDecisions: {
      value: byLedger.participationDecisions,
      enumerable: false,
    },
    authoritativeReadinessRepairs: {
      value: byLedger.authoritativeReadinessRepairs,
      enumerable: false,
    },
    controlPlaneOperations: {
      value: byLedger.controlPlaneOperations,
      enumerable: false,
    },
  });
  return Object.freeze(result);
}

function assignAdminControlSnapshotReadinessDiagnosticsMethods(
  AdminControlSnapshot,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_CONTROL_SNAPSHOT_LITERAL,
    COLUMN,
    CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
    CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD,
    CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD,
    CONTROL_PLANE_READINESS_DIMENSION,
    MANAGED_SPLIT_WORKFLOW_TYPE,
    PARTITION_TRANSITION_METADATA_FIELD,
    TYPEOF,
    buildCanonicalPublicationRecoveryEvidence,
    buildPublicationRecoveryProtocolSnapshot,
    firstStringField,
    uniqueSorted,
  } = options;
  const publicationConvergenceDiagnosticsMethods =
    createAdminControlSnapshotPublicationConvergenceDiagnosticsMethods({
      ADMIN_CONTROL_SNAPSHOT_LITERAL,
      TYPEOF,
      buildPublicationRecoveryProtocolSnapshot,
    });
  const baseBuildControlPlaneDiagnosticsSnapshot =
    typeof AdminControlSnapshot?.prototype
      ?.buildControlPlaneDiagnosticsSnapshot === 'function' ?
      AdminControlSnapshot.prototype.buildControlPlaneDiagnosticsSnapshot :
      null;
  class AdminControlSnapshotReadinessDiagnosticsMethods {
    resolveCanonicalPublicationRecoveryEvidenceDiagnostics(
      readinessEntries = [],
      publicationConvergence = null,
      priorityRecoveryDecisionSnapshots = null,
      options = {},
    ) {
      let readinessPublicationRecoveryGate = null;
      let readinessPriorityControlPlaneRecovery = null;
      for (const readiness of Array.isArray(readinessEntries) ?
        readinessEntries :
        []) {
        const priorityControlPlaneRecovery =
          readiness?.priorityControlPlaneRecovery;
        if (
          !priorityControlPlaneRecovery ||
          typeof priorityControlPlaneRecovery !== 'object'
        ) {
          continue;
        }
        const publicationRecoveryGate =
          priorityControlPlaneRecovery.publicationRecoveryGate;
        if (
          !publicationRecoveryGate ||
          typeof publicationRecoveryGate !== 'object'
        ) {
          continue;
        }
        readinessPublicationRecoveryGate = publicationRecoveryGate;
        readinessPriorityControlPlaneRecovery = priorityControlPlaneRecovery;
        break;
      }
      const normalizedPublicationConvergence =
        publicationConvergence &&
        typeof publicationConvergence === 'object' ?
          publicationConvergence :
          null;
      if (
        !readinessPublicationRecoveryGate &&
        !normalizedPublicationConvergence &&
        !priorityRecoveryDecisionSnapshots
      ) {
        return Object.freeze({
          publicationConvergence: null,
          publicationConvergenceGate: null,
          priorityRecoveryObservation: null,
        });
      }
      const gateScopedEvidence = buildCanonicalPublicationRecoveryEvidence({
        publicationConvergence: normalizedPublicationConvergence,
        publicationConvergenceGate: readinessPublicationRecoveryGate,
        priorityRecoveryObservation:
          readinessPriorityControlPlaneRecovery?.priorityRecoveryObservation ||
          null,
        priorityRecoveryDecisionSnapshots:
          readinessPublicationRecoveryGate?.ready === true ?
            null :
            priorityRecoveryDecisionSnapshots,
        logsTable: options.logsTable || null,
        publicationActiveGateHandoff: options.publicationActiveGateHandoff,
      });
      if (!priorityRecoveryDecisionSnapshots) {
        return gateScopedEvidence;
      }
      return Object.freeze({
        publicationConvergence:
          gateScopedEvidence.publicationConvergence,
        publicationConvergenceGate:
          gateScopedEvidence.publicationConvergenceGate,
        priorityRecoveryObservation:
          buildCanonicalPublicationRecoveryEvidence({
            publicationConvergence:
              gateScopedEvidence.publicationConvergence ||
              normalizedPublicationConvergence,
            publicationConvergenceGate:
              gateScopedEvidence.publicationConvergenceGate,
            priorityRecoveryObservation:
              readinessPriorityControlPlaneRecovery
                ?.priorityRecoveryObservation ||
              null,
            priorityRecoveryDecisionSnapshots,
            logsTable: options.logsTable || null,
            publicationActiveGateHandoff: options.publicationActiveGateHandoff,
          }).priorityRecoveryObservation ||
          gateScopedEvidence.priorityRecoveryObservation,
      });
    }

    resolvePublicationConvergenceGateDiagnostics(
      readinessEntries = [],
      publicationConvergence = null,
      priorityRecoveryDecisionSnapshots = null,
    ) {
      return this.resolveCanonicalPublicationRecoveryEvidenceDiagnostics(
        readinessEntries,
        publicationConvergence,
        priorityRecoveryDecisionSnapshots,
      ).publicationConvergenceGate;
    }

    resolvePublicationConvergenceDiagnostics(
      readinessEntries = [],
      fallbackPublication = null,
      options = {},
    ) {
      return publicationConvergenceDiagnosticsMethods
        .resolvePublicationConvergenceDiagnostics(
          readinessEntries,
          fallbackPublication,
          options,
        );
    }
    resolvePriorityControlPlaneRecoveryByNodeId(readinessEntries = []) {
      const entries = {};
      for (const readiness of Array.isArray(readinessEntries) ?
        readinessEntries :
        []) {
        const nodeId = firstStringField(readiness, COLUMN.NODE_ID, 'nodeId');
        if (!nodeId) {
          continue;
        }
        const priorityControlPlaneRecovery =
          readiness?.priorityControlPlaneRecovery;
        if (
          !priorityControlPlaneRecovery ||
          typeof priorityControlPlaneRecovery !== 'object'
        ) {
          continue;
        }
        entries[nodeId] = priorityControlPlaneRecovery;
      }
      return entries;
    }
    /**
     * Resolve canonical readiness vectors when the owner is available.
     * @return {Promise<Array<Object>>}
     * @private
     */
    async resolveControlPlaneReadinessEntries(options = {}) {
      const readinessService = this.controlPlaneReadinessService || null;
      if (!readinessService) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      const allowStaleOnCacheChange = options.allowStaleOnCacheChange !== false;
      const allowAuthoritativeRefresh =
        options.allowAuthoritativeRefresh === true;
      const hasSyncResolution =
        typeof readinessService.getAllNodeReadinessSync === 'function';
      // The control-plane diagnostics snapshot is a read-only observability
      // probe (the harness quiescence/snapshot lane polls it). It must always
      // respond fast: the asynchronous getAllNodeReadiness() resolves each node
      // through the serialized readiness-evaluation lane, which queues behind
      // recovery work under control-plane pressure and blows the query budget.
      // Prefer the lane-free synchronous cache resolution first, mirroring the
      // sync-first pattern used by the membership-publication observations, and
      // only fall through to the authoritative async path when sync yields
      // nothing or an authoritative refresh was explicitly requested.
      if (!allowAuthoritativeRefresh && hasSyncResolution) {
        const syncReadiness = this.resolveControlPlaneReadinessEntriesSync({
          allowStaleOnCacheChange,
        });
        if (syncReadiness.length > 0) {
          return syncReadiness;
        }
      }
      if (
        typeof readinessService.getAllNodeReadiness !== 'function'
      ) {
        return hasSyncResolution ?
          this.resolveControlPlaneReadinessEntriesSync({
            allowStaleOnCacheChange,
          }) :
          ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const readiness = await readinessService.getAllNodeReadiness({
          allowAuthoritativeRefresh,
          allowStaleOnCacheChange,
          maxCachedAgeMs: this.readinessSnapshotCacheMaxAgeMs,
        });
        if (Array.isArray(readiness) && readiness.length > 0) {
          return readiness;
        }
      } catch (_error) {
        // Fall through to the lane-free sync resolution so the probe never
        // returns blank (which would mask convergence as a harness failure).
      }
      return hasSyncResolution ?
        this.resolveControlPlaneReadinessEntriesSync({
          allowStaleOnCacheChange,
        }) :
        ADMIN_CACHE_DUMP.EMPTY;
    }
    /**
     * Resolve readiness vectors from the lane-free synchronous cache path.
     * @param {Object} options
     * @return {Array<Object>}
     * @private
     */
    resolveControlPlaneReadinessEntriesSync(options = {}) {
      const readinessService = this.controlPlaneReadinessService || null;
      if (
        !readinessService ||
        typeof readinessService.getAllNodeReadinessSync !== 'function'
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const readiness = readinessService.getAllNodeReadinessSync({
          allowStaleOnCacheChange: options.allowStaleOnCacheChange !== false,
          maxCachedAgeMs: this.readinessSnapshotCacheMaxAgeMs,
        });
        return Array.isArray(readiness) ? readiness : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    /**
     * Build one placement-eligibility explanation from canonical readiness.
     * @param {Object} readiness
     * @return {Object}
     * @private
     */
    buildPlacementEligibilityExplanation(readiness) {
      const dimensions =
        readiness?.dimensions && typeof readiness.dimensions === 'object' ?
          readiness.dimensions :
          {};
      const reasons = Array.isArray(readiness?.reasons) ?
        readiness.reasons :
        ADMIN_CACHE_DUMP.EMPTY;
      return {
        nodeId: firstStringField(
          readiness,
          COLUMN.NODE_ID,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID,
        ),
        placementEligible:
          dimensions[CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE] ===
          true,
        failedDimensions: uniqueSorted(
          Object.entries(dimensions)
            .filter(([_dimension, value]) => value !== true)
            .map(([dimension]) => dimension),
        ),
        reasonCodes: uniqueSorted(
          reasons
            .map((reason) =>
              String(reason?.code || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE),
            )
            .filter(Boolean),
        ),
        reasons,
      };
    }
    /**
     * Resolve the current publication-mode diagnostics.
     * @param {Array<Object>} readinessEntries
     * @return {Object|null}
     * @private
     */
    resolvePublicationModeDiagnostics(readinessEntries = []) {
      for (const readiness of readinessEntries) {
        const publication = readiness?.publication;
        if (publication && typeof publication === 'object') {
          return publication;
        }
      }
      const publicationService =
        this.controlPlaneReadinessService?.cdcGroupPropagationService || null;
      if (
        publicationService &&
        typeof publicationService.getPublicationModeDiagnostics ===
          'function'
      ) {
        return publicationService.getPublicationModeDiagnostics();
      }
      return null;
    }
    /**
     * Resolve recent readiness transitions recorded by the canonical owner.
     * @return {Object}
     * @private
     */
    resolveReadinessTransitionHistory() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getReadinessTransitionHistoryByNodeId !== 'function'
      ) {
        return {};
      }
      try {
        const history =
          this.controlPlaneReadinessService.getReadinessTransitionHistoryByNodeId();
        return history && typeof history === 'object' ? history : {};
      } catch (_error) {
        return {};
      }
    }
    /**
     * Resolve recent canonical participation decisions.
     * @return {Object[]}
     * @private
     */
    resolveParticipationDecisionDiagnostics() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getParticipationDecisionLedgerEntries !== 'function'
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const entries =
          this.controlPlaneReadinessService.getParticipationDecisionLedgerEntries(
            {limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT},
          );
        return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    resolveParticipationDecisionAggregatedDiagnostics() {
      const fn =
        this.controlPlaneReadinessService
          ?.getParticipationDecisionLedgerAggregatedSummaries ||
        this.controlPlaneReadinessService
          ?.getParticipationDecisionAggregatedSummaries;
      if (typeof fn !== 'function') {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const summaries = fn.call(this.controlPlaneReadinessService, {
          limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
        });
        return Array.isArray(summaries) ? summaries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    /**
     * Resolve recent authoritative readiness repair attempts.
     * @return {Object[]}
     * @private
     */
    resolveAuthoritativeReadinessRepairDiagnostics() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getAuthoritativeReadinessRepairLedgerEntries !== 'function'
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const entries =
          this.controlPlaneReadinessService.getAuthoritativeReadinessRepairLedgerEntries(
            {limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT},
          );
        return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    resolveAuthoritativeReadinessRepairAggregatedDiagnostics() {
      const fn =
        this.controlPlaneReadinessService
          ?.getAuthoritativeReadinessRepairLedgerAggregatedSummaries ||
        this.controlPlaneReadinessService
          ?.getAuthoritativeReadinessRepairAggregatedSummaries;
      if (typeof fn !== 'function') {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const summaries = fn.call(this.controlPlaneReadinessService, {
          limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
        });
        return Array.isArray(summaries) ? summaries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    /**
     * Resolve bounded recovery epoch history by node.
     * @return {Object}
     * @private
     */
    resolveRecoveryEpochDiagnostics() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getRecoveryEpochHistoryByNodeId !== 'function'
      ) {
        return {};
      }
      try {
        const history =
          this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId();
        return history && typeof history === 'object' ? history : {};
      } catch (_error) {
        return {};
      }
    }
    /**
     * Resolve recent control-plane system-table operations.
     * @return {Object[]}
     * @private
     */
    resolveControlPlaneOperationDiagnostics() {
      if (
        !this.controlPlaneSystemTableGateway ||
        typeof this.controlPlaneSystemTableGateway
          .getControlPlaneOperationLedgerEntries !== 'function'
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const entries =
          this.controlPlaneSystemTableGateway.getControlPlaneOperationLedgerEntries(
            {limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT},
          );
        return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    resolveControlPlaneOperationAggregatedDiagnostics() {
      const fn =
        this.controlPlaneSystemTableGateway
          ?.getControlPlaneOperationLedgerAggregatedSummaries ||
        this.controlPlaneSystemTableGateway
          ?.getControlPlaneOperationAggregatedSummaries;
      if (typeof fn !== 'function') {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const summaries = fn.call(this.controlPlaneSystemTableGateway, {
          limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
        });
        return Array.isArray(summaries) ? summaries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    resolveParticipationDecisionLossAccounting(
      entries = null,
      summaries = null,
    ) {
      const service = this.controlPlaneReadinessService;
      const resolvedSummaries =
        summaries || this.resolveParticipationDecisionAggregatedDiagnostics();
      const resolvedEntries =
        entries || this.resolveParticipationDecisionDiagnostics();
      return (
        resolveFirstLossAccounting([
          invokeLossAccountingGetter(
            service,
            METHOD_GET_PARTICIPATION_LEDGER_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(
            service,
            METHOD_GET_PARTICIPATION_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(
            service?.participationDecisionLedger,
            METHOD_GET_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(service, METHOD_GET_LOSS_ACCOUNTING),
          resolvedSummaries?.[LOSS_ACCOUNTING_PROP],
          resolvedEntries?.[LOSS_ACCOUNTING_PROP],
        ]) || ZERO_LOSS_ACCOUNTING
      );
    }
    resolveAuthoritativeReadinessRepairLossAccounting(
      entries = null,
      summaries = null,
    ) {
      const service = this.controlPlaneReadinessService;
      const resolvedSummaries =
        summaries ||
        this.resolveAuthoritativeReadinessRepairAggregatedDiagnostics();
      const resolvedEntries =
        entries || this.resolveAuthoritativeReadinessRepairDiagnostics();
      return (
        resolveFirstLossAccounting([
          invokeLossAccountingGetter(
            service,
            METHOD_GET_REPAIR_LEDGER_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(
            service,
            METHOD_GET_REPAIR_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(
            service?.authoritativeNodeEvidenceReconciler?.repairLedger,
            METHOD_GET_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(
            service?.authoritativeReadinessRepairLedger,
            METHOD_GET_LOSS_ACCOUNTING,
          ),
          resolvedSummaries?.[LOSS_ACCOUNTING_PROP],
          resolvedEntries?.[LOSS_ACCOUNTING_PROP],
        ]) || ZERO_LOSS_ACCOUNTING
      );
    }
    resolveControlPlaneOperationLossAccounting(
      entries = null,
      summaries = null,
    ) {
      const gateway = this.controlPlaneSystemTableGateway;
      const resolvedSummaries =
        summaries || this.resolveControlPlaneOperationAggregatedDiagnostics();
      const resolvedEntries =
        entries || this.resolveControlPlaneOperationDiagnostics();
      return (
        resolveFirstLossAccounting([
          invokeLossAccountingGetter(
            gateway,
            METHOD_GET_OPERATION_LEDGER_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(
            gateway,
            METHOD_GET_OPERATION_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(
            gateway?.controlPlaneOperationLedger,
            METHOD_GET_LOSS_ACCOUNTING,
          ),
          invokeLossAccountingGetter(gateway, METHOD_GET_LOSS_ACCOUNTING),
          resolvedSummaries?.[LOSS_ACCOUNTING_PROP],
          resolvedEntries?.[LOSS_ACCOUNTING_PROP],
        ]) || ZERO_LOSS_ACCOUNTING
      );
    }
    resolveControlPlaneDiagnosticsLossAccounting(diagnostics = {}) {
      const participationDecisions =
        this.resolveParticipationDecisionLossAccounting(
          diagnostics.participationDecisions,
          diagnostics.participationDecisionSummaries,
        );
      const authoritativeReadinessRepairs =
        this.resolveAuthoritativeReadinessRepairLossAccounting(
          diagnostics.authoritativeReadinessRepairs,
          diagnostics.authoritativeReadinessRepairSummaries,
        );
      const controlPlaneOperations =
        this.resolveControlPlaneOperationLossAccounting(
          diagnostics.controlPlaneOperations,
          diagnostics.controlPlaneOperationSummaries,
        );
      return combineLossAccountingSnapshots({
        participationDecisions,
        authoritativeReadinessRepairs,
        controlPlaneOperations,
      });
    }
    resolveControlPlaneReadinessDiagnostics() {
      const participationDecisions =
        this.resolveParticipationDecisionDiagnostics();
      const participationDecisionSummaries =
        this.resolveParticipationDecisionAggregatedDiagnostics();
      const authoritativeReadinessRepairs =
        this.resolveAuthoritativeReadinessRepairDiagnostics();
      const authoritativeReadinessRepairSummaries =
        this.resolveAuthoritativeReadinessRepairAggregatedDiagnostics();
      const controlPlaneOperations =
        this.resolveControlPlaneOperationDiagnostics();
      const controlPlaneOperationSummaries =
        this.resolveControlPlaneOperationAggregatedDiagnostics();
      const lossAccounting = this.resolveControlPlaneDiagnosticsLossAccounting({
        participationDecisions,
        participationDecisionSummaries,
        authoritativeReadinessRepairs,
        authoritativeReadinessRepairSummaries,
        controlPlaneOperations,
        controlPlaneOperationSummaries,
      });
      const aggregatedSummaries = Object.freeze({
        participationDecisions: participationDecisionSummaries,
        authoritativeReadinessRepairs: authoritativeReadinessRepairSummaries,
        controlPlaneOperations: controlPlaneOperationSummaries,
      });
      return Object.freeze({
        participationDecisions,
        participationDecisionSummaries,
        authoritativeReadinessRepairs,
        authoritativeReadinessRepairSummaries,
        controlPlaneOperations,
        controlPlaneOperationSummaries,
        aggregatedSummaries,
        lossAccounting,
      });
    }
    async buildControlPlaneDiagnosticsSnapshot(options = {}) {
      const diagnostics =
        typeof baseBuildControlPlaneDiagnosticsSnapshot === 'function' ?
          await baseBuildControlPlaneDiagnosticsSnapshot.call(this, options) :
          {};
      const lossAccounting =
        this.resolveControlPlaneDiagnosticsLossAccounting(diagnostics);
      diagnostics[LOSS_ACCOUNTING_PROP] = lossAccounting;
      if (
        diagnostics.aggregatedDiagnostics &&
        typeof diagnostics.aggregatedDiagnostics === 'object'
      ) {
        Object.defineProperty(
          diagnostics.aggregatedDiagnostics,
          LOSS_ACCOUNTING_PROP,
          {
            value: lossAccounting,
            enumerable: false,
            configurable: true,
            writable: true,
          },
        );
      }
      return diagnostics;
    }
    async getControlSnapshot(options = {}) {
      return this.buildLocalControlSnapshot(options);
    }
    /**
     * Resolve heartbeat publication diagnostics from the local owner.
     * @return {Object|null}
     * @private
     */
    resolveHeartbeatPublicationDiagnostics() {
      if (
        this.controlPlaneReadinessService &&
        typeof this.controlPlaneReadinessService[
          CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD
        ] === 'function'
      ) {
        try {
          const publicationStory = this.controlPlaneReadinessService[
            CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD
          ](this.nodeId, this.nowFn());
          const nodeStatePublication =
            publicationStory?.[
              CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD
            ];
          if (
            nodeStatePublication &&
            typeof nodeStatePublication === 'object'
          ) {
            return nodeStatePublication;
          }
        } catch (_error) {
          void _error;
        }
      }
      if (
        !this.heartbeatService ||
        typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !==
          'function'
      ) {
        return null;
      }
      try {
        const diagnostics =
          this.heartbeatService.getHeartbeatPublicationDiagnostics();
        return diagnostics && typeof diagnostics === 'object' ?
          diagnostics :
          null;
      } catch (_error) {
        return null;
      }
    }
    /**
     * Resolve split-evaluation diagnostics from the canonical owner.
     * @return {Object|null}
     * @private
     */
    resolveSplitEvaluationDiagnostics() {
      const splitManager = this.sqlQueryEngine?.partitionSplitMergeManager;
      if (
        !splitManager ||
        typeof splitManager.getEvaluationDiagnostics !== 'function'
      ) {
        return null;
      }
      try {
        const diagnostics = splitManager.getEvaluationDiagnostics();
        return diagnostics && typeof diagnostics === 'object' ?
          diagnostics :
          null;
      } catch (_error) {
        return null;
      }
    }
    /**
     * Build persisted workflow-admission diagnostics from table metadata.
     * @param {Array<Object>} tableRows
     * @return {Object}
     * @private
     */
    buildWorkflowAdmissionDiagnostics(tableRows = []) {
      const workflowAdmissionsByWorkflowId = {};
      const timeoutClassifications = [];
      for (const tableRow of Array.isArray(tableRows) ? tableRows : []) {
        const workflow = this.buildWorkflowAdmissionEntry(tableRow);
        if (!workflow) {
          continue;
        }
        workflowAdmissionsByWorkflowId[workflow.workflowId] = workflow;
        if (
          workflow.timeoutClassification &&
          typeof workflow.timeoutClassification === 'object'
        ) {
          timeoutClassifications.push({
            workflowId: workflow.workflowId,
            workflowType: workflow.workflowType,
            tableId: workflow.tableId,
            tableName: workflow.tableName,
            transitionState: workflow.transitionState,
            timeoutClassification: workflow.timeoutClassification,
          });
        }
      }
      return {
        workflowAdmissionsByWorkflowId,
        timeoutClassifications,
      };
    }
    resolveWorkflowTransitionMetadataObject(metadata, field) {
      const entry = metadata?.[field];
      if (entry && typeof entry === 'object') {
        return entry;
      }
      return null;
    }
    resolveWorkflowTransitionArray(primaryEntries, fallbackEntries = null) {
      if (Array.isArray(primaryEntries)) {
        return primaryEntries;
      }
      if (Array.isArray(fallbackEntries)) {
        return fallbackEntries;
      }
      return ADMIN_CACHE_DUMP.EMPTY;
    }
    /**
     * Build one workflow-admission record from table transition metadata.
     * @param {Object} tableRow
     * @return {Object|null}
     * @private
     */
    buildWorkflowAdmissionEntry(tableRow) {
      const transitionState = firstStringField(
        tableRow,
        'partition_transition_state',
        'partitionTransitionState',
      );
      const metadata = this.parseWorkflowTransitionMetadata(tableRow);
      const workflowId = firstStringField(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID,
      );
      if (!transitionState || !metadata || !workflowId) {
        return null;
      }
      const admission = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.ADMISSION,
      );
      const failure = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.FAILURE,
      );
      const blockingReasons = Array.isArray(admission?.blockingReasons) ?
        admission.blockingReasons :
        ADMIN_CACHE_DUMP.EMPTY;
      const timeoutClassification = this.resolveWorkflowTransitionMetadataObject(
        failure,
        'timeoutClassification',
      );
      const retry = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.RETRY,
      );
      const topologySnapshot = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT,
      );
      return {
        workflowId,
        workflowType: MANAGED_SPLIT_WORKFLOW_TYPE,
        transitionState,
        tableId: firstStringField(
          tableRow,
          COLUMN.TABLE_ID,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.ID,
        ),
        tableName: firstStringField(
          tableRow,
          COLUMN.TABLE_NAME,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.NAME,
        ),
        sourcePartitionId: firstStringField(
          metadata,
          PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID,
        ),
        targetPartitionIds: this.resolveWorkflowTransitionArray(
          metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
        ),
        topologySnapshotCapturedAt: firstStringField(
          topologySnapshot,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.CAPTUREDAT,
        ),
        sourceLeaderNodeId: firstStringField(
          topologySnapshot,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.SOURCELEADERNODEID,
        ),
        candidateTargetNodeIds: this.resolveWorkflowTransitionArray(
          admission?.candidateTargetNodeIds,
          topologySnapshot?.candidateTargetNodeIds,
        ),
        sourceRoutableNodeIds: this.resolveWorkflowTransitionArray(
          admission?.sourceRoutableNodeIds,
          topologySnapshot?.sourceRoutableNodeIds,
        ),
        eligibleNodeIds: this.resolveWorkflowTransitionArray(
          admission?.eligibleNodeIds,
        ),
        ineligibleNodes: this.resolveWorkflowTransitionArray(
          admission?.ineligibleNodes,
        ),
        estimatedBytes: Number.isFinite(Number(admission?.estimatedBytes)) ?
          Number(admission.estimatedBytes) :
          null,
        admissionDecisionAt: firstStringField(
          admission,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.DECISIONTIMESTAMP,
        ),
        admission,
        blockingReasons,
        failure,
        failedAt: firstStringField(
          failure,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.FAILEDAT,
        ),
        nextAttemptAt: firstStringField(
          retry,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.NEXTATTEMPTAT,
        ),
        timeoutClassification,
      };
    }
    /**
     * Parse table transition metadata.
     * @param {Object} tableRow
     * @return {Object|null}
     * @private
     */
    parseWorkflowTransitionMetadata(tableRow) {
      const rawMetadata =
        tableRow?.partition_transition_metadata ??
        tableRow?.partitionTransitionMetadata ??
        null;
      if (!rawMetadata) {
        return null;
      }
      if (rawMetadata && typeof rawMetadata === 'object') {
        return rawMetadata;
      }
      if (typeof rawMetadata !== 'string') {
        return null;
      }
      try {
        const parsed = JSON.parse(rawMetadata);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (_error) {
        return null;
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    AdminControlSnapshotReadinessDiagnosticsMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminControlSnapshot.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminControlSnapshotReadinessDiagnosticsMethods.prototype,
        methodName,
      ),
    );
  }
}
export {assignAdminControlSnapshotReadinessDiagnosticsMethods};
