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
 * - restartProduct: `docker restart` of exactly the endpoint container, its
 *   readiness contract again, identity re-inspected (new StartedAt).
 * When `loadGeneratorHost` is supplied (as on GCP where data-host endpoints are
 * private VPC addresses), database proof operations execute from the load
 * generator over SSH while lifecycle hooks remain on the controller.
 */
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  OLTP_SCENARIO_A_DURABILITY_FAULT_EVIDENCE_CODES,
} from './oltp-scenario-a-durability-case.js';
import {OLTP_SCENARIO_A_PROOF_CASES} from './oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_PROOF_FAILURE_KIND,
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from './oltp-scenario-a-semantic-gate.js';
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
import {RUN_CLASS} from './real-product-deployment-contract.js';
import {inspectProducts, runClassOf} from './real-product-identity.js';
import {errorText, shellWord} from './real-product-remote-shell.js';

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
const RESTART_GRACE_SECONDS = 1;
const BEFORE_MEASUREMENT = 'before-measurement';
const DURABILITY_CASE_ID = 'durability';
const TIDB_EVIDENCE_ID = 'tidb-scenario-a-semantic-gate';
const TIDB_DEFAULT_USER = 'root';
const INITIAL_BALANCE = 1000;
const DEBITED_BALANCE = 850;
const CREDITED_BALANCE = 1150;

const REMOTE_PG_CASE_SCRIPT = [
  'import {OLTP_ADAPTER_KEEP_DATASET} from',
  '  "./test/distributed/reference-client/oltp-adapter-contract.js";',
  'import {',
  '  PGWIRE_OLTP_EXECUTION_PATH, PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE,',
  '  PGWIRE_OLTP_PROTOCOL, PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE,',
  '  createLagrangeOltpAdapter,',
  '} from "./test/distributed/reference-client/lagrange-oltp-adapter.js";',
  'import {createPostgreSqlOltpAdapter} from',
  '  "./test/distributed/reference-client/postgresql-oltp-adapter.js";',
  'import {buildProofEvidence} from',
  '  "./test/distributed/scenarios/scenario-a-lagrange-shared.js";',
  'const req = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));',
  'const mod = await import(`./test/distributed/scenarios/scenario-a-${req.caseId}-lagrange.js`);',
  'const createAdapter = req.system === "lagrange" ?',
  '  createLagrangeOltpAdapter : createPostgreSqlOltpAdapter;',
  'const lockingReadMode = req.system === "lagrange" ?',
  '  PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE : PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE;',
  'const context = {system: req.system, endpoint: req.connection.endpoint,',
  '  connection: req.connection.credentials, binding: req.binding, serviceEndpoint: null,',
  '  admission: null, runtimePreflight: null, publicExecutionContract: {',
  '    protocol: PGWIRE_OLTP_PROTOCOL, executionPath: PGWIRE_OLTP_EXECUTION_PATH,',
  '    lockingReadMode}};',
  'let adapter = null;',
  'try {',
  '  const outcome = await mod.executeProof({context, options: {createAdapter,',
  '    prepareContext: async () => context, persistentStorage: req.persistentStorage},',
  '    cluster: null});',
  '  adapter = outcome.adapter;',
  '  const evidence = buildProofEvidence(outcome);',
  '  process.stdout.write(`${JSON.stringify({evaluation: outcome.evaluation,',
  '    proofRecord: evidence.proofRecord, evidence})}\\n`);',
  '} finally {',
  '  if (adapter) await adapter.close(OLTP_ADAPTER_KEEP_DATASET).catch(() => {});',
  '}',
].join(' ');

const REMOTE_PG_DURABILITY_SCRIPT = [
  'import {OLTP_ADAPTER_KEEP_DATASET} from',
  '  "./test/distributed/reference-client/oltp-adapter-contract.js";',
  'import {',
  '  PGWIRE_OLTP_EXECUTION_PATH, PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE,',
  '  PGWIRE_OLTP_PROTOCOL, PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE,',
  '  createLagrangeOltpAdapter,',
  '} from "./test/distributed/reference-client/lagrange-oltp-adapter.js";',
  'import {createPostgreSqlOltpAdapter} from',
  '  "./test/distributed/reference-client/postgresql-oltp-adapter.js";',
  'import {observeLagrangePaymentState} from',
  '  "./test/distributed/reference-client/lagrange-payment-observer.js";',
  'import {observeLagrangeOltpStateSnapshot} from',
  '  "./test/distributed/reference-client/lagrange-oltp-state-snapshot.js";',
  'import {executePairedOltpTransactionWithRetry} from',
  '  "./test/distributed/harness/oltp-paired-retry-owner.js";',
  'import {buildScenarioADurabilityCase, evaluateScenarioADurabilityObservation} from',
  '  "./test/distributed/harness/oltp-scenario-a-durability-case.js";',
  'import {buildScenarioAPaymentCase} from',
  '  "./test/distributed/harness/oltp-scenario-a-payment-case.js";',
  'import {buildBasePayload, buildProofEvidence, createAndValidateAdapter} from',
  '  "./test/distributed/scenarios/scenario-a-lagrange-shared.js";',
  'const req = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));',
  'const createAdapter = req.system === "lagrange" ?',
  '  createLagrangeOltpAdapter : createPostgreSqlOltpAdapter;',
  'const lockingReadMode = req.system === "lagrange" ?',
  '  PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE : PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE;',
  'const context = {system: req.system, endpoint: req.connection.endpoint,',
  '  connection: req.connection.credentials, binding: req.binding, serviceEndpoint: null,',
  '  admission: null, runtimePreflight: null, publicExecutionContract: {',
  '    protocol: PGWIRE_OLTP_PROTOCOL, executionPath: PGWIRE_OLTP_EXECUTION_PATH,',
  '    lockingReadMode}};',
  'const definition = buildScenarioADurabilityCase();',
  'const payment = buildScenarioAPaymentCase();',
  'if (req.phase === "before") {',
  '  const adapter = await createAndValidateAdapter({createAdapter, context,',
  '    workload: definition.identity.workload,',
  '    expectedDatasetSha256: definition.identity.datasetSha256, proofCaseId: "durability"});',
  '  try {',
  '    const retryOutcome = await executePairedOltpTransactionWithRetry({',
  '      executeAttempt: () => adapter.executeTransaction(definition.identity.operation)});',
  '    const paymentBeforeRestart = await observeLagrangePaymentState({',
  '      endpoint: context.endpoint, connection: context.connection,',
  '      operation: payment.identity.operation});',
  '    const stateBeforeRestart = await observeLagrangeOltpStateSnapshot({',
  '      endpoint: context.endpoint, connection: context.connection});',
  '    process.stdout.write(`${JSON.stringify({paidCents: Number(retryOutcome.result?.paidCents),',
  '      paymentBeforeRestart, stateBeforeRestart})}\\n`);',
  '  } finally {',
  '    await adapter.close(OLTP_ADAPTER_KEEP_DATASET).catch(() => {});',
  '  }',
  '} else {',
  '  const paymentAfterRestart = await observeLagrangePaymentState({',
  '    endpoint: context.endpoint, connection: context.connection,',
  '    operation: payment.identity.operation});',
  '  const stateAfterRestart = await observeLagrangeOltpStateSnapshot({',
  '    endpoint: context.endpoint, connection: context.connection});',
  '  const paymentObservation = {paidCents: req.before.paidCents, ...paymentAfterRestart};',
  '  const evaluation = evaluateScenarioADurabilityObservation({commitAcknowledged: true,',
  '    paymentObservation, stateBeforeRestartSha256: req.before.stateBeforeRestart.stateSha256,',
  '    stateAfterRestartSha256: stateAfterRestart.stateSha256, faultEvidence: req.faultEvidence});',
  '  const payload = buildBasePayload({evidenceId: `${req.system}-scenario-a-durability`,',
  '    definition, adapter: null, context, extra: {operation: definition.identity.operation,',
  '      paymentBeforeRestart: req.before.paymentBeforeRestart, paymentAfterRestart,',
  '      stateBeforeRestart: req.before.stateBeforeRestart, stateAfterRestart, faultEvidence:',
  '      req.faultEvidence, evaluation}});',
  '  const evidence = buildProofEvidence({adapter: null, evaluation, payload});',
  '  process.stdout.write(`${JSON.stringify({evaluation, proofRecord: evidence.proofRecord,',
  '    evidence})}\\n`);',
  '}',
].join(' ');

const REMOTE_TIDB_PROBE_SCRIPT = [
  'const mysql = await import("mysql2/promise");',
  'const driver = mysql.default || mysql;',
  'const req = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));',
  'const open = () => driver.createConnection({host: req.endpoint.host, port: req.endpoint.port,',
  '  user: req.credentials?.user || "root", password: req.credentials?.password || ""});',
  'if (req.phase === "after-restart") {',
  '  const conn = await open();',
  '  try {',
  '    const [rows] = await conn.query(',
  '      "SELECT id, balance FROM bench_semantic_gate.semantic_gate_probe ORDER BY id");',
  '    await conn.query("DROP TABLE IF EXISTS bench_semantic_gate.semantic_gate_probe");',
  '    process.stdout.write(`${JSON.stringify({durableBalances:',
  '      (rows || []).map((r) => Number(r.balance))})}\\n`);',
  '  } finally {',
  '    await conn.end().catch(() => {});',
  '  }',
  '} else {',
  '  const connA = await open();',
  '  const connB = await open();',
  '  try {',
  '    await connA.query("CREATE DATABASE IF NOT EXISTS bench_semantic_gate");',
  '    await connA.query("USE bench_semantic_gate");',
  '    await connB.query("USE bench_semantic_gate");',
  '    await connA.query("DROP TABLE IF EXISTS semantic_gate_probe");',
  '    await connA.query("CREATE TABLE semantic_gate_probe (" +',
  '      "id INT PRIMARY KEY, balance INT NOT NULL, note VARCHAR(64) NOT NULL)");',
  '    await connA.query("INSERT INTO semantic_gate_probe (id, balance, note) VALUES " +',
  '      "(1, 1000, \'seed-1\'), (2, 1000, \'seed-2\')");',
  '    await connB.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");',
  '    await connB.query("BEGIN");',
  '    const [snapBefore] = await connB.query(',
  '      "SELECT balance FROM semantic_gate_probe WHERE id = 1");',
  '    await connA.query("BEGIN");',
  '    await connA.query(',
  '      "UPDATE semantic_gate_probe SET balance = 850, note = \'paid\' WHERE id = 1");',
  '    await connA.query(',
  '      "UPDATE semantic_gate_probe SET balance = 1150, note = \'credited\' WHERE id = 2");',
  '    await connA.query("COMMIT");',
  '    const [snapDuring] = await connB.query(',
  '      "SELECT balance FROM semantic_gate_probe WHERE id = 1");',
  '    await connB.query("COMMIT");',
  '    const [afterCommit] = await connB.query(',
  '      "SELECT id, balance, note FROM semantic_gate_probe ORDER BY id");',
  '    await connA.query("BEGIN");',
  '    await connA.query("UPDATE semantic_gate_probe SET balance = 0 WHERE id = 1");',
  '    await connA.query("ROLLBACK");',
  '    const [afterRollback] = await connA.query(',
  '      "SELECT balance FROM semantic_gate_probe WHERE id = 1");',
  '    if (!req.keepTable) await connA.query("DROP TABLE IF EXISTS semantic_gate_probe");',
  '    process.stdout.write(`${JSON.stringify({',
  '      snapshotBefore: Number(snapBefore?.[0]?.balance),',
  '      snapshotDuring: Number(snapDuring?.[0]?.balance),',
  '      committedBalances: (afterCommit || []).map((r) => Number(r.balance)),',
  '      afterRollbackBalance: Number(afterRollback?.[0]?.balance)})}\\n`);',
  '  } finally {',
  '    await connB.end().catch(() => {});',
  '    await connA.end().catch(() => {});',
  '  }',
  '}',
].join(' ');

function connectionOf(deployment) {
  return {endpoint: {host: deployment.endpoint.host, port: deployment.endpoint.port},
    credentials: deployment.access?.connection ?? null};
}

function bindingOf(manifest, deployment) {
  const endpoint = deployment.endpoint;
  const product = arrayFind(deployment.identity?.products || [],
    (one) => one.containerId === endpoint.containerId);
  return {campaignId: manifest.campaignId, containerId: endpoint.containerId,
    imageId: product?.imageId ?? null, endpoint: `${endpoint.host}:${endpoint.port}`};
}

// Durability is provable only where every data directory survives its
// container: the storage the identity owner classes as publishable.
function hasPersistentStorage(deployment) {
  return runClassOf(Array.isArray(deployment.storage) ? deployment.storage : []) ===
    RUN_CLASS.PUBLISHABLE;
}

async function persistGateArtifact(evidenceDir, fileName, payload) {
  if (!evidenceDir) return null;
  await mkdir(evidenceDir, {recursive: true});
  const outputPath = path.join(evidenceDir, fileName);
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function runRemoteNodeJson(sshRun, opts, host, script, payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const command = `cd ${shellWord(host.repoPath)} && ${shellWord(host.nodePath || 'node')} ` +
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

async function runRemotePgWireCase({proofCase, system, connection, binding, persistentStorage,
  restartProduct, evidenceDir, sshRun, opts, loadGeneratorHost}) {
  const result = {caseId: proofCase.id, proofIds: proofCase.proofIds, binding};
  if (proofCase.id === DURABILITY_CASE_ID && persistentStorage === false) {
    return {...result, status: 'failed',
      failureKind: OLTP_SCENARIO_A_PROOF_FAILURE_KIND.PROBE_INAPPLICABLE,
      failureReasons: ['durability_requires_persistent_storage']};
  }
  try {
    let outcome;
    if (proofCase.id === DURABILITY_CASE_ID) {
      const before = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost,
        REMOTE_PG_DURABILITY_SCRIPT, {phase: 'before', system, connection, binding});
      const faultEvidence = await restartProduct({context: {system, endpoint: connection.endpoint,
        connection: connection.credentials, binding}});
      outcome = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost,
        REMOTE_PG_DURABILITY_SCRIPT, {phase: 'after', system, connection, binding, before,
          faultEvidence});
    } else {
      outcome = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost, REMOTE_PG_CASE_SCRIPT,
        {caseId: proofCase.id, system, connection, binding, persistentStorage});
    }
    result.status = outcome.evaluation.passed ? 'passed' : 'failed';
    if (!outcome.evaluation.passed) {
      result.failureReasons = [...(outcome.evaluation.failures || [])];
      result.failureKind = classifyCaseFailure(proofCase.id, result.failureReasons);
    }
    result.proofRecord = outcome.proofRecord;
    result.evidencePath = await persistGateArtifact(evidenceDir,
      `scenario-a-${proofCase.id}-${system}.json`, outcome.evidence);
  } catch (error) {
    result.status = 'errored';
    result.error = errorText(error);
    result.failureKind = OLTP_SCENARIO_A_PROOF_FAILURE_KIND.EVIDENCE_INSUFFICIENT;
    result.failureReasons = ['case_errored'];
  }
  return Object.freeze(result);
}

function summarizeCasesToGate(system, cases, finalBinding) {
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
    system, status,
    passed: summary.passedProofIds,
    failed: summary.failedProofIds,
    missing: summary.missingProofIds,
    binding: finalBinding ?? (bindings.length === 1 ? bindings[0] : null),
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
    cases.push(await runRemotePgWireCase({proofCase, system, connection: activeConnection,
      binding: activeBinding, persistentStorage, restartProduct, evidenceDir, sshRun, opts,
      loadGeneratorHost}));
  }
  return summarizeCasesToGate(system, cases, activeBinding);
}

async function probeLocalTiDbSemantics(openConnection, keepTable) {
  const connA = await openConnection();
  const connB = await openConnection();
  try {
    await connA.query('CREATE DATABASE IF NOT EXISTS bench_semantic_gate');
    await connA.query('USE bench_semantic_gate');
    await connB.query('USE bench_semantic_gate');
    await connA.query('DROP TABLE IF EXISTS semantic_gate_probe');
    await connA.query('CREATE TABLE semantic_gate_probe (' +
      'id INT PRIMARY KEY, balance INT NOT NULL, note VARCHAR(64) NOT NULL)');
    await connA.query('INSERT INTO semantic_gate_probe (id, balance, note) VALUES ' +
      '(1, 1000, \'seed-1\'), (2, 1000, \'seed-2\')');
    await connB.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connB.query('BEGIN');
    const [snapBefore] = await connB.query(
      'SELECT balance FROM semantic_gate_probe WHERE id = 1');
    await connA.query('BEGIN');
    await connA.query(
      'UPDATE semantic_gate_probe SET balance = 850, note = \'paid\' WHERE id = 1');
    await connA.query(
      'UPDATE semantic_gate_probe SET balance = 1150, note = \'credited\' WHERE id = 2');
    await connA.query('COMMIT');
    const [snapDuring] = await connB.query(
      'SELECT balance FROM semantic_gate_probe WHERE id = 1');
    await connB.query('COMMIT');
    const [afterCommit] = await connB.query(
      'SELECT id, balance, note FROM semantic_gate_probe ORDER BY id');
    await connA.query('BEGIN');
    await connA.query('UPDATE semantic_gate_probe SET balance = 0 WHERE id = 1');
    await connA.query('ROLLBACK');
    const [afterRollback] = await connA.query(
      'SELECT balance FROM semantic_gate_probe WHERE id = 1');
    if (!keepTable) await connA.query('DROP TABLE IF EXISTS semantic_gate_probe');
    return {
      snapshotBefore: Number(snapBefore?.[0]?.balance),
      snapshotDuring: Number(snapDuring?.[0]?.balance),
      committedBalances: arrayMap(afterCommit || [], (row) => Number(row.balance)),
      afterRollbackBalance: Number(afterRollback?.[0]?.balance),
    };
  } finally {
    await Promise.resolve(connB.end?.()).catch(() => {});
    await Promise.resolve(connA.end?.()).catch(() => {});
  }
}

async function probeLocalTiDbDurability(openConnection) {
  const conn = await openConnection();
  try {
    const [rows] = await conn.query(
      'SELECT id, balance FROM bench_semantic_gate.semantic_gate_probe ORDER BY id');
    await conn.query('DROP TABLE IF EXISTS bench_semantic_gate.semantic_gate_probe');
    return {durableBalances: arrayMap(rows || [], (row) => Number(row.balance))};
  } finally {
    await Promise.resolve(conn.end?.()).catch(() => {});
  }
}

function balancesMatchExpected(balances) {
  return Array.isArray(balances) && balances[0] === DEBITED_BALANCE &&
    balances[1] === CREDITED_BALANCE;
}

function evaluateTiDbSemanticProbe(probe, durable) {
  const checks = [
    [probe.snapshotBefore === INITIAL_BALANCE, 'initial_readback_mismatch'],
    [probe.snapshotDuring === INITIAL_BALANCE, 'repeatable_read_isolation_violated'],
    [balancesMatchExpected(probe.committedBalances), 'committed_balance_mismatch'],
    [probe.afterRollbackBalance === DEBITED_BALANCE, 'rollback_atomicity_violated'],
    [!durable || balancesMatchExpected(durable.durableBalances),
      'post_restart_durability_violated'],
  ];
  const failures = arrayMap(arrayFilter(checks, ([ok]) => !ok), ([, code]) => code);
  return {passed: failures.length === 0, failures};
}

async function executeTiDbSemanticProbe({connection, persistentStorage, restartProduct, sshRun,
  opts, loadGeneratorHost, createMysqlConnection}) {
  const checkDurability = Boolean(persistentStorage && restartProduct);
  if (loadGeneratorHost) {
    const probe = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost,
      REMOTE_TIDB_PROBE_SCRIPT, {phase: 'probe', endpoint: connection.endpoint,
        credentials: connection.credentials, keepTable: checkDurability});
    let durable = null;
    if (checkDurability) {
      await restartProduct({});
      durable = await runRemoteNodeJson(sshRun, opts, loadGeneratorHost,
        REMOTE_TIDB_PROBE_SCRIPT, {phase: 'after-restart', endpoint: connection.endpoint,
          credentials: connection.credentials});
    }
    return {probe, durable};
  }
  const openConnection = async () => {
    const factory = createMysqlConnection ||
      opts?.createMysqlConnection ||
      (async (connOpts) => {
        const mysql = await import('mysql2/promise');
        return (mysql.default || mysql).createConnection(connOpts);
      });
    return factory({host: connection.endpoint.host, port: connection.endpoint.port,
      user: connection.credentials?.user || TIDB_DEFAULT_USER,
      password: connection.credentials?.password || ''});
  };
  const probe = await probeLocalTiDbSemantics(openConnection, checkDurability);
  let durable = null;
  if (checkDurability) {
    await restartProduct({});
    durable = await probeLocalTiDbDurability(openConnection);
  }
  return {probe, durable};
}

async function runTiDbSemanticGate({connection, binding, evidenceDir, persistentStorage,
  restartProduct, sshRun, opts, loadGeneratorHost, createMysqlConnection}) {
  try {
    const {probe, durable} = await executeTiDbSemanticProbe({connection, persistentStorage,
      restartProduct, sshRun, opts, loadGeneratorHost, createMysqlConnection});
    const evaluation = evaluateTiDbSemanticProbe(probe, durable);
    const payload = {evidenceId: TIDB_EVIDENCE_ID, system: SYSTEM.TIDB_TIKV,
      endpoint: connection.endpoint, binding, probe, durable, evaluation};
    const artifactSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    await persistGateArtifact(evidenceDir, 'scenario-a-tidb-tikv-semantic-gate.json', payload);
    const proofStatus = evaluation.passed ?
      OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
      OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED;
    const gate = buildScenarioASemanticGateEvidence({
      systems: [SYSTEM.TIDB_TIKV],
      proofs: [{evidenceId: TIDB_EVIDENCE_ID, system: SYSTEM.TIDB_TIKV, status: proofStatus,
        artifactSha256, proofIds: [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS]}],
    });
    const summary = gate.systems[SYSTEM.TIDB_TIKV];
    const failureKinds = evaluation.passed ? [] : [{caseId: 'visibility',
      kind: OLTP_SCENARIO_A_PROOF_FAILURE_KIND.PRODUCT_ANOMALY, reasons: evaluation.failures}];
    return Object.freeze({
      system: SYSTEM.TIDB_TIKV,
      status: evaluation.passed ? 'passed' : 'failed',
      passed: summary.passedProofIds,
      failed: summary.failedProofIds,
      missing: summary.missingProofIds,
      binding,
      bindings: Object.freeze([binding]),
      semanticProfileId: gate.semanticProfileId,
      semanticProfileSha256: gate.semanticProfileSha256,
      semanticGateEvidenceSha256: gate.semanticGateEvidenceSha256,
      failureKinds: Object.freeze(failureKinds),
    });
  } catch (error) {
    const gate = buildScenarioASemanticGateEvidence({systems: [SYSTEM.TIDB_TIKV], proofs: []});
    const summary = gate.systems[SYSTEM.TIDB_TIKV];
    return Object.freeze({
      system: SYSTEM.TIDB_TIKV,
      status: 'incomplete',
      passed: summary.passedProofIds,
      failed: summary.failedProofIds,
      missing: summary.missingProofIds,
      binding,
      bindings: Object.freeze([binding]),
      semanticProfileId: gate.semanticProfileId,
      semanticProfileSha256: gate.semanticProfileSha256,
      semanticGateEvidenceSha256: gate.semanticGateEvidenceSha256,
      failureKinds: Object.freeze([{caseId: 'visibility',
        kind: OLTP_SCENARIO_A_PROOF_FAILURE_KIND.EVIDENCE_INSUFFICIENT,
        reasons: ['case_errored']}]),
      error: errorText(error),
    });
  }
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
      return {gate: null, deployment, events: [{kind: EVENT.NOT_RUN, at: at(),
        missingClient: run.system,
        reason: `the chain has no semantic-gate client for ${run.system}`}]};
    }
    const events = [];
    let current = deployment;
    let casesStarted = 0;
    const reform = async (caseId) => {
      current = await redeploy(run);
      events.push({kind: EVENT.RE_FORMATION, at: at(), caseId,
        endpoint: current.endpoint, containerIds: arrayMap(current.roles, (r) => r.containerId)});
    };
    const beforeCase = async ({caseId}) => {
      casesStarted += 1;
      if (casesStarted === 1) return null;
      if (run.system === SYSTEM.LAGRANGE) {
        await reform(caseId);
      } else {
        events.push({kind: EVENT.DATASET_RESET, at: at(), caseId,
          method: 'adapter drop-and-reload'});
      }
      return {connection: connectionOf(current), binding: bindingOf(manifest, current)};
    };
    const restartProduct = async () => {
      const {host, containerId} = current.endpoint;
      const before = arrayFind(current.identity.products,
        (one) => one.containerId === containerId)?.startedAt ?? null;
      const restartedAt = at();
      await sshRun(host, opts,
        `docker restart -t ${RESTART_GRACE_SECONDS} ${shellWord(containerId)}`);
      const readiness = await current.operations.awaitReady();
      const reported = new Map(arrayMap(current.identity.products, (one) =>
        [one.containerId, one]));
      current.identity.products = arrayMap(await inspectProducts({sshRun, opts,
        roles: current.identity.products}), (one) => ({...one,
        reportedVersion: reported.get(one.containerId)?.reportedVersion ?? null,
        bootProvenance: reported.get(one.containerId)?.bootProvenance ?? null}));
      const after = arrayFind(current.identity.products,
        (one) => one.containerId === containerId)?.startedAt ?? null;
      events.push({kind: EVENT.PRODUCT_RESTART, at: restartedAt, containerId, host,
        startedAtBefore: before, startedAtAfter: after});
      return {containerId, restartedAt, readyAt: at(), startedAtBefore: before,
        startedAtAfter: after, readiness};
    };
    const gateArgs = {system: run.system, connection: connectionOf(current),
      binding: bindingOf(manifest, current), evidenceDir, beforeCase, restartProduct,
      persistentStorage: hasPersistentStorage(current)};
    let gate;
    if (run.system === SYSTEM.TIDB_TIKV) {
      gate = tidbJourney ? await tidbJourney(gateArgs) :
        await runTiDbSemanticGate({...gateArgs, sshRun, opts, loadGeneratorHost,
          createMysqlConnection});
    } else if (loadGeneratorHost) {
      gate = await runRemotePgWireSemanticGate({...gateArgs, sshRun, opts, loadGeneratorHost});
    } else {
      gate = await journey(gateArgs);
    }
    if (run.system === SYSTEM.LAGRANGE) await reform(BEFORE_MEASUREMENT);
    const boundGate = gate && typeof gate === 'object' ?
      {...gate, binding: bindingOf(manifest, current)} : gate;
    return {gate: boundGate, deployment: current, events};
  };
}

export {createSemanticGateStage, runTiDbSemanticGate};
