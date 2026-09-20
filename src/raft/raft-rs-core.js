// The loader for the raft-rs 0.7 WASM core.
//
// It does three things and nothing else: it checks the artifact it is about to
// load is the artifact `artifact-digest.json` records, it loads the
// wasm-pack glue (CommonJS, so through createRequire), and it hands back a
// frozen facade carrying exactly the phase-1 primitives. The facade is a
// projection of the binding's own exports; it adds no behaviour, so nothing
// here can answer a question the core did not answer.
//
// One runtime holds many groups: the glue is loaded once per process and every
// group is a handle inside it.

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
} from './raft-rs-core-constants.js';

// The binding is generated and vendored material, not source: it lives under
// the repository's `vendor/` root, outside the tree the package ships as code
// and outside every source checker's walk. This module is `src/raft/<file>`,
// so the repository root is two directories up.
const REPOSITORY_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  RAFT_RS_WASM_FILE.PARENT_OF_SOURCE_ROOT,
  RAFT_RS_WASM_FILE.PARENT_OF_SOURCE_ROOT,
);
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
const TEXT_ENCODING = 'utf8';

const requireBinding = createRequire(import.meta.url);

let loadedCore = null;

/**
 * The sha256 of one file of the binding.
 * @param {string} file - Absolute path.
 * @return {string} Lowercase hex digest.
 */
function fileDigest(file) {
  return createHash(RAFT_RS_DIGEST_ALGORITHM)
    .update(fs.readFileSync(file))
    .digest(RAFT_RS_DIGEST_ENCODING);
}

/**
 * Read the recorded provenance of the checked-in artifact.
 * @return {Object} The parsed artifact-digest.json.
 */
function readArtifactDigest() {
  return JSON.parse(fs.readFileSync(DIGEST_FILE, TEXT_ENCODING));
}

/**
 * Refuse to load an artifact that is not the recorded one.
 * @param {Object} digest - The parsed artifact-digest.json.
 */
function assertArtifactIntegrity(digest) {
  const files = [
    [RAFT_RS_WASM_FILE.WASM, WASM_FILE, digest[RAFT_RS_DIGEST_KEY.WASM]],
    [RAFT_RS_WASM_FILE.GLUE, GLUE_FILE, digest[RAFT_RS_DIGEST_KEY.GLUE]],
  ];
  for (const [name, file, recorded] of files) {
    const actual = fileDigest(file);
    if (actual !== recorded) {
      throw new Error(
        RAFT_RS_CORE_ERROR_MSG.digestMismatch(name, recorded, actual));
    }
  }
}

/**
 * Project the binding's exports onto exactly the phase-1 primitives, and
 * refuse a binding that has grown a membership convenience call.
 * @param {Object} binding - The loaded wasm-pack glue module.
 * @return {Object} A frozen facade.
 */
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

/**
 * Build a NEW runtime: a fresh module registration, and with it a fresh
 * WebAssembly instance and its own linear memory.
 *
 * A trap leaves the runtime it happened in unusable (binding direction §8),
 * and a runtime is replaced rather than repaired. The glue is CommonJS and
 * instantiates its module at require time, so dropping its cache entry is
 * what makes the next require a new instance.
 * @return {Object} A frozen primitive facade over a new instance.
 */
function instantiateRaftRsCore() {
  assertArtifactIntegrity(readArtifactDigest());
  delete requireBinding.cache[requireBinding.resolve(GLUE_FILE)];
  return facadeOf(requireBinding(GLUE_FILE));
}

/**
 * Load the raft-rs core, once per process.
 * @return {Object} The frozen phase-1 primitive facade.
 */
function loadRaftRsCore() {
  if (loadedCore === null) {
    loadedCore = instantiateRaftRsCore();
  }
  return loadedCore;
}

/**
 * Where the binding lives, for provenance checks that read its files.
 * @return {Object} Absolute paths to the binding's parts.
 */
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

export {
  fileDigest,
  instantiateRaftRsCore,
  loadRaftRsCore,
  raftRsBindingPaths,
  readArtifactDigest,
};
