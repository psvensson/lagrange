#!/usr/bin/env node

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
} from '../../test/distributed/harness/oltp-scenario-a-payment-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  observeTiDbPaymentState,
} from '../../test/distributed/reference-client/tidb-payment-observer.js';
import {
  cleanupTiDbLive,
  createTiDbLiveDatabaseName,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  recordLiveSemanticEvidence,
  runLiveMain,
  startTiDbLiveEnvironment,
} from '../../test/distributed/harness/tidb-scenario-a-live-harness.js';

const SCENARIO_NAME = 'payment';
const EVIDENCE_ID = 'tidb-payment-v1';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'scenario-a-payment-tidb';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-payment-tidb.json';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_PAYMENT_EVIDENCE_PATH || DEFAULT_OUTPUT_PATH;
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
const PASS_PREFIX = 'tidb-scenario-a-payment-live: PASS ';
const NEWLINE = '\n';

async function runTiDbPaymentProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioAPaymentCase();
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
      workload: OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
      expectedDatasetSha256: definition.identity.datasetSha256,
    });

    const retryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.operation),
    });
    const observedState = await observeTiDbPaymentState({
      endpoint,
      databaseName: state.adapter.databaseName,
      operation: definition.identity.operation,
    });
    const observation = Object.freeze({
      paidCents: Number(retryOutcome.result?.paidCents),
      ...observedState,
    });
    const evaluation = evaluateScenarioAPaymentObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      operation: definition.identity.operation,
      retryEvidence: retryOutcome.evidence,
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
      proofIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
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
  const evidence = await runTiDbPaymentProof();
  process.stdout.write(
    PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      retries: Number(evidence.retryEvidence?.retries || 0),
      paidCents: evidence.observation.paidCents,
    }) + NEWLINE,
  );
}

runLiveMain(main);

export {
  runTiDbPaymentProof,
};
