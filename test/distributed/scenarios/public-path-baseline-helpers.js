/**
 * Pure evidence helpers for the public-path-multinode-baseline scenario:
 * deterministic dataset generation, the independent parity oracle, digest
 * computation, the red-condition gates (WASM fidelity, partition/leader
 * spread, parity, local-read proof), telemetry summarization, and the
 * stable report-detail composition consumed unchanged by the
 * scale/failure certification Quest.
 *
 * This is a helper module, not a runnable scenario: it must never export
 * a `run` function (scenario discovery schedules any module that does).
 */

import {createHash} from 'node:crypto';
import {computePercentile} from '../harness/performance-diagnostics.js';

const REPORT_DETAIL_SCHEMA_VERSION = 1;
const PARITY_ORACLE_KIND = 'independent-recompute';
const SHA256_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const UTF8_ENCODING = 'utf8';

const ZERO = 0;
const ONE = 1;
const PERCENTILE_P50 = 50;
const PERCENTILE_P95 = 95;
const PERCENTILE_P99 = 99;

// Deterministic dataset parameters. Sized so the seeded table lands at
// roughly 1.5x the 16384-byte split storage threshold: one managed split
// is expected and both children stay under the threshold, so the
// topology holds at exactly two partitions through the measured window.
const DATASET_GENERATOR = Object.freeze({
  prngSeed: 0x9e3779b9,
  rowCount: 160,
  accountIds: Object.freeze([101, 202, 303, 404, 505]),
  amountFloorCents: 250,
  amountSpreadCents: 18_750,
  flaggedThresholdCents: 17_000,
  padLength: 128,
  padCharCode: 120,
  version: 1,
});
// Sentinel rows keep split evaluation firing while waiting for growth.
// Their account is never queried and they are excluded from the
// canonical dataset digest.
const SENTINEL_ACCOUNT_ID = 999_001;
const SENTINEL_ID_BASE = 1_000_000;

const EXPECTED_RUNTIME_KIND = 'wasm_component';
const FORBIDDEN_RUNTIME_KIND = 'native_js';
const EXPECTED_MEDIA_TYPE = 'application/wasm';
const MIN_PARTITION_COUNT = 2;
const MIN_DISTINCT_PARTITION_HOSTS = 2;
const MIN_LOCAL_READ_NODES = 2;
const MIN_PARITY_ACCOUNTS = 2;

const SQLITE_METRIC_TAG = 'metrics.partition.sqlite';
const SQLITE_SELECT_OPERATION = 'SELECT';
const INVOKER_TELEMETRY_TAG = 'call-cell invocation telemetry';
const UNAVAILABLE_INVOKER_TELEMETRY_REASON =
  'call-cell invocation telemetry is debug-level and absent from the ' +
  'info-level harness log capture';
const UNAVAILABLE_MEMORY_PEAK_REASON =
  'docker stats snapshots expose current usage only; no peak counter';

// Mulberry32: tiny deterministic PRNG, seeded from a named constant so
// the generator digest fully identifies the dataset.
const MULBERRY32_INCREMENT = 0x6d2b79f5;

function createSeededRandom(seed) {
  let state = seed >>> ZERO;
  return () => {
    state = (state + MULBERRY32_INCREMENT) >>> ZERO;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | ONE);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> ZERO) / 4294967296;
  };
}

// Rows interleave the accounts by id so every partition of an id-median
// split holds rows for every queried account (contributingShards must
// equal the partition count for parity to hold).
function generateDatasetRows() {
  const random = createSeededRandom(DATASET_GENERATOR.prngSeed);
  const pad = String.fromCharCode(DATASET_GENERATOR.padCharCode)
    .repeat(DATASET_GENERATOR.padLength);
  const rows = [];
  for (let id = ONE; id <= DATASET_GENERATOR.rowCount; id += ONE) {
    const amountCents = DATASET_GENERATOR.amountFloorCents +
      Math.floor(random() * DATASET_GENERATOR.amountSpreadCents);
    rows.push({
      accountId: DATASET_GENERATOR.accountIds[
        id % DATASET_GENERATOR.accountIds.length
      ],
      amountCents,
      flagged: amountCents > DATASET_GENERATOR.flaggedThresholdCents ?
        ONE :
        ZERO,
      id,
      pad,
    });
  }
  return rows;
}

function buildSentinelRow(sentinelIndex) {
  const pad = String.fromCharCode(DATASET_GENERATOR.padCharCode)
    .repeat(DATASET_GENERATOR.padLength);
  return {
    accountId: SENTINEL_ACCOUNT_ID,
    amountCents: DATASET_GENERATOR.amountFloorCents,
    flagged: ZERO,
    id: SENTINEL_ID_BASE + sentinelIndex,
    pad,
  };
}

function sha256Hex(text) {
  return createHash(SHA256_ALGORITHM)
    .update(text, UTF8_ENCODING)
    .digest(HEX_ENCODING);
}

function computeGeneratorDigest() {
  return sha256Hex(JSON.stringify(DATASET_GENERATOR));
}

// Canonical serialization: one fixed-field-order line per row, sorted by
// id, so the digest is independent of insertion or query order.
function computeDatasetDigest(rows) {
  const canonical = [...rows]
    .sort((left, right) => left.id - right.id)
    .map((row) => [
      row.id, row.accountId, row.amountCents, row.flagged, row.pad,
    ].join(','))
    .join('\n');
  return sha256Hex(canonical);
}

// The independent oracle: recompute the account summary in plain JS from
// the seeded rows. It never consults the service under test.
function expectedAccountSummary(rows, accountId, contributingShards) {
  const matching = rows.filter((row) => row.accountId === accountId);
  const totalCents = matching
    .reduce((sum, row) => sum + row.amountCents, ZERO);
  return {
    accountId,
    contributingShards,
    flagged: matching.filter((row) => row.flagged === ONE).length,
    largestCents: matching
      .reduce((best, row) => Math.max(best, row.amountCents), ZERO),
    meanCents: matching.length === ZERO ?
      ZERO :
      Math.round(totalCents / matching.length),
    totalCents,
    transactions: matching.length,
  };
}

// Red-on-revert gate: the deployed runtime must be a genuine WASI
// component whose deploy-consumed manifest carries the build receipt's
// artifact digest. A native_js substitution or a digest drift fails.
function assertWasmFidelity({manifest, buildDigest, runtimeKindRows}) {
  const runtimeKinds = [...new Set(
    runtimeKindRows.map((row) => row?.runtime_kind),
  )];
  if (runtimeKinds.includes(FORBIDDEN_RUNTIME_KIND)) {
    throw new Error(
      'public-path fidelity violated: service_definitions reports ' +
      FORBIDDEN_RUNTIME_KIND,
    );
  }
  if (runtimeKinds.length !== ONE ||
      runtimeKinds[ZERO] !== EXPECTED_RUNTIME_KIND) {
    throw new Error(
      'public-path fidelity violated: expected runtime_kind ' +
      `${EXPECTED_RUNTIME_KIND}, saw [${runtimeKinds.join(', ')}]`,
    );
  }
  const mediaType = manifest?.artifact?.media_type;
  if (mediaType !== EXPECTED_MEDIA_TYPE) {
    throw new Error(
      'public-path fidelity violated: manifest media_type is ' +
      `${mediaType}, expected ${EXPECTED_MEDIA_TYPE}`,
    );
  }
  if (manifest?.runtime?.kind !== EXPECTED_RUNTIME_KIND) {
    throw new Error(
      'public-path fidelity violated: manifest runtime.kind is ' +
      `${manifest?.runtime?.kind}, expected ${EXPECTED_RUNTIME_KIND}`,
    );
  }
  const manifestDigest = manifest?.artifact?.digest;
  if (typeof buildDigest !== 'string' || buildDigest.length === ZERO ||
      manifestDigest !== buildDigest) {
    throw new Error(
      'public-path fidelity violated: deployed manifest digest ' +
      `${manifestDigest} does not equal build receipt digest ` +
      `${buildDigest}`,
    );
  }
  return {
    buildDigest,
    manifestDigest,
    mediaType,
    runtimeKind: EXPECTED_RUNTIME_KIND,
  };
}

// Red-on-revert gate: the data must genuinely span >=2 partitions whose
// leaders live on >=2 distinct hosts.
function assertPartitionSpread(partitionRows) {
  const partitions = partitionRows
    .map((row) => ({
      leaderNodeId: row?.leader_node_id,
      partitionId: row?.partition_id,
    }))
    .filter((entry) =>
      typeof entry.partitionId === 'string' &&
      entry.partitionId.length > ZERO,
    );
  const distinctHosts = new Set(
    partitions
      .map((entry) => entry.leaderNodeId)
      .filter((nodeId) =>
        typeof nodeId === 'string' && nodeId.length > ZERO,
      ),
  );
  if (partitions.length < MIN_PARTITION_COUNT) {
    throw new Error(
      'partition spread violated: ' +
      `${partitions.length} partition(s), need >= ${MIN_PARTITION_COUNT}`,
    );
  }
  if (distinctHosts.size < MIN_DISTINCT_PARTITION_HOSTS) {
    throw new Error(
      'partition spread violated: all partition leaders on ' +
      `${distinctHosts.size} host(s), need >= ` +
      String(MIN_DISTINCT_PARTITION_HOSTS),
    );
  }
  return {
    distinctPartitionHosts: distinctHosts.size,
    partitions,
  };
}

function describeParityMismatch(accountId, field, expected, actual) {
  return `account ${accountId} field ${field}: ` +
    `oracle ${JSON.stringify(expected)} != ` +
    `service ${JSON.stringify(actual)}`;
}

function collectSummaryMismatches(expected, actual) {
  const mismatches = [];
  for (const field of Object.keys(expected)) {
    if (actual?.[field] !== expected[field]) {
      mismatches.push(describeParityMismatch(
        expected.accountId, field, expected[field], actual?.[field],
      ));
    }
  }
  return mismatches;
}

// Red-on-revert gate: every HTTP response must match the independently
// recomputed oracle field by field. Non-vacuity: rows and accounts must
// actually be present.
function assertParity({responses, rows, partitionCount}) {
  if (rows.length === ZERO) {
    throw new Error('parity oracle is vacuous: zero seeded rows');
  }
  const queriedAccounts = new Set(
    responses.map((response) => response.accountId),
  );
  if (queriedAccounts.size < MIN_PARITY_ACCOUNTS) {
    throw new Error(
      'parity oracle is vacuous: ' +
      `${queriedAccounts.size} account(s) queried, need >= ` +
      String(MIN_PARITY_ACCOUNTS),
    );
  }
  const mismatches = [];
  for (const response of responses) {
    const expected = expectedAccountSummary(
      rows, response.accountId, partitionCount,
    );
    mismatches.push(
      ...collectSummaryMismatches(expected, response.body),
    );
  }
  if (mismatches.length > ZERO) {
    throw new Error(
      `parity violated (${mismatches.length} mismatch(es)): ` +
      mismatches.join('; '),
    );
  }
  return {
    invocations: responses.length,
    mismatches: ZERO,
    oracle: PARITY_ORACLE_KIND,
  };
}

function parseMetricMetadata(entry) {
  const metadata = entry?.metadata;
  if (metadata && typeof metadata === 'object') {
    return metadata;
  }
  if (typeof metadata !== 'string') {
    return entry && typeof entry === 'object' ? entry : null;
  }
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function collectLocalSelectSamples(logEntries, partitionIdSet) {
  const samples = [];
  for (const entry of Array.isArray(logEntries) ? logEntries : []) {
    if (String(entry?.message || '').trim() !== SQLITE_METRIC_TAG) {
      continue;
    }
    const metadata = parseMetricMetadata(entry);
    const nodeId = entry?.node_id || entry?.nodeId;
    const rowCount = Number(metadata?.rowCount);
    if (
      metadata?.operation !== SQLITE_SELECT_OPERATION ||
      !partitionIdSet.has(metadata?.partitionId) ||
      typeof nodeId !== 'string' || nodeId.length === ZERO ||
      !Number.isFinite(rowCount) || rowCount <= ZERO
    ) {
      continue;
    }
    samples.push({nodeId, rowCount});
  }
  return samples;
}

// Red-on-revert gate: shard rows must be proven read locally on >=2
// distinct partition-host nodes, with enough SELECT samples to account
// for the measured invocations. Fabricating metrics cannot satisfy this:
// the samples come from the nodes' own metrics log rows.
function buildLocalReadProof({logEntries, partitionIds, invocationCount}) {
  const samples = collectLocalSelectSamples(
    logEntries, new Set(partitionIds),
  );
  const byNode = new Map();
  for (const sample of samples) {
    const existing = byNode.get(sample.nodeId) ||
      {nodeId: sample.nodeId, rowCount: ZERO, selectCount: ZERO};
    existing.selectCount += ONE;
    existing.rowCount += sample.rowCount;
    byNode.set(sample.nodeId, existing);
  }
  const perNode = [...byNode.values()]
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  if (perNode.length < MIN_LOCAL_READ_NODES) {
    throw new Error(
      'local-read proof violated: partition-local SELECT metrics on ' +
      `${perNode.length} node(s), need >= ${MIN_LOCAL_READ_NODES}`,
    );
  }
  const totalSelects = perNode
    .reduce((sum, entry) => sum + entry.selectCount, ZERO);
  if (totalSelects < invocationCount) {
    throw new Error(
      'local-read proof violated: ' +
      `${totalSelects} local SELECT sample(s) for ${invocationCount} ` +
      'invocations',
    );
  }
  return {
    distinctNodes: perNode.length,
    perNode,
  };
}

function sumFiniteField(rows, field) {
  let sum = ZERO;
  let seen = false;
  for (const row of rows) {
    const value = Number(row?.[field]);
    if (Number.isFinite(value)) {
      sum += value;
      seen = true;
    }
  }
  return seen ? sum : null;
}

// Invoker telemetry is logged at debug level; the harness captures info.
// When absent the fields stay null with an explicit reason — they are
// never fabricated.
function summarizeInvokerTelemetry(logEntries) {
  const telemetryRows = [];
  for (const entry of Array.isArray(logEntries) ? logEntries : []) {
    if (String(entry?.message || '').trim() !== INVOKER_TELEMETRY_TAG) {
      continue;
    }
    const metadata = parseMetricMetadata(entry);
    if (metadata) {
      telemetryRows.push(metadata);
    }
  }
  if (telemetryRows.length === ZERO) {
    return {
      activationLeasesPublished: null,
      available: false,
      readyCellHits: null,
      unavailableReason: UNAVAILABLE_INVOKER_TELEMETRY_REASON,
    };
  }
  return {
    activationLeasesPublished:
      sumFiniteField(telemetryRows, 'activationLeasesPublished'),
    available: true,
    readyCellHits: sumFiniteField(telemetryRows, 'readyCellHits'),
    unavailableReason: null,
  };
}

function computeLatencySummary(latenciesMs) {
  const total = latenciesMs.reduce((sum, value) => sum + value, ZERO);
  return {
    avg: latenciesMs.length === ZERO ? ZERO : total / latenciesMs.length,
    count: latenciesMs.length,
    p50: computePercentile(latenciesMs, PERCENTILE_P50),
    p95: computePercentile(latenciesMs, PERCENTILE_P95),
    p99: computePercentile(latenciesMs, PERCENTILE_P99),
  };
}

function buildResourcePerNode(nodeIds, snapshotsAfter) {
  return nodeIds.map((nodeId) => {
    const after = snapshotsAfter.get(nodeId) || {};
    return {
      cpuPercent: Number.isFinite(after.cpuPercent) ?
        after.cpuPercent :
        null,
      memoryPeakBytes: null,
      memoryUsageBytes: Number.isFinite(after.memoryUsageBytes) ?
        after.memoryUsageBytes :
        null,
      nodeId,
    };
  });
}

function buildNetworkPerNode(nodeIds, snapshotsBefore, snapshotsAfter) {
  return nodeIds.map((nodeId) => {
    const before = snapshotsBefore.get(nodeId) || {};
    const after = snapshotsAfter.get(nodeId) || {};
    const delta = (afterValue, beforeValue) =>
      Number.isFinite(afterValue) && Number.isFinite(beforeValue) ?
        Math.max(ZERO, afterValue - beforeValue) :
        null;
    return {
      nodeId,
      rxBytes: delta(after.rxBytes, before.rxBytes),
      txBytes: delta(after.txBytes, before.txBytes),
    };
  });
}

// The stable report-detail schema (schemaVersion 1). Key names are
// frozen: public-path-scale-and-failure-certification consumes this
// shape unchanged. Nulls mark measurements that are legitimately
// unavailable live, each explained in unavailableReasons.
function composeReportDetail({
  datasetDigest,
  generatorDigest,
  nodeCount,
  topology,
  fidelity,
  parity,
  localReadProof,
  latencyMs,
  partialBytes,
  finalBytes,
  networkPerNode,
  resourcePerNode,
  invokerTelemetry,
  sentinelRowCount,
}) {
  const unavailableReasons = {
    memoryPeakBytes: UNAVAILABLE_MEMORY_PEAK_REASON,
  };
  if (invokerTelemetry.available !== true) {
    unavailableReasons.retries = invokerTelemetry.unavailableReason;
  }
  return {
    bytes: {
      finalBytes,
      partialBytes,
      perNode: networkPerNode,
    },
    datasetDigest,
    fidelity,
    generatorDigest,
    latencyMs,
    localReadProof,
    parity,
    resources: {perNode: resourcePerNode},
    retries: {
      activationLeasesPublished:
        invokerTelemetry.activationLeasesPublished,
      readyCellHits: invokerTelemetry.readyCellHits,
    },
    schemaVersion: REPORT_DETAIL_SCHEMA_VERSION,
    sentinelRowCount,
    topology: {
      distinctPartitionHosts: topology.distinctPartitionHosts,
      nodeCount,
      partitions: topology.partitions,
    },
    unavailableReasons,
  };
}

export {
  DATASET_GENERATOR,
  assertParity,
  assertPartitionSpread,
  assertWasmFidelity,
  buildLocalReadProof,
  buildNetworkPerNode,
  buildResourcePerNode,
  buildSentinelRow,
  composeReportDetail,
  computeDatasetDigest,
  computeGeneratorDigest,
  computeLatencySummary,
  expectedAccountSummary,
  generateDatasetRows,
  summarizeInvokerTelemetry,
};
