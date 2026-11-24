import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  REASON_PREFIX,
} from './benchmark-claim-admission.js';
import {
  ALL_RECORDS,
  appendInvalidationEntries,
  parseInvalidationLedger,
} from './benchmark-invalidation-ledger.js';

const stringTrim = Function.call.bind(String.prototype.trim);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringSplit = Function.call.bind(String.prototype.split);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const stringReplace = Function.call.bind(String.prototype.replace);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const arraySlice = Function.call.bind(Array.prototype.slice);
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const objectHasOwn = Object.hasOwn;
const objectValues = Object.values;

const OLTP_COMPARISON_HISTORY_SCHEMA_VERSION = 1;
const OLTP_COMPARISON_HISTORY_SUMMARY_SCHEMA_VERSION = 2;
const INVALIDATIONS_FILE_NAME = 'invalidations.ndjson';
const DEFAULT_COMPARISON_HISTORY_NDJSON_PATH = 'data/tidb-comparison/history.ndjson';
const DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH = 'data/tidb-comparison/progress-summary.json';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const optStr = (v, d) => (typeof v === 'string' && stringTrim(v)) ? stringTrim(v) : d;
const posFinite = (v) => numberIsFinite(v) && v > 0;
const validLat = (l) => Boolean(l && posFinite(l.p50) && posFinite(l.p95) && posFinite(l.p99));
const ratio = (a, b) => Number(numberToFixed(a / b, 6));

const BREAKDOWN_TRANSACTION_KEYS = Object.freeze([
  'offered',
  'issued',
  'unissued',
  'attempts',
  'conflicts',
  'conflictExhausted',
  'terminalFailures',
  'unresolved',
  'committed',
]);

function requireNonNegativeInt(value, name) {
  if (!numberIsInteger(value) || value < 0) {
    throw new Error(`Expected ${name} to be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function sumTerminalFailures(terminalFailures) {
  if (terminalFailures === undefined || terminalFailures === null) return 0;
  if (typeof terminalFailures === 'number') {
    return requireNonNegativeInt(terminalFailures, 'terminalFailures');
  }
  if (typeof terminalFailures !== 'object' || Array.isArray(terminalFailures)) {
    throw new Error('Expected terminalFailures to be a non-negative integer or breakdown object');
  }
  let sum = 0;
  for (const val of objectValues(terminalFailures)) {
    sum += requireNonNegativeInt(val, 'terminalFailures entry');
  }
  return sum;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object');
}

function extractNestedAccounting(input) {
  const candidates = [
    input.observations?.accounting,
    input.workload?.metrics?.accounting,
    input.metrics?.accounting,
    input.accounting,
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) return candidate;
  }
  return input;
}

function extractWorkloadAccountingObject(input) {
  if (!isPlainObject(input)) return null;
  return extractNestedAccounting(input);
}

function assertCanonicalAccountingInvariants({
  offered,
  issued,
  unissued,
  succeeded,
  failed,
  attempts,
  retries,
}) {
  if (issued + unissued !== offered) {
    throw new Error(
      `Transaction accounting invariant violated: issued (${issued}) + unissued (${unissued}) ` +
      `!== offered (${offered})`,
    );
  }
  if (succeeded + failed !== issued) {
    throw new Error(
      `Transaction accounting invariant violated: succeeded (${succeeded}) + failed (${failed}) ` +
      `!== issued (${issued})`,
    );
  }
  if (issued === 0 && attempts !== 0) {
    throw new Error(
      `Transaction accounting invariant violated: attempts (${attempts}) must be 0 when issued is 0`,
    );
  }
  if (issued > 0 && attempts < issued) {
    throw new Error(
      `Transaction accounting invariant violated: attempts (${attempts}) < issued (${issued})`,
    );
  }
  const expectedRetries = Math.max(0, attempts - issued);
  if (retries !== expectedRetries) {
    throw new Error(
      `Transaction accounting invariant violated: retries (${retries}) !== ` +
      `Math.max(0, attempts (${attempts}) - issued (${issued})) (${expectedRetries})`,
    );
  }
}

function buildEmptyCanonicalTransactions(offeredCount) {
  const offered = offeredCount !== undefined ?
    requireNonNegativeInt(offeredCount, 'offered') : 0;
  return Object.freeze({
    offered,
    issued: 0,
    unissued: offered,
    attempted: 0,
    measuredAttempted: 0,
    succeeded: 0,
    measuredSucceeded: 0,
    failed: 0,
    retries: 0,
    attempts: 0,
    conflicts: 0,
    conflictExhausted: 0,
    terminalFailures: 0,
    unresolved: 0,
  });
}

function intOrDefault(value, fallback, name) {
  return requireNonNegativeInt(value ?? fallback, name);
}

function resolveCommittedCount(accounting) {
  const val = accounting.committed ?? accounting.succeeded ?? accounting.measuredSucceeded ?? 0;
  return requireNonNegativeInt(val, 'committed');
}

function buildCanonicalHistoryTransactionsFromWorkload(workloadOrAccounting, options = {}) {
  const accounting = extractWorkloadAccountingObject(workloadOrAccounting);
  if (!accounting) {
    return buildEmptyCanonicalTransactions(options.offered);
  }
  const offered = intOrDefault(accounting.offered, options.offered ?? 0, 'offered');
  const issued = intOrDefault(accounting.issued, 0, 'issued');
  const unissued = intOrDefault(accounting.unissued, offered - issued, 'unissued');
  const attempts = intOrDefault(accounting.attempts, issued, 'attempts');
  const committed = resolveCommittedCount(accounting);
  const conflicts = intOrDefault(accounting.conflicts, 0, 'conflicts');
  const conflictExhausted = intOrDefault(accounting.conflictExhausted, 0, 'conflictExhausted');
  const terminalFailures = sumTerminalFailures(accounting.terminalFailures);
  const unresolved = intOrDefault(accounting.unresolved, 0, 'unresolved');
  const failed = conflictExhausted + terminalFailures + unresolved;
  const retries = Math.max(0, attempts - issued);
  assertCanonicalAccountingInvariants({
    offered,
    issued,
    unissued,
    succeeded: committed,
    failed,
    attempts,
    retries,
  });
  return Object.freeze({
    offered,
    issued,
    unissued,
    attempted: issued,
    measuredAttempted: issued,
    succeeded: committed,
    measuredSucceeded: committed,
    failed,
    retries,
    attempts,
    conflicts,
    conflictExhausted,
    terminalFailures,
    unresolved,
  });
}

function hasBreakdownTransactionFields(rawTx) {
  return arraySome(BREAKDOWN_TRANSACTION_KEYS, (key) => objectHasOwn(rawTx, key));
}

function resolveIssuedFromRaw(rawTx) {
  const candidate = rawTx.issued ?? rawTx.attempted ?? rawTx.measuredAttempted;
  const issued = requireNonNegativeInt(candidate, 'issued');
  if (rawTx.attempted !== undefined && rawTx.attempted !== issued) {
    throw new Error(
      `Transaction accounting invariant violated: attempted (${rawTx.attempted}) !== ` +
      `issued (${issued})`,
    );
  }
  if (rawTx.measuredAttempted !== undefined && rawTx.measuredAttempted !== issued) {
    throw new Error(
      `Transaction accounting invariant violated: measuredAttempted (${rawTx.measuredAttempted}) ` +
      `!== issued (${issued})`,
    );
  }
  return issued;
}

function resolveSucceededFromRaw(rawTx) {
  const candidate = rawTx.succeeded ?? rawTx.measuredSucceeded ?? rawTx.committed ?? 0;
  const succeeded = requireNonNegativeInt(candidate, 'succeeded');
  if (rawTx.committed !== undefined && rawTx.committed !== succeeded) {
    throw new Error(
      `Transaction accounting invariant violated: committed (${rawTx.committed}) !== ` +
      `succeeded (${succeeded})`,
    );
  }
  if (rawTx.measuredSucceeded !== undefined && rawTx.measuredSucceeded !== succeeded) {
    throw new Error(
      `Transaction accounting invariant violated: measuredSucceeded (${rawTx.measuredSucceeded}) ` +
      `!== succeeded (${succeeded})`,
    );
  }
  return succeeded;
}

function resolveFailedFromRaw(rawTx, issued, succeeded) {
  const hasFailureBreakdown = rawTx.conflictExhausted !== undefined ||
    rawTx.terminalFailures !== undefined ||
    rawTx.unresolved !== undefined;
  const conflictExhausted = requireNonNegativeInt(
    rawTx.conflictExhausted ?? 0,
    'conflictExhausted',
  );
  const terminalFailures = sumTerminalFailures(rawTx.terminalFailures);
  const unresolved = requireNonNegativeInt(rawTx.unresolved ?? 0, 'unresolved');
  const breakdownFailed = conflictExhausted + terminalFailures + unresolved;
  if (hasFailureBreakdown && rawTx.failed !== undefined && rawTx.failed !== breakdownFailed) {
    throw new Error(
      `Transaction accounting invariant violated: failed (${rawTx.failed}) !== ` +
      `conflictExhausted (${conflictExhausted}) + terminalFailures (${terminalFailures}) + ` +
      `unresolved (${unresolved}) (${breakdownFailed})`,
    );
  }
  const failed = rawTx.failed !== undefined ?
    requireNonNegativeInt(rawTx.failed, 'failed') :
    (hasFailureBreakdown ? breakdownFailed : Math.max(0, issued - succeeded));
  return {failed, conflictExhausted, terminalFailures, unresolved};
}

function normalizeTransactions(rawTx) {
  if (!rawTx || typeof rawTx !== 'object') return null;
  if (!hasBreakdownTransactionFields(rawTx)) {
    return Object.freeze({...rawTx});
  }
  const issued = resolveIssuedFromRaw(rawTx);
  const unissued = rawTx.unissued !== undefined ?
    requireNonNegativeInt(rawTx.unissued, 'unissued') :
    (rawTx.offered !== undefined ?
      Math.max(0, requireNonNegativeInt(rawTx.offered, 'offered') - issued) : 0);
  const offered = rawTx.offered !== undefined ?
    requireNonNegativeInt(rawTx.offered, 'offered') :
    (issued + unissued);
  const succeeded = resolveSucceededFromRaw(rawTx);
  const {failed, conflictExhausted, terminalFailures, unresolved} =
    resolveFailedFromRaw(rawTx, issued, succeeded);
  const attempts = rawTx.attempts !== undefined ?
    requireNonNegativeInt(rawTx.attempts, 'attempts') :
    (issued + requireNonNegativeInt(rawTx.retries ?? 0, 'retries'));
  const retries = rawTx.retries !== undefined ?
    requireNonNegativeInt(rawTx.retries, 'retries') :
    Math.max(0, attempts - issued);
  const conflicts = requireNonNegativeInt(rawTx.conflicts ?? retries, 'conflicts');
  assertCanonicalAccountingInvariants({
    offered,
    issued,
    unissued,
    succeeded,
    failed,
    attempts,
    retries,
  });
  return Object.freeze({
    offered,
    issued,
    unissued,
    attempted: issued,
    measuredAttempted: issued,
    succeeded,
    measuredSucceeded: succeeded,
    failed,
    retries,
    attempts,
    conflicts,
    conflictExhausted,
    terminalFailures,
    unresolved,
  });
}

function normalizeOptionalSha256(value, name) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`Expected ${name} to be string or null`);
  const trimmed = stringToLowerCase(stringTrim(value));
  if (trimmed === '' || trimmed === '-') return null;
  if (!SHA256_PATTERN.test(trimmed)) throw new Error(`Expected ${name} 64-hex SHA-256`);
  return trimmed;
}

function normalizeSystem(sys, name) {
  if (!sys?.present) return Object.freeze({present: false, version: null, commitSha: null});
  const version = typeof sys.version === 'string' ? stringTrim(sys.version) : '';
  const commitSha = typeof sys.commitSha === 'string' ? stringTrim(sys.commitSha) : '';
  if (!version || !commitSha) throw new Error(`System ${name} missing version or commitSha`);
  return Object.freeze({present: true, version, commitSha});
}

function normalizeCombinationFramework(rawFw) {
  const fw = rawFw || {};
  const frameworkVersion = optStr(fw.frameworkVersion, '');
  if (!frameworkVersion) throw new Error('frameworkVersion must be a non-empty string');
  const frameworkCommitSha = stringToLowerCase(optStr(fw.frameworkCommitSha, ''));
  if (!COMMIT_SHA_PATTERN.test(frameworkCommitSha)) {
    throw new Error('frameworkCommitSha must be a 7-40 lowercase hex string');
  }
  const scenarioId = optStr(fw.scenarioId, '');
  const profileId = optStr(fw.profileId, '');
  if (!scenarioId || !profileId) throw new Error('scenarioId and profileId are required');

  const profileSha256 = normalizeOptionalSha256(fw.profileSha256, 'profileSha256');
  const datasetSha256 = normalizeOptionalSha256(fw.datasetSha256, 'datasetSha256');
  const workloadPlanSha256 = normalizeOptionalSha256(fw.workloadPlanSha256, 'workloadPlanSha256');
  const measurementPlanSha256 = normalizeOptionalSha256(
    fw.measurementPlanSha256,
    'measurementPlanSha256',
  );
  const retryPolicyId = optStr(fw.retryPolicyId, 'none');
  const openLoopProfileId = optStr(fw.openLoopProfileId, 'closed-loop-v1');
  const comparisonView = optStr(fw.comparisonView, 'system-default');

  return Object.freeze({
    frameworkVersion, frameworkCommitSha, scenarioId, profileId, profileSha256,
    datasetSha256, workloadPlanSha256, measurementPlanSha256, retryPolicyId,
    openLoopProfileId, comparisonView,
  });
}

function normalizeCombinationSystems(systems) {
  const lagrange = normalizeSystem(systems?.lagrange, 'lagrange');
  const tidbTikv = normalizeSystem(systems?.tidbTikv, 'tidbTikv');
  if (!lagrange.present && !tidbTikv.present) {
    throw new Error('At least one of systems.lagrange or systems.tidbTikv must be present');
  }
  return Object.freeze({lagrange, tidbTikv});
}

function formatSystemTag(s) {
  return s.present ? `${s.version}@${s.commitSha}` : '-@-';
}

function formatCombinationKey(fw, systems) {
  const pSha = fw.profileSha256 || '-';
  const wSha = fw.workloadPlanSha256 || '-';
  const mSha = fw.measurementPlanSha256 || '-';
  return `fw=${fw.frameworkVersion}@${fw.frameworkCommitSha}|scenario=${fw.scenarioId}|` +
    `profile=${fw.profileId}:${pSha}|workload=${wSha}|measure=${mSha}|view=${fw.comparisonView}|` +
    `lagrange=${formatSystemTag(systems.lagrange)}|tidb=${formatSystemTag(systems.tidbTikv)}`;
}

function buildComparisonCombinationKey(input = {}) {
  const framework = normalizeCombinationFramework(input.framework || input);
  const systems = normalizeCombinationSystems(input.systems);
  const combinationKey = formatCombinationKey(framework, systems);
  const combinationSha256 = createHash('sha256').update(combinationKey).digest('hex');
  return Object.freeze({
    combinationKey, combinationSha256,
    framework,
    systems,
  });
}

function normalizeLatencyMetrics(l) {
  if (!l || typeof l !== 'object') return null;
  return Object.freeze({
    p50: typeof l.p50 === 'number' ? l.p50 : null,
    p95: typeof l.p95 === 'number' ? l.p95 : null,
    p99: typeof l.p99 === 'number' ? l.p99 : null,
  });
}

function normalizeSemanticProofMetrics(p) {
  if (!p || typeof p !== 'object') return null;
  return Object.freeze({
    passedCount: typeof p.passedCount === 'number' ? p.passedCount : 0,
    ...p,
  });
}

function normalizeSystemMetrics(m) {
  if (!m || typeof m !== 'object') return null;
  const opsPerSec = typeof m.opsPerSec === 'number' ? m.opsPerSec : null;
  const latencyMs = normalizeLatencyMetrics(m.latencyMs);
  const transactions = normalizeTransactions(m.transactions);
  const semanticProofs = normalizeSemanticProofMetrics(m.semanticProofs);
  const base = {opsPerSec, latencyMs, transactions, semanticProofs};
  if (m.scenarioBScorecard && typeof m.scenarioBScorecard === 'object') {
    return Object.freeze({
      ...base,
      scenarioBScorecard: Object.freeze({...m.scenarioBScorecard}),
    });
  }
  return Object.freeze(base);
}

function normalizeOptionalNonEmptyString(value) {
  return (typeof value === 'string' && stringTrim(value)) || null;
}

function normalizeEvidenceSource(rawSrc) {
  const src = rawSrc || {};
  const artifactKind = normalizeOptionalNonEmptyString(src.artifactKind);
  const sourcePath = normalizeOptionalNonEmptyString(src.sourcePath);
  return Object.freeze({
    kind: optStr(src.kind, 'unspecified'),
    runId: normalizeOptionalNonEmptyString(src.runId),
    issueNumber: numberIsInteger(src.issueNumber) ? src.issueNumber : null,
    url: normalizeOptionalNonEmptyString(src.url),
    artifactSha256: normalizeOptionalSha256(src.artifactSha256, 'artifactSha256'),
    ...(artifactKind ? {artifactKind} : {}),
    ...(sourcePath ? {sourcePath} : {}),
  });
}

function computeThroughputComparison(lagrange, tidbTikv) {
  const hasOps = typeof lagrange?.opsPerSec === 'number' && lagrange.opsPerSec > 0 &&
    typeof tidbTikv?.opsPerSec === 'number' && tidbTikv.opsPerSec > 0;
  if (!hasOps) {
    return {
      throughputRatioLagrangeToTiDb: null,
      throughputLagFactorTiDbOverLagrange: null,
    };
  }
  return {
    throughputRatioLagrangeToTiDb: ratio(lagrange.opsPerSec, tidbTikv.opsPerSec),
    throughputLagFactorTiDbOverLagrange: ratio(tidbTikv.opsPerSec, lagrange.opsPerSec),
  };
}

function computeLatencyComparison(lagrange, tidbTikv) {
  const lLat = lagrange?.latencyMs;
  const tLat = tidbTikv?.latencyMs;
  if (!validLat(lLat) || !validLat(tLat)) {
    return null;
  }
  return Object.freeze({
    p50: ratio(lLat.p50, tLat.p50),
    p95: ratio(lLat.p95, tLat.p95),
    p99: ratio(lLat.p99, tLat.p99),
  });
}

function computeSemanticProofDelta(lagrange, tidbTikv) {
  const hasProofs = typeof lagrange?.semanticProofs?.passedCount === 'number' &&
    typeof tidbTikv?.semanticProofs?.passedCount === 'number';
  return hasProofs ?
    (lagrange.semanticProofs.passedCount - tidbTikv.semanticProofs.passedCount) : null;
}

function computeComparisonSummary(lagrange, tidbTikv) {
  const paired = Boolean(lagrange && tidbTikv);
  const throughput = computeThroughputComparison(lagrange, tidbTikv);
  const latencyRatioLagrangeOverTiDb = computeLatencyComparison(lagrange, tidbTikv);
  const semanticProofDeltaLagrangeMinusTiDb = computeSemanticProofDelta(lagrange, tidbTikv);
  return Object.freeze({
    paired,
    throughputRatioLagrangeToTiDb: throughput.throughputRatioLagrangeToTiDb,
    throughputLagFactorTiDbOverLagrange: throughput.throughputLagFactorTiDbOverLagrange,
    latencyRatioLagrangeOverTiDb,
    semanticProofDeltaLagrangeMinusTiDb,
  });
}

function createComparisonHistoryRecord(input = {}) {
  const combination = buildComparisonCombinationKey(input);
  const recordedAt = optStr(input.recordedAt, '');
  if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) {
    throw new Error('recordedAt must be a valid non-empty ISO timestamp string');
  }

  const evidenceSource = normalizeEvidenceSource(input.evidenceSource);
  const lagrange = normalizeSystemMetrics(input.metrics?.lagrange);
  const tidbTikv = normalizeSystemMetrics(input.metrics?.tidbTikv);
  const metrics = Object.freeze({lagrange, tidbTikv});
  const comparison = computeComparisonSummary(lagrange, tidbTikv);

  const payload = {
    schemaVersion: OLTP_COMPARISON_HISTORY_SCHEMA_VERSION,
    combinationKey: combination.combinationKey,
    combinationSha256: combination.combinationSha256,
    framework: combination.framework,
    systems: combination.systems,
    recordedAt,
    evidenceSource,
    metrics,
    comparison,
  };
  const recordSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return Object.freeze({...payload, recordSha256});
}

function validateComparisonHistoryRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('record must be an object');
  const exp = createComparisonHistoryRecord(record);
  if (record.combinationKey !== exp.combinationKey ||
      record.combinationSha256 !== exp.combinationSha256 ||
      record.recordSha256 !== exp.recordSha256) {
    throw new Error(`Record validation failed: ${exp.combinationKey}`);
  }
  return exp;
}

function compareRecordsChronologically(a, b) {
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  return a.combinationSha256 === b.combinationSha256 ? 0 :
    (a.combinationSha256 < b.combinationSha256 ? -1 : 1);
}

function parseComparisonHistoryNdjson(text) {
  if (typeof text !== 'string') throw new Error('parseComparisonHistoryNdjson requires string');
  const lines = arrayFilter(stringSplit(text, '\n'), (l) => stringTrim(l).length > 0);
  const records = arrayMap(lines,
    (l) => validateComparisonHistoryRecord(JSON.parse(stringTrim(l))));
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.recordSha256)) {
      throw new Error(`History holds a duplicate record ${record.recordSha256}`);
    }
    seen.add(record.recordSha256);
  }
  return Object.freeze(records);
}

// History is append-only (R21): a new record is appended; a record whose
// recordSha256 is already present is refused, never replaced.
function appendComparisonHistoryRecord(existingRecords, newRecord) {
  if (!Array.isArray(existingRecords)) throw new Error('existingRecords must be an array');
  const validNew = validateComparisonHistoryRecord(newRecord);
  if (arraySome(existingRecords, (r) => r.recordSha256 === validNew.recordSha256)) {
    throw new Error(`Refusing duplicate history record ${validNew.recordSha256}`);
  }
  return Object.freeze([...existingRecords, validNew]);
}

function historyInvalidationsFor(record, invalidations) {
  return arrayFilter(invalidations, (inv) =>
    inv.scope.file === DEFAULT_COMPARISON_HISTORY_NDJSON_PATH &&
    (inv.scope.receiptIds === ALL_RECORDS ||
      arrayIncludes(inv.scope.receiptIds, record.recordSha256)));
}

// History records are forensic: none is admissible as a current claim. The entry
// names the record and its invalidations; it republishes no metric.
function buildHistoryAdmission(record, invalidations) {
  const covering = historyInvalidationsFor(record, invalidations);
  const reasons = [ADMISSION_REASON.FORENSIC_RECORD];
  const defectIds = [];
  for (const inv of covering) {
    reasons.push(`${REASON_PREFIX.INVALIDATED}${inv.id}`, ...inv.reasons);
    defectIds.push(...inv.defectIds);
  }
  return Object.freeze({
    status: CLAIM_CELL_STATUS.INVALID_MEASUREMENT,
    reasons: Object.freeze([...new Set(reasons)].sort()),
    defectIds: Object.freeze([...new Set(defectIds)].sort()),
  });
}

// What the withdrawal of the published figures rests on, counted from the data:
// ledger entries that name defect ids, entries that enumerate their records by id
// (the rest name them by file and campaign commit), and history records no entry
// covers, withdrawn only by the forensic admission rule.
function summarizeBenchmarkWithdrawal(records, invalidations) {
  const count = (items, predicate) => arrayFilter(items, predicate).length;
  return Object.freeze({
    ledgerEntries: invalidations.length,
    entriesWithDefectIds: count(invalidations, (inv) => inv.defectIds.length > 0),
    entriesWithRecordIds: count(invalidations, (inv) => inv.scope.receiptIds !== ALL_RECORDS),
    historyRecords: records.length,
    historyRecordsWithoutEntry: count(records, (record) =>
      historyInvalidationsFor(record, invalidations).length === 0),
    admissionRule: ADMISSION_REASON.FORENSIC_RECORD,
  });
}

// The progress summary is the mutable index over the history: the latest record
// per combination key, with its admission status. Every record stays in history.
function buildComparisonProgressSummary(records, options = {}) {
  if (!Array.isArray(records)) {
    throw new Error('buildComparisonProgressSummary requires an array argument');
  }
  const invalidations = Array.isArray(options.invalidations) ? options.invalidations : [];
  const validated = arrayMap(records, validateComparisonHistoryRecord);
  const latest = new Map();
  const counts = new Map();
  for (const record of arraySort(arraySlice(validated), compareRecordsChronologically)) {
    latest.set(record.combinationSha256, record);
    counts.set(record.combinationSha256, (counts.get(record.combinationSha256) || 0) + 1);
  }
  const entries = arrayMap(
    arraySort([...latest.values()], compareRecordsChronologically),
    (record) => Object.freeze({
      recordSha256: record.recordSha256,
      combinationSha256: record.combinationSha256,
      recordedAt: record.recordedAt,
      framework: record.framework,
      systems: record.systems,
      evidenceSource: record.evidenceSource,
      recordsForCombination: counts.get(record.combinationSha256),
      admission: buildHistoryAdmission(record, invalidations),
    }),
  );
  const summaryPayload = {
    schemaVersion: OLTP_COMPARISON_HISTORY_SUMMARY_SCHEMA_VERSION,
    totalRecords: validated.length,
    totalCombinations: entries.length,
    entries: Object.freeze(entries),
    withdrawal: summarizeBenchmarkWithdrawal(validated, invalidations),
  };
  const summarySha256 =
    createHash('sha256').update(JSON.stringify(summaryPayload)).digest('hex');
  return Object.freeze({...summaryPayload, summarySha256});
}

function matchesScenarioAndProfile(framework, scenarioId, profileId) {
  if (framework?.scenarioId !== scenarioId) return false;
  return !profileId || framework?.profileId === profileId;
}

function matchesSystems(systems, lagrangeVersion, tidbVersion) {
  if (systems?.lagrange?.version !== lagrangeVersion) return false;
  return systems?.tidbTikv?.version === tidbVersion;
}

function matchesRecordVersions(record, criteria) {
  if (!matchesScenarioAndProfile(record?.framework, criteria.scenarioId, criteria.profileId)) {
    return false;
  }
  return matchesSystems(record?.systems, criteria.lagrangeVersion, criteria.tidbVersion);
}

function findMatchingExistingRecord(existingRecords, record) {
  const criteria = {
    scenarioId: record?.framework?.scenarioId,
    profileId: record?.framework?.profileId,
    lagrangeVersion: record?.systems?.lagrange?.version,
    tidbVersion: record?.systems?.tidbTikv?.version,
  };
  return arrayFilter(existingRecords, (r) => matchesRecordVersions(r, criteria));
}

function shouldSkipUnchangedRun(options, existingRecords) {
  if (options.skipIfSystemVersionsUnchanged !== true || options.forceRerun === true) {
    return false;
  }
  const matched = findMatchingExistingRecord(existingRecords, options.record);
  return matched.length > 0;
}

async function readExistingText(ndjsonPath) {
  try {
    return await fs.readFile(ndjsonPath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return '';
    throw err;
  }
}

// The ledger lives beside the history file.
async function readLedgerBeside(ndjsonPath) {
  const ledgerPath = path.join(path.dirname(path.resolve(ndjsonPath)), INVALIDATIONS_FILE_NAME);
  const text = await readExistingText(ledgerPath);
  return parseInvalidationLedger(text);
}

async function writeSummary(summaryPath, summary) {
  await fs.mkdir(path.dirname(path.resolve(summaryPath)), {recursive: true});
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
}

async function recordComparisonResultToDisk(options = {}) {
  if (!options?.record) throw new Error('recordComparisonResultToDisk requires record');
  const ndjsonPath = options.ndjsonPath || DEFAULT_COMPARISON_HISTORY_NDJSON_PATH;
  const summaryPath = options.summaryPath || DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH;
  const existingText = await readExistingText(ndjsonPath);
  const existingRecords = parseComparisonHistoryNdjson(existingText);
  const invalidations = await readLedgerBeside(ndjsonPath);
  if (shouldSkipUnchangedRun(options, existingRecords)) {
    return Object.freeze({
      skipped: true,
      records: existingRecords,
      summary: buildComparisonProgressSummary(existingRecords, {invalidations}),
    });
  }
  const records = appendComparisonHistoryRecord(existingRecords, options.record);
  if (existingText !== '' && !stringEndsWith(existingText, '\n')) {
    throw new Error(`${ndjsonPath} lacks a final newline; refusing to append`);
  }
  await fs.mkdir(path.dirname(path.resolve(ndjsonPath)), {recursive: true});
  await fs.appendFile(ndjsonPath, `${JSON.stringify(records[records.length - 1])}\n`, 'utf8');
  const summary = buildComparisonProgressSummary(records, {invalidations});
  await writeSummary(summaryPath, summary);
  return Object.freeze({records, summary, skipped: false});
}

const LAB_BENCH_ROOT = '/mnt/data/peter/projects/lagrange-takeover-20261121/lab';
const RAW_OBS_PATH = 'data/tidb-comparison/raw-observations.ndjson';
const UNISSUED_100_ACCOUNTING = Object.freeze({
  offered: 100, issued: 0, unissued: 100, attempts: 0, committed: 0,
  conflicts: 0, conflictExhausted: 0, terminalFailures: 0, unresolved: 0,
});
const UNISSUED_0_ACCOUNTING = Object.freeze({
  offered: 0, issued: 0, unissued: 0, attempts: 0, committed: 0,
  conflicts: 0, conflictExhausted: 0, terminalFailures: 0, unresolved: 0,
});
const TIDB_100_COMMITTED_ACCOUNTING = Object.freeze({
  offered: 100, issued: 100, unissued: 0, attempts: 100, committed: 100,
  conflicts: 0, conflictExhausted: 0, terminalFailures: 0, unresolved: 0,
});

// Authoritative per-run provenance and canonical outcome breakdown for the 23
// 2026-11-23..24 history rows (lines 21-43 of data/tidb-comparison/history.ndjson).
const NOV_2026_HISTORY_RECONCILIATION_SPECS = Object.freeze({
  'bench-gcp-lagrange-smoke-234f478e0-20261123-r001': Object.freeze({
    withdrawnRecordSha256: '02cb32c61e4ce8968bff4c272ed1ca2eed3bfc79b8205e29ce40647673a6b9c6',
    artifactSha256: '93e743a70efd7d3c678715555d796d866e6700a01b1b1a1b37e5b078b19a8d75',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-234f478e0-20261123-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'bench-gcp-lagrange-smoke-357783544-20261123-r001': Object.freeze({
    withdrawnRecordSha256: '0271fe00357afdf17c1634125621ffb7fc3aa064d45d06deca159c19ace6cc69',
    artifactSha256: '08cd184797611d285e7ac3860980660abfb73f5bfd1fd81d3cd1a0fe0fa961ca',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-357783544-20261123-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'bench-gcp-lagrange-smoke-09e4e64ea-v2-20261123-r001': Object.freeze({
    withdrawnRecordSha256: '45071ffbbb3f182ee8102c4ba1e335259631fead6b9fe5a9cfe243d70e9e9718',
    artifactSha256: '4e923646095f3041e6bb178811f83110e9a0930d48ab298a24327df0372d7d17',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-09e4e64ea-v2-20261123-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'bench-gcp-lagrange-smoke-480cf0f29-20261123-r001': Object.freeze({
    withdrawnRecordSha256: '30407165e3c5a8329f628f2722158273009e82833b705cf142f547dcf794cdb3',
    artifactSha256: '54080bc93264d1b67e6f5953ef7801f6c977edf18f1d03c406f8ae0ef104c2d4',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-480cf0f29-20261123-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'bench-gcp-lagrange-smoke-480cf0f29-r2-20261123-r001': Object.freeze({
    withdrawnRecordSha256: 'b088457700f6b99f8fb8d075579365db93df86cdad7c2bdcb810b3a3c0a389cd',
    artifactSha256: '77443a45c5fc68388be014b1b22e46a778d27dd041e395e78ea872767f78a2ec',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-480cf0f29-r2-20261123-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'bench-gcp-lagrange-smoke-3908f1e59-20261123-r001': Object.freeze({
    withdrawnRecordSha256: '1b3dc052e33adda42fea56a8739bd63bdce2b55721fcf862d40a6e4735f622e4',
    artifactSha256: '702829d8a62432b63ba19b244ba500cc3a308937448f2f03bfb347276e59ede5',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-3908f1e59-20261123-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'bench-gcp-lagrange-smoke-b1e097b09-20261124-r001': Object.freeze({
    withdrawnRecordSha256: '22233b4ae3dbf82f910ab65a266fcb78b6c587c8e16aeea4c46f8e759b042f1c',
    artifactSha256: 'bb0378fa070837466cf2bfe59baf33453fceaf1df9fc003de667a876a638242b',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-b1e097b09-20261124-r001`,
    lagrangeAccounting: Object.freeze({
      offered: 100, issued: 100, unissued: 0, attempts: 143, committed: 98,
      conflicts: 45, conflictExhausted: 2, terminalFailures: 0, unresolved: 0,
    }),
    tidbAccounting: TIDB_100_COMMITTED_ACCOUNTING,
  }),
  'bench-gcp-3sys-smoke-887007107-20261124-r001': Object.freeze({
    withdrawnRecordSha256: '2f69d8b5ef9ac5313abb47583eb7312c17dc925cd9a8e4ff03ab88ec9d70803e',
    artifactSha256: 'bece660d8bda3ad63a21e8f731a0244fc1e75e5949fcaade5b91c6454bd848ab',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-3sys-smoke-887007107-20261124-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
    tidbAccounting: TIDB_100_COMMITTED_ACCOUNTING,
  }),
  'bench-gcp-lagrange-smoke-887007107-r2-20261124-r001': Object.freeze({
    withdrawnRecordSha256: 'bf8769ce47c5347629b7391edc15ff6e28c47786526472c73824458a8a7e5981',
    artifactSha256: 'c25dde4efd0fffb5c38760dc92b5104734cd8ccdf8605c9aa067478fb65755b2',
    artifactKind: 'raw-observation-run-record',
    sourcePath: `${RAW_OBS_PATH}#bench-gcp-lagrange-smoke-887007107-r2-20261124-r001`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-9265a47d2': Object.freeze({
    withdrawnRecordSha256: 'd4ddf353fda70f2d57c41e5c282cf6634423c1bfa3a91b2e9884699f341cf4e5',
    artifactSha256: '915e5bf5798c4ec99cbb65080cdec51a882ced371db650f6f00f8967d77ee851',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-9265a47d2/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-b0365602b': Object.freeze({
    withdrawnRecordSha256: 'ab02c707e1547724dfc6ec8d7421cb6b52dd48e730a2f428eea1dbb17a6bb050',
    artifactSha256: 'e191c8fa7747fc3b6228b1903a1653c2969fda362cc3f93ca7ec38a20d4ea0d3',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-b0365602b/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-b4521acd8': Object.freeze({
    withdrawnRecordSha256: '1af1848e5080e49e42755e83a37b8d67ee43fd61b41e1d2e3cc9eef07b706990',
    artifactSha256: '934b87890e3c08c99e797d02dc5075247d54113f230fbea30901a53f163d94e1',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-b4521acd8/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-stage3-wifi-eval-b1b35a6bb': Object.freeze({
    withdrawnRecordSha256: 'd3946dba5bbf448ab2184f3e1e036b15d4f5181b0dd400e2e8dab2046e4da519',
    artifactSha256: '7ae5d25788fe47cc668ea35066295d08af4ba11e5d9e25898c3129775a93e3c8',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-b1b35a6bb/tv-dator-stage3-wifi-eval/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-3f963bfe1': Object.freeze({
    withdrawnRecordSha256: '4c7b5c0e44a5bc123d8c0d7d6d046048d2c4329369d4fe853fc689eb9159a70b',
    artifactSha256: '0b0e60d3ea2e5630aa3d8d1fbdce01f90e5076de8fb32ac98d10fda0da103e68',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-3f963bfe1/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-3c2d9cd8b': Object.freeze({
    withdrawnRecordSha256: 'f6f4df17eaab8e4dd06e2c58bf4b1b527c79826951447bf6e07cd63eecbd95b9',
    artifactSha256: 'ade7c61984736a40ee97302570ee65d18bf502311ef78020f44c16c17bce4990',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-3c2d9cd8b/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-full-3c2d9cd8b': Object.freeze({
    withdrawnRecordSha256: '4eb6af934ded9a4681ae1c480582d6cbb713adfd0ddb84ad49a2dd33790a68b7',
    artifactSha256: 'c880b41ddaa454f515d7ece97ea7713ab637a998c0165a0c94da26065aaaee26',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-3c2d9cd8b/tv-dator-3node-smoke-full/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-47b3d57da': Object.freeze({
    withdrawnRecordSha256: '58f5a3364fd72873140badb18c94014d16459fbdbfa48e3e11808bf8bbd001e0',
    artifactSha256: 'aaa6e54be4d28e9f41f247b44e1af15d9e35160b332a7552e33065f7b580e767',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-47b3d57da/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-full-47b3d57da': Object.freeze({
    withdrawnRecordSha256: '9e1a7915b3a5ae2b3170122d25010bc57980792ab5ad966df8a6080e57cc7724',
    artifactSha256: '64d7d06d64cc1e5c08494b57d5032edebbed360f4e82515f85205cfd0b0bfadd',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-47b3d57da/tv-dator-3node-smoke-full/receipt.json`,
    lagrangeAccounting: UNISSUED_100_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-5bdd4f221': Object.freeze({
    withdrawnRecordSha256: 'bc4600edaecb4b283e64d60058a19c361db921fd55336d58719e180723488e74',
    artifactSha256: '87887c30b89699686ffdfa9bd235f68a7698c4ce46f8d3d252d39669d5fe0960',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-5bdd4f221/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-613b120ac': Object.freeze({
    withdrawnRecordSha256: 'b5d270ef55e1d6eeea307fec45cb398f54f9893453d168460c91ac0fc844bd8f',
    artifactSha256: '8bbe922068ce612f46b1db71f9c3532be427cb815eeabde81c7b278b8d61cb03',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-613b120ac/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: Object.freeze({
      offered: 100, issued: 100, unissued: 0, attempts: 140, committed: 95,
      conflicts: 44, conflictExhausted: 4,
      terminalFailures: Object.freeze({
        product_error: 1, correctness_failure: 0, transport_failure: 0, harness_fault: 0,
      }),
      unresolved: 0,
    }),
  }),
  'tv-dator-stage3-wifi-eval-613b120ac': Object.freeze({
    withdrawnRecordSha256: '4c7dc9719235561d00f49df9c5cb314dd41e8051e2df1065a461c147a4bb6c40',
    artifactSha256: '86c343c8eebf1570e6910462de9000dbd54b903c1e887f0f57e6d625d93555e8',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-613b120ac/tv-dator-stage3-wifi-eval/receipt.json`,
    lagrangeAccounting: UNISSUED_0_ACCOUNTING,
  }),
  'tv-dator-3node-smoke-b1e097b09': Object.freeze({
    withdrawnRecordSha256: '30e663c97e0eb0f1e3f6bef3ac7c6b7e17146df45291af7cb92043d8c9cc43e4',
    artifactSha256: '156a4ba0f97da35633e3f562e07ab8bfda61791a74acb3caad6cde803016abc3',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-b1e097b09/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: Object.freeze({
      offered: 100, issued: 100, unissued: 0, attempts: 141, committed: 96,
      conflicts: 45, conflictExhausted: 4, terminalFailures: 0, unresolved: 0,
    }),
  }),
  'tv-dator-3node-smoke-887007107': Object.freeze({
    withdrawnRecordSha256: '7473cf1aaddc889de83f0c067ff93f3df837e46279a39f8a1dd2c70da6e3e52c',
    artifactSha256: '5420fc82e64c9107457c2f571608cc5d882250cff131c7118bd6e296871fb62e',
    artifactKind: 'lab-tv-dator-receipt-json',
    sourcePath: `${LAB_BENCH_ROOT}/lab-bench-887007107/tv-dator-3node-smoke/receipt.json`,
    lagrangeAccounting: Object.freeze({
      offered: 100, issued: 100, unissued: 0, attempts: 128, committed: 98,
      conflicts: 30, conflictExhausted: 2, terminalFailures: 0, unresolved: 0,
    }),
  }),
});

function nextInvalidationId(existingInvalidations) {
  let maxNum = 0;
  for (const inv of existingInvalidations) {
    const num = Number(stringReplace(String(inv.id || ''), /^inv-/u, ''));
    if (numberIsInteger(num) && num > maxNum) maxNum = num;
  }
  return `inv-${stringPadStart(String(maxNum + 1), 4, '0')}`;
}

function buildReconciledHistoryRecord(oldRecord, spec) {
  const lagrangeMetrics = oldRecord.metrics?.lagrange ? {
    ...oldRecord.metrics.lagrange,
    transactions: buildCanonicalHistoryTransactionsFromWorkload(spec.lagrangeAccounting),
  } : null;
  const tidbMetrics = oldRecord.metrics?.tidbTikv ? {
    ...oldRecord.metrics.tidbTikv,
    transactions: spec.tidbAccounting ?
      buildCanonicalHistoryTransactionsFromWorkload(spec.tidbAccounting) :
      oldRecord.metrics.tidbTikv.transactions,
  } : null;
  return createComparisonHistoryRecord({
    framework: oldRecord.framework,
    systems: oldRecord.systems,
    recordedAt: oldRecord.recordedAt,
    evidenceSource: {
      ...oldRecord.evidenceSource,
      artifactSha256: spec.artifactSha256,
      artifactKind: spec.artifactKind,
      sourcePath: spec.sourcePath,
    },
    metrics: {
      lagrange: lagrangeMetrics,
      tidbTikv: tidbMetrics,
    },
  });
}

function buildNov2026ComparisonHistoryReconciliation({
  existingRecords,
  existingInvalidations = [],
  recordedAt = new Date().toISOString(),
  recordedBy = 'evidence-report-owner',
  extraRecords = [],
}) {
  const specsValues = objectValues(NOV_2026_HISTORY_RECONCILIATION_SPECS);
  const withdrawnRecordIds = arrayMap(specsValues, (s) => s.withdrawnRecordSha256);
  const withdrawnSet = new Set(withdrawnRecordIds);
  const matchedOldRecords = arrayFilter(
    existingRecords,
    (r) => withdrawnSet.has(r.recordSha256),
  );
  const correctedRecords = arrayMap(matchedOldRecords, (oldRecord) => {
    const spec = NOV_2026_HISTORY_RECONCILIATION_SPECS[oldRecord.evidenceSource?.runId];
    if (!spec || spec.withdrawnRecordSha256 !== oldRecord.recordSha256) {
      throw new Error(`Missing reconciliation spec for history record ${oldRecord.recordSha256}`);
    }
    return buildReconciledHistoryRecord(oldRecord, spec);
  });
  const validatedExtras = arrayMap(extraRecords, createComparisonHistoryRecord);
  const invalidationEntry = Object.freeze({
    id: nextInvalidationId(existingInvalidations),
    recordedAt,
    scope: Object.freeze({
      file: DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
      campaignGitCommit: null,
      receiptIds: Object.freeze(withdrawnRecordIds),
    }),
    reasons: Object.freeze([
      ADMISSION_REASON.PLANNED_COUNTS_MISMATCH,
      ADMISSION_REASON.IDENTITY_MISMATCH,
    ]),
    defectIds: Object.freeze([]),
    note: 'Withdraw 2026-11-23..24 history records (lines 21-43) whose transaction summary ' +
      'conflated offered with attempted/issued, dropped terminal product_error from failed on ' +
      '613b120ac, recorded raw conflicts as retries, or omitted/reused local tv-dator ' +
      'receipt.json artifactSha256 digests; superseded by canonically accounted and ' +
      'per-receipt-bound history records.',
    recordedBy,
  });
  return Object.freeze({
    invalidationEntry,
    withdrawnRecordIds: Object.freeze(withdrawnRecordIds),
    correctedRecords: Object.freeze([...correctedRecords, ...validatedExtras]),
  });
}

async function reconcileNov2026ComparisonHistoryToDisk(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const ndjsonPath = options.ndjsonPath ||
    path.resolve(rootDir, DEFAULT_COMPARISON_HISTORY_NDJSON_PATH);
  const summaryPath = options.summaryPath ||
    path.resolve(rootDir, DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH);
  const ledgerPath = options.ledgerPath ||
    path.join(path.dirname(path.resolve(ndjsonPath)), INVALIDATIONS_FILE_NAME);
  const existingText = await readExistingText(ndjsonPath);
  const existingRecords = parseComparisonHistoryNdjson(existingText);
  const existingInvalidations = parseInvalidationLedger(await readExistingText(ledgerPath));
  const plan = buildNov2026ComparisonHistoryReconciliation({
    existingRecords,
    existingInvalidations,
    recordedAt: options.recordedAt || new Date().toISOString(),
    recordedBy: options.recordedBy || 'evidence-report-owner',
    extraRecords: options.extraRecords || [],
  });
  appendInvalidationEntries(ledgerPath, [plan.invalidationEntry]);
  let records = existingRecords;
  let toAppend = '';
  for (const rec of plan.correctedRecords) {
    records = appendComparisonHistoryRecord(records, rec);
    toAppend += `${JSON.stringify(rec)}\n`;
  }
  if (existingText !== '' && !stringEndsWith(existingText, '\n')) {
    throw new Error(`${ndjsonPath} lacks a final newline; refusing to append`);
  }
  await fs.appendFile(ndjsonPath, toAppend, 'utf8');
  const updatedInvalidations = parseInvalidationLedger(await readExistingText(ledgerPath));
  const summary = buildComparisonProgressSummary(records, {invalidations: updatedInvalidations});
  await writeSummary(summaryPath, summary);
  return Object.freeze({
    invalidationEntry: plan.invalidationEntry,
    appendedRecords: plan.correctedRecords,
    records,
    summary,
  });
}

export {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
  NOV_2026_HISTORY_RECONCILIATION_SPECS,
  appendComparisonHistoryRecord,
  buildCanonicalHistoryTransactionsFromWorkload,
  buildComparisonCombinationKey,
  buildComparisonProgressSummary,
  createComparisonHistoryRecord,
  normalizeTransactions,
  parseComparisonHistoryNdjson,
  reconcileNov2026ComparisonHistoryToDisk,
  recordComparisonResultToDisk,
  summarizeBenchmarkWithdrawal,
  validateComparisonHistoryRecord,
};
