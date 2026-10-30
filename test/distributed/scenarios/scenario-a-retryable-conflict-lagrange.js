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
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
} from '../harness/oltp-scenario-a-retryable-conflict-case.js';
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
  induceLagrangeRetryableConflict,
} from '../reference-client/lagrange-retryable-conflict-probe.js';

const ADMISSION_ENV = 'LAGRANGE_SCENARIO_A_ADMISSION_PATH';
const PROOF_CASE_ID = 'retryable-conflict';
const EVIDENCE_ID = 'lagrange-retryable-conflict-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_CONFLICT_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-retryable-conflict-lagrange.json';
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';
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

function payloadDigest(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function loadAdmission(options = {}) {
  if (options.admission) {
    const verified = verifyLagrangeScenarioALiveAdmission(options.admission);
    if (verified.proofCaseId !== PROOF_CASE_ID) {
      throw new Error(`Lagrange ${PROOF_CASE_ID} proof requires ${PROOF_CASE_ID}-bound admission`);
    }
    return verified;
  }
  const admissionPath = String(process.env[ADMISSION_ENV] || '').trim();
  if (!admissionPath) {
    throw new Error(`Lagrange ${PROOF_CASE_ID} proof requires ${ADMISSION_ENV}`);
  }
  const admission = verifyLagrangeScenarioALiveAdmission(
    JSON.parse(await readFile(admissionPath, 'utf8')),
  );
  if (admission.proofCaseId !== PROOF_CASE_ID) {
    throw new Error(`Lagrange ${PROOF_CASE_ID} proof requires ${PROOF_CASE_ID}-bound admission`);
  }
  return admission;
}

async function preStart(options = {}) {
  const admission = await loadAdmission(options);
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  return Object.freeze({
    admissionSha256: admission.admissionSha256,
    runtimePreflightSha256: runtimePreflight.preflightSha256,
  });
}

async function prepareAdmittedRetryableConflictContext(cluster, preflight, options = {}) {
  const admission = await loadAdmission(options);
  if (preflight && preflight.admissionSha256 !== admission.admissionSha256) {
    throw new Error('Lagrange retryable-conflict admission changed after pre-start check');
  }
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  if (preflight && preflight.runtimePreflightSha256 !== runtimePreflight.preflightSha256) {
    throw new Error('Lagrange retryable-conflict runtime changed after pre-start check');
  }
  const prepareContext = options.prepareContext || prepareLagrangeScenarioAPublicPgContext;
  return prepareContext({cluster, admission});
}

async function run(cluster, preflight = null) {
  const options = (preflight && typeof preflight === 'object' &&
    !preflight.admissionSha256 && !preflight.runtimePreflightSha256) ? preflight : {};
  const preflightToken = (preflight &&
    (preflight.admissionSha256 || preflight.runtimePreflightSha256)) ? preflight : null;
  const context = await prepareAdmittedRetryableConflictContext(
    cluster, preflightToken, options);
  const definition = buildScenarioARetryableConflictCase();
  const createAdapter = options.createAdapter || createLagrangeOltpAdapter;
  let adapter = null;
  let evidence = null;
  let primaryError = null;

  try {
    adapter = await createAdapter({
      endpoint: context.endpoint,
      connection: context.connection,
      workload: WORKLOAD,
    });

    const induceConflict = options.induceConflict || induceLagrangeRetryableConflict;
    const probe = await induceConflict({
      endpoint: context.endpoint,
      connection: context.connection,
    });
    const observation = Object.freeze({sqlState: probe.victim.sqlState});
    const evaluation = evaluateScenarioARetryableConflictObservation(observation);
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      executionPath: adapter.executionPath,
      protocol: adapter.protocol,
      lockingReadMode: adapter.lockingReadMode,
      serviceEndpoint: context.serviceEndpoint,
      admissionSha256: context.admission.admissionSha256,
      runtimePreflight: context.runtimePreflight,
      observation,
      evaluation,
      victim: probe.victim,
      probeResults: probe.results,
      comparable: false,
      nonComparableReason: NON_COMPARABLE_REASON,
    });
    const artifactSha256 = payloadDigest(payload);
    evidence = Object.freeze({
      ...payload,
      proofRecord: Object.freeze({
        evidenceId: payload.evidenceId,
        system: payload.system,
        status: evaluation.passed ?
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
        artifactSha256,
        proofIds: OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
      }),
      artifactSha256,
    });
    if (!evaluation.passed) {
      throw new Error(
        'Lagrange retryable-conflict semantic proof failed: ' +
        evaluation.failures.join(','),
      );
    }
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    if (adapter) await adapter.close({dropTables: false});
    if (evidence) {
      const outputPath = options.outputPath || OUTPUT_PATH;
      await mkdir(path.dirname(outputPath), {recursive: true});
      await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    }
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Lagrange retryable-conflict proof and cleanup both failed',
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

export {
  preStart,
  run,
};
