// P12 (placement-owner proof transfer): five nodes in one process through the
// production construction. P13 (five nodes on the lab) is not a test file:
// it needs a five-host physical formation.
//
// Requirement (owner, binding): five-node operation; single-owner scheduling;
// no duplicated placement work. Five node hosts (one per declared host), the
// ledger on three of them, three simultaneous deficits of different classes,
// and one ledger leader change in the middle.
//
// Observed: owners attached = ledger replicas hosted; at most one owner leads
// at every sampled instant (a 2 ms sampler over the whole run); nodes without
// a ledger replica do no placement work and hold no scheduler; per deficit one
// admitted operation, with every actor's work counted.
//
// Fixture: placement-owner-authority-fixture.js (production construction per
// node; controllable consensus with a fixture-owned ledger log; graceful
// transfer: the deposed leader is told before the successor activates).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {
  LEDGER, admittedOperations, attemptOutcomeOf, holdNextAdmission, ownerOf, startLedgerOn,
  summarizeProbe, transferReport, waitUntil, withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {
  clearFixtureSingletons, resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const FIVE_NODES = Object.freeze(['n1', 'n2', 'n3', 'n4', 'n5'].map((nodeId, index) =>
  ({nodeId, hostId: `h${index + 1}`})));
const LEDGER_NODES = Object.freeze(['n1', 'n2', 'n3']);
const DEFICITS = Object.freeze(['sql_transactions-p1', 'tables-p1', 'orders-p1']);
const PROGRESS_BOUND_MS = 3_000;

test('P12 five nodes: the ledger on three, three deficits, a ledger leader change in the ' +
  'middle; one owner leads at a time and each deficit is admitted once',
(t) => withPlacementWorld({nodes: FIVE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: LEDGER_NODES},
  ...DEFICITS.map((partitionId) => ({partitionId, leaderNodeId: 'n1',
    replicaNodeIds: ['n1', 'n2']})),
]}, async (world) => {
  const nodes = await startLedgerOn(world, LEDGER_NODES);
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const leadingSamples = [];
  const sampler = setInterval(() => {
    leadingSamples.push(nodes.filter((node) => ownerOf(node)?.isLeader === true)
      .map((node) => node.nodeId));
  }, 2);
  try {
    // The first leader admits one deficit; its second admission is held at
    // the boundary while the ledger leadership moves to n2.
    const second = holdNextAdmission(byId.get('n1'), {skip: 1});
    await world.electLedger(byId.get('n1'));
    await second.reached.promise;
    await world.electLedger(byId.get('n2'));
    second.release.resolve();
    await waitUntil(() => DEFICITS.every((partitionId) =>
      admittedOperations(world, byId.get('n2'), partitionId).length === 1),
    'every deficit admitted', PROGRESS_BOUND_MS);
    await world.idle();
  } finally {
    clearInterval(sampler);
  }
  const report = JSON.stringify({counts: nodes.filter((node) => node.probe)
    .map((node) => summarizeProbe(node.probe)),
  perDeficit: DEFICITS.map((partitionId) => transferReport(world, partitionId))});
  t.diagnostic(report);
  assert.deepEqual(nodes.filter((node) => ownerOf(node)).map((node) => node.nodeId),
    LEDGER_NODES, `owners attached = ledger replicas hosted; ${report}`);
  for (const nodeId of ['n4', 'n5']) {
    const node = byId.get(nodeId);
    assert.equal(node.ledger, null, `${nodeId} hosts no ledger replica`);
    assert.equal(node.coordinator.placementAdmissionEnabled, true,
      `${nodeId}'s coordinator is bound to placement admission (no partition scheduler)`);
  }
  const overlapping = leadingSamples.filter((leading) => leading.length > 1);
  assert.deepEqual(overlapping, [], 'at most one owner leads at every sampled instant ' +
    `(${leadingSamples.length} samples); ${report}`);
  for (const partitionId of DEFICITS) {
    for (const nodeId of LEDGER_NODES) {
      assert.equal(admittedOperations(world, byId.get(nodeId), partitionId).length, 1,
        `${partitionId} admitted once on ledger replica ${nodeId}; ${report}`);
    }
    const proposals = world.log.proposals.filter((proposal) =>
      proposal.partitionId === partitionId);
    assert.equal(proposals.length, 1, `${partitionId}: one proposal in total; ${report}`);
  }
  const heldAttempt = byId.get('n1').probe.admissionAttempts.find((attempt) => attempt.held);
  assert.equal(attemptOutcomeOf(heldAttempt), PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER,
    `the deposed leader's held admission is refused at the boundary (counted apart); ${report}`);
  assert.ok(byId.get('n2').probe.admissionAttempts.length >= 1,
    `the successor admitted the remaining deficits; ${report}`);
  const n3 = byId.get('n3');
  assert.equal(n3.probe.passes.length, 0, 'the ledger follower that never led did no work; ' +
    `${report}`);
}));
