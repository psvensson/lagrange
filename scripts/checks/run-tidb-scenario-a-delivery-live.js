#!/usr/bin/env node

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
  buildScenarioADeliveryCase,
  evaluateScenarioADeliveryObservation,
} from '../../test/distributed/harness/oltp-scenario-a-delivery-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../../test/distributed/harness/oltp-scenario-a-comparison-systems.js';
import {
  observeTiDbDeliveryState,
} from '../../test/distributed/reference-client/tidb-delivery-observer.js';
import {
  cleanupTiDbLive,
  createTiDbLiveDatabaseName,
  createTiDbLiveRunId,
  finalizeLiveExecution,
  recordLiveSemanticEvidence,
  runLiveMain,
  startTiDbLiveEnvironment,
} from '../../test/distributed/harness/tidb-scenario-a-live-harness.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);

const SCENARIO_NAME = 'delivery';
const EVIDENCE_ID = 'tidb-delivery-v1';
const BENCHMARK_LABEL_KEY = 'lagrange.benchmark';
const BENCHMARK_LABEL_VALUE = 'scenario-a-delivery-tidb';
const LABELS = Object.freeze({
  [BENCHMARK_LABEL_KEY]: BENCHMARK_LABEL_VALUE,
});
const DEFAULT_OUTPUT_PATH =
  'test-output/tidb-reference/scenario-a-delivery-tidb.json';
const OUTPUT_PATH =
  process.env.TIDB_SCENARIO_A_DELIVERY_EVIDENCE_PATH || DEFAULT_OUTPUT_PATH;
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
const SETUP_ORDER_MISMATCH_PREFIX =
  'TiDB delivery setup allocated unexpected order id for district ';
const PASS_PREFIX = 'tidb-scenario-a-delivery-live: PASS ';
const NEWLINE = '\n';

async function runTiDbDeliveryProof(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || createTiDbLiveRunId(SCENARIO_NAME);
  const outputPath = options.outputPath || OUTPUT_PATH;
  const definition = buildScenarioADeliveryCase();
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
      workload: OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
      expectedDatasetSha256: definition.identity.datasetSha256,
    });

    const setupEvidenceList = [];
    for (const setupOperation of definition.identity.setupOperations) {
      const setupOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => state.adapter.executeTransaction(setupOperation),
      });
      const expectedDistrict = arrayFind(
        definition.identity.expected.districts,
        ({districtId}) => districtId === setupOperation.districtId,
      );
      if (!expectedDistrict ||
          Number(setupOutcome.result?.orderId) !== expectedDistrict.orderId) {
        throw new Error(
          `${SETUP_ORDER_MISMATCH_PREFIX}${setupOperation.districtId}`,
        );
      }
      setupEvidenceList.push(setupOutcome.evidence);
    }

    const deliveryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () =>
        state.adapter.executeTransaction(definition.identity.operation),
    });
    const observed = await observeTiDbDeliveryState({
      endpoint,
      databaseName: state.adapter.databaseName,
      warehouseId: definition.identity.operation.warehouseId,
      districts: definition.identity.expected.districts,
    });
    const observation = Object.freeze({
      deliveredOrders: Number(deliveryOutcome.result?.deliveredOrders),
      districts: observed.districts,
    });
    const evaluation = evaluateScenarioADeliveryObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      setupOperations: definition.identity.setupOperations,
      operation: definition.identity.operation,
      setupRetryEvidence: Object.freeze(setupEvidenceList),
      deliveryRetryEvidence: deliveryOutcome.evidence,
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
      proofIds: OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
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
  const evidence = await runTiDbDeliveryProof();
  process.stdout.write(
    PASS_PREFIX +
    JSON.stringify({
      artifactSha256: evidence.artifactSha256,
      setupRetries: arrayMap(
        evidence.setupRetryEvidence,
        (entry) => Number(entry?.retries || 0),
      ),
      deliveryRetries: Number(evidence.deliveryRetryEvidence?.retries || 0),
      deliveredOrders: evidence.observation.deliveredOrders,
    }) + NEWLINE,
  );
}

runLiveMain(main);

export {
  runTiDbDeliveryProof,
};
