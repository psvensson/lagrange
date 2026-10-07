// The committed-membership read in the rebalancer fixture world (owner
// decision O1): a coordinator stamps every partition join with the committed
// configuration its leader answers (READ_COMMITTED_MEMBERSHIP). Fixture
// routers answer that read from the fixture's services rows - every replica
// of the partition that the fixture has not removed or deleted is a
// committed voter, the way the fixture world's committed configuration has
// always been modelled (a row leaves the configuration only when it is
// REMOVED or deleted). A test whose subject is the committed-membership
// contract itself uses the real chain
// (test/raft/raft-rs-backend/committed-membership-harness.js) instead.

import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const FIXTURE_COMMITTED_INDEX = 1;
const FIXTURE_TERM = 1;
const FIXTURE_UNNAMED_VOTER_PREFIX = 'fixture-committed-voter-';

function committedRows(cache, partitionId) {
  if (typeof cache?.filter !== 'function') {
    return [];
  }
  return (cache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) =>
    row?.partition_id === partitionId &&
    String(row?.status || '').toLowerCase() !== ReplicaStatus.REMOVED) ||
    []);
}

/**
 * The fixture's answer to one READ_COMMITTED_MEMBERSHIP request.
 * @param {Object} cache - The fixture's system table cache.
 * @param {string} partitionId - The partition asked about.
 * @return {Object} The COMMITTED answer.
 */
function fixtureCommittedMembershipAnswer(cache, partitionId) {
  const identities = {};
  for (const row of committedRows(cache, partitionId)) {
    const replicaId = row.replica_id || row.service_id;
    if (typeof replicaId === 'string' && replicaId.length > 0) {
      identities[deriveRaftRsPeerId(replicaId)] = replicaId;
    }
  }
  if (Object.keys(identities).length === 0) {
    // A fixture that holds no rows for the partition still stands for a live
    // group: one committed voter the fixture never names.
    const unnamed = `${FIXTURE_UNNAMED_VOTER_PREFIX}${partitionId}`;
    identities[deriveRaftRsPeerId(unnamed)] = unnamed;
  }
  const voters = Object.keys(identities);
  const confState = {voters, votersOutgoing: [], learners: [],
    learnersNext: []};
  return {
    kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
    ...confState,
    appliedIndex: FIXTURE_COMMITTED_INDEX,
    configurationKey: raftRsConfStateKey(confState),
    membershipGenerationIndex: FIXTURE_COMMITTED_INDEX,
    commitIndex: FIXTURE_COMMITTED_INDEX,
    term: FIXTURE_TERM,
    leaderId: Object.values(identities)[0],
    gateOpen: true,
    identities,
  };
}

/**
 * The fixture router's response to a READ_COMMITTED_MEMBERSHIP message, or
 * undefined for any other message.
 * @param {Object} cache - The fixture's cache.
 * @param {Object} payload - The delivered request.
 * @return {Object|undefined}
 */
function answerFixtureCommittedMembership(cache, payload) {
  if (payload?.[ReplicaOperationField.TYPE] !==
      ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP) {
    return undefined;
  }
  return {
    acknowledged: true,
    noHandler: false,
    deliveryState: 'delivered',
    deferRetry: false,
    errorCode: null,
    retryAfterMs: null,
    status: ReplicaOperationResponseStatus.COMPLETED,
    [ReplicaOperationField.MEMBERSHIP]: fixtureCommittedMembershipAnswer(
      cache, payload[ReplicaOperationField.PARTITION_ID]),
  };
}

const FIXTURE_WRAPPED = Symbol('fixture committed-membership router');

/**
 * A router whose committed-membership reads the fixture world answers. The
 * wrap is sticky: a test that later assigns its own `deliver` still has the
 * read answered by the fixture, and every other message reaches the test's
 * own deliver.
 * @param {Object} router - The test's router.
 * @param {Object} cache - The fixture's cache.
 * @return {Object} The same router.
 */
function withFixtureCommittedMembership(router, cache) {
  if (!router || typeof router.deliver !== 'function' ||
      router[FIXTURE_WRAPPED] === true) {
    return router;
  }
  // Every deliver ever assigned, oldest first. A witness that wraps "the
  // original deliver" reads this accessor and gets the wrapper back, so a
  // nested call through it reaches the next older assignment, never itself.
  const assigned = [router.deliver.bind(router)];
  let depth = 0;
  const wrapped = (target, payload, options) => {
    const answer = answerFixtureCommittedMembership(cache, payload);
    if (answer !== undefined) {
      return Promise.resolve(answer);
    }
    const level = Math.min(depth, assigned.length - 1);
    depth += 1;
    try {
      return assigned[assigned.length - 1 - level](target, payload, options);
    } finally {
      depth -= 1;
    }
  };
  Object.defineProperty(router, FIXTURE_WRAPPED, {value: true});
  Object.defineProperty(router, 'deliver', {
    configurable: true,
    enumerable: true,
    get: () => wrapped,
    set: (deliver) => {
      assigned.push(deliver);
    },
  });
  return router;
}

/**
 * A coordinator class whose router answers committed-membership reads from
 * the fixture world (its own cache), for suites that construct coordinators
 * with ad-hoc routers.
 * @param {Function} RebalanceCoordinator - The production class.
 * @return {Function} The subclass.
 */
function fixtureCommittedReadCoordinator(RebalanceCoordinator) {
  return class FixtureCommittedReadCoordinator extends RebalanceCoordinator {
    constructor(options) {
      super(options);
      withFixtureCommittedMembership(this.messageRouter,
        this.systemTableCache);
    }
  };
}

export {
  answerFixtureCommittedMembership,
  fixtureCommittedReadCoordinator,
  withFixtureCommittedMembership,
};
