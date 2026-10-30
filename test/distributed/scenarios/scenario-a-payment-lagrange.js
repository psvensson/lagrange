import {
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
} from '../harness/oltp-scenario-a-payment-case.js';
import {
  observeLagrangePaymentState,
} from '../reference-client/lagrange-payment-observer.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const PROOF_CASE_ID = 'payment';
const EVIDENCE_ID = 'lagrange-payment-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_PAYMENT_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-payment-lagrange.json';

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
      const definition = buildScenarioAPaymentCase();
      const adapter = await createAndValidateAdapter({
        createAdapter: options.createAdapter,
        context,
        workload: OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
        expectedDatasetSha256: definition.identity.datasetSha256,
        proofCaseId: PROOF_CASE_ID,
      });

      const retryOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
      });
      const observePayment = options.observePayment || observeLagrangePaymentState;
      const observedState = await observePayment({
        endpoint: context.endpoint,
        connection: context.connection,
        operation: definition.identity.operation,
      });
      const observation = Object.freeze({
        paidCents: Number(retryOutcome.result?.paidCents),
        ...observedState,
      });
      const evaluation = evaluateScenarioAPaymentObservation(observation);
      const payload = buildBasePayload({
        evidenceId: EVIDENCE_ID,
        definition,
        adapter,
        context,
        extra: {
          operation: definition.identity.operation,
          retryEvidence: retryOutcome.evidence,
          observation,
          evaluation,
        },
      });

      return {
        adapter,
        payload,
        proofIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
        evaluation,
      };
    },
  });
}

export {
  preStart,
  run,
};
