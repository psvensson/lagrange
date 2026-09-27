import {test} from '../../src/test-helpers/tap.js';
import {
  isApplicationWriteReadinessSatisfied,
  runApplicationWriteProbe,
} from './helpers/embedded-cluster-harness.js';

const NODE_ID = Object.freeze({SEED: 'seed-node', JOINER: 'joiner-node'});
const EXPECTED_NODE_IDS = Object.freeze([NODE_ID.SEED, NODE_ID.JOINER]);

function readiness({writable = true, publicationHealthy = true} = {}) {
  return {
    dimensions: {
      controlPlaneWritable: writable,
      metadataPublicationHealthy: publicationHealthy,
    },
  };
}

function snapshot({placementSatisfied = true,
  seed = readiness(), joiner = readiness()} = {}) {
  return {
    controlPlaneDiagnostics: {
      currentPriorityPlacementObservation: {
        satisfied: placementSatisfied,
      },
      readinessByNodeId: {
        [NODE_ID.SEED]: seed,
        [NODE_ID.JOINER]: joiner,
      },
    },
  };
}

test('embedded formation consumes authoritative write-readiness before DDL',
  (t) => {
    t.equal(
      isApplicationWriteReadinessSatisfied({nodes: EXPECTED_NODE_IDS},
        EXPECTED_NODE_IDS),
      false,
      'active-node visibility alone is not application-write readiness',
    );
    t.equal(
      isApplicationWriteReadinessSatisfied(
        snapshot({placementSatisfied: false}), EXPECTED_NODE_IDS),
      false,
      'unsatisfied canonical priority placement keeps DDL closed',
    );
    t.equal(
      isApplicationWriteReadinessSatisfied(snapshot({
        joiner: readiness({publicationHealthy: false}),
      }), EXPECTED_NODE_IDS),
      false,
      'every expected node must report healthy metadata publication',
    );
    t.equal(
      isApplicationWriteReadinessSatisfied(snapshot({
        seed: readiness({writable: false}),
      }), EXPECTED_NODE_IDS),
      false,
      'every expected node must report its control plane writable',
    );
    t.equal(
      isApplicationWriteReadinessSatisfied(snapshot(), EXPECTED_NODE_IDS),
      true,
      'the readiness owner and placement owner jointly authorize the probe',
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
