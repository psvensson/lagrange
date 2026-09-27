/**
 * Adversarial trust-boundary matrix for committed-membership bootstrap data.
 * A distributed stamp is decoded once from own data and consumers use only
 * that snapshot; JavaScript object behaviour is never authority.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {
  validateBootstrapMembershipStamp,
} from '../../../src/raft/raft-committed-membership-stamp.js';
import {bootstrapOfRequest} from
  '../../../src/raft/raft-rs-bootstrap-membership.js';
import {deriveRaftRsPeerId} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {readCommittedMembershipStamp} from
  '../../../src/rebalancer/committed-membership-bootstrap-read.js';

const REPLICA_ID = 'adversarial-bootstrap-r1';
const PEER_ID = deriveRaftRsPeerId(REPLICA_ID);

function committedStamp(overrides = {}) {
  return {
    kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
    voters: [PEER_ID],
    votersOutgoing: [],
    learners: [],
    appliedIndex: 1,
    commitIndex: 1,
    term: 1,
    leaderId: REPLICA_ID,
    gateOpen: true,
    identities: {[PEER_ID]: REPLICA_ID},
    ...overrides,
  };
}

function assertMalformed(value, label) {
  const result = validateBootstrapMembershipStamp(value);
  assert.equal(result.valid, false, `${label}: refused`);
  assert.equal(result.defect, COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED,
    `${label}: one malformed-shape class`);
}

test('bootstrap decoder rejects inherited/accessor/exotic shapes without ' +
  'executing caller code', () => {
  assertMalformed(Object.create(committedStamp()), 'inherited stamp');

  let getterCalls = 0;
  const accessor = committedStamp();
  Object.defineProperty(accessor, 'kind', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED;
    },
  });
  assertMalformed(accessor, 'accessor stamp');
  assert.equal(getterCalls, 0, 'validation does not invoke an accessor');

  const iteratorArray = [Object(PEER_ID)];
  iteratorArray[Symbol.iterator] = function* iterator() {
    yield PEER_ID;
  };
  assertMalformed(committedStamp({voters: iteratorArray}),
    'custom iterator and boxed indexed value');

  const forgedEvery = [Object(REPLICA_ID)];
  forgedEvery.every = () => true;
  assertMalformed({kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
    founders: forgedEvery}, 'caller-controlled array method');
});

test('bootstrap decoder rejects non-canonical numerics, peer arrays and ' +
  'durable-record lookalikes as one class', () => {
  for (const [label, value] of [
    ['NaN term', committedStamp({term: NaN})],
    ['infinite commit', committedStamp({commitIndex: Infinity})],
    ['negative-zero applied', committedStamp({appliedIndex: -0})],
    ['coercing peer id', committedStamp({voters: [{toString: () => PEER_ID}]})],
    ['duplicate peer id', committedStamp({voters: [PEER_ID, PEER_ID]})],
    ['peer in voter and learner sets', committedStamp({learners: [PEER_ID]})],
    ['oversized peer set', committedStamp({
      voters: Array.from({length: 1025}, () => PEER_ID),
    })],
  ]) {
    assertMalformed(value, label);
  }

  assert.throws(() => bootstrapOfRequest({
    membership: Object.create({
      kind: BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD,
    }),
    registry: {registerReplica: () => PEER_ID},
    peerId: PEER_ID,
  }), (error) =>
    error?.defect === COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED,
  'only the canonical own-data durable-record token can select restoration');
});

test('bootstrap consumers use the canonical snapshot returned by validation',
  () => {
    const stamp = committedStamp();
    const validation = validateBootstrapMembershipStamp(stamp);
    assert.equal(validation.valid, true);
    assert.notEqual(validation.stamp, stamp, 'caller object is not retained');
    stamp.voters[0] = deriveRaftRsPeerId('mutated-after-validation');
    assert.deepEqual(validation.stamp.voters, [PEER_ID],
      'the decoded membership is immutable caller-independent data');
  });

test('bootstrap reads require semantic delivery even when the router ACKs ' +
  'before finding a handler', async () => {
  const owner = {
    nodeId: 'bootstrap-reader-node',
    systemTableCache: {get: () => null},
    messageRouter: {deliver: async () => ({
      acknowledged: true,
      noHandler: true,
      deferRetry: true,
      retryAfterMs: 275,
      status: 'completed',
      membership: committedStamp(),
    })},
  };
  await assert.rejects(
    readCommittedMembershipStamp(owner, 'adversarial-bootstrap-p1'),
    (error) => error?.code ===
        COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE &&
      error.deferRetry === true && error.retryAfterMs === 275,
    'ACK plus no-handler is unreadable and retains the retry contract',
  );
});

test('bootstrap reads reject ACKs carrying contradictory transport failure',
  async () => {
    for (const conflict of [
      {deferRetry: true, retryAfterMs: 25},
      {errorCode: 'ROUTER_CONNECTION_CLOSED'},
      {deliveryState: 'failed'},
    ]) {
      const owner = {
        nodeId: 'bootstrap-reader-node',
        systemTableCache: {get: () => null},
        messageRouter: {deliver: async () => ({
          acknowledged: true,
          status: 'completed',
          membership: committedStamp(),
          ...conflict,
        })},
      };
      await assert.rejects(
        readCommittedMembershipStamp(owner, 'adversarial-bootstrap-p1'),
        (error) => error?.code ===
          COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE,
        'contradictory ACK never exposes the application membership',
      );
    }
  });
