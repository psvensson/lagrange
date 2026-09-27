import {test} from '../../src/test-helpers/tap.js';
import {
  areApplicationWriteFormationPreconditionsSatisfied,
  readLocalControlSnapshot,
  runApplicationWriteProbe,
} from './helpers/embedded-cluster-harness.js';

const NODE_ID = Object.freeze({SEED: 'seed-node', JOINER: 'joiner-node'});
const EXPECTED_NODE_IDS = Object.freeze([NODE_ID.SEED, NODE_ID.JOINER]);

function readiness({writable = true, publicationHealthy = true,
  provisioningEligible = true, placementEligible = true} = {}) {
  return {
    dimensions: {
      controlPlaneWritable: writable,
      metadataPublicationHealthy: publicationHealthy,
      placementEligible,
      provisioningEligible,
    },
  };
}

function snapshot({placementSatisfied = true, placementCapturedAt = 1234,
  seed = readiness(), joiner = readiness()} = {}) {
  return {
    capturedAt: 1234,
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation: {
        capturedAt: placementCapturedAt,
        satisfied: placementSatisfied,
        state: 'available',
      },
      readinessByNodeId: {
        [NODE_ID.SEED]: seed,
        [NODE_ID.JOINER]: joiner,
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
        joiner: readiness({publicationHealthy: false}),
      }), EXPECTED_NODE_IDS),
      false,
      'every expected node must report healthy metadata publication',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        seed: readiness({writable: false}),
      }), EXPECTED_NODE_IDS),
      false,
      'every expected node must report its control plane writable',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        seed: readiness({provisioningEligible: false}),
      }), EXPECTED_NODE_IDS),
      false,
      'every expected node must be provisioning eligible',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        joiner: readiness({placementEligible: false}),
      }), EXPECTED_NODE_IDS),
      false,
      'capacity-derived placement eligibility is a formation precondition',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot(), EXPECTED_NODE_IDS),
      true,
      'the readiness and placement owners establish formation preconditions',
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
