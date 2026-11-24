// Durability evidence handoff from Scenario A semantic gates into claim
// admission (`raw-observation-record.js` + `benchmark-claim-admission.js`):
// covers `lagrange`, `postgresql`, and `tidb-tikv` across local/remote gates,
// `smoke` and `main` profiles, and digest-recomputed semantic mutations.
import {Buffer} from 'node:buffer';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  admitClaim,
  awardedProofIds,
  checkSemanticGate,
  computeRawObservationRunDigest,
  validateCanonicalDurabilityCaseRecord,
  validateCanonicalSemanticGateCaseRecord,
} from '../benchmark-claim-admission.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  sealFixtureRun,
} from '../comparative-benchmark-fixtures.js';
import {
  createSemanticGateStage,
  executeRemoteGateAction,
} from '../comparative-benchmark-semantic-gate.js';
import {
  buildCoverageManifest,
  listManifestClaims,
} from '../comparative-coverage-manifest.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
} from '../oltp-scenario-a-durability-case.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from '../oltp-scenario-a-semantic-gate.js';
import {validateRunRecord} from '../raw-observation-record.js';
import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  jsonParse,
  jsonStringify,
  stringIncludes,
  stringReplace,
  stringSplit,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {STORAGE_KIND} from '../real-product-deployment-contract.js';
import {
  runScenarioASemanticProofJourney,
} from '../../scenarios/scenario-a-semantic-proof-journey.js';
import {
  createContainerLedger,
  dockerRules,
} from './real-product-deployer-product-answers-fixture.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  createTiDbMockStore,
  restartRuleForLedger,
  tidbClusterArmOf,
} from './tidb-semantic-case-completion-fixture.js';

const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const REMOTE_PAYLOAD_PATTERN = /--input-type=module -e '[^']+' ([A-Za-z0-9+/=]+)$/u;
const STATEMENT_VERB = /^\s*([A-Za-z]+)/u;
const LOAD_GENERATOR_HOST = Object.freeze({
  ip: '10.0.0.9',
  repoPath: '/srv/repo',
  nodePath: '/usr/bin/node',
});
const EXPECTED_PROOF_COUNT = OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length;
const WRITE_COMMANDS = Object.freeze(new Set(['INSERT', 'UPDATE', 'DELETE']));
const PG_MISSING_TABLE_CODE = '42P01';
const PG_SERIALIZATION_FAILURE_CODE = '40001';

function createMissingTableError(table) {
  return Object.assign(new Error(`Table not found: ${table}`), {code: PG_MISSING_TABLE_CODE});
}

function createSerializationConflictError() {
  return Object.assign(
    new Error('could not serialize access due to concurrent update'),
    {code: PG_SERIALIZATION_FAILURE_CODE, sqlState: PG_SERIALIZATION_FAILURE_CODE},
  );
}

function handlePgTableDdlSql(db, indexes, normalized) {
  const dropTbl = /^DROP TABLE IF EXISTS ([a-z_]+)$/iu.exec(normalized);
  if (dropTbl) {
    db.tables.delete(dropTbl[1]);
    for (const [name, meta] of [...indexes.entries()]) {
      if (meta.table_name === dropTbl[1]) indexes.delete(name);
    }
    return {rows: [], rowCount: 0};
  }
  const truncateTbl = /^TRUNCATE TABLE ([a-z_]+)$/iu.exec(normalized);
  if (truncateTbl) {
    if (!db.tables.has(truncateTbl[1])) throw createMissingTableError(truncateTbl[1]);
    db.tables.set(truncateTbl[1], []);
    return {rows: [], rowCount: 0};
  }
  return null;
}

function handlePgIndexSql(indexes, normalized) {
  const createIdx =
    /^CREATE INDEX(?: IF NOT EXISTS)? ([a-z0-9_]+) ON ([a-z0-9_]+) \(([^)]+)\)$/iu.exec(normalized);
  if (createIdx) {
    const cols = arrayMap(stringSplit(createIdx[3], ','), (col) => stringTrim(col));
    indexes.set(createIdx[1], {index_name: createIdx[1], table_name: createIdx[2],
      column_names: jsonStringify(cols), state: 'READY',
      indexdef: `CREATE INDEX ${createIdx[1]} ON public.${createIdx[2]} (${cols.join(', ')})`});
    return {rows: [], rowCount: 0};
  }
  const lagrangeIdx =
    /^SELECT index_name, .+ FROM indices WHERE table_name = '([a-z0-9_]+)'$/iu.exec(normalized);
  if (lagrangeIdx) {
    const matching = arrayFilter([...indexes.values()], (e) => e.table_name === lagrangeIdx[1]);
    return {rows: matching, rowCount: matching.length};
  }
  const pgIdx =
    /^SELECT indexname, .+ FROM pg_indexes WHERE tablename = '([a-z0-9_]+)' AND indexname = '([a-z0-9_]+)'$/iu
      .exec(normalized);
  if (pgIdx) {
    const entry = indexes.get(pgIdx[2]);
    const rows = entry && entry.table_name === pgIdx[1] ?
      [{indexname: entry.index_name, tablename: entry.table_name, indexdef: entry.indexdef}] : [];
    return {rows, rowCount: rows.length};
  }
  return null;
}

function handlePgTableProbeSql(db, normalized) {
  const schemaProbe = /^SELECT ([a-z_, ]+) FROM ([a-z_]+) LIMIT 1$/iu.exec(normalized);
  if (schemaProbe) {
    if (!db.tables.has(schemaProbe[2])) throw createMissingTableError(schemaProbe[2]);
    const rows = db.tables.get(schemaProbe[2]).slice(0, 1);
    return {rows, rowCount: rows.length};
  }
  const countProbe = /^SELECT COUNT\(\*\) AS row_count FROM ([a-z_]+)$/iu.exec(normalized);
  if (countProbe && !db.tables.has(countProbe[1])) {
    throw createMissingTableError(countProbe[1]);
  }
  return null;
}

function formatPgQueryResult(res, command) {
  if (Array.isArray(res)) {
    return {rows: res, rowCount: res.length, command};
  }
  return {rows: [], rowCount: res?.affectedRows ?? 0, command};
}

function updatePgTxState(txState, command, commitVersion) {
  if (command === 'BEGIN') {
    txState.active = true;
    txState.startVersion = commitVersion;
    txState.wrote = false;
  } else if (command === 'ROLLBACK') {
    txState.active = false;
    txState.wrote = false;
  } else if (txState.active && WRITE_COMMANDS.has(command)) {
    txState.wrote = true;
  }
}

function createPgWireMockStore(fault = {}) {
  const {store, createMysqlConnection} = createTiDbMockStore(fault);
  const indexes = new Map();
  const dbName = 'pg_gate_db';

  const handlePgAdminSql = (normalized) => {
    const db = store.ensureDb(dbName);
    return handlePgTableDdlSql(db, indexes, normalized) ||
      handlePgIndexSql(indexes, normalized) ||
      handlePgTableProbeSql(db, normalized);
  };

  let commitVersion = 0;

  const createPgClient = () => {
    let connPromise = null;
    const txState = {active: false, startVersion: 0, wrote: false};
    const ensureConn = () => {
      if (!connPromise) connPromise = createMysqlConnection({database: dbName});
      return connPromise;
    };
    const finishCommit = async (conn, sql, params) => {
      const hadWrites = txState.wrote;
      const stale = hadWrites && txState.startVersion !== commitVersion;
      txState.active = false;
      txState.wrote = false;
      if (stale) {
        await conn.query('ROLLBACK', []);
        throw createSerializationConflictError();
      }
      if (hadWrites) commitVersion += 1;
      await conn.query(sql, params);
      return {rows: [], rowCount: 0, command: 'COMMIT'};
    };
    return {
      connect: async () => {
        await ensureConn();
      },
      query: async (sql, params = []) => {
        const normalized = stringTrim(stringReplace(String(sql), /\s+/gu, ' '));
        const command = stringToUpperCase((STATEMENT_VERB.exec(normalized) || ['', ''])[1]);
        const admin = handlePgAdminSql(normalized);
        if (admin) return {...admin, command};
        const conn = await ensureConn();
        if (command === 'COMMIT') return finishCommit(conn, sql, params);
        updatePgTxState(txState, command, commitVersion);
        try {
          const [res] = await conn.query(sql, params);
          return formatPgQueryResult(res, command);
        } catch (error) {
          if (error?.sqlState === PG_SERIALIZATION_FAILURE_CODE) {
            txState.active = false;
            txState.wrote = false;
            throw createSerializationConflictError();
          }
          throw error;
        }
      },
      end: async () => {
        if (connPromise) {
          const conn = await connPromise;
          await conn.end();
        }
      },
    };
  };

  return {store, createPgClient};
}

function createPgDeploymentArm(ledger, {system, persistent = true}) {
  const isLagrange = system === 'lagrange';
  const role = isLagrange ? 'lagrange-node' : 'postgres-primary';
  const image = isLagrange ? 'psvensson/lagrange:0.4.0' : 'postgres:17-alpine';
  const mount = isLagrange ? '/data' : '/var/lib/postgresql/data';
  const source = `/srv/bench/camp/${system}-1`;
  const port = isLagrange ? 5433 : 5432;
  const vol = persistent ? ` -v ${source}:${mount}` : '';
  const id = stringTrim(ledger.run(
    `docker run -d --name bench-c-${role}-1${vol} --network host ${image}`, '10.0.0.1'));
  const startedAt = '2026-11-01T10:00:00.000Z';
  ledger.containers.get(id).startedAt = startedAt;
  return {
    roles: [{role, host: '10.0.0.1', containerId: id}],
    endpoint: {protocol: 'postgresql', host: '10.0.0.1', port, containerId: id},
    storage: [{role, host: '10.0.0.1', containerId: id, mount,
      kind: persistent ? STORAGE_KIND.HOST_VOLUME : STORAGE_KIND.CONTAINER_LAYER,
      source: persistent ? source : null}],
    access: {connection: {user: 'bench', password: 'pw', database: 'bench'}},
    identity: {products: [{role, host: '10.0.0.1', containerId: id,
      imageId: `sha256:${(isLagrange ? 'a' : 'c').repeat(64)}`, startedAt,
      mounts: persistent ? [{type: 'bind', source, destination: mount}] : [],
      reportedVersion: isLagrange ? '0.4.0' : 'PostgreSQL 17.6'}]},
    operations: {awaitReady: async () => ({ready: true})},
  };
}

function claimFor(targetId, subkind) {
  return arrayFind(listManifestClaims(buildCoverageManifest()),
    (c) => c.targetId === targetId && c.scenario === 'scenarioA' && c.subkind === subkind);
}

function buildBoundRunsWithGate({targetId, subkind, gate, endpointContainerId}) {
  const campaignId = 'camp-dur-admit';
  const header = buildFixtureHeader({campaignId, targetIds: [targetId]});
  const runs = arrayMap([1, 2], (repetition) => {
    const run = buildFixtureRun({campaignId, targetId, subkind, repetition});
    run.deployment.endpoint.containerId = endpointContainerId;
    run.deployment.roles[0].containerId = endpointContainerId;
    run.deployment.storage[0].containerId = endpointContainerId;
    run.identity.products[0].containerId = endpointContainerId;
    run.identity.productsAfterWindow[0].containerId = endpointContainerId;
    const gateCopy = jsonParse(jsonStringify(gate));
    const targetBinding = {
      campaignId,
      containerId: endpointContainerId,
      imageId: run.identity.products[0].imageId,
      endpoint: `${run.deployment.endpoint.host}:${run.deployment.endpoint.port}`,
    };
    if (gateCopy.binding) gateCopy.binding = {...targetBinding};
    if (Array.isArray(gateCopy.bindings)) {
      gateCopy.bindings = arrayMap(gateCopy.bindings, () => ({...targetBinding}));
    }
    if (Array.isArray(gateCopy.cases)) {
      for (const entry of gateCopy.cases) {
        if (entry.binding) entry.binding = {...targetBinding};
      }
    }
    run.correctness.semanticGate = gateCopy;
    sealFixtureRun(run, {keepFinalState: true});
    validateRunRecord(run);
    return {file: 'raw-observations.ndjson', run};
  });
  return {header, runs, campaignId};
}

function admitGateForProfiles({targetId, gate, endpointContainerId, subkinds = ['smoke', 'main']}) {
  const out = {};
  for (const subkind of subkinds) {
    const {header, runs, campaignId} = buildBoundRunsWithGate({
      targetId, subkind, gate, endpointContainerId,
    });
    const gateReasons = checkSemanticGate(runs[0].run);
    const cell = admitClaim({
      claim: claimFor(targetId, subkind),
      runs,
      campaignHeaders: new Map([[campaignId, header]]),
      retainedReferences: [],
      invalidations: [],
    });
    out[subkind] = {cell, gateReasons};
  }
  return out;
}

function assertPassedGateAdmitsCleanly({
  label, gate, targetId, endpointContainerId, expectedRole, subkinds = ['smoke', 'main'],
}) {
  assert.equal(gate.status, 'passed', `${label}: gate must pass`);
  assert.equal(gate.cases.length, 9, `${label}: all 9 cases must run`);
  const durabilityCase = arrayFind(gate.cases, (entry) => entry.caseId === 'durability');
  assert.ok(durabilityCase, `${label}: durability case must be recorded`);
  assert.equal(durabilityCase.status, 'passed', `${label}: durability case must pass`);
  assert.ok(durabilityCase.faultEvidence && typeof durabilityCase.faultEvidence === 'object',
    `${label}: durability case must retain faultEvidence`);
  assert.equal(durabilityCase.faultEvidence.faultTarget.role, expectedRole,
    `${label}: faultEvidence must name the restarted replica role`);
  assert.equal(durabilityCase.faultEvidence.storageContinuity, 'preserved',
    `${label}: faultEvidence must retain storageContinuity`);
  assert.notEqual(
    durabilityCase.faultEvidence.beforeIncarnation,
    durabilityCase.faultEvidence.afterIncarnation,
    `${label}: faultEvidence must show incarnation advancement`,
  );

  const awarded = awardedProofIds(gate);
  assert.equal(awarded.length, EXPECTED_PROOF_COUNT,
    `${label}: awardedProofIds must credit all ${EXPECTED_PROOF_COUNT} proof IDs`);
  for (const id of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(awarded, id), true, `${label}: must award ${id}`);
  }

  const admitted = admitGateForProfiles({targetId, gate, endpointContainerId, subkinds});
  if (admitted.smoke) {
    assert.deepEqual(admitted.smoke.gateReasons, [], `${label} smoke: checkSemanticGate must be empty`);
    assert.equal(admitted.smoke.cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
      `${label} smoke: ${admitted.smoke.cell.reasons.join(', ')}`);
    assert.deepEqual(admitted.smoke.cell.reasons, [ADMISSION_REASON.SMOKE_PROFILE],
      `${label} smoke: must emit zero semantic-gate-incomplete/not-passed reasons`);
    assert.equal(admitted.smoke.cell.evidence.semanticProofIds.length, EXPECTED_PROOF_COUNT,
      `${label} smoke: semanticProofIds must be 33/33`);
  }

  if (admitted.main) {
    assert.deepEqual(admitted.main.gateReasons, [], `${label} capacity: checkSemanticGate must be empty`);
    assert.equal(admitted.main.cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
      `${label} capacity: ${admitted.main.cell.reasons.join(', ')}`);
    assert.deepEqual(admitted.main.cell.reasons, [],
      `${label} capacity: must emit zero blocking or incomplete reasons`);
    assert.equal(admitted.main.cell.evidence.semanticProofIds.length, EXPECTED_PROOF_COUNT,
      `${label} capacity: semanticProofIds must be 33/33`);
  }
}

function remoteActionRule(overrides) {
  return [
    (command, host) => host === LOAD_GENERATOR_HOST.ip &&
      stringIncludes(command, '--input-type=module'),
    async (command) => {
      const encoded = REMOTE_PAYLOAD_PATTERN.exec(command)[1];
      const req = jsonParse(Buffer.from(encoded, 'base64').toString('utf8'));
      return jsonStringify(await executeRemoteGateAction(req, overrides));
    },
  ];
}

test('local PG-wire journey (runScenarioASemanticProofJourney) retains durability faultEvidence ' +
  'and admits 33/33 proof IDs with zero semantic-gate-incomplete for lagrange and postgresql',
async () => {
  for (const [system, targetId, expectedRole] of [
    ['lagrange', 'lagrange', 'lagrange-node'],
    ['postgresql', 'pg-single-primary', 'postgres-primary'],
  ]) {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([...dockerRules(ledger), restartRuleForLedger(ledger)]);
    const deployment = createPgDeploymentArm(ledger, {system, persistent: true});
    const engine = createPgWireMockStore();
    const stage = createSemanticGateStage({
      journey: (args) => runScenarioASemanticProofJourney({
        ...args,
        createClient: engine.createPgClient,
      }),
      sshRun, opts: {}, evidenceDirOf: () => null, now: () => 0,
    });
    const result = await stage({
      run: {runId: `r-local-${system}`, system},
      manifest: {campaignId: 'camp-dur-admit'}, deployment,
    });
    assertPassedGateAdmitsCleanly({
      label: `local-pg-journey:${system}`, gate: result.gate, targetId,
      endpointContainerId: deployment.endpoint.containerId, expectedRole,
    });
  }
});

test('remote PG-wire semantic gate (loadGeneratorHost) retains durability faultEvidence and ' +
  'admits 33/33 proof IDs with zero semantic-gate-incomplete for lagrange and postgresql',
async () => {
  for (const [system, targetId, expectedRole, subkinds] of [
    ['lagrange', 'lagrange', 'lagrange-node', ['smoke', 'main']],
    ['postgresql', 'pg-single-primary', 'postgres-primary', ['smoke', 'main']],
    ['postgresql', 'pg-patroni-sync-ha-rf3', 'postgres-primary', ['main']],
  ]) {
    const ledger = createContainerLedger();
    const engine = createPgWireMockStore();
    const {sshRun} = createScriptedSsh([
      remoteActionRule({createPgClient: engine.createPgClient}),
      ...dockerRules(ledger), restartRuleForLedger(ledger),
    ]);
    const deployment = createPgDeploymentArm(ledger, {system, persistent: true});
    const stage = createSemanticGateStage({
      journey: async () => {
        throw new Error('local journey must not run when loadGeneratorHost is supplied');
      },
      sshRun, opts: {}, loadGeneratorHost: LOAD_GENERATOR_HOST,
      evidenceDirOf: () => null, now: () => 0,
    });
    const result = await stage({
      run: {runId: `r-remote-${targetId}`, system},
      manifest: {campaignId: 'camp-dur-admit'}, deployment,
    });
    assertPassedGateAdmitsCleanly({
      label: `remote-pg-gate:${targetId}`, gate: result.gate, targetId,
      endpointContainerId: deployment.endpoint.containerId, expectedRole, subkinds,
    });
  }
});

test('TiDB semantic gate (local and remote loadGeneratorHost) retains durability faultEvidence ' +
  'and admits 33/33 proof IDs with zero semantic-gate-incomplete', async () => {
  for (const useRemote of [false, true]) {
    const ledger = createContainerLedger();
    const engine = createTiDbMockStore();
    const rules = [
      ...(useRemote ?
        [remoteActionRule({createMysqlConnection: engine.createMysqlConnection})] : []),
      ...dockerRules(ledger), restartRuleForLedger(ledger),
    ];
    const {sshRun} = createScriptedSsh(rules);
    const deployment = tidbClusterArmOf(ledger, {persistent: true});
    const stage = createSemanticGateStage({
      journey: async () => {
        throw new Error('PG journey must not run for TiDB');
      },
      sshRun, opts: {}, loadGeneratorHost: useRemote ? LOAD_GENERATOR_HOST : null,
      createMysqlConnection: useRemote ? null : engine.createMysqlConnection,
      evidenceDirOf: () => null, now: () => 0,
    });
    const result = await stage({
      run: {runId: `r-tidb-${useRemote ? 'remote' : 'local'}`, system: 'tidb-tikv'},
      manifest: {campaignId: 'camp-dur-admit'}, deployment,
    });
    assertPassedGateAdmitsCleanly({
      label: `tidb-gate:${useRemote ? 'remote' : 'local'}`, gate: result.gate,
      targetId: 'tidb-tikv', endpointContainerId: deployment.endpoint.containerId,
      expectedRole: 'tikv',
    });
  }
});

test('negative controls: missing faultEvidence, lost committed state, and unchanged incarnation ' +
  'fail closed through admission', async () => {
  // 1. Missing faultEvidence (restartProduct returns null) omits result.faultEvidence,
  //    withholds durability proof IDs (31/33), marks smoke incomplete, and blocks capacity.
  const nullRestartEngine = createPgWireMockStore();
  const nullRestartBinding = {
    campaignId: 'camp-dur-admit',
    containerId: 'a'.repeat(64),
    imageId: `sha256:${'a'.repeat(64)}`,
    endpoint: '10.0.0.1:5433',
  };
  const missingFaultGate = await runScenarioASemanticProofJourney({
    system: 'lagrange',
    connection: {
      endpoint: {host: '10.0.0.1', port: 5433},
      credentials: {user: 'bench', password: 'pw', database: 'bench'},
    },
    binding: nullRestartBinding,
    persistentStorage: true,
    restartProduct: async () => null,
    createClient: nullRestartEngine.createPgClient,
  });
  const missingDurCase = arrayFind(missingFaultGate.cases, (c) => c.caseId === 'durability');
  assert.equal(missingDurCase.status, 'failed');
  assert.equal(Object.hasOwn(missingDurCase, 'faultEvidence'), false,
    'null faultEvidence must not be attached onto compact case record');
  assert.equal(awardedProofIds(missingFaultGate).length,
    EXPECTED_PROOF_COUNT - OLTP_SCENARIO_A_DURABILITY_PROOF_IDS.length);
  const missingAdmitted = admitGateForProfiles({
    targetId: 'lagrange',
    gate: missingFaultGate,
    endpointContainerId: nullRestartBinding.containerId,
  });
  assert.equal(arrayIncludes(missingAdmitted.smoke.cell.reasons,
    ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
  assert.equal(missingAdmitted.main.cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
  assert.equal(arrayIncludes(missingAdmitted.main.cell.reasons,
    ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED), true);

  // 2. Genuine data loss on restart (`durability_state` product anomaly): faultEvidence IS
  //    preserved, durability proofs are withheld (31/33), and admission classifies the cell as
  //    PRODUCT_FAILURE (`semantic-gate-failed` + `semantic-gate-failed:durability`).
  const lossLedger = createContainerLedger();
  const lossEngine = createTiDbMockStore();
  const lossSsh = createScriptedSsh([
    ...dockerRules(lossLedger),
    restartRuleForLedger(lossLedger, {
      onRestart: () => lossEngine.store.loseCommittedDurabilityState(),
    }),
  ]);
  const lossDeployment = tidbClusterArmOf(lossLedger, {persistent: true});
  const lossResult = await createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: lossSsh.sshRun,
    opts: {},
    createMysqlConnection: lossEngine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
  })({
    run: {runId: 'r-tidb-data-loss', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-dur-admit'},
    deployment: lossDeployment,
  });
  const lossDurCase = arrayFind(lossResult.gate.cases, (c) => c.caseId === 'durability');
  assert.equal(lossDurCase.status, 'failed');
  assert.equal(lossDurCase.failureKind, 'product_anomaly');
  assert.ok(lossDurCase.faultEvidence, 'faultEvidence is retained on product_anomaly failure');
  assert.equal(awardedProofIds(lossResult.gate).length,
    EXPECTED_PROOF_COUNT - OLTP_SCENARIO_A_DURABILITY_PROOF_IDS.length);
  const lossAdmitted = admitGateForProfiles({
    targetId: 'tidb-tikv',
    gate: lossResult.gate,
    endpointContainerId: lossDeployment.endpoint.containerId,
  });
  assert.equal(lossAdmitted.main.cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE);
  assert.equal(arrayIncludes(lossAdmitted.main.cell.reasons,
    ADMISSION_REASON.SEMANTIC_GATE_FAILED), true);
  assert.equal(arrayIncludes(lossAdmitted.main.cell.reasons,
    `${ADMISSION_REASON.SEMANTIC_GATE_FAILED}:durability`), true);

  // 3. Unchanged incarnation across restart (`evidence_insufficient`): durability proofs are
  //    withheld (31/33), smoke carries detailed incomplete reason, and capacity is rejected.
  const sameIncLedger = createContainerLedger();
  const sameIncEngine = createTiDbMockStore();
  const sameIncSsh = createScriptedSsh([
    ...dockerRules(sameIncLedger),
    restartRuleForLedger(sameIncLedger, {advanceClock: false}),
  ]);
  const sameIncDeployment = tidbClusterArmOf(sameIncLedger, {persistent: true});
  const sameIncResult = await createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun: sameIncSsh.sshRun,
    opts: {},
    createMysqlConnection: sameIncEngine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
  })({
    run: {runId: 'r-tidb-same-inc', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-dur-admit'},
    deployment: sameIncDeployment,
  });
  assert.equal(awardedProofIds(sameIncResult.gate).length,
    EXPECTED_PROOF_COUNT - OLTP_SCENARIO_A_DURABILITY_PROOF_IDS.length);
  const sameIncAdmitted = admitGateForProfiles({
    targetId: 'tidb-tikv',
    gate: sameIncResult.gate,
    endpointContainerId: sameIncDeployment.endpoint.containerId,
  });
  assert.equal(arrayIncludes(sameIncAdmitted.smoke.cell.reasons,
    ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
  assert.equal(arrayIncludes(sameIncAdmitted.smoke.cell.reasons,
    `${ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE}:durability:evidence_insufficient`), true);
  assert.equal(sameIncAdmitted.main.cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
  assert.equal(arrayIncludes(sameIncAdmitted.main.cell.reasons,
    ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED), true);
  assert.equal(arrayIncludes(sameIncAdmitted.main.cell.reasons,
    `${ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE}:durability:evidence_insufficient`), true);
});

function resealSerializedRuns(runs) {
  return arrayMap(runs, (entry) => {
    const run = jsonParse(jsonStringify(entry.run));
    run.rawObservationsDigest = computeRawObservationRunDigest(run);
    return {file: entry.file, run};
  });
}

function admitMutatedSubmission({header, runs, campaignId, targetId = 'lagrange',
  subkind = 'smoke', mutate}) {
  const validHeader = jsonParse(jsonStringify(header));
  const validCell = admitClaim({
    claim: claimFor(targetId, subkind),
    runs: resealSerializedRuns(runs),
    campaignHeaders: new Map([[campaignId, validHeader]]),
    retainedReferences: [],
    invalidations: [],
  });
  assert.equal(validCell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
  assert.equal(validCell.evidence.semanticProofIds.length, EXPECTED_PROOF_COUNT);
  const mutatedHeader = jsonParse(jsonStringify(header));
  const clonedRuns = arrayMap(runs, (e) => ({file: e.file, run: jsonParse(jsonStringify(e.run))}));
  for (const entry of clonedRuns) mutate(entry.run, mutatedHeader);
  const mutatedCell = admitClaim({
    claim: claimFor(targetId, subkind),
    runs: resealSerializedRuns(clonedRuns),
    campaignHeaders: new Map([[campaignId, mutatedHeader]]),
    retainedReferences: [],
    invalidations: [],
  });
  assert.equal(arrayIncludes(mutatedCell.reasons, ADMISSION_REASON.RAW_DIGEST_MISMATCH), false);
  assert.equal(mutatedCell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
  return mutatedCell;
}

test('semantic mutations with recomputed rawObservationsDigest fail closed alongside valid ' +
  'companions across the full serialized producer-to-admission boundary', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([...dockerRules(ledger), restartRuleForLedger(ledger)]);
  const deployment = createPgDeploymentArm(ledger, {system: 'lagrange', persistent: true});
  const engine = createPgWireMockStore();
  const stage = createSemanticGateStage({
    journey: (args) => runScenarioASemanticProofJourney({
      ...args, createClient: engine.createPgClient,
    }),
    sshRun, opts: {}, evidenceDirOf: () => null, now: () => 0,
  });
  const produced = await stage({
    run: {runId: 'r-mut-lagrange', system: 'lagrange'},
    manifest: {campaignId: 'camp-dur-admit'},
    deployment,
  });
  const base = buildBoundRunsWithGate({
    targetId: 'lagrange', subkind: 'smoke', gate: produced.gate,
    endpointContainerId: deployment.endpoint.containerId,
  });

  // 1. Remove faultEvidence or replace with {}, bare timestamp string, or {restartedAt}.
  for (const bogus of [
    undefined, {}, '2026-11-24T06:51:20.378Z', {restartedAt: '2026-11-24T06:51:20.378Z'},
  ]) {
    const cell = admitMutatedSubmission({...base, mutate: (run) => {
      const dur = arrayFind(run.correctness.semanticGate.cases, (c) => c.caseId === 'durability');
      if (bogus === undefined) delete dur.faultEvidence;
      else dur.faultEvidence = bogus;
      if (bogus && typeof bogus === 'object' && bogus.restartedAt) {
        dur.restartedAt = bogus.restartedAt;
      }
    }});
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
    assert.equal(cell.evidence.semanticProofIds.length,
      EXPECTED_PROOF_COUNT - OLTP_SCENARIO_A_DURABILITY_PROOF_IDS.length);
  }

  // 2. Identical before/after incarnation timestamps.
  const sameIncCell = admitMutatedSubmission({...base, mutate: (run) => {
    const dur = arrayFind(run.correctness.semanticGate.cases, (c) => c.caseId === 'durability');
    const ts = dur.faultEvidence.beforeIncarnation.startedAt;
    dur.faultEvidence.startedAtBefore = ts;
    dur.faultEvidence.startedAtAfter = ts;
    dur.faultEvidence.afterIncarnation = {...dur.faultEvidence.beforeIncarnation};
  }});
  assert.equal(arrayIncludes(sameIncCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);

  // 3. Substitute wrong fault target host not in deployed target hosts or wrong system role.
  for (const mutateTarget of [
    (dur, run) => {
      dur.faultEvidence.host = run.deployment.loadGenerator.host;
      dur.faultEvidence.faultTarget.host = run.deployment.loadGenerator.host;
    },
    (dur) => {
      dur.faultEvidence.host = '10.99.99.99';
      dur.faultEvidence.faultTarget.host = '10.99.99.99';
    },
    (dur) => {
      dur.faultEvidence.faultTarget.role = 'tikv';
    },
  ]) {
    const unboundCell = admitMutatedSubmission({...base, mutate: (run) => {
      const dur = arrayFind(run.correctness.semanticGate.cases, (c) => c.caseId === 'durability');
      mutateTarget(dur, run);
    }});
    assert.equal(arrayIncludes(unboundCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_UNBOUND), true);
    assert.equal(
      arrayIncludes(unboundCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
  }

  // 4. Flip a failed case summary status to passed or strip gate.cases ([] / delete cases).
  for (const mutateCases of [
    (gate) => {
      Object.assign(gate.cases[0], {status: 'passed', proofIds: [], failureKind: 'product_anomaly'});
    },
    (gate) => {
      gate.cases = [];
    },
    (gate) => {
      delete gate.cases;
    },
  ]) {
    const flippedCell = admitMutatedSubmission({...base, mutate: (run) => {
      mutateCases(run.correctness.semanticGate);
    }});
    assert.equal(
      arrayIncludes(flippedCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
    assert.equal(
      arrayIncludes(flippedCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED), true);
    assert.equal(flippedCell.evidence.semanticProofIds.length < EXPECTED_PROOF_COUNT, true);
  }

  // 5. Transplant an older candidate's artifact / mismatched harness.gitCommit or fingerprint.
  const commitCell = admitMutatedSubmission({...base, mutate: (run) => {
    run.identity.harness.gitCommit = '9'.repeat(40);
  }});
  assert.equal(arrayIncludes(commitCell.reasons, ADMISSION_REASON.HARNESS_MISMATCH), true);
  const fpCell = admitMutatedSubmission({...base, mutate: (run, hdr) => {
    hdr.products[0].bootProvenance = {version: '0.4.0', bootedSrcFingerprint: '1c8c3a8090c64654'};
    run.identity.products[0].bootProvenance =
      {version: '0.4.0', bootedSrcFingerprint: 'deadbeef00000000'};
    run.identity.productsAfterWindow[0].bootProvenance =
      {version: '0.4.0', bootedSrcFingerprint: 'deadbeef00000000'};
  }});
  assert.equal(arrayIncludes(fpCell.reasons, ADMISSION_REASON.PRODUCT_IDENTITY_MISMATCH), true);

  // 6. Change fixture provenance to a claimed physical execution.
  const fixturePhysicalCell = admitMutatedSubmission({...base, mutate: (run, hdr) => {
    hdr.executionTarget = 'gcp';
    run.executionTarget = 'gcp';
  }});
  assert.equal(arrayIncludes(fixturePhysicalCell.reasons, ADMISSION_REASON.EMULATED_PRODUCT), true);
});

function assertStrippedWithdrawnGateRejected(rec, gate, dur) {
  assert.equal(validateCanonicalDurabilityCaseRecord(dur, rec).valid, false, rec.runId);
  for (const stripped of [{...gate, cases: []}, {...gate, cases: undefined}]) {
    const clone = {...rec, correctness: {...rec.correctness, semanticGate: stripped}};
    assert.equal(
      arrayIncludes(checkSemanticGate(clone), ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
    assert.deepEqual(awardedProofIds(stripped, clone), []);
  }
}

test('persisted v2 raw-observations.ndjson live passing gates satisfy canonical case and ' +
  'durability validators while pre-887007107 and historical v1 lines are rejected/forensic', () => {
  const lines = arrayFilter(
    stringSplit(readFileSync('data/tidb-comparison/raw-observations.ndjson', 'utf8'), '\n'),
    (l) => stringTrim(l) !== '',
  );
  let livePassedGates = 0;
  let withdrawnMissingFaultGates = 0;
  let v1ForensicCount = 0;
  for (const line of lines) {
    const rec = jsonParse(line);
    if (rec.schemaVersion !== 'lagrange-raw-observation-v2') {
      v1ForensicCount += 1;
      continue;
    }
    const gate = rec.correctness?.semanticGate;
    if (rec.recordType !== 'run' || gate?.status !== 'passed' || !Array.isArray(gate.cases)) {
      continue;
    }
    const dur = arrayFind(gate.cases, (c) => c.caseId === 'durability');
    if (!dur?.faultEvidence) {
      withdrawnMissingFaultGates += 1;
      assertStrippedWithdrawnGateRejected(rec, gate, dur);
      continue;
    }
    livePassedGates += 1;
    for (const c of gate.cases) {
      assert.equal(validateCanonicalSemanticGateCaseRecord(c, rec).valid, true,
        `${rec.runId}:${c.caseId}`);
    }
    assert.equal(validateCanonicalDurabilityCaseRecord(dur, rec).valid, true, rec.runId);
  }
  assert.ok(livePassedGates >= 3);
  assert.ok(withdrawnMissingFaultGates >= 1);
  assert.ok(v1ForensicCount > 0);
});
