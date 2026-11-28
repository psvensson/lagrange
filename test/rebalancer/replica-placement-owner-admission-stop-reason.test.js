// The admission loop's stop reason in the pass's decision diagnostics: which
// exit ended the loop, written once, and null when every ordered candidate was
// examined. A real owner, pass record and diagnostics; the seams are the
// candidate proposal and the hold-release submission, and a tenure ends by
// replacing the ledger's leadership tenure.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PLACEMENT_CLASS} from '../../src/bootstrap/system-partition-classification.js';
import {PLACEMENT_RESULT_FIELD} from '../../src/partition/partition-placement-admission-constants.js';
import {LEDGER_PARTITION_ID} from '../../src/partition/partition-placement-admission-decision.js';
import {createPlacementDecisionDiagnostics} from '../../src/rebalancer/replica-placement-owner-capacity.js';
import {PLACEMENT_OUTCOME, PLACEMENT_TRIGGER} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {beginPlacementPass} from '../../src/rebalancer/replica-placement-owner-pass-observation.js';
import {REPLICA_PLACEMENT_PASS_ABORTED, recordProposalAnswer} from
  '../../src/rebalancer/replica-placement-owner-proposal-knowledge.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';

const NOW_MS = 3_000_000;
const NON_COPY_MOVE = Object.freeze({type: 'REMOVE'});

function createOwnerWorld() {
  const ledger = {
    on() {}, off() {}, partitionId: LEDGER_PARTITION_ID, db: {},
    leadershipTenure: Object.freeze({term: 1}),
  };
  const owner = createReplicaPlacementOwner({
    nodeId: 'n1',
    ledgerPartitionService: ledger,
    nodeAuthority: {answerCommittedNodes() {}, scheduleRefresh() {}, subscribe: () => () => {}},
    systemTableCache: {getAll: () => [], onCacheApplyChange() {}, offCacheApplyChange() {}},
    now: () => NOW_MS,
    logger: {debug() {}, info() {}, warn() {}, error() {}},
  });
  owner.custody = {tenure: ledger.leadershipTenure};
  const pass = beginPlacementPass(owner.observation, owner.custody, new Set());
  pass.decisionDiagnostics = createPlacementDecisionDiagnostics(pass, NOW_MS);
  const endTenure = () => {
    ledger.leadershipTenure = Object.freeze({term: 2});
  };
  return {owner, pass, endTenure};
}

function candidate(partitionId, placementClass = PLACEMENT_CLASS.SYSTEM) {
  return {partitionId, placementClass, move: NON_COPY_MOVE};
}

function admissionContext(pass, ordered, overrides = {}) {
  return {
    ordered, pass, busyPartitions: new Set(), saturatedTargets: new Set(),
    occupancy: {bySource: new Map(), byTarget: new Map(), copies: []},
    budgetSnapshot: null, incompleteCount: 0, copyCount: 0, ledgerIncomplete: false,
    ...overrides,
  };
}

const admitted = (rawCandidate, operationId) => ({candidate: rawCandidate, operationId});

test('a tenure that ended before the next candidate stops with tenure_ended', async () => {
  const {owner, pass, endTenure} = createOwnerWorld();
  endTenure();
  await owner.admitOrderedCandidates(admissionContext(pass, [candidate('p1')]));
  const snapshot = pass.decisionDiagnostics.snapshot;
  assert.equal(snapshot.stopReason, 'tenure_ended');
  assert.equal(snapshot.orderedCount, 1);
  assert.equal(snapshot.admissionExamined, 0);
});

test('an incomplete ledger move stops the loop with ledger_exclusion', async () => {
  const {owner, pass} = createOwnerWorld();
  await owner.admitOrderedCandidates(admissionContext(pass, [candidate('p1')],
    {ledgerIncomplete: true}));
  assert.equal(pass.stale, false);
  assert.equal(pass.decisionDiagnostics.snapshot.stopReason, 'ledger_exclusion');
  assert.equal(pass.decisionDiagnostics.snapshot.admissionExamined, 0);
});

test('a tenure that ended across the ledger hold release stops with ledger_hold_checkpoint',
  async () => {
    const {owner, pass, endTenure} = createOwnerWorld();
    const ledgerMove = candidate(LEDGER_PARTITION_ID, PLACEMENT_CLASS.LEDGER);
    owner.proposeCandidateIsolated = async (rawCandidate) => admitted(rawCandidate, 'op-ledger');
    owner.submitHoldRelease = async () => {
      endTenure();
      return null;
    };
    await owner.admitOrderedCandidates(admissionContext(pass, [ledgerMove, candidate('p2')]));
    const snapshot = pass.decisionDiagnostics.snapshot;
    assert.equal(snapshot.stopReason, 'ledger_hold_checkpoint');
    assert.equal(snapshot.admissionExamined, 1);
    assert.deepEqual(pass.operationIds, ['op-ledger']);
  });

test('a trigger that arrives during admission stops with pending_trigger', async () => {
  const {owner, pass} = createOwnerWorld();
  owner.proposeCandidateIsolated = async (rawCandidate) => {
    owner.pendingTriggers.add(PLACEMENT_TRIGGER.RESYNC);
    return admitted(rawCandidate, `op-${rawCandidate.partitionId}`);
  };
  await owner.admitOrderedCandidates(admissionContext(pass, [candidate('p1'), candidate('p2')]));
  const snapshot = pass.decisionDiagnostics.snapshot;
  assert.equal(snapshot.stopReason, 'pending_trigger');
  assert.equal(snapshot.admissionExamined, 1);
  assert.deepEqual(pass.operationIds, ['op-p1']);
});

test('a loop that examined every ordered candidate leaves stopReason null', async () => {
  const {owner, pass} = createOwnerWorld();
  const examined = [];
  owner.proposeCandidateIsolated = async (rawCandidate) => {
    examined.push(rawCandidate.partitionId);
    return null;
  };
  await owner.admitOrderedCandidates(admissionContext(pass, [candidate('p1'), candidate('p2')]));
  const snapshot = pass.decisionDiagnostics.snapshot;
  assert.equal(snapshot.stopReason, null);
  assert.equal(snapshot.orderedCount, 2);
  assert.equal(snapshot.admissionExamined, 2);
  assert.deepEqual(examined, ['p1', 'p2']);
});

test('an admitted candidate whose local step failed aborts the pass with candidate_failure',
  async () => {
    const {owner, pass} = createOwnerWorld();
    owner.proposeOrderedCandidate = async (_rawCandidate, _context, progress) => {
      recordProposalAnswer(progress, {[PLACEMENT_RESULT_FIELD]: {
        outcome: PLACEMENT_OUTCOME.ADMITTED, operationIds: ['op-failed-locally'],
      }});
      throw new Error('local step after admission failed');
    };
    await assert.rejects(
      owner.admitOrderedCandidates(admissionContext(pass, [candidate('p1'), candidate('p2')])),
      {code: REPLICA_PLACEMENT_PASS_ABORTED},
    );
    const snapshot = pass.decisionDiagnostics.snapshot;
    assert.equal(snapshot.stopReason, 'candidate_failure');
    assert.equal(snapshot.admissionExamined, 1);
    assert.deepEqual(pass.operationIds, ['op-failed-locally']);
  });
