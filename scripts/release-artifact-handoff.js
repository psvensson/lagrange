#!/usr/bin/env node
// The release producer/publisher byte boundary. No publication happens here.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {chmod, copyFile, lstat, readdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {ACTION, authorizeAction, isAuthorized} from './action-authority.js';
import {
  appendOwnArrayValue, concatenateArraysByIndex, copyArrayByIndex, isDenseDataArray,
  joinArrayByIndex, serializeJsonData,
} from '../src/utils/canonical-json-data.js';
import {copyStrictOwnDataRecord} from '../src/utils/strict-own-data.js';

const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;
const objectDescriptor = Object.getOwnPropertyDescriptor;
const numberIsSafeInteger = Number.isSafeInteger;
const jsonParse = JSON.parse;
const arraySort = Function.call.bind(Array.prototype.sort);
const stringSlice = Function.call.bind(String.prototype.slice);
const regexpExec = Function.call.bind(RegExp.prototype.exec);

const SCHEMA = 'lagrange-release-handoff/1';
const MANIFEST = 'release-handoff.json';
const CHECKSUMS = 'SHA256SUMS';
const EXECUTABLE_MODE = 0o755;
const DATA_MODE = 0o644;
const MODE_MASK = 0o777;
const MANIFEST_MAX_BYTES = 64 * 1024;
const PUBLIC_ASSET_COUNT = 4;
const HASH = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const IDENTITY_KEYS = [
  'repository', 'workflow', 'runId', 'producerAttempt', 'tag', 'commit', 'version', 'buildDate',
];
const MATCHED_IDENTITY_KEYS = ['repository', 'workflow', 'runId', 'tag', 'commit', 'version'];
const MANIFEST_KEYS = ['schema', 'identity', 'image', 'files'];
const IMAGE_KEYS = ['id', 'tags', 'labels'];
const DESCRIPTOR_VALUE = 'value';
const IMAGE_INSPECTION_ID = 'Id';
const HEX_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const LINE_END = '\n';
const INVALID = 'RELEASE_HANDOFF_INVALID';
const VERIFIED = 'RELEASE_HANDOFF_VERIFIED';
const COMMAND = {CREATE: 'create', VERIFY: 'verify', AUTHORIZE: 'authorize', ASSETS: 'public-assets'};
const ARGUMENT_POSITION = {COMMAND: 2, DIRECTORY: 3, SOURCE: 4};
const PAYLOAD = {SERVER: 'lagrange', CLI: 'lagrange-cli', IMAGE: 'release-image.tar',
  NOTES: 'release-notes.md', OVERVIEW: 'dockerhub-overview.md'};
const PROBLEM = {
  IDENTITY_SHAPE: 'identity shape', VERSION: 'version', TAG_VERSION: 'tag/version',
  COMMIT: 'commit', RUN_ID: 'runId', PRODUCER_ATTEMPT: 'producerAttempt', BUILD_DATE: 'buildDate',
  IMAGE_REPOSITORY: 'image repository', IMAGE_ID: 'image id', DIRECTORY: 'handoff directory',
  FILE_SET: 'unexpected or missing handoff files', MANIFEST_DIGEST: 'manifest digest',
  MANIFEST_SIZE: 'oversized manifest', MANIFEST_MISMATCH: 'manifest digest mismatch',
  MANIFEST_SHAPE: 'manifest shape', SCHEMA: 'schema', IMAGE_SHAPE: 'image shape',
  IMAGE_IDENTITY: 'image identity', FILE_COUNT: 'file count', CHECKSUM_LAYOUT: 'public checksum layout',
  INSPECTION_COUNT: 'image inspection count', LOADED_IMAGE_ID: 'loaded image id',
  INSPECTION_FAILED: 'loaded image inspection failed', COMMAND: 'command',
  MANIFEST_JSON: 'invalid manifest JSON', EXPECTED: 'expected identity',
};

function requireCondition(condition, message) {
  if (!condition) {
    const error = new Error(`${INVALID}: ${message}`);
    error.code = INVALID;
    throw error;
  }
}

function requireShape(value, keys, label) {
  const record = copyStrictOwnDataRecord(value);
  requireCondition(record !== null, label);
  requireCondition(isDeepStrictEqual(arraySort(objectKeys(record)),
    arraySort(copyArrayByIndex(keys))), label);
  return record;
}

function matches(pattern, value) {
  return regexpExec(pattern, value) !== null;
}

function validateIdentity(identity) {
  identity = requireShape(identity, IDENTITY_KEYS, PROBLEM.IDENTITY_SHAPE);
  for (let index = 0; index < IDENTITY_KEYS.length; index += 1) {
    const key = IDENTITY_KEYS[index];
    requireCondition(typeof identity[key] === 'string' && identity[key].length > 0, key);
  }
  requireCondition(matches(VERSION, identity.version), PROBLEM.VERSION);
  requireCondition(identity.tag === `v${identity.version}`, PROBLEM.TAG_VERSION);
  requireCondition(matches(COMMIT, identity.commit), PROBLEM.COMMIT);
  requireCondition(matches(POSITIVE_INTEGER, identity.runId), PROBLEM.RUN_ID);
  requireCondition(matches(POSITIVE_INTEGER, identity.producerAttempt), PROBLEM.PRODUCER_ATTEMPT);
  requireCondition(matches(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u, identity.buildDate),
    PROBLEM.BUILD_DATE);
  return identity;
}

function payloadNames(version) {
  requireCondition(typeof version === 'string' && matches(VERSION, version), PROBLEM.VERSION);
  return [
    PAYLOAD.SERVER, PAYLOAD.CLI, `lagrange-node-${version}.tgz`, `lagrange-server-${version}.tgz`,
    PAYLOAD.IMAGE, PAYLOAD.NOTES, PAYLOAD.OVERVIEW,
  ];
}

function canonicalMode(name) {
  return name === PAYLOAD.SERVER || name === PAYLOAD.CLI ? EXECUTABLE_MODE : DATA_MODE;
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(HEX_ENCODING);
}

async function regularFile(file) {
  const stat = await lstat(file);
  requireCondition(stat.isFile() && stat.nlink === 1, `not a standalone regular file: ${file}`);
  requireCondition(numberIsSafeInteger(stat.size) && stat.size > 0, `invalid size: ${file}`);
  return stat;
}

async function describeFile(directory, name) {
  const file = join(directory, name);
  const stat = await regularFile(file);
  return {name, size: stat.size, sha256: await digest(file), mode: canonicalMode(name)};
}

function publicChecksums(files) {
  let text = '';
  for (let index = 0; index < PUBLIC_ASSET_COUNT; index += 1) {
    const file = files[index];
    text += `${file.sha256}  ${file.name}${LINE_END}`;
  }
  return text;
}

function imageContract(identity, repository, id) {
  requireCondition(typeof repository === 'string' && matches(/^[\w./-]+$/u, repository),
    PROBLEM.IMAGE_REPOSITORY);
  requireCondition(typeof id === 'string' && matches(/^sha256:[a-f0-9]{64}$/u, id), PROBLEM.IMAGE_ID);
  return {
    id,
    tags: [`${repository}:${identity.version}`, `${repository}:latest`],
    labels: {
      'org.opencontainers.image.version': identity.version,
      'org.opencontainers.image.revision': identity.commit,
      'org.opencontainers.image.created': identity.buildDate,
    },
  };
}

async function requireDirectory(directory, names) {
  const stat = await lstat(directory);
  requireCondition(stat.isDirectory() && !stat.isSymbolicLink(), PROBLEM.DIRECTORY);
  requireCondition(isDeepStrictEqual(arraySort(await readdir(directory)),
    arraySort(copyArrayByIndex(names))),
  PROBLEM.FILE_SET);
}

export async function createHandoff({
  sourceDirectory, directory, identity, imageRepository, imageId,
}) {
  identity = validateIdentity(identity);
  await requireDirectory(directory, []);
  const names = payloadNames(identity.version);
  const files = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    await regularFile(join(sourceDirectory, name));
    await copyFile(join(sourceDirectory, name), join(directory, name));
    await chmod(join(directory, name), canonicalMode(name));
    appendOwnArrayValue(files, await describeFile(directory, name));
  }
  await writeFile(join(directory, CHECKSUMS), publicChecksums(files), {mode: DATA_MODE});
  appendOwnArrayValue(files, await describeFile(directory, CHECKSUMS));
  const manifest = {schema: SCHEMA, identity,
    image: imageContract(identity, imageRepository, imageId), files};
  await writeFile(join(directory, MANIFEST),
    `${serializeJsonData(manifest, {spacing: 2})}${LINE_END}`, {mode: DATA_MODE});
  return {manifest, manifestSha256: await digest(join(directory, MANIFEST))};
}

async function readManifest(directory, manifestSha256) {
  requireCondition(typeof manifestSha256 === 'string' && matches(HASH, manifestSha256),
    PROBLEM.MANIFEST_DIGEST);
  const directoryStat = await lstat(directory);
  requireCondition(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(),
    PROBLEM.DIRECTORY);
  const file = join(directory, MANIFEST);
  const stat = await regularFile(file);
  requireCondition(stat.size <= MANIFEST_MAX_BYTES, PROBLEM.MANIFEST_SIZE);
  requireCondition(await digest(file) === manifestSha256, PROBLEM.MANIFEST_MISMATCH);
  const manifest = parseManifest(await readFile(file, TEXT_ENCODING));
  requireShape(manifest, MANIFEST_KEYS, PROBLEM.MANIFEST_SHAPE);
  requireCondition(manifest.schema === SCHEMA, PROBLEM.SCHEMA);
  validateIdentity(manifest.identity);
  return manifest;
}

function parseManifest(bytes) {
  try {
    return jsonParse(bytes);
  } catch {
    requireCondition(false, PROBLEM.MANIFEST_JSON);
  }
}

function verifyIdentity(manifest, expected) {
  for (let index = 0; index < MATCHED_IDENTITY_KEYS.length; index += 1) {
    const key = MATCHED_IDENTITY_KEYS[index];
    requireCondition(objectHasOwn(expected, key) && manifest.identity[key] === expected[key],
      `identity mismatch: ${key}`);
  }
  requireShape(manifest.image, IMAGE_KEYS, PROBLEM.IMAGE_SHAPE);
  const image = imageContract(manifest.identity, expected.imageRepository, manifest.image.id);
  requireCondition(isDeepStrictEqual(manifest.image, image), PROBLEM.IMAGE_IDENTITY);
}

async function verifyFiles(directory, manifest) {
  const names = concatenateArraysByIndex(payloadNames(manifest.identity.version), [CHECKSUMS]);
  requireCondition(isDenseDataArray(manifest.files) && manifest.files.length === names.length,
    PROBLEM.FILE_COUNT);
  const allNames = concatenateArraysByIndex(names, [MANIFEST]);
  await requireDirectory(directory, allNames);
  for (let index = 0; index < names.length; index += 1) {
    const actual = await describeFile(directory, names[index]);
    requireCondition(isDeepStrictEqual(manifest.files[index], actual), `file mismatch: ${names[index]}`);
  }
  requireCondition(await readFile(join(directory, CHECKSUMS), TEXT_ENCODING) ===
    publicChecksums(manifest.files), PROBLEM.CHECKSUM_LAYOUT);
  // Artifact transfer strips modes. Restore only canonical, allowlisted modes
  // after ALL bytes and identities have passed; no unverified file is executed.
  for (let index = 0; index < allNames.length; index += 1) {
    const name = allNames[index];
    const file = join(directory, name);
    await chmod(file, canonicalMode(name));
    const stat = await regularFile(file);
    requireCondition((stat.mode & MODE_MASK) === canonicalMode(name), `mode mismatch: ${name}`);
  }
}

export async function verifyHandoff({directory, manifestSha256, expected}) {
  expected = copyStrictOwnDataRecord(expected);
  requireCondition(expected !== null, PROBLEM.EXPECTED);
  const manifest = await readManifest(directory, manifestSha256);
  verifyIdentity(manifest, expected);
  await verifyFiles(directory, manifest);
  return manifest;
}

export function publicAssetPaths(directory, manifest) {
  const paths = [];
  for (let index = 0; index < PUBLIC_ASSET_COUNT; index += 1) {
    appendOwnArrayValue(paths, join(directory, manifest.files[index].name));
  }
  appendOwnArrayValue(paths, join(directory, CHECKSUMS));
  return paths;
}

function ownData(value, key) {
  requireCondition(value !== null && typeof value === 'object', `image field: ${key}`);
  const descriptor = objectDescriptor(value, key);
  requireCondition(descriptor && objectHasOwn(descriptor, DESCRIPTOR_VALUE),
    `image field: ${key}`);
  return descriptor.value;
}

export function verifyHandoffImage(manifest, inspections) {
  requireCondition(isDenseDataArray(inspections) &&
    inspections.length === manifest.image.tags.length,
  PROBLEM.INSPECTION_COUNT);
  const keys = objectKeys(manifest.image.labels);
  for (let index = 0; index < inspections.length; index += 1) {
    const image = inspections[index];
    requireCondition(ownData(image, IMAGE_INSPECTION_ID) === manifest.image.id,
      PROBLEM.LOADED_IMAGE_ID);
    const labels = ownData(ownData(image, 'Config'), 'Labels');
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const key = keys[keyIndex];
      requireCondition(ownData(labels, key) === manifest.image.labels[key],
        `loaded image label: ${key}`);
    }
  }
}

export function authorizeHandoffPublication(manifest, {tag, imageRepository}) {
  requireCondition(typeof tag === 'string', PROBLEM.TAG_VERSION);
  const requests = [
    {action: ACTION.PUBLISH_CONTAINER_IMAGE,
      intended: `${imageRepository}:${stringSlice(tag, 1)}`, actual: manifest.image.tags[0]},
    {action: ACTION.PUBLISH_CONTAINER_IMAGE,
      intended: `${imageRepository}:latest`, actual: manifest.image.tags[1]},
    {action: ACTION.CREATE_PUBLIC_RELEASE, intended: tag, actual: manifest.identity.tag},
  ];
  return copyArrayByIndex(requests, ({action, intended, actual}) => {
    const result = authorizeAction({action,
      signal: {action, tag: intended}, context: {tag: actual}});
    requireCondition(isAuthorized(result), `publication authorization refused: ${action}`);
    return {action, ...result};
  });
}

function verifyLoadedImage(manifest) {
  // Resolve the exact declared references here. Docker may normalize docker.io
  // in RepoTags; the immutable image ID and OCI labels, not spelling aliases,
  // bind both references to the artifact the producer actually smoked.
  const result = spawnSync('docker',
    concatenateArraysByIndex(['image', 'inspect'], manifest.image.tags), {encoding: TEXT_ENCODING});
  requireCondition(result.status === 0, PROBLEM.INSPECTION_FAILED);
  verifyHandoffImage(manifest, parseManifest(result.stdout));
}

function expectedIdentity(env) {
  return {
    repository: env.GITHUB_REPOSITORY,
    workflow: env.GITHUB_WORKFLOW_REF,
    runId: env.GITHUB_RUN_ID,
    tag: env.GITHUB_REF_NAME,
    commit: env.GITHUB_SHA,
    version: env.RELEASE_VERSION,
    imageRepository: env.DOCKERHUB_IMAGE,
  };
}

async function main() {
  const command = process.argv[ARGUMENT_POSITION.COMMAND];
  const directory = process.argv[ARGUMENT_POSITION.DIRECTORY];
  const source = process.argv[ARGUMENT_POSITION.SOURCE];
  const expected = expectedIdentity(process.env);
  if (command === COMMAND.CREATE) {
    const {imageRepository, ...identity} = expected;
    const result = await createHandoff({sourceDirectory: source, directory,
      identity: {...identity, producerAttempt: process.env.GITHUB_RUN_ATTEMPT,
        buildDate: process.env.RELEASE_BUILD_DATE},
      imageRepository, imageId: process.env.RELEASE_IMAGE_ID});
    process.stdout.write(`${result.manifestSha256}\n`);
    return;
  }
  requireCondition(command === COMMAND.VERIFY || command === COMMAND.AUTHORIZE ||
    command === COMMAND.ASSETS, PROBLEM.COMMAND);
  const manifest = await verifyHandoff({directory,
    manifestSha256: process.env.RELEASE_HANDOFF_SHA256, expected});
  if (command === COMMAND.AUTHORIZE) {
    verifyLoadedImage(manifest);
    authorizeHandoffPublication(manifest, {tag: expected.tag,
      imageRepository: expected.imageRepository});
  }
  if (command === COMMAND.ASSETS) {
    const paths = joinArrayByIndex(publicAssetPaths(directory, manifest), LINE_END);
    process.stdout.write(`${paths}${LINE_END}`);
    return;
  }
  process.stdout.write(`${VERIFIED}${LINE_END}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
