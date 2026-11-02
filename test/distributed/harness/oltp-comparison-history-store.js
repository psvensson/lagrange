import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  REASON_PREFIX,
} from './benchmark-claim-admission.js';
import {ALL_RECORDS, parseInvalidationLedger} from './benchmark-invalidation-ledger.js';

const stringTrim = Function.call.bind(String.prototype.trim);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringSplit = Function.call.bind(String.prototype.split);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const arraySlice = Function.call.bind(Array.prototype.slice);
const numberIsFinite = Number.isFinite;
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

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
  const measurementPlanSha256 = normalizeOptionalSha256(fw.measurementPlanSha256, 'measurementPlanSha256');
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
  const transactions = (m.transactions && typeof m.transactions === 'object') ?
    Object.freeze({...m.transactions}) : null;
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
  return Object.freeze({
    kind: optStr(src.kind, 'unspecified'),
    runId: normalizeOptionalNonEmptyString(src.runId),
    issueNumber: Number.isInteger(src.issueNumber) ? src.issueNumber : null,
    url: normalizeOptionalNonEmptyString(src.url),
    artifactSha256: normalizeOptionalSha256(src.artifactSha256, 'artifactSha256'),
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

export {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  DEFAULT_COMPARISON_PROGRESS_SUMMARY_PATH,
  appendComparisonHistoryRecord,
  buildComparisonCombinationKey,
  createComparisonHistoryRecord,
  validateComparisonHistoryRecord,
  parseComparisonHistoryNdjson,
  summarizeBenchmarkWithdrawal,
  buildComparisonProgressSummary,
  recordComparisonResultToDisk,
};
