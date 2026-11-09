/**
 * The Scenario A semantic-gate stage of a campaign run, before the measured
 * window: B1's PG-wire proof journey
 * (test/distributed/scenarios/scenario-a-semantic-proof-journey.js) runs
 * against the deployed arm, bound to the container that owns its endpoint,
 * with the two hooks only this layer can supply:
 * - beforeCase: Lagrange cannot drop tables in place, so every proof case
 *   after the first runs on a fresh formation of the arm (teardown of the
 *   campaign's containers, redeploy, readiness, identity, endpoint binding);
 *   PostgreSQL and TiDB reset through their adapters;
 * - restartProduct: `docker restart` of an eligible data-bearing replica
 *   container, its readiness contract again, identity re-inspected (new
 *   StartedAt and preserved storage mounts).
 * Proofs retain the exact deployment bindings on which they ran; re-forming
 * before measurement never rewrites prior proof bindings.
 * When `loadGeneratorHost` is supplied (as on GCP where data-host endpoints are
 * private VPC addresses), database proof operations execute from the load
 * generator over SSH while lifecycle hooks remain on the controller.
 */
import {Buffer} from 'node:buffer';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  OLTP_PAIRED_RETRY_OUTCOME,
  executePairedOltpTransactionWithRetry,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_DURABILITY_FAULT_EVIDENCE_CODES,
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
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
} from './oltp-scenario-a-payment-case.js';
import {OLTP_SCENARIO_A_PROOF_CASES} from './oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_PROOF_FAILURE_KIND,
  buildScenarioASemanticGateEvidence,
} from './oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
  OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
} from './oltp-scenario-a-visibility-case.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  READINESS_STATE,
  RUN_CLASS,
  STORAGE_KIND,
} from './real-product-deployment-contract.js';
import {inspectProducts, runClassOf} from './real-product-identity.js';
import {errorText, shellWord} from './real-product-remote-shell.js';
import {
  PGWIRE_OLTP_EXECUTION_PATH,
  PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE,
  PGWIRE_OLTP_PROTOCOL,
  PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE,
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';
import {
  observeLagrangeOltpStateSnapshot,
} from '../reference-client/lagrange-oltp-state-snapshot.js';
import {
  observeLagrangePaymentState,
} from '../reference-client/lagrange-payment-observer.js';
import {
  OLTP_ADAPTER_KEEP_DATASET,
} from '../reference-client/oltp-adapter-contract.js';
import {
  createPostgreSqlOltpAdapter,
} from '../reference-client/postgresql-oltp-adapter.js';
import {createTiDbOltpAdapter} from '../reference-client/tidb-oltp-adapter.js';
import {
  observeTiDbOltpStateSnapshot,
} from '../reference-client/tidb-oltp-state-snapshot.js';
import {
  observeTiDbPaymentState,
} from '../reference-client/tidb-payment-observer.js';
import {runTiDbVisibilityProbe} from '../reference-client/tidb-visibility-probe.js';
import {executeProof as executeDeliveryProof} from '../scenarios/scenario-a-delivery-lagrange.js';
import {
  executeProof as executeFailureAtomicityProof,
} from '../scenarios/scenario-a-failure-atomicity-lagrange.js';
import {
  buildBasePayload,
  buildProofEvidence,
  createAndValidateAdapter,
} from '../scenarios/scenario-a-lagrange-shared.js';
import {
  executeProof as executeNewOrderContentionProof,
} from '../scenarios/scenario-a-new-order-contention-lagrange.js';
import {
  executeProof as executeOrderStatusProof,
} from '../scenarios/scenario-a-order-status-lagrange.js';
import {executeProof as executePaymentProof} from '../scenarios/scenario-a-payment-lagrange.js';
import {
  executeProof as executeRetryableConflictProof,
} from '../scenarios/scenario-a-retryable-conflict-lagrange.js';
import {
  executeProof as executeStockLevelProof,
} from '../scenarios/scenario-a-stock-level-lagrange.js';
import {
  executeProof as executeVisibilityProof,
} from '../scenarios/scenario-a-visibility-lagrange.js';

const SYSTEM = Object.freeze({
  LAGRANGE: 'lagrange',
  POSTGRESQL: 'postgresql',
  TIDB_TIKV: 'tidb-tikv',
});
const EVENT = Object.freeze({
  NOT_RUN: 'semantic-gate-not-run',
  RE_FORMATION: 're-formation',
  DATASET_RESET: 'dataset-reset',
  PRODUCT_RESTART: 'product-restart',
});
const REMOTE_ACTION = Object.freeze({
  PG_CASE: 'pg-case',
  PG_DURABILITY_BEFORE: 'pg-durability-before',
  PG_DURABILITY_AFTER: 'pg-durability-after',
  TIDB_CASE: 'tidb-case',
  TIDB_DURABILITY_BEFORE: 'tidb-durability-before',
  TIDB_DURABILITY_AFTER: 'tidb-durability-after',
  TIDB_DURABILITY_CLEANUP: 'tidb-durability-cleanup',
});
const RESTART_GRACE_SECONDS = 1;
const BEFORE_MEASUREMENT = 'before-measurement';
const DURABILITY_CASE_ID = 'durability';
const NON_COMPARABLE_REASON =
  'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.';

const DATA_REPLICA_ROLES = Object.freeze([
  'lagrange-node',
  'postgres-primary',
  'postgres-standby',
  'tikv',
]);
const ENDPOINT_ONLY_ROLES = Object.freeze([
  'tidb',
  'pg-host-only',
  'sys-postgres-wire',
]);
const RETAINED_OBLIGATIONS = Object.freeze([
  'committed_payment_rows',
  'full_oltp_state_sha256',
]);
const STORAGE_CONTINUITY_PRESERVED = 'preserved';
const STORAGE_CONTINUITY_UNPRESERVED = 'unpreserved';
const TIKV_ROLE = 'tikv';

const TIDB_DATABASE_BY_CASE = Object.freeze({
  'visibility': 'bench_gate_visibility',
  'payment': 'bench_gate_payment',
  'failure-atomicity': 'bench_gate_failure_atomicity',
  [DURABILITY_CASE_ID]: 'bench_gate_durability',
});
const TIDB_EXECUTED_CASE_IDS = Object.freeze([
  'visibility',
  'payment',
  'failure-atomicity',
  DURABILITY_CASE_ID,
]);

const PG_CASE_EXECUTORS = Object.freeze({
  'new-order-contention': executeNewOrderContentionProof,
  'visibility': executeVisibilityProof,
  'payment': executePaymentProof,
  'order-status': executeOrderStatusProof,
  'delivery': executeDeliveryProof,
  'stock-level': executeStockLevelProof,
  'failure-atomicity': executeFailureAtomicityProof,
  'retryable-conflict': executeRetryableConflictProof,
});

const REMOTE_GATE_SCRIPT = [
  'import {executeRemoteGateAction} from',
  '  "./test/distributed/harness/comparative-benchmark-semantic-gate.js";',
  'const req = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));',
  'process.stdout.write(`${JSON.stringify(await executeRemoteGateAction(req))}\\n`);',
].join(' ');

function connectionOf(deployment) {
  return {
    endpoint: {host: deployment.endpoint.host, port: deployment.endpoint.port},
    credentials: deployment.access?.connection ?? null,
  };
}

function bindingOf(manifest, deployment) {
  const endpoint = deployment.endpoint;
  const products = Array.isArray(deployment.identity?.products) ?
    deployment.identity.products : [];
  const product = arrayFind(products, (one) => one.containerId === endpoint.containerId);
  return {
    campaignId: manifest.campaignId,
    containerId: endpoint.containerId,
    imageId: product?.imageId ?? null,
    endpoint: `${endpoint.host}:${endpoint.port}`,
  };
}

// Durability is provable only where every data directory survives its
// container: the storage the identity owner classes as publishable.
function hasPersistentStorage(deployment) {
  const storage = Array.isArray(deployment?.storage) ? deployment.storage : [];
  return runClassOf(storage) === RUN_CLASS.PUBLISHABLE;
}

function productRoleOf(product) {
  if (!product || typeof product !== 'object') return '';
  return typeof product.role === 'string' ? stringTrim(product.role) : '';
}

function incarnationOfProduct(product) {
  if (!product || typeof product !== 'object') return null;
  const containerId = typeof product.containerId === 'string' ?
    stringTrim(product.containerId) : '';
  const startedAt = typeof product.startedAt === 'string' ?
    stringTrim(product.startedAt) : '';
  if (!containerId || !startedAt) return null;
  return `${containerId}:${startedAt}`;
}

function resolveIncarnationPair(beforeProduct, afterProduct) {
  const beforeIncarnation = incarnationOfProduct(beforeProduct);
  const afterIncarnation = incarnationOfProduct(afterProduct);
  if (!beforeIncarnation || !afterIncarnation) {
    return {beforeIncarnation, afterIncarnation};
  }
  const beforeMs = Date.parse(beforeProduct.startedAt);
  const afterMs = Date.parse(afterProduct.startedAt);
  if (Number.isFinite(beforeMs) && Number.isFinite(afterMs) && afterMs <= beforeMs) {
    return {beforeIncarnation, afterIncarnation: beforeIncarnation};
  }
  return {beforeIncarnation, afterIncarnation};
}

function hasMatchingBindMount(product, storageEntry) {
  if (!Array.isArray(product?.mounts)) return false;
  return arraySome(product.mounts, (mount) =>
    mount?.type === 'bind' &&
    mount?.destination === storageEntry.mount &&
    mount?.source === storageEntry.source);
}

function findHostVolumeEntry(deployment, targetContainerId) {
  if (!hasPersistentStorage(deployment)) return null;
  const storageEntries = Array.isArray(deployment?.storage) ? deployment.storage : [];
  const entry = arrayFind(storageEntries, (item) => item.containerId === targetContainerId);
  if (entry?.kind !== STORAGE_KIND.HOST_VOLUME) return null;
  const source = typeof entry.source === 'string' ? stringTrim(entry.source) : '';
  const mountPath = typeof entry.mount === 'string' ? stringTrim(entry.mount) : '';
  return source && mountPath ? entry : null;
}

function observeStorageContinuity(deployment, targetContainerId, beforeProduct, afterProduct) {
  const storageEntry = findHostVolumeEntry(deployment, targetContainerId);
  if (!storageEntry) return STORAGE_CONTINUITY_UNPRESERVED;
  if (Array.isArray(beforeProduct?.mounts) && !hasMatchingBindMount(beforeProduct, storageEntry)) {
    return STORAGE_CONTINUITY_UNPRESERVED;
  }
  return hasMatchingBindMount(afterProduct, storageEntry) ?
    STORAGE_CONTINUITY_PRESERVED : STORAGE_CONTINUITY_UNPRESERVED;
}

function isReadinessSatisfied(readiness) {
  if (!readiness || typeof readiness !== 'object') return false;
  if (readiness.ready === false) return false;
  if ('state' in readiness && readiness.state !== READINESS_STATE.READY) return false;
  return true;
}

/**
 * Derive canonical durability fault evidence from the observed deployment,
 * restarted container identity before and after restart, and post-restart
 * readiness evidence.
 *
 * @param {{deployment: Object, target: {host: string, containerId: string},
 *   beforeProduct: Object|null, afterProduct: Object|null,
 *   readiness: Object|null}} input
 * @return {Object}
 */
function buildObservedFaultEvidence({deployment, target, beforeProduct, afterProduct, readiness}) {
  const observedRole = productRoleOf(beforeProduct);
  const nodeId = typeof target?.containerId === 'string' ? stringTrim(target.containerId) : '';
  const isDataReplica = arrayIncludes(DATA_REPLICA_ROLES, observedRole);
  const pgHostOnly = arrayIncludes(ENDPOINT_ONLY_ROLES, observedRole);
  const {beforeIncarnation, afterIncarnation} = resolveIncarnationPair(beforeProduct, afterProduct);
  const storageContinuity = observeStorageContinuity(
    deployment, nodeId, beforeProduct, afterProduct);
  const retainedObligations = storageContinuity === STORAGE_CONTINUITY_PRESERVED &&
    isReadinessSatisfied(readiness) ? RETAINED_OBLIGATIONS : Object.freeze([]);
  return Object.freeze({
    faultTarget: Object.freeze({
      nodeId,
      role: observedRole,
      isDataReplica,
      pgHostOnly,
    }),
    beforeIncarnation,
    afterIncarnation,
    storageContinuity,
    retainedObligations,
  });
}

function selectTargetByOverride(products, request) {
  const requestedId = typeof request?.targetContainerId === 'string' ?
    stringTrim(request.targetContainerId) : '';
  if (requestedId) {
    const byId = arrayFind(products, (one) => one.containerId === requestedId);
    if (!byId) throw new Error(`durability restart target container ${requestedId} not found`);
    return {host: byId.host, containerId: byId.containerId};
  }
  const requestedRole = typeof request?.targetRole === 'string' ?
    stringTrim(request.targetRole) : '';
  if (requestedRole) {
    const byRole = arrayFind(products, (one) => productRoleOf(one) === requestedRole);
    if (!byRole) throw new Error(`durability restart target role ${requestedRole} not found`);
    return {host: byRole.host, containerId: byRole.containerId};
  }
  return null;
}

function selectDurabilityFaultTarget(system, deployment, request) {
  const products = Array.isArray(deployment?.identity?.products) ?
    deployment.identity.products : [];
  const explicit = selectTargetByOverride(products, request);
  if (explicit) return explicit;
  if (system === SYSTEM.TIDB_TIKV) {
    const tikv = arrayFind(products, (one) => productRoleOf(one) === TIKV_ROLE);
    if (tikv) return {host: tikv.host, containerId: tikv.containerId};
  }
  return {host: deployment.endpoint.host, containerId: deployment.endpoint.containerId};
}

function preserveReportedIdentity(inspected, previousByContainer) {
  const prev = previousByContainer.get(inspected.containerId);
  if (!prev) return inspected;
  return {
    ...inspected,
    reportedVersion: prev.reportedVersion ?? null,
    ...(prev.reportedVersion === null ?
      {reportedVersionError: prev.reportedVersionError ?? null} : {}),
    ...(prev.bootProvenance !== undefined ?
      {bootProvenance: prev.bootProvenance} : {}),
  };
}

async function persistGateArtifact(evidenceDir, fileName, payload) {
  if (!evidenceDir) return null;
  await mkdir(evidenceDir, {recursive: true});
  const outputPath = path.join(evidenceDir, fileName);
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function runRemoteNodeJson(sshRun, opts, host, script, payload) {
  const nodeBinary = typeof host.nodePath === 'string' && host.nodePath !== '' ?
    host.nodePath : 'node';
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const command = `cd ${shellWord(host.repoPath)} && ${shellWord(nodeBinary)} ` +
    `--input-type=module -e ${shellWord(script)} ${shellWord(encoded)}`;
  const stdout = stringTrim(String(await sshRun(host.ip, opts, command)));
  const lines = arrayFilter(stringSplit(stdout, '\n'), (line) => stringTrim(line) !== '');
  return JSON.parse(lines[lines.length - 1]);
}

function classifyCaseFailure(caseId, failures) {
  const codes = Array.isArray(failures) ? failures : [];
  if (caseId === DURABILITY_CASE_ID && codes.length > 0 &&
      arrayEvery(codes, (code) =>
        arrayIncludes(OLTP_SCENARIO_A_DURABILITY_FAULT_EVIDENCE_CODES, code))) {
    return OLTP_SCENARIO_A_PROOF_FAILURE_KIND.EVIDENCE_INSUFFICIENT;
  }
  return OLTP_SCENARIO_A_PROOF_FAILURE_KIND.PRODUCT_ANOMALY;
}

function pgWireContextOf(req) {
  const lockingReadMode = req.system === SYSTEM.LAGRANGE ?
    PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE : PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE;
  return {
    system: req.system,
    endpoint: req.connection.endpoint,
    connection: req.connection.credentials,
    binding: req.binding,
    serviceEndpoint: null,
    admission: null,
    runtimePreflight: null,
    publicExecutionContract: {
      protocol: PGWIRE_OLTP_PROTOCOL,
      executionPath: PGWIRE_OLTP_EXECUTION_PATH,
      lockingReadMode,
    },
  };
}

function pgAdapterFactoryOf(system, createPgClient) {
  const baseFactory = system === SYSTEM.LAGRANGE ?
    createLagrangeOltpAdapter : createPostgreSqlOltpAdapter;
  if (!createPgClient) return baseFactory;
  return (adapterOptions) => baseFactory({...adapterOptions, createClient: createPgClient});
}

async function closePgAdapterQuietly(adapter, diagnostics) {
  if (!adapter) return;
  try {
    await adapter.close(OLTP_ADAPTER_KEEP_DATASET);
  } catch (error) {
    diagnostics.push(errorText(error));
  }
}

async function executeRemotePgCase(req, overrides) {
  const executor = PG_CASE_EXECUTORS[req.caseId];
  if (!executor) throw new Error(`unknown remote PG Scenario A case ${req.caseId}`);
  const context = pgWireContextOf(req);
  const createAdapter = pgAdapterFactoryOf(req.system, overrides.createPgClient);
  const cleanupDiagnostics = [];
  let adapter = null;
  try {
    const outcome = await executor({
      context,
      options: {
        createAdapter,
        prepareContext: async () => context,
        persistentStorage: req.persistentStorage,
      },
      cluster: null,
    });
    adapter = outcome.adapter;
    const evidence = buildProofEvidence(outcome);
    return {evaluation: outcome.evaluation, proofRecord: evidence.proofRecord, evidence};
  } finally {
    await closePgAdapterQuietly(adapter, cleanupDiagnostics);
  }
}

async function executeRemotePgDurabilityBefore(req, overrides) {
  const context = pgWireContextOf(req);
  const createAdapter = pgAdapterFactoryOf(req.system, overrides.createPgClient);
  const definition = buildScenarioADurabilityCase();
  const payment = buildScenarioAPaymentCase();
  const adapter = await createAndValidateAdapter({
    createAdapter,
    context,
    workload: definition.identity.workload,
    expectedDatasetSha256: definition.identity.datasetSha256,
    proofCaseId: DURABILITY_CASE_ID,
  });
  const cleanupDiagnostics = [];
  try {
    const retryOutcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(definition.identity.operation),
    });
    const clientOpt = overrides.createPgClient ? {createClient: overrides.createPgClient} : {};
    const paymentBeforeRestart = await observeLagrangePaymentState({
      endpoint: context.endpoint,
      connection: context.connection,
      operation: payment.identity.operation,
      ...clientOpt,
    });
    const stateBeforeRestart = await observeLagrangeOltpStateSnapshot({
      endpoint: context.endpoint,
      connection: context.connection,
      ...clientOpt,
    });
    return {
      paidCents: Number(retryOutcome.result?.paidCents),
      retryEvidence: retryOutcome.evidence,
      paymentBeforeRestart,
      stateBeforeRestart,
    };
  } finally {
    await closePgAdapterQuietly(adapter, cleanupDiagnostics);
  }
}

async function executeRemotePgDurabilityAfter(req, overrides) {
  const context = pgWireContextOf(req);
  const definition = buildScenarioADurabilityCase();
  const payment = buildScenarioAPaymentCase();
  const clientOpt = overrides.createPgClient ? {createClient: overrides.createPgClient} : {};
  const paymentAfterRestart = await observeLagrangePaymentState({
    endpoint: context.endpoint,
    connection: context.connection,
    operation: payment.identity.operation,
    ...clientOpt,
  });
  const stateAfterRestart = await observeLagrangeOltpStateSnapshot({
    endpoint: context.endpoint,
    connection: context.connection,
    ...clientOpt,
  });
  const paymentObservation = Object.freeze({
    paidCents: req.before.paidCents,
    ...paymentAfterRestart,
  });
  const evaluation = evaluateScenarioADurabilityObservation({
    commitAcknowledged: true,
    paymentObservation,
    stateBeforeRestartSha256: req.before.stateBeforeRestart.stateSha256,
    stateAfterRestartSha256: stateAfterRestart.stateSha256,
    faultEvidence: req.faultEvidence,
  });
  const payload = buildBasePayload({
    evidenceId: `${req.system}-scenario-a-durability`,
    definition,
    adapter: null,
    context,
    extra: {
      operation: definition.identity.operation,
      retryEvidence: req.before.retryEvidence ?? null,
      paymentBeforeRestart: req.before.paymentBeforeRestart,
      paymentAfterRestart,
      stateBeforeRestartSha256: req.before.stateBeforeRestart.stateSha256,
      stateAfterRestartSha256: stateAfterRestart.stateSha256,
      faultEvidence: req.faultEvidence,
      evaluation,
    },
  });
  const evidence = buildProofEvidence({
    payload,
    proofIds: OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
    evaluation,
  });
  return {evaluation, proofRecord: evidence.proofRecord, evidence};
}

async function defaultMysqlConnection(connOpts) {
  const mysql = await import('mysql2/promise');
  const driver = 'createConnection' in mysql ? mysql : mysql.default;
  return driver.createConnection(connOpts);
}

function mysqlConnectionFactoryOf(connection, createMysqlConnection) {
  const rawFactory = createMysqlConnection || defaultMysqlConnection;
  const credentials = connection?.credentials;
  return (connOpts) => rawFactory({
    ...connOpts,
    ...(typeof credentials?.user === 'string' && credentials.user !== '' ?
      {user: credentials.user} : {}),
    ...(credentials?.password !== undefined ?
      {password: credentials.password} : {}),
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
  return Object.freeze({
    schemaVersion: 1,
    evidenceId,
    system: SYSTEM.TIDB_TIKV,
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
    const observation = Object.freeze({
      paidCents: Number(retryOutcome.result?.paidCents),
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

function isTerminalRetryClassificationValid(error) {
  const retryEvidence = error?.oltpRetryEvidence;
  if (!retryEvidence) return false;
  if (Number(retryEvidence.retries) !== 0 || Number(retryEvidence.attempts) !== 1) return false;
  if (!Array.isArray(retryEvidence.failures) || retryEvidence.failures.length !== 1) return false;
  const failure = retryEvidence.failures[0];
  return failure.outcome === OLTP_PAIRED_RETRY_OUTCOME.TERMINAL_FAILURE &&
    failure.retryable === false;
}

function finalizeFailureAtomicityEvaluation(baseEvaluation, terminalError) {
  if (!terminalError || isTerminalRetryClassificationValid(terminalError)) return baseEvaluation;
  return Object.freeze({
    ...baseEvaluation,
    passed: false,
    failures: Object.freeze([...baseEvaluation.failures, 'terminal_retry_classification']),
    proofIds: Object.freeze([]),
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
    const observation = Object.freeze({
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
        retryEvidence: terminalError?.oltpRetryEvidence ?? null,
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
      paidCents: Number(retryOutcome.result?.paidCents),
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
    const paymentObservation = Object.freeze({
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

const TIDB_CASE_EXECUTORS = Object.freeze({
  'visibility': executeTiDbVisibilityCase,
  'payment': executeTiDbPaymentCase,
  'failure-atomicity': executeTiDbFailureAtomicityCase,
});

async function executeRemoteTiDbCase(req, overrides) {
  const executor = TIDB_CASE_EXECUTORS[req.caseId];
  if (!executor) throw new Error(`unknown remote TiDB Scenario A case ${req.caseId}`);
  return executor({
    connection: req.connection,
    binding: req.binding,
    createMysqlConnection: overrides.createMysqlConnection ?? null,
  });
}

async function executeRemoteTiDbDurabilityCleanup(req, overrides) {
  const createConnection = mysqlConnectionFactoryOf(
    req.connection,
    overrides.createMysqlConnection ?? null,
  );
  await dropTiDbDatabase(
    req.connection.endpoint,
    TIDB_DATABASE_BY_CASE[DURABILITY_CASE_ID],
    createConnection,
  );
  return {cleanedUp: true};
}

const REMOTE_ACTION_HANDLERS = Object.freeze({
  [REMOTE_ACTION.PG_CASE]: executeRemotePgCase,
  [REMOTE_ACTION.PG_DURABILITY_BEFORE]: executeRemotePgDurabilityBefore,
  [REMOTE_ACTION.PG_DURABILITY_AFTER]: executeRemotePgDurabilityAfter,
  [REMOTE_ACTION.TIDB_CASE]: executeRemoteTiDbCase,
  [REMOTE_ACTION.TIDB_DURABILITY_BEFORE]: (req, overrides) => executeTiDbDurabilityBefore({
    connection: req.connection,
    createMysqlConnection: overrides.createMysqlConnection ?? null,
  }),
  [REMOTE_ACTION.TIDB_DURABILITY_AFTER]: (req, overrides) => executeTiDbDurabilityAfter({
    connection: req.connection,
    binding: req.binding,
    before: req.before,
    faultEvidence: req.faultEvidence,
    createMysqlConnection: overrides.createMysqlConnection ?? null,
  }),
  [REMOTE_ACTION.TIDB_DURABILITY_CLEANUP]: executeRemoteTiDbDurabilityCleanup,
});

/**
 * Execute one load-generator-side semantic-gate action for PG-wire or TiDB.
 *
 * @param {Object} req
 * @param {{createPgClient?: Function|null,
 *   createMysqlConnection?: Function|null}} [overrides]
 * @return {Promise<Object>}
 */
async function executeRemoteGateAction(req, overrides = {}) {
  const handler = REMOTE_ACTION_HANDLERS[req?.action];
  if (!handler) {
    throw new Error(`unknown remote semantic-gate action ${JSON.stringify(req?.action)}`);
  }
  return handler(req, overrides);
}

function durabilityPreconditionResult(proofCase, persistentStorage, restartProduct, binding) {
  if (proofCase.id !== DURABILITY_CASE_ID) return null;
  const base = {caseId: proofCase.id, proofIds: proofCase.proofIds, binding};
  if (persistentStorage === false) {
    return Object.freeze({
      ...base,
      status: 'failed',
      failureKind: OLTP_SCENARIO_A_PROOF_FAILURE_KIND.PROBE_INAPPLICABLE,
      failureReasons: ['durability_requires_persistent_storage'],
    });
  }
  if (!restartProduct) {
    return Object.freeze({
      ...base,
      status: 'not-executed',
      reason: 'caller-supplied-no-restart-capability',
    });
  }
  return null;
}

async function recordCaseOutcome({result, proofCase, system, outcome, evidenceDir}) {
  result.status = outcome.evaluation.passed ? 'passed' : 'failed';
  if (!outcome.evaluation.passed) {
    result.failureReasons = [...(outcome.evaluation.failures || [])];
    result.failureKind = classifyCaseFailure(proofCase.id, result.failureReasons);
  }
  result.proofRecord = outcome.proofRecord;
  result.evidencePath = await persistGateArtifact(
    evidenceDir,
    `scenario-a-${proofCase.id}-${system}.json`,
    outcome.evidence,
  );
}

function recordCaseError(result, error) {
  result.status = 'errored';
  result.error = errorText(error);
  result.failureKind = OLTP_SCENARIO_A_PROOF_FAILURE_KIND.EVIDENCE_INSUFFICIENT;
  result.failureReasons = ['case_errored'];
}

async function runRemotePgWireCase({proofCase, system, connection, binding, persistentStorage,
  restartProduct, evidenceDir, sshRun, opts, loadGeneratorHost}) {
  const precondition = durabilityPreconditionResult(
    proofCase, persistentStorage, restartProduct, binding);
  if (precondition) return precondition;
  const result = {caseId: proofCase.id, proofIds: proofCase.proofIds, binding};
  try {
    let outcome;
    if (proofCase.id === DURABILITY_CASE_ID) {
      const before = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_GATE_SCRIPT,
        {action: REMOTE_ACTION.PG_DURABILITY_BEFORE, system, connection, binding});
      const faultEvidence = await restartProduct({
        context: {system, endpoint: connection.endpoint, connection: connection.credentials,
          binding},
      });
      outcome = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_GATE_SCRIPT,
        {action: REMOTE_ACTION.PG_DURABILITY_AFTER, system, connection, binding, before,
          faultEvidence});
    } else {
      outcome = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_GATE_SCRIPT,
        {action: REMOTE_ACTION.PG_CASE, caseId: proofCase.id, system, connection, binding,
          persistentStorage});
    }
    await recordCaseOutcome({result, proofCase, system, outcome, evidenceDir});
  } catch (error) {
    recordCaseError(result, error);
  }
  return Object.freeze(result);
}

function summarizeCasesToGate(system, cases) {
  const bindings = [];
  for (const entry of cases) {
    if (!arraySome(bindings, (seen) => JSON.stringify(seen) === JSON.stringify(entry.binding))) {
      bindings.push(entry.binding);
    }
  }
  const proofs = arrayMap(arrayFilter(cases, (entry) => entry.proofRecord &&
    (entry.status === 'passed' ||
      entry.failureKind === OLTP_SCENARIO_A_PROOF_FAILURE_KIND.PRODUCT_ANOMALY)),
  (entry) => entry.proofRecord);
  const failureKinds = arrayMap(arrayFilter(cases, (entry) => entry.failureKind),
    (entry) => ({caseId: entry.caseId, kind: entry.failureKind,
      reasons: [...entry.failureReasons]}));
  const gate = buildScenarioASemanticGateEvidence({systems: [system], proofs});
  const summary = gate.systems[system];
  const status = summary.failedProofIds.length > 0 ? 'failed' :
    (summary.missingProofIds.length > 0 ? 'incomplete' : 'passed');
  return Object.freeze({
    system,
    status,
    passed: summary.passedProofIds,
    failed: summary.failedProofIds,
    missing: summary.missingProofIds,
    binding: bindings.length === 1 ? bindings[0] : null,
    bindings: Object.freeze(bindings),
    semanticProfileId: gate.semanticProfileId,
    semanticProfileSha256: gate.semanticProfileSha256,
    semanticGateEvidenceSha256: gate.semanticGateEvidenceSha256,
    failureKinds: Object.freeze(failureKinds),
    cases: Object.freeze(cases),
  });
}

async function runRemotePgWireSemanticGate({system, connection, binding, evidenceDir, beforeCase,
  restartProduct, persistentStorage, sshRun, opts, loadGeneratorHost}) {
  let activeConnection = connection;
  let activeBinding = binding;
  const cases = [];
  for (const proofCase of OLTP_SCENARIO_A_PROOF_CASES) {
    const rebound = await beforeCase({caseId: proofCase.id});
    if (rebound) {
      activeConnection = rebound.connection;
      activeBinding = rebound.binding;
    }
    cases.push(await runRemotePgWireCase({
      proofCase,
      system,
      connection: activeConnection,
      binding: activeBinding,
      persistentStorage,
      restartProduct,
      evidenceDir,
      sshRun,
      opts,
      loadGeneratorHost,
    }));
  }
  return summarizeCasesToGate(system, cases);
}

async function cleanupFailedTiDbDurability({connection, sshRun, opts, loadGeneratorHost,
  createMysqlConnection, result}) {
  try {
    if (loadGeneratorHost) {
      await runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_GATE_SCRIPT,
        {action: REMOTE_ACTION.TIDB_DURABILITY_CLEANUP, connection});
      return;
    }
    const createConnection = mysqlConnectionFactoryOf(connection, createMysqlConnection);
    await dropTiDbDatabase(
      connection.endpoint,
      TIDB_DATABASE_BY_CASE[DURABILITY_CASE_ID],
      createConnection,
    );
  } catch (error) {
    result.cleanupError = errorText(error);
  }
}

async function executeTiDbDurabilitySequence({connection, binding, restartProduct, sshRun, opts,
  loadGeneratorHost, createMysqlConnection, result}) {
  const before = loadGeneratorHost ?
    await runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_GATE_SCRIPT,
      {action: REMOTE_ACTION.TIDB_DURABILITY_BEFORE, connection}) :
    await executeTiDbDurabilityBefore({connection, createMysqlConnection});
  let faultEvidence;
  try {
    faultEvidence = await restartProduct({
      context: {
        system: SYSTEM.TIDB_TIKV,
        endpoint: connection.endpoint,
        connection: connection.credentials,
        binding,
      },
    });
  } catch (restartError) {
    await cleanupFailedTiDbDurability({
      connection,
      sshRun,
      opts,
      loadGeneratorHost,
      createMysqlConnection,
      result,
    });
    throw restartError;
  }
  return loadGeneratorHost ?
    runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_GATE_SCRIPT,
      {action: REMOTE_ACTION.TIDB_DURABILITY_AFTER, connection, binding, before, faultEvidence}) :
    executeTiDbDurabilityAfter({connection, binding, before, faultEvidence,
      createMysqlConnection});
}

async function runTiDbExecutedCase({proofCase, connection, binding, persistentStorage,
  restartProduct, evidenceDir, sshRun, opts, loadGeneratorHost, createMysqlConnection}) {
  const precondition = durabilityPreconditionResult(
    proofCase, persistentStorage, restartProduct, binding);
  if (precondition) return precondition;
  const result = {caseId: proofCase.id, proofIds: proofCase.proofIds, binding};
  try {
    const outcome = proofCase.id === DURABILITY_CASE_ID ?
      await executeTiDbDurabilitySequence({connection, binding, restartProduct, sshRun, opts,
        loadGeneratorHost, createMysqlConnection, result}) :
      (loadGeneratorHost ?
        await runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_GATE_SCRIPT,
          {action: REMOTE_ACTION.TIDB_CASE, caseId: proofCase.id, connection, binding}) :
        await TIDB_CASE_EXECUTORS[proofCase.id]({connection, binding, createMysqlConnection}));
    await recordCaseOutcome({
      result,
      proofCase,
      system: SYSTEM.TIDB_TIKV,
      outcome,
      evidenceDir,
    });
  } catch (error) {
    recordCaseError(result, error);
  }
  return Object.freeze(result);
}

async function advanceCaseTarget(beforeCase, caseId, current) {
  if (!beforeCase) return current;
  const rebound = await beforeCase({caseId});
  return rebound ? {connection: rebound.connection, binding: rebound.binding} : current;
}

/**
 * Run the TiDB Scenario A semantic gate over the canonical case contracts
 * wired here (`visibility`, `payment`, `failure-atomicity`, `durability`).
 * Unexecuted canonical cases remain recorded as `not-executed` so their proof
 * IDs stay in `missing` (`incomplete`), and skipped or ineligible durability
 * never claims durability proof IDs.
 *
 * @param {{connection: Object, binding: Object, evidenceDir?: string|null,
 *   beforeCase?: Function|null, persistentStorage?: boolean,
 *   restartProduct?: Function|null, sshRun?: Function, opts?: Object,
 *   loadGeneratorHost?: Object|null, createMysqlConnection?: Function|null}} input
 * @return {Promise<Object>}
 */
async function runTiDbSemanticGate(input) {
  let target = {connection: input.connection, binding: input.binding};
  const cases = [];
  for (const proofCase of OLTP_SCENARIO_A_PROOF_CASES) {
    if (!arrayIncludes(TIDB_EXECUTED_CASE_IDS, proofCase.id)) {
      cases.push(Object.freeze({
        caseId: proofCase.id,
        proofIds: proofCase.proofIds,
        binding: target.binding,
        status: 'not-executed',
        reason: 'not-executed-in-tidb-gate-probe',
      }));
      continue;
    }
    target = await advanceCaseTarget(input.beforeCase, proofCase.id, target);
    cases.push(await runTiDbExecutedCase({
      proofCase,
      connection: target.connection,
      binding: target.binding,
      persistentStorage: Boolean(input.persistentStorage),
      restartProduct: input.restartProduct || null,
      evidenceDir: input.evidenceDir || null,
      sshRun: input.sshRun || null,
      opts: input.opts || {},
      loadGeneratorHost: input.loadGeneratorHost || null,
      createMysqlConnection: input.createMysqlConnection || null,
    }));
  }
  return summarizeCasesToGate(SYSTEM.TIDB_TIKV, cases);
}

/**
 * @param {{journey: Function, tidbJourney?: Function, redeploy: Function,
 *   sshRun: Function, opts: Object, evidenceDirOf: Function,
 *   loadGeneratorHost?: Object|null, createMysqlConnection?: Function|null,
 *   now?: Function}} input
 *   redeploy(run) tears the arm down and deploys it fresh, returning the new
 *   deployment; evidenceDirOf(run) names a directory unique to the campaign
 *   and run
 * @return {Function} ({run, manifest, deployment}) => {gate, deployment, events}
 */
function createSemanticGateStage({journey, tidbJourney = null, redeploy, sshRun, opts,
  evidenceDirOf, loadGeneratorHost = null, createMysqlConnection = null, now = Date.now}) {
  return async ({run, manifest, deployment}) => {
    const evidenceDir = evidenceDirOf(run);
    const at = () => new Date(now()).toISOString();
    if (run.system !== SYSTEM.LAGRANGE && run.system !== SYSTEM.POSTGRESQL &&
        run.system !== SYSTEM.TIDB_TIKV) {
      return {
        gate: null,
        deployment,
        events: [{
          kind: EVENT.NOT_RUN,
          at: at(),
          missingClient: run.system,
          reason: `the chain has no semantic-gate client for ${run.system}`,
        }],
      };
    }
    const events = [];
    let current = deployment;
    let casesStarted = 0;
    const reform = async (caseId) => {
      current = await redeploy(run);
      events.push({
        kind: EVENT.RE_FORMATION,
        at: at(),
        caseId,
        endpoint: current.endpoint,
        containerIds: arrayMap(current.roles, (role) => role.containerId),
      });
    };
    const beforeCase = async ({caseId}) => {
      casesStarted += 1;
      if (casesStarted === 1) return null;
      if (run.system === SYSTEM.LAGRANGE) {
        await reform(caseId);
      } else {
        events.push({
          kind: EVENT.DATASET_RESET,
          at: at(),
          caseId,
          method: 'adapter drop-and-reload',
        });
      }
      return {connection: connectionOf(current), binding: bindingOf(manifest, current)};
    };
    const restartProduct = async (request = {}) => {
      const target = selectDurabilityFaultTarget(run.system, current, request);
      const beforeProduct = arrayFind(current.identity.products,
        (one) => one.containerId === target.containerId) ?? null;
      const beforeStartedAt = beforeProduct?.startedAt ?? null;
      const restartedAt = at();
      await sshRun(target.host, opts,
        `docker restart -t ${RESTART_GRACE_SECONDS} ${shellWord(target.containerId)}`);
      const readiness = await current.operations.awaitReady();
      const previousByContainer = new Map(arrayMap(current.identity.products,
        (one) => [one.containerId, one]));
      current.identity.products = arrayMap(
        await inspectProducts({sshRun, opts, roles: current.identity.products}),
        (one) => preserveReportedIdentity(one, previousByContainer),
      );
      const afterProduct = arrayFind(current.identity.products,
        (one) => one.containerId === target.containerId) ?? null;
      const afterStartedAt = afterProduct?.startedAt ?? null;
      const faultEvidence = buildObservedFaultEvidence({
        deployment: current,
        target,
        beforeProduct,
        afterProduct,
        readiness,
      });
      events.push({
        kind: EVENT.PRODUCT_RESTART,
        at: restartedAt,
        containerId: target.containerId,
        host: target.host,
        role: faultEvidence.faultTarget.role,
        startedAtBefore: beforeStartedAt,
        startedAtAfter: afterStartedAt,
      });
      return Object.freeze({
        containerId: target.containerId,
        host: target.host,
        restartedAt,
        readyAt: at(),
        startedAtBefore: beforeStartedAt,
        startedAtAfter: afterStartedAt,
        readiness,
        ...faultEvidence,
      });
    };
    const gateArgs = {
      system: run.system,
      connection: connectionOf(current),
      binding: bindingOf(manifest, current),
      evidenceDir,
      beforeCase,
      restartProduct,
      persistentStorage: hasPersistentStorage(current),
    };
    let gate;
    if (run.system === SYSTEM.TIDB_TIKV) {
      gate = tidbJourney ? await tidbJourney(gateArgs) :
        await runTiDbSemanticGate({
          ...gateArgs,
          sshRun,
          opts,
          loadGeneratorHost,
          createMysqlConnection,
        });
    } else if (loadGeneratorHost) {
      gate = await runRemotePgWireSemanticGate({
        ...gateArgs,
        sshRun,
        opts,
        loadGeneratorHost,
      });
    } else {
      gate = await journey(gateArgs);
    }
    if (run.system === SYSTEM.LAGRANGE) await reform(BEFORE_MEASUREMENT);
    return {gate, deployment: current, events};
  };
}

export {
  buildObservedFaultEvidence,
  createSemanticGateStage,
  executeRemoteGateAction,
  runTiDbSemanticGate,
};
