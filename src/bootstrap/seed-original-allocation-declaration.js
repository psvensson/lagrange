// The seed catalog remains the producer of its original allocation. This
// immutable declaration pins births before any of its native replicas open.
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {deepFreeze} from '../raft/raft-operation-port.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {genesisStamp} from '../raft/raft-committed-membership-stamp.js';
import {mintServiceRowCreatedAt} from '../node/service-row-incarnation.js';
import {getMessageGroupDbPath, getPartitionDbPath} from
  '../storage/data-directory-manager.js';
import {SERVICE_TYPE} from '../constants/index.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  originalAllocationError} from '../raft/raft-rs-original-allocation-constants.js';
import {SYSTEM_TABLE_SCHEMAS, SYSTEM_TABLE_NAME, INITIAL_PARTITION_IDS,
  INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  getInitialReplicaIds} from './system-table-schemas-constants.js';

const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';

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
    incarnation: randomUUID(),
    createdAt: mintServiceRowCreatedAt(now),
    createAttemptToken: randomUUID(),
    membership: genesisStamp(member.replicaIds),
  }));
  return deepFreeze({version: STATE.VERSION, allocationId: randomUUID(),
    nodeId, dataDir: canonicalDataDir, buildDigest, declaredAt: now,
    catalogDigest: catalogDigest(), clusterId: randomUUID(),
    anchorReplicaId: originalSeedAnchor(canonicalDataDir).replicaId, members});
}

function validateOriginalSeedDeclaration(declaration, {dataDir, nodeId, buildDigest}) {
  if (typeof nodeId !== 'string' || nodeId.length === 0 ||
      typeof buildDigest !== 'string' || buildDigest.length === 0 ||
      declaration?.version !== STATE.VERSION || declaration.nodeId !== nodeId ||
      !Number.isSafeInteger(declaration.declaredAt) || declaration.declaredAt < 0 ||
      declaration.dataDir !== path.resolve(dataDir) ||
      declaration.buildDigest !== buildDigest || declaration.catalogDigest !== catalogDigest() ||
      declaration.anchorReplicaId !== originalSeedAnchor(dataDir).replicaId ||
      !Array.isArray(declaration.members)) {
    throw originalAllocationError(REASON.IDENTITY);
  }
  for (const value of [declaration.allocationId, declaration.clusterId]) {
    if (typeof value !== 'string' || value.length === 0) {
      throw originalAllocationError(REASON.IDENTITY);
    }
  }
  const expected = originalSeedMemberDescriptors(path.resolve(dataDir));
  if (expected.length !== declaration.members.length) throw originalAllocationError(REASON.INCOMPLETE);
  const tokens = new Set();
  for (let index = 0; index < expected.length; index++) {
    validateMember(declaration.members[index], expected[index], tokens);
  }
  return deepFreeze(declaration);
}

function validateMember(member, expected, tokens) {
  const matches = Object.entries(expected).every(([key, value]) =>
    JSON.stringify(member?.[key]) === JSON.stringify(value));
  if (!matches || member.peerId !== deriveRaftRsPeerId(expected.replicaId) ||
      JSON.stringify(member.membership) !== JSON.stringify(genesisStamp(expected.replicaIds)) ||
      typeof member.incarnation !== 'string' || member.incarnation.length === 0 ||
      typeof member.createAttemptToken !== 'string' || member.createAttemptToken.length === 0 ||
      !Number.isSafeInteger(member.createdAt) || member.createdAt < 0 ||
      member.incarnation === member.createAttemptToken ||
      tokens.has(member.createAttemptToken) || tokens.has(member.incarnation)) {
    throw originalAllocationError(REASON.IDENTITY, expected.replicaId);
  }
  tokens.add(member.createAttemptToken);
  tokens.add(member.incarnation);
}

export {createSeedOriginalAllocation, validateOriginalSeedDeclaration, originalSeedAnchor};
