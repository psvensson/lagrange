#!/usr/bin/env node

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
  buildScenarioANewOrderContentionCase,
  evaluateScenarioANewOrderContentionObservation,
} from '../../test/distributed/harness/oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  observeTiDbNewOrderContentionState,
} from '../../test/distributed/reference-client/tidb-new-order-contention-observer.js';
import {
  cleanupTiDbLive,
  createTiDbLiveDatabaseName,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  recordLiveSemanticEvidence,
  runLiveMain,
  startTiDbLiveEnvironment,
} from '../../test/distributed/harness/tidb-scenario-a-live-harness.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayReduce = Function.call.bind(Array.prototype.reduce);

const SCENARIO_NAME = 'contention';
const SCENARIO_DISPLAY_NAME = 'new-order contention';
const EVIDENCE_ID = 'tidb-new-order-contention-v1';
const STATUS_COMMITTED = 'committed';
const STATUS_FAILED = 'failed';
const DEFAULT_ERROR_NAME = 'Error';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'scenario-a-new-order-contention-tidb';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-new-order-contention-tidb.json';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_CONTENTION_EVIDENCE_PATH || DEFAULT_OUTPUT_PATH;
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
const PASS_PREFIX = 'tidb-scenario-a-new-order-contention-live: PASS ';
const NEWLINE = '\n';

function errorProjection(error) {
  return {
    name: String(error?.name || DEFAULT_ERROR_NAME),
    message: String(error?.message || error),
    sqlState: typeof error?.sqlState === 'string' ? error.sqlState : null,
    retryEvidence: error?.oltpRetryEvidence || null,
  };
}

async function executeLogicalRequest(adapter, operation) {
  try {
    const outcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(operation),
    });
    return Object.freeze({
      status: STATUS_COMMITTED,
      workerId: operation.workerId,
      result: outcome.result,
      retryEvidence: outcome.evidence,
      error: null,
    });
  } catch (error) {
    return Object.freeze({
      status: STATUS_FAILED,
      workerId: operation.workerId,
      result: null,
      retryEvidence: error?.oltpRetryEvidence || null,
      error: errorProjection(error),
    });
  }
}

function itemIds() {
  return arrayFlatMap(
    OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
    (operation) => arrayMap(operation.lines, ({itemId}) => itemId),
  );
}

async function runTiDbNewOrderContentionProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioANewOrderContentionCase();
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
      workload: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
      expectedDatasetSha256: definition.identity.datasetSha256,
    });

    const logicalResults = await Promise.all(
      arrayMap(
        OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
        (operation) => executeLogicalRequest(state.adapter, operation),
      ),
    );
    const observedState = await observeTiDbNewOrderContentionState({
      endpoint,
      databaseName: state.adapter.databaseName,
      itemIds: itemIds(),
    });
    const logicalCommitted = arrayFilter(
      logicalResults,
      ({status}) => status === STATUS_COMMITTED,
    ).length;
    const evaluation = evaluateScenarioANewOrderContentionObservation({
      logicalCommitted,
      ...observedState,
    });
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      logicalResults,
      observation: {
        logicalCommitted,
        ...observedState,
      },
      evaluation,
      images: state.cluster.images,
      comparable: false,
      nonComparableReason: NON_COMPARABLE_REASON,
    });
    evidence = await recordLiveSemanticEvidence({
      outputPath,
      payload,
      evaluation,
      proofIds: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
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
  const evidence = await runTiDbNewOrderContentionProof();
  process.stdout.write(
    PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      retries: arrayReduce(
        evidence.logicalResults,
        (sum, result) => sum + Number(result.retryEvidence?.retries || 0),
        0,
      ),
      orderIds: evidence.observation.orderIds,
    }) + NEWLINE,
  );
}

runLiveMain(main);

export {
  runTiDbNewOrderContentionProof,
};
