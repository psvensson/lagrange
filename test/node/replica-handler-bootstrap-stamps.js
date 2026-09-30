// Committed-membership stamps for replica-handler unit tests (owner decision
// O1): every partition CREATE carries the stamp its creator produced - a
// COMMITTED answer of the group's leader for a join, a GENESIS founding set
// for a founder. A test that exercises the create lifecycle hands the handler
// the stamp a creator would have produced for its scenario; the ids are the
// derivation the port itself registers, so the target's validation accepts
// them.

import {
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const DEFAULT_COMMITTED_INDEX = 7;

/**
 * The COMMITTED stamp of a group whose committed voters are `members`.
 * @param {Array<string>} members - Replica identities of the voters.
 * @param {Object} [options] - {appliedIndex, learners}.
 * @return {Object} The stamp.
 */
function committedStampFor(members, {appliedIndex = DEFAULT_COMMITTED_INDEX,
  learners = []} = {}) {
  const identities = {};
  for (const member of [...members, ...learners]) {
    identities[deriveRaftRsPeerId(member)] = member;
  }
  return {
    kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
    voters: members.map(deriveRaftRsPeerId),
    votersOutgoing: [],
    learners: learners.map(deriveRaftRsPeerId),
    appliedIndex,
    commitIndex: appliedIndex,
    term: 1,
    leaderId: members[0] ?? null,
    gateOpen: true,
    identities,
  };
}

/**
 * The GENESIS stamp of a founding set.
 * @param {Array<string>} founders - Replica identities.
 * @return {Object} The stamp.
 */
function genesisStampFor(founders) {
  return {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
    founders: [...founders]};
}

/**
 * A CREATE request with its stamp.
 * @param {Object} request - The request fields.
 * @param {Object} stamp - The stamp.
 * @return {Object} The request carrying the stamp.
 */
function withBootstrapStamp(request, stamp) {
  return {...request, [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: stamp};
}

/**
 * The stamp a lifecycle scenario's creator would have produced: a join of
 * the group whose leader the scenario's cache records (COMMITTED over its
 * active rows), or - no leader recorded - a founding of the cohort its rows
 * and the target make up (GENESIS). Only for tests whose subject is the
 * create lifecycle; membership tests hand their stamps explicitly.
 * @param {Object} cache - The scenario's SystemTableCache.
 * @param {Object} request - The CREATE request.
 * @return {Object} The request, with the scenario's stamp when it has none.
 */
function withScenarioStamp(cache, request) {
  if (!request || Object.hasOwn(request,
    ReplicaOperationField.BOOTSTRAP_MEMBERSHIP)) {
    return request;
  }
  const partitionId = request[ReplicaOperationField.PARTITION_ID];
  const replicaId = request[ReplicaOperationField.REPLICA_ID];
  const rows = typeof cache?.filter === 'function' ? cache.filter(
    SYSTEM_TABLE_NAME.SERVICES, (row) => row.partition_id === partitionId) :
    [];
  const idOf = (row) => row.service_id || row.replica_id;
  const led = rows.some((row) => row.raft_role === RAFT_ROLE.LEADER &&
    row.status === ReplicaStatus.ACTIVE && idOf(row) !== replicaId);
  const members = rows.filter((row) => idOf(row) !== replicaId &&
    row.status === ReplicaStatus.ACTIVE).map(idOf);
  return withBootstrapStamp(request, led ? committedStampFor(members) :
    genesisStampFor([...new Set([...rows.map(idOf), replicaId])]));
}

/**
 * A ReplicaHandler whose creates carry their scenario's stamp (see
 * withScenarioStamp) when the test hands none.
 * @param {Function} ReplicaHandler - The production class.
 * @return {Function} The subclass.
 */
function scenarioStampingReplicaHandler(ReplicaHandler) {
  return class ScenarioStampingReplicaHandler extends ReplicaHandler {
    handleCreateReplica(request) {
      return super.handleCreateReplica(
        withScenarioStamp(this.systemTableCache, request));
    }

    // A scenario that drives the asynchronous create directly.
    createReplicaAsync(request) {
      if (request?.bootstrapMembership) {
        return super.createReplicaAsync(request);
      }
      const stamped = withScenarioStamp(this.systemTableCache, {
        [ReplicaOperationField.PARTITION_ID]: request?.partitionId,
        [ReplicaOperationField.REPLICA_ID]: request?.replicaId,
      });
      return super.createReplicaAsync({...request, bootstrapMembership:
        stamped[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]});
    }
  };
}

export {
  committedStampFor,
  genesisStampFor,
  scenarioStampingReplicaHandler,
  withBootstrapStamp,
};
