// The seed catalog remains the producer of its original allocation. This
// immutable declaration pins births before any of its native replicas open.
// The replica lifecycle owner, not this producer, mints each founder's
// incarnation: the producer declares a draft without incarnations and the
// complete declaration is formed from the lifecycle owner's returned stamps.
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {types} from 'node:util';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {genesisStamp} from '../raft/raft-committed-membership-stamp.js';
import {mintServiceRowCreatedAt} from '../node/service-row-incarnation.js';
import {getMessageGroupDbPath, getPartitionDbPath} from
  '../storage/data-directory-manager.js';
import {ADDRESS, ENTITY_TYPE, SERVICE_TYPE} from '../constants/index.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  originalAllocationError} from '../raft/raft-rs-original-allocation-constants.js';
import {SYSTEM_TABLE_SCHEMAS, SYSTEM_TABLE_NAME, INITIAL_PARTITION_IDS,
  INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  getInitialReplicaIds} from './system-table-schemas-constants.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const PROPERTY_VALUE = 'value';
const ARRAY_LENGTH = 'length';
const INCARNATION_FIELD = 'incarnation';

function originalSeedPeerAddresses(nodeId, serviceType, replicaIds) {
  const entityType = serviceType === SERVICE_TYPE.MESSAGE_GROUP ?
    ENTITY_TYPE.MESSAGE_GROUP : ENTITY_TYPE.PARTITION;
  return Object.freeze(replicaIds.map((replicaId) =>
    [nodeId, entityType, replicaId].join(ADDRESS.SEPARATOR)));
}

function catalogDigest() {
  return createHash(DIGEST_ALGORITHM).update(JSON.stringify({
    schemas: SYSTEM_TABLE_SCHEMAS,
    partitions: INITIAL_PARTITION_IDS,
    groups: INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  })).digest(DIGEST_ENCODING);
}

function originalSeedMemberDescriptors(dataDir) {
  const members = INITIAL_MESSAGE_GROUP_REPLICA_IDS.map((replicaId) => ({
    serviceType: SERVICE_TYPE.MESSAGE_GROUP,
    groupId: INITIAL_MESSAGE_GROUP_ID,
    tableName: null,
    replicaId,
    replicaIds: [...INITIAL_MESSAGE_GROUP_REPLICA_IDS],
    dbPath: getMessageGroupDbPath(dataDir, INITIAL_MESSAGE_GROUP_ID, replicaId),
  }));
  for (const {tableName} of SYSTEM_TABLE_SCHEMAS) {
    const groupId = INITIAL_PARTITION_IDS[tableName];
    const replicaIds = getInitialReplicaIds(tableName);
    for (const replicaId of replicaIds) {
      members.push({serviceType: SERVICE_TYPE.PARTITION,
        groupId, tableName, replicaId, replicaIds,
        dbPath: getPartitionDbPath(dataDir, groupId, replicaId)});
    }
  }
  return members;
}

function originalSeedAnchor(dataDir) {
  const groupId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  const replicaId = getInitialReplicaIds(SYSTEM_TABLE_NAME.SERVICES)[0];
  return Object.freeze({groupId, replicaId, peerId: deriveRaftRsPeerId(replicaId),
    dbPath: getPartitionDbPath(dataDir, groupId, replicaId)});
}

/**
 * Declare the original allocation's draft: every founder and its birth
 * facts, without an incarnation (that is the lifecycle owner's to mint).
 * @param {Object} request {dataDir, nodeId, buildDigest, now}.
 * @return {Object} Deep-frozen draft for the original-allocation preparation.
 */
function createSeedOriginalAllocation({dataDir, nodeId, buildDigest, now}) {
  if (!Number.isSafeInteger(now) || now < 0 ||
      typeof nodeId !== 'string' || nodeId.length === 0 ||
      typeof buildDigest !== 'string' || buildDigest.length === 0) {
    throw originalAllocationError(REASON.IDENTITY);
  }
  const canonicalDataDir = path.resolve(dataDir);
  const members = originalSeedMemberDescriptors(canonicalDataDir).map((member) => ({
    ...member,
    peerId: deriveRaftRsPeerId(member.replicaId),
    createdAt: mintServiceRowCreatedAt(now),
    createAttemptToken: randomUUID(),
    membership: genesisStamp(member.replicaIds),
  }));
  return deepFreeze({version: STATE.VERSION, allocationId: randomUUID(),
    nodeId, dataDir: canonicalDataDir, buildDigest, declaredAt: now,
    catalogDigest: catalogDigest(), clusterId: randomUUID(),
    anchorReplicaId: originalSeedAnchor(canonicalDataDir).replicaId, members});
}

// Only owned plain data reaches formatting: getters, proxies and toJSON
// callbacks would break the synchronous, callback-free preparation contract.
function isPlainDeclarationScalar(value) {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
}

function assertPlainPropertyDescriptor(key, descriptor, array, ancestors) {
  if (typeof key !== 'string' || !Object.hasOwn(descriptor, PROPERTY_VALUE) ||
      (!descriptor.enumerable && !(array && key === ARRAY_LENGTH))) {
    throw originalAllocationError(REASON.IDENTITY);
  }
  assertPlainDeclarationData(descriptor.value, ancestors);
}

function assertPlainDeclarationData(value, ancestors = new Set()) {
  if (isPlainDeclarationScalar(value)) return;
  if (typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) {
    throw originalAllocationError(REASON.IDENTITY);
  }
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
    throw originalAllocationError(REASON.IDENTITY);
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    assertPlainPropertyDescriptor(
      key, Object.getOwnPropertyDescriptor(value, key), array, ancestors);
  }
  ancestors.delete(value);
}

function validateOriginalSeedDeclaration(declaration, identity) {
  return validateAllocation(declaration, identity, true);
}

/**
 * Validate a draft before any I/O: the complete declaration except the
 * incarnations, which a draft must not carry (a caller never chooses one).
 * @param {Object} draft The declaration owner's draft.
 * @param {Object} identity {dataDir, nodeId, buildDigest} bound at startup.
 * @return {Object} The deep-frozen draft.
 */
function validateOriginalSeedDraft(draft, identity) {
  return validateAllocation(draft, identity, false);
}

/**
 * Form the complete declaration from a draft and the lifecycle owner's
 * exact returned stamps, one per founder, and validate it whole.
 * @param {Object} draft A draft this producer declared.
 * @param {Map<string, string>} incarnations replicaId -> owner-minted stamp.
 * @param {Object} identity {dataDir, nodeId, buildDigest} bound at startup.
 * @return {Object} The deep-frozen complete declaration.
 */
function completeSeedOriginalAllocation(draft, incarnations, identity) {
  validateOriginalSeedDraft(draft, identity);
  return validateOriginalSeedDeclaration({...draft,
    members: draft.members.map((member) => ({...member,
      [INCARNATION_FIELD]: incarnations.get(member.replicaId)}))}, identity);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasValidAllocationHeaderFields(declaration, nodeId, buildDigest) {
  return isNonEmptyString(nodeId) && isNonEmptyString(buildDigest) &&
    isNonEmptyString(declaration?.allocationId) && isNonEmptyString(declaration?.clusterId) &&
    Number.isSafeInteger(declaration?.declaredAt) && declaration.declaredAt >= 0;
}

function assertAllocationHeader(declaration, {dataDir, nodeId, buildDigest}) {
  if (!hasValidAllocationHeaderFields(declaration, nodeId, buildDigest) ||
      declaration.version !== STATE.VERSION || declaration.nodeId !== nodeId ||
      declaration.dataDir !== path.resolve(dataDir) ||
      declaration.buildDigest !== buildDigest || declaration.catalogDigest !== catalogDigest() ||
      declaration.anchorReplicaId !== originalSeedAnchor(dataDir).replicaId ||
      !Array.isArray(declaration.members)) {
    throw originalAllocationError(REASON.IDENTITY);
  }
}

function validateAllocation(declaration, identity, complete) {
  assertPlainDeclarationData(declaration);
  assertAllocationHeader(declaration, identity);
  const expected = originalSeedMemberDescriptors(path.resolve(identity.dataDir));
  if (expected.length !== declaration.members.length) {
    throw originalAllocationError(REASON.INCOMPLETE);
  }
  const tokens = new Set();
  for (let index = 0; index < expected.length; index++) {
    validateMember(declaration.members[index], expected[index], tokens, complete);
  }
  return deepFreeze(declaration);
}

function validateMember(member, expected, tokens, complete) {
  const matches = Object.entries(expected).every(([key, value]) =>
    JSON.stringify(member?.[key]) === JSON.stringify(value));
  if (!matches || member.peerId !== deriveRaftRsPeerId(expected.replicaId) ||
      JSON.stringify(member.membership) !== JSON.stringify(genesisStamp(expected.replicaIds)) ||
      !isNonEmptyString(member.createAttemptToken) ||
      !Number.isSafeInteger(member.createdAt) || member.createdAt < 0 ||
      tokens.has(member.createAttemptToken) ||
      incarnationRefused(member, tokens, complete)) {
    throw originalAllocationError(REASON.IDENTITY, expected.replicaId);
  }
  tokens.add(member.createAttemptToken);
  if (complete) tokens.add(member.incarnation);
}

// A complete member carries one fresh stamp distinct from every token; a
// draft member carries none.
function incarnationRefused(member, tokens, complete) {
  if (!complete) return Object.hasOwn(member, INCARNATION_FIELD);
  return typeof member.incarnation !== 'string' || member.incarnation.length === 0 ||
    member.createAttemptToken === member.incarnation || tokens.has(member.incarnation);
}

export {createSeedOriginalAllocation, validateOriginalSeedDeclaration, validateOriginalSeedDraft,
  completeSeedOriginalAllocation, originalSeedAnchor,
  originalSeedPeerAddresses};
