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
  OLTP_SCENARIO_A_SYSTEM,
} from '../harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
} from '../harness/oltp-scenario-a-semantic-gate.js';
import {
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';

const ADMISSION_ENV = 'LAGRANGE_SCENARIO_A_ADMISSION_PATH';
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';

function payloadDigest(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function loadScenarioAdmission(options = {}, proofCaseId) {
  if (options.admission) {
    const verified = verifyLagrangeScenarioALiveAdmission(options.admission);
    if (verified.proofCaseId !== proofCaseId) {
      throw new Error(
        `Lagrange ${proofCaseId} proof requires ${proofCaseId}-bound admission`,
      );
    }
    return verified;
  }
  const admissionPath = String(process.env[ADMISSION_ENV] || '').trim();
  if (!admissionPath) {
    throw new Error(`Lagrange ${proofCaseId} proof requires ${ADMISSION_ENV}`);
  }
  const admission = verifyLagrangeScenarioALiveAdmission(
    JSON.parse(await readFile(admissionPath, 'utf8')),
  );
  if (admission.proofCaseId !== proofCaseId) {
    throw new Error(
      `Lagrange ${proofCaseId} proof requires ${proofCaseId}-bound admission`,
    );
  }
  return admission;
}

async function runScenarioPreStart(options = {}, proofCaseId) {
  const admission = await loadScenarioAdmission(options, proofCaseId);
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  return Object.freeze({
    admissionSha256: admission.admissionSha256,
    runtimePreflightSha256: runtimePreflight.preflightSha256,
  });
}

function parseRunArguments(preflight) {
  const options = (preflight && typeof preflight === 'object' &&
    !preflight.admissionSha256 && !preflight.runtimePreflightSha256) ? preflight : {};
  const preflightToken = (preflight &&
    (preflight.admissionSha256 || preflight.runtimePreflightSha256)) ? preflight : null;
  return {options, preflightToken};
}

async function prepareAdmittedScenarioContext(
  cluster,
  preflight,
  options = {},
  proofCaseId,
) {
  const admission = await loadScenarioAdmission(options, proofCaseId);
  if (preflight && preflight.admissionSha256 !== admission.admissionSha256) {
    throw new Error(`Lagrange ${proofCaseId} admission changed after pre-start check`);
  }
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  if (preflight && preflight.runtimePreflightSha256 !== runtimePreflight.preflightSha256) {
    throw new Error(`Lagrange ${proofCaseId} runtime changed after pre-start check`);
  }
  const prepareContext = options.prepareContext || prepareLagrangeScenarioAPublicPgContext;
  return prepareContext({cluster, admission});
}

async function createAndValidateAdapter({
  createAdapter = createLagrangeOltpAdapter,
  context,
  workload,
  expectedDatasetSha256,
  proofCaseId,
}) {
  const adapter = await createAdapter({
    endpoint: context.endpoint,
    connection: context.connection,
    workload,
  });
  if (expectedDatasetSha256 && adapter.datasetSha256 !== expectedDatasetSha256) {
    throw new Error(`Lagrange ${proofCaseId} proof dataset identity mismatch`);
  }
  return adapter;
}

function buildBasePayload({
  evidenceId,
  definition,
  adapter,
  context,
  extra = {},
}) {
  const contract = adapter || context?.publicExecutionContract || {};
  return Object.freeze({
    schemaVersion: 1,
    evidenceId,
    system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
    caseId: definition.identity.caseId,
    caseSha256: definition.caseSha256,
    ...(definition.identity?.datasetSha256 ?
      {datasetSha256: definition.identity.datasetSha256} : {}),
    executionPath: contract.executionPath,
    protocol: contract.protocol,
    lockingReadMode: contract.lockingReadMode,
    serviceEndpoint: context.serviceEndpoint,
    admissionSha256: context.admission.admissionSha256,
    runtimePreflight: context.runtimePreflight,
    ...extra,
    comparable: false,
    nonComparableReason: NON_COMPARABLE_REASON,
  });
}

function buildScenarioEvidence({payload, proofIds, evaluation, proofCaseId}) {
  const artifactSha256 = payloadDigest(payload);
  const evidence = Object.freeze({
    ...payload,
    proofRecord: Object.freeze({
      evidenceId: payload.evidenceId,
      system: payload.system,
      status: evaluation.passed ?
        OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
        OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
      artifactSha256,
      proofIds,
    }),
    artifactSha256,
  });
  if (!evaluation.passed) {
    throw new Error(
      `Lagrange ${proofCaseId} semantic proof failed: ` +
      evaluation.failures.join(','),
    );
  }
  return evidence;
}

async function finalizeScenarioExecution({
  adapter,
  evidence,
  options = {},
  defaultOutputPath,
  proofCaseId,
  primaryError,
  serviceEndpoint,
}) {
  let cleanupError = null;
  try {
    if (adapter) await adapter.close({dropTables: false});
    if (evidence) {
      const outputPath = options.outputPath || defaultOutputPath;
      await mkdir(path.dirname(outputPath), {recursive: true});
      await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    }
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      `Lagrange ${proofCaseId} proof and cleanup both failed`,
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;

  return Object.freeze({
    status: 'passed',
    artifactSha256: evidence.artifactSha256,
    proofIds: evidence.evaluation.proofIds,
    endpoint: serviceEndpoint,
  });
}

async function executeScenarioRun({
  cluster,
  preflight,
  proofCaseId,
  defaultOutputPath,
  execute,
}) {
  const {options, preflightToken} = parseRunArguments(preflight);
  const context = await prepareAdmittedScenarioContext(
    cluster,
    preflightToken,
    options,
    proofCaseId,
  );
  let adapter = null;
  let evidence = null;
  let primaryError = null;
  let serviceEndpoint = context.serviceEndpoint;

  try {
    const outcome = await execute({context, options});
    adapter = outcome.adapter;
    if (outcome.serviceEndpoint) {
      serviceEndpoint = outcome.serviceEndpoint;
    }
    evidence = buildScenarioEvidence({
      payload: outcome.payload,
      proofIds: outcome.proofIds,
      evaluation: outcome.evaluation,
      proofCaseId,
    });
  } catch (error) {
    primaryError = error;
  }

  return finalizeScenarioExecution({
    adapter,
    evidence,
    options,
    defaultOutputPath,
    proofCaseId,
    primaryError,
    serviceEndpoint,
  });
}

export {
  runScenarioPreStart,
  createAndValidateAdapter,
  buildBasePayload,
  executeScenarioRun,
};
