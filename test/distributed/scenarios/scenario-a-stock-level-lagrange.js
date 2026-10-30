import {
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
  buildScenarioAStockLevelCase,
  evaluateScenarioAStockLevelObservation,
} from '../harness/oltp-scenario-a-stock-level-case.js';
import {
  observeLagrangeOltpStateSnapshot,
} from '../reference-client/lagrange-oltp-state-snapshot.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const PROOF_CASE_ID = 'stock-level';
const EVIDENCE_ID = 'lagrange-stock-level-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_STOCK_LEVEL_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-stock-level-lagrange.json';

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
      const definition = buildScenarioAStockLevelCase();
      const adapter = await createAndValidateAdapter({
        createAdapter: options.createAdapter,
        context,
        workload: OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
        expectedDatasetSha256: definition.identity.datasetSha256,
        proofCaseId: PROOF_CASE_ID,
      });

      const setupOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => adapter.executeTransaction(definition.identity.setupOperation),
      });
      if (Number(setupOutcome.result?.orderId) !== definition.identity.expected.setupOrderId) {
        throw new Error('Lagrange stock-level setup allocated unexpected order id');
      }

      const observeSnapshot = options.observeSnapshot || observeLagrangeOltpStateSnapshot;
      const before = await observeSnapshot({
        endpoint: context.endpoint,
        connection: context.connection,
      });
      const readOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
      });
      const after = await observeSnapshot({
        endpoint: context.endpoint,
        connection: context.connection,
      });

      const observation = Object.freeze({
        lowStock: Number(readOutcome.result?.lowStock),
        stateBeforeSha256: before.stateSha256,
        stateAfterSha256: after.stateSha256,
      });
      const evaluation = evaluateScenarioAStockLevelObservation(observation);
      const payload = buildBasePayload({
        evidenceId: EVIDENCE_ID,
        definition,
        adapter,
        context,
        extra: {
          setupOperation: definition.identity.setupOperation,
          operation: definition.identity.operation,
          setupRetryEvidence: setupOutcome.evidence,
          retryEvidence: readOutcome.evidence,
          observation,
          evaluation,
        },
      });

      return {
        adapter,
        payload,
        proofIds: OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
        evaluation,
      };
    },
  });
}

export {
  preStart,
  run,
};
