import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  consensusInitRefusedError,
  isConsensusInitRefusal,
  isHeldByHostFailure,
  isRaftOpeningFailure,
  withRaftOpeningCleanupFailure,
} from '../../src/raft/raft-operation-port.js';
import {
  RAFT_CONSENSUS_STARTUP_OUTCOME,
  RAFT_OPERATION_OUTCOME as OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';

// Every service kind that opens a consensus port. The refusal is one shape
// whatever the kind; the kind is its domain.
const OPENING_DOMAINS = Object.freeze([
  ENTITY_TYPE.PARTITION, ENTITY_TYPE.MESSAGE_GROUP, ENTITY_TYPE.WASM_SERVICE,
]);

test('consensus init refusal: one code and one shape for every opening domain', () => {
  const answer = Object.freeze({outcome: OUTCOME.HOST_FAILURE, phase: 'durable-record-read',
    reason: 'durable-record-unreadable', recoveryRequired: true,
    failure: {detail: {table: 'lost'}}});
  for (const domain of OPENING_DOMAINS) {
    const identity = {groupId: `${domain}-group`, replicaId: `${domain}-r1`};
    const error = consensusInitRefusedError({domain, identity, answer});
    assert.equal(error.code, RAFT_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED, domain);
    assert.equal(error.domain, domain);
    assert.deepEqual(error.identity, identity);
    assert.notEqual(error.identity, identity, 'the identity is captured, not aliased');
    assert.equal(Object.isFrozen(error.identity), true);
    assert.equal(error.consensus, answer, 'the port answer is carried exactly');
    assert.equal(Object.hasOwn(error, 'phase'), false,
      'the phase is read from the answer, never copied beside it');
    for (const text of [domain, identity.groupId, identity.replicaId, answer.phase,
      answer.outcome, answer.reason, '"lost"']) {
      assert.ok(error.message.includes(text), `${error.message} names ${text}`);
    }
    for (const other of OPENING_DOMAINS) {
      assert.equal(isConsensusInitRefusal(error, other), other === domain,
        `${domain} refusal is ${other === domain ? '' : 'not '}a ${other} refusal`);
    }
    assert.equal(consensusInitRefusedError({domain, identity, answer: undefined}).consensus,
      null, 'an absent answer is named null');
  }
  assert.equal(isConsensusInitRefusal(new Error('ordinary'), ENTITY_TYPE.PARTITION), false);
  assert.equal(isConsensusInitRefusal(null, ENTITY_TYPE.PARTITION), false);
});

test('held by host failure: only a host failure that requires recovery holds the group', () => {
  assert.equal(isHeldByHostFailure({outcome: OUTCOME.HOST_FAILURE, recoveryRequired: true}), true);
  assert.equal(isHeldByHostFailure({outcome: OUTCOME.HOST_FAILURE, recoveryRequired: false}),
    false);
  assert.equal(isHeldByHostFailure({outcome: OUTCOME.CORE_OK, recoveryRequired: true}), false);
  assert.equal(isHeldByHostFailure(null), false);
});

test('startup cleanup custody: immutable primary errors retain metadata without reclassifying ordinary failures', () => {
  const consensus = Object.freeze({outcome: OUTCOME.HOST_FAILURE, retryAfterMs: 39});
  const primary = Object.freeze(consensusInitRefusedError({domain: ENTITY_TYPE.MESSAGE_GROUP,
    identity: {groupId: 'original-group', replicaId: 'original-replica'}, answer: consensus}));
  const secondary = new Error('secondary release error');
  const result = withRaftOpeningCleanupFailure(primary, secondary);
  assert.equal(result.cause, primary);
  assert.deepEqual(result.errors, [primary, secondary]);
  assert.equal(result.message, primary.message);
  assert.equal(result.consensus, consensus);
  assert.equal(result.code, primary.code);
  assert.equal(result.domain, primary.domain);
  assert.equal(result.identity, primary.identity);
  assert.equal(isConsensusInitRefusal(result, ENTITY_TYPE.MESSAGE_GROUP), true);
  assert.equal(isRaftOpeningFailure(result), true);
  const ordinary = new Error('ordinary startup error');
  const combined = withRaftOpeningCleanupFailure(ordinary, secondary);
  assert.equal(combined.cause, ordinary);
  assert.equal(isRaftOpeningFailure(combined), false);
  assert.equal(combined.message, ordinary.message);
});
