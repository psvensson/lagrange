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
  deriveBenchmarkResourceLiveComponentAccounting,
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from
  '../../test/distributed/harness/benchmark-resource-price-sheet-p0-constants.js';
import {
  COMPARATIVE_NEGATIVE_CONTROL_IDS,
  COMPARATIVE_NEGATIVE_CONTROL_REASON,
  COMPARATIVE_NEGATIVE_CONTROL_SCENARIO,
  COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS,
  createComparativeNegativeControlEvidence,
  inspectComparativeNegativeControlEvidence,
} from
  '../../test/distributed/harness/comparative-efficiency-negative-controls.js';
import {
  evaluateComparativeNegativeControlOracle,
} from
  '../../test/distributed/harness/comparative-efficiency-negative-controls-admission.js';

const execFileAsync = promisify(execFile);
const stringTrim = Function.call.bind(String.prototype.trim);
const IMAGE = 'postgres:16';
const PASSWORD = 'negative-controls-live';
const DATABASE = 'postgres';
const POSTGRES_USER = 'postgres';
const RESOURCE_MEMORY = '256m';
const RESOURCE_CPUS = '1.0';
const DATABASE_STORAGE_BYTES = 128 * 1024 * 1024;
const DATABASE_STORAGE_PATH = '/var/lib/postgresql/data';
const CLIENT_STORAGE_PATH = '/tmp';
const START_TIMEOUT_MS = 30_000;
const ARTIFACT_DIRECTORY =
  'test-output/comparative-negative-control-artifacts';
const REPORT_DIRECTORY = 'test-output/reports';
const RUN_ID =
  `comparative-negative-controls-${process.pid}-${Date.now()}`;
const NETWORK_NAME = `${RUN_ID}-network`;
const LABELS = Object.freeze({
  'lagrange.proof.run': RUN_ID,
  'lagrange.proof.scenario': COMPARATIVE_NEGATIVE_CONTROL_SCENARIO,
});
const SOURCE_PATHS = Object.freeze([
  'scripts/checks/benchmark-resource-source-provenance.js',
  'scripts/checks/run-comparative-efficiency-negative-controls-guard.js',
  'scripts/checks/run-comparative-efficiency-negative-controls-live.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-negative-controls.test.js',
  'test/distributed/harness/' +
    'comparative-efficiency-negative-controls-admission.js',
  'test/distributed/harness/' +
    'comparative-efficiency-negative-controls-constants.js',
  'test/distributed/harness/comparative-efficiency-negative-controls.js',
]);
const candidateReason =
  'no claim-eligible Lagrange workload adapter was available for this ' +
  'preregistered control identity';
const localText = Object.freeze({
  PSQL_ARGUMENTS: 'psql -v ON_ERROR_STOP=1 -At ',
  SLEEP: 'sleep',
  INFINITY: 'infinity',
  PAIRED_CAPACITY_ABSENT: 'paired_capacity_absent',
  RESOURCE_WINDOW_ABSENT: 'whole_topology_resource_window_absent',
  COMPARATIVE_EFFECTS_ABSENT: 'comparative_effects_absent',
  LIVE_EVIDENCE_VERSION: 'comparative-negative-control-live-evidence-v1',
  LAGRANGE: 'lagrange',
  POSTGRESQL: 'postgresql',
  NONE: 'none',
  LAGRANGE_NODE: 'lagrange-node',
  POSTGRESQL_DATABASE: 'postgresql-database',
  POSTGRESQL_CLIENT: 'postgresql-client',
  INPUT_TYPE_MODULE: '--input-type=module',
  EVAL: '--eval',
  UTF8: 'utf8',
  DURABLE_REJECTED: 'durable negative-control evidence rejected: ',
  PASS: 'comparative-efficiency-negative-controls-live: PASS\n',
  CLAIM_PREFIX:
    'claim: no comparative claim; all five controls are explicitly ',
  CLAIM_SUFFIX:
    'non-measuring because the candidate architecture was not engaged\n',
});

const CONTROL_WORKLOADS = COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS;

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
    throw new Error(`PostgreSQL control failed: ${result.stderr}`);
  }
  return stringTrim(result.stdout);
}

async function createDatabase(provider, networkId) {
  const container = await provider.createContainer({
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
  });
  await waitForPostgresReady(provider, container.containerId, {
    user: POSTGRES_USER,
    database: DATABASE,
    timeoutMs: START_TIMEOUT_MS,
  });
  return container;
}

async function createClient(provider, networkId) {
  return provider.createContainer({
    name: `${RUN_ID}-client`,
    image: IMAGE,
    network: networkId,
    labels: LABELS,
    resourceLimits: {memory: RESOURCE_MEMORY, cpus: RESOURCE_CPUS},
    command: [localText.SLEEP, localText.INFINITY],
    startTimeout: START_TIMEOUT_MS,
  });
}

async function prepareWorkloads(provider, client, database) {
  const sql =
    'CREATE TABLE control_items (' +
      'id INTEGER PRIMARY KEY, payload BIGINT NOT NULL, ' +
      'version BIGINT NOT NULL DEFAULT 0); ' +
    'INSERT INTO control_items (id, payload) ' +
      'SELECT value, value FROM generate_series(1, 128) AS value; ' +
    'CREATE TABLE control_events (' +
      'control_id TEXT PRIMARY KEY, payload BIGINT NOT NULL)';
  await executeSql(
    provider,
    client.containerId,
    database.ip,
    sql,
  );
}

async function executeControls(provider, client, database, imageId) {
  const attempts = [];
  for (let index = 0; index < CONTROL_WORKLOADS.length; index += 1) {
    const workload = CONTROL_WORKLOADS[index];
    const startedAt = new Date().toISOString();
    const stdout = await executeSql(
      provider,
      client.containerId,
      database.ip,
      workload.alternativeSql,
    );
    const endedAt = new Date().toISOString();
    const oraclePassed =
      evaluateComparativeNegativeControlOracle(workload, stdout);
    if (!oraclePassed) {
      throw new Error(
        `${workload.controlId} alternative oracle failed: ${stdout}`,
      );
    }
    attempts.push({
      controlId: workload.controlId,
      runId: `${RUN_ID}-${workload.controlId}`,
      candidateEngaged: false,
      alternativeEngaged: true,
      reasonCodes: [
        COMPARATIVE_NEGATIVE_CONTROL_REASON,
        localText.PAIRED_CAPACITY_ABSENT,
        localText.RESOURCE_WINDOW_ABSENT,
        localText.COMPARATIVE_EFFECTS_ABSENT,
      ],
      liveEvidence: {
        version: localText.LIVE_EVIDENCE_VERSION,
        controlId: workload.controlId,
        startedAt,
        endedAt,
        candidate: {
          architectureId: localText.LAGRANGE,
          engaged: false,
          reason: candidateReason,
        },
        alternative: {
          architectureId: localText.POSTGRESQL,
          engaged: true,
          image: IMAGE,
          imageId,
          databaseContainerId: database.containerId,
          clientContainerId: client.containerId,
          sql: workload.alternativeSql,
          stdout,
        },
        oracle: {
          name: workload.oracleName,
          passed: oraclePassed,
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
  await removeIfPresent(provider, state.client?.containerId);
  await removeIfPresent(provider, state.database?.containerId);
  if (
    state.networkId &&
    await provider.getNetworkByName(NETWORK_NAME) !== null
  ) {
    await provider.removeNetwork(state.networkId);
  }
}

function observedComponent(calibration, componentId) {
  return calibration.artifact.payload.components.find(
    (component) => component.componentId === componentId,
  );
}

function inventoryComponent(componentId, role, calibration) {
  const accounting = deriveBenchmarkResourceLiveComponentAccounting(
    observedComponent(calibration, componentId),
  );
  return {
    componentId,
    role,
    billingTreatment: BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
    provisioned: accounting.provisioned,
    minimumFootprint: accounting.minimumFootprint,
    reservedHeadroomRatio: accounting.reservedHeadroomRatio,
    exclusionReason: localText.NONE,
  };
}

function absentCandidateInventory() {
  return {
    componentId: localText.LAGRANGE_NODE,
    role: BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
    billingTreatment: BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
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
    exclusionReason: localText.NONE,
  };
}

async function replayInFreshProcess(rootDigest) {
  const inspectorUrl = new URL(
    '../../test/distributed/harness/' +
      'comparative-efficiency-negative-controls.js',
    import.meta.url,
  ).href;
  const resolverUrl = new URL(
    '../../test/distributed/harness/' +
      'benchmark-resource-durable-resolver.js',
    import.meta.url,
  ).href;
  const source =
    'import {inspectComparativeNegativeControlEvidence as inspect} from ' +
      `${JSON.stringify(inspectorUrl)};` +
    'import {createBenchmarkResourceDurableResolver as resolver} from ' +
      `${JSON.stringify(resolverUrl)};` +
    'const result=inspect({rootDigest:process.env.C5_ROOT_DIGEST,' +
      'resolver:resolver(process.env.C5_ARTIFACT_DIRECTORY)});' +
    'process.stdout.write(JSON.stringify(result));';
  const {stdout} = await execFileAsync(
    process.execPath,
    [localText.INPUT_TYPE_MODULE, localText.EVAL, source],
    {
      encoding: localText.UTF8,
      env: {
        ...process.env,
        C5_ROOT_DIGEST: rootDigest,
        C5_ARTIFACT_DIRECTORY: resolve(ARTIFACT_DIRECTORY),
      },
    },
  );
  return JSON.parse(stdout);
}

async function writeScenarioReport(detail) {
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    scenario: COMPARATIVE_NEGATIVE_CONTROL_SCENARIO,
    producer: 'comparative-efficiency-negative-controls-live',
    fidelity: 'live',
    summary: {total: 1, passed: 1, failed: 0},
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {
      scenarios: [{
        scenario: COMPARATIVE_NEGATIVE_CONTROL_SCENARIO,
        passed: true,
        current: {passed: true, verdict: 'PASS'},
        detail,
      }],
    },
  };
  await mkdir(REPORT_DIRECTORY, {recursive: true});
  const stamp = timestamp.replace(/[:.]/gu, '-');
  const path = resolve(
    REPORT_DIRECTORY,
    `${COMPARATIVE_NEGATIVE_CONTROL_SCENARIO}-${stamp}.report.json`,
  );
  await writeFile(path, JSON.stringify(report, null, 2));
  return path;
}

async function main() {
  const provider = new DockerProvider();
  const state = {networkId: null, database: null, client: null};
  const provenance =
    await collectBenchmarkResourceSourceProvenance(SOURCE_PATHS);
  let session;
  let attempts;
  let imageId;
  try {
    const image = await provider.inspectImage(IMAGE);
    if (!image) throw new Error(`required live image unavailable: ${IMAGE}`);
    imageId = image.Id;
    const network = await provider.createNetwork(NETWORK_NAME, LABELS);
    state.networkId = network.id;
    state.database = await createDatabase(provider, state.networkId);
    state.client = await createClient(provider, state.networkId);
    await prepareWorkloads(provider, state.client, state.database);
    session = await beginBenchmarkResourceLiveObservation(provider, {
      runId: RUN_ID,
      networkId: state.networkId,
      networkName: NETWORK_NAME,
      sourceRevision: provenance.sourceRevision,
      components: [
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
      ],
    });
    attempts = await executeControls(
      provider,
      state.client,
      state.database,
      imageId,
    );
    await captureBenchmarkResourceLiveObservation(session);
    await cleanup(provider, state);
  } catch (error) {
    await cleanup(provider, state);
    throw error;
  }
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
  const evidence = createComparativeNegativeControlEvidence({
    matrixId: 'comparative-negative-controls-p0-v1',
    pairId: 'lagrange-postgresql-negative-controls-v1',
    sideIds,
    sourceRevision: provenance.sourceRevision,
    producedAt,
    validUntil,
    workloadManifest: {
      version: 'comparative-negative-controls-workloads-v1',
      controls: CONTROL_WORKLOADS.map((control) => ({
        controlId: control.controlId,
        accessDistribution: control.accessDistribution,
        randomSeed: control.randomSeed,
        alternativeSql: control.alternativeSql,
        oracleName: control.oracleName,
        oracleKind: control.oracleKind,
        oracleExpected: control.oracleExpected,
      })),
      selectionPolicy: 'complete_preregistered_matrix',
    },
    alternativeTopology: {
      version: 'comparative-negative-controls-topology-v1',
      candidate: {
        architectureId: localText.LAGRANGE,
        required: true,
        engaged: false,
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
      version: 'comparative-negative-controls-preregistration-v1',
      controls: COMPARATIVE_NEGATIVE_CONTROL_IDS,
      sideIds,
      outcomePolicy: 'direction_neutral',
      invalidCellPolicy: 'publish_explicit_non_measuring',
      candidateEngagementRequired: true,
      requiredEvidence: [
        'paired_capacity',
        'whole_topology_resource_windows',
        'capacity_uncertainty',
        'capacity_practical_effect',
        'cost_practical_effect',
      ],
    },
    inventoryId: 'comparative-negative-controls-live-inventory-v1',
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
    inspectComparativeNegativeControlEvidence(evidence.receipt);
  if (!inspection.valid || !inspection.complete) {
    throw new Error(`negative-control evidence rejected: ${inspection.reason}`);
  }
  const allArtifacts = [...evidence.artifacts, evidence.root];
  const persisted = await persistBenchmarkResourceArtifacts(
    resolve(ARTIFACT_DIRECTORY),
    allArtifacts,
  );
  const durableInspection = inspectComparativeNegativeControlEvidence({
    rootDigest: evidence.root.digest,
    resolver: createBenchmarkResourceDurableResolver(
      resolve(ARTIFACT_DIRECTORY),
    ),
  });
  if (!durableInspection.valid || !durableInspection.complete) {
    throw new Error(
      localText.DURABLE_REJECTED +
      `${durableInspection.reason}`,
    );
  }
  const freshInspection = await replayInFreshProcess(evidence.root.digest);
  if (!freshInspection.valid || !freshInspection.complete) {
    throw new Error(
      `fresh negative-control evidence rejected: ${freshInspection.reason}`,
    );
  }
  const reportPath = await writeScenarioReport({
    runId: RUN_ID,
    sourceRevision: provenance.sourceRevision,
    sourceProvenance: provenance,
    matrixId: inspection.matrixId,
    matrixDigest: inspection.matrixDigest,
    evidenceRootDigest: inspection.rootDigest,
    controls: COMPARATIVE_NEGATIVE_CONTROL_IDS,
    fullMatrixComplete: true,
    outcomeNeutral: true,
    comparativeClaimEligible: false,
    measuringCellCount: inspection.measuringCellCount,
    nonMeasuringCellCount: inspection.nonMeasuringCellCount,
    reasonCodesByControl: attempts.map((attempt) => ({
      controlId: attempt.controlId,
      reasonCodes: attempt.reasonCodes,
    })),
    alternativeOracles: attempts.map((attempt) => ({
      controlId: attempt.controlId,
      passed: attempt.liveEvidence.oracle.passed,
    })),
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
  process.stderr.write(
    `comparative-efficiency-negative-controls-live: FAIL\n${error.stack}\n`,
  );
  process.exitCode = 1;
});
