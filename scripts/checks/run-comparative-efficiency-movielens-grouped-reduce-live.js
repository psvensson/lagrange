#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path, {resolve} from 'node:path';
import {promisify} from 'node:util';

import {
  createMovielensGroupedReduceMatrixDatasets,
  selectMovielensGroupedReduceMatrixDataset,
} from
  '../../examples/service-data-affinity/movielens-grouped-reduce-matrix-dataset.js';
import {
  sha256,
  validateContentArtifacts,
  writeContentArtifact,
  writeJsonArtifact,
} from
  '../../examples/service-data-affinity/movielens-public-request-evidence-artifacts.js';
import {
  runMovielensPublicRequestWorkloadLive,
} from
  '../../examples/service-data-affinity/run-movielens-public-request-workload.js';
import {
  collectBenchmarkResourceSourceProvenance,
} from './benchmark-resource-source-provenance.js';
import {
  digestBenchmarkSemanticData,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';
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
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from
  '../../test/distributed/harness/benchmark-resource-price-sheet-p0-constants.js';
import {
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
  createComparativeMovielensGroupedReduceEvidence,
  inspectComparativeMovielensGroupedReduceEvidence,
} from
  '../../test/distributed/harness/comparative-efficiency-movielens-grouped-reduce.js';

const execFileAsync = promisify(execFile);
const arrayPush = Function.call.bind(Array.prototype.push);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringReplace = Function.call.bind(String.prototype.replace);
const ARTIFACT_DIRECTORY =
  'test-output/comparative-movielens-grouped-reduce-artifacts';
const CONTENT_DIRECTORY =
  'test-output/comparative-movielens-grouped-reduce-content/sha256';
const REPORT_DIRECTORY = 'test-output/reports';
const LAGRANGE = 'lagrange';
const POSTGRESQL = 'postgresql';
const SOURCE_PATHS = Object.freeze([
  'examples/service-data-affinity/' +
    'movielens-grouped-reduce-matrix-dataset.js',
  'examples/service-data-affinity/' +
    'run-movielens-public-request-workload.js',
  'examples/service-data-affinity/run-postgres-baseline.js',
  'scripts/checks/benchmark-resource-source-provenance.js',
  'scripts/checks/' +
    'run-comparative-efficiency-movielens-grouped-reduce-guard.js',
  'scripts/checks/' +
    'run-comparative-efficiency-movielens-grouped-reduce-live.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-movielens-grouped-reduce.test.js',
  'test/distributed/harness/' +
    'comparative-efficiency-movielens-grouped-reduce-constants.js',
  'test/distributed/harness/' +
    'comparative-efficiency-movielens-grouped-reduce.js',
]);
const REASON_CODES = Object.freeze([
  COMPARATIVE_MOVIELENS_GROUPED_REDUCE_REASON,
  'matrix_variant_capacity_not_engaged',
  'whole_topology_resource_window_absent',
  'comparative_effects_absent',
]);
const CONTENT_NAMES = Object.freeze([
  'movielens-input-bytes',
  'movielens-component-executable',
  'movielens-component-source',
  'raw-live-observation',
  'postgres-logs',
  'source-state',
  'evidence-index',
]);
const localText = Object.freeze({
  CONTENT_SOURCE_STATE: 'source-state',
  ENOENT: 'ENOENT',
  EXCLUSIVE_CREATE: 'wx',
  LIVE_EVIDENCE_VERSION:
    'comparative-movielens-grouped-reduce-live-evidence-v1',
  INPUT_TYPE_MODULE: '--input-type=module',
  EVAL: '--eval',
  UTF8: 'utf8',
  LAGRANGE_NODE: 'lagrange-node',
  POSTGRESQL_DATABASE: 'postgresql-database',
  POSTGRESQL_CLIENT: 'postgresql-client',
  RESOURCE_WINDOW_ABSENT: 'whole_topology_resource_window_absent',
  PASS: 'comparative-efficiency-movielens-grouped-reduce-live: PASS\n',
  FAIL: 'comparative-efficiency-movielens-grouped-reduce-live: FAIL\n',
  CLAIM:
    'claim: no comparative capacity or cost claim; all 8 cells are ' +
    'explicitly non-measuring because the candidate capacity adapter ' +
    'was not engaged\n',
  DURABLE_REJECTED: 'durable grouped-reduce evidence rejected: ',
  FRESH_REJECTED: 'fresh grouped-reduce evidence rejected: ',
});

function inventoryComponent(componentId, role) {
  return {
    componentId,
    role,
    billingTreatment:
      BENCHMARK_RESOURCE_BILLING_TREATMENT.SYMMETRICALLY_EXCLUDED,
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
    exclusionReason: localText.RESOURCE_WINDOW_ABSENT,
  };
}

async function requireAbsent(directory) {
  try {
    await access(directory);
  } catch (error) {
    if (error.code === localText.ENOENT) return true;
    throw error;
  }
  throw new Error(`temporary matrix dataset directory remains: ${directory}`);
}

async function sourceState(provenance) {
  const sources = [];
  for (let index = 0; index < SOURCE_PATHS.length; index += 1) {
    const sourcePath = SOURCE_PATHS[index];
    const bytes = await readFile(sourcePath);
    arrayPush(sources, {
      byteLength: bytes.length,
      digest: sha256(bytes),
      path: sourcePath,
    });
  }
  const value = {
    baseCommit: provenance.baseCommit,
    changeFingerprint: provenance.changeFingerprint,
    sourceRevision: provenance.sourceRevision,
    sourceSetDigest: digestBenchmarkSemanticData(sources),
    sources,
  };
  return writeJsonArtifact({
    name: localText.CONTENT_SOURCE_STATE,
    root: resolve(CONTENT_DIRECTORY),
    value,
  });
}

async function validateContentInFreshProcess(descriptors) {
  const validatorUrl = new URL(
    '../../examples/service-data-affinity/' +
      'movielens-public-request-evidence-artifacts.js',
    import.meta.url,
  ).href;
  const source =
    'import {validateContentArtifacts as validate} from ' +
      `${jsonStringify(validatorUrl)};` +
    'const descriptors=JSON.parse(process.argv[1]);' +
    `const result=await validate(descriptors,{root:${
      jsonStringify(resolve(CONTENT_DIRECTORY))
    }});` +
    'process.stdout.write(JSON.stringify(result));';
  const {stdout} = await execFileAsync(
    process.execPath,
    [
      localText.INPUT_TYPE_MODULE,
      localText.EVAL,
      source,
      jsonStringify(descriptors),
    ],
    {encoding: localText.UTF8},
  );
  return jsonParse(stdout);
}

async function retainCellContent(
  live,
  retained,
  cell,
  index,
  retainedSourceState,
  sourceRevision,
) {
  const root = resolve(CONTENT_DIRECTORY);
  const descriptors = [
    await writeContentArtifact({
      bytes: retained.datasetBytes,
      mediaType: 'text/tab-separated-values',
      name: CONTENT_NAMES[0],
      root,
    }),
    await writeContentArtifact({
      bytes: retained.executableBytes,
      mediaType: 'application/wasm',
      name: CONTENT_NAMES[1],
      root,
    }),
    await writeContentArtifact({
      bytes: retained.componentSourceBytes,
      mediaType: 'text/x-webassembly-wat',
      name: CONTENT_NAMES[2],
      root,
    }),
    await writeJsonArtifact({
      name: CONTENT_NAMES[3],
      root,
      value: {
        cell,
        matrixCellIndex: index,
        observation: live,
        scenario: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
        sourceRevision,
      },
    }),
    await writeJsonArtifact({
      name: CONTENT_NAMES[4],
      root,
      value: retained.postgresLogs,
    }),
    retainedSourceState,
  ];
  const initialValidation = await validateContentArtifacts(
    descriptors,
    {root},
  );
  if (!initialValidation.passed) {
    throw new Error(`cell ${index} content validation failed`);
  }
  const indexDescriptor = await writeJsonArtifact({
    name: CONTENT_NAMES[6],
    root,
    value: {
      artifacts: descriptors,
      cell,
      matrixCellIndex: index,
      scenario: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
      sourceRevision,
    },
  });
  arrayPush(descriptors, indexDescriptor);
  const validation = await validateContentArtifacts(descriptors, {root});
  const replay = await validateContentArtifacts(descriptors, {root});
  const freshReplay = await validateContentInFreshProcess(descriptors);
  if (
    !validation.passed ||
    !replay.passed ||
    !freshReplay.passed
  ) {
    throw new Error(`cell ${index} retained replay failed`);
  }
  return {
    artifacts: descriptors,
    indexDigest: indexDescriptor.digest,
    replayPassed: true,
    validationPassed: true,
  };
}

function projectLiveEvidence(live, cell, index, content) {
  const expectedDigest = digestBenchmarkSemanticData(live.oracle.expected);
  const observedDigest = digestBenchmarkSemanticData(live.oracle.observed);
  const removedPostgresContainers =
    live.teardown.postgres.removedContainerIds;
  return {
    version: localText.LIVE_EVIDENCE_VERSION,
    matrixCellIndex: index,
    dimensions: {
      datasetSize: cell.datasetSize,
      skew: cell.skew,
      topology: cell.topology,
    },
    dataset: {
      cardinality: live.dataset.cardinality,
      digest: live.dataset.digest,
      sizeBytes: live.dataset.sizeBytes,
      source: live.dataset.source,
      skew: cell.skew,
    },
    operation: {
      authenticatedHttp: live.operationBoundary.authenticatedHttp,
      method: live.operationBoundary.method,
      path: live.operationBoundary.path,
      principal: live.operationBoundary.principal,
      status: live.operationBoundary.status,
    },
    runtime: {
      bindingName: live.deployment.binding.name,
      bindingVersionId: live.deployment.readyCell.bindingVersionId,
      componentSourceDigest: content.artifacts[2].digest,
      executableDigest: live.artifact.executableDigest,
      kind: live.deployment.manifest.runtime.kind,
      packageId: live.deployment.packageId,
    },
    oracle: {
      expectedDigest,
      observedDigest,
      passed: live.oracle.passed,
      rankCount: live.oracle.expected.length,
    },
    alternative: {
      engine: live.alternative.engine,
      imageId: live.alternative.imageId,
      inputDigest: live.alternative.inputDigest,
      postgresVersion: live.alternative.postgresVersion,
      postgresVersionSql: live.alternative.postgresVersionSql,
      querySqlDigest: sha256(
        Buffer.from(live.alternative.querySql, localText.UTF8),
      ),
      replicaCount: live.alternative.replicationState.replicaCount,
      replicationFactor: live.alternative.replicationFactor,
      replicationReady: live.alternative.replicationState.ready,
      returnedAggregateRows: live.alternative.returnedAggregateRows,
      totalRows: live.alternative.totalRows,
    },
    teardown: {
      cellAbsent: live.teardown.cellAbsent,
      nodeStopped: live.teardown.nodeStopped,
      postgresContainersAbsent:
        live.teardown.postgres.containersAbsent,
      postgresNetworkAbsent: live.teardown.postgres.networkAbsent,
      removedPostgresContainerCount: removedPostgresContainers.length,
      temporaryDirectoryAbsent:
        live.teardown.temporaryDirectoryAbsent,
    },
    content,
  };
}

async function executeMatrix(
  variants,
  retainedSourceState,
  sourceRevision,
) {
  const attempts = [];
  const witnesses = [];
  for (let index = 0;
    index < COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS[index];
    const dataset = selectMovielensGroupedReduceMatrixDataset(
      variants,
      cell.datasetSize,
      cell.skew,
    );
    process.stdout.write(
      `cell ${index + 1}/${
        COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length
      }: ${cell.datasetSize}/${cell.skew}/${cell.topology}\n`,
    );
    const envelope = await runMovielensPublicRequestWorkloadLive({
      componentSourcePath: dataset.componentSourcePath,
      datasetIdentity: {
        cardinality: dataset.cardinality,
        digest: dataset.digest,
        source: dataset.source,
      },
      print: false,
      ratingsPath: dataset.path,
      replicationFactor: cell.replicationFactor,
    });
    const content = await retainCellContent(
      envelope.observation,
      envelope.retained,
      cell,
      index,
      retainedSourceState,
      sourceRevision,
    );
    const liveEvidence = projectLiveEvidence(
      envelope.observation,
      cell,
      index,
      content,
    );
    arrayPush(attempts, {
      matrixCellIndex: index,
      runId:
        `comparative-movielens-grouped-reduce-${index}-${Date.now()}`,
      candidateEngaged: false,
      alternativeEngaged: true,
      reasonCodes: REASON_CODES,
      liveEvidence,
    });
    arrayPush(witnesses, {
      matrixCellIndex: index,
      dataset: liveEvidence.dataset,
      topology: liveEvidence.dimensions.topology,
      replicationFactor: liveEvidence.alternative.replicationFactor,
      oracleDigest: liveEvidence.oracle.observedDigest,
      contentIndexDigest: liveEvidence.content.indexDigest,
      teardown: liveEvidence.teardown,
    });
  }
  return {attempts, witnesses};
}

async function replayEvidenceInFreshProcess(rootDigest) {
  const inspectorUrl = new URL(
    '../../test/distributed/harness/' +
      'comparative-efficiency-movielens-grouped-reduce.js',
    import.meta.url,
  ).href;
  const resolverUrl = new URL(
    '../../test/distributed/harness/' +
      'benchmark-resource-durable-resolver.js',
    import.meta.url,
  ).href;
  const source =
    'import {inspectComparativeMovielensGroupedReduceEvidence as inspect} ' +
      `from ${jsonStringify(inspectorUrl)};` +
    'import {createBenchmarkResourceDurableResolver as resolver} ' +
      `from ${jsonStringify(resolverUrl)};` +
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
    scenario: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
    producer: 'comparative-efficiency-movielens-grouped-reduce-live',
    fidelity: 'live-public-http-matrix-with-retained-raw-evidence',
    summary: {total: 1, passed: 1, failed: 0},
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {
      scenarios: [{
        scenario: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO,
        passed: true,
        current: {passed: true, verdict: 'PASS'},
        detail,
      }],
    },
  };
  await mkdir(REPORT_DIRECTORY, {recursive: true});
  const stamp = stringReplace(timestamp, /[:.]/gu, '-');
  const reportPath = resolve(
    REPORT_DIRECTORY,
    `${COMPARATIVE_MOVIELENS_GROUPED_REDUCE_SCENARIO}-${
      stamp
    }.report.json`,
  );
  await writeFile(
    reportPath,
    jsonStringify(report, null, 2),
    {flag: localText.EXCLUSIVE_CREATE},
  );
  return reportPath;
}

async function main() {
  const provenance =
    await collectBenchmarkResourceSourceProvenance(SOURCE_PATHS);
  const retainedSourceState = await sourceState(provenance);
  const datasetDirectory = await mkdtemp(
    path.join(tmpdir(), 'lagrange-movielens-grouped-reduce-matrix-'),
  );
  let executed;
  try {
    const variants =
      await createMovielensGroupedReduceMatrixDatasets(datasetDirectory);
    executed = await executeMatrix(
      variants,
      retainedSourceState,
      provenance.sourceRevision,
    );
  } finally {
    await rm(datasetDirectory, {force: true, recursive: true});
  }
  const datasetDirectoryRemoved = await requireAbsent(datasetDirectory);
  const producedAt = new Date().toISOString();
  const validUntil =
    new Date(Date.parse(producedAt) + 30 * 24 * 60 * 60 * 1_000)
      .toISOString();
  const evidence = createComparativeMovielensGroupedReduceEvidence({
    matrixId: 'comparative-movielens-grouped-reduce-p0-v1',
    pairId: 'lagrange-postgresql-movielens-grouped-reduce-v1',
    sideIds: [LAGRANGE, POSTGRESQL],
    sourceRevision: provenance.sourceRevision,
    producedAt,
    validUntil,
    inventoryId: 'comparative-movielens-grouped-reduce-inventory-v1',
    inventorySides: [
      {
        sideId: LAGRANGE,
        components: [
          inventoryComponent(
            localText.LAGRANGE_NODE,
            BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
          ),
        ],
      },
      {
        sideId: POSTGRESQL,
        components: [
          inventoryComponent(
            localText.POSTGRESQL_DATABASE,
            BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
          ),
          inventoryComponent(
            localText.POSTGRESQL_CLIENT,
            BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
          ),
        ],
      },
    ],
    priceSheet: BENCHMARK_RESOURCE_P0_PRICE_SHEET,
    attempts: executed.attempts,
  });
  const inspection =
    inspectComparativeMovielensGroupedReduceEvidence(evidence.receipt);
  if (!inspection.valid || !inspection.complete) {
    throw new Error(`grouped-reduce evidence rejected: ${inspection.reason}`);
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
  const durableInspection =
    inspectComparativeMovielensGroupedReduceEvidence({
      rootDigest: evidence.root.digest,
      resolver: createBenchmarkResourceDurableResolver(
        resolve(ARTIFACT_DIRECTORY),
      ),
    });
  if (!durableInspection.valid || !durableInspection.complete) {
    throw new Error(
      localText.DURABLE_REJECTED + durableInspection.reason,
    );
  }
  const freshInspection =
    await replayEvidenceInFreshProcess(evidence.root.digest);
  if (!freshInspection.valid || !freshInspection.complete) {
    throw new Error(localText.FRESH_REJECTED + freshInspection.reason);
  }
  const reportPath = await writeScenarioReport({
    sourceRevision: provenance.sourceRevision,
    sourceProvenance: provenance,
    matrixId: inspection.matrixId,
    matrixDigest: inspection.matrixDigest,
    evidenceRootDigest: inspection.rootDigest,
    axes: COMPARATIVE_MOVIELENS_GROUPED_REDUCE_AXES,
    fullMatrixComplete: true,
    matrixCellCount:
      COMPARATIVE_MOVIELENS_GROUPED_REDUCE_CELLS.length,
    outcomeNeutral: true,
    comparativeClaimEligible: false,
    claimDisposition: inspection.claimDisposition,
    measuringCellCount: inspection.measuringCellCount,
    nonMeasuringCellCount: inspection.nonMeasuringCellCount,
    publicPathPassCount: inspection.publicPathPassCount,
    rawReplayPassCount: inspection.rawReplayPassCount,
    cellWitnesses: executed.witnesses,
    artifactCount: persisted.length,
    datasetDirectoryRemoved,
    durableReplayValid: durableInspection.valid,
    freshProcessReplayValid: freshInspection.valid,
  });
  process.stdout.write(
    localText.PASS +
    localText.CLAIM +
    `rootDigest: ${evidence.root.digest}\n` +
    `scenarioReport: ${reportPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    localText.FAIL +
      `${error.stack}\n`,
  );
  process.exitCode = 1;
});
