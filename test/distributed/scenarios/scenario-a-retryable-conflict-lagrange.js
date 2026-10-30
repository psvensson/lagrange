import {
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
} from '../harness/oltp-scenario-a-retryable-conflict-case.js';
import {
  induceLagrangeRetryableConflict,
} from '../reference-client/lagrange-retryable-conflict-probe.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const PROOF_CASE_ID = 'retryable-conflict';
const EVIDENCE_ID = 'lagrange-retryable-conflict-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_CONFLICT_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-retryable-conflict-lagrange.json';
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 1,
  itemCount: 15,
});

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
      const definition = buildScenarioARetryableConflictCase();
      const adapter = await createAndValidateAdapter({
        createAdapter: options.createAdapter,
        context,
        workload: WORKLOAD,
        proofCaseId: PROOF_CASE_ID,
      });

      const induceConflict = options.induceConflict ||
        induceLagrangeRetryableConflict;
      const probe = await induceConflict({
        endpoint: context.endpoint,
        connection: context.connection,
      });
      const observation = Object.freeze({sqlState: probe.victim.sqlState});
      const evaluation = evaluateScenarioARetryableConflictObservation(observation);
      const payload = buildBasePayload({
        evidenceId: EVIDENCE_ID,
        definition,
        adapter,
        context,
        extra: {
          observation,
          evaluation,
          victim: probe.victim,
          probeResults: probe.results,
        },
      });

      return {
        adapter,
        payload,
        proofIds: OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
        evaluation,
      };
    },
  });
}

export {
  preStart,
  run,
};
