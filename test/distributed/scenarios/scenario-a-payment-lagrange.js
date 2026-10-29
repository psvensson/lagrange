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
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
} from '../harness/oltp-scenario-a-payment-case.js';
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
  observeLagrangePaymentState,
} from '../reference-client/lagrange-payment-observer.js';

const ADMISSION_ENV = 'LAGRANGE_SCENARIO_A_ADMISSION_PATH';
const PROOF_CASE_ID = 'payment';
const EVIDENCE_ID = 'lagrange-payment-v1';
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_PAYMENT_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-payment-lagrange.json';
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';

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

async function prepareAdmittedPaymentContext(cluster, preflight, options = {}) {
  const admission = await loadAdmission(options);
  if (preflight && preflight.admissionSha256 !== admission.admissionSha256) {
    throw new Error('Lagrange payment admission changed after pre-start check');
  }
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  if (preflight && preflight.runtimePreflightSha256 !== runtimePreflight.preflightSha256) {
    throw new Error('Lagrange payment runtime changed after pre-start check');
  }
  const prepareContext = options.prepareContext || prepareLagrangeScenarioAPublicPgContext;
  return prepareContext({cluster, admission});
}

async function run(cluster, preflight = null) {
  const options = (preflight && typeof preflight === 'object' &&
    !preflight.admissionSha256 && !preflight.runtimePreflightSha256) ? preflight : {};
  const preflightToken = (preflight &&
    (preflight.admissionSha256 || preflight.runtimePreflightSha256)) ? preflight : null;
  const context = await prepareAdmittedPaymentContext(cluster, preflightToken, options);
  const definition = buildScenarioAPaymentCase();
  const createAdapter = options.createAdapter || createLagrangeOltpAdapter;
  let adapter = null;
  let evidence = null;
  let primaryError = null;

  try {
    adapter = await createAdapter({
      endpoint: context.endpoint,
      connection: context.connection,
      workload: OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
    });
    if (adapter.datasetSha256 !== definition.identity.datasetSha256) {
      throw new Error('Lagrange payment proof dataset identity mismatch');
    }

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
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: EVIDENCE_ID,
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      operation: definition.identity.operation,
      executionPath: adapter.executionPath,
      protocol: adapter.protocol,
      lockingReadMode: adapter.lockingReadMode,
      serviceEndpoint: context.serviceEndpoint,
      admissionSha256: context.admission.admissionSha256,
      runtimePreflight: context.runtimePreflight,
      retryEvidence: retryOutcome.evidence,
      observation,
      evaluation,
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
        proofIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
      }),
      artifactSha256,
    });
    if (!evaluation.passed) {
      throw new Error(
        'Lagrange payment semantic proof failed: ' +
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
      'Lagrange payment proof and cleanup both failed',
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
