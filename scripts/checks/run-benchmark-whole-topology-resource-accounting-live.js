#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {
  collectBenchmarkResourceSourceProvenance,
} from './benchmark-resource-source-provenance.js';
import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  buildPgbenchScript,
  ensureBenchmarkTable,
  runPgbench,
  shellQuote,
  waitForPostgresReady,
  writePgbenchScript,
} from '../../test/distributed/harness/pgbench-runner.js';
import {
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CAPACITY_SOURCE,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
  BENCHMARK_RESOURCE_SCENARIO,
} from
  '../../test/distributed/harness/benchmark-resource-contract-constants.js';
import {
  createBenchmarkResourceDurableResolver,
  persistBenchmarkResourceArtifacts,
} from
  '../../test/distributed/harness/benchmark-resource-durable-resolver.js';
import {
  createBenchmarkResourceSourceArtifact,
  validateBenchmarkResourceEvidenceRoot,
} from
  '../../test/distributed/harness/benchmark-resource-evidence-root.js';
import {
  inspectBenchmarkCapacityTerminalMeasurement,
} from
  '../../test/distributed/harness/benchmark-capacity-protocol.js';
import {
  replayBenchmarkCapacityRawArtifact,
} from
  '../../test/distributed/harness/benchmark-capacity-raw-artifact.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  deriveBenchmarkResourceLiveComponentAccounting,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {
  createBenchmarkResourceSingleCellPairedEvidence,
} from
  '../../test/distributed/harness/benchmark-resource-paired-run-evidence.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from
  '../../test/distributed/harness/benchmark-resource-price-sheet-p0-constants.js';
import {
  SCALE_PROFILE_ID,
} from '../../test/distributed/harness/scale-evidence-contract.js';
import {
  createScaleProfileEnvelope,
} from '../../test/distributed/harness/scale-profile-envelope.js';
const localText = Object.freeze({
  UTF8: 'utf8',
  POSTGRES: 'postgres',
  VALUE_1_0: '1.0',
  SLEEP: 'sleep',
  INFINITY: 'infinity',
  SET_PAYLOAD_RANDOM_1_100000: '\\set payload random(1, 100000)',
  SAME_MANAGED_PGBENCH_DRIVER_FOR_BOTH_SIDES: 'same_managed_pgbench_driver_for_both_sides',
  NONE: 'none',
  BENCHMARK_RESOURCE_LIVE_SEMANTIC_RECEIPT_V1: 'benchmark-resource-live-semantic-receipt-v1',
  BENCHMARK_RESOURCE_LIVE_ENGAGEMENT_V1: 'benchmark-resource-live-engagement-v1',
  MANAGED_BRIDGE_PGBENCH_TO_POSTGRESQL: 'managed_bridge_pgbench_to_postgresql',
  SEMANTIC_EVENTS_ABSENT_ZERO_ONLY: 'semantic_events_absent_zero_only',
  BENCHMARK_RESOURCE_WINDOW_RECEIPT_V1: 'benchmark-resource-window-receipt-v1',
  BENCHMARK_WHOLE_TOPOLOGY_RESOURCE_ACCOUNTING_LIVE_PASS: 'benchmark-whole-topology-resource-accounting-live: PASS\n',
  BENCHMARK_WHOLE_TOPOLOGY_RESOURCE_ACCOUNTING_LIVE_FAIL: 'benchmark-whole-topology-resource-accounting-live: FAIL\n',
  C3_LIVE_SCENARIO_REPORT_MISSING:
    'C3 live scenario did not produce a report',
  C3_LIVE_SCENARIO_NOT_ELIGIBLE:
    'C3 live scenario was not claim-eligible and replay-valid',
  C3_TERMINAL_CAPACITY_REPLAY_FAILED:
    'C3 terminal capacity artifact replay failed',
  C3_TERMINAL_CAPACITY_CURVE_MISSING:
    'C3 terminal capacity curve row is missing',
  ALLOW_NON_MEASURING: '--allow-non-measuring',
  FRESH_REPLAY_EXPECTED_VALID_NON_MEASURING:
    'fresh replay did not preserve valid non-measuring evidence',
});


const execFileAsync = promisify(execFile);
const IMAGE = 'postgres:16';
const PASSWORD = 'resource-accounting-live';
const DATABASE = 'postgres';
const TABLE = 'benchmark_resource_events';
const SIDE_IDS = ['candidate', 'baseline'];
const REPETITIONS = 3;
const DURATION_SECONDS = 1;
const CLIENTS = 2;
const JOBS = 1;
const RESOURCE_MEMORY = '256m';
const DATABASE_STORAGE_BYTES = 128 * 1024 * 1024;
const DATABASE_STORAGE_PATH = '/var/lib/postgresql/data';
const CLIENT_STORAGE_PATH = '/tmp';
const PRACTICAL_THRESHOLD = 0.05;
const START_TIMEOUT_MS = 30000;
const REPORT_DIRECTORY = 'test-output/reports';
const ARTIFACT_DIRECTORY =
  'test-output/benchmark-resource-artifacts';
const RUN_ID = `benchmark-resource-live-${process.pid}-${Date.now()}`;
const NETWORK_NAME = `${RUN_ID}-network`;
const LABELS = Object.freeze({
  'lagrange.proof.run': RUN_ID,
  'lagrange.proof.scenario': BENCHMARK_RESOURCE_SCENARIO.LIVE,
});
const C3_LIVE_SCRIPT =
  'scripts/checks/run-benchmark-statistical-capacity-live-engagement.js';
const C3_REPORT_PREFIX = 'benchmark-statistical-capacity-protocol-';
const C3_REPORT_SUFFIX = '.report.json';
const C3_GUARD_TOKEN = '-guard-';

async function latestC3ScenarioReport() {
  const names = await readdir(REPORT_DIRECTORY);
  let latestName = null;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (
      name.startsWith(C3_REPORT_PREFIX) &&
      name.endsWith(C3_REPORT_SUFFIX) &&
      !name.includes(C3_GUARD_TOKEN) &&
      (latestName === null || name > latestName)
    ) {
      latestName = name;
    }
  }
  if (latestName === null) {
    throw new Error(localText.C3_LIVE_SCENARIO_REPORT_MISSING);
  }
  const path = resolve(REPORT_DIRECTORY, latestName);
  return {path, report: JSON.parse(await readFile(path, localText.UTF8))};
}

async function collectC3CapacityEvidence() {
  await execFileAsync(process.execPath, [resolve(C3_LIVE_SCRIPT)], {
    encoding: localText.UTF8,
  });
  const scenario = await latestC3ScenarioReport();
  const detail = scenario.report.standardSummary.scenarios[0].detail;
  if (
    detail.comparativeClaimEligible !== true ||
    detail.rawArtifactReplayValid !== true ||
    detail.freshProcessRawArtifactReplayValid !== true
  ) {
    throw new Error(localText.C3_LIVE_SCENARIO_NOT_ELIGIBLE);
  }
  const replay = await replayBenchmarkCapacityRawArtifact(
    detail.artifactReceipt,
  );
  if (
    !replay.valid ||
    !inspectBenchmarkCapacityTerminalMeasurement(
      replay.artifact.report,
      replay.artifact.preregistration,
    ).valid
  ) {
    throw new Error(localText.C3_TERMINAL_CAPACITY_REPLAY_FAILED);
  }
  return {
    scenarioReportPath: scenario.path,
    artifactReceipt: detail.artifactReceipt,
    preregistration: replay.artifact.preregistration,
    report: replay.artifact.report,
  };
}

async function createPostgres(provider, sideId, networkId) {
  const name = `${RUN_ID}-${sideId}-postgres`;
  const container = await provider.createContainer({
    name,
    image: IMAGE,
    network: networkId,
    env: {
      POSTGRES_PASSWORD: PASSWORD,
      POSTGRES_DB: DATABASE,
    },
    labels: LABELS,
    resourceLimits: {memory: RESOURCE_MEMORY, cpus: '1.0'},
    hostConfigExtras: {
      Tmpfs: {
        [DATABASE_STORAGE_PATH]:
          `rw,size=${DATABASE_STORAGE_BYTES}`,
      },
    },
    startTimeout: START_TIMEOUT_MS,
  });
  await waitForPostgresReady(provider, container.containerId, {
    user: localText.POSTGRES,
    database: DATABASE,
    timeoutMs: START_TIMEOUT_MS,
  });
  return {...container, sideId};
}

async function createClient(provider, networkId) {
  return provider.createContainer({
    name: `${RUN_ID}-pgbench-client`,
    image: IMAGE,
    network: networkId,
    labels: LABELS,
    resourceLimits: {memory: RESOURCE_MEMORY, cpus: localText.VALUE_1_0},
    command: [localText.SLEEP, localText.INFINITY],
    startTimeout: START_TIMEOUT_MS,
  });
}

async function execPsql(provider, clientId, host, sql) {
  const command =
    `PGPASSWORD='${shellQuote(PASSWORD)}' ` +
    'psql -v ON_ERROR_STOP=1 -At ' +
    `-h '${shellQuote(host)}' -U postgres -d postgres ` +
    `-c '${shellQuote(sql)}'`;
  const result = await provider.execInContainer(
    clientId,
    ['sh', '-lc', command],
  );
  if (result.exitCode !== 0) {
    throw new Error(`psql failed for ${host}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function prepareWorkload(provider, client, databases) {
  await writePgbenchScript(
    provider,
    client.containerId,
    buildPgbenchScript([
      localText.SET_PAYLOAD_RANDOM_1_100000,
      `INSERT INTO ${TABLE} (payload) VALUES (:payload);`,
      `SELECT count(*) FROM ${TABLE} WHERE payload = :payload;`,
    ]),
  );
  for (let index = 0; index < databases.length; index += 1) {
    await ensureBenchmarkTable(provider, client.containerId, {
      host: databases[index].ip,
      user: localText.POSTGRES,
      password: PASSWORD,
      database: DATABASE,
      tableName: TABLE,
    });
  }
}

async function runSideSample(provider, client, database, repetition) {
  const result = await runPgbench(provider, client.containerId, {
    host: database.ip,
    user: 'postgres',
    password: PASSWORD,
    database: DATABASE,
    durationSeconds: DURATION_SECONDS,
    clients: CLIENTS,
    jobs: JOBS,
  });
  if (
    result.tps <= 0 ||
    result.transactionsProcessed <= 0 ||
    result.failedTransactions !== 0
  ) {
    throw new Error(
      `${database.sideId} repetition ${repetition} was not SLO-eligible`,
    );
  }
  return {
    repetition,
    tps: result.tps,
    latencyAverageMs: result.latencyAverageMs,
    latencyStddevMs: result.latencyStddevMs,
    transactionsProcessed: result.transactionsProcessed,
    failedTransactions: result.failedTransactions,
    raw: result.raw,
  };
}

async function executePairedSamples(provider, client, databases) {
  const samples = [[], []];
  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    const order = repetition % 2 === 0 ? [0, 1] : [1, 0];
    for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
      const sideIndex = order[orderIndex];
      samples[sideIndex].push(await runSideSample(
        provider,
        client,
        databases[sideIndex],
        repetition,
      ));
    }
  }
  return samples;
}

function observationFor(calibration, sideId, componentId) {
  for (let index = 0;
    index < calibration.artifact.payload.components.length;
    index += 1) {
    const observation = calibration.artifact.payload.components[index];
    if (
      observation.sideId === sideId &&
      observation.componentId === componentId
    ) {
      return observation;
    }
  }
  throw new Error(`missing calibration for ${sideId}/${componentId}`);
}

function topologyComponents(calibration) {
  const components = [];
  for (let index = 0; index < SIDE_IDS.length; index += 1) {
    const sideId = SIDE_IDS[index];
    const databaseComponentId = `${sideId}-database`;
    const clientComponentId = `${sideId}-client`;
    components.push({
      sideId,
      componentId: databaseComponentId,
      role: BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
      physicalResourceId:
        observationFor(calibration, sideId, databaseComponentId).containerId,
    });
    components.push({
      sideId,
      componentId: clientComponentId,
      role: BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
      physicalResourceId:
        observationFor(calibration, sideId, clientComponentId).containerId,
    });
  }
  return components;
}

function inventoryComponent(
  componentId,
  role,
  billingTreatment,
  observation,
  client,
) {
  const accounting =
    deriveBenchmarkResourceLiveComponentAccounting(observation);
  return {
    componentId,
    role,
    billingTreatment,
    provisioned: accounting.provisioned,
    minimumFootprint: accounting.minimumFootprint,
    reservedHeadroomRatio: accounting.reservedHeadroomRatio,
    exclusionReason: client ?
      localText.SAME_MANAGED_PGBENCH_DRIVER_FOR_BOTH_SIDES :
      localText.NONE,
    utilized: accounting.utilized,
    amplification: accounting.amplification,
  };
}

function c3CapacityProjection(c3Evidence, sideIndex, mappedSideId) {
  const protocolSideId = c3Evidence.preregistration.sideIds[sideIndex];
  const capacity =
    c3Evidence.report.summary.capacityBySide[protocolSideId];
  let terminalCurve;
  for (let index = 0;
    index < c3Evidence.report.summary.capacityCurve.length;
    index += 1) {
    const curve = c3Evidence.report.summary.capacityCurve[index];
    if (
      curve.offeredLoadPerSecond === capacity.maxSloOfferedLoadPerSecond
    ) {
      terminalCurve = curve;
    }
  }
  if (terminalCurve === undefined) {
    throw new Error(localText.C3_TERMINAL_CAPACITY_CURVE_MISSING);
  }
  const interval =
    terminalCurve.sides[protocolSideId].correctThroughputPerSecond;
  return {
    capacityCorrectOpsPerSecond: capacity.maxCorrectThroughputPerSecond,
    capacityConfidenceInterval: {
      lower: interval.lower,
      upper: interval.upper,
    },
    capacitySamples: capacity.perBlock,
    capacityProtocolEvidence: {
      version: BENCHMARK_RESOURCE_CAPACITY_SOURCE.VERSION,
      evidenceClass: BENCHMARK_RESOURCE_CAPACITY_SOURCE.EVIDENCE_CLASS,
      mappedSideId,
      protocolSideId,
      artifactReceipt: c3Evidence.artifactReceipt,
      preregistration: c3Evidence.preregistration,
      report: c3Evidence.report,
    },
  };
}

function sideEvidence(
  sideId,
  sideIndex,
  samples,
  calibration,
  rowCount,
  imageId,
  c3Evidence,
) {
  const databaseComponentId = `${sideId}-database`;
  const clientComponentId = `${sideId}-client`;
  const databaseObservation =
    observationFor(calibration, sideId, databaseComponentId);
  const clientObservation =
    observationFor(calibration, sideId, clientComponentId);
  const capacity = c3CapacityProjection(c3Evidence, sideIndex, sideId);
  const correct = samples.reduce(
    (total, sample) => total + sample.transactionsProcessed,
    0,
  );
  const startedAt = new Date(
    Math.min(
      databaseObservation.start.timestamp,
      clientObservation.start.timestamp,
    ),
  ).toISOString();
  const endedAt = new Date(
    Math.max(
      databaseObservation.end.timestamp,
      clientObservation.end.timestamp,
    ),
  ).toISOString();
  return {
    sideId,
    ...capacity,
    correctSloEligibleOperations: correct,
    startedAt,
    endedAt,
    semanticReceipt: {
      version: localText.BENCHMARK_RESOURCE_LIVE_SEMANTIC_RECEIPT_V1,
      sideId,
      correctOperations: correct,
      failedOperations: 0,
      durableRows: rowCount,
    },
    liveEngagement: {
      version: localText.BENCHMARK_RESOURCE_LIVE_ENGAGEMENT_V1,
      sideId,
      image: IMAGE,
      imageId,
      transport: localText.MANAGED_BRIDGE_PGBENCH_TO_POSTGRESQL,
      amplificationPolicy: localText.SEMANTIC_EVENTS_ABSENT_ZERO_ONLY,
      samples,
    },
    windowReceipt: {
      version: localText.BENCHMARK_RESOURCE_WINDOW_RECEIPT_V1,
      sideId,
      runId: RUN_ID,
      completed: true,
      startedAt,
      endedAt,
    },
    components: [
      inventoryComponent(
        databaseComponentId,
        BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
        BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
        databaseObservation,
        false,
      ),
      inventoryComponent(
        clientComponentId,
        BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
        BENCHMARK_RESOURCE_BILLING_TREATMENT.SYMMETRICALLY_EXCLUDED,
        clientObservation,
        true,
      ),
    ],
  };
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
  for (let index = state.databases.length - 1; index >= 0; index -= 1) {
    await removeIfPresent(provider, state.databases[index].containerId);
  }
  if (
    state.networkId &&
    await provider.getNetworkByName(NETWORK_NAME) !== null
  ) {
    await provider.removeNetwork(state.networkId);
  }
}

async function writeScenarioReport(detail) {
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    scenario: BENCHMARK_RESOURCE_SCENARIO.LIVE,
    producer: 'benchmark-whole-topology-resource-accounting-live',
    fidelity: 'directed-live-managed-postgresql-whole-topology',
    summary: {total: 1, passed: 1, failed: 0},
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {
      scenarios: [{
        scenario: BENCHMARK_RESOURCE_SCENARIO.LIVE,
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
    `${BENCHMARK_RESOURCE_SCENARIO.LIVE}-${stamp}.report.json`,
  );
  await writeFile(path, JSON.stringify(report, null, 2));
  return path;
}

async function replayInFreshProcess(rootDigest) {
  const script = resolve(
    'scripts/checks/replay-benchmark-resource-evidence.js',
  );
  const {stdout} = await execFileAsync(
    process.execPath,
    [
      script,
      resolve(ARTIFACT_DIRECTORY),
      rootDigest,
      localText.ALLOW_NON_MEASURING,
    ],
    {encoding: localText.UTF8},
  );
  return JSON.parse(stdout);
}

async function main() {
  const provider = new DockerProvider({
    socketPath: '/var/run/docker.sock',
  });
  const state = {networkId: null, databases: [], client: null};
  let session;
  let samples;
  let rowCounts;
  let imageId;
  const provenance = await collectBenchmarkResourceSourceProvenance();
  const revision = provenance.sourceRevision;
  const c3Evidence = await collectC3CapacityEvidence();
  try {
    const network = await provider.createNetwork(NETWORK_NAME, LABELS);
    state.networkId = network.id;
    for (let index = 0; index < SIDE_IDS.length; index += 1) {
      state.databases.push(
        await createPostgres(provider, SIDE_IDS[index], state.networkId),
      );
    }
    state.client = await createClient(provider, state.networkId);
    await prepareWorkload(provider, state.client, state.databases);
    const inspect = await provider.inspectContainer(
      state.databases[0].containerId,
    );
    imageId = inspect.Image;
    const observedComponents = [];
    for (let index = 0; index < state.databases.length; index += 1) {
      observedComponents.push({
        componentId: `${SIDE_IDS[index]}-database`,
        sideId: SIDE_IDS[index],
        containerId: state.databases[index].containerId,
        storagePath: DATABASE_STORAGE_PATH,
      });
      observedComponents.push({
        componentId: `${SIDE_IDS[index]}-client`,
        sideId: SIDE_IDS[index],
        containerId: state.client.containerId,
        storagePath: CLIENT_STORAGE_PATH,
      });
    }
    session = await beginBenchmarkResourceLiveObservation(provider, {
      runId: RUN_ID,
      networkId: state.networkId,
      networkName: NETWORK_NAME,
      sourceRevision: revision,
      components: observedComponents,
    });
    samples = await executePairedSamples(
      provider,
      state.client,
      state.databases,
    );
    rowCounts = [];
    for (let index = 0; index < state.databases.length; index += 1) {
      rowCounts.push(Number(await execPsql(
        provider,
        state.client.containerId,
        state.databases[index].ip,
        `SELECT count(*) FROM ${TABLE};`,
      )));
    }
    await captureBenchmarkResourceLiveObservation(session);
    await cleanup(provider, state);
  } catch (error) {
    await cleanup(provider, state);
    throw error;
  }
  const finalization =
    await finalizeBenchmarkResourceLiveObservation(session);
  const calibration =
    writeExternallyObservedBenchmarkResourceCalibration(
      finalization.receipt,
      finalization.authorization,
    );
  const producedAt = new Date().toISOString();
  const validUntil =
    new Date(Date.parse(producedAt) + 24 * 60 * 60 * 1000).toISOString();
  const sides = [];
  for (let index = 0; index < SIDE_IDS.length; index += 1) {
    sides.push(sideEvidence(
      SIDE_IDS[index],
      index,
      samples[index],
      calibration,
      rowCounts[index],
      imageId,
      c3Evidence,
    ));
  }
  const workloadManifest = {
    version: 'benchmark-resource-live-workload-v1',
    workload: 'pgbench_insert_and_indexed_point_count',
    repetitions: REPETITIONS,
    durationSeconds: DURATION_SECONDS,
    clients: CLIENTS,
    jobs: JOBS,
    capacitySource: BENCHMARK_RESOURCE_CAPACITY_SOURCE.EVIDENCE_CLASS,
  };
  const alternativeTopology = {
    version: 'benchmark-resource-live-topology-v1',
    image: IMAGE,
    imageId,
    databaseContainers: 2,
    sharedClientContainers: 1,
    network: 'managed_bridge',
    databaseStorage:
      `tmpfs:${DATABASE_STORAGE_PATH}:size=${DATABASE_STORAGE_BYTES}`,
    reservedIopsPerComponent: 0,
    reservedNetworkBytesPerSecondPerComponent: 0,
    components: topologyComponents(calibration),
  };
  const workloadOwner = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    workloadManifest,
  );
  const topologyOwner = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
    alternativeTopology,
  );
  const profileEnvelope = createScaleProfileEnvelope({
    profile: {id: SCALE_PROFILE_ID.DEVELOPMENT, version: 1},
    software: {
      revision,
      runtime: process.version,
      packageVersion: '0.1.0',
    },
    hardware: {
      provider: 'local-docker',
      region: BENCHMARK_RESOURCE_P0_PRICE_SHEET.region,
      instanceClass: 'development-host',
      cpuCount: CLIENTS,
      memoryBytes: 2 * 256 * 1024 * 1024,
      storageClass: 'tmpfs',
    },
    topology: {
      manifestDigest: topologyOwner.digest,
      nodeCount: 2,
      failureDomainCount: 1,
      tableCount: 1,
      partitionCount: 1,
      replicaCount: 1,
    },
    data: {
      manifestDigest: workloadOwner.digest,
      logicalBytes: rowCounts.reduce((sum, count) => sum + count, 0),
      physicalBytes: DATABASE_STORAGE_BYTES * 2,
      shape: 'pgbench-insert',
    },
    workload: {
      id: workloadManifest.workload,
      manifestDigest: workloadOwner.digest,
      duration: {
        warmupMs: 0,
        measuredMs: REPETITIONS * DURATION_SECONDS * 1_000,
      },
    },
  });
  const evidence = createBenchmarkResourceSingleCellPairedEvidence({
    matrixId: 'benchmark-resource-p0-live-matrix-v1',
    axes: [
      {id: 'profile', values: ['p0-local-docker']},
      {id: 'topology', values: ['isolated-postgresql-pair']},
    ],
    pairId: 'managed-postgresql-resource-accounting-pair-v1',
    runId: RUN_ID,
    sourceRevision: revision,
    producedAt,
    validUntil,
    workloadManifest,
    alternativeTopology,
    preregistration: {
      version: 'benchmark-resource-live-preregistration-v1',
      sideIds: SIDE_IDS,
      capacityProtocolReportDigest: c3Evidence.report.reportDigest,
      capacityProtocolPreregistrationDigest:
        c3Evidence.preregistration.manifestDigest,
      capacityEstimator:
        c3Evidence.preregistration.statistics.estimator,
      capacityInterval:
        c3Evidence.preregistration.statistics.interval,
      costInterval: 'point_projection',
      practicalThreshold: PRACTICAL_THRESHOLD,
    },
    inventoryId: 'benchmark-resource-p0-live-inventory-v1',
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    calibrationArtifact: calibration,
    profileEnvelope,
    sides,
    practicalThreshold: PRACTICAL_THRESHOLD,
  });
  const validation =
    validateBenchmarkResourceEvidenceRoot(evidence.receipt);
  if (!validation.valid || validation.claimEligible) {
    throw new Error(`live evidence root rejected: ${validation.reason}`);
  }
  const allArtifacts = [...evidence.artifacts, evidence.root];
  const persisted = await persistBenchmarkResourceArtifacts(
    resolve(ARTIFACT_DIRECTORY),
    allArtifacts,
  );
  const durableValidation = validateBenchmarkResourceEvidenceRoot({
    rootDigest: evidence.root.digest,
    resolver: createBenchmarkResourceDurableResolver(
      resolve(ARTIFACT_DIRECTORY),
    ),
  });
  if (!durableValidation.valid || durableValidation.claimEligible) {
    throw new Error(
      `durable evidence root rejected: ${durableValidation.reason}`,
    );
  }
  const freshValidation = await replayInFreshProcess(evidence.root.digest);
  if (!freshValidation.valid || freshValidation.claimEligible) {
    throw new Error(localText.FRESH_REPLAY_EXPECTED_VALID_NON_MEASURING);
  }
  const reportPath = await writeScenarioReport({
    runId: RUN_ID,
    sourceRevision: revision,
    sourceProvenance: provenance,
    capacityProtocolScenarioReport: c3Evidence.scenarioReportPath,
    capacityProtocolArtifactReceipt: c3Evidence.artifactReceipt,
    capacityProtocolReplayValid: true,
    comparativeClaimEligible: validation.claimEligible,
    evidenceRootDigest: evidence.root.digest,
    artifactManifestDigest:
      evidence.root.artifact.payload.artifactManifestDigest,
    artifactCount: persisted.length,
    liveCalibrationDigest: calibration.digest,
    priceSheetDigest: evidence.price.digest,
    capacityEffect: evidence.capacityEffect,
    costEffect: evidence.costEffect,
    sideCapacitySamples: sides.map((side) => side.capacitySamples),
    sideResourceWindowSamples: samples,
    correctSloEligibleOperations: sides.map(
      (side) => side.correctSloEligibleOperations,
    ),
    cleanupVerified: finalization.receipt.cleanupVerified,
    durableReplayValid: durableValidation.valid,
    freshProcessReplayValid: freshValidation.valid,
  });
  process.stdout.write(
    localText.BENCHMARK_WHOLE_TOPOLOGY_RESOURCE_ACCOUNTING_LIVE_PASS +
    `rootDigest: ${evidence.root.digest}\n` +
    `capacityRatio: ${evidence.capacityEffect.estimate}\n` +
    `costRatio: ${evidence.costEffect.estimate}\n` +
    `scenarioReport: ${reportPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    localText.BENCHMARK_WHOLE_TOPOLOGY_RESOURCE_ACCOUNTING_LIVE_FAIL +
    `${error.stack}\n`,
  );
  process.exitCode = 1;
});
