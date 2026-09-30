// Independent oracles for the committed-membership read and the
// participation gate (committed-read amendment 1, section 5). Every value
// here is read on a connection of the test's own, from the durable bytes a
// replica wrote, or decoded with the binding's own decoder on a throwaway
// core - never from the implementation's status, stamp or answer.
//
//   O-a  log fold: the conf-change entries of `_raft_rs_log`, decoded and
//        folded over the TEST'S genesis founders (never rows), give the
//        committed configuration at every index;
//   O-b  cross-member agreement of durable applied ConfStates;
//   O-c  durable hard states and logs: leaders per term and one payload per
//        (index, term);
//   O-d  the gate: the durable hard-state term and vote of a replica.
//
// The binding's wire numbers (ConfChangeType, ConfChangeTransition, entry
// types) are read out of the binding source's own match arms, so no test
// carries copies of them.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {instantiateRaftRsCore} from './raw-raft-rs-test-core.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BINDING_SOURCE = path.join(
  REPOSITORY_ROOT, 'vendor', 'raft-rs-wasm', 'src', 'lib.rs');
const IDENTITY_TABLE = 'raft_rs_peer_identity';

let decoderCore = null;

function bindingArms(functionName, enumName) {
  const source = fs.readFileSync(BINDING_SOURCE, 'utf8');
  const start = source.indexOf(`fn ${functionName}`);
  const body = source.slice(start, source.indexOf('\n}\n', start));
  // `n => Ok(Enum::Name)` or, under `use Enum::*`, `n => Name,`.
  const arms = [...body.matchAll(new RegExp(
    `(\\d+)\\s*=>\\s*(?:Ok\\(${enumName}::)?(\\w+)`, 'gu'))];
  if (arms.length === 0) {
    throw new Error(`the binding no longer declares ${enumName} arms`);
  }
  return Object.freeze(Object.fromEntries(arms.map(([, number, name]) =>
    [name, Number(number)])));
}

/**
 * The binding's own wire numbers.
 * @return {Object} {changeType, transition, entryType, messageType}, each
 *   name -> number.
 */
function bindingWireNumbers() {
  return Object.freeze({
    changeType: bindingArms('num_to_conf_change_type', 'ConfChangeType'),
    transition: bindingArms('num_to_conf_change_transition',
      'ConfChangeTransition'),
    entryType: bindingArms('num_to_entry_type', 'EntryType'),
    messageType: bindingArms('num_to_msg_type', 'MessageType'),
  });
}

function readOnly(dbFile, read) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    return read(independent);
  } finally {
    independent.close();
  }
}

/**
 * One replica's durable applied state, as its columns hold it.
 * @param {string} dbFile - The replica's database file.
 * @param {string} groupId - The group.
 * @return {Object|null} {appliedIndex, voters, learners, votersOutgoing,
 *   bootstrapIndex, admissionIndex} (indices as numbers or null).
 */
function durableAppliedState(dbFile, groupId) {
  return readOnly(dbFile, (db) => {
    const row = db.prepare(
      `SELECT * FROM ${RAFT_RS_TABLE.APPLIED_STATE} WHERE group_id = ?`)
      .safeIntegers(true).get(groupId);
    if (row === undefined) {
      return null;
    }
    const nullable = (value) => value === null || value === undefined ?
      null : Number(value);
    return {
      appliedIndex: Number(row.applied_index),
      voters: JSON.parse(row.voters).map(String).sort(),
      learners: JSON.parse(row.learners).map(String).sort(),
      votersOutgoing: JSON.parse(row.voters_outgoing).map(String).sort(),
      bootstrapIndex: nullable(row.bootstrap_index),
      admissionIndex: nullable(row.admission_index),
    };
  });
}

/**
 * One replica's durable hard state (O-d).
 * @param {string} dbFile - The replica's database file.
 * @param {string} groupId - The group.
 * @return {Object|null} {term, vote, commit} as decimal strings.
 */
function durableHardState(dbFile, groupId) {
  return readOnly(dbFile, (db) => {
    const row = db.prepare(
      `SELECT term, vote, commit_index FROM ${RAFT_RS_TABLE.HARD_STATE} ` +
      'WHERE group_id = ?').safeIntegers(true).get(groupId);
    return row === undefined ? null : {term: String(row.term),
      vote: String(row.vote), commit: String(row.commit_index)};
  });
}

/**
 * The durable log of one replica.
 * @param {string} dbFile - The replica's database file.
 * @param {string} groupId - The group.
 * @return {Array<Object>} {index, term, entryType, data}.
 */
function durableLog(dbFile, groupId) {
  return readOnly(dbFile, (db) => db.prepare(
    `SELECT log_index, term, entry_type, data FROM ${RAFT_RS_TABLE.LOG} ` +
    'WHERE group_id = ? ORDER BY log_index').safeIntegers(true).all(groupId)
    .map((row) => ({
      index: Number(row.log_index),
      term: Number(row.term),
      entryType: Number(row.entry_type),
      data: row.data,
    })));
}

/**
 * The replica identities one replica reserved, by raft peer id.
 * @param {string} dbFile - The replica's database file.
 * @return {Map<string, string>} peerId -> replica identity.
 */
function reservedIdentities(dbFile) {
  return readOnly(dbFile, (db) => new Map(db.prepare(
    `SELECT replica_identity, raft_peer_id FROM ${IDENTITY_TABLE}`)
    .safeIntegers(true).all()
    .map((row) => [String(row.raft_peer_id), row.replica_identity])));
}

function decoder() {
  if (decoderCore === null) {
    decoderCore = instantiateRaftRsCore();
  }
  return decoderCore;
}

/**
 * O-a: fold the durable log's conf-change entries over the test's own
 * genesis founders. Joint transitions are outside the claim and throw.
 * @param {string} dbFile - The replica whose log is folded.
 * @param {string} groupId - The group.
 * @param {Array<string>} genesisPeerIds - The founders' raft peer ids, as
 *   the test knows them.
 * @return {Array<Object>} [{index, voters, learners}] after every entry
 *   (index 0 = genesis), voters and learners sorted.
 */
function logFold(dbFile, groupId, genesisPeerIds) {
  const wire = bindingWireNumbers();
  const confChangeEntryTypes = new Set([wire.entryType.EntryConfChange,
    wire.entryType.EntryConfChangeV2]);
  const voters = new Set(genesisPeerIds.map(String));
  const learners = new Set();
  const snapshots = [{index: 0, voters: [...voters].sort(), learners: []}];
  for (const entry of durableLog(dbFile, groupId)) {
    if (confChangeEntryTypes.has(entry.entryType)) {
      const decoded = decoder().decode_conf_change_entry(
        entry.entryType, entry.data ?? undefined);
      for (const change of decoded.changes) {
        const id = String(change.nodeId);
        if (change.changeType === wire.changeType.AddNode) {
          voters.add(id);
          learners.delete(id);
        } else if (change.changeType === wire.changeType.RemoveNode) {
          voters.delete(id);
          learners.delete(id);
        } else if (change.changeType === wire.changeType.AddLearnerNode) {
          learners.add(id);
          voters.delete(id);
        } else {
          throw new Error(`unknown change type ${change.changeType}`);
        }
      }
    }
    snapshots.push({index: entry.index, voters: [...voters].sort(),
      learners: [...learners].sort()});
  }
  return snapshots;
}

/**
 * The fold's configuration at one index.
 * @param {Array<Object>} fold - What logFold returned.
 * @param {number} index - The index.
 * @return {Object} {voters, learners}.
 */
function foldAt(fold, index) {
  const at = [...fold].reverse().find((snapshot) => snapshot.index <= index);
  return {voters: at.voters, learners: at.learners};
}

export {
  bindingWireNumbers,
  durableAppliedState,
  durableHardState,
  durableLog,
  foldAt,
  logFold,
  reservedIdentities,
};
