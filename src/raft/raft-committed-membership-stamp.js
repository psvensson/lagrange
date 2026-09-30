// The committed-membership stamp (owner decision O1, committed-read
// amendment 1, section 3.2): the one serialised shape a creator puts on a new
// replica and every carrier passes unchanged to the target's port.
//
//   COMMITTED - the answer of the group leader's committed-membership read,
//     as the read answered it: {kind, voters, votersOutgoing, learners,
//     appliedIndex (j), commitIndex, term, leaderId, gateOpen, identities};
//   GENESIS - a founding set of a partition no group exists for:
//     {kind, founders} (replica identities).
//
// The two stamp origins are the creation owner's bootstrap read (COMMITTED,
// joins) and the founding provisioner (GENESIS). The target validates a stamp
// on arrival and never falls back to rows; the replica list a stamp yields is
// an address-hint list in ascending raft peer id order, never membership.

import {types as nodeUtilTypes} from 'node:util';

import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_MAX_PEERS,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from './raft-committed-membership-constants.js';
import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';
import {deepFreeze} from './raft-operation-port.js';

const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';
const ownDescriptor = Object.getOwnPropertyDescriptor;
const ownHas = Object.hasOwn;
const ownKeys = Reflect.ownKeys;
const getPrototype = Object.getPrototypeOf;
const arrayIsArray = Array.isArray;
const isProxy = nodeUtilTypes.isProxy;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const bigIntFn = globalThis.BigInt;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_PROTOTYPE = Array.prototype;
const DATA_DESCRIPTOR_VALUE = 'value';
const DECIMAL_ZERO = 48;
const DECIMAL_NINE = 57;
const MEMBERSHIP_OBSERVATION_FIELD = Object.freeze({
  STATE: 'state',
  REPLICA_ID: 'replicaId',
  PARTITION_ID: 'partitionId',
  TERM: 'term',
  COMMIT_INDEX: 'commitIndex',
  APPLIED_INDEX: 'appliedIndex',
  GATE_OPEN: 'gateOpen',
  LEADER_REPLICA_ID: 'leaderReplicaId',
  VOTER_REPLICA_IDS: 'voterReplicaIds',
  OUTGOING_REPLICA_IDS: 'votersOutgoingReplicaIds',
  TRANSFER_WINDOW_MAX_MS: 'transferWindowMaxMs',
});
const MEMBERSHIP_OBSERVATION_FIELDS = Object.freeze([
  MEMBERSHIP_OBSERVATION_FIELD.STATE,
  MEMBERSHIP_OBSERVATION_FIELD.REPLICA_ID,
  MEMBERSHIP_OBSERVATION_FIELD.PARTITION_ID,
  MEMBERSHIP_OBSERVATION_FIELD.TERM,
  MEMBERSHIP_OBSERVATION_FIELD.COMMIT_INDEX,
  MEMBERSHIP_OBSERVATION_FIELD.APPLIED_INDEX,
  MEMBERSHIP_OBSERVATION_FIELD.GATE_OPEN,
  MEMBERSHIP_OBSERVATION_FIELD.LEADER_REPLICA_ID,
  MEMBERSHIP_OBSERVATION_FIELD.VOTER_REPLICA_IDS,
  MEMBERSHIP_OBSERVATION_FIELD.OUTGOING_REPLICA_IDS,
  MEMBERSHIP_OBSERVATION_FIELD.TRANSFER_WINDOW_MAX_MS,
]);
const COMMITTED_STAMP_FIELDS = Object.freeze([
  'kind',
  'voters',
  'votersOutgoing',
  'learners',
  'appliedIndex',
  'commitIndex',
  'term',
  'leaderId',
  'gateOpen',
  'identities',
]);
const GENESIS_STAMP_FIELDS = Object.freeze(['kind', 'founders']);
const DURABLE_RECORD_FIELDS = Object.freeze(['kind']);
const REPLACE_MEMBERSHIP_STATE_VOTER = 'voter';
const REPLACE_MEMBERSHIP_STATE_ABSENT = 'absent';
const REPLACE_MEMBERSHIP_STATE_UNRESOLVED = 'unresolved';

function invalid(defect) {
  return Object.freeze({valid: false,
    reason: COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID, defect});
}

function ownDataValue(record, field) {
  if (record === null || typeof record !== TYPE_OBJECT || isProxy(record)) {
    return null;
  }
  const descriptor = ownDescriptor(record, field);
  return descriptor && ownHas(descriptor, DATA_DESCRIPTOR_VALUE) ?
    {value: descriptor.value} : null;
}

function isOrdinaryRecord(value) {
  if (value === null || typeof value !== TYPE_OBJECT || isProxy(value) ||
      arrayIsArray(value)) {
    return false;
  }
  const prototype = getPrototype(value);
  return prototype === null || prototype === OBJECT_PROTOTYPE;
}

function isExactRecord(value, fields) {
  if (!isOrdinaryRecord(value)) {
    return false;
  }
  const keys = ownKeys(value);
  if (keys.length !== fields.length) {
    return false;
  }
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (typeof keys[index] === 'symbol' || ownDataValue(value, field) === null) {
      return false;
    }
  }
  return true;
}

function isCanonicalPeerId(value) {
  if (typeof value !== TYPE_STRING || value.length === 0 ||
      value.charCodeAt(0) === DECIMAL_ZERO) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < DECIMAL_ZERO || code > DECIMAL_NINE) {
      return false;
    }
  }
  try {
    return bigIntFn(value) <= ((1n << 63n) - 1n);
  } catch {
    return false;
  }
}

function canonicalArray(value, itemIsValid) {
  if (isProxy(value) || !arrayIsArray(value) ||
      getPrototype(value) !== ARRAY_PROTOTYPE ||
      value.length > COMMITTED_MEMBERSHIP_MAX_PEERS) {
    return null;
  }
  const keys = ownKeys(value);
  if (keys.length !== value.length + 1) {
    return null;
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = ownDataValue(value, String(index));
    if (item === null || !itemIsValid(item.value)) {
      return null;
    }
    result.push(item.value);
  }
  return Object.freeze(result);
}

function hasDuplicates(values) {
  const seen = Object.create(null);
  for (let index = 0; index < values.length; index += 1) {
    const key = `${typeof values[index]}:${values[index]}`;
    if (ownHas(seen, key)) {
      return true;
    }
    seen[key] = true;
  }
  return false;
}

function isCanonicalIndex(value, {positive = false} = {}) {
  return numberIsSafeInteger(value) && !objectIs(value, -0) &&
    value >= (positive ? 1 : 0);
}

function hasBoundedExactKeyCount(keys, expected) {
  return keys.length <= COMMITTED_MEMBERSHIP_MAX_PEERS &&
    keys.length === expected;
}

function canonicalIdentities(value, peerIds) {
  if (!isOrdinaryRecord(value)) {
    return {defect: COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED};
  }
  const keys = ownKeys(value);
  if (!hasBoundedExactKeyCount(keys, peerIds.length)) {
    return {defect: COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED};
  }
  const identities = Object.create(null);
  for (let index = 0; index < peerIds.length; index += 1) {
    const peerId = peerIds[index];
    const identity = ownDataValue(value, peerId);
    if (identity === null || identity.value === null) {
      return {defect:
        COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_UNRESOLVED};
    }
    if (typeof identity.value !== TYPE_STRING || identity.value.length === 0 ||
        deriveRaftRsPeerId(identity.value) !== peerId) {
      return {defect: COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_MISMATCH};
    }
    identities[peerId] = identity.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== TYPE_STRING ||
        !ownHas(identities, keys[index])) {
      return {defect: COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED};
    }
  }
  return {identities: Object.freeze(identities)};
}

function uniquePeerIds(...sets) {
  const result = [];
  const seen = Object.create(null);
  for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
    const values = sets[setIndex];
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (!ownHas(seen, value)) {
        seen[value] = true;
        result.push(value);
      }
    }
  }
  return result;
}

function hasInvalidPeerSet(values) {
  return values === null || hasDuplicates(values);
}

function canonicalCommittedPeerSets(stamp) {
  const voters = canonicalArray(ownDataValue(stamp, 'voters').value,
    isCanonicalPeerId);
  const outgoing = canonicalArray(
    ownDataValue(stamp, 'votersOutgoing').value, isCanonicalPeerId);
  const learners = canonicalArray(ownDataValue(stamp, 'learners').value,
    isCanonicalPeerId);
  if (hasInvalidPeerSet(voters) || hasInvalidPeerSet(outgoing) ||
      hasInvalidPeerSet(learners)) {
    return null;
  }
  const peerIds = uniquePeerIds(voters, outgoing, learners);
  return {voters, outgoing, learners, peerIds,
    hasCrossRoleDuplicate: peerIds.length !==
      voters.length + outgoing.length + learners.length};
}

function isOptionalReplicaIdentity(value) {
  return value === null ||
    (typeof value === TYPE_STRING && value.length > 0);
}

function canonicalCommittedScalars(stamp) {
  const appliedIndex = ownDataValue(stamp, 'appliedIndex').value;
  const commitIndex = ownDataValue(stamp, 'commitIndex').value;
  const term = ownDataValue(stamp, 'term').value;
  const leaderId = ownDataValue(stamp, 'leaderId').value;
  const gateOpen = ownDataValue(stamp, 'gateOpen').value;
  if (!isCanonicalIndex(appliedIndex, {positive: true})) {
    return {defect: objectIs(appliedIndex, -0) ?
      COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED :
      COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_BOOTSTRAP_INDEX};
  }
  if (!isCanonicalIndex(commitIndex) || commitIndex < appliedIndex ||
      !isCanonicalIndex(term) || !isOptionalReplicaIdentity(leaderId) ||
      typeof gateOpen !== 'boolean') {
    return {defect: COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED};
  }
  return {appliedIndex, commitIndex, term, leaderId, gateOpen};
}

function leaderIdentityDefect(leaderId, voters, identities) {
  if (leaderId === null) {
    return null;
  }
  const leaderPeerId = deriveRaftRsPeerId(leaderId);
  let leaderIsVoter = false;
  for (let index = 0; index < voters.length; index += 1) {
    leaderIsVoter ||= voters[index] === leaderPeerId;
  }
  return ownHas(identities, leaderPeerId) &&
    identities[leaderPeerId] === leaderId && leaderIsVoter ?
    null : COMMITTED_MEMBERSHIP_STAMP_DEFECT.IDENTITY_MISMATCH;
}

function canonicalCommittedStamp(stamp) {
  if (!isExactRecord(stamp, COMMITTED_STAMP_FIELDS)) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED);
  }
  const peerSets = canonicalCommittedPeerSets(stamp);
  if (peerSets === null) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED);
  }
  const scalars = canonicalCommittedScalars(stamp);
  if (scalars.defect) {
    return invalid(scalars.defect);
  }
  const {voters, outgoing, learners, peerIds, hasCrossRoleDuplicate} =
    peerSets;
  const {appliedIndex, commitIndex, term, leaderId, gateOpen} = scalars;
  if (voters.length === 0) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_VOTERS);
  }
  if (outgoing.length > 0) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.JOINT);
  }
  if (hasCrossRoleDuplicate) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED);
  }
  const resolved = canonicalIdentities(
    ownDataValue(stamp, 'identities').value, peerIds);
  if (resolved.defect) {
    return invalid(resolved.defect);
  }
  const leaderDefect = leaderIdentityDefect(
    leaderId, voters, resolved.identities);
  if (leaderDefect !== null) {
    return invalid(leaderDefect);
  }
  return Object.freeze({valid: true, stamp: Object.freeze(Object.assign(
    Object.create(null), {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
      voters, votersOutgoing: outgoing, learners, appliedIndex, commitIndex,
      term, leaderId, gateOpen, identities: resolved.identities}))});
}

function canonicalGenesisStamp(stamp) {
  if (!isExactRecord(stamp, GENESIS_STAMP_FIELDS)) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED);
  }
  const founders = canonicalArray(ownDataValue(stamp, 'founders').value,
    (value) => typeof value === TYPE_STRING && value.length > 0);
  if (founders === null || hasDuplicates(founders)) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED);
  }
  if (founders.length === 0) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.NO_FOUNDERS);
  }
  return Object.freeze({valid: true, stamp: Object.freeze(Object.assign(
    Object.create(null), {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
      founders}))});
}

/**
 * Validate a dispatched stamp on arrival: COMMITTED needs a committed index
 * j > 0, a non-joint configuration with voters, and every id resolvable to
 * the replica identity it derives from; GENESIS needs founders. Anything
 * else (no stamp, an unknown kind) is invalid.
 * @param {Object|null|undefined} stamp - The dispatched stamp.
 * @return {Object} Frozen {valid: true} or {valid: false, reason:
 *   STAMP_INVALID, defect}.
 */
function validateBootstrapMembershipStamp(stamp) {
  if (stamp === null || stamp === undefined || typeof stamp !== 'object') {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MISSING);
  }
  const kind = ownDataValue(stamp, 'kind');
  if (kind === null || typeof kind.value !== TYPE_STRING) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED);
  }
  if (kind.value === COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED) {
    return canonicalCommittedStamp(stamp);
  }
  if (kind.value === COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS) {
    return canonicalGenesisStamp(stamp);
  }
  return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.UNKNOWN_KIND);
}

function validateDurableRecordBootstrap(value) {
  if (!isExactRecord(value, DURABLE_RECORD_FIELDS)) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.MALFORMED);
  }
  const kind = ownDataValue(value, 'kind').value;
  if (kind !== BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD) {
    return invalid(COMMITTED_MEMBERSHIP_STAMP_DEFECT.UNKNOWN_KIND);
  }
  return Object.freeze({valid: true, stamp: durableRecordBootstrap()});
}

function isReplaceMembershipState(value) {
  return value === REPLACE_MEMBERSHIP_STATE_VOTER ||
    value === REPLACE_MEMBERSHIP_STATE_ABSENT ||
    value === REPLACE_MEMBERSHIP_STATE_UNRESOLVED;
}

function canonicalObservationScalars(value) {
  return {
    state: ownDataValue(value, MEMBERSHIP_OBSERVATION_FIELD.STATE).value,
    replicaId:
      ownDataValue(value, MEMBERSHIP_OBSERVATION_FIELD.REPLICA_ID).value,
    partitionId:
      ownDataValue(value, MEMBERSHIP_OBSERVATION_FIELD.PARTITION_ID).value,
    leaderReplicaId: ownDataValue(
      value, MEMBERSHIP_OBSERVATION_FIELD.LEADER_REPLICA_ID).value,
    term: ownDataValue(value, MEMBERSHIP_OBSERVATION_FIELD.TERM).value,
    commitIndex:
      ownDataValue(value, MEMBERSHIP_OBSERVATION_FIELD.COMMIT_INDEX).value,
    appliedIndex:
      ownDataValue(value, MEMBERSHIP_OBSERVATION_FIELD.APPLIED_INDEX).value,
    gateOpen:
      ownDataValue(value, MEMBERSHIP_OBSERVATION_FIELD.GATE_OPEN).value,
    transferWindowMaxMs:
      ownDataValue(
        value, MEMBERSHIP_OBSERVATION_FIELD.TRANSFER_WINDOW_MAX_MS).value,
  };
}

function isNonemptyReplicaIdentity(value) {
  return typeof value === TYPE_STRING && value.length > 0;
}

function hasValidObservationScalars(observation) {
  return isReplaceMembershipState(observation.state) &&
    isNonemptyReplicaIdentity(observation.replicaId) &&
    isNonemptyReplicaIdentity(observation.partitionId) &&
    isOptionalReplicaIdentity(observation.leaderReplicaId) &&
    isCanonicalIndex(observation.term) &&
    isCanonicalIndex(observation.commitIndex) &&
    isCanonicalIndex(observation.appliedIndex) &&
    observation.appliedIndex <= observation.commitIndex &&
    typeof observation.gateOpen === 'boolean';
}

function hasValidObservationPeerSets(incoming, outgoing) {
  return incoming !== null && incoming.length > 0 && outgoing !== null &&
    !hasDuplicates(incoming) && !hasDuplicates(outgoing);
}

function hasValidTransferWindow(value) {
  return value === null || (numberIsFinite(value) && value > 0);
}

function isOptionalObservationReplicaId(value) {
  return value === null || isNonemptyReplicaIdentity(value);
}

function canonicalReplaceMembershipObservation(value, expected = {}) {
  if (!isExactRecord(value, MEMBERSHIP_OBSERVATION_FIELDS)) {
    return null;
  }
  const observation = canonicalObservationScalars(value);
  const incoming = canonicalArray(
    ownDataValue(
      value, MEMBERSHIP_OBSERVATION_FIELD.VOTER_REPLICA_IDS).value,
    isOptionalObservationReplicaId);
  const outgoing = canonicalArray(
    ownDataValue(
      value, MEMBERSHIP_OBSERVATION_FIELD.OUTGOING_REPLICA_IDS).value,
    isOptionalObservationReplicaId);
  if (!hasValidObservationScalars(observation) ||
      !isNonemptyReplicaIdentity(expected.replicaId) ||
      !isNonemptyReplicaIdentity(expected.partitionId) ||
      observation.replicaId !== expected.replicaId ||
      observation.partitionId !== expected.partitionId ||
      !hasValidObservationPeerSets(incoming, outgoing) ||
      !hasValidTransferWindow(observation.transferWindowMaxMs)) {
    return null;
  }
  return Object.freeze(Object.assign(Object.create(null), {
    ...observation,
    voterReplicaIds: incoming,
    votersOutgoingReplicaIds: outgoing,
  }));
}

/**
 * The replica identities a valid stamp names, plus the new replica itself,
 * in ascending raft peer id order: the address-hint list of the new replica
 * (never its membership - the port opens from the stamp).
 * @param {Object} stamp - A valid stamp.
 * @param {string} replicaId - The new replica.
 * @return {Array<string>} Replica identities.
 */
function replicaIdsOfStamp(stamp, replicaId) {
  const validation = validateBootstrapMembershipStamp(stamp);
  if (!validation.valid) {
    return [];
  }
  const canonical = validation.stamp;
  const named = [];
  if (canonical.kind === COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED) {
    const peerIds = uniquePeerIds(canonical.voters, canonical.learners);
    for (let index = 0; index < peerIds.length; index += 1) {
      named.push(canonical.identities[peerIds[index]]);
    }
  } else {
    for (let index = 0; index < canonical.founders.length; index += 1) {
      named.push(canonical.founders[index]);
    }
  }
  let targetNamed = false;
  for (let index = 0; index < named.length; index += 1) {
    targetNamed ||= named[index] === replicaId;
  }
  const identities = [...named];
  if (!targetNamed) {
    identities.push(replicaId);
  }
  const compareIdentity = (left, right) => {
    const leftPeer = deriveRaftRsPeerId(left);
    const rightPeer = deriveRaftRsPeerId(right);
    return leftPeer.length - rightPeer.length ||
      (leftPeer < rightPeer ? -1 : leftPeer > rightPeer ? 1 : 0);
  };
  for (let index = 1; index < identities.length; index += 1) {
    const current = identities[index];
    let position = index;
    while (position > 0 &&
        compareIdentity(identities[position - 1], current) > 0) {
      identities[position] = identities[position - 1];
      position -= 1;
    }
    identities[position] = current;
  }
  return identities;
}

/**
 * The COMMITTED stamp of a leader's committed-membership answer: the answer
 * itself, unchanged.
 * @param {Object} answer - A COMMITTED answer.
 * @return {Object|null} The stamp, or null when the answer is not COMMITTED.
 */
function committedStampOfAnswer(answer) {
  const kind = ownDataValue(answer, 'kind');
  if (kind?.value !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED) {
    return null;
  }
  const validation = validateBootstrapMembershipStamp(answer);
  return validation.valid ? validation.stamp : null;
}

/**
 * The GENESIS stamp of a founding set.
 * @param {Array<string>} founders - The founding replica identities.
 * @return {Object} Frozen {kind: GENESIS, founders}.
 */
function genesisStamp(founders) {
  return deepFreeze({kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
    founders: [...founders]});
}

/**
 * The bootstrap of a replica that must restore from its own durable record
 * and nothing else (a durable rejoin, owner decision O4): with no record the
 * port refuses it DURABLE_RECORD_MISSING instead of opening a group.
 * @return {Object} Frozen {kind: DURABLE_RECORD}.
 */
function durableRecordBootstrap() {
  return deepFreeze({kind: BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD});
}

export {
  committedStampOfAnswer,
  canonicalReplaceMembershipObservation,
  durableRecordBootstrap,
  genesisStamp,
  replicaIdsOfStamp,
  validateBootstrapMembershipStamp,
  validateDurableRecordBootstrap,
};
