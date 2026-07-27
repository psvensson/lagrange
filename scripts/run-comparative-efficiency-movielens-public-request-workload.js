#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  replayEvidenceIndex,
  sha256,
  validateArtifactBindings,
  validateContentArtifacts,
  validateLiveObservation,
  writeContentArtifact,
  writeJsonArtifact,
} from '../examples/service-data-affinity/movielens-public-request-evidence-artifacts.js';
import {
  snapshotPlainData,
} from '../examples/service-data-affinity/evidence-exact-plain-data.js';
import {
  FAILURE_FIDELITY,
  FAILURE_OBSERVATION_NAME,
  replayFailureEvidenceIndex,
} from '../examples/service-data-affinity/movielens-public-request-failure-evidence.js';
import {
  MovielensPublicRequestLiveFailure,
  isMovielensPublicRequestLiveFailure,
  runMovielensPublicRequestWorkloadLive,
  unobservedWorkloadTeardown,
} from '../examples/service-data-affinity/run-movielens-public-request-workload.js';

const SCENARIO =
  'comparative-efficiency-movielens-public-request-workload';
const PRODUCER =
  'comparative-efficiency-movielens-public-request-live-runner';
const REPORT_DIRECTORY = 'test-output/reports';
const TEXT_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const MAXIMUM_POSTGRES_LOG_BYTES = 4 * 1_024 * 1_024;
const MAXIMUM_SOURCE_PATHS = 32;
const RETAINED_POSTGRES_LOG_COUNT = 3;
const EXCLUSIVE_CREATE_FLAG = 'wx';
const GIT_EXECUTABLE = 'git';
const LIVE_INTEGRATION_FIDELITY = 'live-integration';
const SOURCE_PATH_LIMIT_ERROR =
  'retained source path count exceeds the evidence cap';
const POSTGRES_LOG_EVIDENCE_ERROR =
  'bounded PostgreSQL log evidence is required';
const SOURCE_EXTENSION = Object.freeze({
  WAT: '.wat',
});
const EVIDENCE_MEDIA_TYPE = Object.freeze({
  COMPONENT: 'application/wasm',
  DATASET: 'text/tab-separated-values',
  JAVASCRIPT_SOURCE: 'text/javascript',
  WAT_SOURCE: 'text/x-webassembly-wat',
});
const RETAINED_ARTIFACT_NAME = Object.freeze({
  COMPONENT: 'movielens-component-executable',
  DATASET: 'movielens-input-bytes',
  SOURCE_STATE: 'source-state',
});
const EVIDENCE_KIND = Object.freeze({
  FAILURE: 'failure',
  SUCCESS: 'success',
});
const VERDICT = Object.freeze({
  FAIL: 'FAIL',
  PASS: 'PASS',
});
const SOURCE_PATHS = Object.freeze([
  'examples/request-binding-deployment/request-binding-example-contract.js',
  'examples/request-binding-deployment/request-binding-example-node.js',
  'examples/request-binding-deployment/run-request-binding-deployment.js',
  'examples/service-data-affinity/evidence-exact-plain-data.js',
  'examples/service-data-affinity/movie-ranking.js',
  'examples/service-data-affinity/movielens-public-grouped-reduce-component.wat',
  'examples/service-data-affinity/movielens-public-request-evidence-artifacts.js',
  'examples/service-data-affinity/movielens-public-request-evidence-schema.js',
  'examples/service-data-affinity/movielens-public-request-failure-evidence.js',
  'examples/service-data-affinity/movielens-public-request-live-observation-validator.js',
  'examples/service-data-affinity/movielens-public-request-workload-adapter.js',
  'examples/service-data-affinity/movielens-public-request-workload-contract.js',
  'examples/service-data-affinity/movielens-public-request-workload-dataset.js',
  'examples/service-data-affinity/run-movielens-public-request-workload.js',
  'examples/service-data-affinity/run-postgres-baseline.js',
  'scripts/run-comparative-efficiency-movielens-public-request-workload.js',
  'src/runtime/request-cell-table-read-index.js',
  'src/runtime/wasi-component-cell-runtime.js',
  'src/runtime/wasi-component-cell-worker.js',
  'src/runtime/wasm-component-driver.js',
]);
const EVIDENCE_ARTIFACT_NAMES = Object.freeze([
  'movielens-input-bytes',
  'movielens-component-executable',
  'invocation-journal',
  'manifest-and-binding',
  'postgres-logs',
  'postgres-query',
  'public-request-bytes',
  'public-responses',
  'teardown-receipt',
  ...SOURCE_PATHS.map((sourcePath) => `source:${sourcePath}`),
  'source-state',
  'raw-live-observation',
]);
const FAILURE_EVIDENCE_ARTIFACT_NAMES = Object.freeze([
  'teardown-receipt',
  ...SOURCE_PATHS.map((sourcePath) => `source:${sourcePath}`),
  'source-state',
  FAILURE_OBSERVATION_NAME,
]);

function writeExclusiveJson(filePath, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(filePath, bytes, {
    encoding: TEXT_ENCODING,
    flag: EXCLUSIVE_CREATE_FLAG,
  });
  return `sha256:${createHash(HASH_ALGORITHM)
    .update(bytes)
    .digest(HASH_ENCODING)}`;
}

function scenarioValidationPassed(validation, failure) {
  if (!validation || failure) return false;
  return Boolean(
    validation.observation &&
    validation.observation.passed === true &&
    validation.bindings &&
    validation.bindings.passed === true &&
    validation.artifacts &&
    validation.artifacts.passed === true &&
    validation.replay &&
    validation.replay.passed === true,
  );
}

function scenarioWitness(live) {
  if (!live) return null;
  return {
    authenticatedHttp:
      live.operationBoundary.authenticatedHttp,
    binding: live.deployment.binding.name,
    dataset: live.dataset,
    durability: live.durability,
    installedPackageId: live.deployment.packageId,
    oracle: {
      alternative: live.workloadManifest.alternative,
      passed: live.oracle.passed,
      version: live.oracle.version,
    },
    publicOperation: {
      method: live.operationBoundary.method,
      path: live.operationBoundary.path,
      status: live.operationBoundary.status,
    },
    readyCell: live.deployment.readyCell,
    repeatedOperation: live.repeatedOperation,
    journalReplayPreserved:
      live.operationBoundary.journalReplayPreserved,
    responseWitness: live.operationBoundary.componentHeader,
    runtime: live.deployment.manifest.runtime.kind,
    teardown: live.teardown,
  };
}

function buildScenarioReport(
  timestamp,
  rawArtifact,
  live,
  validation,
  failure,
) {
  const passed = scenarioValidationPassed(validation, failure);
  return {
    fidelity: LIVE_INTEGRATION_FIDELITY,
    optimizationSummary: {
      totalPriorityItems: passed ? 0 : 1,
    },
    producer: PRODUCER,
    scenario: SCENARIO,
    standardSummary: {
      scenarios: [{
        current: {
          passed,
          verdict: passed ? VERDICT.PASS : VERDICT.FAIL,
        },
        detail: {
          failure,
          rawArtifact,
          validation,
          witness: scenarioWitness(live),
        },
        passed,
        scenario: SCENARIO,
      }],
    },
    summary: {
      failed: Number(!passed),
      passed: Number(passed),
      total: 1,
    },
    timestamp,
  };
}

function gitValue(...args) {
  return execFileSync(GIT_EXECUTABLE, args, {
    encoding: TEXT_ENCODING,
  }).trim();
}

async function retainSourceState(options = {}) {
  if (SOURCE_PATHS.length > MAXIMUM_SOURCE_PATHS) {
    throw new RangeError(SOURCE_PATH_LIMIT_ERROR);
  }
  const readGitValue = options.gitValue || gitValue;
  const sources = [];
  const descriptors = [];
  for (const sourcePath of SOURCE_PATHS) {
    const bytes = await readFile(sourcePath);
    sources.push({
      byteLength: bytes.length,
      digest: sha256(bytes),
      path: sourcePath,
    });
    descriptors.push(await writeContentArtifact({
      bytes,
      mediaType: sourcePath.endsWith(SOURCE_EXTENSION.WAT) ?
        EVIDENCE_MEDIA_TYPE.WAT_SOURCE :
        EVIDENCE_MEDIA_TYPE.JAVASCRIPT_SOURCE,
      name: `source:${sourcePath}`,
    }));
  }
  const sourceState = {
    gitHead: readGitValue('rev-parse', 'HEAD'),
    gitHeadTree: readGitValue('rev-parse', 'HEAD^{tree}'),
    sourceSetDigest: sha256(Buffer.from(JSON.stringify(sources))),
    sources,
    worktreeStatus: readGitValue('status', '--porcelain=v1'),
  };
  descriptors.push(await writeJsonArtifact({
    name: RETAINED_ARTIFACT_NAME.SOURCE_STATE,
    value: sourceState,
  }));
  return {descriptors, sourceState};
}

async function retainLiveEvidence(live, retained, timestamp) {
  const descriptors = [];
  const postgresLogEntries =
    Object.entries(retained?.postgresLogs || {});
  if (
    postgresLogEntries.length !== RETAINED_POSTGRES_LOG_COUNT ||
    postgresLogEntries.some(
      ([containerId, logs]) =>
        typeof containerId !== 'string' ||
        containerId.length === 0 ||
        typeof logs !== 'string' ||
        Buffer.byteLength(logs, TEXT_ENCODING) >
          MAXIMUM_POSTGRES_LOG_BYTES,
    )
  ) {
    throw new Error(POSTGRES_LOG_EVIDENCE_ERROR);
  }
  descriptors.push(await writeContentArtifact({
    bytes: retained.datasetBytes,
    mediaType: EVIDENCE_MEDIA_TYPE.DATASET,
    name: RETAINED_ARTIFACT_NAME.DATASET,
  }));
  descriptors.push(await writeContentArtifact({
    bytes: retained.executableBytes,
    mediaType: EVIDENCE_MEDIA_TYPE.COMPONENT,
    name: RETAINED_ARTIFACT_NAME.COMPONENT,
  }));
  for (const [name, value] of Object.entries({
    'invocation-journal': live.journalEvidence,
    'manifest-and-binding': {
      binding: live.deployment.binding,
      manifest: live.deployment.manifest,
    },
    'postgres-logs': retained.postgresLogs,
    'postgres-query': {
      imageId: live.alternative.imageId,
      imageInspection: live.alternative.imageInspection,
      imageRepoDigests: live.alternative.imageRepoDigests,
      measuredContainerImages:
        live.alternative.measuredContainerImages,
      queryRows: live.alternative.topMovies,
      sql: live.alternative.querySql,
      version: live.alternative.postgresVersion,
      versionSql: live.alternative.postgresVersionSql,
    },
    'public-request-bytes': live.requestEvidence,
    'public-responses': live.responseEvidence,
    'teardown-receipt': live.teardown,
  })) {
    descriptors.push(await writeJsonArtifact({name, value}));
  }
  const sourceState = await retainSourceState();
  descriptors.push(...sourceState.descriptors);
  const observation = {
    fidelity: 'live-integration-raw',
    observation: live,
    producer: PRODUCER,
    scenario: SCENARIO,
    sourceState: sourceState.sourceState,
    timestamp,
  };
  const observationArtifact = await writeJsonArtifact({
    name: 'raw-live-observation',
    value: observation,
  });
  descriptors.push(observationArtifact);
  const validation =
    await validateContentArtifacts(descriptors);
  return {
    descriptors,
    observationArtifact,
    sourceState: sourceState.sourceState,
    validation,
  };
}

async function retainFailureEvidence(error, timestamp, options = {}) {
  const descriptors = [
    await writeJsonArtifact({
      name: 'teardown-receipt',
      value: error.teardown,
    }),
  ];
  const sourceState = await retainSourceState(options);
  descriptors.push(...sourceState.descriptors);
  const observation = {
    failure: error.failure,
    fidelity: FAILURE_FIDELITY,
    producer: PRODUCER,
    scenario: SCENARIO,
    sourceState: sourceState.sourceState,
    teardown: error.teardown,
    timestamp,
  };
  const observationArtifact = await writeJsonArtifact({
    name: FAILURE_OBSERVATION_NAME,
    value: observation,
  });
  descriptors.push(observationArtifact);
  return {
    descriptors,
    observationArtifact,
    sourceState: sourceState.sourceState,
    validation: await validateContentArtifacts(descriptors),
  };
}

function errorText(error) {
  const normalized =
    isMovielensPublicRequestLiveFailure(error) ?
      error :
      new MovielensPublicRequestLiveFailure(error);
  return normalized.failure.stack;
}

async function collectLiveEvidence(timestamp, options = {}) {
  const runLive =
    options.runLive || runMovielensPublicRequestWorkloadLive;
  let live = null;
  try {
    const envelope =
      await runLive({print: false});
    live = envelope.observation;
    const retained = await retainLiveEvidence(
      live,
      envelope.retained,
      timestamp,
    );
    const evidenceLive = snapshotPlainData(live);
    return {
      evidenceKind: EVIDENCE_KIND.SUCCESS,
      failure: null,
      live,
      retained,
      validation: {
        artifacts: retained.validation,
        bindings: validateArtifactBindings(
          evidenceLive,
          retained.descriptors,
          EVIDENCE_ARTIFACT_NAMES,
          retained.sourceState,
        ),
        observation: validateLiveObservation(evidenceLive),
      },
    };
  } catch (error) {
    const liveFailure =
      isMovielensPublicRequestLiveFailure(error) ?
        error :
        new MovielensPublicRequestLiveFailure(
          error,
          unobservedWorkloadTeardown(),
        );
    const retained =
      await retainFailureEvidence(liveFailure, timestamp, options);
    return {
      evidenceKind: EVIDENCE_KIND.FAILURE,
      failure: errorText(liveFailure),
      live: null,
      retained,
      validation: {
        artifacts: retained.validation,
      },
    };
  }
}

function evidenceIndexValue(retained) {
  if (!retained) {
    return {
      artifacts: [],
      observationArtifact: null,
      sourceState: null,
    };
  }
  return {
    artifacts: retained.descriptors,
    observationArtifact: retained.observationArtifact,
    sourceState: retained.sourceState,
  };
}

async function replayRetainedEvidence(
  rawArtifact,
  validation,
  priorFailure,
  evidenceKind,
) {
  try {
    const replay = evidenceKind === EVIDENCE_KIND.FAILURE ?
      await replayFailureEvidenceIndex(rawArtifact, {
        expectedNames: FAILURE_EVIDENCE_ARTIFACT_NAMES,
      }) :
      await replayEvidenceIndex(rawArtifact, {
        expectedNames: EVIDENCE_ARTIFACT_NAMES,
      });
    return {
      failure: priorFailure,
      validation: {...validation, replay},
    };
  } catch (error) {
    const replayFailure = errorText(error);
    return {
      failure: priorFailure || replayFailure,
      validation: {
        ...validation,
        replay: {
          failure: replayFailure,
          passed: false,
        },
      },
    };
  }
}

function writeReport(timestamp, rawArtifact, evidence) {
  const fileStamp = timestamp.replace(/[:.]/gu, '-');
  const report = buildScenarioReport(
    timestamp,
    rawArtifact,
    evidence.live,
    evidence.validation,
    evidence.failure,
  );
  const reportPath = path.join(
    REPORT_DIRECTORY,
    `${SCENARIO}-${fileStamp}.report.json`,
  );
  writeExclusiveJson(reportPath, report);
  return {report, reportPath};
}

function printResult(rawArtifact, report, reportPath) {
  const passed = report.summary.failed === 0;
  process.stdout.write(
    `${SCENARIO}: ${passed ? VERDICT.PASS : VERDICT.FAIL} — ` +
    `${report.summary.passed}/${report.summary.total} live gates green\n` +
    `raw: ${rawArtifact.path} (${rawArtifact.digest})\n` +
    `report: ${reportPath}\n`,
  );
  process.exitCode = passed ? 0 : 1;
}

async function runScenario() {
  const timestamp = new Date().toISOString();
  mkdirSync(REPORT_DIRECTORY, {recursive: true});
  const collected = await collectLiveEvidence(timestamp);
  const raw = evidenceIndexValue(collected.retained);
  const rawDescriptor = await writeJsonArtifact({
    name: 'evidence-index',
    value: raw,
  });
  const rawArtifact = {
    digest: rawDescriptor.digest,
    path: rawDescriptor.path,
  };
  const replayed = await replayRetainedEvidence(
    rawArtifact,
    collected.validation,
    collected.failure,
    collected.evidenceKind,
  );
  const evidence = {
    failure: replayed.failure,
    live: collected.live,
    validation: replayed.validation,
  };
  const {report, reportPath} =
    writeReport(timestamp, rawArtifact, evidence);
  printResult(rawArtifact, report, reportPath);
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  await runScenario();
}

export {
  collectLiveEvidence,
  evidenceIndexValue,
  replayRetainedEvidence,
  retainFailureEvidence,
  runScenario,
};
