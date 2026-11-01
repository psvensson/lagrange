// Chain acceptance cases J6 (semantic gate), J7 (readiness), J11 (claims that
// need their own action record) and J14 (dispatch of every target x scenario x
// subkind), asserted on the published matrix and the rendered pages.
import assert from 'node:assert/strict';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
} from '../benchmark-claim-admission.js';
import {FAILURE_CLASS} from '../benchmark-operation-outcome.js';
import {BENCHMARK_RUN_STATUS} from '../benchmark-scenario-a-run.js';
import {
  BENCHMARK_DISPATCH_REFUSED_CODE,
  BENCHMARK_DISPATCH_STATUS,
  BENCHMARK_OPERATION_FAMILY,
} from '../benchmark-workload-dispatch.js';
import {
  SMOKE_TARGETS,
  buildCoverageManifest,
  listManifestClaims,
} from '../comparative-coverage-manifest.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
  OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS,
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
  buildScenarioASemanticGateEvidence,
} from '../oltp-scenario-a-semantic-gate.js';
import {
  DEPLOYMENT_EVENT_KIND,
  READINESS_STATE,
  buildClaimKey,
  validateRunRecord,
} from '../raw-observation-record.js';
import {LAGRANGE_OLTP_SQL} from '../../reference-client/lagrange-oltp-adapter.js';
import {executeBenchmarkWorkload} from '../real-product-workload-drivers.js';
import {runScenarioASemanticProofJourney} from
  '../../scenarios/scenario-a-semantic-proof-journey.js';
import {
  CAPACITY_WORKLOAD,
  ENDPOINT,
  SYSTEM_OF_TARGET,
  assertNoNumbersRendered,
  chainHeader,
  driveArm,
  matrixExperimentCell,
  matrixTargetCell,
  publishedTargetCell,
  renderedMarkdownCell,
  reseal,
  withChain,
} from './comparative-benchmark-chain-acceptance-chain.js';
import {LABEL} from './comparative-benchmark-chain-acceptance-cases-outcomes.js';
import {
  FAKE_PRODUCT_FAULT,
  createFakeOltpProduct,
} from './real-product-workload-driver-fake-product.js';
import {tablesOfStatements} from './real-product-workload-driver-test-fixture.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFind = Function.call.bind(Array.prototype.find);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const LAGRANGE = 'lagrange';
const TIDB = 'tidb-tikv';
const REFUSING_ENDPOINT = Object.freeze({host: '127.0.0.1', port: 1});
const CREDENTIALS = Object.freeze({user: 'bench', password: 'bench', database: 'bench'});
const CANONICAL_TABLES = tablesOfStatements(Object.values(LAGRANGE_OLTP_SQL));

async function drivePair(arm) {
  const runs = [];
  for (const repetition of [1, 2]) runs.push((await driveArm({...arm, repetition})).run);
  return runs;
}

async function publishRuns(runs, targetIds, check) {
  return withChain(async (chain) => {
    await chain.append([chainHeader(runs, targetIds), ...runs]).publish();
    return check(chain);
  });
}

function bindingOf(run) {
  const endpoint = run.deployment.endpoint;
  const product = arrayFind(run.identity.products,
    (p) => p.containerId === endpoint.containerId);
  return {campaignId: run.campaignId, containerId: endpoint.containerId,
    imageId: product.imageId, endpoint: `${endpoint.host}:${endpoint.port}`};
}

function gateRecord(gate, binding) {
  return {status: gate.status, passed: [...gate.passed], failed: [...gate.failed],
    missing: [...gate.missing], binding};
}

// Every proof of the profile fails: the gate owner's verdict is `failed`.
function failedGateOf(run) {
  const evidence = buildScenarioASemanticGateEvidence({systems: [run.targetId], proofs: [{
    evidenceId: 'chain-all-failed', system: run.targetId,
    status: OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
    artifactSha256: 'f'.repeat(64), proofIds: [...OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS],
  }]});
  const summary = evidence.systems[run.targetId];
  assert.equal(evidence.status, OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS.FAILED);
  return gateRecord({status: evidence.status, passed: summary.passedProofIds,
    failed: summary.failedProofIds, missing: summary.missingProofIds}, bindingOf(run));
}

// Every proof throws (the endpoint refuses every connection): the real proof
// journey's verdict is `incomplete`, bound to the run's deployment.
async function throwingGateOf(run) {
  const gate = await runScenarioASemanticProofJourney({system: run.targetId,
    connection: {endpoint: REFUSING_ENDPOINT, credentials: CREDENTIALS},
    binding: bindingOf(run)});
  assert.equal(gate.status, OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS.INCOMPLETE);
  return gateRecord(gate, gate.binding);
}

function withGate(runs, gate) {
  for (const run of runs) {
    run.correctness.semanticGate = gate;
    reseal(run);
    validateRunRecord(run);
  }
  return runs;
}

// J6: the proofs fail or throw.
async function caseJ6SemanticGate() {
  const capacity = await drivePair({targetId: LAGRANGE, subkind: 'main'});
  const failed = failedGateOf(capacity[0]);
  await publishRuns(withGate(capacity, failed), [LAGRANGE], (chain) => {
    const {matrix, markdown} = publishedTargetCell(chain,
      {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: false});
    assert.equal(matrix.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, matrix.reasons.join(', '));
    assert.equal(stringIncludes(markdown, ADMISSION_REASON.SEMANTIC_GATE_FAILED), true, markdown);
    assert.equal(matrix.metrics.capacity, null, 'a failed gate publishes no capacity');
    assertNoNumbersRendered(markdown, 'failed gate');
  });
  const throwing = await throwingGateOf(capacity[0]);
  await publishRuns(withGate(await drivePair({targetId: LAGRANGE, subkind: 'main'}), throwing),
    [LAGRANGE], (chain) => {
      const {matrix, markdown} = publishedTargetCell(chain,
        {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: false});
      assert.equal(matrix.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
      assert.equal(stringIncludes(markdown, ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED), true);
      assertNoNumbersRendered(markdown, 'throwing gate');
    });
  await publishRuns(withGate(await drivePair({targetId: LAGRANGE}), throwing), [LAGRANGE],
    (chain) => {
      const {matrix, markdown} = publishedTargetCell(chain,
        {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: true});
      assert.equal(matrix.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
      assert.equal(stringIncludes(markdown, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true,
        markdown);
      assertNoNumbersRendered(markdown, 'smoke with an incomplete gate');
    });
  await publishRuns(withGate(await drivePair({targetId: LAGRANGE}), failed), [LAGRANGE],
    (chain) => {
      const {matrix, markdown} = publishedTargetCell(chain,
        {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: true});
      assert.equal(matrix.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE);
      assert.equal(stringIncludes(markdown, ADMISSION_REASON.SEMANTIC_GATE_FAILED), true,
        markdown);
    });
}

// The deployer's typed record of a cluster that never became ready: the
// measurement never started, every planned request is unissued, and the
// readiness evidence names the last diagnostic. The driver's never-open run
// supplies the unissued plan; the deployer's fields are fixture stand-ins.
async function readinessExhaustedPair() {
  const runs = await drivePair({targetId: LAGRANGE, mode: FAKE_PRODUCT_FAULT.NEVER_OPEN});
  for (const run of runs) {
    run.deployment.readiness = {state: READINESS_STATE.EXHAUSTED,
      observedAt: run.deployment.readiness.observedAt,
      evidence: {polls: 60, lastDiagnostic: 'nodes: 1 of 3 active; priority spread unsatisfied'}};
    run.observations.setup = {failureClass: FAILURE_CLASS.PRODUCT_ERROR, sqlState: null,
      code: 'readiness_exhausted', message: 'cluster not ready after 60 polls'};
    reseal(run);
    validateRunRecord(run);
  }
  return runs;
}

// J7: readiness is never reached.
async function caseJ7ReadinessExhausted() {
  const runs = await readinessExhaustedPair();
  await publishRuns(runs, [LAGRANGE], (chain) => {
    const {matrix, markdown} = publishedTargetCell(chain,
      {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: true});
    assert.equal(matrix.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, matrix.reasons.join(', '));
    assert.equal(arrayIncludes(matrix.reasons, ADMISSION_REASON.READINESS_EXHAUSTED), true);
    assert.equal(matrix.metrics.accounting.issued, 0, 'no observation exists');
    assert.equal(matrix.metrics.accounting.unissued, matrix.metrics.accounting.offered);
    assert.equal(stringIncludes(markdown, 'readiness_exhausted'), true, markdown);
    assertNoNumbersRendered(markdown, 'readiness exhausted');
  });
  // A record that says readiness was exhausted yet measured anyway is refused.
  const measured = await drivePair({targetId: LAGRANGE});
  for (const run of measured) {
    run.deployment.readiness = {state: READINESS_STATE.EXHAUSTED,
      observedAt: run.deployment.readiness.observedAt, evidence: {polls: 60}};
    reseal(run);
  }
  await publishRuns(measured, [LAGRANGE], (chain) => {
    const {matrix} = publishedTargetCell(chain,
      {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: true});
    assert.equal(matrix.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
    assert.equal(arrayIncludes(matrix.reasons, ADMISSION_REASON.READINESS_UNVERIFIED), true);
  });
}

// A measured Scenario A run relabelled as the claim of an experiment whose own
// action (network impairment, movement, partition change, restart) has no
// observed record kind.
function relabel(run, subkind, events = []) {
  run.subkind = subkind;
  run.claimKey = buildClaimKey({targetId: run.targetId, scenario: run.scenario, subkind,
    offeredRatePerSec: run.plan.offeredRatePerSec, repetition: run.plan.repetition});
  run.deployment.events = events;
  return reseal(run);
}

// J11: partition, movement, RTT and recovery claims need their own observed action.
async function caseJ11ActionClaimsNotMeasured() {
  const at = new Date().toISOString();
  const rtt = arrayMap(await drivePair({targetId: TIDB}), (run) => relabel(run, 'rtt-2ms',
    [{kind: DEPLOYMENT_EVENT_KIND.NETWORK_IMPAIRMENT_APPLIED, at}]));
  const move = arrayMap(await drivePair({targetId: TIDB}), (run) => relabel(run, 'move-during'));
  const partition = arrayMap(await drivePair({targetId: TIDB}), (run) => relabel(run, 'p6'));
  const recovery = arrayMap(await drivePair({targetId: LAGRANGE}),
    (run) => relabel(run, 'cache-restart-recovery'));
  await publishRuns([...rtt, ...move, ...partition, ...recovery], [TIDB, LAGRANGE],
    (chain) => {
      const expectations = [
        [matrixExperimentCell(chain.matrix, 'scenario-b-rtt-sweep', TIDB, 'rtt-2ms'),
          'scenario-b-rtt-working-set-crossover.md', 'Scenario B under controlled network delay',
          TIDB, 'rtt-2ms'],
        [matrixExperimentCell(chain.matrix, 'live-movement-under-load', TIDB, 'during-move'),
          'movement-and-scenario-c-scaling-progress.md', 'Partition movement under load', TIDB,
          'during-move'],
        [matrixExperimentCell(chain.matrix, 'partition-granularity-sweep', TIDB, 'p6'),
          'partition-granularity-sweep-progress.md', 'Partition granularity sweep (5 nodes)',
          TIDB, 'p6'],
        [matrixTargetCell(chain.matrix, LAGRANGE, 'scenarioC/cache-restart-recovery'),
          'scenario-c-feature-store-progress.md', 'Scenario C', LABEL[LAGRANGE],
          'Restart recovery'],
      ];
      for (const [cell, page, heading, row, column] of expectations) {
        assert.equal(cell.status, CLAIM_CELL_STATUS.NOT_MEASURED, cell.claimKey);
        assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.CLAIM_KIND_NOT_OBSERVED),
          true, cell.claimKey);
        const text = renderedMarkdownCell(chain.pages[page], heading, row, column);
        assert.equal(text, `${CLAIM_CELL_STATUS.NOT_MEASURED} ` +
          `(${ADMISSION_REASON.CLAIM_KIND_NOT_OBSERVED})`, `${page}: ${text}`);
      }
    });
}

// J14: every target x scenario x subkind of the coverage manifest dispatches to
// its intended business-operation family or to a typed non-execution.
async function dispatchClaim(claim) {
  const product = createFakeOltpProduct(FAKE_PRODUCT_FAULT.NONE);
  const system = SYSTEM_OF_TARGET[claim.targetId];
  const request = {targetId: claim.targetId, system, scenario: claim.scenario,
    subkind: claim.subkind,
    connection: system === TIDB ? {endpoint: ENDPOINT, databaseName: 'bench_chain'} :
      {endpoint: ENDPOINT, credentials: CREDENTIALS},
    plan: {offeredRatePerSec: 2000, repetition: 1, orderIndex: 0,
      ...(claim.subkind === 'main' ? {workload: CAPACITY_WORKLOAD} : {})},
    drivers: {createPgClient: product.createPgClient,
      createMysqlConnection: product.createMysqlConnection}};
  try {
    return {output: await executeBenchmarkWorkload(request), product, refusal: null};
  } catch (error) {
    return {output: null, product, refusal: error};
  }
}

const EXECUTED_FAMILY = Object.freeze({
  main: BENCHMARK_OPERATION_FAMILY.SCENARIO_A_OLTP,
  smoke: BENCHMARK_OPERATION_FAMILY.SCENARIO_A_SMOKE,
});

function assertDispatch(claim, {output, product, refusal}) {
  const label = claim.claimKey;
  if (claim.scenario === 'scenarioA' && EXECUTED_FAMILY[claim.subkind]) {
    assert.equal(refusal, null, `${label}: ${refusal?.message}`);
    assert.equal(output.dispatch.status, BENCHMARK_DISPATCH_STATUS.EXECUTED, label);
    assert.equal(output.dispatch.family, EXECUTED_FAMILY[claim.subkind], label);
    const touched = tablesOfStatements(product.state.statements);
    assert.ok(touched.length > 0, `${label}: the business operations ran`);
    for (const table of touched) {
      assert.equal(arrayIncludes(CANONICAL_TABLES, table), true, `${label}: ${table}`);
    }
    assert.equal(output.observations.executedOperationsDigest,
      output.plan.operationSliceDigest, `${label}: the planned slice was executed`);
    return;
  }
  assert.deepEqual(product.state.statements, [], `${label}: no substitute statement`);
  if (claim.scenario === 'scenarioB') {
    assert.equal(output.dispatch.status, claim.targetId === LAGRANGE ?
      BENCHMARK_DISPATCH_STATUS.BLOCKED : BENCHMARK_DISPATCH_STATUS.UNSUPPORTED, label);
    assert.equal(output.dispatch.family, BENCHMARK_OPERATION_FAMILY.SCENARIO_B_RISK_DECISION);
    assert.equal(output.observations, null, label);
  } else if (claim.scenario === 'scenarioC') {
    assert.equal(output.dispatch.status, BENCHMARK_DISPATCH_STATUS.UNSUPPORTED, label);
    assert.equal(output.dispatch.family,
      BENCHMARK_OPERATION_FAMILY.SCENARIO_C_STREAMING_FEATURE);
    assert.equal(output.observations, null, label);
  } else {
    assert.equal(output, null, `${label}: an unknown family is not executed`);
    assert.equal(refusal?.code, BENCHMARK_DISPATCH_REFUSED_CODE, `${label}: typed refusal`);
  }
}

async function caseJ14DispatchFamilies() {
  const claims = arrayFilter(listManifestClaims(buildCoverageManifest()),
    (claim) => arrayIncludes(SMOKE_TARGETS, claim.targetId));
  const scenarios = new Set(arrayMap(claims, (c) => c.scenario));
  for (const scenario of ['scenarioA', 'scenarioB', 'scenarioC', 'scaleout', 'placement',
    'partition-sweep']) {
    assert.equal(scenarios.has(scenario), true, `the manifest enumerates ${scenario}`);
  }
  for (const claim of claims) assertDispatch(claim, await dispatchClaim(claim));
  const unknown = await dispatchClaim({claimKey: 'lagrange/scenarioZ/x', targetId: LAGRANGE,
    scenario: 'scenarioZ', subkind: 'x'});
  assertDispatch({claimKey: 'lagrange/scenarioZ/x', targetId: LAGRANGE, scenario: 'scenarioZ',
    subkind: 'x'}, unknown);
  // At the publication layer the non-executed families are declared or
  // not-measured cells, never numbers.
  await publishRuns(await drivePair({targetId: LAGRANGE}), [LAGRANGE], (chain) => {
    for (const shape of ['local-only', 'one-remote-stage', 'sequential', 'fan-out']) {
      const cell = matrixTargetCell(chain.matrix, LAGRANGE, `scenarioB/${shape}`);
      assert.equal(cell.status, CLAIM_CELL_STATUS.BLOCKED, cell.claimKey);
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.COMPILED_RISK_SERVICE_MISSING),
        true, cell.claimKey);
    }
    for (const targetId of [TIDB, 'pg-single-primary']) {
      const cell = matrixTargetCell(chain.matrix, targetId, 'scenarioC/fresh-0ms');
      assert.equal(cell.status, CLAIM_CELL_STATUS.NOT_MEASURED, cell.claimKey);
    }
    const scenarioB = renderedMarkdownCell(chain.pages['README.md'],
      'Advertised configurations', LABEL[LAGRANGE], 'Scenario B');
    assert.equal(stringStartsWith(scenarioB, CLAIM_CELL_STATUS.BLOCKED), true, scenarioB);
    assertNoNumbersRendered(scenarioB, 'Scenario B');
  });
}

// The deployer's readiness-exhausted record is the only record kind built here
// without the driver: it is exported for the campaign-outcome case.
const GATE_CASES = Object.freeze([
  ['J6 every semantic probe fails or throws: gate failed/incomplete, never valid capacity',
    caseJ6SemanticGate],
  ['J7 readiness never reached: readiness_exhausted record, product-failure, no observation',
    caseJ7ReadinessExhausted],
  ['J11 partition/movement/RTT/recovery claims without their action record: not-measured',
    caseJ11ActionClaimsNotMeasured],
  ['J14 every target x scenario x subkind dispatches its family or a typed refusal',
    caseJ14DispatchFamilies],
]);

export {BENCHMARK_RUN_STATUS, GATE_CASES, readinessExhaustedPair};
