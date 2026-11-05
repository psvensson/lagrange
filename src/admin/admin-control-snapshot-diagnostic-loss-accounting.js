// Read-only projection of bounded diagnostic ledgers. This helper has no
// convergence, readiness, or operation-completion authority.

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

function resolveParticipationDecisionLossAccounting(
  owner,
  entries = null,
  summaries = null,
) {
  const service = owner.controlPlaneReadinessService;
  const resolvedSummaries =
    summaries || owner.resolveParticipationDecisionAggregatedDiagnostics();
  const resolvedEntries =
    entries || owner.resolveParticipationDecisionDiagnostics();
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
function resolveAuthoritativeReadinessRepairLossAccounting(
  owner,
  entries = null,
  summaries = null,
) {
  const service = owner.controlPlaneReadinessService;
  const resolvedSummaries =
    summaries ||
    owner.resolveAuthoritativeReadinessRepairAggregatedDiagnostics();
  const resolvedEntries =
    entries || owner.resolveAuthoritativeReadinessRepairDiagnostics();
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
function resolveControlPlaneOperationLossAccounting(
  owner,
  entries = null,
  summaries = null,
) {
  const gateway = owner.controlPlaneSystemTableGateway;
  const resolvedSummaries =
    summaries || owner.resolveControlPlaneOperationAggregatedDiagnostics();
  const resolvedEntries =
    entries || owner.resolveControlPlaneOperationDiagnostics();
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
function resolveControlPlaneDiagnosticsLossAccounting(owner, diagnostics = {}) {
  const participationDecisions =
    resolveParticipationDecisionLossAccounting(
      owner,
      diagnostics.participationDecisions,
      diagnostics.participationDecisionSummaries,
    );
  const authoritativeReadinessRepairs =
    resolveAuthoritativeReadinessRepairLossAccounting(
      owner,
      diagnostics.authoritativeReadinessRepairs,
      diagnostics.authoritativeReadinessRepairSummaries,
    );
  const controlPlaneOperations =
    resolveControlPlaneOperationLossAccounting(
      owner,
      diagnostics.controlPlaneOperations,
      diagnostics.controlPlaneOperationSummaries,
    );
  return combineLossAccountingSnapshots({
    participationDecisions,
    authoritativeReadinessRepairs,
    controlPlaneOperations,
  });
}

function attachControlPlaneDiagnosticsLossAccounting(owner, diagnostics) {
  const lossAccounting =
    resolveControlPlaneDiagnosticsLossAccounting(owner, diagnostics);
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

export {attachControlPlaneDiagnosticsLossAccounting,
  resolveControlPlaneDiagnosticsLossAccounting};
