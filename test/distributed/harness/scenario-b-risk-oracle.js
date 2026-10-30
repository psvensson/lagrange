import {createHash} from 'node:crypto';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);
const arraySlice = Function.call.bind(Array.prototype.slice);
const numberToFixed = Function.call.bind(Number.prototype.toFixed);

export const SCENARIO_B_DECISION_OUTCOME = Object.freeze({
  APPROVE: 'APPROVE',
  REVIEW: 'REVIEW',
  BLOCK: 'BLOCK',
});

export const SCENARIO_B_MAX_DECISION_BYTES = 1024;

const STAGE_CONFIG = Object.freeze({
  'account': {tableName: 'accountEvents', idKey: 'accountId'},
  'merchant': {tableName: 'merchantEvents', idKey: 'merchantId'},
  'device': {tableName: 'deviceEvents', idKey: 'deviceId'},
  'related-account': {tableName: 'relatedAccountEvents', idKey: 'relatedAccountId'},
});

const GRAPH_SHAPES = Object.freeze(['local-only', 'one-remote-stage', 'sequential', 'fan-out']);

export function reduceScenarioBEntityStage(dataset, stageName, entityId) {
  const config = STAGE_CONFIG[stageName];
  if (!config) throw new Error(`Unknown stageName: ${stageName}`);
  const events = dataset?.tables?.[config.tableName];
  if (!Array.isArray(events)) throw new Error(`Table ${config.tableName} is not an array`);
  const matchingRows = arrayFilter(events, (row) => row?.[config.idKey] === entityId);
  if (matchingRows.length === 0) {
    throw new Error(`No matching rows for stage "${stageName}" and entityId "${entityId}"`);
  }

  let bytesScanned = 0;
  let sumAmountCents = 0;
  let sumRiskPoints = 0;
  let flaggedCount = 0;
  let crossEntityAlertCount = 0;

  for (let i = 0; i < matchingRows.length; i += 1) {
    const r = matchingRows[i];
    bytesScanned += (r.byteSize || 0);
    sumAmountCents += (r.amountCents || 0);
    sumRiskPoints += (r.riskPoints || 0);
    if ((r.flagged || r.chargebackFlag || r.failedAuthCount || 0) > 0) flaggedCount += 1;
    if ((r.crossEntityAlert || 0) > 0) crossEntityAlertCount += 1;
  }

  const rowsScanned = matchingRows.length;
  const scoreBps = sumRiskPoints + (flaggedCount * 25);
  const emittedBytes = 64;

  const stageDigest = createHash('sha256').update(JSON.stringify({
    stageName, entityId, rowsScanned, bytesScanned, sumAmountCents,
    sumRiskPoints, flaggedCount, crossEntityAlertCount, scoreBps,
  })).digest('hex');

  return Object.freeze({
    stageName, entityId, rowsScanned, bytesScanned, emittedBytes,
    sumAmountCents, sumRiskPoints, flaggedCount, crossEntityAlertCount,
    scoreBps, stageDigest,
  });
}

export function evaluateScenarioBRequestOracle(dataset, request) {
  const accountStage = reduceScenarioBEntityStage(dataset, 'account', request.accountId);
  let actualGraphShape;
  let stages;
  let sequentialRemoteRounds;

  if (accountStage.scoreBps < 1000) {
    actualGraphShape = 'local-only';
    stages = [accountStage];
    sequentialRemoteRounds = 0;
  } else if (accountStage.scoreBps >= 5000 && accountStage.crossEntityAlertCount > 0) {
    actualGraphShape = 'fan-out';
    stages = [
      accountStage,
      reduceScenarioBEntityStage(dataset, 'merchant', request.merchantId),
      reduceScenarioBEntityStage(dataset, 'device', request.deviceId),
      reduceScenarioBEntityStage(dataset, 'related-account', request.relatedAccountId),
    ];
    sequentialRemoteRounds = 1;
  } else {
    const merchantStage = reduceScenarioBEntityStage(dataset, 'merchant', request.merchantId);
    if (merchantStage.scoreBps >= 2000) {
      actualGraphShape = 'sequential';
      stages = [
        accountStage,
        merchantStage,
        reduceScenarioBEntityStage(dataset, 'device', request.deviceId),
      ];
      sequentialRemoteRounds = 2;
    } else {
      actualGraphShape = 'one-remote-stage';
      stages = [accountStage, merchantStage];
      sequentialRemoteRounds = 1;
    }
  }

  let totalScoreBps = 0;
  let totalRowsScanned = 0;
  let totalBytesScanned = 0;
  let totalEmittedBytes = 0;
  for (let i = 0; i < stages.length; i += 1) {
    totalScoreBps += stages[i].scoreBps;
    totalRowsScanned += stages[i].rowsScanned;
    totalBytesScanned += stages[i].bytesScanned;
    totalEmittedBytes += stages[i].emittedBytes;
  }

  const decision = totalScoreBps >= 6000 ?
    SCENARIO_B_DECISION_OUTCOME.BLOCK :
    (totalScoreBps >= 1500 ?
      SCENARIO_B_DECISION_OUTCOME.REVIEW :
      SCENARIO_B_DECISION_OUTCOME.APPROVE);

  const stageDigests = Object.freeze(
    Object.fromEntries(arrayMap(stages, (s) => [s.stageName, s.stageDigest])),
  );
  const decisionPayload = {
    requestId: request.requestId, actualGraphShape, decision, totalScoreBps, stageDigests,
  };
  const decisionBytes = Buffer.byteLength(JSON.stringify(decisionPayload), 'utf8');
  if (decisionBytes > SCENARIO_B_MAX_DECISION_BYTES) {
    throw new Error('Scenario B decision payload exceeds 1 KiB limit');
  }
  const oracleDigest = createHash('sha256').update(JSON.stringify(decisionPayload)).digest('hex');

  return Object.freeze({
    requestId: request.requestId, actualGraphShape, decision, totalScoreBps,
    sequentialRemoteRounds, totalRowsScanned, totalBytesScanned, totalEmittedBytes,
    decisionBytes, stages: Object.freeze(stages), stageDigests, oracleDigest,
  });
}

export function verifyScenarioBDecisionResult(oracleExpected, observedResult) {
  if (!oracleExpected || typeof oracleExpected !== 'object') {
    throw new Error('oracleExpected must be an object');
  }
  if (!observedResult || typeof observedResult !== 'object') {
    throw new Error('observedResult must be an object');
  }
  const matchFields = ['requestId', 'actualGraphShape', 'decision', 'totalScoreBps', 'oracleDigest'];
  for (let i = 0; i < matchFields.length; i += 1) {
    const key = matchFields[i];
    if (oracleExpected[key] !== observedResult[key]) {
      throw new Error(`${key} mismatch: expected ${oracleExpected[key]}, got ${observedResult[key]}`);
    }
  }
  if (JSON.stringify(oracleExpected.stageDigests) !== JSON.stringify(observedResult.stageDigests)) {
    throw new Error('stageDigests mismatch');
  }
  if (
    typeof observedResult.decisionBytes !== 'number' ||
    observedResult.decisionBytes > SCENARIO_B_MAX_DECISION_BYTES
  ) {
    throw new Error(
      `decisionBytes exceeds limit ${SCENARIO_B_MAX_DECISION_BYTES}: got ${observedResult.decisionBytes}`,
    );
  }
  return true;
}

function percentile(sortedNums, p) {
  if (!sortedNums || sortedNums.length === 0) return 0;
  const rank = p > 1 ? p / 100 : p;
  const index = Math.min(sortedNums.length - 1, Math.max(0, Math.floor(rank * sortedNums.length)));
  return sortedNums[index];
}

export function summarizeScenarioBSystemRun(options = {}) {
  const {
    dataset, workloadPlan, systemId, comparatorMode, observedRuns,
    durationMs = 1000, sloP99Ms = 100, maxErrorRate = 0.01,
  } = options;

  if (!Array.isArray(observedRuns)) throw new Error('observedRuns must be an array');
  if (!workloadPlan || !Array.isArray(workloadPlan.requests)) {
    throw new Error('workloadPlan.requests must be an array');
  }
  if (observedRuns.length !== workloadPlan.requests.length) {
    throw new Error(
      `observedRuns count (${observedRuns.length}) does not match requests count (${workloadPlan.requests.length})`,
    );
  }

  const shapeStats = {
    'local-only': {latencies: [], totalEdgeBytes: 0, totalRounds: 0},
    'one-remote-stage': {latencies: [], totalEdgeBytes: 0, totalRounds: 0},
    'sequential': {latencies: [], totalEdgeBytes: 0, totalRounds: 0},
    'fan-out': {latencies: [], totalEdgeBytes: 0, totalRounds: 0},
  };
  let totalRemoteEdgeBytes = 0;
  let totalSequentialRemoteRounds = 0;
  let totalCoordinatorCpuMs = 0;
  const allLatencies = [];

  for (let i = 0; i < observedRuns.length; i += 1) {
    const request = workloadPlan.requests[i];
    const run = observedRuns[i];
    if (!run || typeof run !== 'object') throw new Error(`observedRuns[${i}] must be an object`);

    const oracle = evaluateScenarioBRequestOracle(dataset, request);
    verifyScenarioBDecisionResult(oracle, run.result);

    const shape = run.result.actualGraphShape;
    const stats = shapeStats[shape] ||
      (shapeStats[shape] = {latencies: [], totalEdgeBytes: 0, totalRounds: 0});

    const latency = typeof run.latencyMs === 'number' ? run.latencyMs : (run.latency || 0);
    allLatencies.push(latency);
    stats.latencies.push(latency);

    const edgeBytes = typeof run.remoteEdgeBytes === 'number' ? run.remoteEdgeBytes :
      (typeof run.result?.remoteEdgeBytes === 'number' ? run.result.remoteEdgeBytes :
        Math.max(0, (oracle.totalEmittedBytes || 0) - (oracle.stages[0]?.emittedBytes || 0)));
    totalRemoteEdgeBytes += edgeBytes;
    stats.totalEdgeBytes += edgeBytes;

    const rounds = typeof run.sequentialRemoteRounds === 'number' ? run.sequentialRemoteRounds :
      (typeof run.result?.sequentialRemoteRounds === 'number' ? run.result.sequentialRemoteRounds :
        oracle.sequentialRemoteRounds);
    totalSequentialRemoteRounds += rounds;
    stats.totalRounds += rounds;

    const cpu = typeof run.coordinatorCpuMs === 'number' ? run.coordinatorCpuMs :
      (typeof run.result?.coordinatorCpuMs === 'number' ? run.result.coordinatorCpuMs : 0);
    totalCoordinatorCpuMs += cpu;
  }

  const sortedLatencies = arraySort(arraySlice(allLatencies, 0), (a, b) => a - b);
  const p50 = percentile(sortedLatencies, 50);
  const p95 = percentile(sortedLatencies, 95);
  const p99 = percentile(sortedLatencies, 99);
  const latencyMs = Object.freeze({p50, p95, p99});

  const opsPerSec = Number(
    numberToFixed((observedRuns.length * 1000) / Math.max(1, durationMs), 6),
  );
  const avgRemoteEdgeBytes = observedRuns.length > 0 ?
    totalRemoteEdgeBytes / observedRuns.length : 0;
  const avgSequentialRemoteRounds = observedRuns.length > 0 ?
    totalSequentialRemoteRounds / observedRuns.length : 0;
  const sloMet = p99 <= sloP99Ms;

  const perShape = {};
  for (let i = 0; i < GRAPH_SHAPES.length; i += 1) {
    const shape = GRAPH_SHAPES[i];
    const stats = shapeStats[shape] || {latencies: [], totalEdgeBytes: 0, totalRounds: 0};
    const count = stats.latencies.length;
    const sorted = count > 0 ? arraySort(stats.latencies, (a, b) => a - b) : [];
    perShape[shape] = Object.freeze({
      count,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      avgRemoteEdgeBytes: count > 0 ? stats.totalEdgeBytes / count : 0,
      avgSequentialRemoteRounds: count > 0 ? stats.totalRounds / count : 0,
    });
  }

  return Object.freeze({
    systemId, comparatorMode, totalDecisions: observedRuns.length, opsPerSec,
    latencyMs, avgRemoteEdgeBytes, avgSequentialRemoteRounds, totalCoordinatorCpuMs,
    errorRate: 0, sloP99Ms, maxErrorRate, sloMet, perShape: Object.freeze(perShape),
  });
}
