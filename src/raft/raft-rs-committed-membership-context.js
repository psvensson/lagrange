import {types as nodeUtilTypes} from 'node:util';

import {
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
} from './raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from './raft-rs-ready-loop-constants.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';

const CONTEXT_ENCODING = 'base64';
const ABSENT_CONTEXT = Object.freeze({kind: 'absent'});
const CONTEXT_TEXT_ENCODING = 'utf8';
const CONTEXT_FIELD = Object.freeze({
  OPERATION_ID: 'operationId',
  TRANSITION_IDENTITY: 'transitionIdentity',
  PERMIT_SEQUENCE: 'permitSequence',
  STAGE: 'stage',
  REPLICA_IDENTITY: 'replicaIdentity',
  PEER_ID: 'peerId',
});
const MANAGED_CONTEXT_KEYS = Object.freeze(Object.values(CONTEXT_FIELD));
const STAGE_CHANGE_TYPE = Object.freeze({
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER]:
    RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE]:
    RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE]:
    RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
});
const COMMITTED_MEMBERSHIP_CONTEXT_ERROR = Object.freeze({
  MALFORMED: 'malformed committed membership context',
  STAGE: 'committed membership context stage is not managed',
  CHANGE: 'committed membership context contradicts native change',
  BINDING: 'committed membership context contradicts derived identity',
});

function ownString(record, key) {
  return Object.hasOwn(record, key) && typeof record[key] === 'string' &&
    record[key].length > 0;
}

function exactlyManagedContext(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return false;
  }
  const keys = Object.keys(record);
  return keys.length === MANAGED_CONTEXT_KEYS.length &&
    MANAGED_CONTEXT_KEYS.every((key) => keys.includes(key));
}

function parseContext(decoded) {
  if (decoded?.context === undefined || decoded.context === null ||
      decoded.context === '') {
    return ABSENT_CONTEXT;
  }
  if (typeof decoded.context !== 'string') {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.MALFORMED);
  }
  try {
    return JSON.parse(Buffer.from(decoded.context, CONTEXT_ENCODING)
      .toString(CONTEXT_TEXT_ENCODING));
  } catch (error) {
    throw Object.assign(
      new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.MALFORMED),
      {cause: error});
  }
}

function validateContextShape(context) {
  if (!exactlyManagedContext(context) ||
      !ownString(context, CONTEXT_FIELD.OPERATION_ID) ||
      !ownString(context, CONTEXT_FIELD.TRANSITION_IDENTITY) ||
      !Number.isSafeInteger(context[CONTEXT_FIELD.PERMIT_SEQUENCE]) ||
      context[CONTEXT_FIELD.PERMIT_SEQUENCE] < 1 ||
      !ownString(context, CONTEXT_FIELD.STAGE) ||
      !ownString(context, CONTEXT_FIELD.REPLICA_IDENTITY) ||
      !ownString(context, CONTEXT_FIELD.PEER_ID)) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.MALFORMED);
  }
  if (!Object.hasOwn(STAGE_CHANGE_TYPE, context[CONTEXT_FIELD.STAGE])) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.STAGE);
  }
}

function validateNativeChange(decoded, context) {
  const changes = decoded?.changes;
  if (!Array.isArray(changes) || changes.length !== 1) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.CHANGE);
  }
  const [change] = changes;
  if (String(change?.nodeId) !== context[CONTEXT_FIELD.PEER_ID] ||
      change?.changeType !==
        STAGE_CHANGE_TYPE[context[CONTEXT_FIELD.STAGE]]) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.CHANGE);
  }
}


function committedMembershipChangeType(stage) {
  if (!Object.hasOwn(STAGE_CHANGE_TYPE, stage)) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.STAGE);
  }
  return STAGE_CHANGE_TYPE[stage];
}

function encodeCommittedMembershipContext(context) {
  validateContextShape(context);
  const derived = deriveRaftRsPeerId(context[CONTEXT_FIELD.REPLICA_IDENTITY]);
  if (context[CONTEXT_FIELD.PEER_ID] !== derived) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.BINDING);
  }
  return Buffer.from(JSON.stringify({
    [CONTEXT_FIELD.OPERATION_ID]: context[CONTEXT_FIELD.OPERATION_ID],
    [CONTEXT_FIELD.TRANSITION_IDENTITY]:
      context[CONTEXT_FIELD.TRANSITION_IDENTITY],
    [CONTEXT_FIELD.PERMIT_SEQUENCE]:
      context[CONTEXT_FIELD.PERMIT_SEQUENCE],
    [CONTEXT_FIELD.STAGE]: context[CONTEXT_FIELD.STAGE],
    [CONTEXT_FIELD.REPLICA_IDENTITY]:
      context[CONTEXT_FIELD.REPLICA_IDENTITY],
    [CONTEXT_FIELD.PEER_ID]: context[CONTEXT_FIELD.PEER_ID],
  })).toString(CONTEXT_ENCODING);
}

function committedMembershipContext(decoded) {
  const context = parseContext(decoded);
  if (context === ABSENT_CONTEXT) {
    return null;
  }
  validateContextShape(context);
  validateNativeChange(decoded, context);
  const derived = deriveRaftRsPeerId(
    context[CONTEXT_FIELD.REPLICA_IDENTITY]);
  if (context[CONTEXT_FIELD.PEER_ID] !== derived) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.BINDING);
  }
  return Object.freeze({
    operationId: context[CONTEXT_FIELD.OPERATION_ID],
    transitionIdentity: context[CONTEXT_FIELD.TRANSITION_IDENTITY],
    permitSequence: context[CONTEXT_FIELD.PERMIT_SEQUENCE],
    stage: context[CONTEXT_FIELD.STAGE],
    replicaIdentity: context[CONTEXT_FIELD.REPLICA_IDENTITY],
    peerId: context[CONTEXT_FIELD.PEER_ID],
  });
}

const LEARNER_ORIGIN_KEYS = Object.freeze(['groupId', 'index', 'term', 'context']);
const LEARNER_ORIGIN_ERROR = 'invalid committed learner origin';
const INVALID_COMMITTED_LEARNER_ADMISSION = Object.freeze({kind: 'invalid-learner-origin'});
function positiveDecimal(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) &&
    Number.isSafeInteger(Number(value));
}
const LEARNER_CONTEXT_DATA_VALUE = 'value';
const learnerOwnDescriptors = Object.getOwnPropertyDescriptors;
const learnerOwnKeys = Reflect.ownKeys;
const learnerPrototype = Object.getPrototypeOf;
const learnerIsProxy = nodeUtilTypes.isProxy;
const LEARNER_CONTEXT_PROTOTYPE = Object.prototype;
function snapshotLearnerContext(context) {
  if (context === null || typeof context !== 'object' || learnerIsProxy(context)) {
    throw new Error(LEARNER_ORIGIN_ERROR);
  }
  const prototype = learnerPrototype(context);
  if (prototype !== LEARNER_CONTEXT_PROTOTYPE && prototype !== null) {
    throw new Error(LEARNER_ORIGIN_ERROR);
  }
  // Capture descriptors once, before validation. Reading an accessor to copy
  // it would execute the untrusted value rather than snapshot the input.
  const descriptors = learnerOwnDescriptors(context);
  if (learnerOwnKeys(descriptors).length !== MANAGED_CONTEXT_KEYS.length) {
    throw new Error(LEARNER_ORIGIN_ERROR);
  }
  const captured = Object.create(null);
  for (const key of MANAGED_CONTEXT_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, LEARNER_CONTEXT_DATA_VALUE) ||
        descriptor.enumerable !== true) throw new Error(LEARNER_ORIGIN_ERROR);
    captured[key] = descriptor.value;
  }
  return Object.freeze(captured);
}
// A retained learner origin is only ever the transition's ADD_LEARNER. The
// queued action read (raft-rs-committed-membership-read.js) also answers the
// transition's PROMOTE (FreshMG 6.C slice C2): its committed outcome is the
// applied configuration naming the target a voter, never an origin.
const LEARNER_ORIGIN_STAGES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER]));
const READABLE_ACTION_STAGES = Object.freeze(new Set([
  RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE]));
function canonicalContextOfStages(context, stages) {
  const captured = snapshotLearnerContext(context);
  const encoded = encodeCommittedMembershipContext(captured);
  if (!stages.has(captured.stage)) {
    throw new Error(LEARNER_ORIGIN_ERROR);
  }
  return Object.freeze(JSON.parse(Buffer.from(encoded, CONTEXT_ENCODING)
    .toString(CONTEXT_TEXT_ENCODING)));
}
function canonicalLearnerContext(context) {
  return canonicalContextOfStages(context, LEARNER_ORIGIN_STAGES);
}
/** The exact action tuple the queued action read answers: the transition's
 * ADD_LEARNER or PROMOTE, snapshotted without invoking accessors. Throws for
 * anything else. */
function canonicalMembershipActionContext(context) {
  return canonicalContextOfStages(context, READABLE_ACTION_STAGES);
}
function encodeCommittedLearnerAdmission({groupId, index, term, context}) {
  if (typeof groupId !== 'string' || groupId.length === 0 ||
      !positiveDecimal(index) || !positiveDecimal(term)) {
    throw new Error(LEARNER_ORIGIN_ERROR);
  }
  return JSON.stringify({groupId, index, term, context: canonicalLearnerContext(context)});
}
function decodeCommittedLearnerAdmission(encoded) {
  try {
    const value = JSON.parse(encoded);
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== LEARNER_ORIGIN_KEYS.length ||
        !LEARNER_ORIGIN_KEYS.every((key) => Object.hasOwn(value, key)) ||
        encodeCommittedLearnerAdmission(value) !== encoded) {
      return INVALID_COMMITTED_LEARNER_ADMISSION;
    }
    return Object.freeze({...value, context: Object.freeze(value.context)});
  } catch {
    return INVALID_COMMITTED_LEARNER_ADMISSION;
  }
}
function learnerAdmissionMatchesReservation(encoded, reservation, boundary) {
  if (encoded === undefined) return true;
  const origin = decodeCommittedLearnerAdmission(encoded);
  return origin !== INVALID_COMMITTED_LEARNER_ADMISSION &&
    origin.groupId === boundary.groupId &&
    origin.context.replicaIdentity === reservation.replicaIdentity &&
    origin.context.peerId === reservation.peerId &&
    BigInt(origin.index) <= BigInt(boundary.membershipGenerationIndex) &&
    BigInt(origin.index) <= BigInt(boundary.appliedIndex) &&
    BigInt(origin.term) <= BigInt(boundary.appliedTerm);
}

const PROMOTION_FACT_VERSION = 1;
const PROMOTION_FACT_KEYS = Object.freeze([
  'version', 'groupId', 'index', 'term', 'context', 'learnerAdmission', 'before', 'after']);
const PROMOTION_BEFORE_KEYS = Object.freeze([
  'configurationKey', 'membershipGenerationIndex']);
const PROMOTION_AFTER_KEYS = Object.freeze([
  'voters', 'votersOutgoing', 'learners', 'learnersNext',
  'configurationKey', 'membershipGenerationIndex']);
const INVALID_COMMITTED_PROMOTION_ADMISSION = Object.freeze({kind: 'invalid-promotion-fact'});
const PROMOTION_FACT_ERROR = 'invalid committed promotion fact';

function exactRecord(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      learnerIsProxy(value)) return false;
  const descriptors = learnerOwnDescriptors(value);
  const ownKeys = learnerOwnKeys(descriptors);
  return ownKeys.length === keys.length && keys.every((key) => {
    const descriptor = descriptors[key];
    return descriptor && Object.hasOwn(descriptor, LEARNER_CONTEXT_DATA_VALUE) &&
      descriptor.enumerable === true;
  });
}

function canonicalPeerIds(value) {
  if (!Array.isArray(value) || learnerIsProxy(value)) throw new Error(PROMOTION_FACT_ERROR);
  const ids = value.map((peerId) => {
    if (typeof peerId !== 'string' || !/^[1-9][0-9]*$/.test(peerId)) {
      throw new Error(PROMOTION_FACT_ERROR);
    }
    return peerId;
  });
  if (new Set(ids).size !== ids.length) throw new Error(PROMOTION_FACT_ERROR);
  const ordered = [...ids].sort((left, right) =>
    left.length - right.length || left.localeCompare(right));
  if (ordered.some((peerId, index) => peerId !== ids[index])) {
    throw new Error(PROMOTION_FACT_ERROR);
  }
  return Object.freeze(ordered);
}

function canonicalPromotionBoundary(value, keys, roles = false) {
  if (!exactRecord(value, keys) || typeof value.configurationKey !== 'string' ||
      !positiveDecimal(value.membershipGenerationIndex)) {
    throw new Error(PROMOTION_FACT_ERROR);
  }
  if (!roles) {
    return Object.freeze({configurationKey: value.configurationKey,
      membershipGenerationIndex: value.membershipGenerationIndex});
  }
  const voters = canonicalPeerIds(value.voters);
  const votersOutgoing = canonicalPeerIds(value.votersOutgoing);
  const learners = canonicalPeerIds(value.learners);
  const learnersNext = canonicalPeerIds(value.learnersNext);
  const confState = {voters, votersOutgoing, learners, learnersNext, autoLeave: false};
  if (voters.length === 0 || votersOutgoing.length !== 0 || learnersNext.length !== 0 ||
      new Set([...voters, ...learners]).size !== voters.length + learners.length ||
      raftRsConfStateKey(confState) !== value.configurationKey) {
    throw new Error(PROMOTION_FACT_ERROR);
  }
  return Object.freeze({voters, votersOutgoing, learners, learnersNext,
    configurationKey: value.configurationKey,
    membershipGenerationIndex: value.membershipGenerationIndex});
}

function samePeers(left, right) {
  return left.length === right.length && left.every((peer, index) => peer === right[index]);
}

function promotionOriginMatches(fact, learnerOrigin) {
  return learnerOrigin.groupId === fact.groupId &&
    learnerOrigin.context.operationId === fact.context.operationId &&
    learnerOrigin.context.transitionIdentity === fact.context.transitionIdentity &&
    learnerOrigin.context.replicaIdentity === fact.context.replicaIdentity &&
    learnerOrigin.context.peerId === fact.context.peerId &&
    learnerOrigin.context.permitSequence < fact.context.permitSequence;
}

function promotionChronologyIsValid(fact, learnerOrigin) {
  return BigInt(learnerOrigin.index) <= BigInt(fact.before.membershipGenerationIndex) &&
    BigInt(learnerOrigin.term) <= BigInt(fact.term) &&
    BigInt(fact.before.membershipGenerationIndex) < BigInt(fact.index) &&
    fact.after.membershipGenerationIndex === fact.index;
}

function validatePromotionDelta(fact, learnerOrigin) {
  const target = fact.context.peerId;
  const before = fact.before;
  const after = fact.after;
  if (fact.context.stage !== RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE ||
      !promotionOriginMatches(fact, learnerOrigin) ||
      !promotionChronologyIsValid(fact, learnerOrigin) ||
      !after.voters.includes(target) || after.learners.includes(target) ||
      before.configurationKey === after.configurationKey) {
    throw new Error(PROMOTION_FACT_ERROR);
  }
  const reversedVoters = after.voters.filter((peer) => peer !== target);
  const reversedLearners = [...after.learners, target].sort((left, right) =>
    left.length - right.length || left.localeCompare(right));
  if (raftRsConfStateKey({voters: reversedVoters, votersOutgoing: [],
    learners: reversedLearners, learnersNext: [], autoLeave: false}) !==
      before.configurationKey ||
      !samePeers(after.voters, [...reversedVoters, target].sort((left, right) =>
        left.length - right.length || left.localeCompare(right)))) {
    throw new Error(PROMOTION_FACT_ERROR);
  }
}

function canonicalPromotionFact(value) {
  if (!exactRecord(value, PROMOTION_FACT_KEYS) || value.version !== PROMOTION_FACT_VERSION ||
      typeof value.groupId !== 'string' || value.groupId.length === 0 ||
      !positiveDecimal(value.index) || !positiveDecimal(value.term) ||
      typeof value.learnerAdmission !== 'string') {
    throw new Error(PROMOTION_FACT_ERROR);
  }
  const context = canonicalMembershipActionContext(value.context);
  const learnerOrigin = decodeCommittedLearnerAdmission(value.learnerAdmission);
  if (learnerOrigin === INVALID_COMMITTED_LEARNER_ADMISSION) {
    throw new Error(PROMOTION_FACT_ERROR);
  }
  const fact = Object.freeze({version: PROMOTION_FACT_VERSION,
    groupId: value.groupId, index: value.index, term: value.term, context,
    learnerAdmission: value.learnerAdmission,
    before: canonicalPromotionBoundary(value.before, PROMOTION_BEFORE_KEYS),
    after: canonicalPromotionBoundary(value.after, PROMOTION_AFTER_KEYS, true)});
  validatePromotionDelta(fact, learnerOrigin);
  return fact;
}

function encodeCommittedPromotionAdmission(value) {
  return JSON.stringify(canonicalPromotionFact(value));
}

function decodeCommittedPromotionAdmission(encoded) {
  try {
    const value = canonicalPromotionFact(JSON.parse(encoded));
    return encodeCommittedPromotionAdmission(value) === encoded ? value :
      INVALID_COMMITTED_PROMOTION_ADMISSION;
  } catch {
    return INVALID_COMMITTED_PROMOTION_ADMISSION;
  }
}

function promotionAdmissionMatchesReservation(encoded, reservation, boundary) {
  if (encoded === undefined) return true;
  const fact = decodeCommittedPromotionAdmission(encoded);
  return fact !== INVALID_COMMITTED_PROMOTION_ADMISSION &&
    fact.groupId === boundary.groupId &&
    fact.context.replicaIdentity === reservation.replicaIdentity &&
    fact.context.peerId === reservation.peerId &&
    fact.learnerAdmission === reservation.learnerAdmission &&
    BigInt(fact.index) <= BigInt(boundary.membershipGenerationIndex) &&
    BigInt(fact.index) <= BigInt(boundary.appliedIndex) &&
    BigInt(fact.term) <= BigInt(boundary.appliedTerm);
}

export {
  INVALID_COMMITTED_LEARNER_ADMISSION,
  INVALID_COMMITTED_PROMOTION_ADMISSION,
  canonicalMembershipActionContext,
  encodeCommittedLearnerAdmission,
  decodeCommittedLearnerAdmission,
  decodeCommittedPromotionAdmission,
  encodeCommittedPromotionAdmission,
  learnerAdmissionMatchesReservation,
  promotionAdmissionMatchesReservation,
  committedMembershipChangeType,
  committedMembershipContext,
  encodeCommittedMembershipContext,
};
