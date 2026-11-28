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
  stringSplit,
  stringStartsWith,
  stringTrim,
} from '../real-product-captured-intrinsics.js';
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
import {
  IMAGE,
  createArm,
  restartRuleForLedger,
  runCohortResetTestQuery,
} from './benchmark-cohort-reset-test-fixture.js';

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
  assert.deepEqual(arrayMap(arrayFilter(repairSql, (sql) => /^CREATE TABLE /u.test(sql)),
    (sql) => stringSplit(sql, ' ')[2]), ['new_order', 'history']);
  assert.equal(arrayFilter(repairSql, (sql) => /^TRUNCATE TABLE /u.test(sql)).length, 9);
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
