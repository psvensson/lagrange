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
const FIELD_METADATA_PERSIST_MS = 'metadataPersistMs';
const FIELD_METADATA_READS = 'metadataReads';
const FIELD_METADATA_MUTATIONS_BY_PURPOSE = 'metadataMutationsByPurpose';
const FIELD_METADATA_SUBMISSIONS_BY_PURPOSE = 'metadataSubmissionsByPurpose';
const FIELD_METADATA_PERSIST_MS_BY_PURPOSE = 'metadataPersistMsByPurpose';

const TRANSACTION_METADATA_PERSIST_PURPOSE = Object.freeze({
  REGISTRATION: 'registration',
  PARTICIPANT_ADMISSION: 'participantAdmission',
  STATEMENT_OUTCOME: 'statementOutcome',
  MANIFEST_FREEZE: 'manifestFreeze',
  PREPARING: 'preparing',
  DECISION_AND_COMMITTING: 'decisionAndCommitting',
  SETTLEMENT: 'settlement',
});

const METADATA_PERSIST_PURPOSE_VALUES = Object.freeze(
  Object.values(TRANSACTION_METADATA_PERSIST_PURPOSE),
);
const METADATA_PERSIST_PURPOSE_SET = new Set(METADATA_PERSIST_PURPOSE_VALUES);

function createPurposeCounterMap(initialValue = ZERO) {
  return {
    [TRANSACTION_METADATA_PERSIST_PURPOSE.REGISTRATION]: initialValue,
    [TRANSACTION_METADATA_PERSIST_PURPOSE.PARTICIPANT_ADMISSION]: initialValue,
    [TRANSACTION_METADATA_PERSIST_PURPOSE.STATEMENT_OUTCOME]: initialValue,
    [TRANSACTION_METADATA_PERSIST_PURPOSE.MANIFEST_FREEZE]: initialValue,
    [TRANSACTION_METADATA_PERSIST_PURPOSE.PREPARING]: initialValue,
    [TRANSACTION_METADATA_PERSIST_PURPOSE.DECISION_AND_COMMITTING]: initialValue,
    [TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT]: initialValue,
  };
}

function freezePurposeCounterMap(map) {
  const copy = createPurposeCounterMap(ZERO);
  if (map && typeof map === TYPE_OBJECT) {
    for (const purpose of METADATA_PERSIST_PURPOSE_VALUES) {
      copy[purpose] = Number(map[purpose]) || ZERO;
    }
  }
  return Object.freeze(copy);
}

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
    metadataPersistMs: ZERO,
    metadataMutationsByPurpose: createPurposeCounterMap(ZERO),
    metadataSubmissionsByPurpose: createPurposeCounterMap(ZERO),
    metadataPersistMsByPurpose: createPurposeCounterMap(ZERO),
    pendingMutationPurposes: [],
    activePersistPurpose: null,
    metadataReads: ZERO,
    skippedParticipantSetMutations: ZERO,
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

function resolveTransactionObject(coordinator, txOrId) {
  if (txOrId && typeof txOrId === TYPE_OBJECT) {
    return txOrId;
  }
  const id = extractTransactionId(txOrId);
  if (typeof id !== TYPE_STRING || id.length === ZERO) {
    return null;
  }
  return coordinator?.workflowCoordinator?.workflowsById?.get(id) || null;
}

function resolveTelemetryTarget(coordinator, txOrId) {
  if (txOrId && typeof txOrId === TYPE_OBJECT && txOrId.telemetry) {
    return txOrId.telemetry;
  }
  const active = resolveTransactionObject(coordinator, txOrId);
  return active?.telemetry || null;
}

const PURPOSE_BY_WORKFLOW_STATUS = Object.freeze({
  PREPARING: TRANSACTION_METADATA_PERSIST_PURPOSE.PREPARING,
  PREPARED: TRANSACTION_METADATA_PERSIST_PURPOSE.PREPARING,
  COMMITTING: TRANSACTION_METADATA_PERSIST_PURPOSE.DECISION_AND_COMMITTING,
  ROLLING_BACK: TRANSACTION_METADATA_PERSIST_PURPOSE.DECISION_AND_COMMITTING,
  COMMITTED: TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT,
  ROLLED_BACK: TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT,
});

const PURPOSE_BY_PARTICIPANT_CALL_STATUS = Object.freeze({
  PREPARING: TRANSACTION_METADATA_PERSIST_PURPOSE.PREPARING,
  PREPARED: TRANSACTION_METADATA_PERSIST_PURPOSE.PREPARING,
  COMMITTING: TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT,
  ROLLING_BACK: TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT,
  COMMITTED: TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT,
  ROLLED_BACK: TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT,
});

function inferPurposeFromWorkflowStatus(status) {
  if (Object.hasOwn(PURPOSE_BY_WORKFLOW_STATUS, status)) {
    return PURPOSE_BY_WORKFLOW_STATUS[status];
  }
  return TRANSACTION_METADATA_PERSIST_PURPOSE.REGISTRATION;
}

function inferPurposeForStringTarget(tx) {
  const mapped = PURPOSE_BY_PARTICIPANT_CALL_STATUS[tx?.status];
  if (mapped) return mapped;
  if (tx?.decision) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.SETTLEMENT;
  }
  return TRANSACTION_METADATA_PERSIST_PURPOSE.PARTICIPANT_ADMISSION;
}

function inferPurposeForObjectTarget(tx) {
  if (tx?.transactionRowInserted !== true) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.REGISTRATION;
  }
  if (tx?.status === OUTCOME_ACTIVE) {
    return TRANSACTION_METADATA_PERSIST_PURPOSE.STATEMENT_OUTCOME;
  }
  return inferPurposeFromWorkflowStatus(tx?.status);
}

function inferMetadataPersistPurpose(coordinator, txOrId, explicitPurpose) {
  if (METADATA_PERSIST_PURPOSE_SET.has(explicitPurpose)) {
    return explicitPurpose;
  }
  const tx = resolveTransactionObject(coordinator, txOrId);
  const activePurpose = tx?.telemetry?.activePersistPurpose;
  if (METADATA_PERSIST_PURPOSE_SET.has(activePurpose)) {
    return activePurpose;
  }
  return typeof txOrId === TYPE_STRING ?
    inferPurposeForStringTarget(tx) :
    inferPurposeForObjectTarget(tx);
}

function adjustPurposeCount(map, purpose, delta) {
  if (!map || !METADATA_PERSIST_PURPOSE_SET.has(purpose)) {
    return;
  }
  map[purpose] = Math.max(ZERO, (map[purpose] || ZERO) + delta);
}

function addPurposePersistElapsed(target, purpose, elapsedMs) {
  const safeElapsedMs = Math.max(ZERO, Number(elapsedMs) || ZERO);
  if (safeElapsedMs <= ZERO || !METADATA_PERSIST_PURPOSE_SET.has(purpose)) {
    return;
  }
  target.metadataPersistMs = (target.metadataPersistMs || ZERO) + safeElapsedMs;
  target.metadataPersistMsByPurpose[purpose] =
    (target.metadataPersistMsByPurpose[purpose] || ZERO) + safeElapsedMs;
}

function popPendingMutationPurpose(target) {
  if (!Array.isArray(target?.pendingMutationPurposes)) {
    return null;
  }
  return target.pendingMutationPurposes.length > ZERO ?
    target.pendingMutationPurposes.pop() :
    null;
}

function ensureTelemetryStore(coordinator) {
  if (!(coordinator.transactionBreakdownsById instanceof Map)) {
    coordinator.transactionBreakdownsById = new Map();
  }
  return coordinator.transactionBreakdownsById;
}

function countEnlistedParticipants(tx, recordedCount) {
  const enlisted =
    (tx?.participants?.size ?? ZERO) + (tx?.readOnlyParticipants?.size ?? ZERO);
  return enlisted > ZERO ? enlisted : recordedCount;
}

function snapshotTransactionTelemetry(tx, outcome = null) {
  const telemetry = tx?.telemetry;
  if (!telemetry) {
    return null;
  }
  const totalMs = telemetry.totalMs > ZERO ?
    telemetry.totalMs :
    Math.max(ZERO, resolveNowMs() - telemetry.startedAtMs);
  const mutationsByPurpose = freezePurposeCounterMap(
    telemetry.metadataMutationsByPurpose,
  );
  const submissionsByPurpose = freezePurposeCounterMap(
    telemetry.metadataSubmissionsByPurpose,
  );
  const persistMsByPurpose = freezePurposeCounterMap(
    telemetry.metadataPersistMsByPurpose,
  );
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
    metadataPersistMs: telemetry.metadataPersistMs || ZERO,
    metadataMutationsByPurpose: mutationsByPurpose,
    metadataSubmissionsByPurpose: submissionsByPurpose,
    metadataPersistMsByPurpose: persistMsByPurpose,
    metadataReads: telemetry.metadataReads,
    skippedParticipantSetMutations: telemetry.skippedParticipantSetMutations || ZERO,
    participantCount: countEnlistedParticipants(tx, telemetry.participantCount),
    prepareConcurrency: telemetry.prepareConcurrency,
    commitConcurrency: telemetry.commitConcurrency,
    statementCount: telemetry.statementCount,
    // createTransactionTelemetry starts outcome at ACTIVE; finalize replaces it.
    outcome: outcome || telemetry.outcome,
  });
}

function finalizeTransactionTelemetry(coordinator, tx, outcome) {
  if (!tx?.telemetry) {
    return null;
  }
  tx.telemetry.totalMs = Math.max(ZERO, resolveNowMs() - tx.telemetry.startedAtMs);
  tx.telemetry.participantCount = countEnlistedParticipants(
    tx,
    tx.telemetry.participantCount,
  );
  // The one caller (distributed-transaction-decision-protocol.js) passes the
  // transaction's status, which the coordinator sets at construction.
  tx.telemetry.outcome = outcome;
  const snapshot = snapshotTransactionTelemetry(
    tx,
    tx.telemetry.outcome,
  );
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
  noteMetadataMutation(txOrId, purpose = null, elapsedMs = ZERO) {
    const target = resolveTelemetryTarget(this, txOrId);
    if (!target) {
      return;
    }
    const resolvedPurpose = inferMetadataPersistPurpose(this, txOrId, purpose);
    target.metadataMutations += ONE;
    adjustPurposeCount(target.metadataMutationsByPurpose, resolvedPurpose, ONE);
    adjustPurposeCount(target.metadataSubmissionsByPurpose, resolvedPurpose, ONE);
    if (Array.isArray(target.pendingMutationPurposes)) {
      target.pendingMutationPurposes.push(resolvedPurpose);
    }
    addPurposePersistElapsed(target, resolvedPurpose, elapsedMs);
  },

  noteElidedMetadataMutation(txOrId) {
    const target = resolveTelemetryTarget(this, txOrId);
    if (!target) {
      return;
    }
    if (target.metadataMutations > ZERO) {
      target.metadataMutations -= ONE;
    }
    const pendingPurpose = popPendingMutationPurpose(target);
    adjustPurposeCount(target.metadataMutationsByPurpose, pendingPurpose, -ONE);
    adjustPurposeCount(target.metadataSubmissionsByPurpose, pendingPurpose, -ONE);
  },

  noteMetadataPersistElapsed(txOrId, purpose, elapsedMs) {
    const target = resolveTelemetryTarget(this, txOrId);
    if (!target) {
      return;
    }
    const resolvedPurpose = inferMetadataPersistPurpose(this, txOrId, purpose);
    const pendingPurpose = popPendingMutationPurpose(target);
    if (pendingPurpose && pendingPurpose !== resolvedPurpose) {
      adjustPurposeCount(target.metadataMutationsByPurpose, pendingPurpose, -ONE);
      adjustPurposeCount(target.metadataSubmissionsByPurpose, pendingPurpose, -ONE);
      adjustPurposeCount(target.metadataMutationsByPurpose, resolvedPurpose, ONE);
      adjustPurposeCount(target.metadataSubmissionsByPurpose, resolvedPurpose, ONE);
    }
    addPurposePersistElapsed(target, resolvedPurpose, elapsedMs);
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
      return active ? snapshotTransactionTelemetry(active, null, this) : null;
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
        avgMetadataPersistMs: ZERO,
        avgMetadataReads: ZERO,
        avgMetadataMutationsByPurpose: freezePurposeCounterMap(),
        avgMetadataSubmissionsByPurpose: freezePurposeCounterMap(),
        avgMetadataPersistMsByPurpose: freezePurposeCounterMap(),
      };
    }
    const sumField = (field) =>
      entries.reduce((acc, item) => acc + (Number(item[field]) || ZERO), ZERO) / count;
    const avgByPurpose = (mapField) => {
      const avg = createPurposeCounterMap(ZERO);
      for (const purpose of METADATA_PERSIST_PURPOSE_VALUES) {
        avg[purpose] = entries.reduce(
          (acc, item) => acc + (Number(item?.[mapField]?.[purpose]) || ZERO),
          ZERO,
        ) / count;
      }
      return Object.freeze(avg);
    };
    return {
      transactionCount: count,
      avgTotalMs: sumField(FIELD_TOTAL_MS),
      avgBeginMs: sumField(FIELD_BEGIN_MS),
      avgStatementsMs: sumField(FIELD_STATEMENTS_MS),
      avgPreparePhaseMs: sumField(FIELD_PREPARE_PHASE_MS),
      avgDecisionPersistMs: sumField(FIELD_DECISION_PERSIST_MS),
      avgCommitPhaseMs: sumField(FIELD_COMMIT_PHASE_MS),
      avgMetadataMutations: sumField(FIELD_METADATA_MUTATIONS),
      avgMetadataPersistMs: sumField(FIELD_METADATA_PERSIST_MS),
      avgMetadataReads: sumField(FIELD_METADATA_READS),
      avgMetadataMutationsByPurpose: avgByPurpose(
        FIELD_METADATA_MUTATIONS_BY_PURPOSE,
      ),
      avgMetadataSubmissionsByPurpose: avgByPurpose(
        FIELD_METADATA_SUBMISSIONS_BY_PURPOSE,
      ),
      avgMetadataPersistMsByPurpose: avgByPurpose(
        FIELD_METADATA_PERSIST_MS_BY_PURPOSE,
      ),
    };
  },
};

export {
  TRANSACTION_METADATA_PERSIST_PURPOSE,
  createTransactionTelemetry,
  distributedTransactionTelemetryMethods,
  finalizeTransactionTelemetry,
  resolveNowMs,
};
