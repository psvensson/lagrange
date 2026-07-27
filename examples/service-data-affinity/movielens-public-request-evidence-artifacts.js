import {
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  BYTE_ENCODING,
  DATA_VALUE_KEY,
  SHA256_PATTERN,
  allArrayValues,
  arrayIsArray,
  bufferFrom,
  bufferIsBuffer,
  bufferToString,
  canonicalObjectPrototype,
  canonicalPlainJson,
  hasExactKeys,
  jsonParse,
  jsonStringify,
  numberIsSafeInteger,
  objectCreate,
  objectFreeze,
  objectGetOwnPropertyDescriptor,
  objectGetPrototypeOf,
  objectHasOwn,
  plainDataEqual,
  reflectApply,
  reflectOwnKeys,
  regexpMatches,
  sha256,
  snapshotPlainData,
  stringHasPrefix,
  stringPart,
  utilIsProxy,
} from './evidence-exact-plain-data.js';
import {
  validateLiveObservation,
} from './movielens-public-request-live-observation-validator.js';

const DEFAULT_ARTIFACT_ROOT = 'test-output/evidence/sha256';
const SHA256_PREFIX = 'sha256:';
const FILE_TYPE_MASK = 0o170000;
const DIRECTORY_TYPE = 0o040000;
const REGULAR_FILE_TYPE = 0o100000;
const SYMBOLIC_LINK_TYPE = 0o120000;
const pathDirname = path.dirname;
const pathJoin = path.join;
const pathResolve = path.resolve;
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40}$/u;
const CONTENT_ARTIFACT_DESCRIPTOR_KEYS = objectFreeze([
  'byteLength',
  'digest',
  'mediaType',
  'name',
  'path',
]);
const MAXIMUM_CONTENT_ARTIFACT_BYTES = 16 * 1_024 * 1_024;
const MAXIMUM_EVIDENCE_ARTIFACTS = 64;

function readExactDescriptorValues(descriptor) {
  if (descriptor === null || typeof descriptor !== 'object') {
    throw new TypeError('content artifact descriptor must be exact plain data');
  }
  if (utilIsProxy(descriptor)) {
    throw new TypeError('content artifact descriptor must be exact plain data');
  }
  const prototype = objectGetPrototypeOf(descriptor);
  if (prototype !== canonicalObjectPrototype && prototype !== null) {
    throw new TypeError('content artifact descriptor must be exact plain data');
  }
  if (reflectOwnKeys(descriptor).length !==
      CONTENT_ARTIFACT_DESCRIPTOR_KEYS.length) {
    throw new TypeError('content artifact descriptor must be exact plain data');
  }
  const values = objectCreate(null);
  for (let index = 0;
    index < CONTENT_ARTIFACT_DESCRIPTOR_KEYS.length;
    index += 1) {
    const key = CONTENT_ARTIFACT_DESCRIPTOR_KEYS[index];
    const descriptorField =
      objectGetOwnPropertyDescriptor(descriptor, key);
    if (
      !descriptorField ||
      descriptorField.enumerable !== true ||
      !objectHasOwn(descriptorField, DATA_VALUE_KEY)
    ) {
      throw new TypeError(
        'content artifact descriptor must be exact plain data',
      );
    }
    values[key] = descriptorField.value;
  }
  return values;
}

function requireContentArtifactDescriptor(descriptor) {
  const values = readExactDescriptorValues(descriptor);
  if (
    !numberIsSafeInteger(values.byteLength) ||
    values.byteLength < 0 ||
    values.byteLength > MAXIMUM_CONTENT_ARTIFACT_BYTES ||
    typeof values.digest !== 'string' ||
    !regexpMatches(SHA256_PATTERN, values.digest)
  ) {
    throw new TypeError('content artifact descriptor fields are invalid');
  }
  const stringKeys = ['mediaType', 'name', 'path'];
  for (let index = 0; index < stringKeys.length; index += 1) {
    const key = stringKeys[index];
    if (typeof values[key] !== 'string' || values[key].length === 0) {
      throw new TypeError('content artifact descriptor fields are invalid');
    }
  }
  return objectFreeze(values);
}

function artifactPath(root, digest) {
  const hex = stringPart(digest, SHA256_PREFIX.length);
  return pathJoin(root, stringPart(hex, 0, 2), `${hex}.blob`);
}

async function requireCanonicalDirectory(directory) {
  const resolved = pathResolve(directory);
  const stats = await lstat(resolved);
  if (
    (stats.mode & FILE_TYPE_MASK) !== DIRECTORY_TYPE ||
    (stats.mode & FILE_TYPE_MASK) === SYMBOLIC_LINK_TYPE ||
    await realpath(resolved) !== resolved
  ) {
    throw new Error('content artifact directory ancestry is invalid');
  }
}

async function writeContentArtifact({
  bytes,
  mediaType,
  name,
  root = DEFAULT_ARTIFACT_ROOT,
}) {
  if (!bufferIsBuffer(bytes)) {
    throw new TypeError('content artifact bytes must be a Buffer');
  }
  if (bytes.length > MAXIMUM_CONTENT_ARTIFACT_BYTES) {
    throw new RangeError('content artifact exceeds the retained byte cap');
  }
  const digest = sha256(bytes);
  const filePath = artifactPath(root, digest);
  await mkdir(root, {recursive: true});
  await requireCanonicalDirectory(root);
  await mkdir(pathDirname(filePath), {recursive: true});
  await requireCanonicalDirectory(pathDirname(filePath));
  try {
    await writeFile(filePath, bytes, {flag: 'wx'});
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const descriptor = objectFreeze({
    byteLength: bytes.length,
    digest,
    mediaType,
    name,
    path: filePath,
  });
  await resolveContentArtifact(descriptor, {root});
  return descriptor;
}

async function writeJsonArtifact(options) {
  const value = snapshotPlainData(options.value);
  return writeContentArtifact({
    ...options,
    bytes: bufferFrom(
      `${canonicalPlainJson(value)}\n`,
      BYTE_ENCODING,
    ),
    mediaType: 'application/json',
  });
}

async function resolveContentArtifact(
  descriptor,
  {root = DEFAULT_ARTIFACT_ROOT} = {},
) {
  const validated = requireContentArtifactDescriptor(descriptor);
  const expectedPath = artifactPath(root, validated.digest);
  if (pathResolve(validated.path) !== pathResolve(expectedPath)) {
    throw new Error(`content artifact path mismatch: ${validated.name}`);
  }
  const stats = await lstat(expectedPath);
  if (
    (stats.mode & FILE_TYPE_MASK) !== REGULAR_FILE_TYPE ||
    (stats.mode & FILE_TYPE_MASK) === SYMBOLIC_LINK_TYPE ||
    await realpath(expectedPath) !== pathResolve(expectedPath) ||
    stats.size !== validated.byteLength ||
    stats.size > MAXIMUM_CONTENT_ARTIFACT_BYTES
  ) {
    throw new Error(`content artifact file invalid: ${validated.name}`);
  }
  const bytes = await readFile(expectedPath);
  if (
    bytes.length !== validated.byteLength ||
    sha256(bytes) !== validated.digest
  ) {
    throw new Error(`content artifact rehash failed: ${validated.name}`);
  }
  return objectFreeze({bytes, descriptor: validated});
}

async function validateContentArtifacts(descriptors, options) {
  let exactDescriptors;
  try {
    exactDescriptors = snapshotPlainData(descriptors);
  } catch {
    throw new TypeError(
      'content artifact descriptors must be exact own plain data',
    );
  }
  if (
    !arrayIsArray(exactDescriptors) ||
    exactDescriptors.length > MAXIMUM_EVIDENCE_ARTIFACTS
  ) {
    throw new RangeError('bounded content artifact descriptors are required');
  }
  const validated = [];
  for (let index = 0; index < exactDescriptors.length; index += 1) {
    const resolved = await resolveContentArtifact(
      exactDescriptors[index],
      options,
    );
    validated[validated.length] = resolved.descriptor.digest;
  }
  return objectFreeze({
    count: validated.length,
    digests: objectFreeze(validated),
    passed: true,
  });
}

function conditionsHold(conditions) {
  return allArrayValues(conditions, (condition) => condition === true);
}

function stringOccurrences(values, expected) {
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) count += 1;
  }
  return count;
}

function descriptorNameOccurrences(descriptors, expected) {
  let count = 0;
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    if (descriptor && descriptor.name === expected) count += 1;
  }
  return count;
}

function descriptorNamed(descriptors, name) {
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    if (descriptor && descriptor.name === name) return descriptor;
  }
  return null;
}

function expectedArtifactNamesValid(expected) {
  if (expected.length === 0) return false;
  return allArrayValues(
    expected,
    (name) => conditionsHold([
      typeof name === 'string',
      typeof name === 'string' ? name.length > 0 : false,
      stringOccurrences(expected, name) === 1,
    ]),
  );
}

function actualArtifactNamesValid(actual, expected) {
  if (actual.length !== expected.length) return false;
  return allArrayValues(
    actual,
    (descriptor) => {
      const name = descriptor && descriptor.name;
      return conditionsHold([
        typeof name === 'string',
        descriptorNameOccurrences(actual, name) === 1,
        stringOccurrences(expected, name) === 1,
      ]);
    },
  );
}

function artifactDescriptorsValid(actual) {
  return allArrayValues(actual, (descriptor) => {
    try {
      requireContentArtifactDescriptor(descriptor);
      return true;
    } catch {
      return false;
    }
  });
}

function primaryArtifactsBindLive(live, actual) {
  const dataset = descriptorNamed(actual, 'movielens-input-bytes');
  const executable =
    descriptorNamed(actual, 'movielens-component-executable');
  if (!dataset || !executable || !live.dataset || !live.artifact) {
    return false;
  }
  return conditionsHold([
    dataset.digest === live.dataset.digest,
    dataset.byteLength === live.dataset.sizeBytes,
    executable.digest === live.artifact.executableDigest,
    live.artifact.executableDigest === live.artifact.ociPayloadDigest,
  ]);
}

function requiredArtifactsPresent(actual) {
  const required = [
    'invocation-journal',
    'manifest-and-binding',
    'postgres-logs',
    'postgres-query',
    'public-request-bytes',
    'public-responses',
    'teardown-receipt',
    'source-state',
    'raw-live-observation',
  ];
  return allArrayValues(
    required,
    (name) => descriptorNamed(actual, name) !== null,
  );
}

function sourceEntryValid(source, sources) {
  if (!hasExactKeys(source, ['byteLength', 'digest', 'path'])) return false;
  return conditionsHold([
    typeof source.path === 'string',
    source.path.length > 0,
    sourcePathOccurrences(sources, source.path) === 1,
    numberIsSafeInteger(source.byteLength),
    source.byteLength >= 0,
    typeof source.digest === 'string',
    regexpMatches(SHA256_PATTERN, source.digest),
  ]);
}

function sourcePathOccurrences(sources, expected) {
  let count = 0;
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (source && source.path === expected) count += 1;
  }
  return count;
}

function sourceStateIdentityValid(sourceState) {
  const sourceStateKeys = [
    'gitHead',
    'gitHeadTree',
    'sourceSetDigest',
    'sources',
    'worktreeStatus',
  ];
  if (!hasExactKeys(sourceState, sourceStateKeys)) return false;
  const sources = sourceState.sources;
  if (!arrayIsArray(sources)) return false;
  return conditionsHold([
    typeof sourceState.gitHead === 'string',
    regexpMatches(GIT_OBJECT_PATTERN, sourceState.gitHead),
    typeof sourceState.gitHeadTree === 'string',
    regexpMatches(GIT_OBJECT_PATTERN, sourceState.gitHeadTree),
    sources.length > 0,
    sources.length <= MAXIMUM_EVIDENCE_ARTIFACTS,
    allArrayValues(sources, (source) => sourceEntryValid(source, sources)),
    typeof sourceState.sourceSetDigest === 'string',
    regexpMatches(SHA256_PATTERN, sourceState.sourceSetDigest),
    sourceState.sourceSetDigest ===
      sha256(bufferFrom(jsonStringify(sources), BYTE_ENCODING)),
    typeof sourceState.worktreeStatus === 'string',
  ]);
}

function sourceDescriptorsBindState(actual, sourceState) {
  if (!arrayIsArray(sourceState.sources)) return false;
  let sourceDescriptorCount = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const descriptor = actual[index];
    const name = descriptor && descriptor.name;
    if (typeof name === 'string' && stringHasPrefix(name, 'source:')) {
      sourceDescriptorCount += 1;
    }
  }
  if (sourceDescriptorCount !== sourceState.sources.length) return false;
  return allArrayValues(sourceState.sources, (source) => {
    const descriptor = descriptorNamed(actual, `source:${source.path}`);
    if (!descriptor) return false;
    return conditionsHold([
      descriptor.digest === source.digest,
      descriptor.byteLength === source.byteLength,
    ]);
  });
}

function validateSourceStateBindings(descriptors, sourceState) {
  try {
    descriptors = snapshotPlainData(descriptors);
    sourceState = snapshotPlainData(sourceState);
  } catch {
    return false;
  }
  if (!arrayIsArray(descriptors)) return false;
  return conditionsHold([
    sourceStateIdentityValid(sourceState),
    sourceDescriptorsBindState(descriptors, sourceState),
  ]);
}

function validateArtifactBindings(
  live,
  descriptors,
  expectedNames,
  sourceState,
) {
  try {
    live = snapshotPlainData(live);
    descriptors = snapshotPlainData(descriptors);
    expectedNames = snapshotPlainData(expectedNames);
    sourceState = snapshotPlainData(sourceState);
  } catch {
    return objectFreeze({
      failures: objectFreeze([
        'artifact bindings must be exact own plain data',
      ]),
      passed: false,
    });
  }
  const expected = arrayIsArray(expectedNames) ? expectedNames : [];
  const actual = arrayIsArray(descriptors) ? descriptors : [];
  const checks = [
    [
      expectedArtifactNamesValid(expected),
      'expected artifact names must be unique',
    ],
    [
      actualArtifactNamesValid(actual, expected),
      'artifact names/count must exactly match the terminal evidence set',
    ],
    [artifactDescriptorsValid(actual), 'artifact descriptor shape invalid'],
    [
      primaryArtifactsBindLive(live, actual),
      'primary binary descriptors do not bind live bytes',
    ],
    [
      requiredArtifactsPresent(actual),
      'required terminal evidence artifact missing',
    ],
    [
      sourceStateIdentityValid(sourceState),
      'source-state identity/count/digest invalid',
    ],
    [
      sourceDescriptorsBindState(actual, sourceState),
      'source descriptors do not map exactly to source-state',
    ],
  ];
  const failures = [];
  for (let index = 0; index < checks.length; index += 1) {
    if (!checks[index][0]) failures[failures.length] = checks[index][1];
  }
  return objectFreeze({
    failures: objectFreeze(failures),
    passed: failures.length === 0,
  });
}

function requireEvidenceIndex(index) {
  let exact;
  try {
    exact = snapshotPlainData(index);
  } catch {
    throw new TypeError('exact evidence index digest/path are required');
  }
  if (
    !hasExactKeys(exact, ['digest', 'path']) ||
    typeof exact.digest !== 'string' ||
    !regexpMatches(SHA256_PATTERN, exact.digest) ||
    typeof exact.path !== 'string' ||
    exact.path.length === 0
  ) {
    throw new TypeError('exact evidence index digest/path are required');
  }
  return objectFreeze({
    digest: exact.digest,
    path: exact.path,
  });
}

function parseExactPlainJson(bytes, errorMessage) {
  try {
    return snapshotPlainData(jsonParse(reflectApply(
      bufferToString,
      bytes,
      [BYTE_ENCODING],
    )));
  } catch {
    throw new Error(errorMessage);
  }
}

function canonicalJsonBytes(value) {
  return bufferFrom(`${canonicalPlainJson(value)}\n`, BYTE_ENCODING);
}

function requireCanonicalJsonBytes(bytes, digest, errorMessage) {
  const value = parseExactPlainJson(bytes, errorMessage);
  const canonicalBytes = canonicalJsonBytes(value);
  if (
    canonicalBytes.length !== bytes.length ||
    sha256(canonicalBytes) !== digest
  ) {
    throw new Error(errorMessage);
  }
  return value;
}

async function readEvidenceIndex(validatedIndex, root) {
  const expectedPath = artifactPath(root, validatedIndex.digest);
  if (pathResolve(validatedIndex.path) !== pathResolve(expectedPath)) {
    throw new Error('evidence index path is not content-addressed');
  }
  const stats = await lstat(validatedIndex.path);
  if (
    (stats.mode & FILE_TYPE_MASK) !== REGULAR_FILE_TYPE ||
    (stats.mode & FILE_TYPE_MASK) === SYMBOLIC_LINK_TYPE ||
    await realpath(validatedIndex.path) !==
      pathResolve(validatedIndex.path) ||
    stats.size > MAXIMUM_CONTENT_ARTIFACT_BYTES
  ) {
    throw new Error('evidence index file is invalid');
  }
  const bytes = await readFile(validatedIndex.path);
  if (sha256(bytes) !== validatedIndex.digest) {
    throw new Error('evidence index rehash failed');
  }
  const raw = requireCanonicalJsonBytes(
    bytes,
    validatedIndex.digest,
    'evidence index must contain canonical exact own plain data',
  );
  if (
    !hasExactKeys(raw, [
      'artifacts',
      'observationArtifact',
      'sourceState',
    ]) ||
    !arrayIsArray(raw.artifacts) ||
    raw.artifacts.length > MAXIMUM_EVIDENCE_ARTIFACTS
  ) {
    throw new Error('evidence index artifact set is invalid');
  }
  return raw;
}

async function resolveEvidenceIndex(
  index,
  {root = DEFAULT_ARTIFACT_ROOT} = {},
) {
  const validatedIndex = requireEvidenceIndex(index);
  const raw = await readEvidenceIndex(validatedIndex, root);
  const artifacts = await validateContentArtifacts(
    raw.artifacts,
    {root},
  );
  return objectFreeze({
    artifacts,
    indexDigest: validatedIndex.digest,
    raw,
  });
}

async function readCanonicalJsonArtifact(descriptors, name, root) {
  const retained = await resolveContentArtifact(
    descriptorNamed(descriptors, name),
    {root},
  );
  const value = requireCanonicalJsonBytes(
    retained.bytes,
    retained.descriptor.digest,
    `retained ${name} must be canonical exact own plain data`,
  );
  if (
    retained.descriptor.mediaType !== 'application/json' ||
    retained.bytes.length !== retained.descriptor.byteLength
  ) {
    throw new Error(`retained ${name} is not canonical JSON`);
  }
  return objectFreeze({retained, value});
}

function retainedIdentityValid(
  raw,
  rawObservation,
  retainedSourceState,
) {
  const retainedObservation = rawObservation.value;
  if (!hasExactKeys(retainedObservation, [
    'fidelity',
    'observation',
    'producer',
    'scenario',
    'sourceState',
    'timestamp',
  ])) {
    return false;
  }
  return conditionsHold([
    plainDataEqual(
      raw.observationArtifact,
      rawObservation.retained.descriptor,
    ),
    plainDataEqual(raw.sourceState, retainedSourceState),
    plainDataEqual(
      raw.sourceState,
      retainedObservation.sourceState,
    ),
  ]);
}

function exactLiveArtifacts(live) {
  return [
    ['invocation-journal', live.journalEvidence],
    ['manifest-and-binding', {
      binding: live.deployment.binding,
      manifest: live.deployment.manifest,
    }],
    ['postgres-query', {
      imageId: live.alternative.imageId,
      imageInspection: live.alternative.imageInspection,
      imageRepoDigests: live.alternative.imageRepoDigests,
      measuredContainerImages:
        live.alternative.measuredContainerImages,
      queryRows: live.alternative.topMovies,
      sql: live.alternative.querySql,
      version: live.alternative.postgresVersion,
      versionSql: live.alternative.postgresVersionSql,
    }],
    ['public-request-bytes', live.requestEvidence],
    ['public-responses', live.responseEvidence],
    ['teardown-receipt', live.teardown],
  ];
}

async function requireRetainedArtifactsBindLive(
  live,
  descriptors,
  root,
) {
  const expectedArtifacts = exactLiveArtifacts(live);
  for (let index = 0; index < expectedArtifacts.length; index += 1) {
    const [name, expected] = expectedArtifacts[index];
    const retained =
      await readCanonicalJsonArtifact(descriptors, name, root);
    if (!plainDataEqual(retained.value, expected)) {
      throw new Error(`retained ${name} does not bind live observation`);
    }
  }
}

function measuredContainerIds(live) {
  const identifiers = [];
  const measuredContainers =
    live.alternative.measuredContainerImages;
  for (let index = 0; index < measuredContainers.length; index += 1) {
    identifiers[identifiers.length] =
      measuredContainers[index].containerId;
  }
  return identifiers;
}

function postgresLogsBindLive(postgresLogs, live) {
  const containerIds = measuredContainerIds(live);
  if (!hasExactKeys(postgresLogs, containerIds)) return false;
  for (let index = 0; index < containerIds.length; index += 1) {
    const containerId = containerIds[index];
    const logs = postgresLogs[containerId];
    if (
      typeof logs !== 'string' ||
      sha256(bufferFrom(logs, BYTE_ENCODING)) !==
        live.alternative.postgresLogDigests[containerId]
    ) {
      return false;
    }
  }
  return true;
}

async function requirePostgresLogsBindLive(live, descriptors, root) {
  const postgresLogs = (
    await readCanonicalJsonArtifact(descriptors, 'postgres-logs', root)
  ).value;
  if (!postgresLogsBindLive(postgresLogs, live)) {
    throw new Error('retained postgres-logs do not bind live observation');
  }
}

function replayResult({
  artifacts,
  bindings,
  indexDigest,
  observation,
}) {
  return objectFreeze({
    artifacts,
    bindings,
    indexDigest,
    observation,
    passed:
      artifacts.passed === true &&
      bindings.passed === true &&
      observation.passed === true,
  });
}

async function replayEvidenceIndex(
  index,
  {
    expectedNames,
    root = DEFAULT_ARTIFACT_ROOT,
  } = {},
) {
  const resolved = await resolveEvidenceIndex(index, {root});
  const {artifacts, raw} = resolved;
  const rawObservation = await readCanonicalJsonArtifact(
    raw.artifacts,
    'raw-live-observation',
    root,
  );
  const sourceStateArtifact = await readCanonicalJsonArtifact(
    raw.artifacts,
    'source-state',
    root,
  );
  const retainedObservation = rawObservation.value;
  const retainedSourceState = sourceStateArtifact.value;
  if (!retainedIdentityValid(raw, rawObservation, retainedSourceState)) {
    throw new Error('evidence index retained identity binding failed');
  }
  const live = retainedObservation.observation;
  const observation = validateLiveObservation(live);
  const bindings = validateArtifactBindings(
    live,
    raw.artifacts,
    expectedNames,
    raw.sourceState,
  );
  const result = replayResult({
    artifacts,
    bindings,
    indexDigest: resolved.indexDigest,
    observation,
  });
  if (!result.passed) return result;
  await requireRetainedArtifactsBindLive(live, raw.artifacts, root);
  await requirePostgresLogsBindLive(live, raw.artifacts, root);
  return result;
}

export {
  DEFAULT_ARTIFACT_ROOT,
  readCanonicalJsonArtifact,
  replayEvidenceIndex,
  resolveEvidenceIndex,
  resolveContentArtifact,
  sha256,
  validateArtifactBindings,
  validateContentArtifacts,
  validateLiveObservation,
  validateSourceStateBindings,
  writeContentArtifact,
  writeJsonArtifact,
};
