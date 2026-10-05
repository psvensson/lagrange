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
 * raft-rs peer identity, the retiring workflow ATTEMPT (workflow id and the
 * record's workflowAttempt: the same workflow id registered again is
 * another attempt, round 7) and the fence and kind it was retired under,
 * and the INCARNATION of the lifecycle row it was written
 * from (owner decision 2026-10-05: the stamp the row's lifecycle owner
 * minted when that replica was born). A REMOVE is answered from it only for
 * that exact (table, group, replica identity, peer identity, workflow
 * attempt), and
 * only while this node holds no lifecycle row for the identity (its database
 * deleted) or holds exactly that retired incarnation: never beside a live
 * (non-retired) row, an unreadable one, or a row of another incarnation. A
 * tombstone without an incarnation (written before the stamp) is no proof.
 * Written: only from the replica's own durable lifecycle row reading retired
 * - with the group-retired reason, or (owner decision 2026-10-05) any other
 * reason such as a reseed hold once a group-retirement REMOVE's evidence
 * verified against the record - carrying its incarnation, and before its
 * database is deleted (the deletion writes it from a group-retired row's own
 * recorded evidence, or refuses).
 * Dropped: when the same (group, replica identity) is created again, before
 * the new replica is born (a later incarnation never meets it), and before a
 * database of another incarnation is deleted.
 * Lifetime: kept until the member observes, through the control plane's
 * authoritative read of the workflow's record, that the record no longer
 * belongs to that attempt (cleared, a later workflow's, or a later attempt
 * of the same workflow id): the attempt
 * durably recorded completion. An absent or unreadable record keeps it.
 * Bound: one small file per replica this node retired as part of a group
 * whose workflow it has not yet seen cleared (a dropped table's record is
 * absent: its tombstones stay - recorded follow-up).
 * Prohibited: a proof from absence; a proof for another identity, group,
 * workflow, attempt or incarnation; a proof beside a live row; releasing before the
 * record is seen cleared.
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
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  workflowAttemptOf,
} from '../partition/partition-constants.js';

const TOMBSTONE_DIRNAME = 'group-retired-tombstones';
// Version 3 carries the workflow attempt (round 7); a version 2 file carries
// the replica incarnation and reads as the legacy attempt 0; a version 1
// file is no proof.
const TOMBSTONE_VERSION = 3;
const ATTEMPTLESS_TOMBSTONE_VERSION = 2;
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
  INCARNATION: 'incarnation',
});

function isNonEmptyString(value) {
  return typeof value === STRING_TYPE && value.length > 0;
}

function isWellFormed(record) {
  const attempted = record?.version === TOMBSTONE_VERSION &&
    Number.isSafeInteger(record.attempt);
  return (attempted || record?.version === ATTEMPTLESS_TOMBSTONE_VERSION) &&
    Object.values(TOMBSTONE_SCOPE_FIELD).every((field) =>
      isNonEmptyString(record[field])) &&
    Number.isInteger(record.fenceToken);
}

// The workflow attempt a tombstone was written for (0: the legacy attempt).
function tombstoneAttemptOf(tombstone) {
  return workflowAttemptOf({
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ATTEMPT]: tombstone?.attempt,
  });
}

/**
 * Durably record that one replica was retired with its whole group.
 * @param {string} dataDir - The node's data directory.
 * @param {Object} fact
 * @param {string} fact.groupId - The group (partition) id.
 * @param {string} fact.replicaIdentity - The replica's identity.
 * @param {string} fact.incarnation - The retired lifecycle row's stamp.
 * @param {string} [fact.lifecycleReason] - The row's retirement reason.
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

// A persisted text field: the value as a string, '' when there is none.
function textOf(value) {
  return String(value ?? '');
}

// The record one tombstone write persists.
function tombstoneRecordOf({groupId, replicaIdentity, incarnation,
  lifecycleReason, evidence, retiredAt}) {
  const identity = textOf(replicaIdentity);
  return {
    version: TOMBSTONE_VERSION,
    tableId: textOf(evidence?.tableId),
    groupId: textOf(groupId),
    replicaIdentity: identity,
    peerId: isNonEmptyString(identity) ? deriveRaftRsPeerId(identity) : '',
    workflowId: textOf(evidence?.workflowId),
    attempt: workflowAttemptOf({
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ATTEMPT]: evidence?.attempt,
    }),
    fenceToken: evidence?.fenceToken,
    kind: textOf(evidence?.kind),
    incarnation: textOf(incarnation),
    lifecycleReason: textOf(lifecycleReason),
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
 * Whether a tombstone was written from exactly this lifecycle read's row: a
 * retired row of the tombstone's incarnation.
 * @param {Object|null} tombstone
 * @param {Object} lifecycle - The durable lifecycle read with the lifecycle
 *   administration's verdicts (ReplicaHandler.lifecycleVerdictsOf).
 * @return {boolean}
 */
function isTombstoneOfRow(tombstone, lifecycle) {
  return Boolean(tombstone) && lifecycle?.retired === true &&
    isNonEmptyString(lifecycle.incarnation) &&
    lifecycle.incarnation === tombstone.incarnation;
}

/**
 * Whether a tombstone proves the retirement a group-retirement REMOVE asks
 * about: the exact table, group, replica identity, peer identity and
 * workflow ATTEMPT, and the incarnation this node holds for the identity - no row
 * any more (its database deleted), or exactly the retired row it was
 * written from. A live row, an unreadable database or a row of another
 * incarnation is never answered from a tombstone.
 * @param {Object|null} tombstone
 * @param {Object} request - {partitionId, replicaId, evidence}.
 * @param {Object} lifecycle - The durable lifecycle read of that identity,
 *   with its verdicts (ReplicaHandler.lifecycleVerdictsOf).
 * @return {boolean}
 */
function tombstoneProvesRetirement(tombstone, {partitionId, replicaId,
  evidence}, lifecycle) {
  if (!tombstone || !isNonEmptyString(replicaId) ||
      !(lifecycle?.absent === true ||
        isTombstoneOfRow(tombstone, lifecycle))) {
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
    tombstone[field] === value) &&
    tombstoneAttemptOf(tombstone) === tombstoneAttemptOf(evidence);
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
 * answered it, shows the tombstone's attempt finished: the record no longer
 * belongs to it (cleared, a later workflow's, or another attempt of the same
 * workflow id). An unread or absent record proves nothing.
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
      '') !== tombstone.workflowId ||
      workflowAttemptOf(metadata) !== tombstoneAttemptOf(tombstone);
  } catch (_error) {
    return false;
  }
}

export {
  deleteGroupRetiredTombstone,
  isTombstoneOfRow,
  isTombstoneWorkflowCleared,
  listGroupRetiredTombstones,
  readGroupRetiredTombstone,
  tombstoneProvesRetirement,
  writeGroupRetiredTombstone,
};
