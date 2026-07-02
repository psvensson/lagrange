import {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
  PUBLICATION_EVIDENCE_REPLAY_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_RULES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_RULES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD,
} from './publication-evidence-replay-constants.js';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === 'string' ?
    value.trim() :
    PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
}

function normalizeScalarText(value) {
  if (typeof value === 'string') {
    return normalizeText(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
}

function normalizeInteger(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.trunc(normalized) : fallback;
}

function normalizeTimestampMs(value, fallback = 0) {
  const normalizedTime = Date.parse(normalizeText(value));
  return Number.isFinite(normalizedTime) ? normalizedTime : fallback;
}

function normalizeList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeScalarText(value))
      .filter((value) => value.length > 0),
  )].sort((left, right) => left.localeCompare(right));
}

function normalizeRecordKeyList(value = {}) {
  return normalizeList(isRecord(value) ? Object.keys(value) : []);
}

function readArrayField(record, ...fieldNames) {
  if (!isRecord(record)) {
    return [];
  }
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readRecordField(record, ...fieldNames) {
  if (!isRecord(record)) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (isRecord(value)) {
      return {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
        value,
      };
    }
  }
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    value: {},
  };
}

function readFirstRecord(...values) {
  for (const value of values) {
    if (isRecord(value)) {
      return {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
        value,
      };
    }
  }
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    value: {},
  };
}

function readFirstAvailableRecord(...recordStates) {
  for (const recordState of recordStates) {
    if (recordState?.availability === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE) {
      return recordState;
    }
  }
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    value: {},
  };
}

function readSelectedSnapshotObservationFromFailureBundle(failureBundle = {}) {
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  const coverageState = readRecordField(
    controlPlaneState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.ACTIVE_GATE_SNAPSHOT_COVERAGE,
  );
  const coverage = coverageState.value;
  return {
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.AVAILABILITY]:
      coverageState.availability,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_ADMIN_READY]:
      coverage[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_ADMIN_READY
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_ADMIN_READY]:
      coverage[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_ADMIN_READY
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_REACHABLE_BY]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_REACHABLE_BY
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_REACHABLE_BY]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_REACHABLE_BY
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_REACHABILITY_ERROR]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_REACHABILITY_ERROR
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_OBSERVATION_MODE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_MODE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_OBSERVATION_STATE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_STATE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_CONTRACT_STATE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_REFRESH_STATE]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_REFRESH_STATE
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION]:
      normalizeText(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_NEXT_ACTION
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
      .SELECTED_SNAPSHOT_OBSERVATION_REASON_CODES]:
      normalizeList(
        readArrayField(
          coverage,
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_SNAPSHOT_OBSERVATION_REASON_CODES,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_REPAIR_DEFERRED]:
      coverage[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
          .SELECTED_SNAPSHOT_REPAIR_DEFERRED
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.EXPECTED_NODE_COUNT]:
      normalizeInteger(
        coverage[PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.EXPECTED_NODE_COUNT],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.BEST_COVERAGE_NODE_COUNT]:
      normalizeInteger(
        coverage[
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.BEST_COVERAGE_NODE_COUNT
        ],
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_PUBLISHED_ACTIVE_NODE_IDS]:
      normalizeList(
        readArrayField(
          coverage,
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_PUBLISHED_ACTIVE_NODE_IDS,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_MISSING_PUBLISHED_NODE_IDS]:
      normalizeList(
        readArrayField(
          coverage,
          PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
            .SELECTED_MISSING_PUBLISHED_NODE_IDS,
        ),
      ),
  };
}

function parseRepairLogRecordFromLine(line) {
  const normalizedLine = normalizeText(line);
  const jsonStartIndex = normalizedLine.indexOf(
    PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG.JSON_START,
  );
  const jsonEndIndex = normalizedLine.lastIndexOf(
    PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG.JSON_END,
  );
  if (jsonStartIndex < 0 || jsonEndIndex <= jsonStartIndex) {
    return {};
  }
  try {
    const parsed = JSON.parse(normalizedLine.slice(jsonStartIndex, jsonEndIndex + 1));
    return isRecord(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function readFailureBundleLogExcerptLines(failureBundle = {}) {
  const logsState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.LOGS,
  );
  const excerptsByNodeState = readRecordField(
    logsState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.EXCERPTS_BY_NODE_ID,
  );
  return Object.values(excerptsByNodeState.value)
    .flatMap((lines) => Array.isArray(lines) ? lines : [])
    .filter((line) => typeof line === 'string');
}

function normalizeRepairLogEvidence(record = {}) {
  return {
    message: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.MSG],
    ),
    nodeId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.NODE_ID],
    ),
    readSource: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.READ_SOURCE],
    ),
    failedTableNames: normalizeList(
      readArrayField(
        record,
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.FAILED_TABLES,
      ),
    ),
    causeChain: normalizeList(
      readArrayField(
        record,
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.CAUSE_CHAIN,
      ),
    ),
    failureClass: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.FAILURE_CLASS],
    ),
    retryAfterMs: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD.RETRY_AFTER_MS],
    ),
  };
}

function isOwnerRpcCacheRepairDeferral(evidence = {}) {
  return PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_RULES.every((rule) =>
    rule.matches(evidence),
  );
}

function maxRetryAfterMs(evidenceRecords = []) {
  return evidenceRecords.reduce(
    (maxRetryAfter, evidence) => Math.max(maxRetryAfter, evidence.retryAfterMs),
    0,
  );
}

function summarizeOwnerRpcCacheRepairDeferrals({
  failureBundle = {},
  selectedSnapshotNodeId = PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
} = {}) {
  const repairDeferrals = readFailureBundleLogExcerptLines(failureBundle)
    .map(parseRepairLogRecordFromLine)
    .filter(isRecord)
    .map(normalizeRepairLogEvidence)
    .filter(isOwnerRpcCacheRepairDeferral);
  const selectedNodeId = normalizeText(selectedSnapshotNodeId);
  const selectedWitnessDeferrals = repairDeferrals.filter((evidence) =>
    evidence.nodeId === selectedNodeId,
  );
  const matchingDeferralCount = repairDeferrals.length;
  return {
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.AVAILABILITY]:
      matchingDeferralCount > 0 ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.DEFERRAL_STATE]:
      matchingDeferralCount > 0 ?
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.REPAIR_DEFERRED :
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_NODE_ID]:
      selectedNodeId,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.MATCHING_DEFERRAL_COUNT]:
      matchingDeferralCount,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_DEFERRAL_COUNT]:
      selectedWitnessDeferrals.length,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.LATEST_RETRY_AFTER_MS]:
      maxRetryAfterMs(repairDeferrals),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD
      .SELECTED_WITNESS_LATEST_RETRY_AFTER_MS]:
      maxRetryAfterMs(selectedWitnessDeferrals),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.NODE_IDS]:
      normalizeList(repairDeferrals.map((evidence) => evidence.nodeId)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.FAILED_TABLE_NAMES]:
      normalizeList(repairDeferrals.flatMap((evidence) => evidence.failedTableNames)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.CAUSE_CHAIN]:
      normalizeList(repairDeferrals.flatMap((evidence) => evidence.causeChain)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.READ_SOURCES]:
      normalizeList(repairDeferrals.map((evidence) => evidence.readSource)),
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.FAILURE_CLASSES]:
      normalizeList(repairDeferrals.map((evidence) => evidence.failureClass)),
  };
}

function hasRetainedSelectedSnapshotRepairEvidence(
  selectedSnapshotObservation = {},
) {
  return (
    selectedSnapshotObservation[
      PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.AVAILABILITY
    ] === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE &&
    (
      selectedSnapshotObservation[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
          .SELECTED_SNAPSHOT_REPAIR_DEFERRED
      ] === true ||
      selectedSnapshotObservation[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
          .SELECTED_SNAPSHOT_OBSERVATION_MODE
      ] ===
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.REPAIR_DEFERRED
    )
  );
}

function hasReconstructedOwnerRpcRepairEvidence(ownerRpcCacheRepair = {}) {
  return (
    ownerRpcCacheRepair[
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.AVAILABILITY
    ] === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE &&
    ownerRpcCacheRepair[
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.DEFERRAL_STATE
    ] === PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.REPAIR_DEFERRED &&
    normalizeInteger(
      ownerRpcCacheRepair[
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_DEFERRAL_COUNT
      ],
    ) > 0
  );
}

function resolveSelectedSnapshotRepairEvidenceRecoveryState(evidence = {}) {
  return PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_RULES
    .find((rule) => rule.matches(evidence))
    .evidenceState;
}

function summarizeSelectedSnapshotRepairEvidenceRecovery({
  selectedSnapshotObservation = {},
  ownerRpcCacheRepair = {},
} = {}) {
  const hasRetainedObservation =
    hasRetainedSelectedSnapshotRepairEvidence(selectedSnapshotObservation);
  const hasReconstructedOwnerRpc =
    hasReconstructedOwnerRpcRepairEvidence(ownerRpcCacheRepair);
  const evidenceState = resolveSelectedSnapshotRepairEvidenceRecoveryState({
    hasRetainedObservation,
    hasReconstructedOwnerRpc,
  });
  const selectedObservationNodeId = normalizeText(
    selectedSnapshotObservation[
      PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID
    ],
  );
  const selectedRepairNodeId = normalizeText(
    ownerRpcCacheRepair[
      PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.SELECTED_WITNESS_NODE_ID
    ],
  );
  return {
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.AVAILABILITY]:
      evidenceState ===
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE.MISSING ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.EVIDENCE_STATE]:
      evidenceState,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.SELECTED_WITNESS_NODE_ID]:
      selectedObservationNodeId || selectedRepairNodeId,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RETAINED_OBSERVATION_AVAILABILITY]:
      hasRetainedObservation ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RECONSTRUCTED_OWNER_RPC_AVAILABILITY]:
      hasReconstructedOwnerRpc ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RETAINED_OBSERVATION_DEFERRAL_STATE]:
      hasRetainedObservation ?
        normalizeText(
          selectedSnapshotObservation[
            PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
              .SELECTED_SNAPSHOT_OBSERVATION_MODE
          ],
        ) :
        PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RECONSTRUCTED_OWNER_RPC_DEFERRAL_STATE]:
      normalizeText(
        ownerRpcCacheRepair[
          PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.DEFERRAL_STATE
        ],
      ) || PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.RETAINED_OBSERVATION_STATE]:
      hasRetainedObservation ?
        normalizeText(
          selectedSnapshotObservation[
            PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
              .SELECTED_SNAPSHOT_OBSERVATION_STATE
          ],
        ) :
        PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RETAINED_OBSERVATION_REASON_CODES]:
      hasRetainedObservation ?
        normalizeList(
          selectedSnapshotObservation[
            PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD
              .SELECTED_SNAPSHOT_OBSERVATION_REASON_CODES
          ],
        ) :
        [],
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD
      .RECONSTRUCTED_FAILED_TABLE_NAMES]:
      hasReconstructedOwnerRpc ?
        normalizeList(
          ownerRpcCacheRepair[
            PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.FAILED_TABLE_NAMES
          ],
        ) :
        [],
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.RECONSTRUCTED_READ_SOURCES]:
      hasReconstructedOwnerRpc ?
        normalizeList(
          ownerRpcCacheRepair[
            PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.READ_SOURCES
          ],
        ) :
        [],
    [PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD.RECONSTRUCTED_CAUSE_CHAIN]:
      hasReconstructedOwnerRpc ?
        normalizeList(
          ownerRpcCacheRepair[
            PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD.CAUSE_CHAIN
          ],
        ) :
        [],
  };
}

export {
  isRecord,
  normalizeInteger,
  normalizeList,
  normalizeRecordKeyList,
  normalizeScalarText,
  normalizeText,
  normalizeTimestampMs,
  parseRepairLogRecordFromLine,
  readArrayField,
  readFailureBundleLogExcerptLines,
  readFirstAvailableRecord,
  readFirstRecord,
  readRecordField,
  readSelectedSnapshotObservationFromFailureBundle,
  summarizeOwnerRpcCacheRepairDeferrals,
  summarizeSelectedSnapshotRepairEvidenceRecovery,
};
