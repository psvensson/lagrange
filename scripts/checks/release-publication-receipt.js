/**
 * The newest release publication receipt, and how many of its artifacts are
 * not published.
 *
 *   node scripts/checks/release-publication-receipt.js [--metric] [--json]
 *
 * The release workflow writes one compact receipt per tag to
 * data/releases/<tag>.json: the tag, the exact commit, and for each artifact
 * (npm, docker, helm, github) whether it was published and where. This is
 * the ONE reader of that file: the apparatus-release-consolidation budget
 * and the release-pipeline-dry-run probe both ask it, so "published"
 * means one thing.
 *
 * The last stdout line is the number of artifacts the newest receipt does
 * not show as published - every artifact when there is no receipt at all -
 * and the exit code is 0 only when that number is 0. `--metric` prints only
 * the number; `--json` prints the receipt and the per-artifact verdicts.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringIncludes = Function.call.bind(String.prototype.includes);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringReplace = Function.call.bind(String.prototype.replace);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASES_DIR = 'data/releases';
const RECEIPT_SUFFIX = '.json';
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const ARGV_OFFSET = 2;
const JSON_FLAG = '--json';
const METRIC_FLAG = '--metric';
// --reobserve-next: after the release owner's manual `npm dist-tag add`, read
// npm's dist-tags again and record next as now observed in the newest
// receipt (next, nextLagging, nextObservedAt), so the consolidation budget
// row clears from evidence, never by hand-editing an observed value. A
// network read, invoked by the owner: it refuses under a probe (R27).
const REOBSERVE_NEXT_FLAG = '--reobserve-next';
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPM_DIST_TAGS_ARGS = Object.freeze(['view', 'lagrange-server', 'dist-tags', '--json']);
const REOBSERVE_REFUSAL_SUBJECT = 'a registry read';
const PRERELEASE_MARK = '-';
const VERSION_SEPARATOR = '.';
const CORE_PARTS = 3;
const EMPTY = '';
const TAG_PREFIX = /^v/u;
const JSON_FILE_INDENT = 2;
const JSON_INDENT = 2;
const EXIT_OK = 0;
const EXIT_UNPUBLISHED = 1;
const MET_MARK = 'ok  ';
const UNMET_MARK = 'MISSING';

// The four artifacts a release publishes. Consumers read them as the rows of
// receiptVerdicts(), never as a list they could diverge from.
const RELEASE_ARTIFACTS = Object.freeze(['npm', 'docker', 'helm', 'github']);

// Receipt files in release order: version core ascending, a prerelease
// before its final. Lexical order put v0.2.10 below v0.2.9 (verifier,
// 2026-09-13), which would have rewritten the wrong release's record.
function receiptFiles(root) {
  const dir = path.join(root, RELEASES_DIR);
  if (!fs.existsSync(dir)) return [];
  const files = arrayFilter(fs.readdirSync(dir),
    (name) => stringEndsWith(name, RECEIPT_SUFFIX));
  return arraySort(files, (left, right) =>
    compareReleaseTags(receiptTag(left), receiptTag(right)));
}

function receiptTag(fileName) {
  return stringSlice(fileName, 0, fileName.length - RECEIPT_SUFFIX.length);
}

function compareReleaseTags(left, right) {
  const leftCore = versionCore(stringReplace(left, TAG_PREFIX, EMPTY));
  const rightCore = versionCore(stringReplace(right, TAG_PREFIX, EMPTY));
  for (let index = 0; index < CORE_PARTS; index += 1) {
    const delta = (leftCore[index] || 0) - (rightCore[index] || 0);
    if (delta !== 0) return delta;
  }
  const leftPre = stringIncludes(left, PRERELEASE_MARK);
  const rightPre = stringIncludes(right, PRERELEASE_MARK);
  if (leftPre !== rightPre) return leftPre ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The newest receipt in release order (version core, a prerelease before its
 * final), or null when none exists or the newest is not valid JSON.
 * @param {string} root
 * @return {object|null}
 */
export function newestReleaseReceipt(root = REPO_ROOT) {
  const files = receiptFiles(root);
  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(
      path.join(root, RELEASES_DIR, files[files.length - 1]), TEXT_ENCODING));
  } catch {
    return null;
  }
}

function artifactPublished(receipt, name) {
  if (!receipt || typeof receipt !== 'object') return false;
  const published = receipt.published || receipt.artifacts || {};
  const entry = published[name];
  return entry === true || Boolean(entry && entry.published === true);
}

/**
 * One row per release artifact: whether the newest receipt shows it published.
 * @param {string} root
 * @return {{receipt: object|null, rows: Array<{name: string, published: boolean}>}}
 */
export function receiptVerdicts(root = REPO_ROOT) {
  const receipt = newestReleaseReceipt(root);
  return {
    receipt,
    rows: arrayMap(RELEASE_ARTIFACTS,
      (name) => ({name, published: artifactPublished(receipt, name)})),
  };
}

function versionCore(version) {
  return arrayMap(stringSplit(stringSplit(String(version || ''), PRERELEASE_MARK)[0],
    VERSION_SEPARATOR), Number);
}

/**
 * Whether next lags latest: absent, on an older major.minor.patch, or a
 * prerelease of the very core latest released (semver order).
 * @param {string|null} next
 * @param {string|null} latest
 * @return {boolean}
 */
export function nextLagsLatest(next, latest) {
  if (!latest) return false;
  if (!next) return true;
  const left = versionCore(next);
  const right = versionCore(latest);
  for (let index = 0; index < CORE_PARTS; index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) {
      return (left[index] || 0) < (right[index] || 0);
    }
  }
  return stringIncludes(String(next), PRERELEASE_MARK) &&
    !stringIncludes(String(latest), PRERELEASE_MARK);
}

function defaultDistTags() {
  return JSON.parse(execFileSync(NPM_COMMAND, [...NPM_DIST_TAGS_ARGS], {encoding: TEXT_ENCODING}));
}

/**
 * Rewrite the newest receipt's npm.next fields from npm as observed now.
 * @param {string} root
 * @param {() => object} readDistTags
 * @return {{file: string, npm: object}|null}
 */
export function reobserveNext(root = REPO_ROOT, readDistTags = defaultDistTags) {
  refuseUnderProbe(REOBSERVE_REFUSAL_SUBJECT);
  const files = receiptFiles(root);
  if (files.length === 0) return null;
  const file = path.join(root, RELEASES_DIR, files[files.length - 1]);
  const receipt = JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  const distTags = readDistTags();
  const npm = receipt.published?.npm || {};
  receipt.published = {...receipt.published, npm: {...npm,
    latest: distTags.latest || null, next: distTags.next || null,
    nextLagging: nextLagsLatest(distTags.next, distTags.latest),
    nextObservedAt: new Date().toISOString()}};
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, JSON_FILE_INDENT)}${LINE_SEPARATOR}`);
  return {file: path.relative(root, file), npm: receipt.published.npm};
}

function main(argv) {
  if (arrayIncludes(argv, REOBSERVE_NEXT_FLAG)) {
    const observed = reobserveNext();
    process.stdout.write(`${JSON.stringify(observed, null, JSON_INDENT)}${LINE_SEPARATOR}`);
    return observed && observed.npm.nextLagging ? EXIT_UNPUBLISHED : EXIT_OK;
  }
  const {receipt, rows} = receiptVerdicts();
  const unpublished = arrayFilter(rows, (row) => !row.published).length;
  if (arrayIncludes(argv, JSON_FLAG)) {
    process.stdout.write(
      `${JSON.stringify({receipt, rows, unpublished}, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  } else if (!arrayIncludes(argv, METRIC_FLAG)) {
    for (const row of rows) {
      process.stdout.write(
        `${row.published ? MET_MARK : UNMET_MARK} ${row.name}${LINE_SEPARATOR}`);
    }
  }
  process.stdout.write(`${unpublished}${LINE_SEPARATOR}`);
  return unpublished === 0 ? EXIT_OK : EXIT_UNPUBLISHED;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}
