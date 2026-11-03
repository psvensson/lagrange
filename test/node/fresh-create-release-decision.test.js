// Quest fresh-create-release-authority-from-committed-operation: one witness per
// condition of the answering leader's decision (verifier finding B2), each
// isolating it against an otherwise authorizing committed founding row. The
// real authorization owner; the create-admission owner's read is the seam.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createParticipantReleaseAuthorizationOwner} from
  '../../src/node/participant-release-authorization-owner.js';
import {CREATE_ADMISSION_ERROR_CODE} from '../../src/node/replica-create-admission-owner.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {OPERATION_METADATA_KEY} from '../../src/rebalancer/replica-status.js';

const PARTITION = 'tbl-decision-p1';
const LEADER = {partitionId: PARTITION, replicaId: 'founder-a',
  memberIds: ['founder-a', 'founder-b']};
const GENESIS_STEP = {[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]:
  genesisStamp(['founder-a', 'founder-b'], {'founder-a': 'n1', 'founder-b': 'n2'})};
const IDENTITY = Object.freeze({operationId: 'op-b', replicaId: 'founder-b',
  partitionId: PARTITION, targetNodeId: 'n2', admissionToken: 'admission-b',
  attemptToken: 'attempt-b', attemptSeq: 2, replicaCreatedAt: 1000});

function row(overrides = {}) {
  return {operation_id: 'op-b', type: 'ADD', entity_type: 'partition',
    partition_id: PARTITION, replica_id: 'founder-b', target_node_id: 'n2',
    status: 'syncing', workflow_step: 'SYNCING', completed_at: null,
    create_admission_state: 'MATERIALIZED', create_admission_token: 'admission-b',
    create_admission_attempt_token: 'attempt-b', create_admission_attempt_seq: 2,
    create_admission_replica_created_at: 1000,
    steps_history: JSON.stringify([GENESIS_STEP]), ...overrides};
}

function decide(answer, {identity = IDENTITY, leader = LEADER} = {}) {
  const owner = createParticipantReleaseAuthorizationOwner({
    getReplicaCreateAdmissionOwner: () => ({async readOperation() {
      if (answer instanceof Error) throw answer;
      return answer;
    }})});
  return owner.decideFreshCreateRelease(
    {partitionId: PARTITION, createAdmissionIdentity: identity}, leader);
}

async function refusedWith(reason, answer, options) {
  const refusal = await decide(answer, options);
  assert.equal(refusal?.outcome, OUTCOME.OPERATOR_REQUIRED, JSON.stringify(refusal));
  assert.equal(refusal.missingFact, 'fresh_storage_or_operator_authority');
  assert.equal(refusal.reason, reason);
  assert.equal(refusal.retryAfterMs, undefined, 'a refusal is not retried');
}

test('the committed founding row authorizes', async () => {
  assert.equal(await decide(row()), null);
  assert.equal(await decide(row({create_admission_state: 'ACTIVE'})), null);
});

test('(a) every identity field is compared against the row', async () => {
  for (const [field, value] of Object.entries({operationId: 'op-other',
    replicaId: 'founder-z', partitionId: 'other-p1', targetNodeId: 'n9',
    admissionToken: 'stale', attemptToken: 'stale', attemptSeq: 1,
    replicaCreatedAt: 999})) {
    await refusedWith('create_operation_identity_mismatch', row(),
      {identity: {...IDENTITY, [field]: value}});
  }
  await refusedWith('create_operation_identity_mismatch', row(),
    {identity: {...IDENTITY, attemptSeq: undefined}});
});

test('(a) a missing row refuses; an unreadable one refuses typed', async () => {
  await refusedWith('create_operation_absent', null);
  await refusedWith('create_operation_unreadable', new Error('boom'));
});

test('(b) the row must be a partition ADD of the leader\'s partition', async () => {
  await refusedWith('create_operation_not_partition_add', row(),
    {leader: {...LEADER, partitionId: 'other-p1'}});
  await refusedWith('create_operation_not_partition_add', row({type: 'REMOVE'}));
  await refusedWith('create_operation_not_partition_add', row({type: 'REPLACE'}));
  await refusedWith('create_operation_not_partition_add',
    row({entity_type: 'message_group'}));
});

test('(c) only an open admission authorizes', async () => {
  for (const state of ['ADMITTED', 'ROTATING', 'FAILED', 'CLOSED', null]) {
    await refusedWith('create_operation_not_open',
      row({create_admission_state: state}));
  }
  await refusedWith('create_operation_not_open', row({completed_at: 5}));
  await refusedWith('create_operation_not_open', row({status: 'failed'}));
  await refusedWith('create_operation_not_open', row({workflow_step: 'FAILED'}));
});

test('(d) the FIRST step carries a GENESIS stamp', async () => {
  const committed = {[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: {kind: 'committed'}};
  await refusedWith('create_operation_not_genesis_founding',
    row({steps_history: JSON.stringify([committed])}));
  await refusedWith('create_operation_not_genesis_founding',
    row({steps_history: JSON.stringify([{}, GENESIS_STEP])}));
  await refusedWith('create_operation_not_genesis_founding',
    row({steps_history: JSON.stringify([])}));
  await refusedWith('create_operation_not_genesis_founding',
    row({steps_history: 'not json'}));
});

test('(d) the leader must be a committed member, not a named founder', async () => {
  assert.equal(await decide(row(), {leader: {partitionId: PARTITION,
    replicaId: 'replacement', memberIds: ['replacement', 'founder-b']}}), null,
  'a replaced founder leading the group releases');
  // A leader committing its own removal steps down: transient, never terminal.
  const answer = await decide(row(), {leader: {partitionId: PARTITION,
    replicaId: 'founder-a', memberIds: ['founder-b']}});
  assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(answer.reason, 'create_operation_leader_not_member');
  assert.ok(Number.isSafeInteger(answer.retryAfterMs));
});

test('a refused read is the typed unavailability, with its cause', async () => {
  const deferred = Object.assign(new Error('deferred'), {
    code: CREATE_ADMISSION_ERROR_CODE.DEFERRED, authorityOutcome: 'owner_not_ready',
    authorityError: 'filtered'});
  const answer = await decide(deferred);
  assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
  assert.equal(answer.missingFact, 'create_admission_authority');
  assert.ok(Number.isSafeInteger(answer.retryAfterMs));
  assert.equal(answer.authorityOutcome, 'owner_not_ready');
  assert.equal(answer.authorityError, 'filtered');
});
