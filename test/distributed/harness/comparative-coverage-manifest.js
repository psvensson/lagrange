// Frozen coverage manifest of the advertised comparative benchmark claims
// (requirements section 8). It preserves every configuration and published point
// the benchmark pages advertised, as claim keys; the admission owner decides each
// claim's status. Labels describe what the deployer starts, not what was hoped
// for. A declared status records a justified blocked/unsupported entry; it never
// carries a number.
import {CLAIM_CELL_STATUS, CLAIM_KIND, ADMISSION_REASON} from './benchmark-claim-admission.js';
import {BENCHMARK_SCENARIO} from './raw-observation-record.js';

const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const COVERAGE_MANIFEST_ID = 'comparative-coverage-manifest-v1';

const SUBKIND = Object.freeze({
  MAIN: 'main',
  SMOKE: 'smoke',
  RULE_BACKFILL: 'rule-backfill',
  CACHE_RESTART_RECOVERY: 'cache-restart-recovery',
});

const SCENARIO_B_SHAPES = Object.freeze(['local-only', 'one-remote-stage', 'sequential',
  'fan-out']);
const FRESHNESS_POINTS = Object.freeze([['fresh-0ms', '0ms'], ['fresh-100ms', '100ms'],
  ['fresh-1000ms', '1000ms']]);
const PARTITION_COUNTS = Object.freeze([6, 15, 30, 60]);
const RTT_POINTS_MS = Object.freeze([0.2, 2, 10, 30]);
const SCALEOUT_NODE_COUNTS = Object.freeze([3, 5]);

const T = Object.freeze({
  LAGRANGE: 'lagrange',
  LAGRANGE_4: 'lagrange-4node-rf3',
  LAGRANGE_5: 'lagrange-5node-rf3',
  TIDB: 'tidb-tikv',
  PG_SINGLE: 'pg-single-primary',
  PG_SYNC_STANDBYS: 'pg-patroni-sync-ha-rf3',
  PG_PLPGSQL_SINGLE: 'pg-plpgsql-single-primary',
  PG_PLPGSQL_SYNC_STANDBYS: 'pg-plpgsql-sync-ha-rf3',
  CITUS_SQL: 'citus-sql-service',
  CITUS_UDF: 'citus-distributed-function',
  YUGABYTE_YSQL: 'yugabytedb-ysql-rf3',
  YUGABYTE_PROC: 'yugabytedb-stored-proc',
  IGNITE: 'ignite3-colocated-compute',
  PG_VALKEY_SYNC: 'pg-valkey-sync-write-through',
  PG_VALKEY_ASYNC: 'pg-valkey-async-stream',
});

const DETAIL = Object.freeze({
  TIDB: 'tidb-comparison-progress',
  SCALEOUT: 'scaleout-3to5-node-rf3-progress',
  POSTGRESQL: 'postgresql-comparison-progress',
  CITUS: 'citus-comparison-progress',
  YUGABYTE_IGNITE: 'yugabyte-ignite-comparison-progress',
  SCENARIO_C: 'scenario-c-feature-store-progress',
});

const PG_SYNC_STANDBYS_LABEL =
  'PostgreSQL 17 (primary + 2 streaming standbys, synchronous_standby_names)';

// The 14 advertised configurations. `advertisedLabel` is what earlier pages
// called the configuration; `label` describes what the deployer starts.
const ADVERTISED_TARGETS = Object.freeze(arrayMap([
  [T.LAGRANGE, 'Lagrange 0.4.0 (3 nodes)', 'Lagrange', 'distributed-native', DETAIL.TIDB, 3],
  [T.LAGRANGE_5, 'Lagrange 0.4.0 (5 nodes, RF=3 configured)', 'Lagrange (5-Node RF=3)',
    'distributed-native-scaleout', DETAIL.SCALEOUT, 5],
  [T.TIDB, 'TiDB + TiKV v8.5.8', 'TiDB + TiKV', 'distributed-sql', DETAIL.TIDB, 3],
  [T.PG_SINGLE, 'PostgreSQL 17 (single primary)',
    'PostgreSQL 17 (Single Primary + App Service)', 'relational-single-primary',
    DETAIL.POSTGRESQL, 1],
  [T.PG_SYNC_STANDBYS, PG_SYNC_STANDBYS_LABEL,
    'PostgreSQL 17 (Patroni Sync HA RF=3 + App Service)', 'relational-sync-standbys',
    DETAIL.POSTGRESQL, 3],
  [T.PG_PLPGSQL_SINGLE, 'PostgreSQL 17 (single primary, PL/pgSQL function)',
    'PostgreSQL 17 (Single Primary + PL/pgSQL Function)', 'relational-server-function',
    DETAIL.POSTGRESQL, 1],
  [T.PG_PLPGSQL_SYNC_STANDBYS, `${PG_SYNC_STANDBYS_LABEL}, PL/pgSQL function`,
    'PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function)',
    'relational-sync-standbys-function', DETAIL.POSTGRESQL, 3],
  [T.CITUS_SQL, 'Citus 13 (Sharded SQL RF=3 + App Service)',
    'Citus 13 (Sharded SQL RF=3 + App Service)', 'sharded-postgresql-sql', DETAIL.CITUS, 3],
  [T.CITUS_UDF, 'Citus 13 (Colocated Tables + Distributed Function RF=3)',
    'Citus 13 (Colocated Tables + Distributed Function RF=3)',
    'sharded-postgresql-colocated-udf', DETAIL.CITUS, 3],
  [T.YUGABYTE_YSQL, 'YugabyteDB 2024.2 (YSQL RF=3 + App Service)',
    'YugabyteDB 2024.2 (YSQL RF=3 + App Service)', 'distributed-sql-ysql',
    DETAIL.YUGABYTE_IGNITE, 3],
  [T.YUGABYTE_PROC, 'YugabyteDB 2024.2 (YSQL Stored Procedure RF=3)',
    'YugabyteDB 2024.2 (YSQL Stored Procedure RF=3)', 'distributed-sql-stored-proc',
    DETAIL.YUGABYTE_IGNITE, 3],
  [T.IGNITE, 'Apache Ignite 3 (JobTarget.colocated RF=3)',
    'Apache Ignite 3 (JobTarget.colocated RF=3)', 'distributed-colocated-compute-grid',
    DETAIL.YUGABYTE_IGNITE, 3],
  [T.PG_VALKEY_SYNC, 'PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service)',
    'PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service)',
    'relational-cache-write-through', DETAIL.SCENARIO_C, 2],
  [T.PG_VALKEY_ASYNC, 'PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service)',
    'PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service)',
    'relational-cache-async-stream', DETAIL.SCENARIO_C, 2],
], ([targetId, label, advertisedLabel, category, detailPagePrefix, minDistinctHosts]) =>
  Object.freeze({targetId, label, advertisedLabel, category, detailPagePrefix,
    minDistinctHosts})));

// The products of the named Scenario A smoke profile (scenario-a-smoke-v1): it
// proves the canonical workload ran end to end with per-request correctness and
// complete accounting, and never carries a capacity figure.
const SMOKE_TARGETS = Object.freeze([T.LAGRANGE, T.TIDB, T.PG_SINGLE]);

const MIN_HOSTS = new Map(arrayMap(ADVERTISED_TARGETS, (t) => [t.targetId, t.minDistinctHosts]));
MIN_HOSTS.set(T.LAGRANGE_4, 4);

const BLOCKED_LAGRANGE_B = Object.freeze({
  status: CLAIM_CELL_STATUS.BLOCKED,
  reason: ADMISSION_REASON.COMPILED_RISK_SERVICE_MISSING,
});
const UNSUPPORTED_ASYNC_FRESH = Object.freeze({
  status: CLAIM_CELL_STATUS.UNSUPPORTED,
  reason: ADMISSION_REASON.ASYNC_STREAM_CANNOT_SERVE_FRESH_READ,
});

function isLagrange(targetId) {
  return stringStartsWith(targetId, T.LAGRANGE);
}

function claim(targetId, scenario, subkind, claimKind, forensicReceiptIds, options = {}) {
  return Object.freeze({
    claimKey: `${targetId}/${scenario}/${subkind}`,
    targetId, scenario, subkind, claimKind,
    minDistinctHosts: options.minDistinctHosts ?? MIN_HOSTS.get(targetId) ?? 1,
    forensicReceiptIds: Object.freeze(forensicReceiptIds),
    declared: options.declared ?? null,
  });
}

function scenarioBDeclared(targetId) {
  return isLagrange(targetId) ? BLOCKED_LAGRANGE_B : null;
}

// Per-target claims, keyed by the column the target pages show.
function buildTargetClaims(targetId) {
  const r = (suffix) => `receipt-${targetId}-${suffix}`;
  const claims = {
    scenarioA: claim(targetId, BENCHMARK_SCENARIO.A, SUBKIND.MAIN, CLAIM_KIND.THROUGHPUT,
      [r('scenario-a')]),
  };
  if (arrayIncludes(SMOKE_TARGETS, targetId)) {
    claims['scenarioA/smoke'] = claim(targetId, BENCHMARK_SCENARIO.A, SUBKIND.SMOKE,
      CLAIM_KIND.THROUGHPUT, []);
  }
  for (const shape of SCENARIO_B_SHAPES) {
    claims[`scenarioB/${shape}`] = claim(targetId, BENCHMARK_SCENARIO.B, shape,
      CLAIM_KIND.DECISION_THROUGHPUT, [r(shape)], {declared: scenarioBDeclared(targetId)});
  }
  for (const [subkind, suffix] of FRESHNESS_POINTS) {
    const declared = targetId === T.PG_VALKEY_ASYNC && suffix === '0ms' ?
      UNSUPPORTED_ASYNC_FRESH : null;
    claims[`scenarioC/${subkind}`] = claim(targetId, BENCHMARK_SCENARIO.C, subkind,
      CLAIM_KIND.FRESHNESS, [r(`scen-c-${suffix}`)], {declared});
  }
  claims[`scenarioC/${SUBKIND.RULE_BACKFILL}`] = claim(targetId, BENCHMARK_SCENARIO.C,
    SUBKIND.RULE_BACKFILL, CLAIM_KIND.BACKFILL, [r('scen-c-0ms')]);
  claims[`scenarioC/${SUBKIND.CACHE_RESTART_RECOVERY}`] = claim(targetId, BENCHMARK_SCENARIO.C,
    SUBKIND.CACHE_RESTART_RECOVERY, CLAIM_KIND.RECOVERY, [r('scen-c-0ms')]);
  return Object.freeze(claims);
}

const SCALEOUT_ITEMS = Object.freeze([
  [T.LAGRANGE, 'Lagrange 0.4.0'],
  [T.TIDB, 'TiDB + TiKV v8.5.8'],
  [T.CITUS_SQL, 'Citus 13 (Sharded SQL + App)'],
  [T.YUGABYTE_YSQL, 'YugabyteDB 2024.2 (YSQL + App)'],
  [T.IGNITE, 'Apache Ignite 3 (Colocated)'],
]);
const SCALEOUT_MODES = Object.freeze([
  ['fixed', 'Fixed workload', SCALEOUT_ITEMS],
  ['prop', 'Proportional growth', SCALEOUT_ITEMS],
  ['hot', 'Hot contention', [SCALEOUT_ITEMS[0], SCALEOUT_ITEMS[1],
    [T.PG_SYNC_STANDBYS, PG_SYNC_STANDBYS_LABEL], ...SCALEOUT_ITEMS.slice(2)]],
]);

function row(rowId, label, cells) {
  return Object.freeze({rowId, label, cells: Object.freeze(cells)});
}

function scaleoutRows() {
  const modeRows = arrayFlatMap(SCALEOUT_MODES, ([mode, modeLabel, items]) =>
    arrayMap(items, ([targetId, label]) => row(`${mode}/${targetId}`, `${modeLabel}: ${label}`,
      Object.fromEntries(arrayMap(SCALEOUT_NODE_COUNTS, (n) => [`${n}-node`,
        claim(targetId, 'scaleout', `${mode}-${n}node`, CLAIM_KIND.SCALEOUT,
          [`receipt-scaleout-${mode}-${targetId}-${n}node`], {minDistinctHosts: n})])))));
  const coverage = arrayMap([
    [T.LAGRANGE, T.LAGRANGE_5], [T.TIDB, T.TIDB], [T.CITUS_UDF, T.CITUS_UDF],
    [T.YUGABYTE_PROC, T.YUGABYTE_PROC], [T.IGNITE, T.IGNITE],
  ], ([id3, id5]) => row(`placement/${id3}`, `Replica placement: ${id3}`, {
    'observed-placement': claim(id3, 'placement', '5node-rf3', CLAIM_KIND.PLACEMENT,
      [`receipt-${id3}-local-only`, `receipt-${id5}-sequential`], {minDistinctHosts: 5}),
  }));
  return [...modeRows, ...coverage];
}

const SWEEP_TARGETS = Object.freeze([
  [T.LAGRANGE, T.LAGRANGE_5], [T.TIDB, T.TIDB], [T.CITUS_UDF, T.CITUS_UDF],
  [T.YUGABYTE_PROC, T.YUGABYTE_PROC], [T.IGNITE, T.IGNITE],
]);

function partitionRows() {
  return arrayMap(SWEEP_TARGETS, ([id, rawId]) => row(id, id, Object.fromEntries(
    arrayMap(PARTITION_COUNTS, (p) => [`p${p}`, claim(rawId, 'partition-sweep', `p${p}`,
      CLAIM_KIND.PARTITION_SWEEP, [`receipt-${rawId}-part-${p}`])]))));
}

const RTT_TARGETS = Object.freeze([T.LAGRANGE_5, T.IGNITE, T.CITUS_UDF,
  T.PG_PLPGSQL_SYNC_STANDBYS, T.YUGABYTE_PROC, T.TIDB]);

function rttRows() {
  return arrayMap(RTT_TARGETS, (id) => row(id, id, Object.fromEntries(arrayMap(RTT_POINTS_MS,
    (ms) => [`rtt-${ms}ms`, claim(id, BENCHMARK_SCENARIO.B, `rtt-${ms}ms`, CLAIM_KIND.RTT_SWEEP,
      [`receipt-${id}-rtt-${ms}`], {declared: scenarioBDeclared(id)})]))));
}

function workingSetRows() {
  return arrayMap(RTT_TARGETS, (id) => row(id, id, {
    'heavy-working-set': claim(id, BENCHMARK_SCENARIO.B, 'heavy-working-set',
      CLAIM_KIND.WORKING_SET, [`receipt-${id}-heavy-ws`], {declared: scenarioBDeclared(id)}),
  }));
}

function movementRows() {
  return arrayMap([...SWEEP_TARGETS.slice(0, 1), [T.IGNITE, T.IGNITE],
    [T.CITUS_UDF, T.CITUS_UDF], [T.YUGABYTE_PROC, T.YUGABYTE_PROC], [T.TIDB, T.TIDB]],
  ([id, rawId]) => row(id, id, {
    'during-move': claim(rawId, BENCHMARK_SCENARIO.B, 'move-during', CLAIM_KIND.MOVEMENT,
      [`receipt-${rawId}-move-during`], {declared: scenarioBDeclared(rawId)}),
    'post-move': claim(rawId, BENCHMARK_SCENARIO.B, 'move-post', CLAIM_KIND.MOVEMENT,
      [`receipt-${rawId}-move-post`], {declared: scenarioBDeclared(rawId)}),
  }));
}

function scenarioCScalingRows() {
  return arrayMap([T.LAGRANGE_5, T.IGNITE, T.PG_PLPGSQL_SYNC_STANDBYS, T.PG_VALKEY_SYNC,
    T.PG_VALKEY_ASYNC], (id) => row(id, id, {
    'fresh-0ms-5x': claim(id, BENCHMARK_SCENARIO.C, 'fresh-0ms-5x', CLAIM_KIND.FRESHNESS,
      [`receipt-${id}-scen-c-5x-0ms`],
      {declared: id === T.PG_VALKEY_ASYNC ? UNSUPPORTED_ASYNC_FRESH : null}),
    'fresh-1000ms-5x': claim(id, BENCHMARK_SCENARIO.C, 'fresh-1000ms-5x', CLAIM_KIND.FRESHNESS,
      [`receipt-${id}-scen-c-5x-1000ms`]),
  }));
}

function phaseRow(scenario, id, forensic, declared = null) {
  return row(`${scenario}/${id}`, `${scenario}: ${id}`, {
    'phase-breakdown': claim(id, scenario, 'phase-breakdown', CLAIM_KIND.PHASE_BREAKDOWN,
      forensic, {declared}),
  });
}

function setupBreakdownRows() {
  return [
    ...arrayMap([T.PG_SINGLE, T.PG_SYNC_STANDBYS, T.TIDB, T.LAGRANGE_5, T.LAGRANGE],
      (id) => phaseRow(BENCHMARK_SCENARIO.A, id, [`receipt-${id}-scenario-a`])),
    ...arrayMap([T.LAGRANGE_5, T.PG_PLPGSQL_SYNC_STANDBYS, T.TIDB], (id) =>
      phaseRow(BENCHMARK_SCENARIO.B, id,
        [`receipt-${id}-one-remote-stage`, `receipt-${id}-move-during`],
        scenarioBDeclared(id))),
    ...arrayMap([T.LAGRANGE_5, T.LAGRANGE, T.PG_PLPGSQL_SYNC_STANDBYS, T.TIDB], (id) =>
      phaseRow(BENCHMARK_SCENARIO.C, id, [`receipt-${id}-scen-c-5x-0ms`])),
  ];
}

function milestone(rowId, label, claims) {
  return row(rowId, label, claims);
}

function evolutionRows(targetClaims) {
  const l3 = targetClaims.get(T.LAGRANGE);
  const l5 = targetClaims.get(T.LAGRANGE_5);
  const l4 = buildTargetClaims(T.LAGRANGE_4);
  const l4B = claim(T.LAGRANGE_4, BENCHMARK_SCENARIO.B, SUBKIND.MAIN,
    CLAIM_KIND.DECISION_THROUGHPUT, [`receipt-${T.LAGRANGE_4}-scenario-b`],
    {declared: BLOCKED_LAGRANGE_B});
  const scenarioCols = (a, b, c) => ({scenarioA: a, scenarioB: b, scenarioC: c});
  return [
    milestone('v0.4.0-3node', 'v0.4.0, 3 nodes', scenarioCols(l3.scenarioA,
      l3['scenarioB/one-remote-stage'], l3['scenarioC/fresh-0ms'])),
    milestone('v0.4.0-4node', 'v0.4.0, 4 nodes', scenarioCols(l4.scenarioA, l4B,
      l4['scenarioC/fresh-0ms'])),
    milestone('v0.4.0-5node', 'v0.4.0, 5 nodes', scenarioCols(l5.scenarioA,
      l5['scenarioB/one-remote-stage'], l5['scenarioC/fresh-0ms'])),
  ];
}

function experiment(experimentId, title, columns, rows) {
  return Object.freeze({experimentId, title, columns: Object.freeze(columns),
    rows: Object.freeze(rows)});
}

function buildCoverageManifest() {
  const targetClaims = new Map(arrayMap(ADVERTISED_TARGETS,
    (t) => [t.targetId, buildTargetClaims(t.targetId)]));
  const experiments = [
    experiment('scaleout-3to5-node-rf3', 'Three-to-five-node scale-out',
      ['3-node', '5-node', 'observed-placement'], scaleoutRows()),
    experiment('partition-granularity-sweep', 'Partition granularity sweep (5 nodes)',
      arrayMap(PARTITION_COUNTS, (p) => `p${p}`), partitionRows()),
    experiment('scenario-b-rtt-sweep', 'Scenario B under controlled network delay',
      arrayMap(RTT_POINTS_MS, (ms) => `rtt-${ms}ms`), rttRows()),
    experiment('scenario-b-working-set', 'Scenario B heavy working set',
      ['heavy-working-set'], workingSetRows()),
    experiment('live-movement-under-load', 'Partition movement under load',
      ['during-move', 'post-move'], movementRows()),
    experiment('scenario-c-joint-scaling', 'Scenario C at 5x scale',
      ['fresh-0ms-5x', 'fresh-1000ms-5x'], scenarioCScalingRows()),
    experiment('scenario-setup-breakdown', 'Per-phase time breakdown',
      ['phase-breakdown'], setupBreakdownRows()),
    experiment('lagrange-evolution', 'Lagrange milestones',
      ['scenarioA', 'scenarioB', 'scenarioC'], evolutionRows(targetClaims)),
  ];
  return Object.freeze({
    manifestId: COVERAGE_MANIFEST_ID,
    targets: ADVERTISED_TARGETS,
    targetClaims,
    experiments: Object.freeze(experiments),
  });
}

// Every distinct claim of the manifest, in a stable order.
function listManifestClaims(manifest) {
  const byKey = new Map();
  const add = (c) => {
    if (!byKey.has(c.claimKey)) byKey.set(c.claimKey, c);
  };
  for (const claims of manifest.targetClaims.values()) Object.values(claims).forEach(add);
  for (const exp of manifest.experiments) {
    for (const r of exp.rows) Object.values(r.cells).forEach(add);
  }
  return [...byKey.values()].sort((a, b) => (a.claimKey < b.claimKey ? -1 : 1));
}

const TARGET_ID = T;

export {
  ADVERTISED_TARGETS,
  COVERAGE_MANIFEST_ID,
  SCENARIO_B_SHAPES,
  SMOKE_TARGETS,
  TARGET_ID,
  buildCoverageManifest,
  listManifestClaims,
};
