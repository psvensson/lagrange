// Cross-boundary witness of the committed-statement outcome owner's command
// identity (registered coupled pairs: outcome owner <-> placement admission,
// outcome owner <-> formation transition command; test/shards/impact-contracts.json).
//
// It spans the real producer, the persistence boundary and both consumers:
// - producer: the owner's committed apply writes its outcome row through the
//   outcome owner's recorder (with command_digest) into a file-backed store;
// - persistence boundary: the same store reopened by a new PartitionService,
//   and the state-machine image the snapshot owner seals from it (a backup
//   scrubbed by the checkpoint producer's own scrubRaftRsCheckpointPayload)
//   opened as a replica store - both through the one store-open step
//   (partition-service-raft-init-base.js), which a snapshot install's
//   replacement service also passes;
// - consumers: placement replay and formation replay, at request and at apply.
// After every boundary the exact command answers its ORIGINAL receipt and
// replays without effect; a different command under the same entry key is the
// owner's collision at request and fails the application closed at apply.
// The checkpoint watermark gate, descriptor and install marker/swap protocol
// are not exercised here: the controllable consensus port keeps no raft-rs
// checkpoint boundary (createSqliteStateMachineCheckpoint answers
// apply_watermark_divergence); they are owned by
// test/raft/raft-rs-backend/partition-snapshot-compaction-catchup.test.js.
//
// REAL: PartitionService initialization and committed apply, the placement
// and formation owners, the outcome owner, the checkpoint producer. DOUBLE:
// the consensus port (the test commits the leader's proposals).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {CONTROL_PLANE_PUBLICATIONS_SCHEMA, REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {FORMATION_REFUSAL_REASON, buildFormationDeclareBody, requestFormationDeclare} from
  '../../src/control-plane/membership-publication-formation-record.js';
import {buildFormationTransitionCommand} from
  '../../src/control-plane/membership-publication-formation-transition-command.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PLACEMENT_ADMISSION_ERROR, PLACEMENT_ADMIT_TYPE, PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {buildPlacementCommand} from
  '../../src/partition/partition-placement-admission-command.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {scrubRaftRsCheckpointPayload} from '../../src/raft/snapshot-application-content.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  shutdownAll, startLeader, temporaryDbPath, track} from
  '../test-helpers/participant-transaction-fixture.js';
import {LEDGER_PARTITION_ID, NODE, admitOnLeader, ledgerRows, placementStatement} from
  './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PUBLICATIONS_PARTITION_ID = 'control_plane_publications-p1';
const FORMATION_RESULT_FIELD = 'formationResult';
const receiptOf = (answer, resultField) => Object.fromEntries(['success', 'partitionId',
  resultField, 'committed', 'logIndex', 'term'].map((field) => [field, answer?.[field]]));

const PLACEMENT = Object.freeze({
  partitionId: LEDGER_PARTITION_ID,
  options: {tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, schema: REPLICA_OPERATIONS_SCHEMA},
  resultField: PLACEMENT_RESULT_FIELD,
  collision: PLACEMENT_ADMISSION_ERROR.BYTES,
  entryId: 'boundary-placement-e0',
  body: placementStatement({partitionId: 'tables-p1', target: NODE.B}),
  nearBody: placementStatement({partitionId: 'tables-p1', target: NODE.C}),
  async settle(leader, proposed) {
    return (await admitOnLeader(leader, proposed, this.entryId, this.body)).answer;
  },
  request: (leader, entryId, body) => requestPlacementAdmission(leader, {entryId, body}),
  build: (leader, entryId, body) => buildPlacementCommand(leader,
    {type: PLACEMENT_ADMIT_TYPE, entryId, body}),
  stateOf: (leader) => ledgerRows(leader),
});

const declareOf = (declaredHostCount) => Object.freeze({clusterId: 'cluster-boundary',
  declaredHostCount, declaredByNodeId: 'seed-node', declaredAt: 1000});
const FORMATION = Object.freeze({
  partitionId: PUBLICATIONS_PARTITION_ID,
  options: {tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    schema: CONTROL_PLANE_PUBLICATIONS_SCHEMA},
  resultField: FORMATION_RESULT_FIELD,
  collision: FORMATION_REFUSAL_REASON.INVALID_COMMAND,
  entryId: 'boundary-formation-e0',
  body: declareOf(1),
  nearBody: declareOf(3),
  async settle(leader, proposed) {
    const pending = track(requestFormationDeclare(leader, {entryId: this.entryId,
      body: this.body}));
    const command = await awaitProposal(proposed, (entry) => entry.entryId === this.entryId);
    assert.ok(command);
    assert.equal(applyCommitted(leader, command), null);
    return pending.promise;
  },
  request: (leader, entryId, body) => requestFormationDeclare(leader, {entryId, body}),
  build: (leader, entryId, body) => buildFormationTransitionCommand(leader,
    {entryId, body: buildFormationDeclareBody(body)}),
  stateOf: (leader) => leader.db.prepare(
    `SELECT * FROM ${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS} ORDER BY 1`).all(),
});

// The consumer's exact replay on a store reached through the store-open step.
async function assertExactReplay(owner, leader, proposed, original) {
  const record = readCommittedStatementOutcome(leader,
    leader.getCommittedEntryKey({entryId: owner.entryId}));
  assert.equal(record.state, 'settled', 'the boundary kept the record');
  assert.equal(typeof record.commandDigest, 'string', 'the boundary kept its identity');
  assert.equal(record.lastInsertRowid, null, 'last_insert_rowid is no owner identity');
  const stateBefore = owner.stateOf(leader);
  const proposals = proposed.length;
  const replay = await owner.request(leader, owner.entryId, owner.body);
  assert.deepEqual(receiptOf(replay, owner.resultField), receiptOf(original, owner.resultField),
    'the exact command answers its original receipt');
  const nearMiss = await owner.request(leader, owner.entryId, owner.nearBody);
  assert.equal(nearMiss.failureCode, owner.collision,
    'a different command under the entry key is never settled by its record');
  assert.equal(proposed.length, proposals, 'nothing is proposed');
  // The exact committed duplicate first: a failed-closed apply stops the group.
  assert.equal(applyCommitted(leader, owner.build(leader, owner.entryId, owner.body)), null,
    'the committed exact command replays');
  const collided = owner.build(leader, owner.entryId, owner.nearBody);
  assert.ok(collided, 'the near-miss command is a valid pinned command');
  assert.equal(applyCommitted(leader, collided), owner.collision,
    'a committed near miss fails the application closed');
  assert.deepEqual(owner.stateOf(leader), stateBefore, 'no replay or near miss has an effect');
}

async function onStore(owner, dbPath, measure) {
  const {leader, proposed} = await startLeader({...owner.options, dbPath}, owner.partitionId);
  try {
    return await measure(leader, proposed);
  } finally {
    await shutdownAll(leader);
  }
}

for (const owner of [PLACEMENT, FORMATION]) {
  test(`${owner.partitionId}: the recorded identity survives store reopen and the checkpoint ` +
    'image, and settles only the exact command', async () => {
    const {directory, dbPath} = temporaryDbPath();
    const imagePath = path.join(directory, 'image', 'partition.db');
    try {
      const original = await onStore(owner, dbPath, async (leader, proposed) => {
        const answer = await owner.settle(leader, proposed);
        assert.equal(answer.success, true);
        return answer;
      });
      await onStore(owner, dbPath, async (leader, proposed) => {
        fs.mkdirSync(path.dirname(imagePath), {recursive: true});
        await leader.db.backup(imagePath);
        const image = new Database(imagePath);
        try {
          scrubRaftRsCheckpointPayload(image, ENTITY_TYPE.PARTITION);
        } finally {
          image.close();
        }
        await assertExactReplay(owner, leader, proposed, original);
      });
      await onStore(owner, imagePath, (leader, proposed) =>
        assertExactReplay(owner, leader, proposed, original));
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
}
