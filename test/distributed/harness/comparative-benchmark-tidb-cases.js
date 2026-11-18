import {
  OLTP_PAIRED_RETRY_OUTCOME,
  executePairedOltpTransactionWithRetry,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
  buildScenarioADeliveryCase,
  evaluateScenarioADeliveryObservation,
} from './oltp-scenario-a-delivery-case.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  buildScenarioADurabilityCase,
  evaluateScenarioADurabilityObservation,
} from './oltp-scenario-a-durability-case.js';
import {
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_WORKLOAD,
  buildScenarioAFailureAtomicityCase,
  evaluateScenarioAFailureAtomicityObservation,
} from './oltp-scenario-a-failure-atomicity-case.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
  buildScenarioANewOrderContentionCase,
  evaluateScenarioANewOrderContentionObservation,
} from './oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
  OLTP_SCENARIO_A_ORDER_STATUS_WORKLOAD,
  buildScenarioAOrderStatusCase,
  evaluateScenarioAOrderStatusObservation,
} from './oltp-scenario-a-order-status-case.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
} from './oltp-scenario-a-payment-case.js';
import {
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
} from './oltp-scenario-a-retryable-conflict-case.js';
import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
  buildScenarioAStockLevelCase,
  evaluateScenarioAStockLevelObservation,
} from './oltp-scenario-a-stock-level-case.js';
import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
  OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
} from './oltp-scenario-a-visibility-case.js';
import {
  arrayIncludes,
  arrayIsArray,
  arrayPush,
  objectFreeze,
  objectHasOwn,
  toNumber,
} from './real-product-captured-intrinsics.js';
import {errorText} from './real-product-remote-shell.js';
import {OLTP_ADAPTER_KEEP_DATASET} from '../reference-client/oltp-adapter-contract.js';
import {observeTiDbDeliveryState} from '../reference-client/tidb-delivery-observer.js';
import {observeTiDbNewOrderContentionState} from '../reference-client/tidb-new-order-contention-observer.js';
import {createTiDbOltpAdapter} from '../reference-client/tidb-oltp-adapter.js';
import {observeTiDbOltpStateSnapshot} from '../reference-client/tidb-oltp-state-snapshot.js';
import {observeTiDbPaymentState} from '../reference-client/tidb-payment-observer.js';
import {induceTiDbRetryableConflict} from '../reference-client/tidb-retryable-conflict-probe.js';
import {runTiDbVisibilityProbe} from '../reference-client/tidb-visibility-probe.js';
import {buildProofEvidence} from '../scenarios/scenario-a-lagrange-shared.js';

const SYSTEM_TIDB = 'tidb-tikv';
const DURABILITY_CASE_ID = 'durability';
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';

const RETRYABLE_CONFLICT_WORKLOAD = objectFreeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 1,
  itemCount: 15,
});

const TIDB_DATABASE_BY_CASE = objectFreeze({
  'new-order-contention': 'bench_gate_new_order_contention',
  'visibility': 'bench_gate_visibility',
  'payment': 'bench_gate_payment',
  'order-status': 'bench_gate_order_status',
  'delivery': 'bench_gate_delivery',
  'stock-level': 'bench_gate_stock_level',
  'failure-atomicity': 'bench_gate_failure_atomicity',
  'retryable-conflict': 'bench_gate_retryable_conflict',
  [DURABILITY_CASE_ID]: 'bench_gate_durability',
});

const TIDB_EXECUTED_CASE_IDS = objectFreeze([
  'new-order-contention',
  'visibility',
  'payment',
  'order-status',
  'delivery',
  'stock-level',
  'failure-atomicity',
  'retryable-conflict',
  DURABILITY_CASE_ID,
]);

function ownField(record, key) {
  return record !== null && typeof record === 'object' && !arrayIsArray(record) &&
    typeof key === 'string' && objectHasOwn(record, key) ? record[key] : undefined;
}

function copyArray(items) {
  if (!arrayIsArray(items)) return [];
  const out = [];
  for (let index = 0; index < items.length; index += 1) {
    arrayPush(out, items[index]);
  }
  return out;
}

async function defaultMysqlConnection(connOpts) {
  const mysql = await import('mysql2/promise');
  const hasDirectCreate = mysql !== null &&
    (typeof mysql === 'object' || typeof mysql === 'function') &&
    objectHasOwn(mysql, 'createConnection') &&
    typeof mysql.createConnection === 'function';
  const driver = hasDirectCreate ? mysql : mysql.default;
  return driver.createConnection(connOpts);
}

function mysqlConnectionFactoryOf(connection, createMysqlConnection) {
  const rawFactory = createMysqlConnection || defaultMysqlConnection;
  const credentials = ownField(connection, 'credentials');
  const user = ownField(credentials, 'user');
  const password = ownField(credentials, 'password');
  return (connOpts) => rawFactory({
    ...connOpts,
    ...(typeof user === 'string' && user !== '' ? {user} : {}),
    ...(password !== undefined ? {password} : {}),
  });
}

async function openValidatedTiDbAdapter({endpoint, databaseName, workload, expectedDatasetSha256,
  createConnection, caseId}) {
  const adapter = await createTiDbOltpAdapter({
    endpoint,
    databaseName,
    workload,
    createConnection,
  });
  if (expectedDatasetSha256 && adapter.datasetSha256 !== expectedDatasetSha256) {
    await adapter.close();
    throw new Error(`TiDB ${caseId} proof dataset identity mismatch`);
  }
  return adapter;
}

function buildTiDbCasePayload({evidenceId, definition, binding, endpoint, extra}) {
  return objectFreeze({
    schemaVersion: 1,
    evidenceId,
    system: SYSTEM_TIDB,
    caseId: definition.identity.caseId,
    caseSha256: definition.caseSha256,
    datasetSha256: definition.identity.datasetSha256,
    endpoint,
    binding,
    ...extra,
    comparable: false,
    nonComparableReason: NON_COMPARABLE_REASON,
  });
}

async function closeTiDbAdapter(adapter, closeOptions = {}) {
  if (!adapter) return;
  await adapter.close(closeOptions);
}

async function dropTiDbDatabase(endpoint, databaseName, createConnection) {
  const conn = await createConnection({
    host: endpoint.host,
    port: endpoint.port,
    user: 'root',
    password: '',
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
  } finally {
    await conn.end();
  }
}

function contentionItemIds() {
  const ids = [];
  for (let opIdx = 0; opIdx < OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS.length; opIdx += 1) {
    const op = OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS[opIdx];
    for (let lineIdx = 0; lineIdx < op.lines.length; lineIdx += 1) {
      const itemId = op.lines[lineIdx].itemId;
      if (!arrayIncludes(ids, itemId)) arrayPush(ids, itemId);
    }
  }
  return ids.sort((left, right) => left - right);
}

async function executeContentionRequest(adapter, operation) {
  const retryOutcome = await executePairedOltpTransactionWithRetry({
    executeAttempt: () => adapter.executeTransaction(operation),
  });
  return objectFreeze({
    phase: operation.phase,
    workerId: operation.workerId,
    sequence: operation.sequence,
    status: retryOutcome.outcome === OLTP_PAIRED_RETRY_OUTCOME.COMMITTED ?
      'committed' : 'aborted',
    orderId: toNumber(retryOutcome.result?.orderId || 0),
    retryEvidence: retryOutcome.evidence,
  });
}

async function executeTiDbNewOrderContentionCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioANewOrderContentionCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE['new-order-contention'];
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: 'new-order-contention',
  });
  try {
    const logicalResults = [];
    for (let idx = 0; idx < OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS.length; idx += 1) {
      logicalResults.push(await executeContentionRequest(
        adapter, OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS[idx]));
    }
    const observedState = await observeTiDbNewOrderContentionState({
      endpoint: connection.endpoint,
      databaseName,
      itemIds: contentionItemIds(),
      createConnection,
    });
    let logicalCommitted = 0;
    for (let idx = 0; idx < logicalResults.length; idx += 1) {
      if (logicalResults[idx].status === 'committed') logicalCommitted += 1;
    }
    const observation = objectFreeze({
      logicalCommitted,
      ...observedState,
    });
    const evaluation = evaluateScenarioANewOrderContentionObservation(observation);
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-new-order-contention',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {logicalResults, observation, evaluation},
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

async function executeTiDbVisibilityCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioAVisibilityCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE.visibility;
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: 'visibility',
  });
  try {
    const observation = await runTiDbVisibilityProbe({
      endpoint: connection.endpoint,
      databaseName,
      warehouseId: definition.identity.target.key.id,
      writeDeltaCents: definition.identity.writeDeltaCents,
      createConnection,
    });
    const evaluation = evaluateScenarioAVisibilityObservation(observation);
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-visibility',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {observation, evaluation},
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

async function executeTiDbPaymentCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioAPaymentCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE.payment;
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: 'payment',
  });
  try {
    const retryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
    });
    const observedState = await observeTiDbPaymentState({
      endpoint: connection.endpoint,
      databaseName,
      operation: definition.identity.operation,
      createConnection,
    });
    const observation = objectFreeze({
      paidCents: toNumber(retryOutcome.result?.paidCents),
      ...observedState,
    });
    const evaluation = evaluateScenarioAPaymentObservation(observation);
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-payment',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {
        operation: definition.identity.operation,
        retryEvidence: retryOutcome.evidence,
        observation,
        evaluation,
      },
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

async function executeTiDbOrderStatusCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioAOrderStatusCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE['order-status'];
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: OLTP_SCENARIO_A_ORDER_STATUS_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: 'order-status',
  });
  try {
    const setupOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.setupOperation),
    });
    if (toNumber(setupOutcome.result?.orderId) !== definition.identity.expected.orderId) {
      throw new Error('TiDB order-status setup allocated unexpected order id');
    }
    const before = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    const readOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
    });
    const after = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    const observation = objectFreeze({
      orderId: toNumber(readOutcome.result?.orderId),
      lineCount: toNumber(readOutcome.result?.lineCount),
      lines: readOutcome.result?.lines || [],
      stateBeforeSha256: before.stateSha256,
      stateAfterSha256: after.stateSha256,
    });
    const evaluation = evaluateScenarioAOrderStatusObservation(observation);
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-order-status',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {
        setupOperation: definition.identity.setupOperation,
        operation: definition.identity.operation,
        setupRetryEvidence: setupOutcome.evidence,
        retryEvidence: readOutcome.evidence,
        observation,
        evaluation,
      },
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

async function executeTiDbDeliveryCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioADeliveryCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE.delivery;
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: 'delivery',
  });
  try {
    const setupRetryEvidence = [];
    for (let idx = 0; idx < definition.identity.setupOperations.length; idx += 1) {
      const setupOperation = definition.identity.setupOperations[idx];
      const setupOutcome = await executePairedOltpTransactionWithRetry({
        executeAttempt: () => adapter.executeTransaction(setupOperation),
      });
      let expectedDistrict = null;
      for (let dIdx = 0; dIdx < definition.identity.expected.districts.length; dIdx += 1) {
        if (definition.identity.expected.districts[dIdx].districtId === setupOperation.districtId) {
          expectedDistrict = definition.identity.expected.districts[dIdx];
          break;
        }
      }
      if (!expectedDistrict ||
          toNumber(setupOutcome.result?.orderId) !== expectedDistrict.orderId) {
        throw new Error(
          `TiDB delivery setup allocated unexpected order id for district ${setupOperation.districtId}`,
        );
      }
      setupRetryEvidence.push(setupOutcome.evidence);
    }
    const deliveryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
    });
    const observed = await observeTiDbDeliveryState({
      endpoint: connection.endpoint,
      databaseName,
      warehouseId: definition.identity.operation.warehouseId,
      districts: definition.identity.expected.districts,
      createConnection,
    });
    const observation = objectFreeze({
      deliveredOrders: toNumber(deliveryOutcome.result?.deliveredOrders),
      districts: observed.districts,
    });
    const evaluation = evaluateScenarioADeliveryObservation(observation);
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-delivery',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {
        setupOperations: definition.identity.setupOperations,
        operation: definition.identity.operation,
        setupRetryEvidence: objectFreeze(setupRetryEvidence),
        retryEvidence: deliveryOutcome.evidence,
        observation,
        evaluation,
      },
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

async function executeTiDbStockLevelCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioAStockLevelCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE['stock-level'];
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: 'stock-level',
  });
  try {
    const setupOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.setupOperation),
    });
    if (toNumber(setupOutcome.result?.orderId) !== definition.identity.expected.setupOrderId) {
      throw new Error('TiDB stock-level setup allocated unexpected order id');
    }
    const before = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    const readOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
    });
    const after = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    const observation = objectFreeze({
      lowStock: toNumber(readOutcome.result?.lowStock),
      stateBeforeSha256: before.stateSha256,
      stateAfterSha256: after.stateSha256,
    });
    const evaluation = evaluateScenarioAStockLevelObservation(observation);
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-stock-level',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {
        setupOperation: definition.identity.setupOperation,
        operation: definition.identity.operation,
        setupRetryEvidence: setupOutcome.evidence,
        retryEvidence: readOutcome.evidence,
        observation,
        evaluation,
      },
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

function isTerminalRetryClassificationValid(error) {
  const retryEvidence = ownField(error, 'oltpRetryEvidence');
  if (!retryEvidence) return false;
  if (toNumber(ownField(retryEvidence, 'retries')) !== 0 ||
      toNumber(ownField(retryEvidence, 'attempts')) !== 1) {
    return false;
  }
  const failures = ownField(retryEvidence, 'failures');
  if (!arrayIsArray(failures) || failures.length !== 1) return false;
  const failure = failures[0];
  return ownField(failure, 'outcome') === OLTP_PAIRED_RETRY_OUTCOME.TERMINAL_FAILURE &&
    ownField(failure, 'retryable') === false;
}

function finalizeFailureAtomicityEvaluation(baseEvaluation, terminalError) {
  if (!terminalError || isTerminalRetryClassificationValid(terminalError)) return baseEvaluation;
  const failures = copyArray(baseEvaluation.failures);
  arrayPush(failures, 'terminal_retry_classification');
  return objectFreeze({
    ...baseEvaluation,
    passed: false,
    failures: objectFreeze(failures),
    proofIds: objectFreeze([]),
  });
}

async function executeTiDbFailureAtomicityCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioAFailureAtomicityCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE['failure-atomicity'];
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: OLTP_SCENARIO_A_FAILURE_ATOMICITY_WORKLOAD,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: 'failure-atomicity',
  });
  try {
    const before = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    let terminalError = null;
    try {
      await executePairedOltpTransactionWithRetry({
        executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
      });
    } catch (error) {
      terminalError = error;
    }
    const after = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    const observation = objectFreeze({
      terminalFailureObserved: Boolean(terminalError),
      errorMessage: terminalError ? errorText(terminalError) : '',
      stateBeforeSha256: before.stateSha256,
      stateAfterSha256: after.stateSha256,
    });
    const evaluation = finalizeFailureAtomicityEvaluation(
      evaluateScenarioAFailureAtomicityObservation(observation),
      terminalError,
    );
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-failure-atomicity',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {
        operation: definition.identity.operation,
        retryEvidence: ownField(terminalError, 'oltpRetryEvidence') ?? null,
        observation,
        evaluation,
      },
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

async function executeTiDbRetryableConflictCase({connection, binding, createMysqlConnection}) {
  const definition = buildScenarioARetryableConflictCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE['retryable-conflict'];
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: RETRYABLE_CONFLICT_WORKLOAD,
    expectedDatasetSha256: null,
    createConnection,
    caseId: 'retryable-conflict',
  });
  try {
    const probe = await induceTiDbRetryableConflict({
      endpoint: connection.endpoint,
      databaseName,
      warehouseId: 1,
      createConnection,
    });
    const observation = probe.observation;
    const evaluation = evaluateScenarioARetryableConflictObservation(observation);
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-retryable-conflict',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {
        observation,
        evaluation,
        victim: probe.victim,
        probeResults: probe.results,
      },
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closeTiDbAdapter(adapter);
  }
}

async function executeTiDbDurabilityBefore({connection, createMysqlConnection}) {
  const definition = buildScenarioADurabilityCase();
  const payment = buildScenarioAPaymentCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE[DURABILITY_CASE_ID];
  const adapter = await openValidatedTiDbAdapter({
    endpoint: connection.endpoint,
    databaseName,
    workload: definition.identity.workload,
    expectedDatasetSha256: definition.identity.datasetSha256,
    createConnection,
    caseId: DURABILITY_CASE_ID,
  });
  try {
    const retryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
    });
    const paymentBeforeRestart = await observeTiDbPaymentState({
      endpoint: connection.endpoint,
      databaseName,
      operation: payment.identity.operation,
      createConnection,
    });
    const stateBeforeRestart = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    return {
      paidCents: toNumber(retryOutcome.result?.paidCents),
      retryEvidence: retryOutcome.evidence,
      paymentBeforeRestart,
      stateBeforeRestart,
    };
  } finally {
    await closeTiDbAdapter(adapter, OLTP_ADAPTER_KEEP_DATASET);
  }
}

async function executeTiDbDurabilityAfter({connection, binding, before, faultEvidence,
  createMysqlConnection}) {
  const definition = buildScenarioADurabilityCase();
  const payment = buildScenarioAPaymentCase();
  const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
  const databaseName = TIDB_DATABASE_BY_CASE[DURABILITY_CASE_ID];
  try {
    const paymentAfterRestart = await observeTiDbPaymentState({
      endpoint: connection.endpoint,
      databaseName,
      operation: payment.identity.operation,
      createConnection,
    });
    const stateAfterRestart = await observeTiDbOltpStateSnapshot({
      endpoint: connection.endpoint,
      databaseName,
      createConnection,
    });
    const paymentObservation = objectFreeze({
      paidCents: before.paidCents,
      ...paymentAfterRestart,
    });
    const evaluation = evaluateScenarioADurabilityObservation({
      commitAcknowledged: true,
      paymentObservation,
      stateBeforeRestartSha256: before.stateBeforeRestart.stateSha256,
      stateAfterRestartSha256: stateAfterRestart.stateSha256,
      faultEvidence,
    });
    const payload = buildTiDbCasePayload({
      evidenceId: 'tidb-scenario-a-durability',
      definition,
      binding,
      endpoint: connection.endpoint,
      extra: {
        operation: definition.identity.operation,
        retryEvidence: before.retryEvidence ?? null,
        paymentBeforeRestart: before.paymentBeforeRestart,
        paymentAfterRestart,
        stateBeforeRestartSha256: before.stateBeforeRestart.stateSha256,
        stateAfterRestartSha256: stateAfterRestart.stateSha256,
        faultEvidence,
        evaluation,
      },
    });
    const evidence = buildProofEvidence({
      payload,
      proofIds: OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
      evaluation,
    });
    return {evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await dropTiDbDatabase(connection.endpoint, databaseName, createConnection);
  }
}

const TIDB_CASE_EXECUTORS = objectFreeze({
  'new-order-contention': executeTiDbNewOrderContentionCase,
  'visibility': executeTiDbVisibilityCase,
  'payment': executeTiDbPaymentCase,
  'order-status': executeTiDbOrderStatusCase,
  'delivery': executeTiDbDeliveryCase,
  'stock-level': executeTiDbStockLevelCase,
  'failure-atomicity': executeTiDbFailureAtomicityCase,
  'retryable-conflict': executeTiDbRetryableConflictCase,
});

export {
  TIDB_CASE_EXECUTORS,
  TIDB_DATABASE_BY_CASE,
  TIDB_EXECUTED_CASE_IDS,
  dropTiDbDatabase,
  executeTiDbDurabilityAfter,
  executeTiDbDurabilityBefore,
  mysqlConnectionFactoryOf,
};
