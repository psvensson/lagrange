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
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from '../oltp-scenario-a-semantic-gate.js';
import {validateRunRecord} from '../raw-observation-record.js';
import {
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringReplace,
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
      return {
        status: 'passed',
        passed: [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS],
        failed: [],
        missing: [],
        binding: distinctBindings.length === 1 ? distinctBindings[0] : null,
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
      return {
        status: 'passed',
        passed: [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS],
        failed: [],
        missing: [],
        binding: distinctBindings.length === 1 ? distinctBindings[0] : null,
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
  const executedSqls = [];

  const fakeClient = {
    connect: async () => {},
    query: async (sql, params = []) => {
      executedSqls.push(sql);
      const normalized = stringTrim(sql);
      if (stringStartsWith(normalized, 'SELECT COUNT(*) AS row_count FROM')) {
        const table = stringReplace(normalized, /^SELECT COUNT\(\*\) AS row_count FROM\s+/u, '');
        const rows = store.get(table) || [];
        return {rows: [{row_count: rows.length}]};
      }
      if (stringStartsWith(normalized, 'TRUNCATE TABLE')) {
        const table = stringReplace(normalized, /^TRUNCATE TABLE\s+/u, '');
        store.set(table, []);
        return {rows: [], rowCount: 0};
      }
      if (stringStartsWith(normalized, 'INSERT INTO')) {
        const table = (/^INSERT INTO\s+([a-z_]+)/u.exec(normalized) || [])[1];
        if (!store.has(table)) store.set(table, []);
        store.get(table).push(params);
        return {rows: [], rowCount: 1};
      }
      return {rows: [], rowCount: 0};
    },
    end: async () => {},
  };

  const adapter = await createLagrangeOltpAdapter({
    endpoint: {host: '127.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => fakeClient,
    workload: {scale: 1, workers: 1},
  });

  assert.equal(typeof adapter.resetDataset, 'function', 'adapter must provide resetDataset capability');

  const beforeEvidence = await adapter.getEvidence();
  assert.equal(beforeEvidence.stateCounts.orders, 0);

  // Simulate mutations
  store.set('orders', [{order_id: 101}]);
  store.set('new_order', [{order_id: 101}]);
  store.set('history', [{history_id: 1}]);

  assert.equal((await adapter.getEvidence()).stateCounts.orders, 1);

  await adapter.resetDataset();

  const truncateCalls = arrayFilter(executedSqls, (s) => stringStartsWith(s, 'TRUNCATE TABLE'));
  assert.ok(truncateCalls.length >= 5, 'resetDataset must execute TRUNCATE TABLE across tables');

  const afterEvidence = await adapter.getEvidence();
  assert.equal(afterEvidence.stateCounts.orders, 0);
  assert.equal(afterEvidence.stateCounts.newOrders, 0);
  assert.equal(afterEvidence.stateCounts.history, 0);

  await adapter.close();
});
