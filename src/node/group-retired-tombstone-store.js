/**
 * Owner contract:
 * Owner: the member node's durable proof that ONE of its replicas was
 * retired with its whole group (owner ruling 2026-10-05: a member-owned
 * `group retired` tombstone). A group-retirement REMOVE deletes the
 * replica's database - and the durable lifecycle row in it - in the same
 * removal; a node restart between that and the workflow owner durably
 * recording the member's answer would leave the member answering NOT_FOUND
 * forever. The tombstone outlives the database.
 * Store: node-local, in the node's data directory beside the replica
 * databases (`<dataDir>/group-retired-tombstones/`), one file per (group,
 * replica identity), written with the repository's durable atomic
 * replacement (fsync file, rename, fsync directory). Neither existing store
 * fits: the removal's cleanup tombstone is a cluster `services` row whose
 * life ends when the replica's files are gone (artifactsAbsent) and that
 * every cleanup consumer reads as an unfinished cleanup; the boot
 * incarnation is a single-purpose counter.
 * Scope: the exact table id, group (partition) id, replica identity and its
 * raft-rs peer identity, the retiring workflow id and the fence and kind it
 * was retired under. A REMOVE is answered from it only for that exact
 * (table, group, replica identity, peer identity, workflow): a replica of
 * the same name in another group generation (another group id or workflow)
 * never inherits the proof.
 * Written: only after the replica's own durable lifecycle row reads retired
 * with the group-retired reason (a reseed-required hold is never one), and
 * before its database is deleted (the deletion refuses a group-retired
 * replica that has no tombstone).
 * Lifetime: kept until the member observes, through the control plane's
 * authoritative read of the workflow's record, that the record no longer
 * belongs to that workflow (cleared, or a later workflow's): the workflow
 * durably recorded completion. An absent or unreadable record keeps it.
 * Bound: one small file per replica this node retired as part of a group
 * whose workflow it has not yet seen cleared (a dropped table's record is
 * absent: its tombstones stay - recorded follow-up).
 * Prohibited: a proof from absence; a proof for another identity, group or
 * workflow; deleting before the record is seen cleared.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDirectory,
  fsyncDirectory,
  readCanonicalJson,
  writeAtomicDurable,
} from '../runtime/oci-host-agent-durable-files.js';
import {deriveRaftRsPeerId} from '../raft/raft-rs-peer-identity.js';
import {PARTITION_TRANSITION_METADATA_FIELD} from
  '../partition/partition-constants.js';

const TOMBSTONE_DIRNAME = 'group-retired-tombstones';
const TOMBSTONE_VERSION = 1;
const TOMBSTONE_EXT = '.json';
const UNREADABLE = 'GROUP_RETIRED_TOMBSTONE_UNREADABLE';
// A tombstone directory that is missing, or whose place is taken, holds no
// tombstone: there is nothing to answer from (never a proof).
const NO_TOMBSTONE_DIRECTORY = Object.freeze(new Set(['ENOENT', 'ENOTDIR']));
const STRING_TYPE = 'string';

function directoryOf(dataDir) {
  return path.join(String(dataDir), TOMBSTONE_DIRNAME);
}

function fileOf(dataDir, groupId, replicaIdentity) {
  const digest = createHash('sha256')
    .update(`${groupId}\u0000${replicaIdentity}`).digest('hex');
  return path.join(directoryOf(dataDir), `${digest}${TOMBSTONE_EXT}`);
}

// The scope fields every tombstone carries, each a non-empty string.
const TOMBSTONE_SCOPE_FIELD = Object.freeze({
  TABLE_ID: 'tableId',
  GROUP_ID: 'groupId',
  REPLICA_IDENTITY: 'replicaIdentity',
  PEER_ID: 'peerId',
  WORKFLOW_ID: 'workflowId',
  KIND: 'kind',
});

function isNonEmptyString(value) {
  return typeof value === STRING_TYPE && value.length > 0;
}

function isWellFormed(record) {
  return record?.version === TOMBSTONE_VERSION &&
    Object.values(TOMBSTONE_SCOPE_FIELD).every((field) =>
      isNonEmptyString(record[field])) &&
    Number.isInteger(record.fenceToken);
}

/**
 * Durably record that one replica was retired with its whole group.
 * @param {string} dataDir - The node's data directory.
 * @param {Object} fact
 * @param {string} fact.groupId - The group (partition) id.
 * @param {string} fact.replicaIdentity - The replica's identity.
 * @param {Object} fact.evidence - The verified REMOVE's evidence
 *   ({tableId, workflowId, fenceToken, kind}).
 * @param {number} fact.retiredAt
 * @return {Object} The record written.
 */
function writeGroupRetiredTombstone(dataDir, fact) {
  const record = tombstoneRecordOf(fact);
  if (!isWellFormed(record)) {
    throw new Error(`${UNREADABLE}: refusing a malformed tombstone for ` +
      `${record.groupId}/${record.replicaIdentity}`);
  }
  const directory = directoryOf(dataDir);
  const created = !fs.existsSync(directory);
  ensureDirectory(directory);
  if (created) {
    // The new directory's own entry is durable before anything in it.
    fsyncDirectory(String(dataDir));
  }
  writeAtomicDurable(fileOf(dataDir, record.groupId, record.replicaIdentity),
    record);
  return record;
}

// The record one tombstone write persists.
function tombstoneRecordOf({groupId, replicaIdentity, evidence, retiredAt}) {
  const identity = String(replicaIdentity ?? '');
  return {
    version: TOMBSTONE_VERSION,
    tableId: String(evidence?.tableId ?? ''),
    groupId: String(groupId ?? ''),
    replicaIdentity: identity,
    peerId: isNonEmptyString(identity) ? deriveRaftRsPeerId(identity) : '',
    workflowId: String(evidence?.workflowId ?? ''),
    fenceToken: evidence?.fenceToken,
    kind: String(evidence?.kind ?? ''),
    retiredAt: Number(retiredAt) || 0,
  };
}

/**
 * The tombstone of one (group, replica identity), or null (none, or one
 * that cannot be read - never a proof).
 * @param {string} dataDir
 * @param {string} groupId
 * @param {string} replicaIdentity
 * @return {Object|null}
 */
function readGroupRetiredTombstone(dataDir, groupId, replicaIdentity) {
  const file = fileOf(dataDir, groupId, replicaIdentity);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const record = readCanonicalJson(file, UNREADABLE);
    return isWellFormed(record) ? record : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Whether a tombstone proves the retirement a group-retirement REMOVE asks
 * about: the exact table, group, replica identity, peer identity and
 * workflow.
 * @param {Object|null} tombstone
 * @param {Object} request - {partitionId, replicaId, evidence}.
 * @return {boolean}
 */
function tombstoneProvesRetirement(tombstone, {partitionId, replicaId,
  evidence}) {
  if (!tombstone || !isNonEmptyString(replicaId)) {
    return false;
  }
  const asked = {
    [TOMBSTONE_SCOPE_FIELD.GROUP_ID]: String(partitionId ?? ''),
    [TOMBSTONE_SCOPE_FIELD.REPLICA_IDENTITY]: replicaId,
    [TOMBSTONE_SCOPE_FIELD.PEER_ID]: deriveRaftRsPeerId(replicaId),
    [TOMBSTONE_SCOPE_FIELD.TABLE_ID]: String(evidence?.tableId ?? ''),
    [TOMBSTONE_SCOPE_FIELD.WORKFLOW_ID]: String(evidence?.workflowId ?? ''),
  };
  return Object.entries(asked).every(([field, value]) =>
    tombstone[field] === value);
}

/**
 * Every readable tombstone of this node.
 * @param {string} dataDir
 * @return {Array<Object>}
 */
function listGroupRetiredTombstones(dataDir) {
  let names = [];
  try {
    names = fs.readdirSync(directoryOf(dataDir));
  } catch (error) {
    if (NO_TOMBSTONE_DIRECTORY.has(error?.code)) {
      return [];
    }
    throw error;
  }
  return names.filter((name) => name.endsWith(TOMBSTONE_EXT))
    .map((name) => {
      try {
        const record = readCanonicalJson(
          path.join(directoryOf(dataDir), name), UNREADABLE);
        return isWellFormed(record) ? record : null;
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Delete one tombstone durably (unlink, fsync the directory).
 * @param {string} dataDir
 * @param {Object} tombstone
 * @return {void}
 */
function deleteGroupRetiredTombstone(dataDir, tombstone) {
  fs.rmSync(fileOf(dataDir, tombstone.groupId, tombstone.replicaIdentity),
    {force: true});
  fsyncDirectory(directoryOf(dataDir));
}

/**
 * Whether the workflow's record, as the control plane's authoritative read
 * answered it, shows the tombstone's workflow finished: the record no longer
 * belongs to it (cleared, or a later workflow's). An unread or absent record
 * proves nothing.
 * @param {Object} tombstone
 * @param {Object} read - {available, tablesRow}.
 * @return {boolean}
 */
function isTombstoneWorkflowCleared(tombstone, read) {
  if (read?.available !== true || !read.tablesRow) {
    return false;
  }
  const raw = read.tablesRow.partition_transition_metadata;
  if (raw === null || raw === undefined || raw === '') {
    return true;
  }
  try {
    const metadata = typeof raw === STRING_TYPE ? JSON.parse(raw) : raw;
    return String(metadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] ||
      '') !== tombstone.workflowId;
  } catch (_error) {
    return false;
  }
}

export {
  deleteGroupRetiredTombstone,
  isTombstoneWorkflowCleared,
  listGroupRetiredTombstones,
  readGroupRetiredTombstone,
  tombstoneProvesRetirement,
  writeGroupRetiredTombstone,
};
