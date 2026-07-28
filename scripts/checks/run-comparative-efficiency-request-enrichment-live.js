#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {
  collectBenchmarkResourceSourceProvenance,
} from './benchmark-resource-source-provenance.js';
import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  shellQuote,
  waitForPostgresReady,
} from '../../test/distributed/harness/pgbench-runner.js';
import {
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
} from
  '../../test/distributed/harness/benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceDurableResolver,
  persistBenchmarkResourceArtifacts,
} from
  '../../test/distributed/harness/benchmark-resource-durable-resolver.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  deriveBenchmarkResourceLiveComponentAccounting,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from
  '../../test/distributed/harness/benchmark-resource-price-sheet-p0-constants.js';
import {
  buildComparativeRequestEnrichmentAffinityWitness,
} from
  '../../test/distributed/harness/comparative-efficiency-request-enrichment-affinity-witness.js';
import {
  COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
  COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_ORACLE,
  COMPARATIVE_REQUEST_ENRICHMENT_REASON,
  COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO,
  comparativeRequestEnrichmentExpectedResult,
  comparativeRequestEnrichmentSql,
  createComparativeRequestEnrichmentEvidence,
  inspectComparativeRequestEnrichmentEvidence,
} from
  '../../test/distributed/harness/comparative-efficiency-request-enrichment.js';
import {
  evaluateComparativeRequestEnrichmentOracle,
} from
  '../../test/distributed/harness/comparative-efficiency-request-enrichment-admission.js';

const execFileAsync = promisify(execFile);
const arrayPush = Function.call.bind(Array.prototype.push);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringReplace = Function.call.bind(String.prototype.replace);
const stringTrim = Function.call.bind(String.prototype.trim);
const IMAGE = 'postgres:16';
const PASSWORD = 'request-enrichment-live';
const DATABASE = 'postgres';
const POSTGRES_USER = 'postgres';
const RESOURCE_MEMORY = '256m';
const RESOURCE_CPUS = '1.0';
const DATABASE_STORAGE_BYTES = 128 * 1024 * 1024;
const DATABASE_STORAGE_PATH = '/var/lib/postgresql/data';
const CLIENT_STORAGE_PATH = '/tmp';
const START_TIMEOUT_MS = 30_000;
const ARTIFACT_DIRECTORY =
  'test-output/comparative-request-enrichment-artifacts';
const REPORT_DIRECTORY = 'test-output/reports';
const RUN_ID =
  `comparative-request-enrichment-${process.pid}-${Date.now()}`;
const NETWORK_NAME = `${RUN_ID}-network`;
const LABELS = Object.freeze({
  'lagrange.proof.run': RUN_ID,
  'lagrange.proof.scenario': COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO,
});
const SOURCE_PATHS = Object.freeze([
  'scripts/checks/benchmark-resource-source-provenance.js',
  'scripts/checks/run-comparative-efficiency-request-enrichment-guard.js',
  'scripts/checks/run-comparative-efficiency-request-enrichment-live.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-request-enrichment.test.js',
  'test/distributed/harness/' +
    'comparative-efficiency-request-enrichment-admission.js',
  'test/distributed/harness/' +
    'comparative-efficiency-request-enrichment-affinity-witness.js',
  'test/distributed/harness/' +
    'comparative-efficiency-request-enrichment-constants.js',
  'test/distributed/harness/' +
    'comparative-efficiency-request-enrichment.js',
]);
const candidateReason =
  'no claim-eligible Lagrange request-enrichment capacity adapter was ' +
  'available for the preregistered matrix';
const localText = Object.freeze({
  PSQL_ARGUMENTS: 'psql -v ON_ERROR_STOP=1 -At ',
  SLEEP: 'sleep',
  INFINITY: 'infinity',
  LAGRANGE: 'lagrange',
  POSTGRESQL: 'postgresql',
  NONE: 'none',
  LAGRANGE_NODE: 'lagrange-node',
  POSTGRESQL_DATABASE: 'postgresql-database',
  POSTGRESQL_CLIENT: 'postgresql-client',
  PAIRED_CAPACITY_ABSENT: 'paired_capacity_absent',
  RESOURCE_WINDOW_ABSENT: 'whole_topology_resource_window_absent',
  COMPARATIVE_EFFECTS_ABSENT: 'comparative_effects_absent',
  LIVE_EVIDENCE_VERSION: 'comparative-request-enrichment-live-evidence-v1',
  INPUT_TYPE_MODULE: '--input-type=module',
  EVAL: '--eval',
  UTF8: 'utf8',
  PASS: 'comparative-efficiency-request-enrichment-live: PASS\n',
  FAIL: 'comparative-efficiency-request-enrichment-live: FAIL\n',
  DURABLE_REJECTED: 'durable request-enrichment evidence rejected: ',
  CLAIM_PREFIX:
    'claim: no comparative claim; all 16 cells are non-measuring because ',
  CLAIM_SUFFIX:
    'the candidate capacity adapter was not engaged\n',
});

function psqlCommand(host, sql) {
  return (
    `PGPASSWORD='${shellQuote(PASSWORD)}' ` +
    localText.PSQL_ARGUMENTS +
    `-h '${shellQuote(host)}' -U '${POSTGRES_USER}' ` +
    `-d '${DATABASE}' -c '${shellQuote(sql)}'`
  );
}

async function executeSql(provider, clientId, host, sql) {
  const result = await provider.execInContainer(
    clientId,
    ['sh', '-lc', psqlCommand(host, sql)],
  );
  if (result.exitCode !== 0) {
    throw new Error(`PostgreSQL enrichment cell failed: ${result.stderr}`);
  }
  return stringTrim(result.stdout);
}

function databaseContainerOptions(networkId) {
  return {
    name: `${RUN_ID}-postgresql`,
    image: IMAGE,
    network: networkId,
    env: {
      POSTGRES_PASSWORD: PASSWORD,
      POSTGRES_DB: DATABASE,
    },
    labels: LABELS,
    resourceLimits: {memory: RESOURCE_MEMORY, cpus: RESOURCE_CPUS},
    hostConfigExtras: {
      Tmpfs: {
        [DATABASE_STORAGE_PATH]:
          `rw,size=${DATABASE_STORAGE_BYTES}`,
      },
    },
    startTimeout: START_TIMEOUT_MS,
  };
}

async function createDatabase(provider, networkId) {
  const container = await provider.createContainer(
    databaseContainerOptions(networkId),
  );
  await waitForPostgresReady(provider, container.containerId, {
    user: POSTGRES_USER,
    database: DATABASE,
    timeoutMs: START_TIMEOUT_MS,
  });
  return container;
}

function clientContainerOptions(networkId) {
  return {
    name: `${RUN_ID}-client`,
    image: IMAGE,
    network: networkId,
    labels: LABELS,
    resourceLimits: {memory: RESOURCE_MEMORY, cpus: RESOURCE_CPUS},
    command: [localText.SLEEP, localText.INFINITY],
    startTimeout: START_TIMEOUT_MS,
  };
}

async function createClient(provider, networkId) {
  return provider.createContainer(clientContainerOptions(networkId));
}

async function prepareWorkload(provider, client, database) {
  const sql =
    'CREATE TABLE request_entities (' +
      'id INTEGER PRIMARY KEY); ' +
    'INSERT INTO request_entities (id) ' +
      'SELECT value FROM generate_series(1, 1024) AS value; ' +
    'CREATE TABLE request_enrichments (' +
      'entity_id INTEGER NOT NULL REFERENCES request_entities(id), ' +
      'ordinal INTEGER NOT NULL, value BIGINT NOT NULL, ' +
      'PRIMARY KEY (entity_id, ordinal)); ' +
    'INSERT INTO request_enrichments (entity_id, ordinal, value) ' +
      'SELECT entity_id, ordinal, (entity_id * 100) + ordinal ' +
      'FROM generate_series(1, 1024) AS entity(entity_id) ' +
      'CROSS JOIN generate_series(1, 8) AS enrichment(ordinal)';
  await executeSql(
    provider,
    client.containerId,
    database.ip,
    sql,
  );
}

async function executeMatrix(provider, client, database, imageId) {
  const attempts = [];
  for (let index = 0;
    index < COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index];
    const sql = comparativeRequestEnrichmentSql(cell);
    const startedAt = new Date().toISOString();
    const stdout = await executeSql(
      provider,
      client.containerId,
      database.ip,
      sql,
    );
    const endedAt = new Date().toISOString();
    if (!evaluateComparativeRequestEnrichmentOracle(cell, stdout)) {
      throw new Error(`request-enrichment oracle failed at cell ${index}`);
    }
    arrayPush(attempts, {
      matrixCellIndex: index,
      runId: `${RUN_ID}-${index}`,
      candidateEngaged: false,
      alternativeEngaged: true,
      reasonCodes: [
        COMPARATIVE_REQUEST_ENRICHMENT_REASON,
        localText.PAIRED_CAPACITY_ABSENT,
        localText.RESOURCE_WINDOW_ABSENT,
        localText.COMPARATIVE_EFFECTS_ABSENT,
      ],
      liveEvidence: {
        version: localText.LIVE_EVIDENCE_VERSION,
        matrixCellIndex: index,
        startedAt,
        endedAt,
        candidate: {
          architectureId: localText.LAGRANGE,
          capacityAdapterEngaged: false,
          reason: candidateReason,
          affinityOwnerWitness:
            buildComparativeRequestEnrichmentAffinityWitness(cell),
        },
        alternative: {
          architectureId: localText.POSTGRESQL,
          engaged: true,
          image: IMAGE,
          imageId,
          databaseContainerId: database.containerId,
          clientContainerId: client.containerId,
          sql,
          stdout,
        },
        oracle: {
          name: COMPARATIVE_REQUEST_ENRICHMENT_ORACLE,
          expected: comparativeRequestEnrichmentExpectedResult(cell),
          passed: true,
        },
      },
    });
  }
  return attempts;
}

async function removeIfPresent(provider, containerId) {
  if (
    containerId &&
    await provider.inspectContainerIfExists(containerId) !== null
  ) {
    await provider.removeContainer(containerId);
  }
}

async function cleanup(provider, state) {
  const containers = [state.client, state.database];
  for (let index = 0; index < containers.length; index += 1) {
    await removeIfPresent(provider, containers[index]?.containerId);
  }
  if (
    state.networkId &&
    await provider.getNetworkByName(NETWORK_NAME) !== null
  ) {
    await provider.removeNetwork(state.networkId);
  }
}

function observedComponent(calibration, componentId) {
  const components = calibration.artifact.payload.components;
  for (let index = 0; index < components.length; index += 1) {
    if (components[index].componentId === componentId) {
      return components[index];
    }
  }
  throw new Error(`missing observed component ${componentId}`);
}

function inventoryShape({
  componentId,
  role,
  provisioned,
  minimumFootprint,
  reservedHeadroomRatio,
}) {
  return {
    componentId,
    role,
    billingTreatment: BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
    provisioned,
    minimumFootprint,
    reservedHeadroomRatio,
    exclusionReason: localText.NONE,
  };
}

function inventoryComponent(componentId, role, calibration) {
  const accounting = deriveBenchmarkResourceLiveComponentAccounting(
    observedComponent(calibration, componentId),
  );
  return inventoryShape({
    componentId,
    role,
    provisioned: accounting.provisioned,
    minimumFootprint: accounting.minimumFootprint,
    reservedHeadroomRatio: accounting.reservedHeadroomRatio,
  });
}

function absentCandidateInventory() {
  return inventoryShape({
    componentId: localText.LAGRANGE_NODE,
    role: BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
    provisioned: {
      cpuCores: 0,
      memoryBytes: 0,
      storageBytes: 0,
      iops: 0,
      networkBytesPerSecond: 0,
    },
    minimumFootprint: {
      instances: 0,
      cpuCores: 0,
      memoryBytes: 0,
      storageBytes: 0,
    },
    reservedHeadroomRatio: 0,
  });
}

function workloadCells() {
  const cells = [];
  for (let index = 0;
    index < COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_REQUEST_ENRICHMENT_CELLS[index];
    arrayPush(cells, {
      datasetSize: cell.datasetSize,
      fanout: cell.fanout,
      readLocality: cell.readLocality,
      skew: cell.skew,
      requestCount: cell.requestCount,
      alternativeSql: comparativeRequestEnrichmentSql(cell),
      oracleName: COMPARATIVE_REQUEST_ENRICHMENT_ORACLE,
      oracleExpected: comparativeRequestEnrichmentExpectedResult(cell),
    });
  }
  return cells;
}

async function replayInFreshProcess(rootDigest) {
  const inspectorUrl = new URL(
    '../../test/distributed/harness/' +
      'comparative-efficiency-request-enrichment.js',
    import.meta.url,
  ).href;
  const resolverUrl = new URL(
    '../../test/distributed/harness/' +
      'benchmark-resource-durable-resolver.js',
    import.meta.url,
  ).href;
  const source =
    'import {inspectComparativeRequestEnrichmentEvidence as inspect} from ' +
      `${jsonStringify(inspectorUrl)};` +
    'import {createBenchmarkResourceDurableResolver as resolver} from ' +
      `${jsonStringify(resolverUrl)};` +
    `const result=inspect({rootDigest:${jsonStringify(rootDigest)},` +
      `resolver:resolver(${jsonStringify(resolve(ARTIFACT_DIRECTORY))})});` +
    'process.stdout.write(JSON.stringify(result));';
  const {stdout} = await execFileAsync(
    process.execPath,
    [localText.INPUT_TYPE_MODULE, localText.EVAL, source],
    {encoding: localText.UTF8},
  );
  return jsonParse(stdout);
}

async function writeScenarioReport(detail) {
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    scenario: COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO,
    producer: 'comparative-efficiency-request-enrichment-live',
    fidelity: 'live-postgresql-and-production-affinity-owners',
    summary: {total: 1, passed: 1, failed: 0},
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {
      scenarios: [{
        scenario: COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO,
        passed: true,
        current: {passed: true, verdict: 'PASS'},
        detail,
      }],
    },
  };
  await mkdir(REPORT_DIRECTORY, {recursive: true});
  const stamp = stringReplace(timestamp, /[:.]/gu, '-');
  const path = resolve(
    REPORT_DIRECTORY,
    `${COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO}-${stamp}.report.json`,
  );
  await writeFile(path, jsonStringify(report, null, 2));
  return path;
}

function observationComponents(state) {
  return [
    {
      componentId: localText.POSTGRESQL_DATABASE,
      sideId: localText.POSTGRESQL,
      containerId: state.database.containerId,
      storagePath: DATABASE_STORAGE_PATH,
    },
    {
      componentId: localText.POSTGRESQL_CLIENT,
      sideId: localText.POSTGRESQL,
      containerId: state.client.containerId,
      storagePath: CLIENT_STORAGE_PATH,
    },
  ];
}

async function executeObservedMatrix(provider, state, provenance) {
  const image = await provider.inspectImage(IMAGE);
  if (!image) throw new Error(`required live image unavailable: ${IMAGE}`);
  const network = await provider.createNetwork(NETWORK_NAME, LABELS);
  state.networkId = network.id;
  state.database = await createDatabase(provider, state.networkId);
  state.client = await createClient(provider, state.networkId);
  await prepareWorkload(provider, state.client, state.database);
  const session =
    await beginBenchmarkResourceLiveObservation(provider, {
      runId: RUN_ID,
      networkId: state.networkId,
      networkName: NETWORK_NAME,
      sourceRevision: provenance.sourceRevision,
      components: observationComponents(state),
    });
  const attempts = await executeMatrix(
    provider,
    state.client,
    state.database,
    image.Id,
  );
  await captureBenchmarkResourceLiveObservation(session);
  await cleanup(provider, state);
  return {attempts, imageId: image.Id, session};
}

async function runObservedMatrix(provider, state, provenance) {
  try {
    return await executeObservedMatrix(provider, state, provenance);
  } catch (error) {
    await cleanup(provider, state);
    throw error;
  }
}

async function main() {
  const provider = new DockerProvider();
  const state = {networkId: null, database: null, client: null};
  const provenance =
    await collectBenchmarkResourceSourceProvenance(SOURCE_PATHS);
  const {attempts, imageId, session} =
    await runObservedMatrix(provider, state, provenance);
  const finalized =
    await finalizeBenchmarkResourceLiveObservation(session);
  const calibration =
    writeExternallyObservedBenchmarkResourceCalibration(
      finalized.receipt,
      finalized.authorization,
    );
  const producedAt = new Date().toISOString();
  const validUntil =
    new Date(Date.parse(producedAt) + 24 * 60 * 60 * 1_000).toISOString();
  const sideIds = [localText.LAGRANGE, localText.POSTGRESQL];
  const evidence = createComparativeRequestEnrichmentEvidence({
    matrixId: 'comparative-request-enrichment-p0-v1',
    pairId: 'lagrange-postgresql-request-enrichment-v1',
    sideIds,
    sourceRevision: provenance.sourceRevision,
    producedAt,
    validUntil,
    workloadManifest: {
      version: 'comparative-request-enrichment-workloads-v1',
      cells: workloadCells(),
      selectionPolicy: 'complete_cartesian_matrix',
    },
    alternativeTopology: {
      version: 'comparative-request-enrichment-topology-v1',
      candidate: {
        architectureId: localText.LAGRANGE,
        required: true,
        capacityAdapterEngaged: false,
        reason: candidateReason,
      },
      alternative: {
        architectureId: localText.POSTGRESQL,
        image: IMAGE,
        imageId,
        databaseContainerId:
          calibration.artifact.payload.components[0].containerId,
        clientContainerId:
          calibration.artifact.payload.components[1].containerId,
        network: 'managed_bridge',
      },
    },
    preregistration: {
      version: 'comparative-request-enrichment-preregistration-v1',
      axes: COMPARATIVE_REQUEST_ENRICHMENT_AXES,
      sideIds,
      outcomePolicy: 'direction_neutral',
      invalidCellPolicy: 'publish_explicit_non_measuring',
      candidateEngagementRequired: true,
      affinityOwnerIds: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
      requiredEvidence: [
        'paired_capacity',
        'whole_topology_resource_windows',
        'capacity_uncertainty',
        'capacity_practical_effect',
        'cost_practical_effect',
      ],
    },
    inventoryId: 'comparative-request-enrichment-live-inventory-v1',
    inventorySides: [
      {
        sideId: localText.LAGRANGE,
        components: [absentCandidateInventory()],
      },
      {
        sideId: localText.POSTGRESQL,
        components: [
          inventoryComponent(
            localText.POSTGRESQL_DATABASE,
            BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
            calibration,
          ),
          inventoryComponent(
            localText.POSTGRESQL_CLIENT,
            BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
            calibration,
          ),
        ],
      },
    ],
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    calibrationArtifact: calibration,
    attempts,
  });
  const inspection =
    inspectComparativeRequestEnrichmentEvidence(evidence.receipt);
  if (!inspection.valid || !inspection.complete) {
    throw new Error(`request-enrichment evidence rejected: ${inspection.reason}`);
  }
  const allArtifacts = [];
  for (let index = 0; index < evidence.artifacts.length; index += 1) {
    arrayPush(allArtifacts, evidence.artifacts[index]);
  }
  arrayPush(allArtifacts, evidence.root);
  const persisted = await persistBenchmarkResourceArtifacts(
    resolve(ARTIFACT_DIRECTORY),
    allArtifacts,
  );
  const durableInspection = inspectComparativeRequestEnrichmentEvidence({
    rootDigest: evidence.root.digest,
    resolver: createBenchmarkResourceDurableResolver(
      resolve(ARTIFACT_DIRECTORY),
    ),
  });
  if (!durableInspection.valid || !durableInspection.complete) {
    throw new Error(
      localText.DURABLE_REJECTED +
      durableInspection.reason,
    );
  }
  const freshInspection = await replayInFreshProcess(evidence.root.digest);
  if (!freshInspection.valid || !freshInspection.complete) {
    throw new Error(
      `fresh request-enrichment evidence rejected: ${freshInspection.reason}`,
    );
  }
  const reportPath = await writeScenarioReport({
    runId: RUN_ID,
    sourceRevision: provenance.sourceRevision,
    sourceProvenance: provenance,
    matrixId: inspection.matrixId,
    matrixDigest: inspection.matrixDigest,
    evidenceRootDigest: inspection.rootDigest,
    axes: COMPARATIVE_REQUEST_ENRICHMENT_AXES,
    fullMatrixComplete: true,
    matrixCellCount: COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length,
    outcomeNeutral: true,
    comparativeClaimEligible: false,
    claimDisposition: inspection.claimDisposition,
    measuringCellCount: inspection.measuringCellCount,
    nonMeasuringCellCount: inspection.nonMeasuringCellCount,
    affinityOwnerIds: COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
    affinityOwnerWitnessCount: inspection.affinityOwnerWitnessCount,
    alternativeOraclePassCount: inspection.alternativeOraclePassCount,
    artifactCount: persisted.length,
    liveCalibrationDigest: calibration.digest,
    cleanupVerified: finalized.receipt.cleanupVerified,
    durableReplayValid: durableInspection.valid,
    freshProcessReplayValid: freshInspection.valid,
  });
  process.stdout.write(
    localText.PASS +
    localText.CLAIM_PREFIX +
      localText.CLAIM_SUFFIX +
    `rootDigest: ${evidence.root.digest}\n` +
    `scenarioReport: ${reportPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${localText.FAIL}${error.stack}\n`);
  process.exitCode = 1;
});
