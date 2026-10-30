import {performance} from 'node:perf_hooks';

const MAX_RETAINED_BREAKDOWNS = 256;
const ZERO = 0;
const ONE = 1;
const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';
const OUTCOME_ACTIVE = 'ACTIVE';
const FIELD_TOTAL_MS = 'totalMs';
const FIELD_BEGIN_MS = 'beginMs';
const FIELD_STATEMENTS_MS = 'statementsMs';
const FIELD_PREPARE_PHASE_MS = 'preparePhaseMs';
const FIELD_DECISION_PERSIST_MS = 'decisionPersistMs';
const FIELD_COMMIT_PHASE_MS = 'commitPhaseMs';
const FIELD_METADATA_MUTATIONS = 'metadataMutations';
const FIELD_METADATA_READS = 'metadataReads';

function resolveNowMs() {
  return performance.now();
}

function createTransactionTelemetry(transactionId, sessionId) {
  return {
    transactionId,
    sessionId,
    startedAtMs: resolveNowMs(),
    beginMs: ZERO,
    statementsMs: ZERO,
    preparePhaseMs: ZERO,
    decisionPersistMs: ZERO,
    commitPhaseMs: ZERO,
    rollbackPhaseMs: ZERO,
    totalMs: ZERO,
    metadataMutations: ZERO,
    metadataReads: ZERO,
    participantCount: ZERO,
    prepareConcurrency: ZERO,
    commitConcurrency: ZERO,
    statementCount: ZERO,
    outcome: OUTCOME_ACTIVE,
  };
}

function extractTransactionId(txOrId) {
  if (typeof txOrId === TYPE_STRING) {
    return txOrId;
  }
  return txOrId?.transactionId || txOrId?.workflowId || null;
}

function resolveTelemetryTarget(coordinator, txOrId) {
  if (txOrId && typeof txOrId === TYPE_OBJECT && txOrId.telemetry) {
    return txOrId.telemetry;
  }
  const id = extractTransactionId(txOrId);
  if (typeof id !== TYPE_STRING || id.length === ZERO) {
    return null;
  }
  const active = coordinator?.workflowCoordinator?.workflowsById?.get(id);
  return active?.telemetry || null;
}

function ensureTelemetryStore(coordinator) {
  if (!(coordinator.transactionBreakdownsById instanceof Map)) {
    coordinator.transactionBreakdownsById = new Map();
  }
  return coordinator.transactionBreakdownsById;
}

function snapshotTransactionTelemetry(tx, outcome = null) {
  const telemetry = tx?.telemetry;
  if (!telemetry) {
    return null;
  }
  const totalMs = telemetry.totalMs > ZERO ?
    telemetry.totalMs :
    Math.max(ZERO, resolveNowMs() - telemetry.startedAtMs);
  return Object.freeze({
    transactionId: tx.transactionId || telemetry.transactionId,
    sessionId: tx.sessionId || telemetry.sessionId,
    beginMs: telemetry.beginMs,
    statementsMs: telemetry.statementsMs,
    preparePhaseMs: telemetry.preparePhaseMs,
    decisionPersistMs: telemetry.decisionPersistMs,
    commitPhaseMs: telemetry.commitPhaseMs,
    rollbackPhaseMs: telemetry.rollbackPhaseMs,
    totalMs,
    metadataMutations: telemetry.metadataMutations,
    metadataReads: telemetry.metadataReads,
    participantCount: tx.participants instanceof Map ?
      tx.participants.size :
      telemetry.participantCount,
    prepareConcurrency: telemetry.prepareConcurrency,
    commitConcurrency: telemetry.commitConcurrency,
    statementCount: telemetry.statementCount,
    outcome: outcome || telemetry.outcome || tx.status || OUTCOME_ACTIVE,
  });
}

function finalizeTransactionTelemetry(coordinator, tx, outcome) {
  if (!tx?.telemetry) {
    return null;
  }
  tx.telemetry.totalMs = Math.max(ZERO, resolveNowMs() - tx.telemetry.startedAtMs);
  tx.telemetry.participantCount = tx.participants instanceof Map ?
    tx.participants.size :
    tx.telemetry.participantCount;
  tx.telemetry.outcome = outcome || tx.status || OUTCOME_ACTIVE;
  const snapshot = snapshotTransactionTelemetry(tx, tx.telemetry.outcome);
  const store = ensureTelemetryStore(coordinator);
  store.set(snapshot.transactionId, snapshot);
  while (store.size > MAX_RETAINED_BREAKDOWNS) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
  coordinator.lastTransactionBreakdown = snapshot;
  return snapshot;
}

const distributedTransactionTelemetryMethods = {
  noteMetadataMutation(txOrId) {
    const target = resolveTelemetryTarget(this, txOrId);
    if (target) {
      target.metadataMutations += ONE;
    }
  },

  noteMetadataRead(txOrId) {
    const target = resolveTelemetryTarget(this, txOrId);
    if (target) {
      target.metadataReads += ONE;
    }
  },

  getLastTransactionBreakdown(transactionId = null) {
    const store = ensureTelemetryStore(this);
    if (typeof transactionId === TYPE_STRING && transactionId.length > ZERO) {
      if (store.has(transactionId)) {
        return store.get(transactionId);
      }
      const active = this.workflowCoordinator?.workflowsById?.get(transactionId);
      return active ? snapshotTransactionTelemetry(active) : null;
    }
    return this.lastTransactionBreakdown || null;
  },

  getTransactionTelemetrySummary() {
    const store = ensureTelemetryStore(this);
    const entries = Array.from(store.values());
    const count = entries.length;
    if (count === ZERO) {
      return {
        transactionCount: ZERO,
        avgTotalMs: ZERO,
        avgBeginMs: ZERO,
        avgStatementsMs: ZERO,
        avgPreparePhaseMs: ZERO,
        avgDecisionPersistMs: ZERO,
        avgCommitPhaseMs: ZERO,
        avgMetadataMutations: ZERO,
        avgMetadataReads: ZERO,
      };
    }
    const sumField = (field) =>
      entries.reduce((acc, item) => acc + (Number(item[field]) || ZERO), ZERO) / count;
    return {
      transactionCount: count,
      avgTotalMs: sumField(FIELD_TOTAL_MS),
      avgBeginMs: sumField(FIELD_BEGIN_MS),
      avgStatementsMs: sumField(FIELD_STATEMENTS_MS),
      avgPreparePhaseMs: sumField(FIELD_PREPARE_PHASE_MS),
      avgDecisionPersistMs: sumField(FIELD_DECISION_PERSIST_MS),
      avgCommitPhaseMs: sumField(FIELD_COMMIT_PHASE_MS),
      avgMetadataMutations: sumField(FIELD_METADATA_MUTATIONS),
      avgMetadataReads: sumField(FIELD_METADATA_READS),
    };
  },
};

export {
  createTransactionTelemetry,
  distributedTransactionTelemetryMethods,
  finalizeTransactionTelemetry,
  resolveNowMs,
};
