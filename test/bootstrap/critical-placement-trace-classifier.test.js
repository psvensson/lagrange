// Witness for the critical-placement-causal-trace quest (S6a): the stage
// CLASSIFIER is deterministic and its first-missing-transition rule is
// pinned on replayed fixtures. The live formation run is timing-dependent;
// nothing here is.
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACE_STAGE,
  TRACE_STAGE_ORDER,
  TRACE_STAGE_OWNER,
  classifyPlacementTrace,
  comparePlacementTraces,
} from '../integration/helpers/critical-placement-trace-classifier.js';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PARTITION_ID = 'services-p1';
const KNOWN_NOT_CONVERGED = 'known_not_converged';
const KNOWN_CONVERGED = 'known_converged';
const PARTITION_ROW_SOURCE = 'partition_row_replica_count';

function placementSample(atMs, {
  evidenceState = KNOWN_NOT_CONVERGED,
  distinctNodeIds = ['seed'],
  source = PARTITION_ROW_SOURCE,
  operations = [],
  serviceRows = null,
} = {}) {
  return {
    atMs,
    placement: {
      partitionId: PARTITION_ID,
      evidenceState,
      requiredReplicaCountSource: source,
      distinctNodeCount: distinctNodeIds.length,
      distinctNodeIds,
    },
    operations,
    serviceRows: serviceRows ?? distinctNodeIds.map((nodeId, index) => ({
      node_id: nodeId,
      replica_id: `${PARTITION_ID}-r${index + 1}`,
      raft_role: index === 0 ? 'leader' : 'follower',
      status: 'active',
    })),
  };
}

function operationRow(operationId, {status = 'pending',
  workflowStep = 'recorded', completedAt = null} = {}) {
  return {
    operation_id: operationId,
    type: 'ADD',
    partition_id: PARTITION_ID,
    status,
    workflow_step: workflowStep,
    completed_at: completedAt,
  };
}

// The full healthy chain: deficit measured, operation recorded, progressed,
// replica appears, voter on a new node, holders advance, converged, stable.
function healthyChainSamples() {
  const baseline = placementSample(0);
  return [
    baseline,
    placementSample(500, {operations: [operationRow('op-1')]}),
    placementSample(1000, {operations: [operationRow('op-1',
      {status: 'in_progress', workflowStep: 'dispatched'})]}),
    placementSample(1500, {
      operations: [operationRow('op-1',
        {status: 'in_progress', workflowStep: 'catching_up'})],
      distinctNodeIds: ['seed'],
      serviceRows: [
        {node_id: 'seed', replica_id: `${PARTITION_ID}-r1`,
          raft_role: 'leader', status: 'active'},
        {node_id: 'node-2', replica_id: `${PARTITION_ID}-r4`,
          raft_role: 'learner', status: 'active'},
      ],
    }),
    placementSample(2000, {
      operations: [operationRow('op-1',
        {status: 'completed', workflowStep: 'completed', completedAt: 1900})],
      distinctNodeIds: ['node-2', 'seed'],
    }),
    placementSample(2500, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
    placementSample(3000, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
    placementSample(3500, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
  ];
}

test('classifier-covers-every-stage-on-a-healthy-chain', () => {
  const samples = healthyChainSamples();
  const result = classifyPlacementTrace({baseline: samples[0], samples});

  for (const entry of result.stages) {
    assert.equal(entry.reached, true, `${entry.stage} must be reached`);
    assert.ok(typeof entry.firstReachedAtMs === 'number',
      `${entry.stage} carries its first-reached timestamp`);
    assert.ok(entry.owner, `${entry.stage} names its owner`);
  }
  assert.equal(result.firstMissingStage, null,
    'a completed chain has no missing transition');
  assert.equal(result.firstMissingOwner, null);
});

test('first-missing-transition-is-the-first-unreached-stage', () => {
  // Stalls at every prefix depth: truncate the healthy chain before each
  // stage's first evidence and the classifier must name exactly that stage.
  const samples = healthyChainSamples();
  const stalls = [
    [[samples[0]], TRACE_STAGE.OPERATION_RECORDED,
      'deficit measured, nothing recorded'],
    [samples.slice(0, 2), TRACE_STAGE.OPERATION_PROGRESSED,
      'operation recorded, never progresses'],
    [samples.slice(0, 3), TRACE_STAGE.REPLICA_APPEARED,
      'operation progresses, no replica appears'],
    [samples.slice(0, 4), TRACE_STAGE.VOTER_ON_NEW_NODE,
      'learner appears, never votes on a new node'],
    [samples.slice(0, 5), TRACE_STAGE.CONVERGED,
      'holders advance, set never satisfies'],
  ];
  for (const [stalledSamples, expectedStage, label] of stalls) {
    const result = classifyPlacementTrace({
      baseline: stalledSamples[0],
      samples: stalledSamples,
    });
    assert.equal(result.firstMissingStage, expectedStage, label);
    assert.equal(result.firstMissingOwner, TRACE_STAGE_OWNER[expectedStage],
      `${label}: the owner comes from the stage-owner map`);
  }
});

test('already-converged-partition-is-missing-nothing', () => {
  const converged = [
    placementSample(0, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
    placementSample(500, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
    placementSample(1000, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
  ];
  const result = classifyPlacementTrace({baseline: converged[0],
    samples: converged});
  assert.equal(result.firstMissingStage, null,
    'a partition converged from the start needed no repair arrow');
  const convergedStage = result.stages.find(
    (entry) => entry.stage === TRACE_STAGE.CONVERGED);
  assert.equal(convergedStage.reached, true);
});

test('flapping-convergence-is-missing-stabilized', () => {
  const flapping = [
    placementSample(0),
    placementSample(500, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
    placementSample(1000, {evidenceState: KNOWN_NOT_CONVERGED,
      distinctNodeIds: ['node-2', 'seed']}),
    placementSample(1500, {evidenceState: KNOWN_CONVERGED,
      distinctNodeIds: ['node-2', 'node-3', 'seed']}),
    placementSample(2000, {evidenceState: KNOWN_NOT_CONVERGED,
      distinctNodeIds: ['node-2', 'seed']}),
  ];
  const result = classifyPlacementTrace({baseline: flapping[0],
    samples: flapping});
  assert.equal(result.firstMissingStage, TRACE_STAGE.STABILIZED,
    'convergence that does not hold is a flapping tail, not completion');
});

test('unknown-policy-partition-stops-at-authority', () => {
  const unknownSamples = [
    placementSample(0, {source: 'undeclared'}),
    placementSample(500, {source: 'undeclared'}),
  ];
  const result = classifyPlacementTrace({baseline: unknownSamples[0],
    samples: unknownSamples});
  assert.equal(result.firstMissingStage, TRACE_STAGE.AUTHORITY_KNOWN,
    'no authoritative requirement means the chain never starts');
});

test('comparison-classifies-the-three-diagnostic-shapes', () => {
  const complete = classifyPlacementTrace({
    baseline: healthyChainSamples()[0],
    samples: healthyChainSamples(),
  });
  const stalledEarly = classifyPlacementTrace({
    baseline: healthyChainSamples()[0],
    samples: [healthyChainSamples()[0]],
  });
  const stalledSame = classifyPlacementTrace({
    baseline: healthyChainSamples()[0],
    samples: [healthyChainSamples()[0]],
  });

  assert.equal(comparePlacementTraces(complete, complete).shape,
    'both_complete');
  assert.equal(comparePlacementTraces(stalledEarly, complete).shape,
    'critical_stops_earlier',
    'ordinary progressing while critical stops is the classification shape');
  assert.equal(comparePlacementTraces(stalledSame, stalledSame).shape,
    'common_stage_stall',
    'both lanes stopped at the same arrow is a common lifecycle problem');
  assert.equal(comparePlacementTraces(complete, stalledEarly).shape,
    'ordinary_stops_critical_completes');
});

test('witness-deterministic', () => {
  const samples = healthyChainSamples();
  const first = JSON.parse(JSON.stringify(
    classifyPlacementTrace({baseline: samples[0], samples})));
  const second = JSON.parse(JSON.stringify(
    classifyPlacementTrace({baseline: samples[0], samples})));
  assert.deepEqual(first, second, 'replaying the fixture changes nothing');
  assert.deepEqual(TRACE_STAGE_ORDER.length, 9,
    'the stage vocabulary is the declared nine-stage chain');
});

test('trace-changes-no-behaviour', () => {
  // S6a repairs nothing: the quest's source surface is test/ and scripts/
  // only. This pins the constraint mechanically for the CANDIDATE tree the
  // receipts are generated on: no src/ delta against HEAD may accompany the
  // trace work.
  const delta = execFileSync('git', ['diff', '--name-only', 'HEAD', '--',
    'src'], {cwd: REPOSITORY_ROOT, encoding: 'utf8'}).trim();
  assert.equal(delta, '', `unexpected src/ delta: ${delta}`);
});
