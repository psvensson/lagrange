import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  admitClaim,
} from '../benchmark-claim-admission.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  sealFixtureRun,
} from '../comparative-benchmark-fixtures.js';
import {
  buildCoverageManifest,
  listManifestClaims,
} from '../comparative-coverage-manifest.js';
import {
  buildObservedFaultEvidence,
  createSemanticGateStage,
  executeRemoteGateAction,
} from '../comparative-benchmark-semantic-gate.js';
import {
  clusterReady,
  readSystemTables,
} from '../real-product-lagrange-observations.js';
import {
  QueryExecutor,
} from '../../../../src/query/query-executor.js';
import {
  SystemTableCache,
} from '../../../../src/cache/system-table-cache.js';
import {
  createCommittedServeEligibilityOwner,
} from '../../../control-plane/serve-eligibility-test-support.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from '../oltp-scenario-a-semantic-gate.js';
import {validateRunRecord} from '../raw-observation-record.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringIncludes,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
import {STORAGE_KIND} from '../real-product-deployment-contract.js';
import {
  createContainerLedger,
  dockerRules,
} from './real-product-deployer-product-answers-fixture.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {SQLParser} from '../../../../src/query/sql-parser.js';
import {withExecutedStatementType} from '../../../../src/query/application-database-result.js';
import {deriveCommandTag} from '../../../../src/runtime/pgwire-result-mapper.js';
import {
  resolveFailedStatementOutcome,
} from '../../../../src/runtime/pgwire-transaction-outcome.js';
import {
  PG_TRANSACTION_STATE,
} from '../../../../src/runtime/pgwire-protocol-constants.js';
import {
  createUnknownOutcomeRedelivery,
  UNKNOWN_OUTCOME_DECISION,
} from '../../../../src/query/query-executor-unknown-outcome.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  buildDeliveryEnvelope,
} from '../../../../src/transport/transport-semantic-outcome.js';
import {
  CANONICAL_REQUIRED_INDEXES,
  CANONICAL_SCHEMA_SHA256,
  CANONICAL_TABLE_COLUMNS,
  OLTP_DATASET_RESET_OUTCOME,
  createLagrangeOltpAdapter,
} from '../../reference-client/lagrange-oltp-adapter.js';

const IMAGE = `sha256:${'a'.repeat(64)}`;

function createArm(ledger, generation = 0, {persistent = true} = {}) {
  const mountArg = persistent ? ` -v /srv/bench/camp/lagrange-${generation}:/data` : '';
  const id = stringTrim(ledger.run(
    `docker run -d --name bench-c-lagrange-node-${generation}${mountArg} ` +
    '--network host psvensson/lagrange:0.4.0', '10.0.0.1'));
  const entry = ledger.containers.get(id);
  entry.startedAt = `2026-11-01T10:0${generation}:00.000Z`;
  return {
    roles: [{role: 'lagrange-node', host: '10.0.0.1', containerId: id}],
    endpoint: {protocol: 'pg-wire', host: '10.0.0.1', port: 5433 + generation, containerId: id},
    storage: [{
      role: 'lagrange-node',
      host: '10.0.0.1',
      containerId: id,
      mount: '/data',
      kind: persistent ? STORAGE_KIND.HOST_VOLUME : STORAGE_KIND.CONTAINER_LAYER,
      source: persistent ? `/srv/bench/camp/lagrange-${generation}` : null,
    }],
    access: {connection: {user: 'bench', database: 'bench'}},
    identity: {
      products: [{
        role: 'lagrange-node',
        host: '10.0.0.1',
        containerId: id,
        imageId: IMAGE,
        startedAt: entry.startedAt,
        mounts: persistent ? [{
          type: 'bind',
          source: `/srv/bench/camp/lagrange-${generation}`,
          destination: '/data',
        }] : [],
        reportedVersion: '0.4.0',
      }],
    },
    operations: {awaitReady: async () => ({ready: true})},
  };
}

function restartRuleForLedger(ledger) {
  let seq = 1;
  return [/docker restart -t 1 (\S+)/u, (command) => {
    const rawId = stringReplace((/docker restart -t 1 (\S+)/u.exec(command) || [])[1], /'/gu, '');
    const entry = ledger.containers.get(rawId);
    if (entry) {
      entry.startedAt = `2026-11-01T10:1${seq}:00.000Z`;
      seq += 1;
    }
    return `${rawId}\n`;
  }];
}

function claimFor(targetId, subkind) {
  return arrayFind(listManifestClaims(buildCoverageManifest()),
    (c) => c.targetId === targetId && c.scenario === 'scenarioA' && c.subkind === subkind);
}

function admitRunPairWithGate({targetId, subkind, gate, endpointContainerId = null}) {
  const campaignId = 'camp-bind';
  const header = buildFixtureHeader({campaignId, targetIds: [targetId]});
  const runs = arrayMap([1, 2], (repetition) => {
    const run = buildFixtureRun({campaignId, targetId, subkind, repetition});
    if (endpointContainerId) {
      run.deployment.endpoint.containerId = endpointContainerId;
      run.deployment.roles[0].containerId = endpointContainerId;
      run.deployment.storage[0].containerId = endpointContainerId;
      run.identity.products[0].containerId = endpointContainerId;
      run.identity.productsAfterWindow[0].containerId = endpointContainerId;
    }
    run.correctness.semanticGate = JSON.parse(JSON.stringify(gate));
    sealFixtureRun(run, {keepFinalState: true});
    validateRunRecord(run);
    return {file: 'raw-observations.ndjson', run};
  });
  return admitClaim({
    claim: claimFor(targetId, subkind),
    runs,
    campaignHeaders: new Map([[campaignId, header]]),
    retainedReferences: [],
    invalidations: [],
  });
}

test('supported-reset-capability: TRUNCATE TABLE parses, routes to all partitions, ' +
  'and derives PG command tag TRUNCATE TABLE', async () => {
  const parser = new SQLParser('TRUNCATE TABLE orders');
  const ast = parser.parse();
  assert.equal(ast.type, 'TRUNCATE');
  assert.equal(ast.table, 'orders');
  assert.deepEqual(ast.tables, ['orders']);

  const multiAst = new SQLParser('TRUNCATE TABLE orders, new_order, order_line').parse();
  assert.equal(multiAst.type, 'TRUNCATE');
  assert.deepEqual(multiAst.tables, ['orders', 'new_order', 'order_line']);

  const bareAst = new SQLParser('TRUNCATE orders').parse();
  assert.equal(bareAst.type, 'TRUNCATE');
  assert.deepEqual(bareAst.tables, ['orders']);

  const resultWithTag = withExecutedStatementType({success: true}, 'TRUNCATE');
  const tag = deriveCommandTag(resultWithTag);
  assert.equal(tag, 'TRUNCATE TABLE');
});

test('repeatable-clean-dataset-without-reformation: semantic gate stage resets dataset ' +
  'between cases without calling redeploy', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const baseArm = createArm(ledger, 0, {persistent: true});
  const probeRun = buildFixtureRun({campaignId: 'camp-bind', targetId: 'lagrange', subkind: 'main'});
  const deployment = {
    ...baseArm,
    endpoint: {
      ...probeRun.deployment.endpoint,
      containerId: baseArm.endpoint.containerId,
    },
    identity: {
      products: [{
        ...probeRun.identity.products[0],
        containerId: baseArm.endpoint.containerId,
      }],
    },
  };
  let redeployCallCount = 0;
  const resetEvents = [];

  const stage = createSemanticGateStage({
    journey: async ({binding, beforeCase, restartProduct}) => {
      const distinctBindings = [binding];
      for (const caseId of ['visibility', 'payment', 'delivery', 'durability']) {
        const fresh = await beforeCase({caseId});
        if (fresh && !arraySome(
          distinctBindings,
          (b) => b.containerId === fresh.binding.containerId &&
            b.endpoint === fresh.binding.endpoint,
        )) {
          distinctBindings.push(fresh.binding);
        }
        if (caseId === 'durability') await restartProduct({});
      }
      const canonicalGate = JSON.parse(JSON.stringify(probeRun.correctness.semanticGate));
      const activeBinding = distinctBindings.length === 1 ? distinctBindings[0] : null;
      if (activeBinding) {
        for (const c of canonicalGate.cases) c.binding = {...activeBinding};
      }
      return {
        ...canonicalGate,
        status: 'passed',
        binding: activeBinding,
        bindings: distinctBindings,
      };
    },
    sshRun,
    opts: {},
    evidenceDirOf: () => '/tmp/ev',
    now: () => 0,
    redeploy: async () => {
      redeployCallCount += 1;
      return createArm(ledger, redeployCallCount, {persistent: true});
    },
  });

  const result = await stage({
    run: {
      runId: 'r-same-cohort',
      system: 'lagrange',
      resetDataset: async ({caseId}) => {
        resetEvents.push(caseId);
      },
    },
    manifest: {campaignId: 'camp-cohort'},
    deployment,
  });

  assert.equal(redeployCallCount, 0, 'redeploy must never be called during cohort-preserving gate');
  assert.equal(result.gate.status, 'passed');
  assert.ok(result.gate.binding, 'gate must produce a single valid deployment binding');
  assert.equal(result.gate.binding.containerId, deployment.endpoint.containerId);
  assert.equal(result.deployment.endpoint.containerId, deployment.endpoint.containerId);

  const reFormationEvents = arrayFilter(result.events, (e) => e.kind === 're-formation');
  assert.equal(reFormationEvents.length, 0, 'zero re-formation events on preserved cohort');
  const datasetResetEvents = arrayFilter(result.events, (e) => e.kind === 'dataset-reset');
  assert.ok(datasetResetEvents.length >= 3, 'dataset-reset events recorded between cases');
});

test('durability-restart-retained: in-place container restart retains container identity ' +
  'and volume continuity', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const deployment = createArm(ledger, 0, {persistent: true});
  const target = {
    role: 'lagrange-node',
    host: '10.0.0.1',
    containerId: deployment.endpoint.containerId,
  };
  const beforeProduct = deployment.identity.products[0];
  const beforeStartedAt = beforeProduct.startedAt;

  await sshRun(target.host, {}, `docker restart -t 1 '${target.containerId}'`);
  const afterProduct = {
    ...beforeProduct,
    startedAt: ledger.containers.get(target.containerId).startedAt,
  };

  const faultEvidence = buildObservedFaultEvidence({
    deployment,
    target,
    beforeProduct,
    afterProduct,
    readiness: {ready: true},
  });

  assert.equal(faultEvidence.faultTarget.nodeId, target.containerId);
  assert.equal(faultEvidence.beforeIncarnation, `${target.containerId}:${beforeStartedAt}`);
  assert.equal(faultEvidence.afterIncarnation, `${target.containerId}:${afterProduct.startedAt}`);
  assert.notEqual(faultEvidence.afterIncarnation, faultEvidence.beforeIncarnation);
  assert.equal(faultEvidence.retainedObligations.length, 2);
  assert.equal(faultEvidence.retainedObligations[0], 'committed_payment_rows');
  assert.equal(faultEvidence.retainedObligations[1], 'full_oltp_state_sha256');
});

test('same-cohort-journey-to-valid-observed: full Lagrange journey on same cohort is admitted ' +
  'as valid-observed', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const baseArm = createArm(ledger, 0, {persistent: true});
  const probeRun = buildFixtureRun({campaignId: 'camp-bind', targetId: 'lagrange', subkind: 'main'});
  const deployment = {
    ...baseArm,
    endpoint: {
      ...probeRun.deployment.endpoint,
      containerId: baseArm.endpoint.containerId,
    },
    identity: {
      products: [{
        ...probeRun.identity.products[0],
        containerId: baseArm.endpoint.containerId,
      }],
    },
  };
  let redeployCallCount = 0;

  const stage = createSemanticGateStage({
    journey: async ({binding, beforeCase, restartProduct}) => {
      const distinctBindings = [binding];
      for (const caseId of ['visibility', 'payment', 'delivery', 'durability']) {
        const fresh = await beforeCase({caseId});
        if (fresh && !arraySome(
          distinctBindings,
          (b) => b.containerId === fresh.binding.containerId &&
            b.endpoint === fresh.binding.endpoint,
        )) {
          distinctBindings.push(fresh.binding);
        }
        if (caseId === 'durability') await restartProduct({});
      }
      const canonicalGate = JSON.parse(JSON.stringify(probeRun.correctness.semanticGate));
      const activeBinding = distinctBindings.length === 1 ? distinctBindings[0] : null;
      if (activeBinding) {
        for (const c of canonicalGate.cases) c.binding = {...activeBinding};
      }
      return {
        ...canonicalGate,
        status: 'passed',
        binding: activeBinding,
        bindings: distinctBindings,
      };
    },
    sshRun,
    opts: {},
    evidenceDirOf: () => '/tmp/ev',
    now: () => 0,
    redeploy: async () => {
      redeployCallCount += 1;
      return createArm(ledger, redeployCallCount, {persistent: true});
    },
  });

  const staged = await stage({
    run: {
      runId: 'r-valid-journey',
      system: 'lagrange',
      resetDataset: async () => {},
    },
    manifest: {campaignId: 'camp-bind'},
    deployment,
  });

  assert.equal(redeployCallCount, 0);
  assert.ok(staged.gate.binding);
  assert.equal(staged.gate.binding.containerId, staged.deployment.endpoint.containerId);

  const cell = admitRunPairWithGate({
    targetId: 'lagrange',
    subkind: 'main',
    gate: staged.gate,
    endpointContainerId: staged.deployment.endpoint.containerId,
  });

  assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
  assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SEMANTIC_GATE_UNBOUND), false);
  assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED), false);
});

test('cross-deployment-rejection: different deployment cohort between gate and measurement ' +
  'is rejected with SEMANTIC_GATE_UNBOUND', async () => {
  const gateWithContainerA = {
    status: 'passed',
    passed: [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS],
    failed: [],
    missing: [],
    cases: [],
    binding: {
      campaignId: 'camp-bind',
      containerId: 'container-cohort-a',
      imageId: IMAGE,
      endpoint: '10.0.0.1:5433',
    },
    bindings: [{
      campaignId: 'camp-bind',
      containerId: 'container-cohort-a',
      imageId: IMAGE,
      endpoint: '10.0.0.1:5433',
    }],
  };

  const crossCell = admitRunPairWithGate({
    targetId: 'lagrange',
    subkind: 'main',
    gate: gateWithContainerA,
    endpointContainerId: 'container-cohort-b',
  });

  assert.notEqual(crossCell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
  assert.equal(arrayIncludes(crossCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_UNBOUND), true);

  const multiDeploymentGate = {
    ...gateWithContainerA,
    binding: null,
    bindings: [
      gateWithContainerA.binding,
      {...gateWithContainerA.binding, containerId: 'container-cohort-c'},
    ],
  };

  const multiCell = admitRunPairWithGate({
    targetId: 'lagrange',
    subkind: 'main',
    gate: multiDeploymentGate,
    endpointContainerId: 'container-cohort-a',
  });

  assert.notEqual(multiCell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
  assert.equal(arrayIncludes(multiCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_UNBOUND), true);
});

function verifyResetSchemaSelect(store, tableSchemas, colList, table, returnSchemaProbeRow) {
  if (!store.has(table)) {
    throw new Error(`Table not found: ${table}`);
  }
  const knownCols = tableSchemas.get(table) || new Set();
  const requestedCols = arrayMap(stringSplit(colList, ','), (c) => stringTrim(c));
  for (const col of requestedCols) {
    if (!knownCols.has(col)) {
      throw new Error(`Column "${col}" does not exist on table "${table}"`);
    }
  }
  const rows = returnSchemaProbeRow ? (store.get(table) || []).slice(0, 1) : [];
  return {rows, rowCount: 0};
}

function executeSchemaDdlQuery(state, normalized) {
  const createMatch = /^CREATE\s+TABLE\s+([a-z_]+)/iu.exec(normalized);
  if (createMatch) {
    const table = createMatch[1];
    state.store.set(table, []);
    state.tableSchemas.set(table, new Set(CANONICAL_TABLE_COLUMNS[table] || []));
    return {rows: [], rowCount: 0};
  }
  const createIndexMatch =
    /^CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z0-9_]+)\s+ON\s+([a-z0-9_]+)\s*\(([^)]+)\)$/iu
      .exec(normalized);
  if (createIndexMatch) {
    if (state.onCreateIndex) state.onCreateIndex();
    const indexName = createIndexMatch[1];
    const tableName = createIndexMatch[2];
    const cols = arrayMap(stringSplit(createIndexMatch[3], ','), (c) => stringTrim(c));
    state.createdIndexes.set(indexName, {
      index_name: indexName,
      table_name: tableName,
      column_names: JSON.stringify(cols),
      state: 'READY',
    });
    return {rows: [], rowCount: 0};
  }
  const indexCatalogMatch =
    /^SELECT\s+index_name,\s*table_name,\s*column_names,\s*state\s+FROM\s+indices\s+WHERE\s+table_name\s*=\s*'([a-z0-9_]+)'$/iu
      .exec(normalized);
  if (indexCatalogMatch) {
    const targetTable = indexCatalogMatch[1];
    const matching = arrayFilter(
      [...state.createdIndexes.values()],
      (entry) => entry.table_name === targetTable,
    );
    return {rows: matching, rowCount: matching.length};
  }
  return null;
}

function executeSchemaProbeOrTruncate(state, normalized) {
  const schemaSelectMatch = /^SELECT\s+(.+?)\s+FROM\s+([a-z_]+)\s+LIMIT\s+1$/iu.exec(normalized);
  if (schemaSelectMatch) {
    return verifyResetSchemaSelect(
      state.store,
      state.tableSchemas,
      schemaSelectMatch[1],
      schemaSelectMatch[2],
      state.returnSchemaProbeRow,
    );
  }
  if (stringStartsWith(normalized, 'TRUNCATE TABLE')) {
    const table = stringReplace(normalized, /^TRUNCATE TABLE\s+/u, '');
    if (state.requireTableOnTruncate && !state.store.has(table)) {
      throw new Error(`Table not found: ${table}`);
    }
    state.store.set(table, []);
    return {rows: [], rowCount: 0};
  }
  return null;
}

function executeRowCountOrInsertQuery(store, normalized, params) {
  if (stringStartsWith(normalized, 'SELECT COUNT(*) AS row_count FROM')) {
    const table = stringReplace(normalized, /^SELECT COUNT\(\*\) AS row_count FROM\s+/u, '');
    if (!store.has(table)) {
      throw new Error(`Table not found: ${table}`);
    }
    return {rows: [{row_count: store.get(table).length}]};
  }
  if (stringStartsWith(normalized, 'INSERT INTO')) {
    const batchMatch = /^INSERT INTO\s+([a-z_]+)\s*\(([a-z_, ]+)\)\s*VALUES\s*/iu.exec(normalized);
    if (batchMatch) {
      const table = batchMatch[1];
      const cols = arrayMap(stringSplit(batchMatch[2], ','), (c) => stringTrim(c));
      if (!store.has(table)) store.set(table, []);
      const rows = store.get(table);
      for (let offset = 0; offset < params.length; offset += cols.length) {
        rows.push(Object.fromEntries(arrayMap(cols, (col, idx) => [col, params[offset + idx]])));
      }
      return {rows: [], rowCount: Math.max(1, params.length / cols.length)};
    }
    const table = (/^INSERT INTO\s+([a-z_]+)/u.exec(normalized) || [])[1];
    if (!store.has(table)) store.set(table, []);
    store.get(table).push(params);
    return {rows: [], rowCount: 1};
  }
  return null;
}

function applyWarehouseOrDistrictPayment(store, table, pred, amount) {
  for (const r of arrayFilter(store.get(table) || [], pred)) {
    r.ytd_cents += amount;
  }
  return {rows: [], rowCount: 1};
}

function applyCustomerPayment(store, params) {
  const match = (r) =>
    r.warehouse_id === params[2] && r.district_id === params[3] && r.customer_id === params[4];
  for (const r of arrayFilter(store.get('customer') || [], match)) {
    r.balance_cents -= params[0];
    r.ytd_payment_cents += params[1];
    r.payment_count += 1;
  }
  return {rows: [], rowCount: 1};
}

function executePaymentMutationQuery(store, normalized, params) {
  if (/^UPDATE\s+warehouse\s+SET\s+ytd_cents\b/iu.test(normalized)) {
    return applyWarehouseOrDistrictPayment(store, 'warehouse', (r) => r.id === params[1], params[0]);
  }
  if (/^UPDATE\s+district\s+SET\s+ytd_cents\b/iu.test(normalized)) {
    const pred = (r) => r.warehouse_id === params[1] && r.district_id === params[2];
    return applyWarehouseOrDistrictPayment(store, 'district', pred, params[0]);
  }
  if (/^UPDATE\s+customer\s+SET\s+balance_cents\s*=/iu.test(normalized)) {
    return applyCustomerPayment(store, params);
  }
  return null;
}

const PAYMENT_OBSERVATION_RULES = Object.freeze([
  [/^SELECT\s+ytd_cents\s+FROM\s+warehouse\b/iu, 'warehouse', (r, p) => r.id === p[0]],
  [/^SELECT\s+ytd_cents\s+FROM\s+district\b/iu, 'district',
    (r, p) => r.warehouse_id === p[0] && r.district_id === p[1]],
  [/^SELECT\s+balance_cents,\s*ytd_payment_cents,\s*payment_count\s+FROM\s+customer\b/iu,
    'customer',
    (r, p) => r.warehouse_id === p[0] && r.district_id === p[1] && r.customer_id === p[2]],
  [/^SELECT\s+amount_cents\s+FROM\s+history\b/iu, 'history',
    (r, p) => r.phase === p[0] && r.worker_id === p[1] && r.sequence_id === p[2]],
]);

function executePaymentObservationQuery(store, normalized, params) {
  const rule = arrayFind(PAYMENT_OBSERVATION_RULES, ([re]) => re.test(normalized));
  if (!rule) return null;
  const [, table, predicate] = rule;
  return {rows: arrayFilter(store.get(table) || [], (r) => predicate(r, params))};
}

function executeSnapshotQuery(store, normalized) {
  const snapMatch = /^SELECT\s+([a-z_, ]+)\s+FROM\s+([a-z_]+)\s+ORDER\s+BY\s+([a-z_, ]+)$/iu.exec(normalized);
  if (!snapMatch) return null;
  const cols = arrayMap(stringSplit(snapMatch[1], ','), (c) => stringTrim(c));
  const rows = store.get(snapMatch[2]) || [];
  return {
    rows: arrayMap(rows, (row) => Object.fromEntries(arrayMap(cols, (col) => [col, row[col]]))),
  };
}

async function runCohortResetTestQuery(state, sql, params = []) {
  state.onSql?.(sql);
  const normalized = stringTrim(stringReplace(String(sql), /\s+/gu, ' '));
  return executeSchemaDdlQuery(state, normalized) ||
    executeRowCountOrInsertQuery(state.store, normalized, params) ||
    executeSchemaProbeOrTruncate(state, normalized) ||
    executePaymentMutationQuery(state.store, normalized, params) ||
    executePaymentObservationQuery(state.store, normalized, params) ||
    executeSnapshotQuery(state.store, normalized) ||
    {rows: [], rowCount: 0};
}

test('actual-product-reset-and-state-evidence: adapter resetDataset executes TRUNCATE TABLE ' +
  'and restores clean initial dataset counts', async () => {
  const store = new Map();
  const tableSchemas = new Map();
  const createdIndexes = new Map();
  const executedSqls = [];
  const fakeState = {
    store,
    tableSchemas,
    createdIndexes,
    onSql: (sql) => executedSqls.push(sql),
    returnSchemaProbeRow: true,
    requireTableOnTruncate: true,
  };

  const fakeClient = {
    connect: async () => {},
    query: (sql, params = []) => runCohortResetTestQuery(fakeState, sql, params),
    end: async () => {},
  };

  assert.equal(CANONICAL_REQUIRED_INDEXES.length, 1);
  assert.equal(CANONICAL_REQUIRED_INDEXES[0].indexName, 'idx_orders_customer_latest');
  assert.equal(CANONICAL_REQUIRED_INDEXES[0].tableName, 'orders');
  assert.deepEqual(CANONICAL_REQUIRED_INDEXES[0].columns, [
    'warehouse_id',
    'district_id',
    'customer_id',
    'order_id',
  ]);

  const adapter = await createLagrangeOltpAdapter({
    endpoint: {host: '127.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => fakeClient,
    workload: {scale: 1, workers: 1},
  });

  assert.equal(typeof adapter.resetDataset, 'function', 'adapter must provide resetDataset capability');
  assert.equal(adapter.schemaProvisioning.schemaSha256, CANONICAL_SCHEMA_SHA256);

  const beforeEvidence = await adapter.getEvidence();
  assert.equal(beforeEvidence.stateCounts.orders, 0);

  // Simulate mutations
  store.set('orders', [{order_id: 101}]);
  store.set('new_order', [{order_id: 101}]);
  store.set('history', [{history_id: 1}]);

  assert.equal((await adapter.getEvidence()).stateCounts.orders, 1);

  const resetReport = await adapter.resetDataset();
  assert.equal(resetReport.outcome, OLTP_DATASET_RESET_OUTCOME.RESET_AND_ROUTABLE);
  assert.equal(resetReport.schemaSha256, CANONICAL_SCHEMA_SHA256);
  assert.equal(resetReport.tables.length, 9);
  assert.equal(arrayEvery(resetReport.tables,
    (entry) => entry.outcome === OLTP_DATASET_RESET_OUTCOME.RESET_AND_ROUTABLE &&
      entry.schemaSha256 === CANONICAL_SCHEMA_SHA256 &&
      entry.states.length >= 1 && entry.states[0].state === 'present'), true);

  const truncateCalls = arrayFilter(executedSqls, (s) => stringStartsWith(s, 'TRUNCATE TABLE'));
  assert.ok(truncateCalls.length >= 9, 'resetDataset must execute TRUNCATE TABLE across all 9 tables');

  const afterEvidence = await adapter.getEvidence();
  assert.equal(afterEvidence.stateCounts.orders, 0);
  assert.equal(afterEvidence.stateCounts.newOrders, 0);
  assert.equal(afterEvidence.stateCounts.history, 0);

  await adapter.close();

  // Opening a second adapter against the same preserved cohort (where all 9
  // tables exist) NEVER issues DROP TABLE or CREATE TABLE, validates the
  // canonical schema, executes TRUNCATE TABLE across all 9 tables, and records
  // reset-and-routable with real non-empty state observations.
  const secondSqls = [];
  const lagrangeClient = {
    connect: async () => {},
    query: async (sql, params = []) => {
      secondSqls.push(sql);
      return fakeClient.query(sql, params);
    },
    end: async () => {},
  };
  store.set('orders', [{order_id: 202}]);
  const secondAdapter = await createLagrangeOltpAdapter({
    endpoint: {host: '127.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => lagrangeClient,
    workload: {scale: 1, workers: 1},
  });
  assert.equal(
    arraySome(secondSqls, (s) => /^(DROP|CREATE)\s+TABLE/iu.test(stringTrim(s))),
    false,
    'preserved cohort reset must never issue DROP TABLE or CREATE TABLE',
  );
  assert.equal(
    arrayFilter(secondSqls, (s) => /^SELECT\s+.+\s+FROM\s+[a-z_]+\s+LIMIT\s+1$/iu.test(stringTrim(s))).length,
    9,
    'preserved cohort reset must validate canonical schema across all 9 tables',
  );
  assert.equal(
    arrayFilter(secondSqls, (s) => stringStartsWith(stringTrim(s), 'TRUNCATE TABLE')).length,
    9,
    'preserved cohort reset must execute TRUNCATE TABLE across all 9 tables',
  );
  assert.equal(secondAdapter.schemaProvisioning.schemaSha256, CANONICAL_SCHEMA_SHA256);
  assert.equal(secondAdapter.schemaProvisioning.tables.length, 9);
  for (const tableEntry of secondAdapter.schemaProvisioning.tables) {
    assert.equal(tableEntry.outcome, OLTP_DATASET_RESET_OUTCOME.RESET_AND_ROUTABLE);
    assert.equal(tableEntry.schemaSha256, CANONICAL_SCHEMA_SHA256);
    assert.ok(tableEntry.states.length >= 1, `expected non-empty states for ${tableEntry.table}`);
    assert.equal(tableEntry.states[0].state, 'present');
  }
  assert.equal((await secondAdapter.getEvidence()).stateCounts.orders, 0);
  await secondAdapter.close();

  // Mismatched column schema on preserved cohort is refused with schema-mismatch:
  tableSchemas.get('warehouse').delete('ytd_cents');
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5433},
      connection: {user: 'bench', database: 'bench'},
      createClient: () => fakeClient,
      workload: {scale: 1, workers: 1},
    }),
    (error) => error.code === OLTP_DATASET_RESET_OUTCOME.SCHEMA_MISMATCH,
  );
  tableSchemas.set('warehouse', new Set(CANONICAL_TABLE_COLUMNS.warehouse));

  // Resume the same canonical CREATE for an unroutable table and create the
  // missing suffix before the preserved cohort is reset.
  store.delete('history');
  const repairSql = [];
  let interruptProbe = true;
  const repaired = await createLagrangeOltpAdapter({
    endpoint: {host: '127.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    workload: {scale: 1, workers: 1},
    createClient: () => ({...fakeClient, async query(sql, params) {
      repairSql.push(sql);
      if (interruptProbe && sql === 'SELECT COUNT(*) AS row_count FROM new_order') {
        interruptProbe = false;
        throw Object.assign(new Error('Partition service not found'), {code: 'XX000'});
      }
      return fakeClient.query(sql, params);
    }}),
  });
  assert.deepEqual(repairSql.filter((sql) => /^CREATE TABLE /u.test(sql))
    .map((sql) => sql.split(' ')[2]), ['new_order', 'history']);
  assert.equal(repairSql.filter((sql) => /^TRUNCATE TABLE /u.test(sql)).length, 9);
  await repaired.close();

  // Engine that refuses TRUNCATE TABLE on preserved cohort is refused with reset-unsupported:
  const truncateRefusingClient = {
    connect: async () => {},
    query: async (sql, params = []) => {
      if (stringStartsWith(stringTrim(sql), 'TRUNCATE TABLE')) {
        throw new Error('Unsupported statement type: TRUNCATE_TABLE');
      }
      return fakeClient.query(sql, params);
    },
    end: async () => {},
  };
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5433},
      connection: {user: 'bench', database: 'bench'},
      createClient: () => truncateRefusingClient,
      workload: {scale: 1, workers: 1},
    }),
    (error) => error.code === OLTP_DATASET_RESET_OUTCOME.RESET_UNSUPPORTED,
  );
});

test('interrupted-schema-setup-missing-index: reopening a cohort where all 9 tables exist ' +
  'but CREATE INDEX idx_orders_customer_latest was not completed fails closed with ' +
  'schema-mismatch before any TRUNCATE TABLE', async () => {
  const store = new Map();
  const tableSchemas = new Map();
  const createdIndexes = new Map();
  let failCreateIndexOnInitialSetup = true;

  const catalogState = {
    store,
    tableSchemas,
    createdIndexes,
    onCreateIndex: () => {
      if (failCreateIndexOnInitialSetup) {
        throw new Error('simulated connection loss before idx_orders_customer_latest creation');
      }
    },
    returnSchemaProbeRow: false,
    requireTableOnTruncate: false,
  };

  const catalogClient = {
    connect: async () => {},
    query: (sql, params = []) => runCohortResetTestQuery(catalogState, sql, params),
    end: async () => {},
  };

  // 1. Initial schema setup succeeds on all 9 CREATE TABLE statements and
  // fails before CREATE INDEX idx_orders_customer_latest completes.
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5433},
      connection: {user: 'bench', database: 'bench'},
      createClient: () => catalogClient,
      workload: {scale: 1, workers: 1},
    }),
    /simulated connection loss before idx_orders_customer_latest creation/u,
  );
  assert.equal(store.size, 9, 'all 9 OLTP tables exist after interrupted setup');
  assert.equal(createdIndexes.size, 0, 'idx_orders_customer_latest was not created');

  // 2. Reopening the retained cohort sees all 9 tables present, validates
  // canonical tables + indexes, detects the missing idx_orders_customer_latest
  // index, and rejects with schema-mismatch BEFORE executing any TRUNCATE TABLE.
  failCreateIndexOnInitialSetup = false;
  const reopenSqls = [];
  const reopenClient = {
    connect: async () => {},
    query: async (sql, params = []) => {
      reopenSqls.push(sql);
      return catalogClient.query(sql, params);
    },
    end: async () => {},
  };

  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5433},
      connection: {user: 'bench', database: 'bench'},
      createClient: () => reopenClient,
      workload: {scale: 1, workers: 1},
    }),
    (error) =>
      error.code === OLTP_DATASET_RESET_OUTCOME.SCHEMA_MISMATCH &&
      /idx_orders_customer_latest/u.test(error.message),
  );

  const truncateStatements = arrayFilter(
    reopenSqls,
    (sql) => stringStartsWith(stringTrim(sql), 'TRUNCATE TABLE'),
  );
  assert.equal(
    truncateStatements.length,
    0,
    'TRUNCATE TABLE must never execute when idx_orders_customer_latest is missing',
  );

  // 3. Even if an index named idx_orders_customer_latest exists on orders, if
  // its column list does not match the canonical 4-column definition, cohort
  // reuse is also refused with schema-mismatch before any TRUNCATE TABLE.
  createdIndexes.set('idx_orders_customer_latest', {
    index_name: 'idx_orders_customer_latest',
    table_name: 'orders',
    column_names: JSON.stringify(['warehouse_id', 'district_id']),
    state: 'READY',
  });
  const wrongColsSqls = [];
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5433},
      connection: {user: 'bench', database: 'bench'},
      createClient: () => ({
        connect: async () => {},
        query: async (sql, params = []) => {
          wrongColsSqls.push(sql);
          return catalogClient.query(sql, params);
        },
        end: async () => {},
      }),
      workload: {scale: 1, workers: 1},
    }),
    (error) =>
      error.code === OLTP_DATASET_RESET_OUTCOME.SCHEMA_MISMATCH &&
      /idx_orders_customer_latest/u.test(error.message),
  );
  assert.equal(
    arrayFilter(wrongColsSqls, (sql) => stringStartsWith(stringTrim(sql), 'TRUNCATE TABLE')).length,
    0,
    'TRUNCATE TABLE must never execute when idx_orders_customer_latest has wrong columns',
  );
});

test('truncate-unknown-outcome-and-08007-boundary: lost transport answer and leader-loss ' +
  'redeliver under same entryId, deadline expiry preserves 08007 detail instead of ' +
  'reset-unsupported, and post-truncate residual rows fail closed', async () => {
  let clockMs = 1000;
  const lostReplyOwner = createUnknownOutcomeRedelivery({
    forRead: false, entryId: 'entry-truncate-history-p1', now: () => clockMs,
  });
  lostReplyOwner.recordDelivery();
  lostReplyOwner.observeTransport({
    delivered: false,
    reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT,
    error: 'Message delivery timed out after 5000ms',
  });
  assert.equal(lostReplyOwner.isUnresolved(), true);
  assert.equal(
    lostReplyOwner.observeAnswer({
      success: false, errorCode: 'MESSAGE_TIMEOUT',
      error: 'Message delivery timed out after 5000ms',
    }),
    UNKNOWN_OUTCOME_DECISION.REDELIVER,
  );
  lostReplyOwner.recordDelivery();
  clockMs += 150;
  assert.equal(
    lostReplyOwner.observeAnswer({
      success: false, failureCode: 'partition_write_not_leader', leaderId: 'node-2',
    }),
    UNKNOWN_OUTCOME_DECISION.REDELIVER,
  );
  lostReplyOwner.recordDelivery();
  clockMs += 100;
  assert.equal(
    lostReplyOwner.observeAnswer({
      success: false, committed: true, settledReplay: 'retained',
      entryId: 'entry-truncate-history-p1', changes: 0,
    }),
    UNKNOWN_OUTCOME_DECISION.NONE,
  );
  assert.equal(lostReplyOwner.isUnresolved(), false);

  const deadlineOwner = createUnknownOutcomeRedelivery({
    forRead: false, entryId: 'entry-truncate-history-p2', now: () => clockMs,
  });
  deadlineOwner.recordDelivery();
  clockMs += 5000;
  assert.equal(
    deadlineOwner.observeAnswer({
      success: false, failureCode: 'partition_write_outcome_unknown',
      disposition: 'proposed', entryId: 'entry-truncate-history-p2',
      consensus: {reason: 'role-changed', logIndex: 42, term: 7},
    }),
    UNKNOWN_OUTCOME_DECISION.REDELIVER,
  );
  const exhaustedParticipant = deadlineOwner.finish({
    partitionId: 'history-p1', participantNodeId: 'node-1',
    participantAddress: 'node-1/partition/history-p1-r1',
    errorCode: 'TIMEOUT', error: 'Partition execution deadline exceeded',
  });
  const pgOutcome = resolveFailedStatementOutcome({
    stateBefore: PG_TRANSACTION_STATE.IDLE,
    statementType: 'TRUNCATE',
    failure: {
      success: false,
      errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
      error: 'Distributed write failed on one or more partitions',
      distributedWritePlan: {
        operationId: 'op-truncate-history-1',
        idempotencyKey: 'idem-truncate-history-1',
      },
      participantFailures: [exhaustedParticipant],
      firstFailedParticipant: exhaustedParticipant,
    },
    engineHoldsTransaction: () => false,
  });
  assert.equal(pgOutcome.sqlState, '08007');
  assert.equal(pgOutcome.detail.entry_id, 'entry-truncate-history-p2');
  assert.equal(pgOutcome.detail.operation_id, 'op-truncate-history-1');
  assert.equal(pgOutcome.detail.idempotency_key, 'idem-truncate-history-1');
  assert.equal(pgOutcome.detail.partition_id, 'history-p1');
  assert.equal(pgOutcome.detail.participant_node_id, 'node-1');
  assert.equal(pgOutcome.detail.failure_code, 'partition_write_outcome_unknown');
  assert.deepEqual(pgOutcome.detail.consensus, {reason: 'role-changed', logIndex: 42, term: 7});
  assert.equal(pgOutcome.detail.spent_wait.deliveries, 1);

  const store = new Map();
  const tableSchemas = new Map();
  const createdIndexes = new Map();
  const catalogState = {
    store, tableSchemas, createdIndexes,
    returnSchemaProbeRow: true, requireTableOnTruncate: true,
  };
  const baseClient = {
    connect: async () => {},
    query: (sql, params = []) => runCohortResetTestQuery(catalogState, sql, params),
    end: async () => {},
  };
  const initialAdapter = await createLagrangeOltpAdapter({
    endpoint: {host: '127.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => baseClient,
    workload: {scale: 1, workers: 1},
  });
  const initialSeedCounts = {
    warehouse: store.get('warehouse')?.length,
    district: store.get('district')?.length,
    customer: store.get('customer')?.length,
    item: store.get('item')?.length,
    stock: store.get('stock')?.length,
  };
  assert.ok(initialSeedCounts.warehouse > 0);
  assert.ok(initialSeedCounts.customer > 0);

  let failHistoryWith08007 = true;
  const outcomeUnknownClient = {
    connect: async () => {},
    query: async (sql, params = []) => {
      if (failHistoryWith08007 && stringTrim(sql) === 'TRUNCATE TABLE history') {
        const err = new Error(pgOutcome.message);
        err.code = pgOutcome.sqlState;
        err.sqlState = pgOutcome.sqlState;
        err.detail = JSON.stringify(pgOutcome.detail);
        throw err;
      }
      return baseClient.query(sql, params);
    },
    end: async () => {},
  };

  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5433},
      connection: {user: 'bench', database: 'bench'},
      createClient: () => outcomeUnknownClient,
      workload: {scale: 1, workers: 1},
    }),
    (error) => {
      assert.notEqual(error.code, OLTP_DATASET_RESET_OUTCOME.RESET_UNSUPPORTED);
      assert.equal(error.code, '08007');
      assert.equal(error.sqlState, '08007');
      assert.equal(error.failureTable, 'history');
      const parsedDetail = JSON.parse(error.detail);
      assert.equal(parsedDetail.entry_id, 'entry-truncate-history-p2');
      assert.equal(parsedDetail.partition_id, 'history-p1');
      assert.equal(parsedDetail.spent_wait.deliveries, 1);
      return true;
    },
  );

  let faultyResetOnExistingAdapter = false;
  const toggleableResetClient = {
    connect: async () => {},
    query: async (sql, params = []) => {
      if (faultyResetOnExistingAdapter && stringTrim(sql) === 'TRUNCATE TABLE history') {
        const err = new Error(pgOutcome.message);
        err.code = pgOutcome.sqlState;
        err.sqlState = pgOutcome.sqlState;
        err.detail = JSON.stringify(pgOutcome.detail);
        throw err;
      }
      return baseClient.query(sql, params);
    },
    end: async () => {},
  };
  const retryableAdapter = await createLagrangeOltpAdapter({
    endpoint: {host: '127.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => toggleableResetClient,
    workload: {scale: 1, workers: 1},
  });
  faultyResetOnExistingAdapter = true;
  await assert.rejects(
    retryableAdapter.resetDataset(),
    (error) => error.code === '08007' && error.failureTable === 'history',
  );
  faultyResetOnExistingAdapter = false;
  failHistoryWith08007 = false;
  store.set('history', [{history_id: 999}]);
  const resetCountSqls = [];
  const previousOnSql = catalogState.onSql;
  catalogState.onSql = (sql) => {
    previousOnSql?.(sql);
    if (stringStartsWith(stringTrim(sql), 'SELECT COUNT(*) AS row_count FROM')) {
      resetCountSqls.push(stringTrim(sql));
    }
  };
  const recoveredReset = await retryableAdapter.resetDataset();
  catalogState.onSql = previousOnSql;
  assert.equal(recoveredReset.outcome, OLTP_DATASET_RESET_OUTCOME.RESET_AND_ROUTABLE);
  assert.equal(resetCountSqls.length, 9);
  const recoveredOutcomeUnknownAdapter = await createLagrangeOltpAdapter({
    endpoint: {host: '127.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => outcomeUnknownClient,
    workload: {scale: 1, workers: 1},
  });
  assert.equal(recoveredOutcomeUnknownAdapter.schemaProvisioning.tables.length, 9);
  await recoveredOutcomeUnknownAdapter.close();
  assert.ok(Number.isFinite(recoveredReset.resetDurationMs));
  assert.ok(Number.isFinite(recoveredReset.seedLoadDurationMs));
  for (const tableEntry of recoveredReset.tables) {
    assert.equal(tableEntry.postTruncateRowCount, 0);
    assert.ok(Number.isFinite(tableEntry.truncateDurationMs));
  }
  const stateAfterReset = (await retryableAdapter.getEvidence()).stateCounts;
  assert.equal(stateAfterReset.orders, 0);
  assert.equal(stateAfterReset.newOrders, 0);
  assert.equal(stateAfterReset.orderLines, 0);
  assert.equal(stateAfterReset.history, 0);
  assert.equal(store.get('warehouse')?.length, initialSeedCounts.warehouse);
  assert.equal(store.get('district')?.length, initialSeedCounts.district);
  assert.equal(store.get('customer')?.length, initialSeedCounts.customer);
  assert.equal(store.get('item')?.length, initialSeedCounts.item);
  assert.equal(store.get('stock')?.length, initialSeedCounts.stock);
  await retryableAdapter.close();

  const residualClient = {
    connect: async () => {},
    query: async (sql, params = []) => {
      if (stringTrim(sql) === 'TRUNCATE TABLE history') {
        store.set('history', [{history_id: 777}]);
        return {rows: [], rowCount: 0};
      }
      return baseClient.query(sql, params);
    },
    end: async () => {},
  };
  await assert.rejects(
    createLagrangeOltpAdapter({
      endpoint: {host: '127.0.0.1', port: 5433},
      connection: {user: 'bench', database: 'bench'},
      createClient: () => residualClient,
      workload: {scale: 1, workers: 1},
    }),
    (error) =>
      error.code === 'truncate-residual-rows' &&
      error.failureTable === 'history' &&
      error.residualRowCount === 1,
  );
  await initialAdapter.close();
});

test('readiness-system-tables-contract: readSystemTables -> clusterReady derives distinct ' +
  'canonical tableNames from partitions without requiring a nonexistent tables.tables member',
async () => {
  const nodeIds = ['node-1', 'node-2', 'node-3'];
  const nodeRoles = arrayMap(nodeIds, (nodeId, idx) => ({
    role: 'lagrange-node', host: `10.0.0.${idx + 1}`, containerId: `c-${idx + 1}`, nodeId,
  }));
  const priorityTables = [
    'control_plane_publications', 'replica_operations', 'schema_operations',
    'sql_transaction_participants', 'sql_transactions', 'sql_write_operations',
  ];
  const partitions = [
    ...arrayMap(priorityTables, (tableName) => ({
      partition_id: `${tableName}-p1`, table_name: tableName,
      replica_count: '3', leader_node_id: 'node-1',
    })),
    {partition_id: 'orders-p1', table_name: 'orders', replica_count: '3', leader_node_id: 'node-1'},
    {partition_id: 'orders-p2', table_name: 'orders', replica_count: '3', leader_node_id: 'node-2'},
  ];
  const services = [];
  for (const part of partitions) {
    for (const nodeId of nodeIds) {
      services.push({
        partition_id: part.partition_id, node_id: nodeId, status: 'active',
        raft_role: nodeId === part.leader_node_id ? 'leader' : 'follower',
      });
    }
  }
  const nowMs = 1_000_000;
  const realShapeQuery = async (sql) => {
    if (/FROM\s+nodes\b/u.test(sql)) {
      return arrayMap(nodeIds, (nodeId) => ({
        node_id: nodeId, status: 'active', connection_state: 'ready',
        ready_lease_expires_at: String(nowMs + 10_000), last_heartbeat: String(nowMs - 100),
      }));
    }
    if (/FROM\s+service_endpoints\b/u.test(sql)) {
      return [{
        service_id: 'sys-postgres-wire', node_id: 'node-1',
        protocol: 'postgresql', port: '5432', health_status: 'healthy',
      }];
    }
    if (/FROM\s+partitions\b/u.test(sql)) return partitions;
    if (/FROM\s+services\b/u.test(sql)) return services;
    if (/^SELECT\s+COUNT\(\*\)\s+AS\s+row_count\s+FROM\s+orders$/iu.test(stringTrim(sql))) {
      return [{row_count: '0'}];
    }
    throw new Error(`Unexpected query in readSystemTables: ${sql}`);
  };

  const snapshot = await readSystemTables(realShapeQuery);
  assert.deepEqual(Object.keys(snapshot).sort(), ['endpoints', 'nodes', 'partitions', 'services']);
  assert.equal(Object.hasOwn(snapshot, 'tables'), false);

  const readinessByNodeId = Object.fromEntries(
    arrayMap(nodeIds, (nodeId) => [nodeId, {dimensions: {serveEligible: true}, reasons: []}]),
  );
  const ctx = {
    sshRun: async (_host, _opts, cmd) => {
      if (stringIncludes(cmd, '/api/admin/control-snapshot')) {
        return `${JSON.stringify({
          controlPlaneDiagnostics: {readinessByNodeId}, replicaOperations: {inFlightCount: 0},
        })}\nhttp_status=200`;
      }
      return 'http_status=200';
    },
    opts: {}, clientIp: '10.0.0.9', sleep: async () => {}, now: () => nowMs,
    budget: {attempts: 2, intervalMs: 10, stablePolls: 1},
  };
  const ready = await clusterReady(
    ctx, 'lagrange-system-tables', realShapeQuery, nodeRoles, ['orders'],
  );
  assert.equal(ready.state, 'ready');
  assert.equal(ready.attempts, 1);
  assert.equal(ready.evidence.partitions, 8);
  assert.equal(ready.evidence.tables, 7);
  assert.equal(arrayIncludes(ready.evidence.tableNames, 'orders'), true);
  assert.equal(arrayIncludes(ready.evidence.partitionIds, 'orders-p1'), true);
  assert.equal(arrayIncludes(ready.evidence.partitionIds, 'orders-p2'), true);
});

test('unknown-outcome-real-delivery-loop-progression: unresolved write after lost answer ' +
  'engages post-unknown NO_HANDLER quarantine and not-leader refusal on candidate B before ' +
  'settling on candidate C under the same entryId, and enforces per-target backpressure ' +
  'retry-not-before across follower redirects and revisits', async () => {
  const partitionId = 'history-p1';
  const addrA = 'node-1/partition/history-p1-r1';
  const addrB = 'node-2/partition/history-p1-r2';
  const addrC = 'node-3/partition/history-p1-r3';

  const seedHistoryCache = (addrs) => {
    const cache = new SystemTableCache();
    addrs.forEach((address, idx) => {
      const nodeId = `node-${idx + 1}`;
      cache.applySystemTableChange('nodes', 'INSERT', {
        node_id: nodeId, status: 'active', connection_state: 'ready',
        ready_lease_expires_at: Date.now() + 60_000, last_heartbeat: Date.now(),
      });
      cache.applySystemTableChange('services', 'INSERT', {
        service_id: `history-p1-r${idx + 1}`, partition_id: partitionId, service_type: 'partition',
        node_id: nodeId, address, status: 'active', raft_role: idx === 0 ? 'leader' : 'follower',
      });
    });
    cache.applySystemTableChange('partitions', 'INSERT', {
      partition_id: partitionId, table_name: 'history',
      leader_node_id: 'node-1', replica_count: addrs.length,
    });
    return cache;
  };
  const eligibility = createCommittedServeEligibilityOwner({
    projectedDimensions: {controlPlaneRecoveryEligible: true},
  });

  for (const secondRefusal of ['no-handler', 'not-leader-without-redirect']) {
    const cache = seedHistoryCache([addrA, addrB, addrC]);
    const deliveredCalls = [];
    const router = {
      nodeId: 'node-1',
      async deliver(address, request) {
        const entryId = request?.operation?.entryId ?? request?.entryId ?? null;
        deliveredCalls.push({address, entryId});
        if (address === addrA) {
          return buildDeliveryEnvelope({
            acknowledged: false,
            reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT,
            error: 'Message delivery timed out after 5000ms',
          });
        }
        if (address === addrB) {
          return secondRefusal === 'no-handler' ?
            buildDeliveryEnvelope({
              acknowledged: false, noHandler: true,
              error: `No handler registered for address: ${addrB}`,
            }) :
            buildDeliveryEnvelope({acknowledged: true}, {
              success: false, failureCode: 'partition_write_not_leader',
              error: 'Not the partition leader',
            });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: true, committed: true, settledReplay: 'retained', changes: 0, entryId,
        });
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: eligibility, messageRouter: router,
      nodeId: 'node-1', systemCache: cache, leaderRetryDelayMs: 1, queryTimeoutMs: 5_000,
    });
    const outcome = await executor.executeOnPartition(
      partitionId, 'TRUNCATE TABLE history', [], false, true, false, {tableName: 'history'},
    );
    assert.equal(outcome.success, true, `expected recovery to C after B refusal (${secondRefusal})`);
    assert.deepEqual(arrayMap(deliveredCalls, (c) => c.address), [addrA, addrB, addrC]);
    const firstEntryId = deliveredCalls[0].entryId;
    assert.ok(typeof firstEntryId === 'string' && firstEntryId.length > 0);
    assert.equal(deliveredCalls[1].entryId, firstEntryId);
    assert.equal(deliveredCalls[2].entryId, firstEntryId);
    if (secondRefusal === 'no-handler') {
      assert.equal(executor.isTemporarilyUnroutableAddress(partitionId, addrB), true);
    }
  }

  for (const followerBehavior of ['redirect-to-a', 'not-leader-revisit-a']) {
    const cache = seedHistoryCache([addrA, addrB]);
    let simulatedNowMs = 10_000;
    const waitedDelays = [];
    const deliveryTimeline = [];
    let aDeliveries = 0;
    const router = {
      nodeId: 'node-1',
      async deliver(address, request) {
        const entryId = request?.operation?.entryId ?? request?.entryId ?? null;
        deliveryTimeline.push({address, entryId, atMs: simulatedNowMs});
        if (address === addrA) {
          aDeliveries += 1;
          if (aDeliveries === 1) {
            return buildDeliveryEnvelope({
              acknowledged: false,
              reasonCode: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT,
              error: 'Message delivery timed out after 5000ms',
            });
          }
          if (aDeliveries === 2) {
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: false, failureCode: 'partition_write_backpressure',
              errorCode: 'PARTITION_WRITE_BACKPRESSURE',
              error: 'Partition proposal queue backpressured',
              retryAfterMs: 1000, deferRetry: true, backpressured: true,
            });
          }
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: true, committed: true, settledReplay: 'retained', changes: 0, entryId,
          });
        }
        if (aDeliveries === 1 || followerBehavior !== 'redirect-to-a') {
          return buildDeliveryEnvelope({acknowledged: true}, {
            success: false, failureCode: 'partition_write_not_leader',
            error: 'Not the partition leader',
          });
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false, redirect: 'leader_redirect',
          leaderAddress: addrA, error: 'Not leader, redirect to leader',
        });
      },
    };
    const executor = new QueryExecutor({
      controlPlaneReadinessService: eligibility, messageRouter: router,
      nodeId: 'node-1', systemCache: cache, leaderRetryDelayMs: 10, queryTimeoutMs: 15_000,
      ...(followerBehavior === 'redirect-to-a' ? {nowFn: () => simulatedNowMs} : {}),
    });
    executor.timeSource = {now: () => simulatedNowMs};
    executor.delay = async (ms) => {
      waitedDelays.push(ms);
      simulatedNowMs += ms;
    };
    const outcome = await executor.executeOnPartition(
      partitionId, 'UPDATE history SET amount_cents = 1', [], false, true, false,
      {tableName: 'history'},
    );
    assert.equal(outcome.success, true, `expected settlement for ${followerBehavior}`);
    const aEvents = arrayFilter(deliveryTimeline, (e) => e.address === addrA);
    const bEvents = arrayFilter(deliveryTimeline, (e) => e.address === addrB);
    assert.equal(aEvents.length, 3);
    assert.equal(bEvents.length, 2);
    assert.equal(bEvents[1].atMs, aEvents[1].atMs);
    assert.ok(aEvents[2].atMs - aEvents[1].atMs >= 1000);
    assert.equal(new Set(arrayMap(deliveryTimeline, (e) => e.entryId)).size, 1);
  }
});

test('remote-reset-timing-boundary: executeRemoteGateAction and createSemanticGateStage ' +
  'preserve earlier adapter reset timings across the remote JSON boundary instead of ' +
  'substituting case completion time', async () => {
  const store = new Map();
  const tableSchemas = new Map();
  const createdIndexes = new Map();
  const catalogState = {
    store, tableSchemas, createdIndexes,
    returnSchemaProbeRow: true, requireTableOnTruncate: true,
  };
  const fakeClient = {
    connect: async () => {},
    query: (sql, params = []) => runCohortResetTestQuery(catalogState, sql, params),
    end: async () => {},
  };

  const seedAdapter = await createLagrangeOltpAdapter({
    endpoint: {host: '10.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => fakeClient,
    workload: {scale: 1, workers: 1},
  });
  await seedAdapter.close();

  const remoteReqBase = {
    system: 'lagrange',
    connection: {
      endpoint: {host: '10.0.0.1', port: 5433},
      credentials: {user: 'bench', database: 'bench'},
    },
    binding: {
      campaignId: 'camp-remote-reset', containerId: 'c-lagrange-1',
      imageId: IMAGE, endpoint: '10.0.0.1:5433',
    },
    persistentStorage: true,
  };
  const remoteActionResult = await executeRemoteGateAction(
    {...remoteReqBase, action: 'pg-case', caseId: 'payment'},
    {createPgClient: () => fakeClient},
  );
  const remoteDurabilityBeforeResult = await executeRemoteGateAction(
    {...remoteReqBase, action: 'pg-durability-before'},
    {createPgClient: () => fakeClient},
  );
  assert.equal(typeof remoteDurabilityBeforeResult.resetOutcome, 'object');
  assert.ok(remoteDurabilityBeforeResult.resetOutcome !== null);
  assert.equal(typeof remoteDurabilityBeforeResult.resetOutcome.resetStartedAt, 'string');
  assert.equal(typeof remoteDurabilityBeforeResult.resetOutcome.resetEndedAt, 'string');
  const serializedOverSsh = JSON.parse(JSON.stringify(remoteActionResult));
  assert.equal(typeof serializedOverSsh.resetOutcome, 'object');
  assert.ok(serializedOverSsh.resetOutcome !== null);
  assert.equal(typeof serializedOverSsh.resetOutcome.resetStartedAt, 'string');
  assert.equal(typeof serializedOverSsh.resetOutcome.resetEndedAt, 'string');
  assert.ok(Number.isFinite(serializedOverSsh.resetOutcome.resetDurationMs));
  assert.ok(Number.isFinite(serializedOverSsh.resetOutcome.seedLoadDurationMs));

  const lateControllerNowMs = Date.parse(serializedOverSsh.resetOutcome.resetEndedAt) + 60_000;
  const lateControllerIso = new Date(lateControllerNowMs).toISOString();
  const serializedDurabilityBefore = JSON.parse(JSON.stringify(remoteDurabilityBeforeResult));
  const ledger = createContainerLedger();
  const baseArm = createArm(ledger, 0, {persistent: true});
  const remotePayloadPattern = /--input-type=module -e '[^']+' ([A-Za-z0-9+/=]+)$/u;
  const scriptedSsh = createScriptedSsh([
    [(command, host) => host === '10.0.0.9' && stringIncludes(command, '--input-type=module'),
      (command) => {
        const encoded = remotePayloadPattern.exec(command)[1];
        const req = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        if (req.action === 'pg-durability-before') {
          return `${JSON.stringify(serializedDurabilityBefore)}\n`;
        }
        if (req.action === 'pg-durability-after') {
          return `${JSON.stringify({
            paymentAfterRestart: serializedDurabilityBefore.paymentBeforeRestart,
            stateAfterRestart: serializedDurabilityBefore.stateBeforeRestart,
          })}\n`;
        }
        const proofCase = arrayFind(OLTP_SCENARIO_A_PROOF_CASES, (c) => c.id === req.caseId);
        return `${JSON.stringify({
          ...serializedOverSsh,
          proofRecord: {
            ...serializedOverSsh.proofRecord,
            evidenceId: `lagrange:lagrange-${req.caseId}-v1`,
            proofIds: proofCase?.proofIds || serializedOverSsh.proofRecord.proofIds,
          },
        })}\n`;
      }],
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const stage = createSemanticGateStage({
    journey: async () => {
      throw new Error('local journey must not be used when loadGeneratorHost is set');
    },
    sshRun: scriptedSsh.sshRun, opts: {},
    loadGeneratorHost: {ip: '10.0.0.9', repoPath: '/srv/repo', nodePath: '/usr/bin/node'},
    evidenceDirOf: () => null, now: () => lateControllerNowMs,
  });

  const staged = await stage({
    run: {runId: 'r-remote-timing', system: 'lagrange'},
    manifest: {campaignId: 'camp-remote-reset'},
    deployment: baseArm,
  });

  const resetEvents = arrayFilter(staged.events, (e) => e.kind === 'dataset-reset');
  assert.ok(resetEvents.length >= 2);
  assert.equal(arraySome(resetEvents, (e) => e.caseId === 'durability'), true);
  for (const event of resetEvents) {
    const expectedReset = event.caseId === 'durability' ?
      serializedDurabilityBefore.resetOutcome : serializedOverSsh.resetOutcome;
    assert.equal(event.at, expectedReset.resetEndedAt);
    assert.notEqual(event.at, lateControllerIso);
    assert.equal(event.startedAt, expectedReset.resetStartedAt);
    assert.equal(event.endedAt, expectedReset.resetEndedAt);
    assert.equal(event.durationMs, expectedReset.resetDurationMs);
    assert.equal(event.seedLoadDurationMs, expectedReset.seedLoadDurationMs);
  }
});
