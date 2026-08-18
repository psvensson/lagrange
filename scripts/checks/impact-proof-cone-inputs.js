// Input loading and full-escalation helpers for the impact proof-cone
// selector (developer-velocity epic). Same owner as impact-proof-cone.js;
// extracted to keep selectProofCone within the complexity budget. No
// selection policy lives here — only input reads, freshness evaluation, and
// the full-census escalation constructor.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  OWNER_DEBT,
  OWNER_DEBT_RESOLVER_STATE,
} from '../global-owner-debt-inventory/constants.js';
import {
  importGraphResolverStateDigest,
  javascriptSourceDigest,
  listImportGraphInputFiles,
  listJavaScriptFiles,
  normalizePathThroughSymlinkedRoot,
} from '../global-owner-debt-inventory/helpers.js';
import {
  COVERAGE_MINIMUM_TEST_SHARE,
  COVERAGE_SCHEMA_VERSION,
  ESCALATION_RULE_ABSENT_COVERAGE,
  ESCALATION_RULE_INSUFFICIENT_COVERAGE,
  ESCALATION_RULE_STALE_COVERAGE,
  IMPORT_GRAPH_PATH,
  IMPORT_GRAPH_SEAL_PATH,
  PROOF_CONE_CONTRACTS_PATH,
  PROOF_CONE_COVERAGE_PATH,
  REASON_ESCALATION,
} from './impact-proof-cone-constants.js';
import {
  PRIMARY_CLASS_MANIFEST_PATH,
  buildManifest as buildPrimaryManifest,
  loadManifest as loadPrimaryManifest,
  verifyManifest as verifyPrimaryManifest,
} from './test-primary-classification.js';

const UTF8_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const INPUT_STATE_INVALID = 'invalid';
const INPUT_STATE_MISSING = 'missing';
const IMPORT_GRAPH_INPUT_NAME = 'import graph';
const COVERAGE_INPUT_NAME = 'coverage snapshot';
const PRIMARY_FALLBACK_PROBLEM_PREFIX =
  'primary classification fallback could not derive the live census: ';
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const JAVASCRIPT_OWNER_PATH_PATTERN = /^(?:src|scripts|test)\/.+\.(?:c|m)?js$/u;
const objectEntries = Object.entries;
const objectKeys = Object.keys;
const objectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayReduce = Function.call.bind(Array.prototype.reduce);
const numberIsSafeInteger = Number.isSafeInteger;
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);
const IMPORT_GRAPH_SEAL_SCHEMA_VERSION = 1;
const COVERED_PATH_PATTERN =
  /^(?:(?:src|scripts)\/.+\.(?:c|m)?js|test\/.+\.test\.js)$/u;
const BACKSLASH = '\\';
const LIVE_GRAPH_VALIDATION_ATTEMPTS = 2;
const LIVE_GRAPH_DRIFT_PROBLEM =
  'import graph inputs changed during live validation';
const REGULAR_FILE_IDENTITY = 'regular';
const RESOLVER_TARGET_FIELD = 'target';
const FOLLOWED_FILE_DIGESTS_FIELD = 'followedFileDigests';
const FOLLOWED_FILE_READ_CHUNK_BYTES = 64 * 1024;
const FOLLOWED_FILE_PROBLEM_PREFIX = 'import graph followed file';
const PARENT_PATH_SEGMENT = '..';
const PARENT_PATH_PREFIX = '../';
const FILE_NOT_FOUND_ERROR_CODE = 'ENOENT';
const PATH_COMPONENT_NOT_DIRECTORY_ERROR_CODE = 'ENOTDIR';
const DIGEST_MAP_PROBLEM_SUFFIX =
  'must map paths to canonical SHA-256 digests';
const COVERAGE_OPEN_FLAGS = fs.constants.O_RDONLY |
  (fs.constants.O_NOFOLLOW || 0);
const COVERAGE_MAX_FILE_BYTES = 16 * 1024 * 1024;
const liveGraphValidationCache = new Map();

export function currentFileDigest(root, relPath) {
  const absolute = path.join(root, relPath);
  try {
    if (!fs.statSync(absolute).isFile()) return null;
    return crypto.createHash(HASH_ALGORITHM)
      .update(fs.readFileSync(absolute)).digest(HASH_ENCODING);
  } catch {
    return null;
  }
}

export function readJsonInput(root, relPath) {
  const absolute = path.join(root, relPath);
  if (!fs.existsSync(absolute)) {
    return {
      ok: false,
      state: INPUT_STATE_MISSING,
      problem: `missing required input: ${relPath}`,
    };
  }
  try {
    return {ok: true, value: JSON.parse(fs.readFileSync(absolute, UTF8_ENCODING))};
  } catch (error) {
    return {
      ok: false,
      state: INPUT_STATE_INVALID,
      problem: `invalid JSON in ${relPath}: ${error.message}`,
    };
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArrayMapProblem(value, inputName) {
  if (!isRecord(value)) return `${inputName} must be an object`;
  for (const [key, entries] of objectEntries(value)) {
    if (!Array.isArray(entries) ||
        arraySome(entries, (entry) => typeof entry !== 'string')) {
      return `${inputName}.${key} must be an array of paths`;
    }
  }
  return null;
}

function digestMapProblem(value, inputName) {
  if (!isRecord(value)) return `${inputName} must be an object`;
  if (arraySome(objectEntries(value), ([, digest]) =>
    typeof digest !== 'string' || !regExpTest(DIGEST_PATTERN, digest))) {
    return `${inputName} must map paths to canonical SHA-256 digests`;
  }
  return null;
}

function sameStringSet(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === right.length &&
    !arraySome(right, (entry) => !expected.has(entry));
}

function degreeMapProblem(value) {
  if (!isRecord(value.degrees) ||
      objectKeys(value.degrees).length !== value.moduleCount) {
    return `${IMPORT_GRAPH_INPUT_NAME} module count does not match degree evidence`;
  }
  for (const [module, degree] of objectEntries(value.degrees)) {
    if (!isRecord(degree) || !numberIsSafeInteger(degree.in) || degree.in < 0 ||
        !numberIsSafeInteger(degree.out) || degree.out < 0) {
      return `${IMPORT_GRAPH_INPUT_NAME}.degrees.${module} must contain non-negative in/out counts`;
    }
  }
  for (const filePath of objectKeys(value.fileDigests)) {
    if (!objectHasOwn(value.degrees, filePath)) {
      return `${IMPORT_GRAPH_INPUT_NAME} lacks degree evidence for ${filePath}`;
    }
  }
  return null;
}

function importerEvidenceProblem(value) {
  let resolvedEdges = 0;
  for (const [target, importers] of objectEntries(value.importers)) {
    if (!objectHasOwn(value.degrees, target)) {
      return `${IMPORT_GRAPH_INPUT_NAME} names an unknown target module: ${target}`;
    }
    const unique = new Set(importers);
    if (unique.size !== importers.length) {
      return `${IMPORT_GRAPH_INPUT_NAME} repeats importer evidence for ${target}`;
    }
    for (const importer of importers) {
      if (!objectHasOwn(value.degrees, importer)) {
        return `${IMPORT_GRAPH_INPUT_NAME} names an unknown importer module: ${importer}`;
      }
    }
    if (value.degrees[target].in !== importers.length) {
      return `${IMPORT_GRAPH_INPUT_NAME} inbound degree disagrees for ${target}`;
    }
    resolvedEdges += importers.length;
  }
  const inboundEdges = arrayReduce(
    objectEntries(value.degrees), (total, [, degree]) => total + degree.in, 0);
  const outboundEdges = arrayReduce(
    objectEntries(value.degrees), (total, [, degree]) => total + degree.out, 0);
  if (inboundEdges !== resolvedEdges || outboundEdges !== value.edgeCount ||
      value.edgeCount !== resolvedEdges + value.unresolvedCount) {
    return `${IMPORT_GRAPH_INPUT_NAME} edge counts do not match degree/importer evidence`;
  }
  return null;
}

function graphCountProblem(value) {
  const counts = [value.moduleCount, value.edgeCount, value.unresolvedCount];
  if (arraySome(counts, (count) => !numberIsSafeInteger(count) || count < 0)) {
    return `${IMPORT_GRAPH_INPUT_NAME} counts must be non-negative safe integers`;
  }
  if (value.moduleCount === 0 || value.edgeCount === 0) {
    return `${IMPORT_GRAPH_INPUT_NAME} must contain modules and dependency edges`;
  }
  if (objectKeys(value.fileDigests).length === 0 ||
      objectKeys(value.fileDigests).length > value.moduleCount) {
    return `${IMPORT_GRAPH_INPUT_NAME} file census does not match module evidence`;
  }
  return degreeMapProblem(value) || importerEvidenceProblem(value);
}

function updateIdentityField(hash, value) {
  hash.update(String(value)).update(OWNER_DEBT.nullSeparator);
}

function captureLiveInputIdentity(root, value) {
  try {
    const producerInputs = listImportGraphInputFiles(root);
    const resolverStateDigest = importGraphResolverStateDigest(
      root, value.resolverInputs);
    const expectedFollowed = expectedFollowedFilePaths(root, value);
    if (!expectedFollowed.ok) return expectedFollowed;
    const followed = stableFollowedFileDigests(root, expectedFollowed.paths);
    if (!followed.ok) return followed;
    const hash = crypto.createHash(HASH_ALGORITHM);
    updateIdentityField(hash, value.snapshotDigest);
    updateIdentityField(hash, resolverStateDigest);
    for (const filePath of expectedFollowed.paths) {
      updateIdentityField(hash, filePath);
      updateIdentityField(hash, followed.digests[filePath]);
    }
    for (const filePath of producerInputs) {
      const absolute = path.join(root, filePath);
      const stat = fs.lstatSync(absolute, {bigint: true});
      updateIdentityField(hash, filePath);
      updateIdentityField(hash, stat.dev);
      updateIdentityField(hash, stat.ino);
      updateIdentityField(hash, stat.mode);
      updateIdentityField(hash, stat.size);
      updateIdentityField(hash, stat.mtimeNs);
      updateIdentityField(hash, stat.ctimeNs);
      updateIdentityField(hash, stat.isSymbolicLink() ?
        fs.readlinkSync(absolute) : REGULAR_FILE_IDENTITY);
    }
    return {
      ok: true,
      identity: hash.digest(HASH_ENCODING),
      followedFileDigests: followed.digests,
      producerInputs,
      resolverStateDigest,
    };
  } catch (error) {
    return {ok: false, problem: `${LIVE_GRAPH_DRIFT_PROBLEM}: ${error.message}`};
  }
}

function resolverProbeProblem(value, probe) {
  if (!isRecord(probe) || typeof probe.from !== 'string' ||
      typeof probe.specifier !== 'string' || probe.specifier.length === 0 ||
      !objectHasOwn(value.degrees, probe.from)) {
    return `${IMPORT_GRAPH_INPUT_NAME} contains an invalid resolver probe`;
  }
  if (probe.state === OWNER_DEBT_RESOLVER_STATE.resolved) {
    return typeof probe.target !== 'string' ||
      !objectHasOwn(value.degrees, probe.target) ?
      `${IMPORT_GRAPH_INPUT_NAME} contains an invalid resolver probe` : null;
  }
  // Semantic edge state is three-valued; the aggregate ACCOUNTING stays
  // two-valued. An optional external is structurally identical to an
  // unresolved probe - it carries no target, because it is deliberately never
  // followed - so it validates the same way here and projects into the same
  // unresolved term. Only the state name distinguishes an intentional absence
  // from an ordinary failed resolution, and nothing downstream has to learn a
  // third arithmetic category to reconcile the graph.
  const carriesNoTarget =
    probe.state === OWNER_DEBT_RESOLVER_STATE.unresolved ||
    probe.state === OWNER_DEBT_RESOLVER_STATE.optionalExternal;
  if (!carriesNoTarget || objectHasOwn(probe, RESOLVER_TARGET_FIELD)) {
    return `${IMPORT_GRAPH_INPUT_NAME} contains an invalid resolver probe`;
  }
  return null;
}

function resolverInputsProblem(value) {
  if (!Array.isArray(value.resolverInputs)) {
    return `${IMPORT_GRAPH_INPUT_NAME}.resolverInputs must be an array`;
  }
  const identities = new Set();
  for (const probe of value.resolverInputs) {
    const probeProblem = resolverProbeProblem(value, probe);
    if (probeProblem) return probeProblem;
    const identity = JSON.stringify([probe.from, probe.specifier]);
    if (identities.has(identity)) {
      return `${IMPORT_GRAPH_INPUT_NAME} repeats a resolver probe`;
    }
    identities.add(identity);
  }
  if (typeof value.resolverStateDigest !== 'string' ||
      !regExpTest(DIGEST_PATTERN, value.resolverStateDigest)) {
    return `${IMPORT_GRAPH_INPUT_NAME}.resolverStateDigest must be a canonical SHA-256 digest`;
  }
  return null;
}

function isCanonicalGraphPath(filePath) {
  return typeof filePath === 'string' && filePath.length > 0 &&
    !path.posix.isAbsolute(filePath) && path.posix.normalize(filePath) === filePath &&
    filePath !== PARENT_PATH_SEGMENT &&
    !stringStartsWith(filePath, PARENT_PATH_PREFIX) &&
    !stringIncludes(filePath, BACKSLASH);
}

function canonicalFollowedFilePath(root, rootReal, modulePath) {
  if (!isCanonicalGraphPath(modulePath)) {
    return {problem: `${FOLLOWED_FILE_PROBLEM_PREFIX} module path is noncanonical: ` +
      modulePath};
  }
  let realTarget;
  let stat;
  try {
    realTarget = fs.realpathSync(path.join(rootReal, modulePath));
    stat = fs.statSync(realTarget);
  } catch (error) {
    if (error.code === FILE_NOT_FOUND_ERROR_CODE ||
        error.code === PATH_COMPONENT_NOT_DIRECTORY_ERROR_CODE) {
      return {path: null};
    }
    return {problem: `${FOLLOWED_FILE_PROBLEM_PREFIX} census is unreadable: ` +
      error.message};
  }
  if (!stat.isFile()) return {path: null};
  const relative = stringReplaceAll(
    path.relative(rootReal, realTarget), path.sep, OWNER_DEBT.pathSeparator);
  if (isCanonicalGraphPath(relative)) {
    return {path: relative};
  }
  // A followed file reached through a symlinked directory under root (the
  // publish gate links node_modules into a temporary worktree) realpaths to
  // the symlink target outside root; remap it to the canonical logical
  // location so the validator agrees with the producer's census.
  const remapped = normalizePathThroughSymlinkedRoot(root, realTarget);
  return isCanonicalGraphPath(remapped) ? {path: remapped} : {path: null};
}

function expectedFollowedFilePaths(root, value) {
  let rootReal;
  try {
    rootReal = fs.realpathSync(root);
  } catch (error) {
    return {ok: false, problem: `${FOLLOWED_FILE_PROBLEM_PREFIX} root is unreadable: ` +
      error.message};
  }
  const paths = new Set();
  for (const modulePath of objectKeys(value.degrees)) {
    const canonical = canonicalFollowedFilePath(root, rootReal, modulePath);
    if (canonical.problem) return {ok: false, problem: canonical.problem};
    if (canonical.path && !objectHasOwn(value.fileDigests, canonical.path)) {
      paths.add(canonical.path);
    }
  }
  return {ok: true, paths: [...paths].sort()};
}

function captureFollowedFileIdentitySet(root, followedPaths) {
  const identities = new Map();
  for (const filePath of followedPaths) {
    let captured;
    try {
      captured = captureCoveragePathIdentity(root, filePath);
    } catch {
      return {ok: false,
        problem: `${FOLLOWED_FILE_PROBLEM_PREFIX} is not live: ${filePath}`};
    }
    if (!captured.ok || !mergeCoverageIdentities(
      identities, captured.identities)) {
      return {ok: false,
        problem: `${FOLLOWED_FILE_PROBLEM_PREFIX} inputs changed during validation`};
    }
  }
  return {ok: true, identities};
}

function descriptorDigest(descriptor, size) {
  const hash = crypto.createHash(HASH_ALGORITHM);
  const buffer = Buffer.alloc(Math.min(FOLLOWED_FILE_READ_CHUNK_BYTES, size));
  let offset = 0;
  while (offset < size) {
    const length = Math.min(buffer.length, size - offset);
    const bytesRead = fs.readSync(descriptor, buffer, 0, length, offset);
    if (!numberIsSafeInteger(bytesRead) || bytesRead <= 0 || bytesRead > length) {
      return null;
    }
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return hash.digest(HASH_ENCODING);
}

function readStableFollowedFileDigest(root, filePath, identities) {
  const expected = identities.get(filePath);
  let descriptor;
  let digest = null;
  try {
    descriptor = fs.openSync(path.join(root, filePath), COVERAGE_OPEN_FLAGS);
    const before = fs.fstatSync(descriptor, {bigint: true});
    if (sameCoverageIdentity(expected, before) && before.isFile() &&
        before.size >= 0n && before.size <= BigInt(Number.MAX_SAFE_INTEGER)) {
      const size = Number(before.size);
      const first = descriptorDigest(descriptor, size);
      const between = fs.fstatSync(descriptor, {bigint: true});
      const repeated = descriptorDigest(descriptor, size);
      const after = fs.fstatSync(descriptor, {bigint: true});
      if (first && first === repeated && sameCoverageIdentity(before, between) &&
          sameCoverageIdentity(between, after)) digest = first;
    }
  } catch {
    digest = null;
  }
  if (descriptor !== undefined && !closeCoverageDescriptor(descriptor)) return null;
  return digest;
}

function stableFollowedFileDigests(root, followedPaths) {
  const before = captureFollowedFileIdentitySet(root, followedPaths);
  if (!before.ok) return before;
  const digests = Object.create(null);
  for (const filePath of followedPaths) {
    const digest = readStableFollowedFileDigest(root, filePath, before.identities);
    if (!digest) {
      return {ok: false,
        problem: `${FOLLOWED_FILE_PROBLEM_PREFIX} inputs changed during validation`};
    }
    digests[filePath] = digest;
  }
  const after = captureFollowedFileIdentitySet(root, followedPaths);
  if (!after.ok || before.identities.size !== after.identities.size ||
      arraySome([...before.identities], ([filePath, identity]) =>
        !sameCoverageIdentity(identity, after.identities.get(filePath)))) {
    return {ok: false,
      problem: `${FOLLOWED_FILE_PROBLEM_PREFIX} inputs changed during validation`};
  }
  return {ok: true, digests};
}

function followedFileDigestsProblem(root, value) {
  const followed = value[FOLLOWED_FILE_DIGESTS_FIELD];
  if (!isRecord(followed)) {
    return `${IMPORT_GRAPH_INPUT_NAME}.${FOLLOWED_FILE_DIGESTS_FIELD} ` +
      DIGEST_MAP_PROBLEM_SUFFIX;
  }
  const shapeProblem = digestMapProblem(
    followed, `${IMPORT_GRAPH_INPUT_NAME}.${FOLLOWED_FILE_DIGESTS_FIELD}`);
  if (shapeProblem) return shapeProblem;
  const recordedPaths = objectKeys(followed);
  if (arraySome(recordedPaths, (filePath) => !isCanonicalGraphPath(filePath))) {
    return `${FOLLOWED_FILE_PROBLEM_PREFIX} census contains a noncanonical path`;
  }
  if (arraySome(recordedPaths, (filePath) =>
    objectHasOwn(value.fileDigests, filePath))) {
    return `${FOLLOWED_FILE_PROBLEM_PREFIX} census is not exact`;
  }
  const expectedBefore = expectedFollowedFilePaths(root, value);
  if (!expectedBefore.ok) return expectedBefore.problem;
  if (!sameStringSet(recordedPaths, expectedBefore.paths)) {
    return `${FOLLOWED_FILE_PROBLEM_PREFIX} census is not exact`;
  }
  return null;
}

function uncachedLiveGraphProblem(root, value, captured) {
  for (const [filePath, digest] of
    objectEntries(captured.followedFileDigests)) {
    if (value.followedFileDigests[filePath] !== digest) {
      return `${FOLLOWED_FILE_PROBLEM_PREFIX} content is stale: ${filePath}`;
    }
  }
  const files = listJavaScriptFiles(root);
  const graphFiles = objectKeys(value.fileDigests);
  if (!sameStringSet(files, graphFiles)) {
    return `${IMPORT_GRAPH_INPUT_NAME} file census does not match live JavaScript sources`;
  }
  for (const filePath of files) {
    if (value.fileDigests[filePath] !== currentFileDigest(root, filePath)) {
      return `${IMPORT_GRAPH_INPUT_NAME} has stale content for ${filePath}`;
    }
  }
  if (value.sourceDigest !== javascriptSourceDigest(root, files)) {
    return `${IMPORT_GRAPH_INPUT_NAME}.sourceDigest does not bind live JavaScript sources`;
  }
  if (value.producerInputDigest !==
      javascriptSourceDigest(root, captured.producerInputs)) {
    return `${IMPORT_GRAPH_INPUT_NAME}.producerInputDigest is stale`;
  }
  if (value.resolverStateDigest !== captured.resolverStateDigest) {
    return `${IMPORT_GRAPH_INPUT_NAME}.resolverStateDigest is stale`;
  }
  return null;
}

function liveGraphProblem(root, value) {
  const cacheKey = path.resolve(root);
  for (let attempt = 0; attempt < LIVE_GRAPH_VALIDATION_ATTEMPTS; attempt += 1) {
    const before = captureLiveInputIdentity(root, value);
    if (!before.ok) return before.problem;
    const cached = liveGraphValidationCache.get(cacheKey);
    if (cached?.identity === before.identity) return cached.problem;
    let problem = uncachedLiveGraphProblem(root, value, before);
    const after = captureLiveInputIdentity(root, value);
    if (!after.ok) return after.problem;
    if (before.identity === after.identity) {
      if (problem === null) {
        liveGraphValidationCache.set(cacheKey, {
          identity: after.identity,
          problem,
        });
      }
      return problem;
    }
    problem = LIVE_GRAPH_DRIFT_PROBLEM;
  }
  return LIVE_GRAPH_DRIFT_PROBLEM;
}

function graphSealProblem(seal, value) {
  if (!isRecord(seal) || seal.schemaVersion !== IMPORT_GRAPH_SEAL_SCHEMA_VERSION ||
      seal.importGraphSchemaVersion !== value.schemaVersion) {
    return `${IMPORT_GRAPH_INPUT_NAME} seal has an unsupported schema`;
  }
  const digestFields = [
    seal.sourceDigest,
    seal.producerInputDigest,
    seal.resolverStateDigest,
    seal.snapshotDigest,
  ];
  if (arraySome(digestFields, (digest) =>
    typeof digest !== 'string' || !regExpTest(DIGEST_PATTERN, digest))) {
    return `${IMPORT_GRAPH_INPUT_NAME} seal contains a noncanonical digest`;
  }
  if (seal.sourceDigest !== value.sourceDigest ||
      seal.producerInputDigest !== value.producerInputDigest ||
      seal.resolverStateDigest !== value.resolverStateDigest ||
      seal.snapshotDigest !== value.snapshotDigest) {
    return `${IMPORT_GRAPH_INPUT_NAME} does not match its producer seal`;
  }
  return null;
}

function graphSnapshotProblem(root, value, seal, changedPaths) {
  const changed = new Set(changedPaths);
  for (const filePath of changed) {
    const isJavaScriptOwner = regExpTest(JAVASCRIPT_OWNER_PATH_PATTERN, filePath);
    if (isJavaScriptOwner && fs.existsSync(path.join(root, filePath)) &&
        !objectHasOwn(value.fileDigests, filePath)) {
      return `${IMPORT_GRAPH_INPUT_NAME} cannot bind new source: ${filePath}`;
    }
  }
  const snapshot = {
    schemaVersion: value.schemaVersion,
    sourceDigest: value.sourceDigest,
    producerInputDigest: value.producerInputDigest,
    fileDigests: value.fileDigests,
    followedFileDigests: value.followedFileDigests,
    resolverInputs: value.resolverInputs,
    resolverStateDigest: value.resolverStateDigest,
    moduleCount: value.moduleCount,
    edgeCount: value.edgeCount,
    unresolvedCount: value.unresolvedCount,
    degrees: value.degrees,
    importers: value.importers,
  };
  const digest = crypto.createHash(HASH_ALGORITHM)
    .update(JSON.stringify(snapshot)).digest(HASH_ENCODING);
  if (!regExpTest(DIGEST_PATTERN, value.snapshotDigest) ||
      value.snapshotDigest !== digest) {
    return `${IMPORT_GRAPH_INPUT_NAME}.snapshotDigest does not bind its content`;
  }
  return graphSealProblem(seal, value) || liveGraphProblem(root, value);
}

function importGraphProblem(root, value, seal, changedPaths) {
  if (!isRecord(value)) return `${IMPORT_GRAPH_INPUT_NAME} must be an object`;
  if (value.schemaVersion !== OWNER_DEBT.importGraphSchemaVersion) {
    return `${IMPORT_GRAPH_INPUT_NAME} has an unsupported schemaVersion`;
  }
  const importersProblem = stringArrayMapProblem(
    value.importers, `${IMPORT_GRAPH_INPUT_NAME}.importers`);
  if (importersProblem) return importersProblem;
  if (typeof value.sourceDigest !== 'string' ||
      !regExpTest(DIGEST_PATTERN, value.sourceDigest)) {
    return `${IMPORT_GRAPH_INPUT_NAME}.sourceDigest must be a canonical SHA-256 digest`;
  }
  if (typeof value.producerInputDigest !== 'string' ||
      !regExpTest(DIGEST_PATTERN, value.producerInputDigest)) {
    return `${IMPORT_GRAPH_INPUT_NAME}.producerInputDigest must be a canonical SHA-256 digest`;
  }
  const fileDigestsProblem = digestMapProblem(
    value.fileDigests, `${IMPORT_GRAPH_INPUT_NAME}.fileDigests`);
  return fileDigestsProblem || graphCountProblem(value) ||
    followedFileDigestsProblem(root, value) ||
    resolverInputsProblem(value) ||
    graphSnapshotProblem(root, value, seal, changedPaths);
}

function sameCoverageIdentity(left, right) {
  return Boolean(left && right) &&
    left.dev === right.dev && left.ino === right.ino &&
    left.mode === right.mode && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function captureCoveragePathIdentity(root, coveredPath) {
  const segments = stringSplit(coveredPath, OWNER_DEBT.pathSeparator);
  let absolute = root;
  let relative = '';
  const identities = new Map();
  for (let index = 0; index < segments.length; index += 1) {
    absolute = path.join(absolute, segments[index]);
    relative = relative ?
      `${relative}${OWNER_DEBT.pathSeparator}${segments[index]}` :
      segments[index];
    let identity = fs.lstatSync(absolute, {bigint: true});
    if (identity.isSymbolicLink()) {
      // A symlinked intermediate directory whose target maps back to a
      // canonical in-root location (the publish gate links node_modules
      // into a temporary worktree) is a legitimate path to a live file:
      // follow it so the liveness capture reads the same inode the
      // producer hashed. A symlinked final component, or an ancestor whose
      // target escapes the repository, is still rejected so coverage
      // cannot smuggle a changing or foreign target through a stable
      // logical name.
      const isFinalComponent = index === segments.length - 1;
      if (isFinalComponent) return {ok: false};
      // The target must stay within the repository: a symlinked ancestor
      // pointing outside (for example a coverage fixture linking to a temp
      // directory) escapes and is rejected, while the publish worktree's
      // node_modules link remaps back to its own canonical location.
      let targetReal;
      try {
        targetReal = fs.realpathSync(absolute);
      } catch {
        return {ok: false};
      }
      const targetRelative = normalizePathThroughSymlinkedRoot(
        root, targetReal);
      if (!isCanonicalGraphPath(targetRelative)) return {ok: false};
      let followed;
      try {
        followed = fs.statSync(absolute, {bigint: true});
      } catch {
        return {ok: false};
      }
      if (!followed.isDirectory()) return {ok: false};
      identity = followed;
    }
    const isFinalComponent = index === segments.length - 1;
    if (isFinalComponent ? !identity.isFile() : !identity.isDirectory()) {
      return {ok: false};
    }
    identities.set(relative, identity);
  }
  return {ok: true, identities};
}

function mergeCoverageIdentities(target, captured) {
  for (const [relativePath, identity] of captured) {
    const prior = target.get(relativePath);
    if (prior && !sameCoverageIdentity(prior, identity)) return false;
    target.set(relativePath, identity);
  }
  return true;
}

function captureCoverageIdentitySet(root, coveredPaths) {
  const identities = new Map();
  for (const coveredPath of coveredPaths) {
    let captured;
    try {
      captured = captureCoveragePathIdentity(root, coveredPath);
    } catch {
      return {
        ok: false,
        problem: `${COVERAGE_INPUT_NAME} edge is not a live file: ${coveredPath}`,
      };
    }
    if (!captured.ok) {
      return {
        ok: false,
        problem: `${COVERAGE_INPUT_NAME} edge is not a regular file: ${coveredPath}`,
      };
    }
    if (!mergeCoverageIdentities(identities, captured.identities)) {
      return {
        ok: false,
        problem: `${COVERAGE_INPUT_NAME} inputs changed during validation`,
      };
    }
  }
  return {ok: true, identities};
}

function readCoverageBytes(descriptor, size) {
  const content = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const bytesRead = fs.readSync(
      descriptor, content, offset, size - offset, offset);
    if (!numberIsSafeInteger(bytesRead) || bytesRead <= 0 ||
        bytesRead > size - offset) return null;
    offset += bytesRead;
  }
  return content;
}

function coverageDescriptorSize(expected, identity) {
  if (!sameCoverageIdentity(expected, identity) || !identity.isFile() ||
      identity.size < 0n ||
      identity.size > BigInt(COVERAGE_MAX_FILE_BYTES)) return null;
  return Number(identity.size);
}

function readRepeatedStableCoverageBytes(descriptor, size, before) {
  const content = readCoverageBytes(descriptor, size);
  const between = fs.fstatSync(descriptor, {bigint: true});
  const repeated = readCoverageBytes(descriptor, size);
  const after = fs.fstatSync(descriptor, {bigint: true});
  return content && repeated && content.equals(repeated) &&
    sameCoverageIdentity(before, between) &&
    sameCoverageIdentity(between, after) ? content : null;
}

function closeCoverageDescriptor(descriptor) {
  try {
    fs.closeSync(descriptor);
    return true;
  } catch {
    return false;
  }
}

function readStableCoverageDigest(root, coveredPath, identities) {
  const expected = identities.get(coveredPath);
  let descriptor;
  let digest = null;
  try {
    descriptor = fs.openSync(
      path.join(root, coveredPath), COVERAGE_OPEN_FLAGS);
    const before = fs.fstatSync(descriptor, {bigint: true});
    const size = coverageDescriptorSize(expected, before);
    if (size !== null) {
      const content = readRepeatedStableCoverageBytes(descriptor, size, before);
      if (content) {
        digest = crypto.createHash(HASH_ALGORITHM)
          .update(content).digest(HASH_ENCODING);
      }
    }
  } catch {
    digest = null;
  }
  if (descriptor !== undefined && !closeCoverageDescriptor(descriptor)) return null;
  return digest;
}

function captureStableCoverageDigests(root, coveredPaths) {
  const before = captureCoverageIdentitySet(root, coveredPaths);
  if (!before.ok) return before;
  const digests = Object.create(null);
  for (const coveredPath of coveredPaths) {
    const digest = readStableCoverageDigest(
      root, coveredPath, before.identities);
    if (!digest) {
      return {
        ok: false,
        problem: `${COVERAGE_INPUT_NAME} inputs changed during validation`,
      };
    }
    digests[coveredPath] = digest;
  }
  const after = captureCoverageIdentitySet(root, coveredPaths);
  if (!after.ok) return after;
  if (before.identities.size !== after.identities.size ||
      arraySome([...before.identities], ([relativePath, identity]) =>
        !sameCoverageIdentity(identity, after.identities.get(relativePath)))) {
    return {
      ok: false,
      problem: `${COVERAGE_INPUT_NAME} inputs changed during validation`,
    };
  }
  return {ok: true, digests};
}

function coveragePathProblem(coveredPath, testEdgePaths) {
  if (path.posix.normalize(coveredPath) !== coveredPath ||
      path.isAbsolute(coveredPath) || stringIncludes(coveredPath, BACKSLASH) ||
      !regExpTest(COVERED_PATH_PATTERN, coveredPath)) {
    return `${COVERAGE_INPUT_NAME} has a noncanonical edge path: ${coveredPath}`;
  }
  if (testEdgePaths.has(coveredPath)) {
    return `${COVERAGE_INPUT_NAME} repeats an edge path: ${coveredPath}`;
  }
  testEdgePaths.add(coveredPath);
  return null;
}

function coverageTestProblem(testPath, coveredPaths, primaryManifest,
  fileDigests, coveredFilePaths) {
  if (!objectHasOwn(primaryManifest.classes, testPath)) {
    return `${COVERAGE_INPUT_NAME} names a non-primary test: ${testPath}`;
  }
  if (coveredPaths.length === 0) {
    return `${COVERAGE_INPUT_NAME} has no coverage edges for ${testPath}`;
  }
  const testEdgePaths = new Set();
  for (const coveredPath of coveredPaths) {
    const pathProblem = coveragePathProblem(coveredPath, testEdgePaths);
    if (pathProblem) return pathProblem;
    coveredFilePaths.add(coveredPath);
    if (!objectHasOwn(fileDigests, coveredPath)) {
      return `${COVERAGE_INPUT_NAME} lacks a digest for ${coveredPath}`;
    }
  }
  return null;
}

function coverageProblem(root, value, primaryManifest) {
  if (!isRecord(value)) return `${COVERAGE_INPUT_NAME} must be an object`;
  if (value.schemaVersion !== COVERAGE_SCHEMA_VERSION) {
    return `${COVERAGE_INPUT_NAME} has an unsupported schemaVersion`;
  }
  if (typeof value.sourceDigest !== 'string' ||
      !regExpTest(DIGEST_PATTERN, value.sourceDigest)) {
    return `${COVERAGE_INPUT_NAME}.sourceDigest must be a canonical SHA-256 digest`;
  }
  const testsProblem = stringArrayMapProblem(
    value.tests, `${COVERAGE_INPUT_NAME}.tests`);
  if (testsProblem) return testsProblem;
  const digestsProblem = digestMapProblem(
    value.fileDigests, `${COVERAGE_INPUT_NAME}.fileDigests`);
  if (digestsProblem) return digestsProblem;
  const coveredFilePaths = new Set();
  for (const [testPath, coveredPaths] of objectEntries(value.tests)) {
    const testProblem = coverageTestProblem(
      testPath, coveredPaths, primaryManifest,
      value.fileDigests, coveredFilePaths);
    if (testProblem) return testProblem;
  }
  if (!sameStringSet([...coveredFilePaths], objectKeys(value.fileDigests))) {
    return `${COVERAGE_INPUT_NAME}.fileDigests must exactly bind its coverage edges`;
  }
  const captured = captureStableCoverageDigests(root, [...coveredFilePaths]);
  if (!captured.ok) return captured.problem;
  return null;
}

function invalidInput(primary, problem) {
  return {ok: false, primary, problems: [problem]};
}

function loadVerifiedPrimary(root) {
  const loaded = loadPrimaryManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  let problems = loaded.problems;
  if (loaded.ok) {
    try {
      problems = verifyPrimaryManifest(root, loaded.manifest);
    } catch (error) {
      problems = [`primary classification verification failed: ${error.message}`];
    }
    if (problems.length === 0) {
      return {ok: true, manifest: loaded.manifest, problems};
    }
  }
  try {
    return {ok: false, manifest: buildPrimaryManifest(root), problems};
  } catch (error) {
    return {
      ok: false,
      problems: [...problems, `${PRIMARY_FALLBACK_PROBLEM_PREFIX}${error.message}`],
    };
  }
}

function loadCoverage(root, primaryManifest) {
  const coverageRead = readJsonInput(root, PROOF_CONE_COVERAGE_PATH);
  if (!coverageRead.ok) {
    if (coverageRead.state === INPUT_STATE_MISSING) {
      return {ok: true, value: null};
    }
    return invalidInput(primaryManifest, coverageRead.problem);
  }
  const problem = coverageProblem(root, coverageRead.value, primaryManifest);
  return problem ?
    invalidInput(primaryManifest, problem) :
    {ok: true, value: coverageRead.value};
}

export function loadSelectorInputs(root, changedPaths = []) {
  const primary = loadVerifiedPrimary(root);
  if (!primary.ok) {
    return {
      ok: false,
      ...(primary.manifest ? {primary: primary.manifest} : {}),
      problems: primary.problems,
    };
  }
  const contractsRead = readJsonInput(root, PROOF_CONE_CONTRACTS_PATH);
  if (!contractsRead.ok) {
    return invalidInput(primary.manifest, contractsRead.problem);
  }
  const graphRead = readJsonInput(root, IMPORT_GRAPH_PATH);
  if (!graphRead.ok) {
    return invalidInput(primary.manifest, graphRead.problem);
  }
  const sealRead = readJsonInput(root, IMPORT_GRAPH_SEAL_PATH);
  if (!sealRead.ok) {
    return invalidInput(primary.manifest, sealRead.problem);
  }
  const graphProblem = importGraphProblem(
    root, graphRead.value, sealRead.value, changedPaths);
  if (graphProblem) {
    return invalidInput(primary.manifest, graphProblem);
  }
  const coverageRead = loadCoverage(root, primary.manifest);
  if (!coverageRead.ok) return coverageRead;
  return {
    ok: true,
    primary: primary.manifest,
    contracts: contractsRead.value,
    importers: graphRead.value.importers || {},
    importGraphDigest: graphRead.value.sourceDigest || null,
    coverage: coverageRead.value,
  };
}

// Coverage freshness is per-edge, not per-repository: an edge is stale only
// when the bytes of a file it binds actually changed since collection (the
// snapshot records a content digest of every covered file). The import-graph
// sourceDigest churns on every src commit, so it is provenance, never the
// freshness oracle. Sufficiency: the snapshot must cover a meaningful share
// of the census before it can discharge owner-tier proof obligations.
export function evaluateCoverage(root, coverageSnapshot, censusSize) {
  if (!coverageSnapshot) {
    return {present: false, fresh: false, sufficient: false, staleEdges: 0, share: 0};
  }
  const coverageTests = coverageSnapshot.tests || {};
  const fileDigests = coverageSnapshot.fileDigests || {};
  const coveredPaths = [...new Set(Object.values(coverageTests).flat())];
  const captured = captureStableCoverageDigests(root, coveredPaths);
  let staleEdges = 0;
  for (const covered of Object.values(coverageTests)) {
    for (const coveredPath of covered) {
      const recorded = fileDigests[coveredPath];
      const live = captured.ok ? captured.digests[coveredPath] : null;
      if (!recorded || recorded !== live) {
        staleEdges += 1;
      }
    }
  }
  const fresh = coverageSnapshot.schemaVersion === COVERAGE_SCHEMA_VERSION &&
    staleEdges === 0;
  const share = Object.keys(coverageTests).length / Math.max(1, censusSize);
  return {
    present: true,
    fresh,
    sufficient: fresh && share >= COVERAGE_MINIMUM_TEST_SHARE,
    staleEdges,
    share,
    digest: coverageSnapshot.sourceDigest || null,
  };
}

export function coverageEscalationRule(evaluation) {
  if (!evaluation.present) return ESCALATION_RULE_ABSENT_COVERAGE;
  if (evaluation.fresh) return ESCALATION_RULE_INSUFFICIENT_COVERAGE;
  return ESCALATION_RULE_STALE_COVERAGE;
}

// The full-census escalation decision. Every test carries the escalation
// reason; there is deliberately no empty-tests "probably safe" mode.
export function fullCensusEscalation(receipt, classifiedTests, rule) {
  receipt.fullSuite = true;
  receipt.escalationRule = rule;
  receipt.selectedTests = [...classifiedTests];
  receipt.counts.uniqueSelected = classifiedTests.length;
  const testReasons = {};
  for (const testPath of classifiedTests) {
    testReasons[testPath] = [REASON_ESCALATION];
  }
  receipt.testReasons = testReasons;
  return receipt;
}
