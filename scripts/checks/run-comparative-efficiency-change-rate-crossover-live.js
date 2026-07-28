#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {
  COMPARATIVE_POSTGRES_IMAGE,
  COMPARATIVE_POSTGRES_PRICE_SHEET,
  comparativePostgresInventorySides,
  startComparativePostgresLiveRun,
} from './comparative-efficiency-postgres-nonmeasuring-live.js';
import {
  createBenchmarkResourceDurableResolver,
  persistBenchmarkResourceArtifacts,
} from
  '../../test/distributed/harness/benchmark-resource-durable-resolver.js';
import {
  buildComparativeChangeRateCrossoverPolicyWitness,
} from
  '../../test/distributed/harness/comparative-efficiency-change-rate-crossover-policy-witness.js';
import {
  COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_ORACLE,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
  COMPARATIVE_CHANGE_RATE_CROSSOVER_SCENARIO,
  comparativeChangeRateCrossoverExpectedResult,
  comparativeChangeRateCrossoverSql,
  createComparativeChangeRateCrossoverEvidence,
  inspectComparativeChangeRateCrossoverEvidence,
} from
  '../../test/distributed/harness/comparative-efficiency-change-rate-crossover.js';
import {
  evaluateComparativeChangeRateCrossoverOracle,
} from
  '../../test/distributed/harness/comparative-efficiency-change-rate-crossover-admission.js';

const execFileAsync = promisify(execFile);
const arrayPush = Function.call.bind(Array.prototype.push);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringReplace = Function.call.bind(String.prototype.replace);
const PASSWORD = 'change-rate-crossover-live';
const ARTIFACT_DIRECTORY =
  'test-output/comparative-change-rate-crossover-artifacts';
const REPORT_DIRECTORY = 'test-output/reports';
const RUN_ID =
  `comparative-change-rate-crossover-${process.pid}-${Date.now()}`;
const NETWORK_NAME = `${RUN_ID}-network`;
const LABELS = Object.freeze({
  'lagrange.proof.run': RUN_ID,
  'lagrange.proof.scenario': COMPARATIVE_CHANGE_RATE_CROSSOVER_SCENARIO,
});
const SOURCE_PATHS = Object.freeze([
  'scripts/checks/benchmark-resource-source-provenance.js',
  'scripts/checks/' +
    'comparative-efficiency-postgres-nonmeasuring-live-constants.js',
  'scripts/checks/comparative-efficiency-postgres-nonmeasuring-live.js',
  'scripts/checks/run-comparative-efficiency-request-enrichment-live.js',
  'scripts/checks/run-comparative-efficiency-change-rate-crossover-guard.js',
  'scripts/checks/run-comparative-efficiency-change-rate-crossover-live.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-negative-controls.test.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-request-enrichment.test.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-change-rate-crossover.test.js',
  'test/distributed/harness/__tests__/' +
    'comparative-efficiency-postgres-nonmeasuring-test-fixture.js',
  'test/distributed/harness/comparative-efficiency-negative-controls.js',
  'test/distributed/harness/' +
    'comparative-efficiency-postgres-nonmeasuring-admission.js',
  'test/distributed/harness/' +
    'comparative-efficiency-postgres-nonmeasuring-evidence.js',
  'test/distributed/harness/' +
    'comparative-efficiency-request-enrichment-admission.js',
  'test/distributed/harness/comparative-efficiency-request-enrichment.js',
  'test/distributed/harness/' +
    'comparative-efficiency-change-rate-crossover-admission.js',
  'test/distributed/harness/' +
    'comparative-efficiency-change-rate-crossover-policy-witness.js',
  'test/distributed/harness/' +
    'comparative-efficiency-change-rate-crossover-constants.js',
  'test/distributed/harness/' +
    'comparative-efficiency-change-rate-crossover.js',
]);
const candidateReason =
  'no claim-eligible Lagrange change-rate-crossover capacity adapter was ' +
  'available for the preregistered matrix';
const localText = Object.freeze({
  LAGRANGE: 'lagrange',
  POSTGRESQL: 'postgresql',
  PAIRED_CAPACITY_ABSENT: 'paired_capacity_absent',
  RESOURCE_WINDOW_ABSENT: 'whole_topology_resource_window_absent',
  COMPARATIVE_EFFECTS_ABSENT: 'comparative_effects_absent',
  NON_MEASURING: 'non_measuring',
  ABSENT: 'absent',
  NOT_EVALUABLE: 'not_evaluable',
  LIVE_EVIDENCE_VERSION: 'comparative-change-rate-crossover-live-evidence-v1',
  INPUT_TYPE_MODULE: '--input-type=module',
  EVAL: '--eval',
  UTF8: 'utf8',
  PASS: 'comparative-efficiency-change-rate-crossover-live: PASS\n',
  FAIL: 'comparative-efficiency-change-rate-crossover-live: FAIL\n',
  DURABLE_REJECTED: 'durable change-rate-crossover evidence rejected: ',
  CELL_FAILED: 'PostgreSQL change-rate cell failed: ',
  CLAIM_PREFIX:
    'claim: no comparative claim; all 32 cells are non-measuring because ',
  CLAIM_SUFFIX:
    'the candidate capacity adapter was not engaged\n',
});

async function executeMatrix(runtime) {
  const attempts = [];
  for (let index = 0;
    index < COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[index];
    const sql = comparativeChangeRateCrossoverSql(cell);
    process.stdout.write(
      `cell ${index + 1}/` +
      `${COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.length}: ` +
      `${cell.datasetSize}/${cell.mutationRate}/` +
      `${cell.workloadDiversity}/${cell.skew}/${cell.policy}\n`,
    );
    const startedAt = new Date().toISOString();
    const stdout = await runtime.executeSql(
      sql,
      localText.CELL_FAILED,
    );
    const endedAt = new Date().toISOString();
    if (!evaluateComparativeChangeRateCrossoverOracle(cell, stdout)) {
      throw new Error(`change-rate-crossover oracle failed at cell ${index}`);
    }
    arrayPush(attempts, {
      matrixCellIndex: index,
      runId: `${RUN_ID}-${index}`,
      candidateEngaged: false,
      alternativeEngaged: true,
      reasonCodes: [
        COMPARATIVE_CHANGE_RATE_CROSSOVER_REASON,
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
          policyWitness:
            buildComparativeChangeRateCrossoverPolicyWitness(cell),
        },
        alternative: {
          architectureId: localText.POSTGRESQL,
          engaged: true,
          image: COMPARATIVE_POSTGRES_IMAGE,
          imageId: runtime.imageId,
          databaseContainerId: runtime.databaseContainerId,
          clientContainerId: runtime.clientContainerId,
          sql,
          stdout,
        },
        oracle: {
          name: COMPARATIVE_CHANGE_RATE_CROSSOVER_ORACLE,
          expected: comparativeChangeRateCrossoverExpectedResult(cell),
          passed: true,
        },
        measurementDisposition: {
          state: localText.NON_MEASURING,
          capacityConfidenceInterval: localText.ABSENT,
          wholeTopologyResourceBreakdown: localText.ABSENT,
          infrastructureCostProjection: localText.ABSENT,
          practicalEffectClassification: localText.NOT_EVALUABLE,
          crossoverClassification: localText.NOT_EVALUABLE,
        },
      },
    });
  }
  return attempts;
}

function workloadCells() {
  const cells = [];
  for (let index = 0;
    index < COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.length;
    index += 1) {
    const cell = COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[index];
    arrayPush(cells, {
      datasetSize: cell.datasetSize,
      mutationRate: cell.mutationRate,
      mutationDivisor: cell.mutationDivisor,
      workloadDiversity: cell.workloadDiversity,
      diversityCount: cell.diversityCount,
      skew: cell.skew,
      policy: cell.policy,
      requestCount: cell.requestCount,
      alternativeSql: comparativeChangeRateCrossoverSql(cell),
      oracleName: COMPARATIVE_CHANGE_RATE_CROSSOVER_ORACLE,
      oracleExpected: comparativeChangeRateCrossoverExpectedResult(cell),
    });
  }
  return cells;
}

function cellOutcomes(attempts) {
  const projections = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const cell = COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS[index];
    arrayPush(projections, {
      matrixCellIndex: index,
      datasetSize: cell.datasetSize,
      mutationRate: cell.mutationRate,
      workloadDiversity: cell.workloadDiversity,
      skew: cell.skew,
      policy: cell.policy,
      alternativeOraclePassed: attempts[index].liveEvidence.oracle.passed,
      state: localText.NON_MEASURING,
      capacityConfidenceInterval: localText.ABSENT,
      wholeTopologyResourceBreakdown: localText.ABSENT,
      infrastructureCostProjection: localText.ABSENT,
      practicalEffectClassification: localText.NOT_EVALUABLE,
      crossoverClassification: localText.NOT_EVALUABLE,
    });
  }
  return projections;
}

async function replayInFreshProcess(rootDigest) {
  const inspectorUrl = new URL(
    '../../test/distributed/harness/' +
      'comparative-efficiency-change-rate-crossover.js',
    import.meta.url,
  ).href;
  const resolverUrl = new URL(
    '../../test/distributed/harness/' +
      'benchmark-resource-durable-resolver.js',
    import.meta.url,
  ).href;
  const source =
    'import {inspectComparativeChangeRateCrossoverEvidence as inspect} from ' +
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
    scenario: COMPARATIVE_CHANGE_RATE_CROSSOVER_SCENARIO,
    producer: 'comparative-efficiency-change-rate-crossover-live',
    fidelity: 'live-postgresql-and-production-policy-owners',
    summary: {total: 1, passed: 1, failed: 0},
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {
      scenarios: [{
        scenario: COMPARATIVE_CHANGE_RATE_CROSSOVER_SCENARIO,
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
    `${COMPARATIVE_CHANGE_RATE_CROSSOVER_SCENARIO}-${stamp}.report.json`,
  );
  await writeFile(path, jsonStringify(report, null, 2));
  return path;
}

async function main() {
  const {
    attempts,
    imageId,
    finalized,
    calibration,
    producedAt,
    validUntil,
    provenance,
    sideIds,
  } = await startComparativePostgresLiveRun({
    runtimeConfig: {
      runId: RUN_ID,
      networkName: NETWORK_NAME,
      labels: LABELS,
      password: PASSWORD,
    },
    sourcePaths: SOURCE_PATHS,
    executeMatrix,
  });
  const evidence = createComparativeChangeRateCrossoverEvidence({
    matrixId: 'comparative-change-rate-crossover-p0-v1',
    pairId: 'lagrange-postgresql-change-rate-crossover-v1',
    sideIds,
    sourceRevision: provenance.sourceRevision,
    producedAt,
    validUntil,
    workloadManifest: {
      version: 'comparative-change-rate-crossover-workloads-v1',
      cells: workloadCells(),
      selectionPolicy: 'complete_cartesian_matrix',
    },
    alternativeTopology: {
      version: 'comparative-change-rate-crossover-topology-v1',
      candidate: {
        architectureId: localText.LAGRANGE,
        required: true,
        capacityAdapterEngaged: false,
        reason: candidateReason,
      },
      alternative: {
        architectureId: localText.POSTGRESQL,
        image: COMPARATIVE_POSTGRES_IMAGE,
        imageId,
        databaseContainerId:
          calibration.artifact.payload.components[0].containerId,
        clientContainerId:
          calibration.artifact.payload.components[1].containerId,
        network: 'managed_bridge',
      },
    },
    preregistration: {
      version: 'comparative-change-rate-crossover-preregistration-v1',
      axes: COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
      sideIds,
      outcomePolicy: 'direction_neutral',
      invalidCellPolicy: 'publish_explicit_non_measuring',
      candidateEngagementRequired: true,
      policyOwnerIds: COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
      requiredEvidence: [
        'paired_capacity',
        'whole_topology_resource_windows',
        'capacity_uncertainty',
        'capacity_practical_effect',
        'cost_practical_effect',
        'crossover_classification',
        'immutable_raw_artifacts',
      ],
    },
    inventoryId: 'comparative-change-rate-crossover-live-inventory-v1',
    inventorySides: comparativePostgresInventorySides(calibration),
    priceSheet: COMPARATIVE_POSTGRES_PRICE_SHEET,
    calibrationArtifact: calibration,
    attempts,
  });
  const inspection =
    inspectComparativeChangeRateCrossoverEvidence(evidence.receipt);
  if (!inspection.valid || !inspection.complete) {
    throw new Error(
      `change-rate-crossover evidence rejected: ${inspection.reason}`,
    );
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
  const durableInspection = inspectComparativeChangeRateCrossoverEvidence({
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
      `fresh change-rate-crossover evidence rejected: ${freshInspection.reason}`,
    );
  }
  const reportPath = await writeScenarioReport({
    runId: RUN_ID,
    sourceRevision: provenance.sourceRevision,
    sourceProvenance: provenance,
    matrixId: inspection.matrixId,
    matrixDigest: inspection.matrixDigest,
    evidenceRootDigest: inspection.rootDigest,
    axes: COMPARATIVE_CHANGE_RATE_CROSSOVER_AXES,
    fullMatrixComplete: true,
    matrixCellCount: COMPARATIVE_CHANGE_RATE_CROSSOVER_CELLS.length,
    outcomeNeutral: true,
    comparativeClaimEligible: false,
    claimDisposition: inspection.claimDisposition,
    measuringCellCount: inspection.measuringCellCount,
    nonMeasuringCellCount: inspection.nonMeasuringCellCount,
    policyOwnerIds: COMPARATIVE_CHANGE_RATE_CROSSOVER_POLICY_OWNER_IDS,
    policyWitnessCount: inspection.policyWitnessCount,
    alternativeOraclePassCount: inspection.alternativeOraclePassCount,
    cellOutcomes: cellOutcomes(attempts),
    crossoverEvaluable: false,
    crossoverClassification: localText.NOT_EVALUABLE,
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
