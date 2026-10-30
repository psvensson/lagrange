import assert from 'node:assert/strict';

import {
  SCENARIO_B_TOPOLOGY_PROFILE,
  SCENARIO_B_COORDINATOR_PLACEMENT,
  buildScenarioBLatencyGroupTopology,
  createScenarioBEdgeAccountingWindow,
  recordScenarioBShapedEdgeTransfer,
  closeScenarioBEdgeAccountingWindow,
  evaluateScenarioBLatencyGroupDecisionCost,
} from '../../test/distributed/harness/scenario-b-latency-group-owner.js';
import {
  SCENARIO_B_MOVEMENT_PHASE,
  createScenarioBMovementPlan,
  evaluateScenarioBMovementSubphase,
  compareScenarioBMovementResilience,
} from '../../test/distributed/harness/scenario-b-movement-subphase.js';

const arrayPush = Function.call.bind(Array.prototype.push);

const PASS_MESSAGE = 'scenario-b-latency-movement-guard: PASS';
const STR_SINGLE_ZONE = 'single-zone-rf3';
const STR_THREE_ISLAND = 'three-island-five-node-rf3';
const STR_COLOCATED_LAGRANGE = 'colocated-lagrange';
const STR_CENTRALIZED_TIDB = 'centralized-tidb-coordinator';
const STR_DISTRIBUTED_ISLAND = 'distributed-island-tidb-coordinators';
const STR_ISLAND_A = 'island-a';
const STR_ISLAND_B = 'island-b';
const STR_NODE_1 = 'node-1';
const STR_NODE_2 = 'node-2';
const STR_NODE_3 = 'node-3';
const STR_STAGE_RPC = 'stage-rpc';
const STR_DIR_AA = 'island-a->island-a';
const STR_DIR_AB = 'island-a->island-b';
const STR_FAN_OUT = 'fan-out';
const STR_SEQUENTIAL = 'sequential';
const STR_PRE_MOVE = 'pre-move-steady';
const STR_DURING_MOVE = 'during-move';
const STR_POST_MOVE = 'post-move-converged';
const STR_TIMING_MODEL = 'deterministic-contract-model';
const STR_TIMING_OBSERVED = 'observed';
const STR_SYSTEM_LAGRANGE = 'lagrange';
const STR_SYSTEM_TIDB = 'tidb';
const STR_PARTITION_KEY = 'partition-risk-07';
const STR_UNKNOWN_PROFILE = 'unknown-profile';

const NUM_THREE = 3;
const NUM_FIVE = 5;
const NUM_TEN = 10;
const NUM_15 = 15;
const NUM_24 = 24;
const NUM_48 = 48;
const NUM_72 = 72;
const NUM_240 = 240;
const NUM_512 = 512;
const NUM_1000 = 1000;
const NUM_1024 = 1024;
const NUM_2048 = 2048;
const NUM_2560 = 2560;
const NUM_4194304 = 4194304;

function verifyLatencyGroupOwner() {
  assert.equal(SCENARIO_B_TOPOLOGY_PROFILE.SINGLE_ZONE_RF3, STR_SINGLE_ZONE);
  assert.equal(SCENARIO_B_TOPOLOGY_PROFILE.THREE_ISLAND_FIVE_NODE_RF3, STR_THREE_ISLAND);
  assert.equal(SCENARIO_B_COORDINATOR_PLACEMENT.COLOCATED_LAGRANGE, STR_COLOCATED_LAGRANGE);
  assert.equal(SCENARIO_B_COORDINATOR_PLACEMENT.CENTRALIZED_TIDB_COORDINATOR, STR_CENTRALIZED_TIDB);
  assert.equal(
    SCENARIO_B_COORDINATOR_PLACEMENT.DISTRIBUTED_ISLAND_TIDB_COORDINATORS,
    STR_DISTRIBUTED_ISLAND,
  );

  assert.throws(() => buildScenarioBLatencyGroupTopology({topologyProfile: STR_UNKNOWN_PROFILE}));

  const singleZone = buildScenarioBLatencyGroupTopology({
    topologyProfile: SCENARIO_B_TOPOLOGY_PROFILE.SINGLE_ZONE_RF3,
  });
  assert.equal(singleZone.nodeCount, NUM_THREE);
  assert.equal(singleZone.latencyGroupCount, 1);
  assert.equal(singleZone.distributedCoordinatorFairnessSatisfied, true);

  const threeDist = buildScenarioBLatencyGroupTopology({
    topologyProfile: SCENARIO_B_TOPOLOGY_PROFILE.THREE_ISLAND_FIVE_NODE_RF3,
    coordinatorPlacement: SCENARIO_B_COORDINATOR_PLACEMENT.DISTRIBUTED_ISLAND_TIDB_COORDINATORS,
  });
  const threeCent = buildScenarioBLatencyGroupTopology({
    topologyProfile: SCENARIO_B_TOPOLOGY_PROFILE.THREE_ISLAND_FIVE_NODE_RF3,
    coordinatorPlacement: SCENARIO_B_COORDINATOR_PLACEMENT.CENTRALIZED_TIDB_COORDINATOR,
  });
  const threeLag = buildScenarioBLatencyGroupTopology({
    topologyProfile: SCENARIO_B_TOPOLOGY_PROFILE.THREE_ISLAND_FIVE_NODE_RF3,
    coordinatorPlacement: SCENARIO_B_COORDINATOR_PLACEMENT.COLOCATED_LAGRANGE,
  });

  assert.equal(threeDist.nodeCount, NUM_FIVE);
  assert.equal(threeDist.coordinatorNodes.length, NUM_THREE);
  assert.equal(threeDist.distributedCoordinatorFairnessSatisfied, true);
  assert.equal(threeCent.coordinatorNodes.length, 1);
  assert.equal(threeCent.distributedCoordinatorFairnessSatisfied, false);
  assert.equal(threeLag.coordinatorNodes.length, NUM_FIVE);
  assert.equal(threeLag.distributedCoordinatorFairnessSatisfied, true);

  const win = createScenarioBEdgeAccountingWindow({topology: threeDist});
  recordScenarioBShapedEdgeTransfer(win, {
    fromNodeId: STR_NODE_1, toNodeId: STR_NODE_2, packets: 2, bytes: NUM_512, phase: STR_STAGE_RPC,
  });
  recordScenarioBShapedEdgeTransfer(win, {
    fromNodeId: STR_NODE_1, toNodeId: STR_NODE_3, packets: 2, bytes: NUM_2048, phase: STR_STAGE_RPC,
  });
  const summary = closeScenarioBEdgeAccountingWindow(win, {
    endedAtMs: NUM_1000, completedRequests: 2,
  });

  assert.equal(summary.crossIslandBytes, NUM_2048);
  assert.equal(summary.intraIslandBytes, NUM_512);
  assert.equal(summary.totalBytes, NUM_2560);
  assert.equal(summary.crossIslandBytesPerRequest, NUM_1024);
  assert.equal(summary.byDirection.length, 2);
  assert.equal(summary.byDirection[0].directionKey, STR_DIR_AA);
  assert.equal(summary.byDirection[0].bytes, NUM_512);
  assert.equal(summary.byDirection[0].crossIsland, false);
  assert.equal(summary.byDirection[1].directionKey, STR_DIR_AB);
  assert.equal(summary.byDirection[1].bytes, NUM_2048);
  assert.equal(summary.byDirection[1].crossIsland, true);

  for (let i = 0; i < 2; i += 1) {
    const shape = i === 0 ? STR_FAN_OUT : STR_SEQUENTIAL;
    const costLag = evaluateScenarioBLatencyGroupDecisionCost({
      topology: threeLag, shape, stageCount: NUM_THREE,
    });
    const costTidb = evaluateScenarioBLatencyGroupDecisionCost({
      topology: threeDist, shape, stageCount: NUM_THREE,
    });
    assert.equal(costLag.crossIslandBytesTransferred < costTidb.crossIslandBytesTransferred, true);
    assert.equal(costLag.estimatedNetworkDelayMs < costTidb.estimatedNetworkDelayMs, true);
    assert.equal(costLag.compactFinalDecisionBytes <= NUM_1024, true);
    assert.equal(costTidb.compactFinalDecisionBytes <= NUM_1024, true);
  }
}

function buildPhaseSamples(phase, count, latencyMs, redirects) {
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    arrayPush(samples, {
      phase, latencyMs, ok: true, staleRouteRedirectCount: redirects,
      oracleMatch: true, serviceIdentityPreserved: true,
    });
  }
  return samples;
}

function verifyMovementSubphase() {
  assert.equal(SCENARIO_B_MOVEMENT_PHASE.PRE_MOVE_STEADY, STR_PRE_MOVE);
  assert.equal(SCENARIO_B_MOVEMENT_PHASE.DURING_MOVE, STR_DURING_MOVE);
  assert.equal(SCENARIO_B_MOVEMENT_PHASE.POST_MOVE_CONVERGED, STR_POST_MOVE);

  assert.throws(() => createScenarioBMovementPlan({
    sourceNodeId: STR_NODE_1, targetNodeId: STR_NODE_1,
  }));
  assert.throws(() => createScenarioBMovementPlan({replicaBytesToMove: 0}));

  const plan = createScenarioBMovementPlan({
    partitionKey: STR_PARTITION_KEY, sourceNodeId: STR_NODE_1, sourceGroup: STR_ISLAND_A,
    targetNodeId: STR_NODE_3, targetGroup: STR_ISLAND_B, replicaBytesToMove: NUM_4194304,
    preMoveRequests: NUM_24, duringMoveRequests: NUM_24, postMoveRequests: NUM_24,
  });

  assert.equal(plan.totalRequests, NUM_72);
  assert.equal(plan.samples.length, NUM_72);
  assert.equal(plan.crossIslandMove, true);

  const phasePre = SCENARIO_B_MOVEMENT_PHASE.PRE_MOVE_STEADY;
  const phaseDuring = SCENARIO_B_MOVEMENT_PHASE.DURING_MOVE;
  const phasePost = SCENARIO_B_MOVEMENT_PHASE.POST_MOVE_CONVERGED;

  const lagSamples = [];
  const tidbSamples = [];
  const lagPre = buildPhaseSamples(phasePre, NUM_24, NUM_FIVE, 0);
  const lagDuring = buildPhaseSamples(phaseDuring, NUM_24, NUM_TEN, 0);
  const lagPost = buildPhaseSamples(phasePost, NUM_24, NUM_FIVE, 0);
  const tidbPre = buildPhaseSamples(phasePre, NUM_24, NUM_TEN, 0);
  const tidbDuring = buildPhaseSamples(phaseDuring, NUM_24, NUM_48, 1);
  const tidbPost = buildPhaseSamples(phasePost, NUM_24, NUM_TEN, 0);
  for (let i = 0; i < NUM_24; i += 1) {
    arrayPush(lagSamples, lagPre[i]);
    arrayPush(lagSamples, lagDuring[i]);
    arrayPush(lagSamples, lagPost[i]);
    arrayPush(tidbSamples, tidbPre[i]);
    arrayPush(tidbSamples, tidbDuring[i]);
    arrayPush(tidbSamples, tidbPost[i]);
  }

  const lagReport = evaluateScenarioBMovementSubphase({
    system: STR_SYSTEM_LAGRANGE, movementPlan: plan, samples: lagSamples,
    automaticServiceColocationConverged: true, externalCoordinatorReconfigRequired: false,
    routingConvergenceMs: NUM_15, timingSource: STR_TIMING_MODEL,
  });
  assert.equal(lagReport.oracleAndIdentityPreserved, true);
  assert.equal(lagReport.comparable, false);
  assert.equal(typeof lagReport.nonComparableReason === 'string', true);
  assert.equal(lagReport.nonComparableReason.length > 0, true);

  const tidbReport = evaluateScenarioBMovementSubphase({
    system: STR_SYSTEM_TIDB, movementPlan: plan, samples: tidbSamples,
    automaticServiceColocationConverged: false, externalCoordinatorReconfigRequired: true,
    routingConvergenceMs: NUM_240, timingSource: STR_TIMING_MODEL,
  });
  assert.equal(tidbReport.oracleAndIdentityPreserved, true);
  assert.equal(tidbReport.staleRouteRedirectCount, NUM_24);

  const comparison = compareScenarioBMovementResilience({
    lagrangeReport: lagReport, tidbReport,
  });
  assert.equal(comparison.bothPreservedOracleAndIdentity, true);
  assert.equal(comparison.colocationAdvantage, true);
  assert.equal(comparison.duringMoveP99ReductionRatio > 1, true);
  assert.equal(comparison.convergenceTimeSpeedupRatio > 1, true);
  assert.equal(comparison.comparable, false);
  assert.equal(typeof comparison.nonComparableReason === 'string', true);
  assert.equal(comparison.nonComparableReason.length > 0, true);

  const lagReportObs = evaluateScenarioBMovementSubphase({
    system: STR_SYSTEM_LAGRANGE, movementPlan: plan, samples: lagSamples,
    automaticServiceColocationConverged: true, externalCoordinatorReconfigRequired: false,
    routingConvergenceMs: NUM_15, timingSource: STR_TIMING_OBSERVED,
  });
  const tidbReportObs = evaluateScenarioBMovementSubphase({
    system: STR_SYSTEM_TIDB, movementPlan: plan, samples: tidbSamples,
    automaticServiceColocationConverged: false, externalCoordinatorReconfigRequired: true,
    routingConvergenceMs: NUM_240, timingSource: STR_TIMING_OBSERVED,
  });
  const compObs = compareScenarioBMovementResilience({
    lagrangeReport: lagReportObs, tidbReport: tidbReportObs,
  });
  assert.equal(compObs.comparable, true);
  assert.equal(compObs.nonComparableReason, '');
}

function runGuard() {
  verifyLatencyGroupOwner();
  verifyMovementSubphase();
}

runGuard();
console.log(PASS_MESSAGE);
