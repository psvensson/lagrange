import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  prepareLagrangeScenarioAPublicPgContext,
} from '../harness/oltp-scenario-a-lagrange-public-pg-context.js';
import {
  verifyLagrangeScenarioALiveAdmission,
} from '../harness/oltp-scenario-a-lagrange-live-admission.js';
import {
  buildLagrangeScenarioARuntimePreflight,
} from '../harness/oltp-scenario-a-lagrange-runtime-preflight.js';
import {
  OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
} from '../harness/oltp-scenario-a-visibility-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
} from '../harness/oltp-scenario-a-semantic-gate.js';
import {
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';
import {
  runLagrangeVisibilityProbe,
} from '../reference-client/lagrange-visibility-probe.js';

const ADMISSION_ENV = 'LAGRANGE_SCENARIO_A_ADMISSION_PATH';
const PROOF_CASE_ID = 'visibility';
const EVIDENCE_ID = 'lagrange-visibility-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_VISIBILITY_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-visibility-lagrange.json';
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';

async function loadVisibilityAdmission() {
  const admissionPath = String(process.env[ADMISSION_ENV] || '').trim();
  if (!admissionPath) {
    throw new Error(`Lagrange visibility proof requires ${ADMISSION_ENV}`);
  }
  const admission = verifyLagrangeScenarioALiveAdmission(
    JSON.parse(await readFile(admissionPath, 'utf8')),
  );
  if (admission.proofCaseId !== PROOF_CASE_ID) {
    throw new Error('Lagrange visibility proof requires visibility-bound admission');
  }
  return admission;
}

function buildVisibilityEvidence(context, adapter, definition, observation) {
  const evaluation = evaluateScenarioAVisibilityObservation(observation);
  const payload = Object.freeze({
    schemaVersion: 1,
    evidenceId: EVIDENCE_ID,
    system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
    caseId: definition.identity.caseId,
    caseSha256: definition.caseSha256,
    datasetSha256: definition.identity.datasetSha256,
    executionPath: adapter.executionPath,
    protocol: adapter.protocol,
    lockingReadMode: adapter.lockingReadMode,
    serviceEndpoint: context.serviceEndpoint,
    admissionSha256: context.admission.admissionSha256,
    runtimePreflight: context.runtimePreflight,
    observation,
    evaluation,
    comparable: false,
    nonComparableReason: NON_COMPARABLE_REASON,
  });
  const artifactSha256 = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  return Object.freeze({
    ...payload,
    proofRecord: Object.freeze({
      evidenceId: EVIDENCE_ID,
      system: payload.system,
      status: evaluation.passed ?
        OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
        OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
      artifactSha256,
      proofIds: evaluation.proofIds,
    }),
    artifactSha256,
  });
}

async function closeAndPersistVisibilityAttempt(adapter, evidence) {
  if (adapter) {
    await adapter.close({dropTables: false});
  }
  if (evidence) {
    await mkdir(path.dirname(OUTPUT_PATH), {recursive: true});
    await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  }
}

async function preStart() {
  const admission = await loadVisibilityAdmission();
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  return Object.freeze({
    admissionSha256: admission.admissionSha256,
    runtimePreflightSha256: runtimePreflight.preflightSha256,
  });
}

async function prepareAdmittedVisibilityContext(cluster, preflight) {
  const admission = await loadVisibilityAdmission();
  if (preflight && preflight.admissionSha256 !== admission.admissionSha256) {
    throw new Error('Lagrange visibility admission changed after pre-start check');
  }
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  if (preflight && preflight.runtimePreflightSha256 !== runtimePreflight.preflightSha256) {
    throw new Error('Lagrange visibility runtime changed after pre-start check');
  }
  return prepareLagrangeScenarioAPublicPgContext({cluster, admission});
}

async function run(cluster, preflight = null) {
  // Certification is consumed before any cluster query, SQL provisioning or
  // workload operation. A WIP 0.2.6 source tree alone cannot grant admission.
  const context = await prepareAdmittedVisibilityContext(cluster, preflight);
  const definition = buildScenarioAVisibilityCase();
  let adapter = null;
  let evidence = null;
  let primaryError = null;

  try {
    adapter = await createLagrangeOltpAdapter({
      endpoint: context.endpoint,
      connection: context.connection,
      workload: OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
    });
    if (adapter.datasetSha256 !== definition.identity.datasetSha256) {
      throw new Error('Lagrange visibility proof dataset identity mismatch');
    }
    const observation = await runLagrangeVisibilityProbe({
      endpoint: context.endpoint,
      connection: context.connection,
      warehouseId: definition.identity.target.key.id,
      writeDeltaCents: definition.identity.writeDeltaCents,
    });
    evidence = buildVisibilityEvidence(context, adapter, definition, observation);
    if (!evidence.evaluation.passed) {
      throw new Error(
        'Lagrange visibility semantic proof failed: ' +
        evidence.evaluation.failures.join(','),
      );
    }
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await closeAndPersistVisibilityAttempt(adapter, evidence);
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Lagrange visibility proof and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return Object.freeze({
    status: 'passed',
    artifactSha256: evidence.artifactSha256,
    proofIds: evidence.evaluation.proofIds,
    endpoint: context.serviceEndpoint,
  });
}

export {preStart, run};
