import {createHash} from 'node:crypto';

import {
  executePairedOltpTransactionWithRetry,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
  buildScenarioANewOrderContentionCase,
  evaluateScenarioANewOrderContentionObservation,
} from './oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';
import {
  prepareLagrangeScenarioAPublicPgContext,
} from './oltp-scenario-a-lagrange-public-pg-context.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
} from './oltp-scenario-a-semantic-gate.js';
import {
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';
import {
  observeLagrangeNewOrderContentionState,
} from '../reference-client/lagrange-new-order-contention-observer.js';

const ZERO = 0;
const ONE = 1;
const CASE_ID = 'new-order-contention';
const ALLOWED_OPTION_KEYS = Object.freeze(['admission', 'cluster']);

function requireOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lagrange new-order contention runner requires options');
  }
  const unknown = Object.keys(value).filter(
    (key) => !ALLOWED_OPTION_KEYS.includes(key),
  );
  if (unknown.length > ZERO) {
    throw new Error(
      `unsupported Lagrange new-order contention runner option ${unknown.sort()[ZERO]}`,
    );
  }
  return value;
}

function errorProjection(error) {
  return Object.freeze({
    name: String(error?.name || 'Error'),
    message: String(error?.message || error),
    sqlState: typeof error?.sqlState === 'string' ? error.sqlState : null,
    retryEvidence: error?.oltpRetryEvidence || null,
  });
}

async function executeLogicalRequest(adapter, operation) {
  try {
    const outcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(operation),
    });
    return Object.freeze({
      status: 'committed',
      workerId: operation.workerId,
      result: outcome.result,
      retryEvidence: outcome.evidence,
      error: null,
    });
  } catch (error) {
    return Object.freeze({
      status: 'failed',
      workerId: operation.workerId,
      result: null,
      retryEvidence: error?.oltpRetryEvidence || null,
      error: errorProjection(error),
    });
  }
}

function itemIds() {
  return OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS
    .flatMap((operation) => operation.lines.map(({itemId}) => itemId));
}

function canonicalPayloadDigest(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function assertCaseAdmission(admission) {
  if (admission.proofCaseId !== CASE_ID) {
    throw new Error('Lagrange contention runner requires new-order-contention admission');
  }
  if (JSON.stringify(admission.proofIds) !==
      JSON.stringify(OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS)) {
    throw new Error('Lagrange contention admission proof IDs do not match case owner');
  }
}

function assertAdapterContract(adapter, executionContract) {
  if (adapter.protocol !== executionContract.protocol ||
      adapter.executionPath !== executionContract.executionPath ||
      adapter.lockingReadMode !== executionContract.lockingReadMode) {
    throw new Error('Lagrange contention adapter violates public execution contract');
  }
}

async function runLagrangeScenarioANewOrderContentionProof(value) {
  const options = requireOptions(value);
  const definition = buildScenarioANewOrderContentionCase();
  let adapter = null;
  let evidence = null;
  let primaryError = null;

  try {
    const context = await prepareLagrangeScenarioAPublicPgContext({
      cluster: options.cluster,
      admission: options.admission,
    });
    assertCaseAdmission(context.admission);
    adapter = await createLagrangeOltpAdapter({
      endpoint: context.endpoint,
      connection: context.connection,
      workload: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
    });
    assertAdapterContract(adapter, context.publicExecutionContract);
    if (adapter.datasetSha256 !== definition.identity.datasetSha256) {
      throw new Error('Lagrange contention proof dataset identity mismatch');
    }
    await context.waitForDataConvergence();

    const logicalResults = await Promise.all(
      OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS.map((operation) =>
        executeLogicalRequest(adapter, operation)),
    );
    const observedState = await observeLagrangeNewOrderContentionState({
      endpoint: context.endpoint,
      connection: context.connection,
      itemIds: itemIds(),
    });
    const logicalCommitted = logicalResults.filter(
      ({status}) => status === 'committed',
    ).length;
    const observation = Object.freeze({
      logicalCommitted,
      ...observedState,
    });
    const evaluation = evaluateScenarioANewOrderContentionObservation(observation);
    const payload = Object.freeze({
      schemaVersion: ONE,
      evidenceId: 'lagrange-new-order-contention-v1',
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      admissionSha256: context.admission.admissionSha256,
      runtimePreflightSha256: context.runtimePreflight.preflightSha256,
      requiredCoreHeadSha: context.admission.requiredCoreHeadSha,
      srcFingerprint: context.runtimePreflight.observedSrcFingerprint,
      publicExecutionContract: context.publicExecutionContract,
      serviceEndpoint: context.serviceEndpoint,
      logicalResults,
      observation,
      evaluation,
      comparable: false,
      nonComparableReason:
        'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.',
    });
    const artifactSha256 = canonicalPayloadDigest(payload);
    evidence = Object.freeze({
      ...payload,
      proofRecord: Object.freeze({
        evidenceId: payload.evidenceId,
        system: payload.system,
        status: evaluation.passed ?
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
        artifactSha256,
        proofIds: context.admission.proofIds,
      }),
      artifactSha256,
    });
    if (!evaluation.passed) {
      const error = new Error(
        `Lagrange new-order contention semantic proof failed: ${evaluation.failures.join(',')}`,
      );
      error.semanticEvidence = evidence;
      throw error;
    }
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  if (adapter) {
    try {
      await adapter.close({dropTables: false});
    } catch (error) {
      cleanupError = error;
    }
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'Lagrange contention proof and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return evidence;
}

export {
  runLagrangeScenarioANewOrderContentionProof,
};
