/** Local, read-only custody of retained solve evidence. No asset retrieval. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {RELOCATION} from './evidence-store.js';
import {requiredProofArtifacts} from './probes.js';
import {listQuestIds, readQuest} from './store.js';
import {LOG_FILE, QUEST_FILE} from './schema.js';

const parseJson = JSON.parse;
const setPrototypeOf = Object.setPrototypeOf;
const arrayIsArray = Array.isArray;
const isSafeInteger = Number.isSafeInteger;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSlice = Function.call.bind(String.prototype.slice);

const TEXT_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const TUPLE_LENGTH = 3;
const IDENTITY_FIELDS = Object.freeze(['bundle', 'sourceCommit', 'url', 'shard', 'bundleSha256']);
const SHARD_FIELDS = Object.freeze(['bundle', 'sourceCommit', 'url', 'root', 'bundleSha256']);
const SOLVE_PREFIX = 'solve/';
const PATH_SEPARATOR = '/';
const EMPTY_TEXT = '';
const PARENT_SEGMENT = '..';
const CURRENT_SEGMENT = '.';
const BACKSLASH = '\\';
const URL_PROTOCOL = 'https:';
const MISSING_PATH_CODE = 'ENOENT';
const PROBLEM = Object.freeze({
  INVENTORY: 'inventory index missing, malformed or empty',
  CATALOG: 'record catalog cannot be read as a directory',
  BUNDLE: 'bundle fields malformed or identity duplicated',
  SHARD: 'shard missing, malformed or header disagrees',
  MEMBERS: 'shard members malformed or count disagrees',
  VERIFICATION: 'verification missing, unmatched, duplicated or identity disagrees',
  CUSTODY: 'bundle has no passing verification',
  CONTAINMENT: 'record or member escapes its owner',
  DUPLICATE: 'path inventoried twice',
  PROTECTED: 'inventoried path is protected',
});

function sha256(buffer) {
  return crypto.createHash(HASH_ALGORITHM).update(buffer).digest(HASH_ENCODING);
}

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !arrayIsArray(value);
}

function readJson(file) {
  try {
    const record = parseJson(fs.readFileSync(file, TEXT_ENCODING), (_key, value) =>
      value !== null && typeof value === 'object' && !arrayIsArray(value) ?
        setPrototypeOf(value, null) : value);
    return plainRecord(record) ? record : null;
  } catch (_error) {
    return null;
  }
}

function relativeInside(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) &&
    !stringIncludes(value, BACKSLASH) && !stringIncludes(value, '\0') &&
    arrayEvery(stringSplit(value, PATH_SEPARATOR), (part) => part !== PARENT_SEGMENT &&
      part !== CURRENT_SEGMENT && part !== EMPTY_TEXT);
}

// Check physical ancestors too: absent members must not traverse an escaping symlink.
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === EMPTY_TEXT ||
    relativeInside(arrayJoin(stringSplit(relative, path.sep), PATH_SEPARATOR));
}

function physicalPath(file) {
  try {
    // lstat distinguishes a dangling link from an absent member. Neither a
    // dangling link nor an unresolvable cycle can establish physical custody.
    const stat = fs.lstatSync(file, {throwIfNoEntry: false});
    if (stat) return fs.realpathSync(file);
  } catch (_error) {
    return null;
  }
  const parent = path.dirname(file);
  if (parent === file) return file;
  const physicalParent = physicalPath(parent);
  return physicalParent === null ? null : path.join(physicalParent, path.basename(file));
}

function safePath(root, target) {
  const physicalRoot = physicalPath(path.resolve(root));
  const physicalTarget = physicalPath(path.resolve(target));
  return contained(path.resolve(root), path.resolve(target)) &&
    physicalRoot !== null && physicalTarget !== null && contained(physicalRoot, physicalTarget);
}

function releaseUrl(value) {
  try {
    return typeof value === 'string' && new URL(value).protocol === URL_PROTOCOL;
  } catch (_error) {
    return false;
  }
}

function bundleFieldsOk(entry) {
  return plainRecord(entry) && relativeInside(entry.bundle) &&
    !stringIncludes(entry.bundle, PATH_SEPARATOR) && typeof entry.bundleSha256 === 'string' && regexpTest(SHA256_PATTERN, entry.bundleSha256) &&
    releaseUrl(entry.url) && typeof entry.sourceCommit === 'string' && regexpTest(COMMIT_PATTERN, entry.sourceCommit) &&
    typeof entry.root === 'string' &&
    (entry.root === EMPTY_TEXT || (stringEndsWith(entry.root, PATH_SEPARATOR) &&
      relativeInside(stringSlice(entry.root, 0, -1)))) &&
    isSafeInteger(entry.files) && entry.files > 0 && relativeInside(entry.shard);
}

function tupleOk(tuple) {
  return arrayIsArray(tuple) && tuple.length === TUPLE_LENGTH &&
    relativeInside(tuple[0]) && typeof tuple[1] === 'string' && regexpTest(SHA256_PATTERN, tuple[1]) &&
    isSafeInteger(tuple[2]) && tuple[2] >= 0;
}

function protectedMember(file, required) {
  return required.has(file) || arrayIncludes([LOG_FILE, QUEST_FILE], path.posix.basename(file)) ||
    file === RELOCATION.RECORDS_DIR || stringStartsWith(file, `${RELOCATION.RECORDS_DIR}/`);
}

function memberOf(root, evidence, entry, tuple) {
  const oldPath = `${entry.root}${tuple[0]}`;
  if (!relativeInside(oldPath) || !stringStartsWith(oldPath, SOLVE_PREFIX) ||
      !safePath(root, path.resolve(root, oldPath))) return null;
  return {path: oldPath, sha256: tuple[1], bytes: tuple[2], bundle: entry.bundle,
    bundleSha256: entry.bundleSha256, sourceCommit: entry.sourceCommit, url: entry.url,
    shard: arrayJoin(stringSplit(path.relative(root, path.join(evidence, entry.shard)), path.sep), '/')};
}

function readBundle(root, evidence, entry) {
  const shardFile = path.resolve(evidence, entry.shard);
  if (!safePath(evidence, shardFile)) return {problems: [PROBLEM.CONTAINMENT], files: []};
  const shard = readJson(shardFile);
  if (!shard || shard.schema !== RELOCATION.SHARD_SCHEMA ||
      !arrayEvery(SHARD_FIELDS, (field) => shard[field] === entry[field])) {
    return {problems: [PROBLEM.SHARD], files: []};
  }
  if (!arrayIsArray(shard.files) || shard.files.length !== entry.files ||
      !arrayEvery(shard.files, tupleOk)) return {problems: [PROBLEM.MEMBERS], files: []};
  const members = arrayMap(shard.files, (tuple) => memberOf(root, evidence, entry, tuple));
  return {problems: arrayIncludes(members, null) ? [PROBLEM.CONTAINMENT] : [],
    files: arrayFilter(members, (member) => member !== null),
    shardSha256: sha256(fs.readFileSync(shardFile))};
}

function emptyList(value) {
  return arrayIsArray(value) && value.length === 0;
}

function allResultsMatch(results, count) {
  if (typeof results !== 'string' || results.length !== count) return false;
  for (let index = 0; index < results.length; index += 1) {
    if (results[index] !== RELOCATION.RESULT_MATCH) return false;
  }
  return true;
}

function verificationPasses(record, entry, bundle) {
  return bundle.problems.length === 0 && bundle.files.length === entry.files &&
    typeof bundle.shardSha256 === 'string' && plainRecord(record) &&
    arrayEvery(IDENTITY_FIELDS, (field) => record[field] === entry[field]) &&
    record.verified === true && record.extracted === true && record.manifestMatches === true &&
    record.downloadedSha256 === entry.bundleSha256 && record.shardSha256 === bundle.shardSha256 &&
    emptyList(record.unexpectedMembers) && emptyList(record.mismatches) &&
    record.members === entry.files && allResultsMatch(record.results, bundle.files.length);
}

function duplicatePaths(files) {
  const seen = new Set();
  return arrayMap(arrayFilter(files, (file) => {
    if (seen.has(file.path)) return true;
    seen.add(file.path);
    return false;
  }), (file) => `${file.path}: ${PROBLEM.DUPLICATE}`);
}

/** Read one explicitly selected local record home; acceptance also uses this owner. */
function readRelocationRecords(root, evidence, required = new Set()) {
  const result = {inventoryProblems: [], verificationProblems: [], protectedProblems: [],
    files: [], bundles: [], duplicateProblems: []};
  const recordFiles = [RELOCATION.INVENTORY_FILE, RELOCATION.VERIFICATION_FILE];
  if (!safePath(root, evidence) ||
      !arrayEvery(recordFiles, (file) => safePath(evidence, path.join(evidence, file)))) {
    result.inventoryProblems.push(PROBLEM.CONTAINMENT);
    result.verificationProblems.push(PROBLEM.CONTAINMENT);
    return result;
  }
  const index = readJson(path.join(evidence, RELOCATION.INVENTORY_FILE));
  if (!index || index.schema !== RELOCATION.INVENTORY_SCHEMA ||
      !arrayIsArray(index.bundles) || index.bundles.length === 0) {
    result.inventoryProblems.push(PROBLEM.INVENTORY);
  } else result.bundles = index.bundles;
  const verification = readJson(path.join(evidence, RELOCATION.VERIFICATION_FILE));
  const records = verification?.schema === RELOCATION.VERIFICATION_SCHEMA &&
    arrayIsArray(verification.bundles) ? verification.bundles : [];
  if (records.length === 0 || result.bundles.length === 0) {
    result.verificationProblems.push(PROBLEM.VERIFICATION);
  }
  const seenBundles = new Set();
  for (const entry of result.bundles) {
    if (!bundleFieldsOk(entry) || seenBundles.has(entry.bundle)) {
      result.inventoryProblems.push(PROBLEM.BUNDLE);
      continue;
    }
    seenBundles.add(entry.bundle);
    const bundle = readBundle(root, evidence, entry);
    result.inventoryProblems.push(...bundle.problems);
    result.files.push(...bundle.files);
    const matching = arrayFilter(records, (record) => record?.bundle === entry.bundle);
    if (matching.length !== 1) result.verificationProblems.push(PROBLEM.VERIFICATION);
    else if (!verificationPasses(matching[0], entry, bundle)) {
      result.verificationProblems.push(`${entry.bundle}: ${PROBLEM.CUSTODY}`);
    }
  }
  if (arraySome(records, (record) => !seenBundles.has(record?.bundle))) {
    result.verificationProblems.push(PROBLEM.VERIFICATION);
  }
  result.duplicateProblems = duplicatePaths(result.files);
  result.inventoryProblems.push(...result.duplicateProblems);
  result.protectedProblems = arrayMap(arrayFilter(result.files,
    (file) => protectedMember(file.path, required)),
  (file) => `${file.path}: ${PROBLEM.PROTECTED}`);
  return result;
}

/** The canonical catalog is restricted to evidence-owner record homes. */
function readVerifiedRelocationCatalog(root, required = new Set()) {
  const home = path.resolve(root, RELOCATION.RECORDS_DIR);
  const result = {members: new Map(), problems: [], ambiguous: false, homes: []};
  if (!safePath(root, home)) {
    result.problems.push(PROBLEM.CONTAINMENT);
    return result;
  }
  let names;
  try {
    names = fs.readdirSync(home);
  } catch (error) {
    if (error.code !== MISSING_PATH_CODE) result.problems.push(PROBLEM.CATALOG);
    return result;
  }
  const files = [];
  for (const name of names) {
    const evidence = path.join(home, name);
    if (!safePath(home, evidence)) {
      result.problems.push(PROBLEM.CONTAINMENT);
      continue;
    }
    const record = readRelocationRecords(root, evidence, required);
    result.homes.push(evidence);
    result.problems.push(...record.inventoryProblems, ...record.verificationProblems,
      ...record.protectedProblems);
    if (record.duplicateProblems.length > 0) result.ambiguous = true;
    files.push(...record.files);
  }
  const duplicates = duplicatePaths(files);
  result.problems.push(...duplicates);
  if (duplicates.length > 0) result.ambiguous = true;
  if (result.problems.length === 0) {
    for (const file of files) result.members.set(file.path, file);
  }
  return result;
}

/** Every artifact designated by the canonical sealed probe owner. */
function requiredArtifacts(root) {
  return new Set(arrayFlatMap(listQuestIds(root), (id) =>
    requiredProofArtifacts(readQuest(root, id).doneWhen)));
}

export {readRelocationRecords, readVerifiedRelocationCatalog, requiredArtifacts};
