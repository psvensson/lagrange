import {test} from '../../src/test-helpers/tap.js';
import {
  areApplicationWriteFormationPreconditionsSatisfied,
  buildApplicationWriteFormationObservation,
  readLocalControlSnapshot,
  runApplicationWriteProbe,
} from './helpers/embedded-cluster-harness.js';

const NODE_ID = Object.freeze({SEED: 'seed-node', JOINER: 'joiner-node'});
const EXPECTED_NODE_IDS = Object.freeze([NODE_ID.SEED, NODE_ID.JOINER]);

function snapshot({placementSatisfied = true, placementCapturedAt = 1234,
  eligibleNodeIds = EXPECTED_NODE_IDS} = {}) {
  return {
    capturedAt: 1234,
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation: {
        capturedAt: placementCapturedAt,
        eligibleNodeIds,
        satisfied: placementSatisfied,
        state: 'available',
      },
      readinessByNodeId: {
        [NODE_ID.SEED]: {dimensions: {controlPlaneWritable: false}},
        [NODE_ID.JOINER]: {dimensions: {provisioningEligible: false}},
      },
    },
  };
}

test('embedded formation consumes authoritative preconditions before DDL',
  (t) => {
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        {nodes: EXPECTED_NODE_IDS},
        EXPECTED_NODE_IDS),
      false,
      'active-node visibility alone is not application-write readiness',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot({placementCapturedAt: 1233}), EXPECTED_NODE_IDS),
      false,
      'priority placement must belong to the same snapshot capture',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot({placementSatisfied: false}), EXPECTED_NODE_IDS),
      false,
      'unsatisfied canonical priority placement keeps DDL closed',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        eligibleNodeIds: [NODE_ID.SEED],
      }), EXPECTED_NODE_IDS),
      false,
      'a reduced eligible cohort cannot establish formation',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        eligibleNodeIds: [NODE_ID.SEED, 'other-node'],
      }), EXPECTED_NODE_IDS),
      false,
      'a same-size mismatched eligible cohort cannot establish formation',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        eligibleNodeIds: [...EXPECTED_NODE_IDS, 'other-node'],
      }), EXPECTED_NODE_IDS),
      false,
      'an expanded eligible cohort cannot establish this formation',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot(), EXPECTED_NODE_IDS),
      true,
      'same-build satisfied placement for the exact cohort establishes ' +
        'formation despite stale per-peer readiness projections',
    );
    t.end();
  });

test('embedded formation failure retains a compact owner observation', (t) => {
  t.same(
    buildApplicationWriteFormationObservation(snapshot({
      eligibleNodeIds: [NODE_ID.SEED],
    }), EXPECTED_NODE_IDS),
    {
      snapshotCapturedAt: 1234,
      placementCapturedAt: 1234,
      placementState: 'available',
      placementSatisfied: true,
      placementEligibleNodeIds: [NODE_ID.SEED],
      expectedNodeIds: EXPECTED_NODE_IDS,
      preconditionsSatisfied: false,
    },
    'timeout evidence names every input to the formation predicate',
  );
  t.end();
});

test('embedded formation submits its authorized DDL witness once', async (t) => {
  let createAttempts = 0;
  let insertAttempts = 0;
  await t.rejects(runApplicationWriteProbe(async (sql) => {
    if (sql.startsWith('CREATE TABLE')) {
      createAttempts++;
      throw new Error('terminal schema rejection');
    }
    insertAttempts++;
    return [];
  }), /create: terminal schema rejection/,
  'the first DDL rejection is surfaced directly');
  t.equal(createAttempts, 1, 'DDL is submitted exactly once');
  t.equal(insertAttempts, 0, 'a rejected DDL cannot fall through to INSERT');
});

test('embedded control-snapshot observation is bounded', async (t) => {
  let observedSignal = null;
  const stalledFetch = (_url, options) => {
    observedSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('bounded observation aborted');
        error.name = 'AbortError';
        reject(error);
      }, {once: true});
    });
  };
  await t.rejects(
    readLocalControlSnapshot(t, {adminPort: 1}, 1, stalledFetch),
    {name: 'AbortError'},
    'a stalled admin observation cannot escape its remaining budget',
  );
  t.equal(observedSignal?.aborted, true, 'the request signal is aborted');
});
