import assert from 'node:assert/strict';

import {
  SCENARIO_B_ID,
  SCENARIO_B_DATA_PROFILE,
  SCENARIO_B_GRAPH_SHAPE,
  SCENARIO_B_GRAPH_SHAPE_LADDER,
  getScenarioBProfileConfig,
  generateScenarioBRiskDataset,
  buildScenarioBWorkloadPlan,
} from '../../test/distributed/harness/scenario-b-risk-dataset.js';
import {
  SCENARIO_B_DECISION_OUTCOME,
  SCENARIO_B_MAX_DECISION_BYTES,
  reduceScenarioBEntityStage,
  evaluateScenarioBRequestOracle,
  verifyScenarioBDecisionResult,
  summarizeScenarioBSystemRun,
} from '../../test/distributed/harness/scenario-b-risk-oracle.js';
import {
  SCENARIO_B_TIDB_MODE,
  SCENARIO_B_LAGRANGE_SERVICES,
  executeLagrangeScenarioBDecision,
  executeTiDbScenarioBDecision,
  runScenarioBPairedComparison,
  buildScenarioBComparisonHistoryRecord,
} from '../../test/distributed/harness/scenario-b-comparators.js';
import {
  validateComparisonHistoryRecord,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';

const arrayMap = Function.call.bind(Array.prototype.map);

const PASS_MESSAGE = 'scenario-b-risk-benchmark-guard: PASS';
const STR_SCENARIO_B_ID = 'tidb-distributed-risk-decision';
const STR_SMOKE = 'smoke';
const STR_RISK = 'risk';
const STR_HEAVY_CORRELATION = 'heavy-correlation';
const STR_UNKNOWN = 'unknown-profile';
const STR_LOCAL_ONLY = 'local-only';
const STR_ONE_REMOTE = 'one-remote-stage';
const STR_SEQUENTIAL = 'sequential';
const STR_FAN_OUT = 'fan-out';
const STR_APPROVE = 'APPROVE';
const STR_REVIEW = 'REVIEW';
const STR_BLOCK = 'BLOCK';
const STR_STAGE_ACCOUNT = 'account';
const STR_ENTITY_ACC_1 = 'acc-1';
const STR_SYSTEM_LAGRANGE = 'lagrange';
const STR_SYSTEM_TIDB = 'tidb-tikv';
const STR_INVALID_MODE = 'invalid-mode';
const STR_TIKV_COPROCESSOR = 'tikv-coprocessor-reducer';
const STR_SQL_PUSHDOWN = 'tidb-sql-pushdown';
const STR_TIFLASH_MPP = 'tiflash-mpp-reducer';
const STR_TAMPERED = 'tampered-digest';
const STR_TAMPERED_DECISION = 'TAMPERED_DECISION';
const STR_TIMING_MODEL = 'deterministic-contract-model';
const STR_TIMING_OBSERVED = 'observed';
const STR_VIEW_CONTRACT = 'contract-model-non-comparable';
const STR_VIEW_NATIVE = 'architecture-native';
const STR_EVIDENCE_CONTRACT = 'contract-model-verification';
const STR_EVIDENCE_OBSERVED = 'observed-paired-run';
const NUM_FOUR = 4;
const NUM_1024 = 1024;
const NUM_SEED_1 = 20261030;
const NUM_SEED_2 = 20261031;
const NUM_REQUEST_COUNT = 16;
const NUM_ZERO_CPU = 0;
const NUM_TIMING_LAGRANGE = 12.5;
const NUM_TIMING_TIDB = 35.2;

function verifyProfileAndDatasetDeterminism() {
  assert.equal(SCENARIO_B_ID, STR_SCENARIO_B_ID);
  assert.equal(SCENARIO_B_DATA_PROFILE.SMOKE, STR_SMOKE);
  assert.equal(SCENARIO_B_DATA_PROFILE.RISK, STR_RISK);
  assert.equal(SCENARIO_B_DATA_PROFILE.HEAVY_CORRELATION, STR_HEAVY_CORRELATION);
  assert.equal(SCENARIO_B_GRAPH_SHAPE_LADDER.length, NUM_FOUR);

  assert.equal(getScenarioBProfileConfig(STR_SMOKE).profileId, STR_SMOKE);
  assert.equal(getScenarioBProfileConfig(STR_RISK).profileId, STR_RISK);
  assert.equal(getScenarioBProfileConfig(STR_HEAVY_CORRELATION).profileId, STR_HEAVY_CORRELATION);
  assert.throws(() => getScenarioBProfileConfig(STR_UNKNOWN));

  const ds1 = generateScenarioBRiskDataset({profileId: STR_SMOKE, seed: NUM_SEED_1});
  const ds1Repeat = generateScenarioBRiskDataset({profileId: STR_SMOKE, seed: NUM_SEED_1});
  const ds2 = generateScenarioBRiskDataset({profileId: STR_SMOKE, seed: NUM_SEED_2});
  assert.equal(ds1.datasetSha256, ds1Repeat.datasetSha256);
  assert.notEqual(ds1.datasetSha256, ds2.datasetSha256);

  const stageResult = reduceScenarioBEntityStage(ds1, STR_STAGE_ACCOUNT, STR_ENTITY_ACC_1);
  assert.equal(typeof stageResult.stageDigest === 'string', true);
  assert.equal(stageResult.stageName, STR_STAGE_ACCOUNT);
}

function verifyWorkloadPlanAndGraphShapes() {
  const ds = generateScenarioBRiskDataset({profileId: STR_SMOKE, seed: NUM_SEED_1});
  const mixPlan = buildScenarioBWorkloadPlan({dataset: ds, requestCount: NUM_REQUEST_COUNT});
  assert.equal(mixPlan.requests.length, NUM_REQUEST_COUNT);

  const foundShapes = new Set(arrayMap(mixPlan.requests, (r) => r.expectedGraphShape));
  assert.equal(foundShapes.has(STR_LOCAL_ONLY), true);
  assert.equal(foundShapes.has(STR_ONE_REMOTE), true);
  assert.equal(foundShapes.has(STR_SEQUENTIAL), true);
  assert.equal(foundShapes.has(STR_FAN_OUT), true);

  for (let i = 0; i < SCENARIO_B_GRAPH_SHAPE_LADDER.length; i += 1) {
    const shape = SCENARIO_B_GRAPH_SHAPE_LADDER[i];
    const fp = buildScenarioBWorkloadPlan({
      dataset: ds, targetGraphShape: shape, requestCount: NUM_FOUR,
    });
    assert.equal(fp.requests.length, NUM_FOUR);
    for (let j = 0; j < fp.requests.length; j += 1) {
      assert.equal(fp.requests[j].expectedGraphShape, shape);
    }
  }
}

function verifyOracleEvaluationAndTamperResistance() {
  assert.equal(SCENARIO_B_DECISION_OUTCOME.APPROVE, STR_APPROVE);
  assert.equal(SCENARIO_B_DECISION_OUTCOME.REVIEW, STR_REVIEW);
  assert.equal(SCENARIO_B_DECISION_OUTCOME.BLOCK, STR_BLOCK);
  assert.equal(SCENARIO_B_GRAPH_SHAPE.LOCAL_ONLY, STR_LOCAL_ONLY);
  assert.equal(SCENARIO_B_MAX_DECISION_BYTES, NUM_1024);

  const ds = generateScenarioBRiskDataset({profileId: STR_SMOKE, seed: NUM_SEED_1});
  const plan = buildScenarioBWorkloadPlan({dataset: ds, requestCount: NUM_REQUEST_COUNT});
  const observedShapes = new Set();
  const observedOutcomes = new Set();

  for (let i = 0; i < plan.requests.length; i += 1) {
    const req = plan.requests[i];
    const oracle = evaluateScenarioBRequestOracle(ds, req);
    assert.equal(oracle.decisionBytes <= NUM_1024, true);
    observedShapes.add(oracle.actualGraphShape);
    observedOutcomes.add(oracle.decision);
    assert.equal(verifyScenarioBDecisionResult(oracle, oracle), true);
  }

  assert.equal(observedShapes.has(STR_LOCAL_ONLY), true);
  assert.equal(observedShapes.has(STR_ONE_REMOTE), true);
  assert.equal(observedShapes.has(STR_SEQUENTIAL), true);
  assert.equal(observedShapes.has(STR_FAN_OUT), true);
  assert.equal(observedOutcomes.size >= 2, true);

  const sampleReq = plan.requests[0];
  const sampleOracle = evaluateScenarioBRequestOracle(ds, sampleReq);
  const tamperedDigests = {
    ...sampleOracle,
    stageDigests: {...sampleOracle.stageDigests, [STR_STAGE_ACCOUNT]: STR_TAMPERED},
  };
  assert.throws(() => verifyScenarioBDecisionResult(sampleOracle, tamperedDigests));
  const tamperedDecision = {...sampleOracle, decision: STR_TAMPERED_DECISION};
  assert.throws(() => verifyScenarioBDecisionResult(sampleOracle, tamperedDecision));
}

function verifyComparatorsAndHistoryLedger() {
  assert.equal(SCENARIO_B_LAGRANGE_SERVICES.length, NUM_FOUR);
  assert.equal(SCENARIO_B_TIDB_MODE.TIKV_COPROCESSOR, STR_TIKV_COPROCESSOR);
  assert.equal(SCENARIO_B_TIDB_MODE.SQL_PUSHDOWN, STR_SQL_PUSHDOWN);
  assert.equal(SCENARIO_B_TIDB_MODE.TIFLASH_MPP, STR_TIFLASH_MPP);

  const ds = generateScenarioBRiskDataset({profileId: STR_SMOKE, seed: NUM_SEED_1});
  const plan = buildScenarioBWorkloadPlan({dataset: ds, requestCount: NUM_REQUEST_COUNT});

  const lagDec = executeLagrangeScenarioBDecision(ds, plan.requests[0]);
  assert.equal(lagDec.systemId, STR_SYSTEM_LAGRANGE);
  assert.equal(lagDec.timingSource, STR_TIMING_MODEL);

  const lagObs = executeLagrangeScenarioBDecision(ds, plan.requests[0], {
    observedLatencyMs: NUM_TIMING_LAGRANGE,
  });
  assert.equal(lagObs.timingSource, STR_TIMING_OBSERVED);
  assert.equal(lagObs.latencyMs, NUM_TIMING_LAGRANGE);

  const tidbDec1 = executeTiDbScenarioBDecision(
    ds, plan.requests[0], SCENARIO_B_TIDB_MODE.TIKV_COPROCESSOR,
  );
  assert.equal(tidbDec1.systemId, STR_SYSTEM_TIDB);
  assert.equal(tidbDec1.timingSource, STR_TIMING_MODEL);

  const tidbObs = executeTiDbScenarioBDecision(
    ds, plan.requests[0], SCENARIO_B_TIDB_MODE.TIKV_COPROCESSOR,
    {observedLatencyMs: NUM_TIMING_TIDB},
  );
  assert.equal(tidbObs.timingSource, STR_TIMING_OBSERVED);
  assert.equal(tidbObs.latencyMs, NUM_TIMING_TIDB);

  assert.equal(
    executeTiDbScenarioBDecision(ds, plan.requests[0], SCENARIO_B_TIDB_MODE.SQL_PUSHDOWN).systemId,
    STR_SYSTEM_TIDB,
  );
  assert.equal(
    executeTiDbScenarioBDecision(ds, plan.requests[0], SCENARIO_B_TIDB_MODE.TIFLASH_MPP).systemId,
    STR_SYSTEM_TIDB,
  );
  assert.throws(() => executeTiDbScenarioBDecision(ds, plan.requests[0], STR_INVALID_MODE));

  const paired = runScenarioBPairedComparison({dataset: ds, workloadPlan: plan});
  assert.equal(paired.lagrange.avgRemoteEdgeBytes < paired.tidbTikv.avgRemoteEdgeBytes, true);
  assert.equal(paired.lagrange.totalCoordinatorCpuMs, NUM_ZERO_CPU);
  assert.equal(paired.tidbTikv.totalCoordinatorCpuMs > NUM_ZERO_CPU, true);
  assert.equal(paired.timingSource, STR_TIMING_MODEL);
  assert.equal(paired.comparable, false);
  assert.equal(typeof paired.nonComparableReason === 'string', true);
  assert.equal(paired.nonComparableReason.length > 0, true);

  const mockLag = arrayMap(plan.requests, () => NUM_TIMING_LAGRANGE);
  const mockTidb = arrayMap(plan.requests, () => NUM_TIMING_TIDB);
  const pairedObs = runScenarioBPairedComparison({
    dataset: ds, workloadPlan: plan, lagrangeTimingsMs: mockLag,
    tidbTimingsMs: mockTidb, comparable: true,
  });
  assert.equal(pairedObs.timingSource, STR_TIMING_OBSERVED);
  assert.equal(pairedObs.comparable, true);
  assert.equal(pairedObs.nonComparableReason, undefined);

  assert.equal(typeof summarizeScenarioBSystemRun === 'function', true);

  const contractRecord = buildScenarioBComparisonHistoryRecord({pairedRun: paired});
  assert.equal(contractRecord.framework.comparisonView, STR_VIEW_CONTRACT);
  assert.equal(contractRecord.evidenceSource.kind, STR_EVIDENCE_CONTRACT);
  const validContract = validateComparisonHistoryRecord(contractRecord);
  assert.equal(typeof validContract.recordSha256 === 'string', true);

  const observedRecord = buildScenarioBComparisonHistoryRecord({pairedRun: pairedObs});
  assert.equal(observedRecord.framework.comparisonView, STR_VIEW_NATIVE);
  assert.equal(observedRecord.evidenceSource.kind, STR_EVIDENCE_OBSERVED);
  const validObserved = validateComparisonHistoryRecord(observedRecord);
  assert.equal(typeof validObserved.recordSha256 === 'string', true);
  assert.equal(validObserved.framework.scenarioId, STR_SCENARIO_B_ID);
}

function runGuard() {
  verifyProfileAndDatasetDeterminism();
  verifyWorkloadPlanAndGraphShapes();
  verifyOracleEvaluationAndTamperResistance();
  verifyComparatorsAndHistoryLedger();
}

runGuard();
console.log(PASS_MESSAGE);
