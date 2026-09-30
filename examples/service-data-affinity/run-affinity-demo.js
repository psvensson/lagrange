import {existsSync, realpathSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {buildLocalNodeSpec} from './cluster-harness.js';
import {
  createRatingsTableWithRetry,
  loadRatingsIntoLagrange,
} from './lagrange-loader.js';
import {
  waitForAffinityDemoPreloadAdmission,
  waitForAffinityDemoSchemaAdmission,
} from './affinity-demo-preload-gate.js';
import {
  writeAffinityDemoLiveReport,
} from './affinity-demo-live-report.js';
import {
  archivePreviousAffinityRun,
  completeAffinityDemoRun,
  finalizeAffinityDemoRun,
  resolveClusterMode,
  resolveFormationOnly,
  restartExitedLocalNode,
  startAffinityDemoCluster,
  waitForActiveGcpNodes,
  waitForActiveLocalNodes,
  waitForAffinityAdmin,
  withAffinityDemoCleanup,
} from './affinity-demo-cluster-lifecycle.js';
import {
  assessAffinityDemoCompletion,
  buildWeightedLocalitySnapshot,
  topNRowsEqual,
} from './affinity-demo-evidence.js';
import {
  parseResultSnapshotWitness,
  RESULT_SNAPSHOT_STATE,
} from '../../src/runtime/sql-query-loop-parallel-reduce.js';
import {
  QUALITY_RANKING,
  RATINGS_AGGREGATE_SQL,
  rankMovieQuality,
} from './movie-ranking.js';
import {
  BASE_ADMIN_PORT,
  CLUSTER_DATA_ROOT,
  CLUSTER_FORM_TIMEOUT_MS,
  CONVERGE_TIMEOUT_MS,
  COORDINATION_TABLE,
  CREATE_COORDINATION_TABLE_SQL,
  CREATE_RESULT_TABLE_SQL,
  DEMO_CONSTANTS,
  NODE_COUNT,
  NODE_STATUS_ACTIVE,
  OBSERVE_INTERVAL_MS,
  PARALLEL_REDUCE_CONFIG,
  PARTITION_EVAL_INTERVAL_MS,
  POLL_INTERVAL_MS,
  QUERY_INTERVAL_MS,
  RESULT_ID,
  RESULT_SNAPSHOT_COLUMN,
  RESULT_TABLE,
  SCAN_SQL,
  SCHEMA_ADMISSION_SUCCESS_PREFIX,
  SCHEMA_ADMISSION_WAIT_MESSAGE,
  SERVICE_ID,
  SERVICE_REPLICA_COUNT,
  STALL_TIMEOUT_MS,
  TOP_N,
} from './affinity-demo-run-constants.js';
let TARGET = `ws://127.0.0.1:${BASE_ADMIN_PORT}/api/admin/stream`;
let LOAD_TARGET = `${TARGET}?lane=load`;

async function queryAdmin(
  sql,
  target = TARGET,
  timeoutMs = DEMO_CONSTANTS.ADMIN_QUERY_TIMEOUT_MS,
) {
  const boundedTimeoutMs = Math.max(
    1,
    Math.min(DEMO_CONSTANTS.ADMIN_QUERY_TIMEOUT_MS, Math.floor(timeoutMs)),
  );
  const client = new AdminWsClient({target, timeoutMs: boundedTimeoutMs});
  try {
    return await client.query(sql);
  } finally {
    await client.close();
  }
}
async function queryRows(sql, target = TARGET) {
  const result = await queryAdmin(sql, target);
  return result?.results || result?.rows || [];
}

// Bootstrap DDL on a lone forming seed is retryable BY CONTRACT: the schema
// job owner answers with explicit pending/retry outcomes when its prologue
// or a replica-operation visibility read is still converging (the round-7
// race closures), and the admin client's response cap can also fire while
// the seed's schema_operations partition is still routing. Poll through the
// demo's canonical waitFor primitive - semantic failures escape on the
// first attempt; only the two contract-retryable shapes keep polling.
const BOOTSTRAP_DDL_TIMEOUT_MS = 90_000;
const BOOTSTRAP_DDL_WAIT_LABEL = 'bootstrap DDL admission';
const ADMIN_RESPONSE_TIMEOUT_FRAGMENT = 'Timed out waiting for admin response';
const PENDING_CONTRACT_STATE = 'pending';
const REPLICA_BACKFILL_PENDING_REASON = 'schema_replica_convergence_pending';

// A pending outcome whose ONLY reason is replica-count backfill is the
// quorum-minimum completion shape: the table is durable and routable at
// the minimum replica count, and filling the remaining replicas is the
// rebalancer's obligation once more nodes join (round-14). On a lone seed
// the full-count READY bar is arithmetically unreachable, so retrying on
// this shape waits forever; every other pending shape (prologue,
// visibility, deadline) keeps polling.
function isQuorumMetBackfillPendingOutcome(result) {
  if (result?.contractState !== PENDING_CONTRACT_STATE) {
    return false;
  }
  const reasonCodes = Array.isArray(result?.reasonCodes) ?
    result.reasonCodes :
    [];
  return reasonCodes.length > 0 && reasonCodes.every(
    (code) => code === REPLICA_BACKFILL_PENDING_REASON,
  );
}

function isRetryableBootstrapDdlOutcome(result) {
  if (isQuorumMetBackfillPendingOutcome(result)) {
    return false;
  }
  return result?.provisioningDeadlineExpired === true ||
    result?.deferRetry === true ||
    result?.contractState === PENDING_CONTRACT_STATE;
}

async function runBootstrapDdl(sql, target = TARGET) {
  let semanticError = null;
  const outcome = await waitFor(BOOTSTRAP_DDL_WAIT_LABEL, async () => {
    try {
      const result = await queryAdmin(sql, target);
      return isRetryableBootstrapDdlOutcome(result) ? null : {result};
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes(ADMIN_RESPONSE_TIMEOUT_FRAGMENT)) {
        semanticError = error;
        return {failed: true};
      }
      return null;
    }
  }, BOOTSTRAP_DDL_TIMEOUT_MS);
  if (semanticError) {
    throw semanticError;
  }
  return outcome.result;
}

async function waitFor(label, predicate, timeoutMs) {
  const start = Date.now();
  const deadlineMs = start + timeoutMs;
  while (Date.now() < deadlineMs) {
    let value = null;
    try {
      value = await predicate({
        deadlineMs,
        remainingMs: Math.max(0, deadlineMs - Date.now()),
      });
    } catch {
      value = null;
    }
    if (value) {
      return value;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

function sqlQuote(value) {
  return `'${String(value).replace(
    /'/g,
    DEMO_CONSTANTS.SQL_ESCAPED_SINGLE_QUOTE,
  )}'`;
}

async function deployQueryLoopService() {
  const now = Date.now();
  // The runtime access policy gate is fail-closed (authority cutover
  // 1ea2eab98): every statement carrying issuingServiceId is DENIED unless a
  // runtime.access.service.<id> policy row grants its table accesses.
  // Production services get that row from the Bindings deployment surface;
  // this demo scaffolds service_definitions directly, so it must scaffold the
  // matching policy row the same way - without it the query loop's attributed
  // shard SELECT is silently denied and the learned-affinity lane stalls
  // (attributionRows=0, partial snapshots never computed).
  const accessPolicy = JSON.stringify({
    binding_version_id: 'demo-scaffold-movielens-topn',
    schema_version: 1,
    service_id: SERVICE_ID,
    tables: [
      {operations: ['read'], slot: 0, table: 'table:global.ratings'},
      {
        operations: ['read', 'write'],
        slot: 1,
        table: `table:global.${RESULT_TABLE}`,
      },
      {
        operations: ['read', 'write'],
        slot: 2,
        table: `table:global.${COORDINATION_TABLE}`,
      },
    ],
    tenant_id: 'demo',
  });
  await queryRows(
    DEMO_CONSTANTS.CONFIG_INSERT_PREFIX + [
      sqlQuote(`runtime.access.service.${SERVICE_ID}`),
      sqlQuote(accessPolicy),
      sqlQuote(DEMO_CONSTANTS.CONFIG_VALUE_TYPE),
      DEMO_CONSTANTS.SQL_FALSE,
      sqlQuote(DEMO_CONSTANTS.ACCESS_POLICY_DESCRIPTION),
      sqlQuote(DEMO_CONSTANTS.EMPTY_JSON_OBJECT),
      sqlQuote(DEMO_CONSTANTS.ACCESS_POLICY_UPDATED_BY),
      String(now),
      String(now),
    ].join(DEMO_CONSTANTS.SQL_LIST_SEPARATOR) + DEMO_CONSTANTS.SQL_CLOSE_PAREN,
  );
  const runtimeConfig = JSON.stringify({
    sql: SCAN_SQL,
    intervalMs: QUERY_INTERVAL_MS,
    reduce: {
      groupBy: 'movie_id',
      aggregate: 'confidence_adjusted_avg',
      valueColumn: 'rating',
      limit: TOP_N,
      ...QUALITY_RANKING,
    },
    resultTable: RESULT_TABLE,
    parallelReduce: PARALLEL_REDUCE_CONFIG,
  });
  const columns = [
    'service_id', 'service_name', 'service_profile',
    'handler_function_id', 'read_consistency', 'write_consistency',
    'read_locality', 'replica_count', 'protocol', 'resource_budget',
    'safety_interval_ms', 'runtime_kind', 'runtime_ref',
    'runtime_config', 'status', 'created_at', 'updated_at',
  ];
  const values = [
    sqlQuote(SERVICE_ID), sqlQuote('movielens-topn'), sqlQuote('default'),
    sqlQuote('sql-query-loop'), sqlQuote('strong'), sqlQuote('strong'),
    sqlQuote('any'), String(SERVICE_REPLICA_COUNT),
    sqlQuote('websocket'), sqlQuote('{}'),
    '500', sqlQuote('native_js'), sqlQuote('sql-query-loop-runtime'),
    sqlQuote(runtimeConfig), sqlQuote('active'), String(now), String(now),
  ];
  await queryRows(
    DEMO_CONSTANTS.SERVICE_INSERT_PREFIX +
    `${columns.join(DEMO_CONSTANTS.SQL_LIST_SEPARATOR)}) VALUES (` +
    `${values.join(DEMO_CONSTANTS.SQL_LIST_SEPARATOR)})`,
  );
}

// The nodes that hold an ACTIVE replica of the partitions "near the
// data" means for this demo: the partitions the service actually
// accessed (from its attribution rows) when known, else every ratings
// (tbl-) partition.
async function describeDataNodes(accessedPartitionIds = null) {
  const partitions = await queryRows(
    'SELECT partition_id, table_name, leader_node_id FROM partitions',
  );
  const ratingsPartitions = partitions.filter((p) =>
    p.table_name === 'ratings' &&
    (!accessedPartitionIds || accessedPartitionIds.has(p.partition_id)));
  const ratingsPartitionIds =
    new Set(ratingsPartitions.map((p) => p.partition_id));
  const services = await queryRows(
    'SELECT partition_id, node_id, service_type, status FROM services',
  );
  const holderNodeIds = new Set();
  for (const row of services) {
    if (row.service_type === DEMO_CONSTANTS.PARTITION_SERVICE_TYPE &&
        row.status === NODE_STATUS_ACTIVE &&
        ratingsPartitionIds.has(row.partition_id) &&
        row.node_id) {
      holderNodeIds.add(row.node_id);
    }
  }
  return {
    partitionCount: ratingsPartitions.length,
    holderNodeIds,
    leaderNodeIds: ratingsPartitions
      .map((p) => p.leader_node_id)
      .filter(Boolean),
  };
}

async function describeServicePlacement() {
  const rows = await queryRows(
    'SELECT service_id, node_id, status FROM services',
  );
  return rows
    .filter((r) =>
      String(r.service_id || '').startsWith(SERVICE_ID) &&
      r.status === NODE_STATUS_ACTIVE && r.node_id)
    .map((r) => ({replicaId: r.service_id, nodeId: r.node_id}));
}

async function describeAttribution() {
  const rows = await queryRows(
    'SELECT node_id, service_id, access_json, published_at ' +
    'FROM service_partition_access',
  );
  return rows.filter((r) => r.service_id === SERVICE_ID);
}

async function describeReduceSlots() {
  try {
    return await queryRows(
      DEMO_CONSTANTS.REDUCE_SLOT_QUERY +
      `computed_at FROM ${COORDINATION_TABLE}`,
    );
  } catch {
    return [];
  }
}

async function describeTopN() {
  try {
    const rows = await queryRows(
      `SELECT result_json, computed_at, ${RESULT_SNAPSHOT_COLUMN} ` +
      `FROM ${RESULT_TABLE} ` +
      `WHERE result_id = ${sqlQuote(RESULT_ID)}`,
    );
    const parsed = JSON.parse(rows[0]?.result_json || '[]');
    return parsed.map((row, index) => ({
      rank: index + 1,
      group_key: row.groupKey,
      agg_value: row.aggValue,
      computed_at: rows[0]?.computed_at,
      [RESULT_SNAPSHOT_COLUMN]: rows[0]?.[RESULT_SNAPSHOT_COLUMN],
    }));
  } catch {
    return [];
  }
}

async function describeWeightedLocality(placements, attributionRows) {
  const [nodes, partitions, services] = await Promise.all([
    queryRows(DEMO_CONSTANTS.NODES_QUERY),
    queryRows(DEMO_CONSTANTS.PARTITIONS_QUERY),
    queryRows(DEMO_CONSTANTS.SERVICES_QUERY),
  ]);
  return buildWeightedLocalitySnapshot({
    serviceId: SERVICE_ID,
    placements,
    nodes,
    partitions,
    services,
    attributionRows,
    nowMs: Date.now(),
  });
}

async function describeDemoState(referenceTopN, phaseStartedAt) {
  const [placements, attributionRows, serviceTopN, reduceSlots] =
    await Promise.all([
      describeServicePlacement(),
      describeAttribution(),
      describeTopN(),
      describeReduceSlots(),
    ]);
  const weightedLocality = await describeWeightedLocality(
    placements, attributionRows,
  );
  const assessment = assessAffinityDemoCompletion({
    expectedReplicaCount: SERVICE_REPLICA_COUNT,
    placements,
    weightedLocality,
    referenceTopN,
    serviceTopN,
    reduceSlots,
    expectedMergeCandidateCount: SERVICE_REPLICA_COUNT * TOP_N,
    phaseStartedAt,
    parallelReduceConfig: PARALLEL_REDUCE_CONFIG,
    partialLimit: TOP_N,
  });
  return {
    placements,
    attributionRows,
    serviceTopN,
    reduceSlots,
    weightedLocality,
    assessment,
  };
}

async function observeDemoPhase(
  label,
  referenceTopN,
  phaseStartedAt,
  accept,
  onObservation = () => {},
) {
  const start = Date.now();
  let lastProgressSignature = null;
  let lastProgressAtMs = Date.now();
  while (Date.now() - start < CONVERGE_TIMEOUT_MS) {
    await sleep(OBSERVE_INTERVAL_MS);
    const state = await describeDemoState(referenceTopN, phaseStartedAt);
    const observedState = {
      ...state,
      phaseStartedAt,
      elapsedMs: Date.now() - start,
    };
    onObservation(observedState);
    const placementLabel = state.placements.map((placement) =>
      placement.nodeId.slice(0, 8));
    console.log(
      `      ${label} t+${Math.round(
        (Date.now() - start) / DEMO_CONSTANTS.MILLISECONDS_PER_SECOND,
      )}s ` +
      `replicas=${state.placements.length} ` +
      `weightedLocality=${state.weightedLocality.localityRatio.toFixed(
        DEMO_CONSTANTS.LOCALITY_DECIMAL_PLACES,
      )} ` +
      `attributionRows=${state.attributionRows.length} ` +
      `partialReplicas=${state.assessment.partialReplicaCount} ` +
      `mergeCandidates=${state.assessment.mergeCandidateCount} ` +
      `top10Correct=${state.assessment.resultCorrect} ` +
      `placement=${JSON.stringify(placementLabel)}`,
    );
    if (accept(state)) {
      return observedState;
    }
    const progressSignature = JSON.stringify({
      placementLabel: placementLabel.sort(),
      locality: state.weightedLocality.localityRatio,
      attributionRows: state.attributionRows.length,
      partialReplicas: state.assessment.partialReplicaCount,
      resultCorrect: state.assessment.resultCorrect,
    });
    if (progressSignature !== lastProgressSignature) {
      lastProgressSignature = progressSignature;
      lastProgressAtMs = Date.now();
    } else if (Date.now() - lastProgressAtMs > STALL_TIMEOUT_MS) {
      throw new Error(
        `${label} stalled with no observable progress for ` +
        `${Math.round(
          STALL_TIMEOUT_MS / DEMO_CONSTANTS.MILLISECONDS_PER_SECOND,
        )}s`,
      );
    }
  }
  throw new Error(`${label} did not converge within ${CONVERGE_TIMEOUT_MS}ms`);
}

async function observeInitialPlacement() {
  const start = Date.now();
  while (Date.now() - start < CONVERGE_TIMEOUT_MS) {
    const placements = await describeServicePlacement();
    if (placements.length === SERVICE_REPLICA_COUNT) {
      return {placements, observedAt: Date.now()};
    }
    await sleep(OBSERVE_INTERVAL_MS);
  }
  throw new Error(DEMO_CONSTANTS.INITIAL_PLACEMENT_ERROR);
}

function summarizeReduceSlots(reduceSlots) {
  return reduceSlots.map((slot) => ({
    slotId: Number(slot.slot_id),
    replicaId: slot.replica_id,
    leaseExpiresAt: Number(slot.lease_expires_at),
    computedAt: Number(slot.computed_at),
    candidateCount: JSON.parse(slot.partial_json).length,
  }));
}

function summarizePhase(state) {
  const encodedResultSnapshot =
    state.serviceTopN[0]?.[RESULT_SNAPSHOT_COLUMN];
  const resultSnapshot = parseResultSnapshotWitness(
    encodedResultSnapshot,
    PARALLEL_REDUCE_CONFIG,
    TOP_N,
  );
  return {
    phaseStartedAt: state.phaseStartedAt,
    weightedLocality: state.weightedLocality.localityRatio,
    placement: state.placements,
    slotOwners: summarizeReduceSlots(state.reduceSlots),
    resultComputedAt: Number(state.serviceTopN[0]?.computed_at) || 0,
    resultSnapshot,
    assessment: state.assessment,
    elapsedMs: state.elapsedMs,
  };
}

function demoResultObservationIsValid(result) {
  return result?.resultCorrect === true &&
    result?.ranking?.length === TOP_N &&
    result?.learnedAffinity?.resultComputedAt > 0 &&
    result?.learnedAffinity?.resultSnapshot?.state ===
      RESULT_SNAPSHOT_STATE.AVAILABLE;
}

function retainObservedDemoResult(phaseEvidence, observedResult) {
  if (!demoResultObservationIsValid(observedResult)) return false;
  const retainedComputedAt =
    phaseEvidence.result?.learnedAffinity?.resultComputedAt || 0;
  const observedComputedAt = observedResult.learnedAffinity.resultComputedAt;
  if (observedComputedAt < retainedComputedAt) return false;
  phaseEvidence.result = observedResult;
  return true;
}

async function runAffinityDemo({phaseEvidence = {}} = {}) {
  const mode = resolveClusterMode();
  const formationOnly = resolveFormationOnly();
  phaseEvidence.formationOnly = formationOnly;
  const formation = {clusterStartedAtMs: Date.now(), clusterFormedAtMs: null};
  const formationDeadlineMs =
    formation.clusterStartedAtMs + CLUSTER_FORM_TIMEOUT_MS;
  const dataRoot = resolve(CLUSTER_DATA_ROOT, `run-${randomUUID()}`);
  phaseEvidence.formation = formation;
  await archivePreviousAffinityRun();
  const cleanupContext = {
    clusterHandle: null, phaseEvidence, formation, dataRoot};
  return withAffinityDemoCleanup(cleanupContext, async () => {
    console.log(DEMO_CONSTANTS.BOOTSTRAP_MESSAGE);
    const clusterHandle = await startAffinityDemoCluster(
      mode, dataRoot);
    cleanupContext.clusterHandle = clusterHandle;
    if (clusterHandle.target) {
      TARGET = clusterHandle.target;
      LOAD_TARGET = clusterHandle.loadTarget;
    }
    if (mode !== DEMO_CONSTANTS.GCP_MODE) {
      await clusterHandle.cluster.startNode(
        buildLocalNodeSpec(0, dataRoot), {deadlineMs: formationDeadlineMs});
    }
    await waitForAffinityAdmin(waitFor, queryRows, formationDeadlineMs);
    // Bootstrap the two small coordination tables on the seed too. Their
    // schemas then scale out with the cluster instead of exercising unrelated
    // cold multi-node DDL while the example is teaching service affinity.
    await runBootstrapDdl(CREATE_RESULT_TABLE_SQL);
    await runBootstrapDdl(CREATE_COORDINATION_TABLE_SQL);

    console.log(
      `[2/5] Expanding to ${NODE_COUNT} nodes (single zone) and spreading ` +
      DEMO_CONSTANTS.EXPANSION_SUFFIX);
    if (mode !== DEMO_CONSTANTS.GCP_MODE) {
      for (let i = 1; i < NODE_COUNT; i += 1) {
        await clusterHandle.cluster.startNode(
          buildLocalNodeSpec(i, dataRoot), {deadlineMs: formationDeadlineMs});
      }
      await waitForActiveLocalNodes(
        NODE_COUNT, clusterHandle.cluster, waitFor, queryRows,
        formationDeadlineMs);
    } else {
      // createCluster already started and formed all nodes.
      await waitForActiveGcpNodes(
        NODE_COUNT, waitFor, queryRows, formationDeadlineMs);
    }
    formation.clusterFormedAtMs = Date.now();
    console.log(DEMO_CONSTANTS.CLUSTER_FORMED_MESSAGE);
    console.log(SCHEMA_ADMISSION_WAIT_MESSAGE);
    const schemaAdmission = await waitForAffinityDemoSchemaAdmission({
      target: TARGET,
      query: ({target, sql, timeoutMs}) =>
        queryAdmin(sql, target, timeoutMs),
      now: Date.now,
      sleep,
      timeoutMs: CLUSTER_FORM_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      stableWindowMs: PARTITION_EVAL_INTERVAL_MS,
    });
    phaseEvidence.schemaAdmission = schemaAdmission;
    console.log(
      SCHEMA_ADMISSION_SUCCESS_PREFIX +
      `(state=${schemaAdmission.snapshot.state}).`,
    );
    if (formationOnly) {
      console.log(DEMO_CONSTANTS.FORMATION_ONLY_MESSAGE);
      return {converged: true, formationOnly: true, schemaAdmission};
    }
    await createRatingsTableWithRetry({target: TARGET});
    // The authoritative snapshot gate prevents DDL from racing formation
    // recovery. CREATE then owns the sparse ratings policy atomically after
    // enough nodes exist to satisfy its durable replica contract. The
    // production-wide 10 GiB default remains intact, so formation logs cannot
    // inherit the teaching threshold and become an unrelated preload blocker.
    console.log(DEMO_CONSTANTS.PRELOAD_WAIT_MESSAGE);
    const preloadAdmission = await waitForAffinityDemoPreloadAdmission({
      target: TARGET,
      query: ({target, sql, timeoutMs}) =>
        queryAdmin(sql, target, timeoutMs),
      now: Date.now,
      sleep,
      timeoutMs: CLUSTER_FORM_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
    phaseEvidence.preloadAdmission = preloadAdmission;
    console.log(
      DEMO_CONSTANTS.PRELOAD_SUCCESS_PREFIX +
      `${preloadAdmission.snapshot.state}, loadLane=` +
      `${preloadAdmission.loadLaneAdmission.state}).`,
    );
    console.log(DEMO_CONSTANTS.LOAD_MESSAGE);
    const totalRows = await loadRatingsIntoLagrange({target: LOAD_TARGET});
    console.log(`      Loaded ${totalRows} ratings.`);

    console.log(DEMO_CONSTANTS.SPLIT_WAIT_MESSAGE);
    const dataNodes = await waitFor(
      'ratings partitions on at least two nodes',
      async () => {
        const state = await describeDataNodes();
        return state.partitionCount >= 2 && state.holderNodeIds.size >= 2 ?
          state : null;
      },
      CONVERGE_TIMEOUT_MS,
    );
    console.log(
      `      Ratings partitions: ${dataNodes.partitionCount}, ` +
      `data on nodes: ${JSON.stringify([...dataNodes.holderNodeIds])}`);
    console.log(DEMO_CONSTANTS.DISTRIBUTED_SQL_MESSAGE);
    const distributedSqlStart = Date.now();
    const aggregateRows = await queryRows(RATINGS_AGGREGATE_SQL);
    const referenceTopN = rankMovieQuality(aggregateRows).map((row, index) => ({
      rank: index + 1,
      group_key: row.movieId,
      agg_value: row.score,
    }));
    const distributedSqlElapsedMs = Date.now() - distributedSqlStart;
    console.log(
      `      Lagrange SQL returned ${aggregateRows.length} grouped rows ` +
      `in ${distributedSqlElapsedMs}ms (rather than ${totalRows} ratings).`);

    console.log(
      `[4/5] Starting the ${SERVICE_ID} runtime service on the internal ` +
      `substrate (${SERVICE_REPLICA_COUNT} replicas pinned by the demo ` +
      DEMO_CONSTANTS.SERVICE_START_SUFFIX);
    await runBootstrapDdl(CREATE_RESULT_TABLE_SQL);
    await runBootstrapDdl(CREATE_COORDINATION_TABLE_SQL);
    await queryRows(
      `INSERT INTO ${RESULT_TABLE} (result_id, result_json, computed_at, ` +
      `${RESULT_SNAPSHOT_COLUMN}) VALUES (` +
      `${sqlQuote(RESULT_ID)}, '[]', 0, '{}')`,
    );
    await queryRows(
      `INSERT INTO ${COORDINATION_TABLE} ` +
      DEMO_CONSTANTS.COORDINATION_INSERT_COLUMNS +
      DEMO_CONSTANTS.COORDINATION_INSERT_VALUES,
    );
    const learnedPhaseStartedAt = Date.now();
    await deployQueryLoopService();
    const initial = await observeInitialPlacement();

    console.log(
      DEMO_CONSTANTS.AFFINITY_WAIT_MESSAGE);
    const learned = await observeDemoPhase(
      'learned-affinity', referenceTopN, learnedPhaseStartedAt,
      (state) => state.assessment.complete,
      (state) => {
        const learnedAffinity = summarizePhase(state);
        retainObservedDemoResult(phaseEvidence, {
          converged: false,
          schemaAdmission,
          preloadAdmission,
          lagrangeDistributedSql: {
            inputRatings: totalRows,
            returnedAggregateRows: aggregateRows.length,
            elapsedMs: distributedSqlElapsedMs,
          },
          parallelReduce: {
            replicas: SERVICE_REPLICA_COUNT,
            mergeCandidates: state.assessment.mergeCandidateCount,
            elapsedToCorrectOptimalResultMs: state.elapsedMs,
          },
          learnedAffinity,
          resultCorrect: state.assessment.resultCorrect,
          ranking: state.serviceTopN.map((row) => ({
            movieId: Number(row.group_key),
            score: Number(row.agg_value),
          })),
        });
      },
    );
    const initialWeightedLocality = await describeWeightedLocality(
      initial.placements, learned.attributionRows,
    );
    const improved = learned.weightedLocality.localityRatio >
      initialWeightedLocality.localityRatio;
    const initialNodes = new Set(initial.placements.map((row) => row.nodeId));
    const learnedNodes = new Set(learned.placements.map((row) => row.nodeId));
    const placementChanged = initialNodes.size !== learnedNodes.size ||
      [...initialNodes].some((nodeId) => !learnedNodes.has(nodeId));
    console.log(
      DEMO_CONSTANTS.CONVERGED_PREFIX +
      `weighted placement (${placementChanged ? DEMO_CONSTANTS.REPLICAS_MOVED :
        DEMO_CONSTANTS.INITIAL_PLACEMENT_OPTIMAL}).`);
    console.log(
      DEMO_CONSTANTS.EXCHANGE_PREFIX +
      `${learned.assessment.mergeCandidateCount} partial candidates; ` +
      `distributed SQL returned ${aggregateRows.length} movie aggregates. ` +
      DEMO_CONSTANTS.RANKING_SUFFIX);
    for (const row of learned.serviceTopN) {
      console.log(
        `        #${row.rank} movie ${row.group_key} ` +
        `score=${Number(row.agg_value).toFixed(
          DEMO_CONSTANTS.SCORE_DECIMAL_PLACES,
        )}`);
    }
    console.log(DEMO_CONSTANTS.EMPTY_STRING);
    return {
      converged: learned.assessment.complete,
      schemaAdmission,
      preloadAdmission,
      lagrangeDistributedSql: {
        inputRatings: totalRows,
        returnedAggregateRows: aggregateRows.length,
        elapsedMs: distributedSqlElapsedMs,
      },
      parallelReduce: {
        replicas: SERVICE_REPLICA_COUNT,
        mergeCandidates: learned.assessment.mergeCandidateCount,
        elapsedToCorrectOptimalResultMs: learned.elapsedMs,
      },
      initialPlacement: {
        observedAt: initial.observedAt,
        placement: initial.placements,
        weightedLocality: initialWeightedLocality.localityRatio,
      },
      learnedAffinity: {
        ...summarizePhase(learned),
        improved,
        placementChanged,
      },
      resultCorrect: topNRowsEqual(referenceTopN, learned.serviceTopN),
      ranking: learned.serviceTopN.map((row) => ({
        movieId: Number(row.group_key),
        score: Number(row.agg_value),
      })),
      top10: learned.serviceTopN.map((r) =>
        `#${r.rank} movie ${r.group_key} score=` +
        Number(r.agg_value).toFixed(DEMO_CONSTANTS.SCORE_DECIMAL_PLACES)),
    };
  });
}

const isMainModule = Boolean(
  process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(resolve(process.argv[1])) ===
      realpathSync(fileURLToPath(import.meta.url)),
);

if (isMainModule) {
  const phaseEvidence = {};
  runAffinityDemo({phaseEvidence})
    .then(async (result) => {
      await writeAffinityDemoLiveReport(result, null, phaseEvidence);
      console.log(DEMO_CONSTANTS.RESULT_MESSAGE);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.converged ? 0 : 1;
    })
    .catch(async (error) => {
      await writeAffinityDemoLiveReport(null, error, phaseEvidence);
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  completeAffinityDemoRun,
  finalizeAffinityDemoRun,
  restartExitedLocalNode,
  retainObservedDemoResult,
  runAffinityDemo,
  summarizePhase,
  withAffinityDemoCleanup,
};
