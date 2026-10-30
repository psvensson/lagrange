import {
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
  buildScenarioADeliveryCase,
  evaluateScenarioADeliveryObservation,
} from '../harness/oltp-scenario-a-delivery-case.js';
import {
  observeLagrangeDeliveryState,
} from '../reference-client/lagrange-delivery-observer.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const PROOF_CASE_ID = 'delivery';
const EVIDENCE_ID = 'lagrange-delivery-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_DELIVERY_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-delivery-lagrange.json';

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
      const definition = buildScenarioADeliveryCase();
      const adapter = await createAndValidateAdapter({
        createAdapter: options.createAdapter,
        context,
        workload: OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
        expectedDatasetSha256: definition.identity.datasetSha256,
        proofCaseId: PROOF_CASE_ID,
      });

      const setupRetryEvidence = [];
      for (const setupOperation of definition.identity.setupOperations) {
        const setupOutcome = await executePairedOltpTransactionWithRetry({
          executeAttempt: () => adapter.executeTransaction(setupOperation),
        });
        const expectedDistrict = definition.identity.expected.districts.find(
          ({districtId}) => districtId === setupOperation.districtId,
        );
        if (!expectedDistrict ||
            Number(setupOutcome.result?.orderId) !== expectedDistrict.orderId) {
          throw new Error(
            'Lagrange delivery setup allocated unexpected order id for district ' +
            `${setupOperation.districtId}`,
          );
        }
        setupRetryEvidence.push(setupOutcome.evidence);
      }

      const deliveryOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
      });
      const observeDelivery = options.observeDelivery || observeLagrangeDeliveryState;
      const observed = await observeDelivery({
        endpoint: context.endpoint,
        connection: context.connection,
        warehouseId: definition.identity.operation.warehouseId,
        districts: definition.identity.expected.districts,
      });
      const observation = Object.freeze({
        deliveredOrders: Number(deliveryOutcome.result?.deliveredOrders),
        districts: observed.districts,
      });
      const evaluation = evaluateScenarioADeliveryObservation(observation);
      const payload = buildBasePayload({
        evidenceId: EVIDENCE_ID,
        definition,
        adapter,
        context,
        extra: {
          setupOperations: definition.identity.setupOperations,
          operation: definition.identity.operation,
          setupRetryEvidence: Object.freeze(setupRetryEvidence),
          retryEvidence: deliveryOutcome.evidence,
          observation,
          evaluation,
        },
      });

      return {
        adapter,
        payload,
        proofIds: OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
        evaluation,
      };
    },
  });
}

export {
  preStart,
  run,
};
