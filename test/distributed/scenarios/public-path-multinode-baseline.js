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
import {copyFile, mkdir, readFile, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {
  runBuild,
  runDeploy,
  runGenerate,
} from '../../../src/cli/service-pipeline-command.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../../src/service/service-local-oci-layout-builder.js';
import {
  createInvocationIdentity,
} from '../../../src/service/request-cell-routing-contract.js';
import {
  PORTS,
  REQUEST_CELL_AUTH,
  SCENARIO_ARTIFACTS,
} from '../harness/constants.js';
import {
  buildUserActivityTableSql,
  createTableTopologyHelpers,
  queryRows,
  selectSettledPartitionRows,
  topologyFingerprint,
} from './user-table-topology-helpers.js';
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
// The service module is copied two levels below the artifacts root so its
// relative `../../src/...` imports resolve through the src symlink placed
// at the artifacts root (see defaultPrepareProject).
const PROJECT_SUBDIR = 'project';
const SOURCE_SYMLINK_NAME = 'src';
const SERVICE_MODULE_FILE = 'lagrange.service.js';
const SERVICE_MODULE_SOURCE = path.join(
  'examples', 'call-binding-account-summary', SERVICE_MODULE_FILE);
const MANIFEST_RELATIVE_PATH = path.join(
  '.lagrange', 'deployment', 'manifest.json');
const UTF8_ENCODING = 'utf8';

const ZERO = 0;
const ONE = 1;
const MIN_PARTITION_COUNT = 2;
const MIN_DISTINCT_LEADER_HOSTS = 2;
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

async function defaultPrepareProject() {
  const artifactsRoot = path.resolve(
    process.cwd(), SCENARIO_ARTIFACTS.HOST_RELATIVE_PATH);
  const scenarioDirectory = path.join(artifactsRoot, SCENARIO_SUBDIR);
  const projectDirectory = path.join(scenarioDirectory, PROJECT_SUBDIR);
  await rm(scenarioDirectory, {force: true, recursive: true});
  await mkdir(projectDirectory, {recursive: true});
  // The service module imports ../../src/authoring/*; from
  // <root>/public-path-baseline/project/ that resolves to <root>/src,
  // the symlink to the repo source created here. The link target must be
  // RELATIVE: ComponentizeJS resolves imports inside a WASI preopen that
  // rejects absolute symlink targets as sandbox escapes (verified live).
  // Recreated every run so a checkout move can never leave a stale link.
  const sourceLink = path.join(artifactsRoot, SOURCE_SYMLINK_NAME);
  await rm(sourceLink, {force: true});
  await symlink(
    path.relative(
      artifactsRoot, path.resolve(process.cwd(), SOURCE_SYMLINK_NAME)),
    sourceLink);
  await copyFile(
    path.resolve(process.cwd(), SERVICE_MODULE_SOURCE),
    path.join(projectDirectory, SERVICE_MODULE_FILE),
  );
  return {artifactsRoot, projectDirectory};
}

async function defaultReadManifest(projectDirectory) {
  return JSON.parse(await readFile(
    path.join(projectDirectory, MANIFEST_RELATIVE_PATH), UTF8_ENCODING));
}

function resolveScenarioDependencies(cluster) {
  const overrides =
    cluster?._scenarioOverrides?.publicPathBaseline || {};
  const noopOutput = async () => {};
  return {
    fetchImpl: overrides.fetchImpl || fetch,
    invocationCount: Number.isInteger(overrides.invocationCount) ?
      overrides.invocationCount :
      DEFAULT_INVOCATION_COUNT,
    logBuffer: overrides.logBuffer ||
      (() => cluster.getLogCollector().getBuffer()),
    pipeline: overrides.pipeline || {
      runBuild: (options) => runBuild({
        ...options,
        createLocalOciLayoutBuilder:
          () => new ServiceLocalOciLayoutBuilder(),
      }),
      runDeploy,
      runGenerate,
    },
    prepareProject: overrides.prepareProject || defaultPrepareProject,
    readManifest: overrides.readManifest || defaultReadManifest,
    resourceSnapshot: overrides.resourceSnapshot ||
      defaultResourceSnapshot(cluster),
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

function partitionSpreadReached(partitionRows) {
  const leaders = new Set(
    partitionRows
      .map((row) => row?.leader_node_id)
      .filter((id) => typeof id === 'string' && id.length > ZERO),
  );
  return partitionRows.length >= MIN_PARTITION_COUNT &&
    leaders.size >= MIN_DISTINCT_LEADER_HOSTS;
}

// Wait for the policy-driven split and cross-host leader spread. While
// the table is still single-partition a bounded trickle of sentinel
// rows keeps write-activity split evaluation firing. The spread must
// hold with an identical partition/leader set across consecutive polls
// so a mid-split window is never frozen into the measured topology.
async function waitForSplitAndLeaderSpread(nodes, seedNode, deps) {
  const deadline = Date.now() + deps.splitWaitTimeoutMs;
  let sentinelCount = ZERO;
  let lastRows = [];
  let stableFingerprint = null;
  let stableCount = ZERO;
  while (Date.now() < deadline) {
    const allRows =
      await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_PARTITIONS);
    lastRows = selectSettledPartitionRows(allRows);
    if (partitionSpreadReached(lastRows) &&
        allRows.length === lastRows.length) {
      const fingerprint = topologyFingerprint(lastRows);
      stableCount = fingerprint === stableFingerprint ?
        stableCount + ONE :
        ONE;
      stableFingerprint = fingerprint;
      if (stableCount >= TOPOLOGY_STABLE_READBACKS) {
        return {partitionRows: lastRows, sentinelCount};
      }
    } else {
      stableFingerprint = null;
      stableCount = ZERO;
    }
    if (lastRows.length < MIN_PARTITION_COUNT &&
        sentinelCount < MAX_SENTINEL_ROWS) {
      const sentinel = buildSentinelRow(sentinelCount);
      await seedNode.query(SQL.INSERT_ROW, [
        sentinel.id, sentinel.accountId, sentinel.amountCents,
        sentinel.flagged, sentinel.pad,
      ]);
      sentinelCount += ONE;
    }
    await deps.sleep(SPLIT_WAIT_POLL_MS);
  }
  throw new Error(
    `${SCENARIO_NAME}: no cross-host partition spread within ` +
    `${deps.splitWaitTimeoutMs}ms: ` +
    JSON.stringify(lastRows),
  );
}

// Deploy replays the generated records through the pipeline owner; the
// SQL client is the harness admin lane into the same grammar ingress.
async function deployThroughPipeline(seedNode, deps, paths, layoutPath) {
  const containerLayoutPath = path.posix.join(
    SCENARIO_ARTIFACTS.CONTAINER_PATH,
    path.relative(paths.artifactsRoot, layoutPath)
      .split(path.sep).join(path.posix.sep),
  );
  const sqlClient = {
    execute: async (statement, parameters) => ({
      rows: await queryRows(seedNode, statement, parameters),
    }),
  };
  return deps.pipeline.runDeploy({
    createSqlClient: () => sqlClient,
    idempotencyKey: deps.runId,
    layoutPath: containerLayoutPath,
    projectDirectory: paths.projectDirectory,
    writeOutput: deps.writeOutput,
  });
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

export async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(
    Array.isArray(nodes) && nodes.length >= MIN_DISTINCT_LEADER_HOSTS,
    `${SCENARIO_NAME} requires a multi-node cluster`,
  );
  const deps = resolveScenarioDependencies(cluster);
  const seedNode = nodes.find((node) => node.role === 'seed') ||
    nodes[ZERO];

  // Build the service through the pipeline owner (generate + build).
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

  // Data substrate: table, split policies, deterministic dataset.
  // Setup writes retry transient post-boot settling; measured phases do not.
  const rows = generateDatasetRows();
  await helpers.retryTransientAdminQuery(deps, 'create-table',
    () => seedNode.query(SQL.CREATE_TABLE));
  const tableId = await helpers.retryTransientAdminQuery(deps, 'resolve-table-id',
    () => helpers.resolveTableId(seedNode));
  await helpers.applySplitPolicies(seedNode, tableId, deps);
  await helpers.waitForTableWriteReadiness(nodes, deps);
  await helpers.seedDataset(seedNode, rows, deps);
  const spread =
    await waitForSplitAndLeaderSpread(nodes, seedNode, deps);
  const topology = assertPartitionSpread(spread.partitionRows);

  // Deploy the generated records, then measure over authenticated HTTP.
  await deployThroughPipeline(
    seedNode, deps, paths, buildResult.layoutPath);
  const servingNodes = await waitForServingNodes(nodes, deps);
  const snapshotsBefore = await captureResourceSnapshots(nodes, deps);
  const invocations = await runMeasuredInvocations(servingNodes, deps);
  const snapshotsAfter = await captureResourceSnapshots(nodes, deps);

  // Gates: stable topology, parity, fidelity, local reads,
  // coordination evidence.
  const finalPartitionRows = selectSettledPartitionRows(
    await helpers.queryRowsAcrossNodes(nodes, SQL.SELECT_PARTITIONS));
  assert.equal(
    finalPartitionRows.length, topology.partitions.length,
    `${SCENARIO_NAME}: partition count changed during measurement`,
  );
  const partitionCount = topology.partitions.length;
  const parity = assertParity({
    partitionCount,
    responses: invocations,
    rows,
  });
  const fidelity = assertWasmFidelity({
    buildDigest: buildResult.descriptor.digest,
    manifest,
    runtimeKindRows: await collectRuntimeKindRows(nodes),
  });
  const logEntries = deps.logBuffer();
  const localReadProof = buildLocalReadProof({
    invocationCount: invocations.length,
    logEntries,
    partitionIds: topology.partitions.map((entry) => entry.partitionId),
  });
  const coordination = await collectCoordinationEvidence(
    nodes, invocations, partitionCount);

  const nodeIds = nodes.map((node) => node.id);
  return composeReportDetail({
    datasetDigest: computeDatasetDigest(rows),
    fidelity,
    finalBytes: invocations
      .reduce((sum, invocation) => sum + invocation.bytes, ZERO),
    generatorDigest: computeGeneratorDigest(),
    invokerTelemetry: summarizeInvokerTelemetry(logEntries),
    latencyMs: computeLatencySummary(
      invocations.map((invocation) => invocation.durationMs)),
    localReadProof,
    networkPerNode:
      buildNetworkPerNode(nodeIds, snapshotsBefore, snapshotsAfter),
    nodeCount: nodes.length,
    parity,
    partialBytes: coordination.partialBytes,
    resourcePerNode: buildResourcePerNode(nodeIds, snapshotsAfter),
    sentinelRowCount: spread.sentinelCount,
    topology,
  });
}
