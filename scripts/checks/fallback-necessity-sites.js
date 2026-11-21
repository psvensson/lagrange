/**
 * A fallback site as the necessity apparatus sees it: its id, its directory
 * cell and its evidence bucket from the committed coverage census
 * (data/fallback-census/census.json). The trap plan
 * (fallback-necessity-trap.js) and the one-way ratchet
 * (fallback-read-closure.js) read sites only through here, so a bucket means
 * the same thing in both.
 *
 * Buckets (reports/necessity/README.md section 3), from the lanes of the runs
 * in which each side of the site executed (`sidesByRun`):
 *   N0  neither side executed in any lane
 *   N1  the primary executed, the alternate never did
 *   N2  the alternate executed, the primary never did
 *   N3  the alternate executed in the unit lane only
 *   N4b the alternate executed in the bootstrap lane, never in integration,
 *       packaging or formation
 *   N4c the alternate executed in integration or packaging, never in formation
 *   N5  the alternate executed in the formation lane
 * A site whose identity (row, file, hash, occurrence) has no valid census
 * record is `uncensused`.
 *
 * Integrity: a record is evidence only for the text it was measured on. Its
 * slice hash must reproduce from the file at the census head (one
 * `git cat-file --batch` read), every run it names must be a census run, and
 * its per-run sides must agree with its summary and class. A record failing
 * any of these is UNREPRODUCIBLE: listed by name and never used as evidence.
 * The 2026-11-14 hand edit of a partition-cdc-delivery.js record fails the
 * slice check. These checks bound tampering; they cannot re-derive coverage,
 * which only a re-join from the runs' coverage can.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load; census records are read by own fields only.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CENSUS_LANE, CENSUS_ROWS, CENSUS_SCHEMA, REQUIRED_CENSUS_LANES,
} from './fallback-branch-census-constants.js';
import {ownField, siteIdentity} from './code-navigability-source.js';
import {GIT_OUTPUT_BOUND, spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const bufferIndexOf = Function.call.bind(Buffer.prototype.indexOf);
const bufferSubarray = Function.call.bind(Buffer.prototype.subarray);
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const jsonParse = JSON.parse;
const numberIsInteger = Number.isInteger;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const TEXT_ENCODING = 'utf8';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const HASH_SEPARATOR = '\n';
const PATH_SEPARATOR = '/';
const ROOT_DIRECTORY = '.';
const NESTED_PATH_PARTS = 2;
const SOURCE_PREFIX = 'src/';
const SITE_ID_HASH_CHARS = 12;
const ID_SEPARATOR = '.';
const SIDES_SEPARATOR = '|';
const OBJECT_TYPE_NAME = 'object';
const STRING_TYPE_NAME = 'string';
const NEWLINE_BYTE = 10;
const HEADER_FIELD_SEPARATOR = ' ';
const BLOB_TYPE = 'blob';
const BLOB_HEADER_TYPE_FIELD = 1;
const BLOB_HEADER_SIZE_FIELD = 2;
const REVISION_FILE_SEPARATOR = ':';
const GIT_CAT_FILE_BATCH = Object.freeze(['cat-file', '--batch']);
const GIT_OK = 0;

const FIELD = Object.freeze({
  SCHEMA: 'schema', HEAD: 'head', RUNS: 'runs', SITES: 'sites', ID: 'id', LANE: 'lane',
  FILE: 'file', RANGE: 'range', HASH: 'hash', CLASS: 'class',
  SIDES_EXECUTED: 'sidesExecuted', SIDES_BY_RUN: 'sidesByRun',
});
const SIDE = Object.freeze({PRIMARY: 'primary', FALLBACK: 'fallback'});
const SIDES = Object.freeze([SIDE.PRIMARY, SIDE.FALLBACK]);

const ROW_CODE = Object.freeze({
  two_source_fallback_reads: 'ts',
  typeof_dual_paths: 'ty',
  catch_returns_default: 'ca',
});

const NECESSITY_BUCKET = Object.freeze({
  N0: 'N0', N1: 'N1', N2: 'N2', N3: 'N3', N4B: 'N4b', N4C: 'N4c', N5: 'N5',
  UNCENSUSED: 'uncensused',
});
const EVIDENCE_BUCKETS = Object.freeze([
  NECESSITY_BUCKET.N0, NECESSITY_BUCKET.N1, NECESSITY_BUCKET.N2, NECESSITY_BUCKET.N3,
  NECESSITY_BUCKET.N4B, NECESSITY_BUCKET.N4C, NECESSITY_BUCKET.N5,
]);
// How exercised a bucket's alternate is: a census refresh may move a site
// only to an equal or lower rank (reports/necessity/ratchet.md 1.3).
const BUCKET_RANK = Object.freeze({
  [NECESSITY_BUCKET.N0]: 0, [NECESSITY_BUCKET.N1]: 1, [NECESSITY_BUCKET.N2]: 1,
  [NECESSITY_BUCKET.N3]: 2, [NECESSITY_BUCKET.N4B]: 3, [NECESSITY_BUCKET.N4C]: 4,
  [NECESSITY_BUCKET.N5]: 5,
});

const CLASS_BY_SIDES = Object.freeze({
  'false|false': 'never',
  'true|false': 'primary-only',
  'false|true': 'fallback-only',
  'true|true': 'both',
});

const UNREPRODUCIBLE = Object.freeze({
  SHAPE: 'record-shape-invalid',
  DUPLICATE: 'duplicate-identity',
  UNKNOWN_RUN: 'names-a-run-outside-the-census',
  INCONSISTENT: 'sides-disagree-with-summary-or-class',
  FILE_ABSENT: 'file-absent-at-census-head',
  SLICE_DIFFERS: 'slice-hash-does-not-reproduce-at-census-head',
});

const PROBLEM = Object.freeze({
  CENSUS_MISSING: 'census file missing: ',
  CENSUS_SCHEMA: 'census schema is not ',
  CENSUS_HEAD: 'census head is not a 40-hex commit',
  GIT_BATCH: 'git cat-file --batch failed: ',
});
const COMMIT_HASH = /^[0-9a-f]{40}$/u;

function sha256(text) {
  return createHash(DIGEST_ALGORITHM).update(text).digest(DIGEST_ENCODING);
}

function isPlainObject(value) {
  return typeof value === OBJECT_TYPE_NAME && value !== null && !arrayIsArray(value);
}

function isRange(value) {
  return arrayIsArray(value) && value.length === 2 && numberIsInteger(value[0]) &&
    numberIsInteger(value[1]) && value[0] >= 0 && value[0] <= value[1];
}

/**
 * The id the trap and the kept-arm file name a site by:
 * `<row code>.<first 12 hex of its hash>.<occurrence>`, e.g. `ts.3fa9c01b22de.0`.
 * @param {{row: string, hash: string, occurrence: number}} site a detector site
 * @return {string} the id
 */
function necessitySiteId(site) {
  return `${ROW_CODE[site.row]}${ID_SEPARATOR}` +
    `${stringSlice(site.hash, 0, SITE_ID_HASH_CHARS)}${ID_SEPARATOR}${site.occurrence}`;
}

/**
 * The directory cell of a repo-relative file: the first directory under its
 * tree root (`src/query/a.js` -> `query`), `.` for a file directly under it.
 * @param {string} file repo-relative path with `/`
 * @return {string} the directory key
 */
function siteDirectory(file) {
  const parts = stringSplit(file, PATH_SEPARATOR);
  return parts.length > NESTED_PATH_PARTS ? parts[1] : ROOT_DIRECTORY;
}

function isCensusRowSite(site) {
  return arrayIncludes(CENSUS_ROWS, site.row) && stringStartsWith(site.file, SOURCE_PREFIX);
}

function censusLaneByRun(census) {
  const lanes = new Map();
  for (const run of ownField(census, FIELD.RUNS) || []) {
    lanes.set(ownField(run, FIELD.ID), ownField(run, FIELD.LANE));
  }
  return lanes;
}

function lanesOfSide(record, side, laneByRun) {
  const lanes = new Set();
  const byRun = ownField(record, FIELD.SIDES_BY_RUN);
  for (const runId of objectKeys(byRun)) {
    if (ownField(byRun[runId], side) === true) lanes.add(laneByRun.get(runId));
  }
  return lanes;
}

/**
 * The evidence bucket of a census record (see the header).
 * @param {Object} record a census site record with valid evidence
 * @param {Map<string,string>} laneByRun run id -> lane
 * @return {string} one of EVIDENCE_BUCKETS
 */
function censusBucket(record, laneByRun) {
  const alternate = lanesOfSide(record, SIDE.FALLBACK, laneByRun);
  const primary = lanesOfSide(record, SIDE.PRIMARY, laneByRun);
  if (alternate.size === 0) return primary.size === 0 ? NECESSITY_BUCKET.N0 : NECESSITY_BUCKET.N1;
  if (primary.size === 0) return NECESSITY_BUCKET.N2;
  if (alternate.has(CENSUS_LANE.FORMATION)) return NECESSITY_BUCKET.N5;
  if (alternate.has(CENSUS_LANE.INTEGRATION) || alternate.has(CENSUS_LANE.PACKAGING)) {
    return NECESSITY_BUCKET.N4C;
  }
  return alternate.has(CENSUS_LANE.BOOTSTRAP) ? NECESSITY_BUCKET.N4B : NECESSITY_BUCKET.N3;
}

function sideSummaryAgrees(record, runIds) {
  const byRun = ownField(record, FIELD.SIDES_BY_RUN);
  const summary = ownField(record, FIELD.SIDES_EXECUTED);
  if (!isPlainObject(summary)) return false;
  for (const side of SIDES) {
    const any = arraySome(runIds, (runId) => ownField(byRun[runId], side) === true);
    if (ownField(summary, side) !== any) return false;
  }
  const klass = CLASS_BY_SIDES[`${summary.primary}${SIDES_SEPARATOR}${summary.fallback}`];
  return ownField(record, FIELD.CLASS) === klass;
}

// Why a record's evidence cannot stand, judged without the source text.
function evidenceProblem(record, laneByRun) {
  if (siteIdentity(record) === undefined || !isRange(ownField(record, FIELD.RANGE))) {
    return UNREPRODUCIBLE.SHAPE;
  }
  const byRun = ownField(record, FIELD.SIDES_BY_RUN);
  const runs = ownField(record, FIELD.RUNS);
  if (!isPlainObject(byRun) || !arrayIsArray(runs)) return UNREPRODUCIBLE.SHAPE;
  const runIds = objectKeys(byRun);
  if (!arrayEvery(runIds, (runId) => laneByRun.has(runId)) ||
      !arrayEvery(runs, (runId) => laneByRun.has(runId))) {
    return UNREPRODUCIBLE.UNKNOWN_RUN;
  }
  const sameRuns = runs.length === runIds.length &&
    arrayEvery(runs, (runId) => objectHasOwn(byRun, runId));
  return sameRuns && sideSummaryAgrees(record, runIds) ? null : UNREPRODUCIBLE.INCONSISTENT;
}

function sliceProblem(record, text) {
  if (typeof text !== STRING_TYPE_NAME) return UNREPRODUCIBLE.FILE_ABSENT;
  const [start, end] = record.range;
  if (end > text.length) return UNREPRODUCIBLE.SLICE_DIFFERS;
  const hash = sha256(`${record.file}${HASH_SEPARATOR}${stringSlice(text, start, end)}`);
  return hash === record.hash ? null : UNREPRODUCIBLE.SLICE_DIFFERS;
}

function recordProblem(record, laneByRun, texts, evidence) {
  const problem = evidenceProblem(record, laneByRun) ||
    sliceProblem(record, texts.get(record.file));
  if (problem) return problem;
  return evidence.has(siteIdentity(record)) ? UNREPRODUCIBLE.DUPLICATE : null;
}

/**
 * The text of each file at a revision, in one `git cat-file --batch` read;
 * a file absent at the revision maps to null.
 * @param {string} root the checkout
 * @param {string} revision a commit
 * @param {string[]} files repo-relative paths
 * @return {Map<string, string|null>} file -> text
 */
function readFilesAtRevision(root, revision, files) {
  const texts = new Map();
  if (files.length === 0) return texts;
  const input = arrayMap(files, (file) =>
    `${revision}${REVISION_FILE_SEPARATOR}${file}${HASH_SEPARATOR}`).join('');
  const result = spawnGit(GIT_CAT_FILE_BATCH, {
    cwd: root, env: gitProcessEnvironment(), input, bound: GIT_OUTPUT_BOUND.HISTORY_BLOB_BATCH,
  });
  if (result.status !== GIT_OK) {
    throw new Error(`${PROBLEM.GIT_BATCH}${String(result.stderr || result.error?.message)}`);
  }
  const output = result.stdout;
  let offset = 0;
  for (const file of files) {
    const lineEnd = bufferIndexOf(output, NEWLINE_BYTE, offset);
    const header = stringSplit(bufferToString(output, TEXT_ENCODING, offset, lineEnd),
      HEADER_FIELD_SEPARATOR);
    offset = lineEnd + 1;
    if (header[BLOB_HEADER_TYPE_FIELD] !== BLOB_TYPE) {
      texts.set(file, null);
      continue;
    }
    const size = Number(header[BLOB_HEADER_SIZE_FIELD]);
    texts.set(file, bufferToString(bufferSubarray(output, offset, offset + size), TEXT_ENCODING));
    offset += size + 1;
  }
  return texts;
}

function readCensus(root, censusFile) {
  const absolute = path.resolve(root, censusFile);
  if (!fs.existsSync(absolute)) throw new Error(`${PROBLEM.CENSUS_MISSING}${censusFile}`);
  const census = jsonParse(fs.readFileSync(absolute, TEXT_ENCODING));
  if (ownField(census, FIELD.SCHEMA) !== CENSUS_SCHEMA) {
    throw new Error(`${PROBLEM.CENSUS_SCHEMA}${CENSUS_SCHEMA}: ${censusFile}`);
  }
  if (!COMMIT_HASH.test(String(ownField(census, FIELD.HEAD)))) {
    throw new Error(`${PROBLEM.CENSUS_HEAD}: ${censusFile}`);
  }
  return census;
}

/**
 * Audit every census record (see the header) and bucket the valid ones.
 * @param {Object} census a parsed census
 * @param {{root?: string, readFiles?: Function}} options `readFiles(files)`
 *   returns file -> text at the census head; by default read through git
 * @return {Object} `{head, laneByRun, evidence: Map identity -> {record,
 *   bucket}, unreproducible: [{record, reason}], missingLanes}`
 */
function auditCensus(census, {root, readFiles} = {}) {
  const laneByRun = censusLaneByRun(census);
  const records = ownField(census, FIELD.SITES) || [];
  const files = [...new Set(arrayMap(arrayFilter(records, isPlainObject),
    (record) => String(ownField(record, FIELD.FILE))))].sort();
  const head = ownField(census, FIELD.HEAD);
  const texts = readFiles ? readFiles(files) : readFilesAtRevision(root, head, files);
  const evidence = new Map();
  const unreproducible = [];
  for (const record of records) {
    const reason = recordProblem(record, laneByRun, texts, evidence);
    if (reason) unreproducible.push({record, reason});
    else evidence.set(siteIdentity(record), {record, bucket: censusBucket(record, laneByRun)});
  }
  const presentLanes = new Set(laneByRun.values());
  const missingLanes = arrayFilter(REQUIRED_CENSUS_LANES, (lane) => !presentLanes.has(lane));
  return {head, laneByRun, evidence, unreproducible, missingLanes};
}

/**
 * The bucket of a tree site under an audited census.
 * @param {Object} site a detector site
 * @param {Object|null} audit auditCensus's answer, or null for no census
 * @return {string} a bucket
 */
function siteBucket(site, audit) {
  const found = audit ? audit.evidence.get(siteIdentity(site)) : undefined;
  return found ? found.bucket : NECESSITY_BUCKET.UNCENSUSED;
}

function bucketRank(bucket) {
  return objectHasOwn(BUCKET_RANK, bucket) ? BUCKET_RANK[bucket] : undefined;
}

export {
  EVIDENCE_BUCKETS,
  NECESSITY_BUCKET,
  UNREPRODUCIBLE,
  auditCensus,
  bucketRank,
  censusBucket,
  censusLaneByRun,
  isCensusRowSite,
  necessitySiteId,
  readCensus,
  readFilesAtRevision,
  sha256,
  siteBucket,
  siteDirectory,
};
