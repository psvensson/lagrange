// Test-only access to the vendored binding. Production binding ownership is
// intentionally restricted to raft-rs-runtime-owner.js; these helpers keep
// the historical phase probes capable of driving the underlying crate.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  RAFT_RS_CORE_ERROR_MSG,
  RAFT_RS_CORE_PRIMITIVES,
  RAFT_RS_DIGEST_ALGORITHM,
  RAFT_RS_DIGEST_ENCODING,
  RAFT_RS_DIGEST_KEY,
  RAFT_RS_FORBIDDEN_CONVENIENCE,
  RAFT_RS_WASM_FILE,
} from '../../../src/raft/raft-rs-core-constants.js';
import {
  RAFT_RS_GROUP_ERROR_MSG,
  RAFT_RS_GROUP_TUNING,
  RAFT_RS_INITIAL_APPLIED,
} from '../../../src/raft/raft-rs-group-constants.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BINDING_ROOT = path.join(
  REPOSITORY_ROOT,
  RAFT_RS_WASM_FILE.VENDOR_DIRECTORY,
  RAFT_RS_WASM_FILE.DIRECTORY,
);
const PACKAGE_ROOT = path.join(
  BINDING_ROOT, RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY);
const GLUE_FILE = path.join(PACKAGE_ROOT, RAFT_RS_WASM_FILE.GLUE);
const WASM_FILE = path.join(PACKAGE_ROOT, RAFT_RS_WASM_FILE.WASM);
const DIGEST_FILE = path.join(BINDING_ROOT, RAFT_RS_WASM_FILE.DIGEST);
const requireBinding = createRequire(import.meta.url);
let loadedCore = null;

function fileDigest(file) {
  return createHash(RAFT_RS_DIGEST_ALGORITHM)
    .update(fs.readFileSync(file))
    .digest(RAFT_RS_DIGEST_ENCODING);
}

function readArtifactDigest() {
  return JSON.parse(fs.readFileSync(DIGEST_FILE, 'utf8'));
}

function facadeOf(binding) {
  for (const name of RAFT_RS_FORBIDDEN_CONVENIENCE) {
    if (name in binding) {
      throw new Error(RAFT_RS_CORE_ERROR_MSG.forbiddenConvenience(name));
    }
  }
  const facade = {};
  for (const name of RAFT_RS_CORE_PRIMITIVES) {
    if (typeof binding[name] !== 'function') {
      throw new Error(RAFT_RS_CORE_ERROR_MSG.missingPrimitive(name));
    }
    facade[name] = (...args) => binding[name](...args);
  }
  return Object.freeze(facade);
}

function instantiateRaftRsCore() {
  const digest = readArtifactDigest();
  for (const [name, file, recorded] of [
    [RAFT_RS_WASM_FILE.WASM, WASM_FILE, digest[RAFT_RS_DIGEST_KEY.WASM]],
    [RAFT_RS_WASM_FILE.GLUE, GLUE_FILE, digest[RAFT_RS_DIGEST_KEY.GLUE]],
  ]) {
    const actual = fileDigest(file);
    if (actual !== recorded) {
      throw new Error(
        RAFT_RS_CORE_ERROR_MSG.digestMismatch(name, recorded, actual));
    }
  }
  delete requireBinding.cache[requireBinding.resolve(GLUE_FILE)];
  return facadeOf(requireBinding(GLUE_FILE));
}

function loadRaftRsCore() {
  if (loadedCore === null) {
    loadedCore = instantiateRaftRsCore();
  }
  return loadedCore;
}

function raftRsBindingPaths() {
  return Object.freeze({
    root: BINDING_ROOT,
    glue: GLUE_FILE,
    wasm: WASM_FILE,
    digest: DIGEST_FILE,
    buildDoc: path.join(BINDING_ROOT, RAFT_RS_WASM_FILE.BUILD_DOC),
    crateSource: path.join(
      BINDING_ROOT, RAFT_RS_WASM_FILE.CRATE_SOURCE_DIRECTORY),
    forkSource: path.join(
      BINDING_ROOT,
      RAFT_RS_WASM_FILE.FORK_SOURCE_DIRECTORY,
      RAFT_RS_WASM_FILE.FORK_SOURCE_FILE),
  });
}

function tuningOf(tuning = {}) {
  return {
    electionTick: tuning.electionTick ?? RAFT_RS_GROUP_TUNING.ELECTION_TICK,
    heartbeatTick: tuning.heartbeatTick ?? RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK,
    preVote: tuning.preVote ?? RAFT_RS_GROUP_TUNING.PRE_VOTE,
    checkQuorum: tuning.checkQuorum ?? RAFT_RS_GROUP_TUNING.CHECK_QUORUM,
  };
}

function createRaftRsGroup({core, store, groupId, peerId, voters,
  learners = [], tuning}) {
  const handle = core.create_node({
    id: peerId,
    peers: voters,
    learners,
    applied: RAFT_RS_INITIAL_APPLIED,
    ...tuningOf(tuning),
  });
  store.putAppliedState(
    groupId, RAFT_RS_INITIAL_APPLIED, core.conf_state(handle));
  return handle;
}

function restoreRaftRsGroup({core, store, groupId, peerId, tuning}) {
  const record = store.readDurableRecord(groupId);
  if (record.hardState === null && record.entries.length === 0 &&
      record.confState.voters.length === 0) {
    throw new Error(RAFT_RS_GROUP_ERROR_MSG.noDurableRecord(groupId));
  }
  return core.create_node({
    id: peerId,
    peers: [],
    learners: [],
    applied: record.appliedIndex,
    ...tuningOf(tuning),
    bootstrap: {
      confState: record.confState,
      entries: record.entries,
      ...(record.hardState === null ? {} : {hardState: record.hardState}),
      ...(record.snapshot === null ? {} : {snapshot: record.snapshot}),
    },
  });
}

export {
  createRaftRsGroup,
  fileDigest,
  instantiateRaftRsCore,
  loadRaftRsCore,
  raftRsBindingPaths,
  readArtifactDigest,
  restoreRaftRsGroup,
};
