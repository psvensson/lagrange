// A redelivered session write (the same entryId, SQL and params) is answered
// from the provisional result its first delivery staged, instead of staging
// it twice. The staging owner records each staged result and asks here first.
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {QUERY_PAYLOAD_FIELD_ENTRY_ID} = PARTITION_SERVICE_SHARED;

function recordStagedWriteResult(session, operation, ranOutcome) {
  if (session.stagedResultsByEntryId instanceof Map &&
      typeof operation.entryId === 'string' && operation.entryId.length > 0) {
    session.stagedResultsByEntryId.set(operation.entryId, Object.freeze({
      sql: operation.sql,
      params: operation.params,
      changes: ranOutcome.changes,
      lastInsertRowid: ranOutcome.lastInsertRowid,
    }));
  }
}

function sameStagedParams(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
}

function findIdempotentStagedWriteAnswer(session, request, params) {
  const suppliedEntryId = request[QUERY_PAYLOAD_FIELD_ENTRY_ID];
  if (typeof suppliedEntryId !== 'string' || suppliedEntryId.length === 0 ||
      !(session.stagedResultsByEntryId instanceof Map)) {
    return null;
  }
  const prior = session.stagedResultsByEntryId.get(suppliedEntryId);
  if (prior === undefined || prior.sql !== request.sql ||
      !sameStagedParams(prior.params, params)) {
    return null;
  }
  return {
    success: true,
    provisional: true,
    idempotent: true,
    changes: prior.changes,
    lastInsertRowid: prior.lastInsertRowid,
  };
}

export {findIdempotentStagedWriteAnswer, recordStagedWriteResult};
