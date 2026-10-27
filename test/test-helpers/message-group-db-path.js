/**
 * Durable database paths for message-group replicas built by tests.
 *
 * A MessageGroupService keeps its consensus record (term, vote, log,
 * configuration, applied progress) in its own durable database and refuses a
 * missing or in-memory dbPath. Suites get one scratch directory per process
 * under the OS temp directory and a distinct database file per constructed
 * replica; a suite that restarts a replica passes the same path explicitly.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const SCRATCH_PREFIX = 'lagrange-message-group-';
const DB_FILE_SUFFIX = '.db';
const UNSAFE_PATH_CHARACTERS = /[^A-Za-z0-9._-]/gu;
const UNSAFE_REPLACEMENT = '_';
const DEFAULT_GROUP = 'group';
const DEFAULT_REPLICA = 'replica';

let scratchRoot = null;
let sequence = 0;

function resolveScratchRoot() {
  if (scratchRoot === null) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), SCRATCH_PREFIX));
    process.once('exit', () => {
      fs.rmSync(root, {recursive: true, force: true});
    });
    scratchRoot = root;
  }
  return scratchRoot;
}

function pathSegment(value, fallback) {
  const text = typeof value === 'string' && value.length > 0 ? value : fallback;
  return text.replace(UNSAFE_PATH_CHARACTERS, UNSAFE_REPLACEMENT);
}

/**
 * A fresh database path for one replica (the file is created by the replica
 * when it initializes).
 * @param {string} [groupId] - The replica's group.
 * @param {string} [replicaId] - The replica.
 * @return {string} An absolute path no other replica of this process uses.
 */
function messageGroupTestDbPath(groupId, replicaId) {
  sequence += 1;
  return path.join(resolveScratchRoot(), String(sequence),
    pathSegment(groupId, DEFAULT_GROUP),
    `${pathSegment(replicaId, DEFAULT_REPLICA)}${DB_FILE_SUFFIX}`);
}

/**
 * The replica's options with a fresh durable dbPath, unless they name one.
 * @param {Object} [options] - MessageGroupService options.
 * @return {Object} The options carrying a dbPath.
 */
function withTestDbPath(options = {}) {
  if (options.dbPath !== undefined) {
    return options;
  }
  return {
    ...options,
    dbPath: messageGroupTestDbPath(options.groupId, options.replicaId),
  };
}

export {messageGroupTestDbPath, withTestDbPath};
