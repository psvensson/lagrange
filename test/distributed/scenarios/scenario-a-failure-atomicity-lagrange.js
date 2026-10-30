import {
  OLTP_PAIRED_RETRY_OUTCOME,
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_WORKLOAD,
  buildScenarioAFailureAtomicityCase,
  evaluateScenarioAFailureAtomicityObservation,
} from '../harness/oltp-scenario-a-failure-atomicity-case.js';
import {
  observeLagrangeOltpStateSnapshot,
} from '../reference-client/lagrange-oltp-state-snapshot.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const ZERO = 0;
const ONE = 1;
const PROOF_CASE_ID = 'failure-atomicity';
const EVIDENCE_ID = 'lagrange-failure-atomicity-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_FAILURE_ATOMICITY_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-failure-atomicity-lagrange.json';

function requireTerminalRetryEvidence(error) {
  const evidence = error?.oltpRetryEvidence;
  if (!evidence) {
    throw new Error('Lagrange failure-atomicity proof requires paired retry evidence');
  }
  if (Number(evidence.retries) !== ZERO || Number(evidence.attempts) !== ONE) {
    throw new Error('Lagrange failure-atomicity terminal request must not be retried');
  }
  if (!Array.isArray(evidence.failures) || evidence.failures.length !== ONE ||
      evidence.failures[ZERO].outcome !==
        OLTP_PAIRED_RETRY_OUTCOME.TERMINAL_FAILURE ||
      evidence.failures[ZERO].retryable !== false) {
    throw new Error('Lagrange failure-atomicity request was not classified terminal');
  }
  return evidence;
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
      const definition = buildScenarioAFailureAtomicityCase();
      const adapter = await createAndValidateAdapter({
        createAdapter: options.createAdapter,
        context,
        workload: OLTP_SCENARIO_A_FAILURE_ATOMICITY_WORKLOAD,
        expectedDatasetSha256: definition.identity.datasetSha256,
        proofCaseId: PROOF_CASE_ID,
      });

      const observeSnapshot = options.observeSnapshot || observeLagrangeOltpStateSnapshot;
      const before = await observeSnapshot({
        endpoint: context.endpoint,
        connection: context.connection,
      });

      let terminalError = null;
      try {
        await executePairedOltpTransactionWithRetry({
          executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
        });
      } catch (error) {
        terminalError = error;
      }
      const retryEvidence = terminalError ?
        requireTerminalRetryEvidence(terminalError) : null;
      const after = await observeSnapshot({
        endpoint: context.endpoint,
        connection: context.connection,
      });

      const observation = Object.freeze({
        terminalFailureObserved: Boolean(terminalError),
        errorMessage: terminalError?.message || '',
        stateBeforeSha256: before.stateSha256,
        stateAfterSha256: after.stateSha256,
      });
      const evaluation = evaluateScenarioAFailureAtomicityObservation(observation);
      const payload = buildBasePayload({
        evidenceId: EVIDENCE_ID,
        definition,
        adapter,
        context,
        extra: {
          operation: definition.identity.operation,
          retryEvidence,
          observation,
          evaluation,
        },
      });

      return {
        adapter,
        payload,
        proofIds: OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
        evaluation,
      };
    },
  });
}

export {
  preStart,
  run,
};
