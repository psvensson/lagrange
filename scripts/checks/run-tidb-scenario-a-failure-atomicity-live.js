#!/usr/bin/env node

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  OLTP_PAIRED_RETRY_OUTCOME,
  executePairedOltpTransactionWithRetry,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_WORKLOAD,
  buildScenarioAFailureAtomicityCase,
  evaluateScenarioAFailureAtomicityObservation,
} from '../../test/distributed/harness/oltp-scenario-a-failure-atomicity-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  observeTiDbOltpStateSnapshot,
} from '../../test/distributed/reference-client/tidb-oltp-state-snapshot.js';
import {
  cleanupTiDbLive,
  createTiDbLiveDatabaseName,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  recordLiveSemanticEvidence,
  runLiveMain,
  startTiDbLiveEnvironment,
} from '../../test/distributed/harness/tidb-scenario-a-live-harness.js';

const SCENARIO_NAME = 'failure-atomicity';
const EVIDENCE_ID = 'tidb-failure-atomicity-v1';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'scenario-a-failure-atomicity-tidb';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-failure-atomicity-tidb.json';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_FAILURE_ATOMICITY_EVIDENCE_PATH ||
  DEFAULT_OUTPUT_PATH;
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
const ERROR_RETRY_EVIDENCE_REQUIRED =
  'TiDB failure-atomicity proof requires paired retry evidence';
const ERROR_TERMINAL_MUST_NOT_RETRY =
  'TiDB failure-atomicity terminal request must not be retried';
const ERROR_NOT_CLASSIFIED_TERMINAL =
  'TiDB failure-atomicity request was not classified terminal';
const PASS_PREFIX = 'tidb-scenario-a-failure-atomicity-live: PASS ';
const NEWLINE = '\n';

function requireTerminalRetryEvidence(error) {
  const retryEvidence = error?.oltpRetryEvidence;
  if (!retryEvidence) {
    throw new Error(ERROR_RETRY_EVIDENCE_REQUIRED);
  }
  if (Number(retryEvidence.retries) !== 0 ||
      Number(retryEvidence.attempts) !== 1) {
    throw new Error(ERROR_TERMINAL_MUST_NOT_RETRY);
  }
  if (!Array.isArray(retryEvidence.failures) ||
      retryEvidence.failures.length !== 1 ||
      retryEvidence.failures[0].outcome !==
        OLTP_PAIRED_RETRY_OUTCOME.TERMINAL_FAILURE ||
      retryEvidence.failures[0].retryable !== false) {
    throw new Error(ERROR_NOT_CLASSIFIED_TERMINAL);
  }
  return retryEvidence;
}

async function runTiDbFailureAtomicityProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioAFailureAtomicityCase();
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
      workload: OLTP_SCENARIO_A_FAILURE_ATOMICITY_WORKLOAD,
      expectedDatasetSha256: definition.identity.datasetSha256,
    });

    const before = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    let terminalError = null;
    try {
      await executePairedOltpTransactionWithRetry({
        executeAttempt: () =>
          state.adapter.executeTransaction(definition.identity.operation),
      });
    } catch (error) {
      terminalError = error;
    }
    const retryEvidence = terminalError ?
      requireTerminalRetryEvidence(terminalError) : null;
    const after = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const observation = Object.freeze({
      terminalFailureObserved: Boolean(terminalError),
      errorMessage: terminalError?.message || '',
      stateBeforeSha256: before.stateSha256,
      stateAfterSha256: after.stateSha256,
    });
    const evaluation = evaluateScenarioAFailureAtomicityObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      operation: definition.identity.operation,
      retryEvidence,
      before,
      after,
      observation,
      evaluation,
      images: state.cluster.images,
      comparable: false,
      nonComparableReason: NON_COMPARABLE_REASON,
    });
    evidence = await recordLiveSemanticEvidence({
      outputPath,
      payload,
      evaluation,
      proofIds: OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
      scenarioName: SCENARIO_NAME,
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
  const evidence = await runTiDbFailureAtomicityProof();
  process.stdout.write(
    PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      attempts: Number(evidence.retryEvidence?.attempts || 0),
      retries: Number(evidence.retryEvidence?.retries || 0),
      stateUnchanged:
        evidence.observation.stateBeforeSha256 ===
        evidence.observation.stateAfterSha256,
    }) + NEWLINE,
  );
}

runLiveMain(main);

export {
  runTiDbFailureAtomicityProof,
};
