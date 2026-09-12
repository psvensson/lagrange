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
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
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
const JSON_INDENT = 2;
const EXIT_OK = 0;
const EXIT_UNPUBLISHED = 1;
const MET_MARK = 'ok  ';
const UNMET_MARK = 'MISSING';

// The four artifacts a release publishes. Consumers read them as the rows of
// receiptVerdicts(), never as a list they could diverge from.
const RELEASE_ARTIFACTS = Object.freeze(['npm', 'docker', 'helm', 'github']);

function receiptFiles(root) {
  const dir = path.join(root, RELEASES_DIR);
  if (!fs.existsSync(dir)) return [];
  return arrayFilter(fs.readdirSync(dir),
    (name) => stringEndsWith(name, RECEIPT_SUFFIX)).sort();
}

/**
 * The newest receipt by file name (tags sort by version when zero-padded the
 * way the workflow writes them), or null when none exists or the newest is
 * not valid JSON.
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

function main(argv) {
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
