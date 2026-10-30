#!/usr/bin/env node

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
  buildScenarioAStockLevelCase,
  evaluateScenarioAStockLevelObservation,
} from '../../test/distributed/harness/oltp-scenario-a-stock-level-case.js';
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

const SCENARIO_NAME = 'stock-level';
const EVIDENCE_ID = 'tidb-stock-level-v1';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'scenario-a-stock-level-tidb';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-stock-level-tidb.json';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_STOCK_LEVEL_EVIDENCE_PATH || DEFAULT_OUTPUT_PATH;
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
const SETUP_ERROR_MESSAGE =
  'TiDB stock-level setup allocated unexpected order id';
const PASS_PREFIX = 'tidb-scenario-a-stock-level-live: PASS ';
const NEWLINE = '\n';

async function runTiDbStockLevelProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioAStockLevelCase();
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
      workload: OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
      expectedDatasetSha256: definition.identity.datasetSha256,
    });

    const setupOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.setupOperation),
    });
    if (Number(setupOutcome.result?.orderId) !==
        definition.identity.expected.setupOrderId) {
      throw new Error(SETUP_ERROR_MESSAGE);
    }

    const before = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const readOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.operation),
    });
    const after = await observeTiDbOltpStateSnapshot({
      endpoint,
      databaseName: state.adapter.databaseName,
    });
    const observation = Object.freeze({
      lowStock: Number(readOutcome.result?.lowStock),
      stateBeforeSha256: before.stateSha256,
      stateAfterSha256: after.stateSha256,
    });
    const evaluation = evaluateScenarioAStockLevelObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      before,
      after,
      observation,
      evaluation,
      operation: definition.identity.operation,
      setupOperation: definition.identity.setupOperation,
      readRetryEvidence: readOutcome.evidence,
      setupRetryEvidence: setupOutcome.evidence,
      comparable: false,
      nonComparableReason: NON_COMPARABLE_REASON,
      images: state.cluster.images,
    });
    evidence = await recordLiveSemanticEvidence({
      outputPath,
      payload,
      evaluation,
      proofIds: OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
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
  const evidence = await runTiDbStockLevelProof();
  process.stdout.write(
    PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      setupRetries: Number(evidence.setupRetryEvidence?.retries || 0),
      readRetries: Number(evidence.readRetryEvidence?.retries || 0),
      lowStock: evidence.observation.lowStock,
    }) + NEWLINE,
  );
}

runLiveMain(main);

export {
  runTiDbStockLevelProof,
};
