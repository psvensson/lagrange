import {TABLES} from '../constants/index.js';

const TABLES_OBSERVED = new Set([TABLES.SERVICES, TABLES.REPLICA_OPERATIONS]);
const MESSAGE = 'Formation CDC occurrence observation';
const TEXT_BOUND = 256;

function scalar(value) {
  if (typeof value === 'string') {
    return value.length <= TEXT_BOUND ? value :
      value.slice(0, TEXT_BOUND) + '<truncated>';
  }
  return typeof value === 'number' || typeof value === 'boolean' ? value : null;
}

function formationCdcRow(row) {
  return {
    status: scalar(row?.status),
    updatedAt: scalar(row?.updated_at),
    originHlc: scalar(row?.updated_at_hlc),
  };
}

/** Observational only: never turns logging failure into an application result. */
function observeFormationCdc(logger, stage, tableName, fields) {
  if (!TABLES_OBSERVED.has(tableName)) {
    return 'not-selected';
  }
  if (typeof logger?.logConsoleOnly !== 'function') {
    return 'sink-unavailable';
  }
  try {
    logger.logConsoleOnly('info', MESSAGE, {stage, tableName, ...fields});
    return 'emitted';
  } catch {
    return 'sink-unavailable';
  }
}

function formationCdcEvent(event) {
  return {
    operation: scalar(event?.operation),
    eventTimestamp: scalar(event?.timestamp),
    sourcePartition: scalar(event?.sourcePartition),
    sourceReplica: scalar(event?.sourceReplica),
    sourceLogIndex: scalar(event?.sourceLogIndex),
    sourceOrdinal: scalar(event?.sourceOrdinal),
    eventKey: scalar(event?.eventKey),
    entryId: scalar(event?.entryId),
    row: formationCdcRow(event?.data),
  };
}

function formationCdcRead(readResult) {
  const witness = readResult?.readAuthorityWitness;
  return {
    success: readResult?.success === true,
    authorityPartition: scalar(witness?.partitionId),
    authorityAppliedIndex: scalar(witness?.appliedIndex),
    authorityObservedAtMs: scalar(witness?.observedAtMs),
    offeredRows: Array.isArray(readResult?.rows) ? readResult.rows.length : null,
  };
}

export {
  formationCdcEvent, formationCdcRead, formationCdcRow, observeFormationCdc,
};
