/**
 * Bounds outward admin replica-operation summaries produced by
 * AdminControlSnapshot so partition diagnostics, service discovery, and
 * control snapshots never embed unbounded historical operation rows or heavy
 * nested readiness/bootstrap blobs while preserving all in-flight operations,
 * priority-partition terminal coverage, step-entry timing, and exact aggregate
 * counters.
 */
import {COPY_PHASE_WORKFLOW_STEPS} from '../rebalancer/replica-operation-step-policy.js';
import {OperationType} from '../rebalancer/replica-operation-progress.js';
import {isReplicaOperationInFlight} from '../rebalancer/replica-operation-liveness.js';
import {ADMIN_CONTROL_SNAPSHOT} from './admin-constants.js';

const COMPACT_STEP_STRING_FIELDS = Object.freeze([
  'previousStep',
  'reason',
  'ownerKey',
  'sourceReplicaId',
  'targetNodeId',
]);
const TIMELINE_EVENT_TYPE_STATE = 'state';
const SINGLE_TERMINAL_ENTRY_COUNT = 1;
const MISSING_TIMESTAMP_RANK = -1;
const ZERO_COUNT = 0;

function clipScalarString(value, maxLength) {
  if (typeof value !== 'string' || value.length === ZERO_COUNT) {
    return null;
  }
  return value.length <= maxLength ? value : value.slice(ZERO_COUNT, maxLength);
}

function pickCompactScalarFields(source, maxLength) {
  const fields = {};
  if (!source || typeof source !== 'object') {
    return fields;
  }
  for (const key of COMPACT_STEP_STRING_FIELDS) {
    const clipped = clipScalarString(source[key], maxLength);
    if (clipped !== null) {
      fields[key] = clipped;
    }
  }
  return fields;
}

function compactStepHistoryEntry(entry, maxLength) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const compact = {};
  if (typeof entry.step === 'string' && entry.step.length > ZERO_COUNT) {
    compact.step = clipScalarString(entry.step, maxLength);
  }
  if (Number.isFinite(entry.timestamp)) {
    compact.timestamp = Math.floor(entry.timestamp);
  }
  if (Number.isFinite(entry.timestampMs)) {
    compact.timestampMs = Math.floor(entry.timestampMs);
  }
  Object.assign(compact, pickCompactScalarFields(entry, maxLength));
  return Object.keys(compact).length > ZERO_COUNT ? compact : null;
}

function findMatchingStepIndex(stepsHistory, workflowStep) {
  if (!workflowStep) {
    return -1;
  }
  for (let index = stepsHistory.length - 1; index >= ZERO_COUNT; index -= 1) {
    if (stepsHistory[index]?.step === workflowStep) {
      return index;
    }
  }
  return -1;
}

function compactInFlightStepsHistory(stepsHistory, workflowStep, maxSteps, maxLength) {
  if (!Array.isArray(stepsHistory) || stepsHistory.length === ZERO_COUNT) {
    return [];
  }
  const compacted = [];
  for (const entry of stepsHistory) {
    const compactEntry = compactStepHistoryEntry(entry, maxLength);
    if (compactEntry) {
      compacted.push(compactEntry);
    }
  }
  if (compacted.length <= maxSteps) {
    return compacted;
  }
  const tailStart = compacted.length - maxSteps;
  const tail = compacted.slice(tailStart);
  const matchingIndex = findMatchingStepIndex(compacted, workflowStep);
  if (matchingIndex >= ZERO_COUNT && matchingIndex < tailStart) {
    return [compacted[matchingIndex], ...tail.slice(SINGLE_TERMINAL_ENTRY_COUNT)];
  }
  return tail;
}

function compactTerminalStepsHistory(stepsHistory, workflowStep, maxLength) {
  if (!Array.isArray(stepsHistory) || stepsHistory.length === ZERO_COUNT) {
    return [];
  }
  const matchingIndex = findMatchingStepIndex(stepsHistory, workflowStep);
  const candidateIndex = matchingIndex >= ZERO_COUNT ?
    matchingIndex :
    stepsHistory.length - 1;
  const compactEntry = compactStepHistoryEntry(
    stepsHistory[candidateIndex],
    maxLength,
  );
  return compactEntry ? [compactEntry] : [];
}

function compactTimelineEntry(entry, maxLength) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const {metadata, ...rest} = entry;
  const compactMetadata = pickCompactScalarFields(metadata, maxLength);
  if (Object.keys(compactMetadata).length > ZERO_COUNT) {
    return {...rest, metadata: compactMetadata};
  }
  return {...rest};
}

function compactOperationTimeline(timeline, isInFlight, maxLength) {
  if (!Array.isArray(timeline) || timeline.length === ZERO_COUNT) {
    return [];
  }
  if (isInFlight) {
    const compacted = [];
    for (const entry of timeline) {
      const compactEntry = compactTimelineEntry(entry, maxLength);
      if (compactEntry) {
        compacted.push(compactEntry);
      }
    }
    return compacted;
  }
  let selectedEntry = timeline[timeline.length - 1];
  for (let index = timeline.length - 1; index >= ZERO_COUNT; index -= 1) {
    if (timeline[index]?.eventType === TIMELINE_EVENT_TYPE_STATE) {
      selectedEntry = timeline[index];
      break;
    }
  }
  const compactEntry = compactTimelineEntry(selectedEntry, maxLength);
  return compactEntry ? [compactEntry] : [];
}

function resolveTerminalRowRecencyMs(row) {
  const timestamps = [row?.completedAt, row?.updatedAt, row?.createdAt]
    .filter((value) => Number.isFinite(value));
  return timestamps.length > ZERO_COUNT ?
    Math.max(...timestamps) :
    MISSING_TIMESTAMP_RANK;
}

function compareTerminalRowCandidates(left, right) {
  if (right.recencyMs !== left.recencyMs) {
    return right.recencyMs - left.recencyMs;
  }
  const idOrder = String(left.row.operationId || '').localeCompare(
    String(right.row.operationId || ''),
  );
  if (idOrder !== ZERO_COUNT) {
    return idOrder;
  }
  return left.index - right.index;
}

function collectPriorityTerminalCandidates(sorted, limit, priorityPartitionIds) {
  const selected = [];
  const selectedIndexes = new Set();
  if (!(priorityPartitionIds instanceof Set) || priorityPartitionIds.size === ZERO_COUNT) {
    return {selected, selectedIndexes};
  }
  const coveredPartitions = new Set();
  for (const candidate of sorted) {
    if (selected.length >= limit) {
      break;
    }
    const partitionId = String(candidate.row?.partitionId || '').trim();
    if (!priorityPartitionIds.has(partitionId) || coveredPartitions.has(partitionId)) {
      continue;
    }
    coveredPartitions.add(partitionId);
    selectedIndexes.add(candidate.index);
    selected.push(candidate);
  }
  return {selected, selectedIndexes};
}

function selectRetainedTerminalRows(terminalCandidates, limit, priorityPartitionIds) {
  if (terminalCandidates.length <= limit) {
    return terminalCandidates;
  }
  const sorted = [...terminalCandidates].sort(compareTerminalRowCandidates);
  const {selected, selectedIndexes} = collectPriorityTerminalCandidates(
    sorted,
    limit,
    priorityPartitionIds,
  );
  for (const candidate of sorted) {
    if (selected.length >= limit) {
      break;
    }
    if (!selectedIndexes.has(candidate.index)) {
      selectedIndexes.add(candidate.index);
      selected.push(candidate);
    }
  }
  return selected.sort((left, right) => left.index - right.index);
}

function partitionCandidatesByLiveness(allRows, livenessOptions) {
  const inFlightCandidates = [];
  const terminalCandidates = [];
  for (let index = ZERO_COUNT; index < allRows.length; index += 1) {
    const row = allRows[index];
    if (isReplicaOperationInFlight(row, livenessOptions)) {
      inFlightCandidates.push({row, index, isInFlight: true});
    } else {
      terminalCandidates.push({
        row,
        index,
        isInFlight: false,
        recencyMs: resolveTerminalRowRecencyMs(row),
      });
    }
  }
  return {inFlightCandidates, terminalCandidates};
}

// Report the most recent completed visit to each copy phase in this operation.
// Adjacency and the owner's previousStep link are both required.
function completedCopyStages(row) {
  if (row.type !== OperationType.ADD && row.type !== OperationType.REPLACE) return null;
  const history = row.stepsHistory;
  if (!Array.isArray(history)) return null;
  const stages = {};
  for (let index = 1; index < history.length; index += 1) {
    const start = history[index - 1];
    const end = history[index];
    if (!COPY_PHASE_WORKFLOW_STEPS.has(start?.step) || end?.previousStep !== start.step ||
        typeof end.step !== 'string' || !end.step || end.step === start.step ||
        (start.ownerKey && start.ownerKey !== row.operationId) ||
        (end.ownerKey && end.ownerKey !== row.operationId) ||
        !Number.isFinite(start.timestamp) || !Number.isFinite(end.timestamp) ||
        end.timestamp < start.timestamp) continue;
    stages[start.step] = {
      startedAtMs: start.timestamp, endedAtMs: end.timestamp, nextStep: end.step,
      durationMs: end.timestamp - start.timestamp,
    };
  }
  return Object.keys(stages).length ? stages : null;
}

function buildCompactedCandidateOutputs(retainedCandidates, sourceTimelines, limits) {
  const rows = [];
  const operationTimelineById = {};
  for (const {row, isInFlight} of retainedCandidates) {
    const stepsHistory = isInFlight ?
      compactInFlightStepsHistory(
        row.stepsHistory,
        row.workflowStep,
        limits.maxSteps,
        limits.maxLength,
      ) :
      compactTerminalStepsHistory(row.stepsHistory, row.workflowStep, limits.maxLength);
    rows.push({...row, stepsHistory, completedCopyStages: completedCopyStages(row)});
    const operationId = row.operationId;
    if (
      typeof operationId === 'string' &&
      operationId.length > ZERO_COUNT &&
      Object.hasOwn(sourceTimelines, operationId)
    ) {
      operationTimelineById[operationId] = compactOperationTimeline(
        sourceTimelines[operationId],
        isInFlight,
        limits.maxLength,
      );
    }
  }
  return {rows, operationTimelineById};
}

/**
 * Compact and bound replica-operation rows and timelines for outward admin
 * snapshots while keeping every in-flight row and aggregate count intact.
 * @param {Object} options
 * @param {Object} options.livenessSummary
 * @param {Object} options.livenessOptions
 * @param {Set<string>} [options.priorityPartitionIds]
 * @return {{rows: Array<Object>, operationTimelineById: Object, totalRowCount: number, omittedTerminalRowCount: number}}
 */
function compactReplicaOperationSummary({
  livenessSummary,
  livenessOptions,
  priorityPartitionIds = null,
}) {
  const allRows = Array.isArray(livenessSummary?.rows) ?
    livenessSummary.rows :
    [];
  const sourceTimelines =
    livenessSummary?.operationTimelineById &&
    typeof livenessSummary.operationTimelineById === 'object' ?
      livenessSummary.operationTimelineById :
      {};
  const limits = {
    maxSteps: ADMIN_CONTROL_SNAPSHOT.REPLICA_OPERATION_IN_FLIGHT_STEPS_LIMIT,
    maxLength: ADMIN_CONTROL_SNAPSHOT.REPLICA_OPERATION_STEP_SCALAR_MAX_LENGTH,
    terminalLimit: ADMIN_CONTROL_SNAPSHOT.REPLICA_OPERATION_TERMINAL_ROWS_LIMIT,
  };
  const {inFlightCandidates, terminalCandidates} = partitionCandidatesByLiveness(
    allRows,
    livenessOptions,
  );
  const retainedTerminal = selectRetainedTerminalRows(
    terminalCandidates,
    limits.terminalLimit,
    priorityPartitionIds,
  );
  const retainedCandidates = [...inFlightCandidates, ...retainedTerminal]
    .sort((left, right) => left.index - right.index);
  const {rows, operationTimelineById} = buildCompactedCandidateOutputs(
    retainedCandidates,
    sourceTimelines,
    limits,
  );
  return {
    rows,
    operationTimelineById,
    totalRowCount: allRows.length,
    omittedTerminalRowCount:
      terminalCandidates.length - retainedTerminal.length,
  };
}

export {compactReplicaOperationSummary};
