/**
 * Scenario: Partition Merge Under Load
 *
 * Live-validates the managed partition merge on a real multi-node cluster:
 * provisions the benchmark table with split-friendly policies, drives a
 * ledgered INSERT workload until the table splits into 3+ partitions,
 * flips the table policies to merge-friendly, and verifies — under a
 * continuing ledgered write load plus a sibling-range read probe — that
 * real auto-merges execute end to end:
 *
 *  (i)   merge lifecycle completions observed in node logs (exact
 *        MANAGED_MERGE_LOG_MSG constants through terminal clear),
 *  (ii)  zero acknowledged-write loss (ledger vs post-merge scan),
 *  (iii) zero client-visible routing failures on sibling (non-
 *        participating) partition ranges during merge windows,
 *  (iv)  retired source partitions gone from the authoritative topology
 *        and their partition services (raft groups) gone on every node,
 *  (v)   a second merge on the same table completes (terminal clear
 *        works live).
 *
 * Failure variants (source-leader kill mid-backfill / in the cutover
 * window, merge under replacement churn, abort-then-retry) are selected
 * via the scenario `variant` option and share this happy-path skeleton.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolvePartitionMergeUnderLoadScenarioConfig,
  resolveScenarioOptions,
} from '../harness/scenario-config.js';
import {
  BENCHMARK_WORKLOAD_PROFILE,
  createPartitioningAdaptiveDispatchGuardrail,
  createPartitioningBenchmarkLoadNodePlan,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  resolvePartitioningLoadTableName,
  waitForPartitionGrowthAndSpread,
  sleep,
} from './table-distribution-helpers.js';
import {
  VARIANT_PLAN,
  buildLifecycleCompletionPlan,
  runVariantFaultInjection,
} from './partition-merge-under-load-variants.js';
import {
  TABLE_DISTRIBUTION_CONTROL_QUERY_HELPERS,
} from './table-distribution-helpers-control-query.js';
import {
  assertAcknowledgedWritesVisibleOnReachableNodes,
} from './rolling-restart.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../../src/partition/partition-constants.js';
import {
  buildMergeWindows,
  buildPartitionRangeIndex,
  classifyProbeSamples,
  diffAcknowledgedLedgerAgainstScan,
  resolveParticipantsByWindow,
  resolveRetiredAndAddedPartitionIds,
  scanManagedMergeLifecycleEvents,
  selectEvenlySpacedProbeKeys,
  summarizeMergeLifecycle,
} from './partition-merge-under-load-helpers.js';

const {
  CONTROL_QUERY_LANE_SNAPSHOT,
  SERVICE_TYPE_PARTITION,
  escapeSql,
  queryControl,
  rowsFromResult,
} = TABLE_DISTRIBUTION_CONTROL_QUERY_HELPERS;

const ZERO = 0;
const ONE = 1;
const MILLIS_PER_SECOND = 1000;
const LOG_SCAN_OVERLAP_SECONDS = 5;
const SCENARIO_NAME = 'partition-merge-under-load';
const SCENARIO_OPTIONS_KEY = 'partitionMergeUnderLoad';
const LOAD_OPERATION_INSERT = 'INSERT';
const SPLIT_PHASE_EVENT_ID_PREFIX = 'merge-p1-';
const MERGE_PHASE_EVENT_ID_PREFIX = 'merge-p2-';
const PROBE_MISSING_ROW_ERROR =
  'acknowledged key returned zero rows';
const TRANSITION_POLL_TIMEOUT_MS = 8000;
const TOPOLOGY_QUERY_TIMEOUT_MS = 45000;
const MAX_REPORTED_EVENTS = 60;
const MAX_REPORTED_FAILURES = 10;

const SQL_QUOTE = '\'';
const SQL_SELECT_PARTITION_RANGES_PREFIX =
  'SELECT partition_id, partition_key_start, partition_key_end, ' +
  'leader_node_id FROM partitions WHERE table_id = ';
const SQL_SELECT_TABLE_TRANSITION_PREFIX =
  'SELECT partition_transition_state, partition_transition_metadata ' +
  'FROM tables WHERE table_id = ';
const SQL_SELECT_PARTITION_SERVICES_PREFIX =
  'SELECT partition_id, node_id, status FROM services ' +
  'WHERE service_type = ';
const SQL_SELECT_PARTITION_SERVICES_MID = ' AND partition_id IN (';
const SQL_SELECT_PARTITION_SERVICES_SUFFIX = ')';
const SQL_SELECT_PROBE_PREFIX = 'SELECT event_id FROM ';
const SQL_SELECT_PROBE_MID = ' WHERE event_id = ';

/**
 * Pick the seed node handle.
 * @param {Array<Object>} nodes
 * @return {Object|null}
 */
function getSeedNode(nodes) {
  return nodes.find((node) => node.role === 'seed') || nodes[ZERO] || null;
}

/**
 * Quote one SQL string literal.
 * @param {string} value
 * @return {string}
 */
function sqlQuote(value) {
  return SQL_QUOTE + escapeSql(String(value)) + SQL_QUOTE;
}

/**
 * Query the authoritative partition rows (id, key range, leader) for one
 * table.
 * @param {Object} seedNode
 * @param {string} tableId
 * @param {Array<Object>} queryNodes
 * @return {Promise<Array<Object>>}
 */
async function queryPartitionRangeRows(seedNode, tableId, queryNodes) {
  const sql = SQL_SELECT_PARTITION_RANGES_PREFIX + sqlQuote(tableId);
  // Read fan-out across every node: a single node's congested snapshot
  // lane (seen live as a 19.6s admin timeout on the seed during a
  // control-plane deferral storm) must not abort the scenario when the
  // same row is readable from a sibling.
  const result = await queryControl(seedNode, sql, [], {
    lane: CONTROL_QUERY_LANE_SNAPSHOT,
    queryNodes,
    fallbackNodes: queryNodes,
    timeoutMs: TOPOLOGY_QUERY_TIMEOUT_MS,
  });
  return rowsFromResult(result);
}

/**
 * Parse the tables-row transition metadata JSON defensively.
 * @param {*} rawMetadata
 * @return {Object|null}
 */
function parseTransitionMetadata(rawMetadata) {
  if (typeof rawMetadata !== 'string' || rawMetadata.length === ZERO) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawMetadata);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Query the table's partition transition row (state plus source/target
 * participant ids).
 * @param {Object} seedNode
 * @param {string} tableId
 * @param {Array<Object>} queryNodes
 * @return {Promise<{tsMs: number, state: string|null,
 *   sourcePartitionIds: Array<string>, targetPartitionIds:
 *   Array<string>}>}
 */
async function queryTableTransitionObservation(
  seedNode,
  tableId,
  queryNodes,
) {
  const sql = SQL_SELECT_TABLE_TRANSITION_PREFIX + sqlQuote(tableId);
  const result = await queryControl(seedNode, sql, [], {
    lane: CONTROL_QUERY_LANE_SNAPSHOT,
    queryNodes,
    fallbackNodes: queryNodes,
    timeoutMs: TRANSITION_POLL_TIMEOUT_MS,
  });
  const row = rowsFromResult(result)[ZERO] || {};
  const metadata = parseTransitionMetadata(
    row.partition_transition_metadata,
  );
  const sourceIds = metadata?.[
    PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS
  ];
  const targetIds = metadata?.[
    PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
  ];
  return {
    tsMs: Date.now(),
    state: typeof row.partition_transition_state === 'string' &&
      row.partition_transition_state.length > ZERO ?
      row.partition_transition_state :
      null,
    sourcePartitionIds: Array.isArray(sourceIds) ?
      sourceIds.map((id) => String(id)) :
      [],
    targetPartitionIds: Array.isArray(targetIds) ?
      targetIds.map((id) => String(id)) :
      [],
  };
}

/**
 * Collect managed-merge lifecycle events from every node's container
 * logs since one epoch second.
 * @param {Array<Object>} nodes
 * @param {number} sinceEpochSeconds
 * @return {Promise<Array<Object>>}
 */
async function collectMergeLifecycleEvents(nodes, sinceEpochSeconds) {
  const events = [];
  for (const node of nodes) {
    if (typeof node.getLogs !== 'function') {
      continue;
    }
    let logText = '';
    try {
      logText = await node.getLogs({since: sinceEpochSeconds});
    } catch (_error) {
      continue;
    }
    events.push(...scanManagedMergeLifecycleEvents(logText, node.id));
  }
  return events;
}

/**
 * Poll node logs (and the transition row) until the given predicate over
 * the lifecycle summary holds.
 * @param {Object} context
 * @return {Promise<{events: Array<Object>, summary: Object,
 *   transitionObservations: Array<Object>}>}
 */
async function waitForMergeLifecycleCondition(context) {
  const {
    nodes,
    seedNode,
    tableId,
    queryNodes,
    sinceEpochSeconds,
    predicate,
    timeoutMs,
    pollIntervalMs,
    description,
  } = context;
  const deadlineMs = Date.now() + timeoutMs;
  const transitionObservations = [];
  let events = [];
  let summary = summarizeMergeLifecycle(events);
  let latestTransitionState = null;
  for (;;) {
    events = await collectMergeLifecycleEvents(nodes, sinceEpochSeconds);
    summary = summarizeMergeLifecycle(events);
    try {
      const observation = await queryTableTransitionObservation(
        seedNode,
        tableId,
        queryNodes,
      );
      transitionObservations.push(observation);
      latestTransitionState = observation.state;
    } catch (_error) {
      // Transition-row sampling is best-effort evidence enrichment.
    }
    if (predicate({summary, transitionState: latestTransitionState})) {
      return {events, summary, transitionObservations};
    }
    if (Date.now() >= deadlineMs) {
      break;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(
    'Timed out waiting for ' + description + ' within ' + timeoutMs +
    'ms. Lifecycle counts: ' + JSON.stringify(summary.countsByKey) +
    ', lastTransitionState=' + String(latestTransitionState),
  );
}

/**
 * Start the continuous per-key read probe used for the sibling
 * routability assertion. Keys are acknowledged phase-1 inserts, so every
 * probe must find exactly its row; errors and empty results are recorded
 * as failures with timestamps for window classification.
 * @param {Object} options
 * @return {{stop: Function}} stop() resolves to the recorded samples.
 */
function startRoutabilityProbe(options) {
  const {nodes, tableName, keys, intervalMs, queryTimeoutMs} = options;
  const samples = [];
  let stopped = false;
  const probeLoop = (async () => {
    let tick = ZERO;
    while (!stopped) {
      const key = keys[tick % keys.length];
      const node = nodes[tick % nodes.length];
      tick += ONE;
      const sql = SQL_SELECT_PROBE_PREFIX + tableName +
        SQL_SELECT_PROBE_MID + sqlQuote(key);
      const tsMs = Date.now();
      try {
        const result = await node.queryWithTimeout(sql, [], {
          timeoutMs: queryTimeoutMs,
        });
        const rowCount = rowsFromResult(result).length;
        samples.push({
          key,
          nodeId: node.id,
          tsMs,
          ok: rowCount >= ONE,
          errorMessage: rowCount >= ONE ? null : PROBE_MISSING_ROW_ERROR,
        });
      } catch (error) {
        samples.push({
          key,
          nodeId: node.id,
          tsMs,
          ok: false,
          errorMessage: String(error?.message || error),
        });
      }
      await sleep(intervalMs);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await probeLoop;
      return samples;
    },
  };
}

/**
 * Filter to nodes that answer an isReachable check.
 * @param {Array<Object>} nodes
 * @return {Promise<Array<Object>>}
 */
async function filterReachableNodes(nodes) {
  const reachable = [];
  for (const node of nodes) {
    if (typeof node?.isReachable === 'function') {
      let nodeReachable = false;
      try {
        nodeReachable = await node.isReachable();
      } catch (_error) {
        nodeReachable = false;
      }
      if (!nodeReachable) {
        continue;
      }
    }
    reachable.push(node);
  }
  return reachable;
}

/**
 * Query one node's view of partition services rows for the retired
 * source partition ids.
 * @param {Object} node
 * @param {Array<string>} retiredIds
 * @return {Promise<Array<Object>>}
 */
async function queryRetiredPartitionServiceRows(node, retiredIds) {
  const sql = SQL_SELECT_PARTITION_SERVICES_PREFIX +
    sqlQuote(SERVICE_TYPE_PARTITION) +
    SQL_SELECT_PARTITION_SERVICES_MID +
    retiredIds.map((id) => sqlQuote(id)).join(', ') +
    SQL_SELECT_PARTITION_SERVICES_SUFFIX;
  const result = await node.queryWithTimeout(sql, [], {
    timeoutMs: TRANSITION_POLL_TIMEOUT_MS,
  });
  return rowsFromResult(result);
}

/**
 * Wait until the retired source partitions are gone from the
 * authoritative topology, their partition services (raft groups) are
 * gone on every reachable node, and the table transition state is clear.
 * @param {Object} context
 * @return {Promise<Object>} teardown evidence
 */
async function waitForRetiredPartitionTeardown(context) {
  const {
    nodes,
    seedNode,
    tableId,
    queryNodes,
    retiredIds,
    timeoutMs,
    pollIntervalMs,
  } = context;
  const deadlineMs = Date.now() + timeoutMs;
  let lastEvidence = null;
  for (;;) {
    const partitionRows = await queryPartitionRangeRows(
      seedNode,
      tableId,
      queryNodes,
    );
    const presentIds = new Set(
      partitionRows.map((row) => String(row.partition_id)),
    );
    const retiredStillInTopology = retiredIds.filter(
      (id) => presentIds.has(id),
    );
    const reachableNodes = await filterReachableNodes(nodes);
    const serviceRowsByNode = {};
    let retiredServiceRowCount = ZERO;
    for (const node of reachableNodes) {
      let serviceRows = [];
      try {
        serviceRows = await queryRetiredPartitionServiceRows(
          node,
          retiredIds,
        );
      } catch (error) {
        serviceRows = [{queryError: String(error?.message || error)}];
      }
      serviceRowsByNode[node.id] = serviceRows;
      retiredServiceRowCount += serviceRows.length;
    }
    let transitionState = null;
    try {
      const observation = await queryTableTransitionObservation(
        seedNode,
        tableId,
        queryNodes,
      );
      transitionState = observation.state;
    } catch (_error) {
      transitionState = null;
    }
    lastEvidence = {
      retiredIds,
      retiredStillInTopology,
      retiredServiceRowCount,
      serviceRowsByNode,
      transitionState,
      reachableNodeCount: reachableNodes.length,
      finalPartitionIds: [...presentIds].sort(),
    };
    if (
      retiredStillInTopology.length === ZERO &&
      retiredServiceRowCount === ZERO &&
      transitionState === null
    ) {
      return lastEvidence;
    }
    if (Date.now() >= deadlineMs) {
      break;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(
    'Retired source partitions not fully dissolved within ' + timeoutMs +
    'ms: ' + JSON.stringify(lastEvidence),
  );
}

/**
 * Assert the load-run success rate stayed above the configured floor.
 * @param {Object} metrics
 * @param {number} minSuccessRate
 * @param {string} phaseLabel
 * @return {number}
 */
function assertLoadSuccessRate(metrics, minSuccessRate, phaseLabel) {
  assert.ok(
    metrics.total > ZERO,
    'Expected at least one ' + phaseLabel + ' load operation',
  );
  const successRate = metrics.success / metrics.total;
  assert.ok(
    successRate >= minSuccessRate,
    phaseLabel + ' load success rate below threshold: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );
  return successRate;
}

/**
 * Return the first non-empty string among candidates, else null.
 * @param {Array<*>} candidates
 * @return {string|null}
 */
function firstNonEmptyString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > ZERO) {
      return candidate;
    }
  }
  return null;
}

/**
 * Normalize one acknowledged-writes ledger's id list.
 * @param {Object|null} acks
 * @return {Array<string>}
 */
function ledgerIdsOf(acks) {
  return Array.isArray(acks?.ids) ? acks.ids : [];
}

/**
 * Combine the two phases' acknowledged-write ledgers.
 * @param {Object|null} splitPhaseAcks
 * @param {Object|null} mergePhaseAcks
 * @return {{tableName: string|null, idColumn: string|null,
 *   ids: Array<string>}}
 */
function combineAcknowledgedWrites(splitPhaseAcks, mergePhaseAcks) {
  return {
    tableName: firstNonEmptyString([
      splitPhaseAcks?.tableName,
      mergePhaseAcks?.tableName,
    ]),
    idColumn: firstNonEmptyString([
      splitPhaseAcks?.idColumn,
      mergePhaseAcks?.idColumn,
    ]),
    ids: [...new Set([
      ...ledgerIdsOf(splitPhaseAcks),
      ...ledgerIdsOf(mergePhaseAcks),
    ])],
  };
}

/**
 * Run the split phase: provision the table with split-friendly policies
 * and drive a ledgered INSERT load until 3+ partitions exist.
 * @param {Object} context
 * @return {Promise<Object>}
 */
async function runSplitPhase(context) {
  const {cluster, nodes, seedNode, config, tableName} = context;
  const tablePreparation = await prepareBenchmarkPartitioningTable(
    seedNode,
    {
      tableName,
      queryNodes: nodes,
      tablePolicies: config.splitPhaseTablePolicies,
    },
  );
  assertSplitPolicyPrecondition(tablePreparation, {
    scenarioName: SCENARIO_NAME,
  });
  const loadNodePlan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName,
      tableId: tablePreparation.tableId,
      requiredNodeCount: config.loadNodeRequiredCount,
      timeoutMs: config.splitDistributionTimeoutMs,
      queryNodes: nodes,
    },
  );
  try {
    const loadRun = cluster.startLoad({
      nodes: loadNodePlan.initialNodes,
      nodeResolver: loadNodePlan.nodeResolver,
      opsPerSec: resolvePartitioningBenchmarkLoadOpsPerSec(
        config.splitLoadOpsPerSec,
        loadNodePlan.initialNodes.length,
        nodes.length,
      ),
      duration: config.splitLoadDuration,
      operations: [LOAD_OPERATION_INSERT],
      tableName,
      workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
      trackAcknowledgedWrites: true,
      eventIdPrefix: SPLIT_PHASE_EVENT_ID_PREFIX,
      adaptiveDispatchGuardrail:
        createPartitioningAdaptiveDispatchGuardrail(),
    });
    let distribution = null;
    try {
      distribution = await waitForPartitionGrowthAndSpread(seedNode, {
        tableName,
        timeoutMs: config.splitDistributionTimeoutMs,
        pollIntervalMs: config.distributionPollIntervalMs,
        minAdditionalPartitions: config.minAdditionalPartitions,
        minDistinctReplicaNodes: config.minDistinctReplicaNodes,
        queryNodes: nodes,
        plannerDiagnosticsResolver: loadNodePlan.getDiagnostics,
      });
    } finally {
      if (typeof loadRun.cancel === 'function') {
        loadRun.cancel();
      }
    }
    const metrics = await loadRun.waitComplete();
    const acknowledgedWrites =
      typeof loadRun.getAcknowledgedWrites === 'function' ?
        loadRun.getAcknowledgedWrites() :
        null;
    return {
      tablePreparation,
      loadNodePlan,
      distribution,
      metrics,
      acknowledgedWrites,
    };
  } catch (error) {
    if (typeof loadNodePlan.stop === 'function') {
      await loadNodePlan.stop();
    }
    throw error;
  }
}

/**
 * Run the merge phase: flip policies to merge-friendly under a light
 * ledgered write load plus the sibling read probe, and wait for the
 * variant's lifecycle terminal.
 * @param {Object} context
 * @return {Promise<Object>}
 */
async function runMergePhase(context) {
  const {
    cluster,
    nodes,
    seedNode,
    config,
    tableName,
    tableId,
    loadNodePlan,
    probeKeys,
    plan,
  } = context;
  const sinceEpochSeconds = Math.floor(Date.now() / MILLIS_PER_SECOND) -
    LOG_SCAN_OVERLAP_SECONDS;
  const loadRun = cluster.startLoad({
    nodes: loadNodePlan.initialNodes,
    nodeResolver: loadNodePlan.nodeResolver,
    opsPerSec: config.mergeLoadOpsPerSec,
    duration: config.mergeLoadDuration,
    operations: [LOAD_OPERATION_INSERT],
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    trackAcknowledgedWrites: true,
    eventIdPrefix: MERGE_PHASE_EVENT_ID_PREFIX,
    adaptiveDispatchGuardrail: createPartitioningAdaptiveDispatchGuardrail(),
  });
  const probe = startRoutabilityProbe({
    nodes,
    tableName,
    keys: probeKeys,
    intervalMs: config.probeIntervalMs,
    queryTimeoutMs: config.probeQueryTimeoutMs,
  });
  let lifecycle = null;
  let faultRecord = null;
  let probeSamples = [];
  try {
    await prepareBenchmarkPartitioningTable(seedNode, {
      tableName,
      queryNodes: nodes,
      tablePolicies: config.mergePhaseTablePolicies,
    });
    const completionPlan = buildLifecycleCompletionPlan(config, plan);
    const faultPromise = plan.kill ?
      runVariantFaultInjection({
        cluster,
        nodes,
        seedNode,
        tableId,
        tableName,
        queryNodes: nodes,
        config,
        plan,
        sinceEpochSeconds,
        collectMergeLifecycleEvents,
        queryPartitionRangeRows,
        queryTableTransitionObservation,
      }) :
      Promise.resolve(null);
    lifecycle = await waitForMergeLifecycleCondition({
      nodes,
      seedNode,
      tableId,
      queryNodes: nodes,
      sinceEpochSeconds,
      predicate: completionPlan.predicate,
      timeoutMs: completionPlan.timeoutMs,
      pollIntervalMs: config.mergeLogScanPollIntervalMs,
      description: completionPlan.description,
    });
    faultRecord = await faultPromise;
  } finally {
    probeSamples = await probe.stop();
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
  }
  const metrics = await loadRun.waitComplete();
  const acknowledgedWrites =
    typeof loadRun.getAcknowledgedWrites === 'function' ?
      loadRun.getAcknowledgedWrites() :
      null;
  return {
    lifecycle,
    faultRecord,
    probeSamples,
    metrics,
    acknowledgedWrites,
    sinceEpochSeconds,
  };
}

/**
 * Assert the sibling routability observable: zero client-visible probe
 * failures on non-participating partition ranges during merge windows.
 * @param {Object} classification
 */
function assertSiblingRoutability(classification) {
  assert.equal(
    classification.siblingFailures.length,
    ZERO,
    'Client-visible routing failures on sibling (non-participating) ' +
    'partition ranges during merge windows: ' +
    JSON.stringify(
      classification.siblingFailures.slice(ZERO, MAX_REPORTED_FAILURES),
    ),
  );
}

/**
 * Run one full table scan of the ledger id column, trying each node in
 * order until a scan succeeds.
 * @param {Array<Object>} nodes
 * @param {string} tableName
 * @param {string} idColumn
 * @param {number} timeoutMs
 * @return {Promise<{nodeId: string, ids: Array<string>}>}
 */
async function scanLedgerColumn(nodes, tableName, idColumn, timeoutMs) {
  const sql = SQL_SELECT_PROBE_PREFIX + tableName;
  let lastError = null;
  for (const node of nodes) {
    try {
      const result = await node.queryWithTimeout(sql, [], {timeoutMs});
      const ids = rowsFromResult(result)
        .map((row) => row?.[idColumn])
        .filter((id) => typeof id === 'string' && id.length > ZERO);
      return {nodeId: node.id, ids};
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    'Post-merge full scan failed on every node: ' +
    String(lastError?.message || lastError),
  );
}

/**
 * Assert zero acknowledged-write loss: (a) diff the combined ledger
 * against one post-merge full table scan, and (b) require every acked
 * key visible on every reachable node.
 * @param {Object} context
 * @return {Promise<Object>}
 */
async function assertZeroAcknowledgedWriteLoss(context) {
  const {combinedAcks, nodes, config} = context;
  assert.ok(
    combinedAcks.ids.length > ZERO,
    'Expected at least one acknowledged write in the ledger',
  );
  const fullScan = await scanLedgerColumn(
    nodes,
    combinedAcks.tableName,
    combinedAcks.idColumn,
    config.ackVisibilityTimeoutMs,
  );
  const ledgerDiff = diffAcknowledgedLedgerAgainstScan(
    combinedAcks.ids,
    fullScan.ids,
  );
  assert.equal(
    ledgerDiff.missingCount,
    ZERO,
    'Acknowledged writes missing from the post-merge full scan (node ' +
    fullScan.nodeId + '): ' + JSON.stringify(ledgerDiff.missingSample),
  );
  const visibility = await assertAcknowledgedWritesVisibleOnReachableNodes(
    combinedAcks,
    nodes,
    {
      visibilityTimeoutMs: config.ackVisibilityTimeoutMs,
      visibilityPollIntervalMs: config.ackVisibilityPollIntervalMs,
    },
  );
  return {
    ...visibility,
    fullScanNodeId: fullScan.nodeId,
    fullScanRowCount: fullScan.ids.length,
    ledgerDiff,
  };
}

/**
 * Trim lifecycle events for the scenario result payload.
 * @param {Array<Object>} events
 * @return {Array<Object>}
 */
function trimEventsForReport(events) {
  return (events || []).slice(ZERO, MAX_REPORTED_EVENTS);
}

/**
 * Resolve scenario config, variant plan, node handles, and table name.
 * @param {Object} cluster
 * @param {Object} options
 * @return {Object}
 */
function resolveScenarioContext(cluster, options) {
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    SCENARIO_OPTIONS_KEY,
  );
  const config = resolvePartitionMergeUnderLoadScenarioConfig(
    scenarioOptions,
  );
  const plan = VARIANT_PLAN[config.variant];
  const nodes = cluster.getNodes();
  assert.equal(
    nodes.length,
    config.expectedNodeCount,
    'Scenario requires exactly ' + config.expectedNodeCount +
    ' nodes, got ' + nodes.length,
  );
  const seedNode = getSeedNode(nodes);
  assert.ok(seedNode, 'Seed node should be available');
  const tableName = resolvePartitioningLoadTableName(
    cluster,
    config.tableName,
    {explicitTableName: true},
  );
  return {config, plan, nodes, seedNode, tableName};
}

/**
 * Wait for baseline convergence plus best-effort control-plane
 * quiescence before starting load.
 * @param {Object} cluster
 * @param {Object} config
 * @return {Promise<Object>} convergence timing
 */
async function waitForClusterReady(cluster, config) {
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: config.convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  if (typeof cluster.waitForControlPlaneQuiescence === 'function') {
    try {
      await cluster.waitForControlPlaneQuiescence({
        timeoutMs: config.controlPlaneQuiescenceTimeoutMs,
        noProgressTimeoutMs:
          config.controlPlaneQuiescenceNoProgressTimeoutMs,
      });
    } catch (_error) {
      // Quiescence is a best-effort pre-load stabilizer here; the
      // binding observables below fail loudly on real problems.
    }
  }
  return convergence;
}

/**
 * Capture the pre-merge partition topology, polling until the split
 * phase's current partition count reaches the configured floor (the
 * growth helper counts cumulative new ids, so the authoritative rows
 * can briefly trail it).
 * @param {Object} context
 * @return {Promise<{rangeIndex: Array<Object>,
 *   partitionIds: Array<string>}>}
 */
async function capturePreMergeTopology(context) {
  const {seedNode, tableId, nodes, config} = context;
  const deadlineMs = Date.now() + config.preMergeTopologyTimeoutMs;
  let rangeIndex = [];
  let partitionIds = [];
  for (;;) {
    const rangeRows = await queryPartitionRangeRows(
      seedNode,
      tableId,
      nodes,
    );
    rangeIndex = buildPartitionRangeIndex(rangeRows);
    partitionIds = rangeIndex.map((entry) => entry.partitionId);
    if (partitionIds.length >= config.preMergePartitionCount) {
      return {rangeIndex, partitionIds};
    }
    if (Date.now() >= deadlineMs) {
      break;
    }
    await sleep(config.distributionPollIntervalMs);
  }
  throw new Error(
    'Expected at least ' + config.preMergePartitionCount +
    ' partitions before the merge phase within ' +
    config.preMergeTopologyTimeoutMs + 'ms, got ' + partitionIds.length,
  );
}

/**
 * Select the probe keys from the split-phase acknowledged writes.
 * @param {Object} splitPhase
 * @param {Object} config
 * @return {Array<string>}
 */
function resolveProbeKeys(splitPhase, config) {
  const probeKeys = selectEvenlySpacedProbeKeys(
    ledgerIdsOf(splitPhase.acknowledgedWrites),
    config.probeKeyCount,
  );
  assert.ok(
    probeKeys.length > ZERO,
    'Expected acknowledged split-phase writes to probe against',
  );
  return probeKeys;
}

/**
 * Re-converge the cluster after a variant fault killed a node.
 * @param {Object} cluster
 * @param {Object} config
 * @param {Object|null} faultRecord
 * @return {Promise<void>}
 */
async function reconvergeAfterVariantFault(cluster, config, faultRecord) {
  if (!faultRecord?.killedNodeId) {
    return;
  }
  await cluster.waitForConvergence({
    settleTimeoutMs: config.convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
}

/**
 * Union the pre-merge partition ids with every id observed as a merge
 * participant, so intermediate targets (created by merge 1, retired as
 * a source of merge 2) are covered by the dissolution assertions.
 * @param {Array<string>} preMergePartitionIds
 * @param {Array<Object>} transitionObservations
 * @return {Array<string>}
 */
function collectObservedParticipantIds(
  preMergePartitionIds,
  transitionObservations,
) {
  const observedIds = new Set(preMergePartitionIds);
  for (const observation of transitionObservations) {
    for (const id of observation.sourcePartitionIds) {
      observedIds.add(id);
    }
    for (const id of observation.targetPartitionIds) {
      observedIds.add(id);
    }
  }
  return [...observedIds];
}

/**
 * Assert the happy-path merge outcome bindings: enough completed
 * merges, a shrinking partition count, and enough retired sources.
 * @param {Object} context
 */
function assertHappyPathMergeOutcome(context) {
  const {summary, preCount, postCount, retiredCount, config} = context;
  assert.ok(
    summary.completedMergeCount >= config.requiredCompletedMerges,
    'Expected at least ' + config.requiredCompletedMerges +
    ' completed merges, observed ' + summary.completedMergeCount,
  );
  assert.ok(
    postCount < preCount,
    'Partition count did not shrink across the merge phase: pre=' +
    preCount + ' post=' + postCount,
  );
  assert.ok(
    retiredCount >= config.requiredCompletedMerges,
    'Expected at least ' + config.requiredCompletedMerges +
    ' retired source partitions, observed ' + retiredCount,
  );
}

/**
 * Resolve and assert the post-merge topology outcome.
 * @param {Object} context
 * @return {Promise<Object>}
 */
async function resolveMergeOutcome(context) {
  const {seedNode, tableId, nodes, config, plan, preMerge, mergePhase} =
    context;
  const postMergeRangeRows = await queryPartitionRangeRows(
    seedNode,
    tableId,
    nodes,
  );
  const postMergePartitionIds = buildPartitionRangeIndex(
    postMergeRangeRows,
  ).map((entry) => entry.partitionId);
  const {retiredIds, addedIds} = resolveRetiredAndAddedPartitionIds(
    collectObservedParticipantIds(
      preMerge.partitionIds,
      mergePhase.lifecycle.transitionObservations,
    ),
    postMergePartitionIds,
  );
  const summary = mergePhase.lifecycle.summary;
  if (!plan.kill) {
    assertHappyPathMergeOutcome({
      summary,
      preCount: preMerge.partitionIds.length,
      postCount: postMergePartitionIds.length,
      retiredCount: retiredIds.length,
      config,
    });
  }
  assert.ok(
    retiredIds.length > ZERO,
    'Expected at least one retired source partition after merging',
  );
  return {postMergePartitionIds, retiredIds, addedIds, summary};
}

/**
 * Classify the probe samples against merge windows and (for the happy
 * path) assert sibling routability.
 * @param {Object} context
 * @return {Object}
 */
function analyzeProbeOutcome(context) {
  const {plan, preMerge, mergePhase, mergeOutcome} = context;
  const mergeWindows = buildMergeWindows(mergePhase.lifecycle.events);
  const participantsByWindow = resolveParticipantsByWindow(
    mergeWindows,
    mergePhase.lifecycle.transitionObservations,
    [...mergeOutcome.retiredIds, ...mergeOutcome.addedIds],
  );
  const classification = classifyProbeSamples({
    samples: mergePhase.probeSamples,
    rangeIndex: preMerge.rangeIndex,
    mergeWindows,
    participantsByWindow,
  });
  if (!plan.kill) {
    assertSiblingRoutability(classification);
  }
  return {mergeWindows, participantsByWindow, classification};
}

/**
 * Assemble the scenario result payload.
 * @param {Object} parts
 * @return {Object}
 */
function buildScenarioResult(parts) {
  const {
    config,
    tableName,
    tableId,
    convergence,
    splitPhase,
    splitSuccessRate,
    mergePhase,
    mergeSuccessRate,
    preMerge,
    mergeOutcome,
    probeKeys,
    probeOutcome,
    acknowledgedWriteVisibility,
    teardownEvidence,
  } = parts;
  const classification = probeOutcome.classification;
  return {
    variant: config.variant,
    tableName,
    tableId,
    convergenceTiming: convergence,
    splitPhase: {
      distribution: splitPhase.distribution,
      loadMetrics: splitPhase.metrics,
      successRate: splitSuccessRate,
      acknowledgedWriteCount:
        ledgerIdsOf(splitPhase.acknowledgedWrites).length,
      tablePolicies: config.splitPhaseTablePolicies,
    },
    mergePhase: {
      loadMetrics: mergePhase.metrics,
      successRate: mergeSuccessRate,
      acknowledgedWriteCount:
        ledgerIdsOf(mergePhase.acknowledgedWrites).length,
      tablePolicies: config.mergePhaseTablePolicies,
      lifecycleCounts: mergeOutcome.summary.countsByKey,
      completedMergeCount: mergeOutcome.summary.completedMergeCount,
      abortedMergeCount: mergeOutcome.summary.abortedMergeCount,
      events: trimEventsForReport(mergePhase.lifecycle.events),
      mergeWindows: probeOutcome.mergeWindows,
      participantsByWindow: probeOutcome.participantsByWindow,
      faultRecord: mergePhase.faultRecord,
    },
    topology: {
      preMergePartitionIds: preMerge.partitionIds,
      postMergePartitionIds: mergeOutcome.postMergePartitionIds,
      retiredIds: mergeOutcome.retiredIds,
      addedIds: mergeOutcome.addedIds,
    },
    probe: {
      keyCount: probeKeys.length,
      sampleCount: classification.sampleCount,
      successCount: classification.successCount,
      failureCount: classification.failureCount,
      siblingFailures: classification.siblingFailures,
      participantFailures: classification.participantFailures.slice(
        ZERO,
        MAX_REPORTED_FAILURES,
      ),
      outsideWindowFailures: classification.outsideWindowFailures.slice(
        ZERO,
        MAX_REPORTED_FAILURES,
      ),
      unmappedFailureCount: classification.unmappedFailures.length,
    },
    acknowledgedWriteVisibility,
    teardownEvidence,
  };
}

/**
 * Run the partition-merge-under-load scenario.
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {config, plan, nodes, seedNode, tableName} =
    resolveScenarioContext(cluster, options);
  const convergence = await waitForClusterReady(cluster, config);

  const splitPhase = await runSplitPhase({
    cluster,
    nodes,
    seedNode,
    config,
    tableName,
  });
  const splitSuccessRate = assertLoadSuccessRate(
    splitPhase.metrics,
    config.minSuccessRate,
    'split-phase',
  );
  const tableId = splitPhase.tablePreparation.tableId;
  const preMerge = await capturePreMergeTopology({
    seedNode,
    tableId,
    nodes,
    config,
  });
  const probeKeys = resolveProbeKeys(splitPhase, config);

  let mergePhase;
  try {
    mergePhase = await runMergePhase({
      cluster,
      nodes,
      seedNode,
      config,
      tableName,
      tableId,
      loadNodePlan: splitPhase.loadNodePlan,
      probeKeys,
      plan,
    });
  } finally {
    if (typeof splitPhase.loadNodePlan.stop === 'function') {
      await splitPhase.loadNodePlan.stop();
    }
  }
  const mergeSuccessRate = assertLoadSuccessRate(
    mergePhase.metrics,
    config.minSuccessRate,
    'merge-phase',
  );
  await reconvergeAfterVariantFault(cluster, config, mergePhase.faultRecord);

  const mergeOutcome = await resolveMergeOutcome({
    seedNode,
    tableId,
    nodes,
    config,
    plan,
    preMerge,
    mergePhase,
  });
  const probeOutcome = analyzeProbeOutcome({
    plan,
    preMerge,
    mergePhase,
    mergeOutcome,
  });
  const acknowledgedWriteVisibility =
    await assertZeroAcknowledgedWriteLoss({
      combinedAcks: combineAcknowledgedWrites(
        splitPhase.acknowledgedWrites,
        mergePhase.acknowledgedWrites,
      ),
      nodes,
      config,
    });
  const teardownEvidence = await waitForRetiredPartitionTeardown({
    nodes,
    seedNode,
    tableId,
    queryNodes: nodes,
    retiredIds: mergeOutcome.retiredIds,
    timeoutMs: config.dissolutionSettleTimeoutMs,
    pollIntervalMs: config.dissolutionPollIntervalMs,
  });
  await cluster.waitForConsistencyConvergence({
    timeoutMs: config.finalConsistencyTimeoutMs,
  });

  return buildScenarioResult({
    config,
    tableName,
    tableId,
    convergence,
    splitPhase,
    splitSuccessRate,
    mergePhase,
    mergeSuccessRate,
    preMerge,
    mergeOutcome,
    probeKeys,
    probeOutcome,
    acknowledgedWriteVisibility,
    teardownEvidence,
  });
}

export {run};
