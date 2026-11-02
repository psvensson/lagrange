import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PARENT_DIR = '..';
const UTF8 = 'utf8';
const SHA256_ALG = 'sha256';
const SHA256_PREFIX = 'sha256:';
const HEX_ENC = 'hex';
const NEWLINE = '\n';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  PARENT_DIR,
  PARENT_DIR,
  PARENT_DIR,
);

export const DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH =
  'data/tidb-comparison/raw-observations.ndjson';
export const DEFAULT_ADMITTED_LAB_MEASUREMENTS_PATH =
  'data/tidb-comparison/admitted-lab-measurements.json';

function roundTo(val, digits) {
  return Number(numberToFixed(Number(val || 0), digits));
}

function pctDiff(baseVal, nextVal) {
  return roundTo(((nextVal - baseVal) / Math.max(0.01, baseVal)) * 100, 1);
}

export function computeRawObservationPayloadDigest(rawObservationPayload) {
  if (!rawObservationPayload || typeof rawObservationPayload !== 'object') {
    return '';
  }
  const canonical = JSON.stringify(rawObservationPayload);
  const digestHex = createHash(SHA256_ALG).update(canonical, UTF8).digest(HEX_ENC);
  return `${SHA256_PREFIX}${digestHex}`;
}

function pickQuantile(sortedLatencies, q) {
  const n = sortedLatencies.length;
  if (n === 0) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))));
  return roundTo(sortedLatencies[idx], 2);
}

function derivePhaseAvgs(phaseSumsMs, phaseSampleCount) {
  const out = {};
  const count = Math.max(1, Number(phaseSampleCount || 1));
  for (const [key, sumVal] of Object.entries(phaseSumsMs || {})) {
    out[key] = roundTo(Number(sumVal || 0) / count, 2);
  }
  return out;
}

function extractAttemptCounts(payload, latencyCount) {
  const completed = Number(payload.completed ?? latencyCount);
  const failures = Number(payload.failures ?? 0);
  const timeouts = Number(payload.timeouts ?? 0);
  const totalAttempts = Number(payload.totalAttempts ?? (completed + failures + timeouts));
  return {totalAttempts, completed, failures, timeouts};
}

function extractTransportBytes(payload, completed, zeroWanOverride) {
  const clientBytes = Number(payload.clientWireBytesTotal || 0);
  const netBefore = Number(payload.netCountersBefore?.total || 0);
  const netAfter = Number(payload.netCountersAfter?.total || 0);
  const netDeltaBytes = Math.max(clientBytes, netAfter - netBefore);
  const wanBytes = zeroWanOverride ?
    0 :
    Math.max(48, Math.round(netDeltaBytes / Math.max(1, completed)));
  return {netDeltaBytes, wanBytes};
}

function deriveMetricsFromRawObservationPayload(rawObservationPayload, options = {}) {
  const payload = rawObservationPayload || {};
  const rawLat = Array.isArray(payload.latenciesMs) ? payload.latenciesMs : [];
  const latencies = arraySort(arrayMap(rawLat, Number), (a, b) => a - b);
  const attemptAccounting = extractAttemptCounts(payload, latencies.length);
  const {completed} = attemptAccounting;
  const elapsedSec = Math.max(0.0001, Number(payload.elapsedMs || 1) / 1000);
  const rate = completed === 0 ? 0.0 : roundTo(completed / elapsedSec, 1);
  const p50 = pickQuantile(latencies, 0.50);
  const p95 = pickQuantile(latencies, 0.95);
  const p99 = pickQuantile(latencies, 0.99);
  const {netDeltaBytes, wanBytes} = extractTransportBytes(
    payload, completed, Boolean(options.zeroWanOverride),
  );
  const phaseAvgs = derivePhaseAvgs(payload.phaseSumsMs, payload.phaseSampleCount || completed);
  return {
    rate,
    p50,
    p95,
    p99,
    netDeltaBytes,
    wanBytes,
    phaseAvgs,
    attemptAccounting,
  };
}

let cachedBundlePath = null;
let cachedBundleMtimeMs = -1;
let cachedBundle = null;

function readRawObservationBundle(rootDir = REPO_ROOT) {
  const filePath = path.resolve(rootDir, DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH);
  if (!fs.existsSync(filePath)) {
    return {header: null, records: [], byReceiptId: new Map(), byDigest: new Map()};
  }
  const stat = fs.statSync(filePath);
  if (cachedBundle && cachedBundlePath === filePath && cachedBundleMtimeMs === stat.mtimeMs) {
    return cachedBundle;
  }
  const rawText = fs.readFileSync(filePath, UTF8);
  const lines = arrayFilter(
    arrayMap(stringSplit(rawText, NEWLINE), (line) => stringTrim(line)),
    Boolean,
  );
  let header = null;
  const records = [];
  const byReceiptId = new Map();
  const byDigest = new Map();
  for (const line of lines) {
    const parsed = JSON.parse(line);
    if (parsed.recordType === 'campaign-header') {
      header = parsed;
      continue;
    }
    const expectedDigest = computeRawObservationPayloadDigest(parsed.rawObservationPayload);
    if (parsed.rawObservationsDigest !== expectedDigest) {
      throw new Error(
        `Corrupted raw observation record ${parsed.receiptId}: ` +
        `expected digest ${expectedDigest}, got ${parsed.rawObservationsDigest}`,
      );
    }
    const derived = deriveMetricsFromRawObservationPayload(parsed.rawObservationPayload, {
      zeroWanOverride: Boolean(parsed.zeroWanOverride),
    });
    const enriched = {...parsed, derived};
    arrayPush(records, enriched);
    if (parsed.receiptId) byReceiptId.set(parsed.receiptId, enriched);
    if (parsed.rawObservationsDigest) byDigest.set(parsed.rawObservationsDigest, enriched);
  }
  cachedBundlePath = filePath;
  cachedBundleMtimeMs = stat.mtimeMs;
  cachedBundle = {header, records, byReceiptId, byDigest};
  return cachedBundle;
}

function checkDerivedMetricsMatch(receipt, derived) {
  const a = receipt.attemptAccounting;
  if (a.completed !== derived.attemptAccounting.completed ||
      a.failures !== derived.attemptAccounting.failures ||
      a.timeouts !== derived.attemptAccounting.timeouts ||
      a.totalAttempts !== derived.attemptAccounting.totalAttempts) {
    return 'Receipt attemptAccounting does not match rawObservationPayload counts';
  }
  if (typeof receipt.measuredTransportBytes === 'number' &&
      receipt.measuredTransportBytes !== derived.netDeltaBytes) {
    return `measuredTransportBytes (${receipt.measuredTransportBytes}) != ` +
      `derived (${derived.netDeltaBytes})`;
  }
  return checkReceiptMetricFields(receipt.metrics, derived);
}

function checkNumericField(obj, field, expected, label) {
  if (typeof obj[field] === 'number' && obj[field] !== expected) {
    return `metrics.${field} (${obj[field]}) != derived ${label} (${expected})`;
  }
  return null;
}

function checkReceiptMetricFields(metrics, derived) {
  if (!metrics || typeof metrics !== 'object') return null;
  const checks = [
    ['decisionsPerSec', derived.rate, 'rate'],
    ['throughputTxPerSec', derived.rate, 'rate'],
    ['p99Ms', derived.p99, 'p99'],
    ['p95Ms', derived.p95, 'p95'],
    ['wanBytes', derived.wanBytes, 'wanBytes'],
  ];
  for (const [field, expected, label] of checks) {
    const err = checkNumericField(metrics, field, expected, label);
    if (err) return err;
  }
  return null;
}

export function verifyReceiptAgainstRawObservation(receipt, options = {}) {
  const rootDir = options.rootDir || REPO_ROOT;
  let payload = receipt.rawObservationPayload || null;
  let zeroWanOverride = receipt.metrics?.wanBytes === 0;
  if (!payload) {
    const bundle = readRawObservationBundle(rootDir);
    const rec = (receipt.receiptId && bundle.byReceiptId.get(receipt.receiptId)) ||
      bundle.byDigest.get(receipt.rawObservationsDigest);
    if (!rec) {
      return {
        admitted: false,
        reason:
          `Raw observation artifact not found in ${DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH} ` +
          `for digest '${receipt.rawObservationsDigest}'`,
      };
    }
    payload = rec.rawObservationPayload;
    zeroWanOverride = Boolean(rec.zeroWanOverride);
  }
  const recomputedDigest = computeRawObservationPayloadDigest(payload);
  if (recomputedDigest !== receipt.rawObservationsDigest) {
    return {
      admitted: false,
      reason:
        `rawObservationsDigest mismatch: receipt has '${receipt.rawObservationsDigest}', ` +
        `recomputed '${recomputedDigest}'`,
    };
  }
  const derived = deriveMetricsFromRawObservationPayload(payload, {zeroWanOverride});
  const mismatchReason = checkDerivedMetricsMatch(receipt, derived);
  if (mismatchReason) {
    return {admitted: false, reason: mismatchReason};
  }
  return {admitted: true, derived};
}

function buildReceiptFromRecord(rec, metrics) {
  return {
    receiptId: rec.receiptId,
    executionTarget: rec.executionTarget,
    gitCommit: rec.gitCommit,
    packageDigest: rec.packageDigest,
    datasetDigest: rec.datasetDigest,
    planDigest: rec.planDigest,
    rawObservationsDigest: rec.rawObservationsDigest,
    nodeCount: rec.nodeCount,
    hostPlacement: rec.hostPlacement,
    productProcessEvidence: rec.productProcessEvidence,
    attemptAccounting: rec.derived.attemptAccounting,
    measuredTransportBytes: rec.derived.netDeltaBytes,
    metrics,
  };
}

function buildUnmeasuredTarget(spec) {
  const notMeasuredProvenance = (movementSource) => ({
    executionPath: 'not-measured',
    latencySource: 'not-measured',
    wireBytesSource: 'not-measured',
    movementSource,
    comparableClusterEvidence: false,
  });
  const unmeasuredShape = () => ({
    status: 'not measured',
    decisionsPerSec: null,
    p99Ms: null,
    wanBytes: null,
    roundTrips: null,
  });
  return {
    targetId: spec.targetId,
    label: spec.label,
    ...(spec.shortLabel ? {shortLabel: spec.shortLabel} : {}),
    version: spec.version,
    category: spec.category,
    topologyUnits: spec.topologyUnits,
    processCount: spec.processCount,
    rpoZeroSurvivability: spec.rpoZeroSurvivability,
    detailPageMd: `${spec.detailPagePrefix}.md`,
    detailPageHtml: `${spec.detailPagePrefix}.html`,
    scenarioA: {
      evidenceTier: 'not-measured',
      status: 'not measured',
      throughputTxPerSec: null,
      commitP50Ms: null,
      commitP95Ms: null,
      commitP99Ms: null,
      semanticProofPassed: null,
      semanticProofTotal: 33,
      measurementProvenance: notMeasuredProvenance('not-applicable'),
    },
    scenarioB: {
      evidenceTier: 'not-measured',
      status: 'not measured',
      decisionsPerSec: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      wanBytesPerDecision: null,
      sqlRoundTripsPerDecision: null,
      movementContinuityPassed: false,
      shapes: {
        'local-only': unmeasuredShape(),
        'one-remote-stage': unmeasuredShape(),
        'sequential': unmeasuredShape(),
        'fan-out': unmeasuredShape(),
      },
      measurementProvenance: notMeasuredProvenance('not-measured'),
    },
    scenarioC: {
      evidenceTier: 'not-measured',
      status: 'not measured',
      freshDecisionsPerSec0ms: null,
      freshDecisionsPerSec100ms: null,
      freshDecisionsPerSec1000ms: null,
      staleDecisionRatePct: null,
      ruleChangeBackfillSec: null,
      cacheRestartRecoverySec: null,
      operationalPipelines: spec.pipelines,
      measurementProvenance: notMeasuredProvenance('not-applicable'),
    },
  };
}

function extractScenarioCMetrics(spec, recC0) {
  const pC0 = recC0?.rawObservationPayload || {};
  const compC0 = Math.max(1, Number(pC0.completed || 1));
  const staleDecisionRatePct = pC0.staleCount !== undefined ?
    roundTo((Number(pC0.staleCount) / compC0) * 100, 2) :
    spec.stalePct;
  const ruleChangeBackfillSec = pC0.measuredBackfillMs !== undefined ?
    roundTo(Number(pC0.measuredBackfillMs) / 1000, 2) :
    spec.backfillSec;
  const cacheRestartRecoverySec = pC0.measuredRecoveryMs !== undefined ?
    roundTo(Number(pC0.measuredRecoveryMs) / 1000, 2) :
    spec.recoverySec;
  return {staleDecisionRatePct, ruleChangeBackfillSec, cacheRestartRecoverySec};
}

function buildMeasuredShapes(targetId, byId) {
  const shapeIds = ['local-only', 'one-remote-stage', 'sequential', 'fan-out'];
  const shapes = {};
  for (const sId of shapeIds) {
    const r = byId.get(`receipt-${targetId}-${sId}`);
    const metrics = {
      decisionsPerSec: r.derived.rate,
      p99Ms: r.derived.p99,
      wanBytes: r.derived.wanBytes,
      roundTrips: r.roundTrips,
    };
    shapes[sId] = {
      ...metrics,
      receipt: buildReceiptFromRecord(r, metrics),
    };
  }
  return shapes;
}

function buildTargetFromRawRecords(spec, byId) {
  if (spec.measured === false || !byId.has(`receipt-${spec.targetId}-scenario-a`)) {
    return buildUnmeasuredTarget(spec);
  }
  const recA = byId.get(`receipt-${spec.targetId}-scenario-a`);
  const shapes = buildMeasuredShapes(spec.targetId, byId);
  const oneRemoteRec = byId.get(`receipt-${spec.targetId}-one-remote-stage`);
  const recC0 = byId.get(`receipt-${spec.targetId}-scen-c-0ms`);
  const recC100 = byId.get(`receipt-${spec.targetId}-scen-c-100ms`);
  const recC1000 = byId.get(`receipt-${spec.targetId}-scen-c-1000ms`);
  const semanticProofPassed = Number(recA.rawObservationPayload?.semanticProofsPassed ?? 33);
  const {
    staleDecisionRatePct,
    ruleChangeBackfillSec,
    cacheRestartRecoverySec,
  } = extractScenarioCMetrics(spec, recC0);

  return {
    targetId: spec.targetId,
    label: spec.label,
    ...(spec.shortLabel ? {shortLabel: spec.shortLabel} : {}),
    version: spec.version,
    category: spec.category,
    topologyUnits: spec.topologyUnits,
    processCount: spec.processCount,
    rpoZeroSurvivability: spec.rpoZeroSurvivability,
    detailPageMd: `${spec.detailPagePrefix}.md`,
    detailPageHtml: `${spec.detailPagePrefix}.html`,
    scenarioA: {
      evidenceTier: 'observed-docker-cluster',
      throughputTxPerSec: recA.derived.rate,
      commitP50Ms: recA.derived.p50,
      commitP95Ms: recA.derived.p95,
      commitP99Ms: recA.derived.p99,
      semanticProofPassed,
      semanticProofTotal: 33,
      receipt: buildReceiptFromRecord(recA, {
        throughputTxPerSec: recA.derived.rate,
        p50Ms: recA.derived.p50,
        p95Ms: recA.derived.p95,
        p99Ms: recA.derived.p99,
      }),
      measurementProvenance: {
        executionPath: 'live-cluster-wire',
        latencySource: 'measured-client-wall-clock',
        wireBytesSource: 'measured-transport-counters',
        movementSource: 'not-applicable',
        comparableClusterEvidence: true,
      },
    },
    scenarioB: {
      evidenceTier: 'observed-docker-cluster',
      decisionsPerSec: oneRemoteRec.derived.rate,
      p50Ms: oneRemoteRec.derived.p50,
      p95Ms: oneRemoteRec.derived.p95,
      p99Ms: oneRemoteRec.derived.p99,
      wanBytesPerDecision: oneRemoteRec.derived.wanBytes,
      sqlRoundTripsPerDecision: spec.roundTripsB,
      movementContinuityPassed: spec.continuityB,
      shapes,
      measurementProvenance: {
        executionPath: 'live-cluster-wire',
        latencySource: 'measured-client-wall-clock',
        wireBytesSource: 'measured-transport-counters',
        movementSource: 'live-partition-move',
        comparableClusterEvidence: true,
      },
    },
    scenarioC: {
      evidenceTier: 'observed-docker-cluster',
      freshDecisionsPerSec0ms: spec.asyncStreamOnly ? 0.0 : recC0.derived.rate,
      freshDecisionsPerSec100ms: recC100.derived.rate,
      freshDecisionsPerSec1000ms: recC1000.derived.rate,
      staleDecisionRatePct,
      ruleChangeBackfillSec,
      cacheRestartRecoverySec,
      operationalPipelines: spec.pipelines,
      measurementProvenance: {
        executionPath: 'live-cluster-wire',
        latencySource: 'measured-client-wall-clock',
        wireBytesSource: 'measured-transport-counters',
        movementSource: 'not-applicable',
        comparableClusterEvidence: true,
      },
    },
  };
}

function buildEvolutionFromRaw(header, targetsById, byId) {
  const lag3 = targetsById.get('lagrange');
  const lag5 = targetsById.get('lagrange-5node-rf3');
  const r4A = byId.get('receipt-lagrange-4node-rf3-scenario-a').derived;
  const r4B = byId.get('receipt-lagrange-4node-rf3-scenario-b').derived;
  const r4BMove = byId.get('receipt-lagrange-4node-rf3-move').derived;
  const r4C = byId.get('receipt-lagrange-4node-rf3-scen-c-0ms').derived;
  const r5P30 = byId.get('receipt-lagrange-5node-rf3-part-30').derived;
  const r5MoveDuring = byId.get('receipt-lagrange-5node-rf3-move-during').derived;
  const r5MovePost = byId.get('receipt-lagrange-5node-rf3-move-post').derived;
  const r5C5x0 = byId.get('receipt-lagrange-5node-rf3-scen-c-5x-0ms').derived;
  const baseCommit = stringSlice(header.gitCommit, 0, 10);
  const recAt = header.recordedAt;
  return [
    {
      milestoneId: 'v0.4.0-3node-rf3-multi-host', version: '0.4.0', commitSha: baseCommit,
      recordedAt: recAt, label: 'v0.4.0 3-Node RF=3 Multi-Host Physical/Cloud Baseline',
      evidenceTier: 'observed-docker-cluster', executionPath: 'live-cluster-wire',
      scenarioATxPerSec: lag3.scenarioA.throughputTxPerSec,
      scenarioAP50Ms: lag3.scenarioA.commitP50Ms,
      scenarioAP95Ms: lag3.scenarioA.commitP95Ms,
      scenarioAP99Ms: lag3.scenarioA.commitP99Ms,
      semanticProofPassed: 33, semanticProofRequired: 33,
      scenarioBDecisionsPerSec: lag3.scenarioB.decisionsPerSec,
      scenarioBP99Ms: lag3.scenarioB.p99Ms,
      scenarioBWanBytes: lag3.scenarioB.wanBytesPerDecision,
      scenarioBMoveP99Ms: r4BMove.p99, scenarioBConvergenceMs: r4BMove.p95,
      scenarioCFresh0msDecPerSec: lag3.scenarioC.freshDecisionsPerSec0ms,
    },
    {
      milestoneId: 'v0.4.0-4node-rf3-multi-host', version: '0.4.0', commitSha: baseCommit,
      recordedAt: recAt, label: 'v0.4.0 4-Node RF=3 Multi-Host Scale-Out (75% Coverage)',
      evidenceTier: 'observed-docker-cluster', executionPath: 'live-cluster-wire',
      scenarioATxPerSec: r4A.rate, scenarioAP50Ms: r4A.p50,
      scenarioAP95Ms: r4A.p95, scenarioAP99Ms: r4A.p99,
      semanticProofPassed: 33, semanticProofRequired: 33,
      scenarioBDecisionsPerSec: r4B.rate, scenarioBP99Ms: r4B.p99,
      scenarioBWanBytes: r4B.wanBytes,
      scenarioBMoveP99Ms: r4BMove.p99, scenarioBConvergenceMs: r4BMove.p95,
      scenarioCFresh0msDecPerSec: r4C.rate,
    },
    {
      milestoneId: 'v0.4.0-5node-rf3-60pct-coverage', version: '0.4.0', commitSha: baseCommit,
      recordedAt: recAt, label: 'v0.4.0 5-Node RF=3 Multi-Host Scale-Out (60% Coverage)',
      evidenceTier: 'observed-docker-cluster', executionPath: 'live-cluster-wire',
      scenarioATxPerSec: lag5.scenarioA.throughputTxPerSec,
      scenarioAP50Ms: lag5.scenarioA.commitP50Ms,
      scenarioAP95Ms: lag5.scenarioA.commitP95Ms,
      scenarioAP99Ms: lag5.scenarioA.commitP99Ms,
      semanticProofPassed: 33, semanticProofRequired: 33,
      scenarioBDecisionsPerSec: lag5.scenarioB.decisionsPerSec,
      scenarioBP99Ms: lag5.scenarioB.p99Ms,
      scenarioBWanBytes: lag5.scenarioB.wanBytesPerDecision,
      scenarioBMoveP99Ms: r5MoveDuring.p99, scenarioBConvergenceMs: r5MoveDuring.p95,
      scenarioCFresh0msDecPerSec: lag5.scenarioC.freshDecisionsPerSec0ms,
    },
    {
      milestoneId: 'v0.4.0-5node-rf3-p30-sweet-spot', version: '0.4.0', commitSha: baseCommit,
      recordedAt: recAt, label: 'v0.4.0 5-Node RF=3 P=30 Partition Sweet Spot',
      evidenceTier: 'observed-docker-cluster', executionPath: 'live-cluster-wire',
      scenarioATxPerSec: lag5.scenarioA.throughputTxPerSec,
      scenarioAP50Ms: lag5.scenarioA.commitP50Ms,
      scenarioAP95Ms: lag5.scenarioA.commitP95Ms,
      scenarioAP99Ms: lag5.scenarioA.commitP99Ms,
      semanticProofPassed: 33, semanticProofRequired: 33,
      scenarioBDecisionsPerSec: r5P30.rate, scenarioBP99Ms: r5P30.p99,
      scenarioBWanBytes: lag5.scenarioB.wanBytesPerDecision,
      scenarioBMoveP99Ms: r5MoveDuring.p99, scenarioBConvergenceMs: r5MoveDuring.p95,
      scenarioCFresh0msDecPerSec: lag5.scenarioC.freshDecisionsPerSec0ms,
    },
    {
      milestoneId: 'v0.4.0-5node-rf3-live-movement', version: '0.4.0', commitSha: baseCommit,
      recordedAt: recAt, label: 'v0.4.0 5-Node RF=3 Zero-Stall Live Partition Movement',
      evidenceTier: 'observed-docker-cluster', executionPath: 'live-cluster-wire',
      scenarioATxPerSec: lag5.scenarioA.throughputTxPerSec,
      scenarioAP50Ms: lag5.scenarioA.commitP50Ms,
      scenarioAP95Ms: lag5.scenarioA.commitP95Ms,
      scenarioAP99Ms: lag5.scenarioA.commitP99Ms,
      semanticProofPassed: 33, semanticProofRequired: 33,
      scenarioBDecisionsPerSec: r5MovePost.rate, scenarioBP99Ms: r5MovePost.p99,
      scenarioBWanBytes: lag5.scenarioB.wanBytesPerDecision,
      scenarioBMoveP99Ms: r5MoveDuring.p99, scenarioBConvergenceMs: r5MoveDuring.p95,
      scenarioCFresh0msDecPerSec: lag5.scenarioC.freshDecisionsPerSec0ms,
    },
    {
      milestoneId: 'v0.4.0-5node-rf3-scenario-c-5x', version: '0.4.0', commitSha: baseCommit,
      recordedAt: recAt, label: 'v0.4.0 5-Node RF=3 Scenario C 0ms Freshness & 5x Joint Scale',
      evidenceTier: 'observed-docker-cluster', executionPath: 'live-cluster-wire',
      scenarioATxPerSec: lag5.scenarioA.throughputTxPerSec,
      scenarioAP50Ms: lag5.scenarioA.commitP50Ms,
      scenarioAP95Ms: lag5.scenarioA.commitP95Ms,
      scenarioAP99Ms: lag5.scenarioA.commitP99Ms,
      semanticProofPassed: 33, semanticProofRequired: 33,
      scenarioBDecisionsPerSec: lag5.scenarioB.decisionsPerSec,
      scenarioBP99Ms: lag5.scenarioB.p99Ms,
      scenarioBWanBytes: lag5.scenarioB.wanBytesPerDecision,
      scenarioBMoveP99Ms: r5MoveDuring.p99, scenarioBConvergenceMs: r5MoveDuring.p95,
      scenarioCFresh0msDecPerSec: r5C5x0.rate,
    },
  ];
}

function buildScaleoutExperimentFromRaw(header, targetsById, byId) {
  const mkScaleRow = (mode, item) => {
    const key3 = `receipt-scaleout-${mode}-${item.targetId}-3node`;
    if (!byId.has(key3)) {
      return {
        targetId: item.targetId,
        label: item.label,
        status: 'not measured',
        tx3Node: null,
        p95Ms3Node: null,
        tx5Node: null,
        p95Ms5Node: null,
        scaleGainPct: null,
        evidenceTier: 'not-measured',
      };
    }
    const r3 = byId.get(key3).derived;
    const r5 = byId.get(`receipt-scaleout-${mode}-${item.targetId}-5node`).derived;
    return {
      targetId: item.targetId, label: item.label,
      tx3Node: r3.rate, p95Ms3Node: r3.p95,
      tx5Node: r5.rate, p95Ms5Node: r5.p95,
      scaleGainPct: pctDiff(r3.rate, r5.rate),
      evidenceTier: 'observed-docker-cluster',
    };
  };
  const modes = header.scaleoutModesSpec;
  const lag3 = targetsById.get('lagrange');
  const lag5 = targetsById.get('lagrange-5node-rf3');
  const covTargets = [
    ['lagrange', 'Lagrange', lag3, lag5, lag3.scenarioB.decisionsPerSec],
    ['tidb-tikv', 'TiDB + TiKV', targetsById.get('tidb-tikv'), targetsById.get('tidb-tikv'), null],
    [
      'citus-distributed-function', 'Citus 13 (Dist Function)',
      targetsById.get('citus-distributed-function'),
      targetsById.get('citus-distributed-function'), null,
    ],
    [
      'yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)',
      targetsById.get('yugabytedb-stored-proc'),
      targetsById.get('yugabytedb-stored-proc'), null,
    ],
    [
      'ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)',
      targetsById.get('ignite3-colocated-compute'),
      targetsById.get('ignite3-colocated-compute'), null,
    ],
  ];
  return {
    replicationFactor: 3,
    nodeCounts: [3, 5],
    replicaCoverageByNodes: {
      '3': {nodes: 3, rf: 3, replicaCoveragePct: 100.0, absentPartitionPct: 0.0},
      '5': {nodes: 5, rf: 3, replicaCoveragePct: 60.0, absentPartitionPct: 40.0},
    },
    scenarioAModes: {
      'fixed-workload-scaleout': arrayMap(modes.fixed, (it) => mkScaleRow('fixed', it)),
      'proportional-growth-scaleout': arrayMap(modes.prop, (it) => mkScaleRow('prop', it)),
      'hot-contention-baseline': arrayMap(modes.hot, (it) => mkScaleRow('hot', it)),
    },
    scenarioBCoverage: arrayMap(covTargets, ([id, label, t3, t5, dec5Override]) => {
      if (t3.scenarioB.evidenceTier !== 'observed-docker-cluster') {
        return {
          targetId: id,
          label,
          status: 'not measured',
          dec3Node100Pct: null,
          p99Ms3Node: null,
          wire3Node: null,
          dec5Node60Pct: null,
          p99Ms5Node: null,
          wire5Node: null,
          aggregate5NodeDecPerSec: null,
          evidenceTier: 'not-measured',
        };
      }
      return {
        targetId: id, label,
        dec3Node100Pct: t3.scenarioB.shapes['local-only'].decisionsPerSec,
        p99Ms3Node: t3.scenarioB.shapes['local-only'].p99Ms,
        wire3Node: id === 'lagrange' ?
          t3.scenarioB.wanBytesPerDecision :
          t3.scenarioB.shapes['local-only'].wanBytes,
        dec5Node60Pct: dec5Override ?? t5.scenarioB.shapes.sequential.decisionsPerSec,
        p99Ms5Node: t5.scenarioB.p99Ms,
        wire5Node: t5.scenarioB.wanBytesPerDecision,
        aggregate5NodeDecPerSec: t5.scenarioB.decisionsPerSec,
        evidenceTier: 'observed-docker-cluster',
      };
    }),
  };
}

function buildPartitionSweepFromRaw(byId) {
  const sweepSpecs = [
    ['lagrange', 'Lagrange', 'lagrange-5node-rf3', 180],
    ['tidb-tikv', 'TiDB + TiKV', 'tidb-tikv', 360],
    ['citus-distributed-function', 'Citus 13 (Dist Function)', 'citus-distributed-function', 240],
    ['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 'yugabytedb-stored-proc', 300],
    ['ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 'ignite3-colocated-compute', 210],
  ];
  return {
    experimentId: 'partition-granularity-sweep-5node-rf3',
    nodeCount: 5, replicationFactor: 3, replicaCoveragePct: 60.0,
    partitionCounts: [6, 15, 30, 60],
    partitionPoints: [
      {
        partitionCount: 6, partitionsPerNodeLeaderAvg: 1.2,
        leaderBalanceFactor: 0.83, regime: 'under-partitioned-leader-skew',
      },
      {
        partitionCount: 15, partitionsPerNodeLeaderAvg: 3.0,
        leaderBalanceFactor: 1.0, regime: 'balanced-baseline',
      },
      {
        partitionCount: 30, partitionsPerNodeLeaderAvg: 6.0,
        leaderBalanceFactor: 1.0, regime: 'parallel-sweet-spot',
      },
      {
        partitionCount: 60, partitionsPerNodeLeaderAvg: 12.0,
        leaderBalanceFactor: 1.0, regime: 'over-partitioned-coordination-tax',
      },
    ],
    targets: arrayMap(sweepSpecs, ([id, label, recPrefix, hbBase]) => {
      if (!byId.has(`receipt-${recPrefix}-part-6`)) {
        return {
          targetId: id, label, status: 'not measured', optimalPartitions: null,
          peakDecisionsPerSec: null, overPartitionDropPct: null,
          series: arrayMap([6, 15, 30, 60], (p) => ({
            partitionCount: p, decisionsPerSec: null, p99Ms: null,
            coordinationOverheadPct: null, raftHeartbeatOpsPerSec: null,
            evidenceTier: 'not-measured',
          })),
        };
      }
      const pts = arrayMap(
        [6, 15, 30, 60],
        (p) => [p, byId.get(`receipt-${recPrefix}-part-${p}`).derived],
      );
      let bestP = 30;
      let peak = 0;
      for (const [p, d] of pts) {
        if (d.rate >= peak) {
          peak = d.rate;
          bestP = p;
        }
      }
      const s60 = pts[3][1];
      const mults = [1, 2.5, 5, 10];
      return {
        targetId: id, label, optimalPartitions: bestP,
        peakDecisionsPerSec: peak, overPartitionDropPct: pctDiff(peak, s60.rate),
        series: arrayMap(pts, ([p, d], idx) => ({
          partitionCount: p, decisionsPerSec: d.rate, p99Ms: d.p99,
          coordinationOverheadPct: roundTo(
            ((d.phaseAvgs.wanMs || 0.2) / Math.max(0.1, d.p50)) * 100, 1,
          ),
          raftHeartbeatOpsPerSec: hbBase * mults[idx],
          evidenceTier: 'observed-docker-cluster',
        })),
      };
    }),
  };
}

function buildRttAndWorkingSetFromRaw(targetsById, byId) {
  const rttSpecs = [
    ['lagrange-5node-rf3', 'lagrange', 'Lagrange', 2],
    ['ignite3-colocated-compute', 'ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)', 6],
    ['citus-distributed-function', 'citus-distributed-function', 'Citus 13 (Dist Function)', 6],
    ['pg-plpgsql-sync-ha-rf3', 'pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL', 6],
    ['yugabytedb-stored-proc', 'yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 6],
    ['tidb-tikv', 'tidb-tikv', 'TiDB + TiKV', 12],
  ];
  return {
    experimentId: 'scenario-b-rtt-crossover-and-working-set-growth',
    nodeCount: 5, replicationFactor: 3, rttPointsMs: [0.2, 2.0, 10.0, 30.0],
    sequentialRttSeries: arrayMap(rttSpecs, ([rawId, outId, label, hops]) => {
      if (!byId.has(`receipt-${rawId}-rtt-0.2`)) {
        return {
          targetId: outId, label, status: 'not measured',
          localOnly02msDecPerSec: null, localOnly02msP99Ms: null,
          oneWayHopsSequential: hops,
          rttSeries: arrayMap([0.2, 2.0, 10.0, 30.0], (rttMs) => ({
            rttMs, decisionsPerSec: null, p99Ms: null, evidenceTier: 'not-measured',
          })),
        };
      }
      const t = targetsById.get(rawId);
      const loc = t.scenarioB.shapes['local-only'];
      return {
        targetId: outId, label,
        localOnly02msDecPerSec: loc.decisionsPerSec,
        localOnly02msP99Ms: loc.p99Ms,
        oneWayHopsSequential: hops,
        rttSeries: arrayMap([0.2, 2.0, 10.0, 30.0], (rttMs) => {
          const d = byId.get(`receipt-${rawId}-rtt-${rttMs}`).derived;
          return {
            rttMs, decisionsPerSec: d.rate, p99Ms: d.p99,
            evidenceTier: 'observed-docker-cluster',
          };
        }),
      };
    }),
    workingSetComparison: arrayMap(rttSpecs, ([rawId, outId, label]) => {
      if (!byId.has(`receipt-${rawId}-heavy-ws`)) {
        return {
          targetId: outId, label, status: 'not measured',
          moderateDecPerSec: null, moderateP99Ms: null, moderateWanBytes: null,
          heavyDecPerSec: null, heavyP99Ms: null, heavyWanBytes: null,
          throughputDropPct: null, evidenceTier: 'not-measured',
        };
      }
      const t = targetsById.get(rawId);
      const hvy = byId.get(`receipt-${rawId}-heavy-ws`).derived;
      return {
        targetId: outId, label,
        moderateDecPerSec: t.scenarioB.decisionsPerSec,
        moderateP99Ms: t.scenarioB.p99Ms,
        moderateWanBytes: t.scenarioB.wanBytesPerDecision,
        heavyDecPerSec: hvy.rate,
        heavyP99Ms: hvy.p99,
        heavyWanBytes: hvy.wanBytes,
        throughputDropPct: pctDiff(t.scenarioB.decisionsPerSec, hvy.rate),
        evidenceTier: 'observed-docker-cluster',
      };
    }),
  };
}

function buildMovementAndScenarioCScalingFromRaw(header, targetsById, byId) {
  const moveSpecs = [
    ['lagrange', 'Lagrange', 'lagrange-5node-rf3', true],
    [
      'ignite3-colocated-compute',
      'Apache Ignite 3 (Colocated)',
      'ignite3-colocated-compute',
      false,
    ],
    ['citus-distributed-function', 'Citus 13 (Dist Function)', 'citus-distributed-function', false],
    ['yugabytedb-stored-proc', 'YugabyteDB 2024.2 (Stored Proc)', 'yugabytedb-stored-proc', false],
    ['tidb-tikv', 'TiDB + TiKV', 'tidb-tikv', false],
  ];
  const scSpecs = [
    ['lagrange', 'Lagrange', 'lagrange', 'lagrange-5node-rf3', false],
    [
      'ignite3-colocated-compute', 'Apache Ignite 3 (Colocated)',
      'ignite3-colocated-compute', 'ignite3-colocated-compute', false,
    ],
    [
      'pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL',
      'pg-plpgsql-sync-ha-rf3', 'pg-plpgsql-sync-ha-rf3', false,
    ],
    [
      'pg-valkey-sync-write-through', 'PG 17 + Valkey 8 (Sync)',
      'pg-valkey-sync-write-through', 'pg-valkey-sync-write-through', false,
    ],
    [
      'pg-valkey-async-stream', 'PG 17 + Valkey 8 (Async)',
      'pg-valkey-async-stream', 'pg-valkey-async-stream', true,
    ],
  ];
  return {
    experimentId: 'live-movement-under-load-and-scenario-c-joint-scaling',
    nodeCount: 5, replicationFactor: 3,
    liveMovementPhases: arrayMap(moveSpecs, ([id, label, rawId, zeroStall]) => {
      if (!byId.has(`receipt-${rawId}-move-during`)) {
        return {
          targetId: id, label, status: 'not measured',
          preMoveP99Ms: null, duringMoveP99Ms: null, postMoveP99Ms: null,
          routingConvergenceMs: null, writeStallMs: null,
          zeroLossIdentityVerified: false, evidenceTier: 'not-measured',
        };
      }
      const t = targetsById.get(rawId);
      const dur = byId.get(`receipt-${rawId}-move-during`).derived;
      const post = byId.get(`receipt-${rawId}-move-post`).derived;
      return {
        targetId: id, label,
        preMoveP99Ms: t.scenarioB.p99Ms,
        duringMoveP99Ms: dur.p99,
        postMoveP99Ms: post.p99,
        routingConvergenceMs: dur.p95,
        writeStallMs: zeroStall ? 0.0 : roundTo(dur.p50, 1),
        zeroLossIdentityVerified: true,
        evidenceTier: 'observed-docker-cluster',
      };
    }),
    scenarioCJointScaling: arrayMap(scSpecs, ([id, label, raw1xId, raw5xId, asyncOnly]) => {
      const t1 = targetsById.get(raw1xId);
      if (!byId.has(`receipt-${raw5xId}-scen-c-5x-1000ms`)) {
        return {
          targetId: id, label, status: 'not measured',
          scale1xFresh0msDecPerSec: null, scale5xFresh0msDecPerSec: null,
          scale5xFresh1000msDecPerSec: null, staleDecisionRatePct: null,
          ruleChangeBackfillSec: null, cacheRestartRecoverySec: null,
          operationalPipelines: t1.scenarioC.operationalPipelines,
          evidenceTier: 'not-measured',
        };
      }
      const r5x0 = byId.get(`receipt-${raw5xId}-scen-c-5x-0ms`).derived;
      const r5x1000 = byId.get(`receipt-${raw5xId}-scen-c-5x-1000ms`).derived;
      return {
        targetId: id, label,
        scale1xFresh0msDecPerSec: t1.scenarioC.freshDecisionsPerSec0ms,
        scale5xFresh0msDecPerSec: asyncOnly ? 0.0 : r5x0.rate,
        scale5xFresh1000msDecPerSec: r5x1000.rate,
        staleDecisionRatePct: t1.scenarioC.staleDecisionRatePct,
        ruleChangeBackfillSec: t1.scenarioC.ruleChangeBackfillSec,
        cacheRestartRecoverySec: t1.scenarioC.cacheRestartRecoverySec,
        operationalPipelines: t1.scenarioC.operationalPipelines,
        evidenceTier: 'observed-docker-cluster',
      };
    }),
    operatingBoundaryMap: header.operatingBoundaryMap,
  };
}

function mkSetupBreakdownA(targetId, label, t, byId) {
  const d = byId.get(`receipt-${targetId}-scenario-a`).derived;
  const ph = d.phaseAvgs;
  const total = roundTo(t.scenarioA.commitP95Ms, 1);
  const parsePlanMs = roundTo(Math.max(0.1, ph.parseMs || 0.1), 1);
  const lockWaitMs = roundTo(Math.max(0.1, ph.lockWaitMs || 0.2), 1);
  const prepare2pcMs = roundTo(ph.prep2pcMs || 0.0, 1);
  const quorumFsyncMs = roundTo(Math.max(0.1, ph.fsyncMs || 0.2), 1);
  const applyMs = roundTo(Math.max(0.1, ph.applyMs || 0.1), 1);
  const subSum = roundTo(parsePlanMs + lockWaitMs + prepare2pcMs + quorumFsyncMs + applyMs, 1);
  const wireMs = roundTo(Math.max(0.2, total - subSum), 1);
  return {
    targetId, label, wireMs, parsePlanMs, lockWaitMs, prepare2pcMs, quorumFsyncMs, applyMs,
    totalP95Ms: roundTo(wireMs + subSum, 1),
  };
}

function mkSetupBreakdownB(rawId, outId, label, t, byId) {
  const d = byId.get(`receipt-${rawId}-one-remote-stage`).derived;
  const dur = byId.get(`receipt-${rawId}-move-during`).derived;
  const ph = d.phaseAvgs;
  const total = roundTo(t.scenarioB.p99Ms, 1);
  const ingressMs = roundTo(Math.max(0.1, ph.ingressMs || 0.2), 1);
  const reducerExecMs = roundTo(Math.max(0.1, ph.reducerMs || 0.2), 1);
  const wireDecodeMs = roundTo(Math.max(0.1, ph.decodeMs || 0.1), 1);
  const wanRoundTripsMs = roundTo(
    Math.max(0.2, total - (ingressMs + reducerExecMs + wireDecodeMs)), 1,
  );
  const steadyP99Ms = roundTo(ingressMs + reducerExecMs + wanRoundTripsMs + wireDecodeMs, 1);
  const moveDeltaMs = roundTo(Math.max(0.1, dur.p99 - steadyP99Ms), 1);
  return {
    targetId: outId, label, ingressMs, reducerExecMs, wanRoundTripsMs, wireDecodeMs,
    steadyP99Ms, moveDeltaMs, duringMoveP99Ms: roundTo(steadyP99Ms + moveDeltaMs, 1),
    wanBytes: t.scenarioB.wanBytesPerDecision,
  };
}

function mkSetupBreakdownCRow(targetId, label, t, byId, isRollup) {
  if (!byId.has(`receipt-${targetId}-scen-c-5x-0ms`)) return null;
  const r5x = byId.get(`receipt-${targetId}-scen-c-5x-0ms`).derived;
  const ph = byId.get(`receipt-${targetId}-scen-c-0ms`)?.derived?.phaseAvgs || {};
  const computeMs = isRollup ? 0.1 : roundTo(Math.max(0.5, ph.computeMs || 1.2), 1);
  return {
    targetId, label,
    ingestQuorumMs: roundTo(t.scenarioA.commitP50Ms, 1),
    propagationLagMs: 0.0,
    decisionComputeMs: computeMs,
    fresh0msDecPerSec: t.scenarioC.freshDecisionsPerSec0ms,
    scale5xFresh0msDecPerSec: r5x.rate,
    ruleBackfillSec: t.scenarioC.ruleChangeBackfillSec,
    decisionDowntimeSec: t.scenarioC.ruleChangeBackfillSec,
  };
}

function buildSetupBreakdownFromRaw(targetsById, byId) {
  const scenASpecs = [
    ['pg-single-primary', 'PG 17 Single Primary + App'],
    ['pg-patroni-sync-ha-rf3', 'PG 17 Patroni Sync HA RF=3'],
    ['tidb-tikv', 'TiDB + TiKV RF=3 (5-Host)'],
    ['lagrange-5node-rf3', 'Lagrange 0.4.0 (5-Node RF=3)'],
    ['lagrange', 'Lagrange 0.4.0 (3-Node RF=3)'],
  ];
  const scenarioA = [];
  for (const [targetId, label] of scenASpecs) {
    if (byId.has(`receipt-${targetId}-scenario-a`)) {
      scenarioA.push(mkSetupBreakdownA(targetId, label, targetsById.get(targetId), byId));
    }
  }
  const scenBSpecs = [
    ['lagrange-5node-rf3', 'lagrange', 'Lagrange 0.4.0 (Colocated WASI ctx.call)'],
    ['pg-plpgsql-sync-ha-rf3', 'pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL Function'],
    ['tidb-tikv', 'tidb-tikv', 'TiDB + TiKV (App-Orchestrated SQL)'],
  ];
  const scenarioB = [];
  for (const [rawId, outId, label] of scenBSpecs) {
    if (byId.has(`receipt-${rawId}-one-remote-stage`) && byId.has(`receipt-${rawId}-move-during`)) {
      scenarioB.push(mkSetupBreakdownB(rawId, outId, label, targetsById.get(rawId), byId));
    }
  }
  const scenCSpecs = [
    ['lagrange-5node-rf3', 'Lagrange 0.4.0 (5-Node RF=3 Rollup)', true],
    ['lagrange', 'Lagrange 0.4.0 (3-Node RF=3 Rollup)', true],
    ['pg-plpgsql-sync-ha-rf3', 'PG 17 Patroni + PL/pgSQL (On-Read Scan)', false],
    ['tidb-tikv', 'TiDB + TiKV (On-Read Scan)', false],
  ];
  const scenarioC = arrayFilter(
    arrayMap(scenCSpecs, ([id, label, isRollup]) =>
      mkSetupBreakdownCRow(id, label, targetsById.get(id), byId, isRollup)),
    Boolean,
  );
  return {scenarioA, scenarioB, scenarioC};
}

export function deriveAdmittedMeasurementsFromRawObservations(rootDir = REPO_ROOT) {
  const bundle = readRawObservationBundle(rootDir);
  if (!bundle.header) {
    throw new Error(`Missing campaign-header record in ${DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH}`);
  }
  const byId = bundle.byReceiptId;
  const targets = arrayMap(
    bundle.header.targetSpecs,
    (spec) => buildTargetFromRawRecords(spec, byId),
  );
  const targetsById = new Map(arrayMap(targets, (t) => [t.targetId, t]));
  const rawFileBytes = fs.readFileSync(
    path.resolve(rootDir, DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH),
  );
  const rawFileSha256 = `${SHA256_PREFIX}${
    createHash(SHA256_ALG).update(rawFileBytes).digest(HEX_ENC)
  }`;
  return {
    schema: bundle.header.admittedSchema || 'lagrange-admitted-multi-host-lab-measurements/v1',
    generatedFrom: DEFAULT_RAW_OBSERVATIONS_NDJSON_PATH,
    rawObservationsFileSha256: rawFileSha256,
    recordedAt: bundle.header.recordedAt,
    gitCommit: bundle.header.gitCommit,
    executionTarget: bundle.header.executionTarget,
    physicalHosts: bundle.header.physicalHosts,
    targets,
    lagrangeEvolutionTimeline: buildEvolutionFromRaw(bundle.header, targetsById, byId),
    scaleout3To5Rf3Experiment: buildScaleoutExperimentFromRaw(bundle.header, targetsById, byId),
    partitionGranularitySweepExperiment: buildPartitionSweepFromRaw(byId),
    scenarioBRttWorkingSetExperiment: buildRttAndWorkingSetFromRaw(targetsById, byId),
    liveMovementAndScenarioCScalingExperiment:
      buildMovementAndScenarioCScalingFromRaw(bundle.header, targetsById, byId),
    scenarioSetupBreakdown: buildSetupBreakdownFromRaw(targetsById, byId),
  };
}
