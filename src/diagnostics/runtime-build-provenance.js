// One immutable boot measurement. The release owner consumes these facts;
// requests and environment values can compare with them, never supply them.
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {isSea} from 'node:sea';
import Database from 'better-sqlite3';
import {resolveModuleDirectory} from '../sea/runtime-file-resolution.js';
import {verifyRaftRsBinding} from '../raft/raft-rs-operation-port.js';
import {RAFT_RS_BINDING_STATE} from '../raft/raft-rs-core-constants.js';
import {executionEnvelopeOf} from '../partition/partition-transaction-execution-envelope.js';
import {computeContentRecordsFingerprint} from './source-fingerprint.js';
import {RUNTIME_BUILD_MANIFEST, measurePackagedDependencies, measureRuntimeContent} from
  './runtime-content-fingerprint.js';

const RUNTIME_BUILD_STATE = Object.freeze({MEASURED: 'measured', UNAVAILABLE: 'unavailable'});
const DIGEST = 'sha256';
const ENCODING = 'hex';
const SQLITE_ADDON = 'better_sqlite3.node';
const SOURCE_DIRECTORY = 'diagnostics';
const MAIN_BUNDLE = 'index.bundle.cjs';
const SQLITE_ADDON_UNAVAILABLE = 'runtime SQLite addon identity unavailable';
const NATIVE_BINDING_UNAVAILABLE = 'runtime Raft binding identity unavailable';
let bootMeasurement = null;

async function digestFile(file) {
  return createHash(DIGEST).update(await readFile(file)).digest(ENCODING);
}

async function sqliteFacts(moduleDirectory) {
  const db = new Database(':memory:');
  try {
    const require = createRequire(path.join(moduleDirectory, MAIN_BUNDLE));
    const loaded = Object.keys(require.cache)
      .filter((file) => path.basename(file) === SQLITE_ADDON);
    if (loaded.length !== 1) throw new Error(SQLITE_ADDON_UNAVAILABLE);
    return Object.freeze({addonDigest: await digestFile(loaded[0]),
      envelope: executionEnvelopeOf(db)});
  } finally {
    db.close();
  }
}

async function contentFacts(moduleDirectory) {
  if (!isSea() && path.basename(moduleDirectory) === SOURCE_DIRECTORY) {
    return measureRuntimeContent(path.resolve(moduleDirectory, '..', '..'));
  }
  const root = isSea() ? path.dirname(process.execPath) : moduleDirectory;
  const manifestBytes = await readFile(path.join(root, RUNTIME_BUILD_MANIFEST));
  const manifest = JSON.parse(manifestBytes);
  const artifact = isSea() ? process.execPath : path.join(root, MAIN_BUNDLE);
  await stat(artifact);
  return Object.freeze({sourceDigest: manifest.sourceDigest,
    manifestDigest: createHash(DIGEST).update(manifestBytes).digest(ENCODING),
    dependencyDigest: await measurePackagedDependencies(root),
    artifactDigest: await digestFile(artifact)});
}

async function measureBoot() {
  try {
    const moduleDirectory = resolveModuleDirectory(resolveModuleDirectory);
    const raft = verifyRaftRsBinding();
    if (raft.state !== RAFT_RS_BINDING_STATE.VERIFIED) {
      throw new Error(NATIVE_BINDING_UNAVAILABLE);
    }
    const content = await contentFacts(moduleDirectory);
    const sqlite = await sqliteFacts(moduleDirectory);
    const facts = Object.freeze({content, raft: raft.artifactDigests, sqlite,
      executableDigest: await digestFile(process.execPath)});
    const digest = computeContentRecordsFingerprint([
      {relativePath: RUNTIME_BUILD_MANIFEST, content: Buffer.from(JSON.stringify(facts))},
    ]);
    return Object.freeze({state: RUNTIME_BUILD_STATE.MEASURED, digest, ...facts});
  } catch (error) {
    return Object.freeze({state: RUNTIME_BUILD_STATE.UNAVAILABLE,
      digest: null, reason: String(error?.message ?? error)});
  }
}

function runtimeBuildProvenance() {
  bootMeasurement ??= measureBoot();
  return bootMeasurement;
}

export {RUNTIME_BUILD_STATE, runtimeBuildProvenance};
