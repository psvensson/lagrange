/**
 * Scenario: public-path-multinode-baseline
 *
 * Deploys the code-first account-summary WASI service through the
 * generated lifecycle records (the service pipeline owner), on a live
 * multi-node cluster whose account_activity partitions must span at
 * least two hosts, invokes it over authenticated HTTP, proves result
 * parity against an independent oracle, proves per-host local shard
 * reads from the nodes' own metrics logs plus durable reduce
 * coordination rows, records container resource telemetry, and emits
 * the stable schemaVersion-1 report detail.
 *
 * Red-on-revert: the scenario fails if the WASM path is replaced by
 * native_js, if all partition leaders land on one host, if the local
 * metrics evidence is missing, or if any response diverges from the
 * recomputed oracle.
 */

import assert from 'node:assert/strict';
import {
  createInvocationIdentity,
} from '../../../src/service/request-cell-routing-contract.js';
import {
  PORTS,
  REQUEST_CELL_AUTH,
} from '../harness/constants.js';
import {
  createServicePipeline,
  deployThroughPipeline,
  prepareServiceProject,
  readDeploymentManifest,
} from './service-pipeline-deployment-helpers.js';
import {
  discoverPublicEndpoints,
  openPgPublicClient,
  provisionPublicListener,
} from './public-seam-durability-client.js';
import {
  buildUserActivityTableSql,
  createTableTopologyHelpers,
} from './user-table-topology-helpers.js';
import {PARTITION_ROLE} from '../harness/scenario-ground-truth.js';
import {SPREAD_UNIT} from '../harness/scenario-host-topology.js';
import {createScenarioStepRunner} from '../harness/scenario-step-log.js';
import {
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
  generateDatasetRows,
  summarizeInvokerTelemetry,
} from './public-path-baseline-helpers.js';

const SCENARIO_NAME = 'public-path-multinode-baseline';
const TABLE_NAME = 'account_activity';
const SCENARIO_SUBDIR = 'public-path-baseline';
const UTF8_ENCODING = 'utf8';
const ZERO = 0;
const ONE = 1;
const MIN_PARTITION_COUNT = 2;
const MIN_DISTINCT_LEADER_HOSTS = 2;
const SPLIT_SPREAD_GATE = 'split-leader-host-spread';
// What the scenario claims to prove (module docstring, quest statement and
// the formation handoff criteria "RF=3 committed membership, leaders
// present, placement across multiple hosts"): one COMPLETED managed split
// (the parent dissolved, both children carrying the measured data), each
// child holding its policy replica count of active voters across more
// than one host, a leader for each child, and the child leaders on at
// least two distinct hosts. The spread unit is HOST (distinct machines).
const SPLIT_SPREAD_CLAIM = Object.freeze({
  minChildren: MIN_PARTITION_COUNT,
  minDistinctLeaders: MIN_DISTINCT_LEADER_HOSTS,
  minReplicaSpreadPerChild: MIN_DISTINCT_LEADER_HOSTS,
  requireChildLeader: true,
  requireParentDissolved: true,
  requirePolicyReplicaCount: true,
  spreadUnit: SPREAD_UNIT.HOST,
});

/**
 * The topology this scenario's claim needs, declared so the runner can
 * refuse it BEFORE starting anything on a config that cannot carry it
 * (refused_insufficient_host_topology): leaders on distinct HOSTS need at
 * least two declared machines. Physical host spread is proven on the lab
 * and GCP configs; single-host local configs are refused, never passed.
 */
export const SCENARIO_TOPOLOGY_REQUIREMENT = Object.freeze({
  minDistinctHosts: MIN_DISTINCT_LEADER_HOSTS,
  spreadUnit: SPREAD_UNIT.HOST,
});
const DEFAULT_INVOCATION_COUNT = 60;
const TOPOLOGY_STABLE_READBACKS = 2;
const SPLIT_WAIT_TIMEOUT_MS = 180_000;
const SPLIT_WAIT_POLL_MS = 500;
const MAX_SENTINEL_ROWS = 40;
const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 500;
const HTTP_STATUS_OK = 200;
const SUMMARY_PATH = '/accounts/summary';
const HEALTH_PATH = '/accounts/health';
const JSON_CONTENT_TYPE = 'application/json';
const IDEMPOTENCY_HEADER = 'idempotency-key';
const CHILD_CALL_SUFFIX = '#call-1';
const BINDING_NAME_PREFIX = 'account-summary--';

const SQL = Object.freeze({
  ...buildUserActivityTableSql(TABLE_NAME),
  SELECT_SERVICE_BINDINGS:
    'SELECT binding_version_id, binding_name FROM service_bindings',
  SELECT_SERVICE_DEFINITIONS:
    'SELECT service_id, runtime_kind, binding_version_id ' +
    'FROM service_definitions',
  SELECT_REDUCE_SLOTS:
    'SELECT invocation_id, slot_id, replica_id, partial_json ' +
    'FROM call_cell_reduce_slots',
  SELECT_REDUCE_RESULTS:
    'SELECT result_id FROM call_cell_reduce_results',
});

const helpers = createTableTopologyHelpers({
  scenarioName: SCENARIO_NAME,
  sql: SQL,
  tableName: TABLE_NAME,
});

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultResourceSnapshot(cluster) {
  return async (node, nodeIndex) => {
    const providerIndex =
      Number.isInteger(cluster._hostAssignment?.[nodeIndex]) ?
        cluster._hostAssignment[nodeIndex] :
        ZERO;
    const provider = cluster._providers?.[providerIndex] ||
      cluster._providers?.[ZERO];
    assert.ok(provider, `${SCENARIO_NAME}: no docker provider available`);
    return provider.getContainerResourceSnapshot(node.containerId);
  };
}

function resolveClock(overrides) {
  return typeof overrides.now === 'function' ? overrides.now : Date.now;
}

function resolveScenarioDependencies(cluster) {
  const overrides =
    cluster?._scenarioOverrides?.publicPathBaseline || {};
  const noopOutput = async () => {};
  return {
    discoverEndpoints: overrides.discoverEndpoints || discoverPublicEndpoints,
    fetchImpl: overrides.fetchImpl || fetch,
    listenerTimeoutMs: overrides.listenerTimeoutMs,
    invocationCount: Number.isInteger(overrides.invocationCount) ?
      overrides.invocationCount :
      DEFAULT_INVOCATION_COUNT,
    logBuffer: overrides.logBuffer ||
      (() => cluster.getLogCollector().getBuffer()),
    openPublicClient: overrides.openPublicClient || openPgPublicClient,
    pipeline: overrides.pipeline || createServicePipeline(),
    prepareProject: overrides.prepareProject ||
      (() => prepareServiceProject(SCENARIO_SUBDIR)),
    provisionListener: overrides.provisionListener || provisionPublicListener,
    readManifest: overrides.readManifest || readDeploymentManifest,
    resourceSnapshot: overrides.resourceSnapshot ||
      defaultResourceSnapshot(cluster),
    now: resolveClock(overrides),
    runId: typeof overrides.runId === 'string' ?
      overrides.runId :
      `${SCENARIO_NAME}-${Date.now()}`,
    sleep: overrides.sleep || defaultSleep,
    splitWaitTimeoutMs: Number.isInteger(overrides.splitWaitTimeoutMs) ?
      overrides.splitWaitTimeoutMs :
      SPLIT_WAIT_TIMEOUT_MS,
    writeOutput: noopOutput,
  };
}

function countNonParentPartitions(evaluation) {
  return evaluation.partitions
    .filter((entry) => entry.role !== PARTITION_ROLE.PARENT).length;
}

async function insertSentinelRow(seedNode, sentinelIndex) {
  const sentinel = buildSentinelRow(sentinelIndex);
  await seedNode.query(SQL.INSERT_ROW, [
    sentinel.id, sentinel.accountId, sentinel.amountCents,
    sentinel.flagged, sentinel.pad,
  ]);
}

// The split/leader-spread gate (helpers.waitForSplitClaim): the full
// SPLIT_SPREAD_CLAIM must hold on TOPOLOGY_STABLE_READBACKS consecutive
// ground-truth readbacks, so a mid-split shape (the parent still counted)
// can never pass. While the table is still single-partition a bounded
// trickle of sentinel rows keeps write-activity split evaluation firing.
async function waitForSplitAndLeaderSpread(cluster, nodes, seedNode, deps) {
  let sentinelCount = ZERO;
  const proven = await helpers.waitForSplitClaim(cluster, nodes, {
    budgetMs: deps.splitWaitTimeoutMs,
    claim: SPLIT_SPREAD_CLAIM,
    name: SPLIT_SPREAD_GATE,
    now: deps.now,
    onReadback: async (evaluation) => {
      if (countNonParentPartitions(evaluation) < MIN_PARTITION_COUNT &&
          sentinelCount < MAX_SENTINEL_ROWS) {
        await insertSentinelRow(seedNode, sentinelCount);
        sentinelCount += ONE;
      }
    },
    pollMs: SPLIT_WAIT_POLL_MS,
    sleep: deps.sleep,
    stableReadbacks: TOPOLOGY_STABLE_READBACKS,
  });
  return {...proven, sentinelCount};
}

function basicAuthorizationHeader() {
  const credentials =
    `${REQUEST_CELL_AUTH.USER}:${REQUEST_CELL_AUTH.PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

function nodeBaseUrl(node) {
  return `http://${node.ip}:${PORTS.REST}`;
}

async function probeHealth(node, deps, headers) {
  try {
    const response = await deps.fetchImpl(
      `${nodeBaseUrl(node)}${HEALTH_PATH}`, {headers, method: 'GET'});
    return response.status === HTTP_STATUS_OK;
  } catch (_error) {
    return false;
  }
}

// Wait until at least one node serves the deployed health route, and
// prove the listener is fail-closed: the same route without credentials
// must not answer 200.
async function waitForServingNodes(nodes, deps) {
  const headers = {authorization: basicAuthorizationHeader()};
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const serving = [];
    for (const node of nodes) {
      if (await probeHealth(node, deps, headers)) {
        serving.push(node);
      }
    }
    if (serving.length > ZERO) {
      const unauthenticated = await probeHealth(serving[ZERO], deps, {});
      if (unauthenticated) {
        throw new Error(
          `${SCENARIO_NAME}: unauthenticated HTTP invocation was ` +
          'accepted; authenticated-only invocation is required',
        );
      }
      return serving;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${SCENARIO_NAME}: no node served ${HEALTH_PATH} within ` +
        `${READY_TIMEOUT_MS}ms`,
      );
    }
    await deps.sleep(READY_POLL_MS);
  }
}

async function invokeSummary(node, deps, accountId, idempotencyKey) {
  const startedAt = process.hrtime.bigint();
  const response = await deps.fetchImpl(
    `${nodeBaseUrl(node)}${SUMMARY_PATH}`,
    {
      body: JSON.stringify({accountId}),
      headers: {
        'authorization': basicAuthorizationHeader(),
        'content-type': JSON_CONTENT_TYPE,
        [IDEMPOTENCY_HEADER]: idempotencyKey,
      },
      method: 'POST',
    },
  );
  const text = await response.text();
  const durationMs =
    Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  assert.equal(
    response.status, HTTP_STATUS_OK,
    `${SCENARIO_NAME}: POST ${SUMMARY_PATH} for account ${accountId} ` +
    `returned ${response.status}: ${text}`,
  );
  return {
    accountId,
    body: JSON.parse(text),
    bytes: Buffer.byteLength(text, UTF8_ENCODING),
    durationMs,
    idempotencyKey,
  };
}

async function runMeasuredInvocations(servingNodes, deps) {
  const accountIds = DATASET_GENERATOR.accountIds;
  const invocations = [];
  for (let index = ZERO; index < deps.invocationCount; index += ONE) {
    const node = servingNodes[index % servingNodes.length];
    const accountId = accountIds[index % accountIds.length];
    const idempotencyKey = `${deps.runId}-inv-${index}`;
    invocations.push(
      await invokeSummary(node, deps, accountId, idempotencyKey));
  }
  return invocations;
}

function childInvocationId(idempotencyKey) {
  return createInvocationIdentity(
    REQUEST_CELL_AUTH.DATABASE, idempotencyKey) + CHILD_CALL_SUFFIX;
}

// Durable coordination evidence: exactly one published reduce result
// per measured invocation and one reduce slot per shard; the slots'
// partial_json byte lengths are the measured partial bytes.
async function collectCoordinationEvidence(
  nodes, invocations, partitionCount) {
  const slotRows =
    await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_REDUCE_SLOTS);
  const resultRows =
    await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_REDUCE_RESULTS);
  let partialBytes = ZERO;
  for (const invocation of invocations) {
    const childId = childInvocationId(invocation.idempotencyKey);
    const results = resultRows
      .filter((row) => row?.result_id === childId);
    assert.equal(
      results.length, ONE,
      `${SCENARIO_NAME}: expected exactly one reduce result for ` +
      `${childId}, saw ${results.length}`,
    );
    const slots = slotRows
      .filter((row) => row?.invocation_id === childId);
    assert.equal(
      slots.length, partitionCount,
      `${SCENARIO_NAME}: expected ${partitionCount} reduce slot(s) ` +
      `for ${childId}, saw ${slots.length}`,
    );
    const replicaIds = new Set(slots.map((row) => row?.replica_id));
    assert.equal(
      replicaIds.size, partitionCount,
      `${SCENARIO_NAME}: reduce slots for ${childId} name ` +
      `${replicaIds.size} distinct replica(s), expected ` +
      String(partitionCount),
    );
    for (const slot of slots) {
      partialBytes += Buffer.byteLength(
        String(slot?.partial_json || ''), UTF8_ENCODING);
    }
  }
  return {partialBytes};
}

async function collectRuntimeKindRows(nodes) {
  const bindingRows =
    await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_SERVICE_BINDINGS);
  const bindingVersionIds = new Set(
    bindingRows
      .filter((row) =>
        String(row?.binding_name || '').startsWith(BINDING_NAME_PREFIX))
      .map((row) => row.binding_version_id),
  );
  const definitionRows =
    await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_SERVICE_DEFINITIONS);
  const matched = definitionRows.filter((row) =>
    bindingVersionIds.has(row?.binding_version_id));
  assert.ok(
    matched.length > ZERO,
    `${SCENARIO_NAME}: no service_definitions rows for ` +
    `${BINDING_NAME_PREFIX}* bindings — fidelity check would be vacuous`,
  );
  return matched;
}

async function captureResourceSnapshots(nodes, deps) {
  const snapshots = new Map();
  for (let index = ZERO; index < nodes.length; index += ONE) {
    snapshots.set(
      nodes[index].id,
      await deps.resourceSnapshot(nodes[index], index));
  }
  return snapshots;
}

async function buildService(deps) {
  const paths = await deps.prepareProject();
  await deps.pipeline.runGenerate({
    projectDirectory: paths.projectDirectory,
    writeOutput: deps.writeOutput,
  });
  const buildResult = await deps.pipeline.runBuild({
    projectDirectory: paths.projectDirectory,
    writeOutput: deps.writeOutput,
  });
  const manifest = await deps.readManifest(paths.projectDirectory);
  return {buildResult, manifest, paths};
}

// The split children the gate proved, in the frozen report shape; the
// distinct-host count is the gate's host-authority count, not node ids.
function childTopologyFromGate(spread) {
  const children = spread.record.partitions
    .filter((entry) => entry.role === PARTITION_ROLE.CHILD)
    .map((entry) => ({
      leader_node_id: entry.leader.nodeId,
      partition_id: entry.partitionId,
    }));
  return assertPartitionSpread(children, spread.hostIndex.hostOf);
}

async function prepareDataSubstrate(nodes, seedNode, deps, step) {
  const rows = generateDatasetRows();
  await step('create-table', () => helpers.retryTransientAdminQuery(
    deps, 'create-table', () => seedNode.query(SQL.CREATE_TABLE)));
  const tableId = await step('resolve-table-id', () =>
    helpers.retryTransientAdminQuery(deps, 'resolve-table-id',
      () => helpers.resolveTableId(seedNode)));
  await step('apply-split-policies', () =>
    helpers.applySplitPolicies(seedNode, tableId, deps));
  await step('wait-table-write-readiness', () =>
    helpers.waitForTableWriteReadiness(nodes, deps));
  await step('seed-dataset', () =>
    helpers.seedDataset(seedNode, rows, deps));
  return rows;
}

async function deployAndMeasure(nodes, seedNode, deps, built, step) {
  await step('deploy-through-pipeline', () => deployThroughPipeline({
    adminNode: seedNode,
    nodes,
    options: {
      discoverEndpoints: deps.discoverEndpoints,
      openClient: deps.openPublicClient,
      sleep: deps.sleep,
      timeoutMs: deps.listenerTimeoutMs,
    },
  }, deps, built.paths, built.buildResult.layoutPath));
  const servingNodes = await step('wait-serving-nodes', () =>
    waitForServingNodes(nodes, deps));
  return step('measured-invocations', async () => {
    const snapshotsBefore = await captureResourceSnapshots(nodes, deps);
    const invocations = await runMeasuredInvocations(servingNodes, deps);
    const snapshotsAfter = await captureResourceSnapshots(nodes, deps);
    return {invocations, snapshotsAfter, snapshotsBefore};
  });
}

// Gates after measurement: the topology still exactly the proven
// children (every partitions row of the table counted, so a parent or a
// new split appearing is a change), parity, fidelity, local reads,
// coordination evidence.
async function assertMeasuredEvidence(nodes, deps, context) {
  const {built, measured, rows, topology} = context;
  const finalPartitionRows =
    await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_PARTITIONS);
  assert.equal(
    finalPartitionRows.length, topology.partitions.length,
    `${SCENARIO_NAME}: partition count changed during measurement`,
  );
  const partitionCount = topology.partitions.length;
  const parity = assertParity({
    partitionCount,
    responses: measured.invocations,
    rows,
  });
  const fidelity = assertWasmFidelity({
    buildDigest: built.buildResult.descriptor.digest,
    manifest: built.manifest,
    runtimeKindRows: await collectRuntimeKindRows(nodes),
  });
  const logEntries = deps.logBuffer();
  const localReadProof = buildLocalReadProof({
    invocationCount: measured.invocations.length,
    logEntries,
    partitionIds: topology.partitions.map((entry) => entry.partitionId),
  });
  const coordination = await collectCoordinationEvidence(
    nodes, measured.invocations, partitionCount);
  return {coordination, fidelity, localReadProof, logEntries, parity};
}

export async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(
    Array.isArray(nodes) && nodes.length >= MIN_DISTINCT_LEADER_HOSTS,
    `${SCENARIO_NAME} requires a multi-node cluster`,
  );
  const deps = resolveScenarioDependencies(cluster);
  const step = createScenarioStepRunner(cluster, SCENARIO_NAME, deps.now);
  const seedNode = nodes.find((node) => node.role === 'seed') ||
    nodes[ZERO];

  // Service-lifecycle SQL is admitted only over authenticated PG-wire.
  // Request the sys-postgres-wire listener first, so its placement rides
  // out the formation tail during the build and data phases.
  await step('provision-lifecycle-listener', () =>
    helpers.retryTransientAdminQuery(deps, 'provision-lifecycle-listener',
      () => deps.provisionListener(seedNode, nodes.length)));

  // Build the service through the pipeline owner (generate + build).
  const built = await step('build-service', () => buildService(deps));

  // Data substrate: table, split policies, deterministic dataset.
  // Setup writes retry transient post-boot settling; measured phases do not.
  const rows = await prepareDataSubstrate(nodes, seedNode, deps, step);
  const spread = await step(SPLIT_SPREAD_GATE, () =>
    waitForSplitAndLeaderSpread(cluster, nodes, seedNode, deps));
  const topology = childTopologyFromGate(spread);

  // Deploy the generated records, then measure over authenticated HTTP.
  const measured =
    await deployAndMeasure(nodes, seedNode, deps, built, step);
  const evidence = await step('measured-evidence-gates', () =>
    assertMeasuredEvidence(nodes, deps, {built, measured, rows, topology}));

  const nodeIds = nodes.map((node) => node.id);
  return composeReportDetail({
    datasetDigest: computeDatasetDigest(rows),
    fidelity: evidence.fidelity,
    finalBytes: measured.invocations
      .reduce((sum, invocation) => sum + invocation.bytes, ZERO),
    generatorDigest: computeGeneratorDigest(),
    invokerTelemetry: summarizeInvokerTelemetry(evidence.logEntries),
    latencyMs: computeLatencySummary(
      measured.invocations.map((invocation) => invocation.durationMs)),
    localReadProof: evidence.localReadProof,
    networkPerNode: buildNetworkPerNode(
      nodeIds, measured.snapshotsBefore, measured.snapshotsAfter),
    nodeCount: nodes.length,
    parity: evidence.parity,
    partialBytes: evidence.coordination.partialBytes,
    resourcePerNode: buildResourcePerNode(nodeIds, measured.snapshotsAfter),
    sentinelRowCount: spread.sentinelCount,
    topology,
  });
}
