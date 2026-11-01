import {
  OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
} from '../harness/oltp-scenario-a-visibility-case.js';
import {
  runLagrangeVisibilityProbe,
} from '../reference-client/lagrange-visibility-probe.js';
import {
  buildBasePayload,
  createAndValidateAdapter,
  executeScenarioRun,
  runScenarioPreStart,
} from './scenario-a-lagrange-shared.js';

const PROOF_CASE_ID = 'visibility';
const EVIDENCE_ID = 'lagrange-visibility-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_VISIBILITY_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-visibility-lagrange.json';

async function preStart(options = {}) {
  return runScenarioPreStart(options, PROOF_CASE_ID);
}

// The proof body, independent of how its context was admitted: the live
// Lagrange run and the PG-wire proof journey (Lagrange, PostgreSQL) share it.
async function executeProof({context, options = {}}) {
  const definition = buildScenarioAVisibilityCase();
  const adapter = await createAndValidateAdapter({
    createAdapter: options.createAdapter,
    context,
    workload: OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    proofCaseId: PROOF_CASE_ID,
  });
  const runProbe = options.runProbe || runLagrangeVisibilityProbe;
  const observation = await runProbe({
    endpoint: context.endpoint,
    connection: context.connection,
    warehouseId: definition.identity.target.key.id,
    writeDeltaCents: definition.identity.writeDeltaCents,
  });
  const evaluation = evaluateScenarioAVisibilityObservation(observation);
  const payload = buildBasePayload({
    evidenceId: EVIDENCE_ID,
    definition,
    adapter,
    context,
    extra: {observation, evaluation},
  });
  return {adapter, payload, proofIds: evaluation.proofIds, evaluation};
}

// Certification is consumed before any cluster query, SQL provisioning or
// workload operation. A WIP source tree alone cannot grant admission.
async function run(cluster, preflight = null) {
  return executeScenarioRun({
    cluster,
    preflight,
    proofCaseId: PROOF_CASE_ID,
    defaultOutputPath: OUTPUT_PATH,
    execute: ({context, options}) => executeProof({context, options}),
  });
}

export {
  executeProof,
  preStart,
  run,
};
