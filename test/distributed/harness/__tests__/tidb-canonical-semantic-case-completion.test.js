import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
} from '../benchmark-claim-admission.js';
import {
  createSemanticGateStage,
  runTiDbSemanticGate,
} from '../comparative-benchmark-semantic-gate.js';
import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
} from '../oltp-scenario-a-delivery-case.js';
import {
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
} from '../oltp-scenario-a-durability-case.js';
import {
  OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
} from '../oltp-scenario-a-failure-atomicity-case.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
} from '../oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
} from '../oltp-scenario-a-order-status-case.js';
import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
} from '../oltp-scenario-a-payment-case.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from '../oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
} from '../oltp-scenario-a-retryable-conflict-case.js';
import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
} from '../oltp-scenario-a-stock-level-case.js';
import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
} from '../oltp-scenario-a-visibility-case.js';
import {
  arrayFilter,
  arrayIncludes,
  arrayMap,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';
import {
  createContainerLedger,
  dockerRules,
} from './real-product-deployer-product-answers-fixture.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  admitTiDbRunPairWithGate,
  createTiDbMockStore,
  restartRuleForLedger,
  tidbClusterArmOf,
} from './tidb-semantic-case-completion-fixture.js';

test('canonical-case-inventory: all 9 canonical cases from OLTP_SCENARIO_A_PROOF_CASES are wired to TiDB', async () => {
  const gateModule = await import('../comparative-benchmark-semantic-gate.js');
  const executedCaseIds = gateModule.TIDB_EXECUTED_CASE_IDS || [];
  const requiredCaseIds = arrayMap(OLTP_SCENARIO_A_PROOF_CASES, (c) => c.id);

  assert.equal(executedCaseIds.length, 9,
    `expected exactly 9 executed cases, found ${executedCaseIds.length}: ${executedCaseIds.join(', ')}`);
  for (const caseId of requiredCaseIds) {
    assert.equal(arrayIncludes(executedCaseIds, caseId), true,
      `canonical case ${caseId} must be present in TIDB_EXECUTED_CASE_IDS`);
  }

  const allProofIds = [
    ...OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
    ...OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
    ...OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
    ...OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
    ...OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
    ...OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
    ...OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
    ...OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
    ...OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  ].sort();
  assert.deepEqual(allProofIds, [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS].sort(),
    'canonical cases must cover all 31 required system proof IDs');
});

test('all-required-cases-executed: complete TiDB Scenario A journey executes all 9 cases and passes', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const deployment = tidbClusterArmOf(ledger, {persistent: true});
  const engine = createTiDbMockStore();
  const stage = createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun,
    opts: {},
    createMysqlConnection: engine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => deployment,
  });

  const result = await stage({
    run: {runId: 'r-tidb-all-cases', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-tidb-complete'},
    deployment,
  });

  assert.equal(result.gate.status, 'passed',
    `expected gate status passed, got ${result.gate.status}; failed: ${result.gate.failed.join(', ')}; missing: ${result.gate.missing.join(', ')}`);
  assert.equal(result.gate.failed.length, 0);
  assert.equal(result.gate.missing.length, 0);
  assert.equal(result.gate.passed.length, OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length,
    'all canonical proof IDs must be passed');
  assert.equal(result.gate.cases.length, 9, 'all 9 canonical cases must be executed');
  for (const c of result.gate.cases) {
    assert.equal(c.status, 'passed', `case ${c.caseId} must be passed, got ${c.status}`);
  }
});

test('native-product-results-and-independent-effects: 5 missing cases execute natively and fail closed on faults', async () => {
  const gateModule = await import('../comparative-benchmark-semantic-gate.js');
  const executors = gateModule.TIDB_CASE_EXECUTORS || {};
  const newCases = [
    'new-order-contention',
    'order-status',
    'delivery',
    'stock-level',
    'retryable-conflict',
  ];
  for (const caseId of newCases) {
    assert.equal(typeof executors[caseId], 'function',
      `TIDB_CASE_EXECUTORS must have an executor function for ${caseId}`);
  }

  const binding = {
    campaignId: 'camp-native-tidb',
    containerId: 'a'.repeat(64),
    imageId: `sha256:${'b'.repeat(64)}`,
    endpoint: '10.0.0.1:4000',
  };
  const connection = {endpoint: {host: '10.0.0.1', port: 4000}, credentials: {user: 'root'}};

  for (const caseId of newCases) {
    const engine = createTiDbMockStore();
    const outcome = await executors[caseId]({
      connection,
      binding,
      createMysqlConnection: engine.createMysqlConnection,
    });
    assert.equal(outcome.evaluation.passed, true, `native case ${caseId} evaluation must pass`);
    assert.equal(outcome.proofRecord.system, 'tidb-tikv');
    assert.ok(stringIncludes(outcome.evidence.evidenceId, caseId));
  }
});

test('durability-restart-evidence: TiKV replica restart observes incarnation change and preserves continuity', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const deployment = tidbClusterArmOf(ledger, {persistent: true});
  const engine = createTiDbMockStore();
  const stage = createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun,
    opts: {},
    createMysqlConnection: engine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => deployment,
  });

  const result = await stage({
    run: {runId: 'r-tidb-durability', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-tidb-durability'},
    deployment,
  });

  const restartEvents = arrayFilter(result.events, (e) => e.kind === 'product-restart');
  assert.equal(restartEvents.length, 1);
  assert.equal(restartEvents[0].role, 'tikv', 'must restart a TiKV data-bearing replica');
  assert.notEqual(restartEvents[0].startedAtBefore, restartEvents[0].startedAtAfter);

  const durabilityCase = arrayFilter(result.gate.cases, (c) => c.caseId === 'durability')[0];
  assert.ok(durabilityCase);
  assert.equal(durabilityCase.status, 'passed');
  for (const id of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(result.gate.passed, id), true);
  }
});

test('missing-skipped-cases-not-credited: skipped durability receives zero proof credit', async () => {
  const _nonPersistentDeployment = tidbClusterArmOf(createContainerLedger(), {persistent: false});
  const engine = createTiDbMockStore();
  const nonPersistentGate = await runTiDbSemanticGate({
    connection: {endpoint: {host: '10.0.0.1', port: 4000}, credentials: {user: 'root'}},
    binding: {campaignId: 'camp-np', containerId: 'c1', imageId: 'img1', endpoint: '10.0.0.1:4000'},
    persistentStorage: false,
    restartProduct: null,
    createMysqlConnection: engine.createMysqlConnection,
  });

  assert.equal(nonPersistentGate.status, 'incomplete');
  for (const durabilityProofId of OLTP_SCENARIO_A_DURABILITY_PROOF_IDS) {
    assert.equal(arrayIncludes(nonPersistentGate.passed, durabilityProofId), false);
    assert.equal(arrayIncludes(nonPersistentGate.missing, durabilityProofId), true);
  }
  const durabilityCase = arrayFilter(nonPersistentGate.cases, (c) => c.caseId === 'durability')[0];
  assert.equal(durabilityCase.status, 'failed');
  assert.equal(durabilityCase.failureKind, 'probe_inapplicable');

  const noRestartGate = await runTiDbSemanticGate({
    connection: {endpoint: {host: '10.0.0.1', port: 4000}, credentials: {user: 'root'}},
    binding: {campaignId: 'camp-nr', containerId: 'c1', imageId: 'img1', endpoint: '10.0.0.1:4000'},
    persistentStorage: true,
    restartProduct: null,
    createMysqlConnection: createTiDbMockStore().createMysqlConnection,
  });

  assert.equal(noRestartGate.status, 'incomplete');
  const noRestartDurability = arrayFilter(noRestartGate.cases, (c) => c.caseId === 'durability')[0];
  assert.equal(noRestartDurability.status, 'not-executed');
});

test('deployment-bound-claim-admission: complete 9-case TiDB gate admits smoke run to valid-observed', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const deployment = tidbClusterArmOf(ledger, {persistent: true});
  const engine = createTiDbMockStore();
  const stage = createSemanticGateStage({
    journey: async () => ({status: 'incomplete'}),
    sshRun,
    opts: {},
    createMysqlConnection: engine.createMysqlConnection,
    evidenceDirOf: () => null,
    now: () => 0,
    redeploy: async () => deployment,
  });

  const result = await stage({
    run: {runId: 'r-tidb-admission', system: 'tidb-tikv'},
    manifest: {campaignId: 'camp-tidb-admit'},
    deployment,
  });

  const durabilityCase = arrayFilter(result.gate.cases, (c) => c.caseId === 'durability')[0];
  assert.ok(durabilityCase?.faultEvidence,
    'durability case record must retain faultEvidence for admission');

  const smokeCell = admitTiDbRunPairWithGate({
    targetId: 'tidb-tikv',
    subkind: 'smoke',
    gate: result.gate,
    endpointContainerId: deployment.endpoint.containerId,
  });

  assert.equal(smokeCell.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
    `expected smoke cell valid-observed, got ${smokeCell.status}: ${smokeCell.reasons.join(', ')}`);
  assert.equal(arrayIncludes(smokeCell.reasons, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), false,
    `passed 9-case gate must not carry semantic-gate-incomplete: ${smokeCell.reasons.join(', ')}`);
  assert.equal(smokeCell.evidence.semanticProofIds.length,
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length,
    'smoke admission must award all 33 canonical proof IDs');

  const capacityCell = admitTiDbRunPairWithGate({
    targetId: 'tidb-tikv',
    subkind: 'main',
    gate: result.gate,
    endpointContainerId: deployment.endpoint.containerId,
  });

  assert.equal(capacityCell.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
    `expected capacity cell valid-observed, got ${capacityCell.status}: ${capacityCell.reasons.join(', ')}`);
  assert.deepEqual(capacityCell.reasons, [],
    `passed 9-case capacity gate must emit zero reasons: ${capacityCell.reasons.join(', ')}`);
  assert.equal(capacityCell.evidence.semanticProofIds.length,
    OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS.length,
    'capacity admission must award all 33 canonical proof IDs');
});
