// Private native loading owner. Only immutable integrity facts cross the
// operation port; the native facade remains inside src/raft.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

import {resolveModuleDirectory, resolvePackagedRuntimeFile} from
  '../sea/runtime-file-resolution.js';
import {
  RAFT_RS_BINDING_LAYOUT,
  RAFT_RS_BINDING_STATE,
  RAFT_RS_CORE_ERROR_MSG,
  RAFT_RS_CORE_PRIMITIVES,
  RAFT_RS_DIGEST_ALGORITHM,
  RAFT_RS_DIGEST_ENCODING,
  RAFT_RS_DIGEST_KEY,
  RAFT_RS_FORBIDDEN_CONVENIENCE,
  RAFT_RS_WASM_FILE,
} from './raft-rs-core-constants.js';
import {deepFreeze} from './raft-operation-port.js';

// Resolved when the core is first needed, never at module load: the resolver
// owns where source, the dist bundle and the SEA executable keep the binding.
function bindingFiles() {
  const {DIGEST_FROM_ROOT, SOURCE_ROOT_FROM_OWNER} = RAFT_RS_BINDING_LAYOUT;
  const digest = resolvePackagedRuntimeFile({
    moduleDir: resolveModuleDirectory(resolveModuleDirectory),
    sourceFileName: path.join(...SOURCE_ROOT_FROM_OWNER, ...DIGEST_FROM_ROOT),
    bundledFileName: path.join(...DIGEST_FROM_ROOT),
  });
  const pkg = path.join(path.dirname(digest), RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY);
  return {digest, glue: path.join(pkg, RAFT_RS_WASM_FILE.GLUE),
    wasm: path.join(pkg, RAFT_RS_WASM_FILE.WASM)};
}

function fileDigest(file) {
  return createHash(RAFT_RS_DIGEST_ALGORITHM)
    .update(fs.readFileSync(file))
    .digest(RAFT_RS_DIGEST_ENCODING);
}

function assertArtifactIntegrity(binding) {
  const digest = JSON.parse(fs.readFileSync(binding.digest, 'utf8'));
  const files = [
    [RAFT_RS_WASM_FILE.WASM, binding.wasm, digest[RAFT_RS_DIGEST_KEY.WASM]],
    [RAFT_RS_WASM_FILE.GLUE, binding.glue, digest[RAFT_RS_DIGEST_KEY.GLUE]],
  ];
  for (const [name, file, recorded] of files) {
    const actual = fileDigest(file);
    if (actual !== recorded) {
      throw new Error(
        RAFT_RS_CORE_ERROR_MSG.digestMismatch(name, recorded, actual));
    }
  }
  return Object.freeze({wasm: digest[RAFT_RS_DIGEST_KEY.WASM],
    glue: digest[RAFT_RS_DIGEST_KEY.GLUE]});
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

const RELOADED_BINDING_CHANGED = 'raft-rs loaded artifact changed within one process';
let loadedFacts = null;

function sameArtifacts(left, right) {
  return left.wasm === right.wasm && left.glue === right.glue;
}

function instantiateRaftRsCore(binding = bindingFiles()) {
  const before = assertArtifactIntegrity(binding);
  if (loadedFacts !== null && !sameArtifacts(loadedFacts.artifactDigests, before)) {
    throw new Error(RELOADED_BINDING_CHANGED);
  }
  const requireBinding = createRequire(binding.glue);
  delete requireBinding.cache[requireBinding.resolve(binding.glue)];
  const facade = facadeOf(requireBinding(binding.glue));
  const after = assertArtifactIntegrity(binding);
  if (!sameArtifacts(before, after)) {
    throw new Error(RELOADED_BINDING_CHANGED);
  }
  loadedFacts = deepFreeze({state: RAFT_RS_BINDING_STATE.VERIFIED,
    digestFile: binding.digest, artifactDigests: before});
  return facade;
}

// The core's own integrity check and load, answered as a state for the dry
// run; the loaded facade is discarded and never entered.
function verifyRaftRsBinding() {
  // A census names the code already loaded by this process. A filesystem
  // edit never relabels it; a future actual reload checks the pinned bytes.
  if (loadedFacts !== null) {
    return loadedFacts;
  }
  const binding = bindingFiles();
  const found = {digestFile: binding.digest};
  try {
    instantiateRaftRsCore(binding);
    return loadedFacts;
  } catch (error) {
    return deepFreeze({state: RAFT_RS_BINDING_STATE.UNAVAILABLE, ...found,
      reason: String(error?.message || error)});
  }
}


export {instantiateRaftRsCore, verifyRaftRsBinding};
