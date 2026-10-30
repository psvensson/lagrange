#!/usr/bin/env node

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
} from '../../test/distributed/harness/oltp-scenario-a-retryable-conflict-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  induceTiDbRetryableConflict,
} from '../../test/distributed/reference-client/tidb-retryable-conflict-probe.js';
import {
  cleanupTiDbLive,
  createTiDbLiveDatabaseName,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  recordLiveSemanticEvidence,
  runLiveMain,
  startTiDbLiveEnvironment,
} from '../../test/distributed/harness/tidb-scenario-a-live-harness.js';

const SCENARIO_NAME = 'conflict';
const SCENARIO_DISPLAY_NAME = 'retryable conflict';
const EVIDENCE_ID = 'tidb-retryable-conflict-v1';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'scenario-a-retryable-conflict-tidb';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-retryable-conflict-tidb.json';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_CONFLICT_EVIDENCE_PATH || DEFAULT_OUTPUT_PATH;
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
const PASS_PREFIX = 'tidb-scenario-a-retryable-conflict-live: PASS ';
const NEWLINE = '\n';
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 1,
  itemCount: 15,
});

async function runTiDbRetryableConflictProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioARetryableConflictCase();
  const state = {
    networkName: `${runId}-net`,
    networkId: null,
    cluster: null,
    adapter: null,
  };
  let primaryError = null;
  let evidence = null;

  try {
    const {endpoint} = await startTiDbLiveEnvironment({
      provider,
      state,
      runId,
      labels: LABELS,
      databaseName: createTiDbLiveDatabaseName(SCENARIO_NAME),
      workload: WORKLOAD,
    });

    const probe = await induceTiDbRetryableConflict({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const observation = Object.freeze({sqlState: probe.victim.sqlState});
    const evaluation =
      evaluateScenarioARetryableConflictObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      observation,
      evaluation,
      victim: probe.victim,
      probeResults: probe.results,
      images: state.cluster.images,
      comparable: false,
      nonComparableReason: NON_COMPARABLE_REASON,
    });
    evidence = await recordLiveSemanticEvidence({
      outputPath,
      payload,
      evaluation,
      proofIds: OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
      scenarioName: SCENARIO_DISPLAY_NAME,
    });
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await cleanupTiDbLive(provider, state);
  } catch (error) {
    cleanupError = error;
  }

  finalizeLiveExecution({
    primaryError,
    cleanupError,
    scenarioName: SCENARIO_NAME,
  });
  return evidence;
}

async function main() {
  const evidence = await runTiDbRetryableConflictProof();
  process.stdout.write(
    PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      sqlState: evidence.observation.sqlState,
      victimSide: evidence.victim.side,
    }) + NEWLINE,
  );
}

runLiveMain(main);

export {
  runTiDbRetryableConflictProof,
};
