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
  canonicalReplaceMembershipObservation,
  validateBootstrapMembershipStamp,
} from '../../../src/raft/raft-committed-membership-stamp.js';
import {bootstrapOfRequest} from
  '../../../src/raft/raft-rs-bootstrap-membership.js';
import {deriveRaftRsPeerId} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {raftRsConfStateKey} from
  '../../../src/raft/raft-rs-conf-state-key.js';
import {readCommittedMembershipStamp} from
  '../../../src/rebalancer/committed-membership-bootstrap-read.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  '../../../src/partition/partition-replica-membership-constants.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
} from '../../../src/transport/message-router-shared-vocabulary.js';

const REPLICA_ID = 'adversarial-bootstrap-r1';
const PEER_ID = deriveRaftRsPeerId(REPLICA_ID);

function committedStamp(overrides = {}) {
  return {
    kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
    voters: [PEER_ID],
    votersOutgoing: [],
    learners: [],
    learnersNext: [],
    appliedIndex: 1,
    configurationKey: raftRsConfStateKey({voters: [PEER_ID]}),
    membershipGenerationIndex: 0,
    commitIndex: 1,
    term: 1,
    leaderId: REPLICA_ID,
    gateOpen: true,
    identities: {[PEER_ID]: REPLICA_ID},
    ...overrides,
  };
}

function replaceObservation(overrides = {}) {
  return {
    state: PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
    replicaId: REPLICA_ID,
    partitionId: 'adversarial-bootstrap-p1',
    leaderReplicaId: REPLICA_ID,
    voterReplicaIds: [REPLICA_ID],
    votersOutgoingReplicaIds: [],
    appliedIndex: 1,
    commitIndex: 1,
    term: 1,
    gateOpen: true,
    transferWindowMaxMs: 300,
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

test('distributed membership decoders reject proxies without executing traps',
  () => {
    const trapCounts = [];
    const proxied = (value) => {
      const count = {calls: 0};
      trapCounts.push(count);
      return new Proxy(value, {
        getOwnPropertyDescriptor(target, field) {
          count.calls += 1;
          return Reflect.getOwnPropertyDescriptor(target, field);
        },
        getPrototypeOf(target) {
          count.calls += 1;
          return Reflect.getPrototypeOf(target);
        },
        ownKeys(target) {
          count.calls += 1;
          return Reflect.ownKeys(target);
        },
      });
    };
    const stampCases = [
      proxied(committedStamp()),
      committedStamp({voters: proxied([PEER_ID])}),
      committedStamp({identities: proxied({[PEER_ID]: REPLICA_ID})}),
    ];
    for (const value of stampCases) {
      assertMalformed(value, 'proxied committed membership');
    }
    const observationCases = [
      proxied(replaceObservation()),
      replaceObservation({voterReplicaIds: proxied([REPLICA_ID])}),
    ];
    for (const value of observationCases) {
      assert.equal(canonicalReplaceMembershipObservation(value, {
        replicaId: REPLICA_ID,
        partitionId: 'adversarial-bootstrap-p1',
      }), null, 'proxied REPLACE observation is not authority');
    }
    assert.deepEqual(trapCounts.map(({calls}) => calls), [0, 0, 0, 0, 0],
      'rejection does not execute proxy-controlled reflection');
  });

test('distributed membership decoding is independent of mutable numeric ' +
  'intrinsics', () => {
  const original = {
    bigInt: globalThis.BigInt,
    isFinite: Number.isFinite,
    isSafeInteger: Number.isSafeInteger,
    objectIs: Object.is,
  };
  try {
    globalThis.BigInt = () => 0n;
    Number.isFinite = () => true;
    Number.isSafeInteger = () => true;
    Object.is = () => false;
    assertMalformed(committedStamp({term: Infinity}),
      'ambient intrinsics cannot authorize an infinite term');
    assert.equal(canonicalReplaceMembershipObservation(
      replaceObservation({transferWindowMaxMs: Infinity}), {
        replicaId: REPLICA_ID,
        partitionId: 'adversarial-bootstrap-p1',
      }), null, 'ambient intrinsics cannot authorize an infinite window');
  } finally {
    globalThis.BigInt = original.bigInt;
    Number.isFinite = original.isFinite;
    Number.isSafeInteger = original.isSafeInteger;
    Object.is = original.objectIs;
  }
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
      {errorCode: ROUTER_NO_CONNECTION_ERROR_CODE},
      {errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE},
      {deliveryState: 'failed'},
      {error: 'connection failed'},
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
