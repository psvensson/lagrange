// Owner of comparative-benchmark operation outcomes (chain-design.md,
// "Operation outcome owner"): the outcome words, the failure classes, the
// classification of one physical attempt, the logical request record, the
// accounting derived from the records and the validator of its invariants.
// The outcome words the semantic profile owns are imported from it; this
// module adds only the accounting subclasses the profile leaves to the
// harness. Nothing here coerces: an invalid record throws.
import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {digest} from '../../../src/utils/canonical-json-data.js';
import {
  OLTP_LATENCY_QUANTILE_METHOD,
  summarizeOltpBaselineLatencies,
} from './oltp-baseline-workload.js';
import {
  OLTP_CORRECTNESS_VIOLATION_ERROR_NAME,
} from './oltp-baseline-transaction-executor.js';
import {
  isOltpOutcomeUnknownError,
  isOltpTransportError,
  resolveOltpErrorSqlState,
} from './oltp-error-classification.js';
import {
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
} from './oltp-scenario-a-semantic-profile.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);

const PROFILE_OUTCOMES = OLTP_SCENARIO_A_SEMANTIC_PROFILE.outcomes;
const THOUSAND = 1000;
const INLINE_EVIDENCE_MAX_BYTES = 16384;
const SHA256 = 'sha256';
const HEX = 'hex';

const OUTCOME = Object.freeze({
  COMMITTED: PROFILE_OUTCOMES.success,
  SERIALIZATION_CONFLICT: PROFILE_OUTCOMES.retryableConflict,
  TERMINAL_FAILURE: PROFILE_OUTCOMES.terminalFailure,
  UNRESOLVED: 'unresolved',
  UNISSUED: 'unissued',
});

const FAILURE_CLASS = Object.freeze({
  PRODUCT_ERROR: 'product_error',
  CORRECTNESS_FAILURE: 'correctness_failure',
  TRANSPORT_FAILURE: 'transport_failure',
  AMBIGUOUS_COMMIT: 'ambiguous_commit',
  // A fault of the load generator itself (overlapping dispatch, scheduler,
  // unknown local error before any statement). Never counted against the
  // product.
  HARNESS_FAULT: 'harness_fault',
  // The run watchdog closed the request before its outcome was observed (in
  // flight, or between retry attempts): unresolved, its last attempt kept,
  // never retried, its connection destroyed. A lost COMMIT answer is
  // ambiguous_commit instead.
  WATCHDOG_STOPPED: 'watchdog_stopped',
});

const TERMINAL_FAILURE_CLASSES = Object.freeze([
  FAILURE_CLASS.PRODUCT_ERROR,
  FAILURE_CLASS.CORRECTNESS_FAILURE,
  FAILURE_CLASS.TRANSPORT_FAILURE,
  FAILURE_CLASS.HARNESS_FAULT,
]);

const UNRESOLVED_REASON = Object.freeze({
  COMMIT_ANSWER_LOST: 'commit-answer-lost',
  WATCHDOG_IN_FLIGHT: 'watchdog-stopped-in-flight',
  WATCHDOG_BETWEEN_ATTEMPTS: 'watchdog-stopped-between-attempts',
});

const RESPONSE_EVIDENCE_ENCODING = Object.freeze({
  INLINE: 'inline',
  RETAINED_FILE: 'retained-file',
});

const OUTCOME_VALUES = Object.freeze(Object.values(OUTCOME));
const UNRESOLVED_REASON_VALUES = Object.freeze(Object.values(UNRESOLVED_REASON));

function sha256Hex(text) {
  return createHash(SHA256).update(text).digest(HEX);
}

// The repository's one canonical JSON digest ('sha256:<hex>').
function canonicalDigest(value) {
  return digest(value);
}

// The logical request id of a planned operation.
function operationId(operation) {
  return `${operation.phase}:${operation.workerId}:${operation.sequence}`;
}

// The planner's side of the executed-operations digest: the slice a
// rate/repetition is planned to issue, digested exactly like the issued
// requests, and its count per operation kind.
function describePlannedOperationSlice(operations) {
  const counts = {};
  for (const operation of operations) counts[operation.kind] = (counts[operation.kind] || 0) + 1;
  return Object.freeze({
    operationSliceDigest: canonicalDigest(arrayMap(operations, (operation) =>
      ({opId: operationId(operation), operationKind: operation.kind}))),
    plannedOperationCounts: Object.freeze(counts),
  });
}

// Digest over the ordered issued operations ({opId, operationKind}); the
// planner computes the same digest over the slice a rate/repetition plans.
function computeExecutedOperationsDigest(requests) {
  return canonicalDigest(arrayMap(
    arrayFilter(requests, (request) => request.outcome !== OUTCOME.UNISSUED),
    (request) => ({opId: request.opId, operationKind: request.operationKind})));
}

function primaryError(error) {
  if (error instanceof AggregateError && Array.isArray(error.errors) &&
      error.errors.length > 0) {
    return error.errors[0];
  }
  return error;
}

function classification(outcome, failureClass, extra = {}) {
  return Object.freeze({outcome, failureClass, ...extra});
}

// One attempt's failure, from the error and the statements the attempt put
// on the wire. Order matters: an executor contract violation and a 40001 are
// decided before transport, a typed unknown commit before a plain SQLSTATE,
// and a local error with no product exchange is the harness's own fault.
function classifyBenchmarkAttemptFailure(error, trace = {}) {
  const cause = primaryError(error);
  const sqlState = resolveOltpErrorSqlState(cause);
  const evidence = {
    sqlState,
    code: typeof cause?.code === 'string' ? cause.code : null,
    message: String(cause?.message || cause),
  };
  if (error?.benchmarkHarnessFault === true || cause?.benchmarkHarnessFault === true) {
    return classification(OUTCOME.TERMINAL_FAILURE, FAILURE_CLASS.HARNESS_FAULT, evidence);
  }
  if (cause?.name === OLTP_CORRECTNESS_VIOLATION_ERROR_NAME) {
    return classification(OUTCOME.TERMINAL_FAILURE, FAILURE_CLASS.CORRECTNESS_FAILURE, {
      ...evidence,
      violation: cause.oltpCorrectnessViolation,
    });
  }
  if (sqlState === OLTP_SERIALIZATION_FAILURE_SQLSTATE) {
    return classification(OUTCOME.SERIALIZATION_CONFLICT, null, evidence);
  }
  if (cause?.commitOutcomeUnknown === true || isOltpOutcomeUnknownError(cause)) {
    return classification(OUTCOME.UNRESOLVED, FAILURE_CLASS.AMBIGUOUS_COMMIT, {
      ...evidence,
      unresolvedReason: UNRESOLVED_REASON.COMMIT_ANSWER_LOST,
    });
  }
  if (isOltpTransportError(cause)) {
    return classification(OUTCOME.TERMINAL_FAILURE, FAILURE_CLASS.TRANSPORT_FAILURE, evidence);
  }
  if (sqlState || trace.productAnsweredError === true) {
    return classification(OUTCOME.TERMINAL_FAILURE, FAILURE_CLASS.PRODUCT_ERROR, evidence);
  }
  return classification(OUTCOME.TERMINAL_FAILURE, FAILURE_CLASS.HARNESS_FAULT, evidence);
}

function createHarnessFault(message) {
  const error = new Error(message);
  error.benchmarkHarnessFault = true;
  return error;
}

function finiteNonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`benchmark outcome ${label} must be a finite non-negative number`);
  }
  return value;
}

function nullableTime(value, label) {
  return value === null ? null : finiteNonNegative(value, label);
}

function safeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`benchmark outcome ${label} must be a non-negative safe integer`);
  }
  return value;
}

// One physical attempt as retained in the logical request record.
function buildBenchmarkAttemptRecord(options) {
  const statements = Array.isArray(options.statements) ? options.statements : [];
  const attempt = {
    attemptNo: safeCount(options.attemptNo, 'attemptNo'),
    startedMs: finiteNonNegative(options.startedMs, 'attempt startedMs'),
    endedMs: finiteNonNegative(options.endedMs, 'attempt endedMs'),
    outcome: options.outcome,
    failureClass: options.failureClass ?? null,
    sqlstate: options.sqlState ?? null,
    errorCode: options.code ?? null,
    message: options.message ?? null,
    ...(options.closedByWatchdog ? {closedByWatchdog: true} : {}),
    endpoint: options.endpoint ?? null,
    serverConnectionId: options.serverConnectionId ?? null,
    commitSent: options.commitSent === true,
    statements,
  };
  return Object.freeze({
    ...attempt,
    responseDigest: canonicalDigest({
      outcome: attempt.outcome,
      failureClass: attempt.failureClass,
      sqlstate: attempt.sqlstate,
      errorCode: attempt.errorCode,
      statements,
      result: options.result ?? null,
    }),
  });
}

function retainResponseEvidence(attempts, options = {}) {
  const payload = JSON.stringify(arrayMap(attempts, (attempt) => attempt.statements));
  const bytes = Buffer.byteLength(payload);
  const payloadSha256 = sha256Hex(payload);
  const inlineMaxBytes = options.inlineMaxBytes ?? INLINE_EVIDENCE_MAX_BYTES;
  if (bytes <= inlineMaxBytes) {
    return {
      attempts,
      responseEvidence: Object.freeze({
        encoding: RESPONSE_EVIDENCE_ENCODING.INLINE,
        sha256: payloadSha256,
        bytes,
      }),
    };
  }
  if (typeof options.evidenceDir !== 'string' || options.evidenceDir === '') {
    throw new Error(
      `benchmark response evidence of ${bytes} bytes exceeds the inline bound ` +
      `${inlineMaxBytes} and no evidenceDir retains it`,
    );
  }
  mkdirSync(options.evidenceDir, {recursive: true});
  const path = join(options.evidenceDir, `${payloadSha256}.json`);
  writeFileSync(path, payload);
  return {
    attempts: arrayMap(attempts, (attempt) => Object.freeze({...attempt, statements: null})),
    responseEvidence: Object.freeze({
      encoding: RESPONSE_EVIDENCE_ENCODING.RETAINED_FILE,
      sha256: payloadSha256,
      bytes,
      path,
    }),
  };
}

function allowedFailureClasses(outcome) {
  switch (outcome) {
  case OUTCOME.TERMINAL_FAILURE:
    return TERMINAL_FAILURE_CLASSES;
  case OUTCOME.UNRESOLVED:
    return [FAILURE_CLASS.AMBIGUOUS_COMMIT, FAILURE_CLASS.WATCHDOG_STOPPED];
  default:
    return [null];
  }
}

function requireOutcomeShape(record) {
  if (!arrayIncludes(OUTCOME_VALUES, record.outcome)) {
    throw new Error(`benchmark request ${record.opId} has unknown outcome ${record.outcome}`);
  }
  if (!arrayIncludes(allowedFailureClasses(record.outcome), record.failureClass)) {
    throw new Error(
      `benchmark request ${record.opId} outcome ${record.outcome} cannot carry ` +
      `failure class ${record.failureClass}`,
    );
  }
  const reasonRequired = record.outcome === OUTCOME.UNRESOLVED;
  if (reasonRequired !== arrayIncludes(UNRESOLVED_REASON_VALUES, record.unresolvedReason)) {
    throw new Error(`benchmark request ${record.opId} has an inconsistent unresolved reason`);
  }
}

function requireTimingShape(record) {
  finiteNonNegative(record.intendedStartMs, 'intendedStartMs');
  for (const field of ['issuedAtMs', 'executionStartedAtMs', 'completedAtMs',
    'issueLagMs', 'queueDelayMs', 'latencyMs']) {
    nullableTime(record[field], field);
  }
  const issued = record.outcome !== OUTCOME.UNISSUED;
  if (issued !== (record.executionStartedAtMs !== null)) {
    throw new Error(`benchmark request ${record.opId} execution start contradicts outcome`);
  }
  // A lost commit answer ends the request on the client (it has an end and
  // a request-clock latency); a request the watchdog closed has none.
  const completed = record.outcome !== OUTCOME.UNISSUED &&
    (record.outcome !== OUTCOME.UNRESOLVED ||
      record.unresolvedReason === UNRESOLVED_REASON.COMMIT_ANSWER_LOST);
  if (completed !== (record.completedAtMs !== null) ||
      completed !== (record.latencyMs !== null)) {
    throw new Error(`benchmark request ${record.opId} completion contradicts outcome`);
  }
  if (issued && record.attempts.length < 1) {
    throw new Error(`benchmark request ${record.opId} was issued without an attempt`);
  }
  if (!issued && record.attempts.length !== 0) {
    throw new Error(`benchmark request ${record.opId} is unissued but has attempts`);
  }
  if (issued && (!record.effectSummary || typeof record.effectSummary !== 'object')) {
    throw new Error(`benchmark request ${record.opId} was issued without an effect summary`);
  }
}

function emptyTerminalFailures() {
  return Object.fromEntries(arrayMap(TERMINAL_FAILURE_CLASSES, (name) => [name, 0]));
}

// Accounting derived from the logical request records only.
function summarizeBenchmarkAccounting(records) {
  const accounting = {
    offered: records.length,
    issued: 0,
    unissued: 0,
    attempts: 0,
    committed: 0,
    conflicts: 0,
    conflictExhausted: 0,
    terminalFailures: emptyTerminalFailures(),
    unresolved: 0,
    ambiguousCommits: 0,
  };
  for (const record of records) {
    accounting.attempts += record.attempts.length;
    accounting.conflicts += arrayFilter(record.attempts,
      (attempt) => attempt.outcome === OUTCOME.SERIALIZATION_CONFLICT).length;
    switch (record.outcome) {
    case OUTCOME.UNISSUED:
      accounting.unissued += 1;
      continue;
    case OUTCOME.COMMITTED:
      accounting.committed += 1;
      break;
    case OUTCOME.SERIALIZATION_CONFLICT:
      accounting.conflictExhausted += 1;
      break;
    case OUTCOME.TERMINAL_FAILURE:
      accounting.terminalFailures[record.failureClass] += 1;
      break;
    default:
      accounting.unresolved += 1;
      if (record.failureClass === FAILURE_CLASS.AMBIGUOUS_COMMIT) {
        accounting.ambiguousCommits += 1;
      }
    }
    accounting.issued += 1;
  }
  accounting.terminalFailures = Object.freeze(accounting.terminalFailures);
  return Object.freeze(accounting);
}

function sumTerminalFailures(terminalFailures) {
  return TERMINAL_FAILURE_CLASSES.reduce((sum, name) =>
    sum + safeCount(terminalFailures[name], `terminalFailures.${name}`), 0);
}

// Throws on any violated invariant; never repairs a count.
function validateBenchmarkAccounting(records) {
  if (!Array.isArray(records)) throw new Error('benchmark accounting requires records');
  const opIds = new Set();
  for (const record of records) {
    if (typeof record?.opId !== 'string' || record.opId === '') {
      throw new Error('benchmark request record requires opId');
    }
    if (opIds.has(record.opId)) throw new Error(`duplicate benchmark opId ${record.opId}`);
    opIds.add(record.opId);
    requireOutcomeShape(record);
    requireTimingShape(record);
  }
  const accounting = summarizeBenchmarkAccounting(records);
  for (const [name, value] of Object.entries(accounting)) {
    if (name !== 'terminalFailures') safeCount(value, name);
  }
  if (accounting.offered !== accounting.issued + accounting.unissued) {
    throw new Error('benchmark accounting violates offered = issued + unissued');
  }
  const settled = accounting.committed + accounting.conflictExhausted +
    sumTerminalFailures(accounting.terminalFailures) + accounting.unresolved;
  if (accounting.issued !== settled) {
    throw new Error('benchmark accounting violates issued = committed + conflictExhausted + ' +
      'terminalFailures + unresolved');
  }
  if (accounting.attempts < accounting.issued) {
    throw new Error('benchmark accounting violates attempts >= issued');
  }
  return accounting;
}

function latencyOf(records, predicate) {
  return summarizeOltpBaselineLatencies(arrayMap(
    arrayFilter(records, predicate), ({latencyMs}) => latencyMs));
}

// Committed latency, all-completed-attempt latency, and an error rate whose
// denominator is every issued request including the unresolved ones.
function summarizeBenchmarkLatencies(records, accounting) {
  const completed = (record) => record.latencyMs !== null;
  const productFailures = accounting.conflictExhausted +
    sumTerminalFailures(accounting.terminalFailures) -
    accounting.terminalFailures[FAILURE_CLASS.HARNESS_FAULT] + accounting.unresolved;
  return Object.freeze({
    quantileMethod: OLTP_LATENCY_QUANTILE_METHOD,
    latency: latencyOf(records, (record) => record.outcome === OUTCOME.COMMITTED),
    attemptLatency: latencyOf(records, completed),
    unresolvedExcludedFromAttemptLatency: accounting.unresolved,
    maxLatencyMs: arraySome(records, completed) ?
      Math.max(...arrayMap(arrayFilter(records, completed), ({latencyMs}) => latencyMs)) :
      null,
    errorRate: accounting.issued > 0 ? productFailures / accounting.issued : null,
  });
}

function completedPerSec(committed, accountingWindowMs) {
  return accountingWindowMs > 0 ? committed / (accountingWindowMs / THOUSAND) : null;
}

export {
  FAILURE_CLASS,
  OUTCOME as OPERATION_OUTCOME,
  RESPONSE_EVIDENCE_ENCODING as BENCHMARK_RESPONSE_EVIDENCE_ENCODING,
  UNRESOLVED_REASON as BENCHMARK_UNRESOLVED_REASON,
  buildBenchmarkAttemptRecord,
  canonicalDigest as benchmarkCanonicalDigest,
  classifyBenchmarkAttemptFailure,
  computeExecutedOperationsDigest,
  describePlannedOperationSlice,
  operationId as benchmarkOperationId,
  completedPerSec as benchmarkCompletedPerSec,
  createHarnessFault as createBenchmarkHarnessFault,
  retainResponseEvidence as retainBenchmarkResponseEvidence,
  summarizeBenchmarkLatencies,
  validateBenchmarkAccounting,
};
