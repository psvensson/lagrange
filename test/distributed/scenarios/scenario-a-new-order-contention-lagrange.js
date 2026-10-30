import {
  OLTP_PAIRED_RETRY_OUTCOME,
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
  buildScenarioANewOrderContentionCase,
  evaluateScenarioANewOrderContentionObservation,
} from '../harness/oltp-scenario-a-new-order-contention-case.js';
import {
  observeLagrangeNewOrderContentionState,
} from '../reference-client/lagrange-new-order-contention-observer.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const ZERO = 0;
const PROOF_CASE_ID = 'new-order-contention';
const EVIDENCE_ID = 'lagrange-new-order-contention-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_CONTENTION_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-new-order-contention-lagrange.json';

function itemIds() {
  return [...new Set(
    OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS.flatMap(
      (operation) => operation.lines.map(({itemId}) => itemId),
    ),
  )].sort((left, right) => left - right);
}

async function executeLogicalRequest(adapter, operation) {
  const retryOutcome = await executePairedOltpTransactionWithRetry({
    executeAttempt: () => adapter.executeTransaction(operation),
  });
  return Object.freeze({
    phase: operation.phase,
    workerId: operation.workerId,
    sequence: operation.sequence,
    status: retryOutcome.outcome === OLTP_PAIRED_RETRY_OUTCOME.COMMITTED ?
      'committed' : 'aborted',
    orderId: Number(retryOutcome.result?.orderId || ZERO),
    retryEvidence: retryOutcome.evidence,
  });
}

async function preStart(options = {}) {
  return runScenarioPreStart(options, PROOF_CASE_ID);
}

async function run(cluster, preflight = null) {
  return executeScenarioRun({
    cluster,
    preflight,
    proofCaseId: PROOF_CASE_ID,
    defaultOutputPath: OUTPUT_PATH,
    execute: async ({context, options}) => {
      const definition = buildScenarioANewOrderContentionCase();
      const adapter = await createAndValidateAdapter({
        createAdapter: options.createAdapter,
        context,
        workload: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
        expectedDatasetSha256: definition.identity.datasetSha256,
        proofCaseId: PROOF_CASE_ID,
      });

      const observeState = options.observeState ||
        observeLagrangeNewOrderContentionState;
      const logicalResults = await Promise.all(
        OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS.map((operation) =>
          executeLogicalRequest(adapter, operation)),
      );
      const observedState = await observeState({
        endpoint: context.endpoint,
        connection: context.connection,
        itemIds: itemIds(),
      });
      const logicalCommitted = logicalResults.filter(
        ({status}) => status === 'committed',
      ).length;
      const observation = Object.freeze({
        logicalCommitted,
        ...observedState,
      });
      const evaluation = evaluateScenarioANewOrderContentionObservation(observation);
      const payload = buildBasePayload({
        evidenceId: EVIDENCE_ID,
        definition,
        adapter,
        context,
        extra: {
          logicalResults,
          observation,
          evaluation,
        },
      });

      return {
        adapter,
        payload,
        proofIds: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
        evaluation,
      };
    },
  });
}

export {
  preStart,
  run,
};
