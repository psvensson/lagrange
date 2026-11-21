// A placement RELEASE attempt and its bounded, visible outcomes.
//
// 1. Idempotence of PLACEMENT_RELEASE_HOLD by OPERATION identity: the same
//    engaged hold released under two different entry ids has exactly one
//    effect, and the second answer is a definite committed HOLD_NOT_HELD.
// 2. N1: a release attempt whose entry key already holds another record can
//    never succeed under that entry (outcome rows are permanent). The hold
//    would stay engaged, the ledger move could never be dispatched, and every
//    placement pass for every partition would stop behind the incomplete
//    ledger move. The attempt owner re-drives it under a fresh entry id and
//    keeps the blocked record visible; a blocked ADMIT stays visible as
//    blocked work and stops only its own partition.
// 3. F4 residue: an uncertain RELEASE attempt whose hold another leader
//    released retires as its own named outcome (superseded by ledger state),
//    never as a settlement of its own command, and is listed once; also when
//    the hold is lifted during the tenure, on the next pass (4).
// 5. A re-drive survives a crash between its durable replacement and its
//    proposal: the restarted owner re-drives the fresh entry, never the dead.
//
// REAL: the replica_operations-p1 PartitionService and its committed apply
// path, the native admission and release requests, the outcome owner, the
// placement owner's passes, attempt store and diagnostics. DOUBLES: the
// consensus port (the test commits each proposal), the committed node
// authority (four ready nodes, formation FORMED), the system-table cache
// (two user partitions one replica short), the logger (records).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_RECORD_CLASS as RECORD_CLASS,
  PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as WRITE_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {requestPlacementAdmission, requestPlacementHoldRelease} from
  '../../src/partition/partition-placement-admission.js';
import {readPlacementCensus} from
  '../../src/partition/partition-placement-admission-decision.js';
import {PLACEMENT_CLASS, PLACEMENT_CLEARING_TRIGGER, PLACEMENT_FORMATION_STATE,
  PLACEMENT_OUTCOME, PLACEMENT_REFUSAL, PLACEMENT_TRIGGER} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';
// A namespace import: the witnesses name the owner's attempt states without
// failing to load before those states exist.
import * as attempts from '../../src/rebalancer/replica-placement-owner-attempts.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  settle, track} from '../test-helpers/participant-transaction-fixture.js';
import {LEDGER_PARTITION_ID, admitOnLeader, commitLedgerStatement, ledgerRows,
  onLedgerLeader, placementStatement, stepLedgerRow} from
  '../partition/placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const NOW_MS = 1_000_000;
const LEASE_MS = 60_000;
const LATCH_EPOCH = 5;
const IDLE_ROUNDS = 50;
const NODES = Object.freeze(['n1', 'n2', 'n3', 'n4']);
const USER_PARTITIONS = Object.freeze(['tbl-items-p1', 'tbl-orders-p1']);
const ATTEMPT_ROW_SQL =
  'SELECT entry_id FROM _placement_owner_unresolved_attempts WHERE attempt_key = ?';
const FOREIGN_SQL = 'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?';
const FOREIGN_PARAMS = Object.freeze([1, 'none']);
const resultOf = (answer) => answer?.[PLACEMENT_RESULT_FIELD];
const holdOf = (leader, operationId) => readPlacementCensus(leader.db)
  .find((row) => row.operationId === operationId)?.dispatchHold ?? null;
const attemptRowOf = (leader, attemptKey) =>
  leader.db.prepare(ATTEMPT_ROW_SQL).get(attemptKey) ?? null;
const byAttemptKey = (states) => Object.fromEntries((states ?? []).map((state) =>
  [state.attemptKey, state]));

// The engaged ledger move: an ADD of the ledger partition, held until the
// copies are idle (its admission statement carries the dispatch hold).
async function admitHeldLedgerMove(leader, proposed) {
  const admitted = await admitOnLeader(leader, proposed, 'ledger-move', placementStatement({
    partitionId: LEDGER_PARTITION_ID, placementClass: PLACEMENT_CLASS.LEDGER,
    target: 'n3', source: 'n1'}));
  assert.equal(resultOf(admitted.answer)?.outcome, PLACEMENT_OUTCOME.ADMITTED);
  const [operationId] = resultOf(admitted.answer).operationIds;
  assert.notEqual(holdOf(leader, operationId), null, 'precondition: the hold is engaged');
  return operationId;
}

// A request whose proposal the test commits, as the consensus port would.
function committing(leader, proposed, request) {
  return async (payload) => {
    const pending = track(request(leader, payload));
    const command = await awaitProposal(proposed, (entry) => entry.entryId === payload.entryId);
    if (command !== null) assert.equal(applyCommitted(leader, command), null);
    return pending.promise;
  };
}

async function releaseOnLeader(leader, proposed, entryId, operationId) {
  return committing(leader, proposed, requestPlacementHoldRelease)(
    {entryId, body: {operationId}});
}

function recordingLogger() {
  const lines = {warn: [], info: []};
  return {lines, logger: {debug() {}, error() {},
    info: (message, fields) => lines.info.push({message, fields}),
    warn: (message, fields) => lines.warn.push({message, fields})}};
}

function nodeRow(nodeId, index) {
  return {[COLUMN.NODE_ID]: nodeId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + LEASE_MS, [COLUMN.BOOT_INCARNATION]: 1,
    [COLUMN.HOST_ID]: `h${index + 1}`};
}

function readyNodeAuthority() {
  return {subscribe: () => () => {}, scheduleRefresh() {},
    answerCommittedNodes: () => ({state: 'ready', epoch: {publicationEpoch: LATCH_EPOCH},
      nodeRows: NODES.map(nodeRow),
      formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: LATCH_EPOCH}})};
}

function unavailableNodeAuthority() {
  return {subscribe: () => () => {}, scheduleRefresh() {},
    answerCommittedNodes: () => ({state: 'unavailable', reason: 'not_read', nodeRows: []})};
}

// Each user partition: replica_count 3, two active replicas on n1 (leader)
// and n2, so each is one ADD short.
function shortPartitionsCache() {
  const partitions = USER_PARTITIONS.map((partitionId) => ({
    [COLUMN.PARTITION_ID]: partitionId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    replica_count: 3, [COLUMN.LEADER_NODE_ID]: 'n1'}));
  const services = USER_PARTITIONS.flatMap((partitionId) => ['n1', 'n2'].map((nodeId, i) => ({
    [COLUMN.REPLICA_ID]: `${partitionId}-r${i + 1}`, [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.NODE_ID]: nodeId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.RAFT_ROLE]: i === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER})));
  const rows = new Map([[TABLES.PARTITIONS, partitions], [TABLES.SERVICES, services],
    [TABLES.REPLICA_OPERATIONS, []]]);
  return {getAll: (tableName) => [...(rows.get(tableName) ?? [])],
    onCacheApplyChange() {}, offCacheApplyChange() {}};
}

// The answer of a proposal lost before it reached the log.
const OUTCOME_UNKNOWN = Object.freeze({success: false,
  failureCode: WRITE_REFUSAL.OUTCOME_UNKNOWN});

// Record each pass's triggers (the owner's own drain calls this.runPass).
function recordPasses(owner) {
  const passes = [];
  const run = owner.runPass.bind(owner);
  owner.runPass = (triggers) => {
    passes.push([...triggers]);
    return run(triggers);
  };
  return passes;
}

async function idle(owner) {
  for (let round = 0; round < IDLE_ROUNDS; round += 1) {
    await owner.awaitCurrentWorkIdle();
    await settle();
    if (owner.runningPromise === null && owner.pendingTriggers.size === 0) return;
  }
}

test('PLACEMENT_RELEASE_HOLD is idempotent by operation identity: two entry ids, one ' +
  'effect, a definite second answer', () =>
  onLedgerLeader(async (leader, proposed) => {
    const operationId = await admitHeldLedgerMove(leader, proposed);
    const first = await releaseOnLeader(leader, proposed, 'release-first', operationId);
    assert.equal(first.committed, true);
    assert.deepEqual(resultOf(first),
      {outcome: PLACEMENT_OUTCOME.RELEASED, operationIds: [operationId]});
    assert.equal(holdOf(leader, operationId), null, 'the first release lifts the hold');
    const rowAfterFirst = ledgerRows(leader).find((row) => row.operation_id === operationId);
    const second = await releaseOnLeader(leader, proposed, 'release-second', operationId);
    assert.equal(second.committed, true, 'the second release commits');
    assert.deepEqual(resultOf(second),
      {outcome: PLACEMENT_OUTCOME.REFUSED, reason: PLACEMENT_REFUSAL.HOLD_NOT_HELD},
      'the second answer names the hold as not held');
    assert.equal(PLACEMENT_CLEARING_TRIGGER[PLACEMENT_REFUSAL.HOLD_NOT_HELD], null,
      'HOLD_NOT_HELD is a definite answer');
    assert.deepEqual(ledgerRows(leader).find((row) => row.operation_id === operationId),
      rowAfterFirst, 'the second release changes nothing: exactly one effect');
    assert.equal(readCommittedStatementOutcome(leader, 'entry:release-first').state,
      RECORD.SETTLED);
    assert.equal(readCommittedStatementOutcome(leader, 'entry:release-second').state,
      RECORD.SETTLED);
  }));

test('N1: a release attempt blocked on an entry-key collision is re-driven under a fresh ' +
  'entry; other partitions proceed; both blocked attempts are in the pass snapshot', () =>
  onLedgerLeader(async (leader, proposed) => {
    const operationId = await admitHeldLedgerMove(leader, proposed);
    const {lines, logger} = recordingLogger();
    const collisions = new Map();
    // The first release and the first admission each meet a foreign
    // committed SQL record already settled under their entry key.
    const colliding = (kind, request) => async (payload) => {
      if (!collisions.has(kind)) {
        collisions.set(kind, payload);
        assert.equal(commitLedgerStatement(leader, payload.entryId, FOREIGN_SQL,
          [...FOREIGN_PARAMS]), null);
      }
      return committing(leader, proposed, request)(payload);
    };
    const owner = createReplicaPlacementOwner({nodeId: 'n1', ledgerPartitionService: leader,
      nodeAuthority: readyNodeAuthority(), systemTableCache: shortPartitionsCache(),
      now: () => NOW_MS, logger,
      admitPlacement: colliding('admit', requestPlacementAdmission),
      releasePlacementHold: colliding('release', requestPlacementHoldRelease)});
    try {
      owner.setLeader(true);
      await idle(owner);
      // The ledger workflow dispatches (and here completes) the ledger move
      // only once its hold is lifted; until then it is incomplete and every
      // pass stops behind it.
      if (holdOf(leader, operationId) === null) {
        assert.equal(stepLedgerRow(leader, operationId, WORKFLOW_STEP.ACTIVE), null);
      } else {
        owner.notify(PLACEMENT_TRIGGER.RESYNC);
      }
      await idle(owner);
      const admittedPartitions = ledgerRows(leader)
        .filter((row) => row.type === OperationType.ADD && USER_PARTITIONS.includes(
          row.partition_id)).map((row) => row.partition_id);
      assert.equal(admittedPartitions.length, 1,
        'placement proceeds for the partition that is not blocked: ' +
        `admitted ${JSON.stringify(admittedPartitions)}`);
      const blockedRelease = collisions.get('release');
      const blockedAdmit = collisions.get('admit');
      assert.notEqual(blockedAdmit, undefined, 'an admission met its collision');
      const blockedPartition = USER_PARTITIONS.find((id) => !admittedPartitions.includes(id));
      const releaseKey = `release:${operationId}`;
      const admitKey = `admit:${blockedPartition}`;
      assert.equal(holdOf(leader, operationId), null, 'the hold was released');
      assert.equal(attemptRowOf(leader, releaseKey), null,
        'the re-driven release settled; no durable attempt remains');
      const snapshot = byAttemptKey(owner.lastPassSnapshot?.blockedAttempts);
      const redriven = snapshot[releaseKey];
      assert.equal(typeof redriven?.redrivenEntryId, 'string');
      assert.notEqual(redriven.redrivenEntryId, blockedRelease.entryId);
      assert.deepEqual(redriven, {
        state: attempts.PLACEMENT_ATTEMPT_STATE?.REDRIVEN_UNDER_FRESH_ENTRY,
        attemptKey: releaseKey, entryId: blockedRelease.entryId,
        recordClass: RECORD_CLASS.STATEMENT, redrivenEntryId: redriven.redrivenEntryId,
      }, 'the blocked release stays visible as history, naming its fresh entry');
      const fresh = readCommittedStatementOutcome(leader, `entry:${redriven.redrivenEntryId}`);
      assert.equal(JSON.parse(fresh.ownerResultText ?? 'null')?.outcome,
        PLACEMENT_OUTCOME.RELEASED, 'the fresh entry released the hold');
      assert.deepEqual(snapshot[admitKey], {
        state: attempts.PLACEMENT_ATTEMPT_STATE?.BLOCKED_ON_KEY_COLLISION,
        attemptKey: admitKey, entryId: blockedAdmit.entryId,
        recordClass: RECORD_CLASS.STATEMENT,
      }, 'the blocked admission is blocked work in the pass snapshot');
      assert.equal(attemptRowOf(leader, admitKey)?.entry_id, blockedAdmit.entryId,
        'the blocked admission stays durable: its intent has not changed');
      assert.equal(lines.warn.filter(({fields}) =>
        fields?.entryId === blockedRelease.entryId).length, 1, 'one warning per blocked entry');
      assert.equal(lines.warn.filter(({fields}) =>
        fields?.entryId === blockedAdmit.entryId).length, 1, 'one warning per blocked entry');
    } finally {
      owner.shutdown();
    }
  }));

test('F4 residue: an uncertain release whose hold another leader released retires as ' +
  'superseded by ledger state, never as its own settlement, listed once', () =>
  onLedgerLeader(async (leader, proposed) => {
    const operationId = await admitHeldLedgerMove(leader, proposed);
    const attemptKey = `release:${operationId}`;
    const lostEntryId = `placement-owner:n1:release:${operationId}:lost`;
    // Leader a proposed its release under lostEntryId; the outcome is unknown
    // and the entry never committed. Leader b then released the hold.
    const body = Object.freeze({operationId});
    attempts.persistUnresolvedPlacementAttempt(leader.db, {attemptKey,
      intentKey: operationId, entryId: lostEntryId, body, bodyText: JSON.stringify(body)});
    const other = await releaseOnLeader(leader, proposed, 'leader-b-release', operationId);
    assert.equal(resultOf(other)?.outcome, PLACEMENT_OUTCOME.RELEASED);
    const {lines, logger} = recordingLogger();
    const owner = createReplicaPlacementOwner({nodeId: 'n1', ledgerPartitionService: leader,
      nodeAuthority: unavailableNodeAuthority(), systemTableCache: shortPartitionsCache(),
      now: () => NOW_MS, logger,
      admitPlacement: committing(leader, proposed, requestPlacementAdmission),
      releasePlacementHold: committing(leader, proposed, requestPlacementHoldRelease)});
    try {
      owner.setLeader(true);
      await idle(owner);
      assert.equal(attemptRowOf(leader, attemptKey), null,
        'the release obligation is reached: the attempt retires');
      assert.equal(owner.uncertainEntryIds.has(attemptKey), false);
      assert.deepEqual(owner.lastPassSnapshot?.supersededAttempts, [{
        state: attempts.PLACEMENT_ATTEMPT_RETIREMENT?.SUPERSEDED_BY_LEDGER,
        attemptKey, entryId: lostEntryId, operationId,
      }], 'retired as its own named outcome');
      assert.equal(readCommittedStatementOutcome(leader, `entry:${lostEntryId}`).state,
        RECORD.UNSETTLED, 'its own command is not counted as applied');
      owner.notify(PLACEMENT_TRIGGER.RESYNC);
      await idle(owner);
      assert.equal(owner.lastPassSnapshot.supersededAttempts.length, 1, 'listed once');
      assert.equal(lines.info.filter(({fields}) => fields?.entryId === lostEntryId).length, 1,
        'reported once when it retires');
    } finally {
      owner.shutdown();
    }
  }));

test('F4 residue within a tenure: an uncertain release whose hold is lifted after ' +
  'leadership start retires on the next pass, with no leadership change', () =>
  onLedgerLeader(async (leader, proposed) => {
    const operationId = await admitHeldLedgerMove(leader, proposed);
    const attemptKey = `release:${operationId}`;
    const submitted = [];
    // Every proposal of this owner's release is lost before the log.
    const owner = createReplicaPlacementOwner({nodeId: 'n1', ledgerPartitionService: leader,
      nodeAuthority: unavailableNodeAuthority(), systemTableCache: shortPartitionsCache(),
      now: () => NOW_MS, logger: recordingLogger().logger,
      admitPlacement: committing(leader, proposed, requestPlacementAdmission),
      releasePlacementHold: async (payload) => {
        submitted.push(payload.entryId);
        return OUTCOME_UNKNOWN;
      }});
    const passes = recordPasses(owner);
    try {
      owner.setLeader(true);
      await idle(owner);
      const [lostEntryId] = submitted;
      assert.equal(typeof lostEntryId, 'string', 'the owner proposed its release');
      assert.equal(attemptRowOf(leader, attemptKey)?.entry_id, lostEntryId,
        'the release is uncertain and durable');
      assert.notEqual(holdOf(leader, operationId), null, 'the hold is still engaged');
      const startPasses = passes.length;
      // During this tenure the hold is lifted under another entry.
      const lifted = await releaseOnLeader(leader, proposed, 'tenure-release', operationId);
      assert.equal(resultOf(lifted)?.outcome, PLACEMENT_OUTCOME.RELEASED);
      owner.notify(PLACEMENT_TRIGGER.RESYNC);
      await idle(owner);
      assert.equal(owner.isLeader, true, 'no leadership change');
      assert.ok(passes.length > startPasses, 'a later pass ran');
      assert.deepEqual(passes.slice(startPasses).filter((triggers) =>
        triggers.includes(PLACEMENT_TRIGGER.LEADERSHIP_START)), [],
      'no later pass is a leadership start');
      assert.equal(attemptRowOf(leader, attemptKey), null,
        'the release obligation is reached: the attempt retires on the next pass');
      assert.equal(owner.uncertainEntryIds.has(attemptKey), false);
      assert.deepEqual(owner.lastPassSnapshot?.supersededAttempts, [{
        state: attempts.PLACEMENT_ATTEMPT_RETIREMENT?.SUPERSEDED_BY_LEDGER,
        attemptKey, entryId: lostEntryId, operationId,
      }], 'retired as its own named outcome');
      assert.equal(readCommittedStatementOutcome(leader, `entry:${lostEntryId}`).state,
        RECORD.UNSETTLED, 'its own command is not counted as applied');
    } finally {
      owner.shutdown();
    }
  }));

test('a re-drive survives a crash between its durable replacement and its proposal: ' +
  'the restarted owner re-drives the fresh entry, never the dead one', () =>
  onLedgerLeader(async (leader, proposed) => {
    const operationId = await admitHeldLedgerMove(leader, proposed);
    const attemptKey = `release:${operationId}`;
    const first = [];
    // Owner 1: the first release meets a foreign record; the process dies
    // before the re-driven release reaches the log.
    const owner1 = createReplicaPlacementOwner({nodeId: 'n1', ledgerPartitionService: leader,
      nodeAuthority: unavailableNodeAuthority(), systemTableCache: shortPartitionsCache(),
      now: () => NOW_MS, logger: recordingLogger().logger,
      admitPlacement: committing(leader, proposed, requestPlacementAdmission),
      releasePlacementHold: async (payload) => {
        first.push(payload.entryId);
        if (first.length === 1) {
          assert.equal(commitLedgerStatement(leader, payload.entryId, FOREIGN_SQL,
            [...FOREIGN_PARAMS]), null);
          return committing(leader, proposed, requestPlacementHoldRelease)(payload);
        }
        return OUTCOME_UNKNOWN;
      }});
    owner1.setLeader(true);
    await idle(owner1);
    owner1.shutdown();
    const [deadEntryId, freshEntryId] = first;
    assert.equal(typeof freshEntryId, 'string', 'the blocked release was re-driven');
    assert.notEqual(freshEntryId, deadEntryId);
    assert.equal(attemptRowOf(leader, attemptKey)?.entry_id, freshEntryId,
      'the durable attempt names the fresh entry before its proposal');
    assert.notEqual(holdOf(leader, operationId), null, 'the hold is still engaged');
    // Owner 2 on the same store: hydrates the fresh entry and proposes it.
    const second = [];
    const owner2 = createReplicaPlacementOwner({nodeId: 'n1', ledgerPartitionService: leader,
      nodeAuthority: unavailableNodeAuthority(), systemTableCache: shortPartitionsCache(),
      now: () => NOW_MS, logger: recordingLogger().logger,
      admitPlacement: committing(leader, proposed, requestPlacementAdmission),
      releasePlacementHold: async (payload) => {
        second.push(payload.entryId);
        return committing(leader, proposed, requestPlacementHoldRelease)(payload);
      }});
    try {
      owner2.setLeader(true);
      await idle(owner2);
      assert.deepEqual(second, [freshEntryId], 'only the fresh entry is proposed');
      assert.equal(holdOf(leader, operationId), null, 'the hold was released');
      assert.equal(attemptRowOf(leader, attemptKey), null, 'the attempt settled');
      const fresh = readCommittedStatementOutcome(leader, `entry:${freshEntryId}`);
      assert.equal(JSON.parse(fresh.ownerResultText ?? 'null')?.outcome,
        PLACEMENT_OUTCOME.RELEASED);
      assert.equal(readCommittedStatementOutcome(leader, `entry:${deadEntryId}`)
        .ownerResultText ?? null, null, 'the dead entry still holds only the foreign record');
    } finally {
      owner2.shutdown();
    }
  }));
