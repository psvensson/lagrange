#!/usr/bin/env node
/**
 * The comparative-benchmark history and invalidation ledger are append-only
 * (`npm run audit:benchmark-history-append-only`, R21).
 *
 * `data/tidb-comparison/history.ndjson` holds every comparison record ever
 * recorded and `data/tidb-comparison/invalidations.ndjson` every withdrawal of
 * a published observation. Both are history: a record is appended, never
 * rewritten, reordered or dropped (D14 was a regeneration that rewrote the
 * history and lost seven records).
 *
 * The transition rule has one owner, `appendOnlyRecordOffences` in
 * check-quest-log-append-only.js: across every commit of the admitted range
 * (the merge base with `origin/main` from the change-selection owner) and
 * finally the working tree, each file's committed bytes must survive as an
 * exact prefix. This check adds what that owner does not know: both files
 * must be tracked at HEAD, and every line of each, at HEAD and in the working
 * tree, must parse through the file's own owner (the history store and the
 * invalidation ledger).
 *
 * `--base <ref>` overrides the range; `--metric` prints the offence count.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  parseInvalidationLedger,
} from '../../test/distributed/harness/benchmark-invalidation-ledger.js';
import {
  parseComparisonHistoryNdjson,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {appendOnlyRecordOffences} from './check-quest-log-append-only.js';
import {repositoryCheckBase} from './changed-paths.js';
import {
  HEAD_REV, baseFromArgv, readBlobs, reportRecordOffences,
} from './quest-record-transitions.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGV_OFFSET = 2;
const arrayMap = Function.call.bind(Array.prototype.map);
const TEXT_ENCODING = 'utf8';
const WORKING_TREE = 'working tree';
// Each append-only benchmark record file and the owner that parses its lines.
const BENCHMARK_HISTORY_FILES = new Map([
  ['data/tidb-comparison/history.ndjson', parseComparisonHistoryNdjson],
  ['data/tidb-comparison/invalidations.ndjson', parseInvalidationLedger],
]);
const OFFENCE = Object.freeze({
  UNTRACKED: 'the history file is not tracked at HEAD',
  UNPARSEABLE: 'a line does not parse',
});
const CLEAN_MESSAGE = 'benchmark history append-only: clean';
const OFFENCE_HEADER = 'benchmark history append-only: refusing rewritten or unreadable history';
const REMEDIATION = 'The comparative-benchmark history and invalidation ledger are ' +
  'append-only (R21). Append a new record or an invalidation entry instead of ' +
  'editing, reordering or removing a recorded one.';

function isBenchmarkHistoryPath(file) {
  return BENCHMARK_HISTORY_FILES.has(file);
}

// The owner's parse of one revision of a file, as an offence or null.
function parseOffence(file, bytes, at) {
  try {
    BENCHMARK_HISTORY_FILES.get(file)(bytes.toString(TEXT_ENCODING));
    return null;
  } catch (error) {
    return {path: file, reason: `${OFFENCE.UNPARSEABLE}: ${error.message}`, at};
  }
}

// Both files tracked at HEAD, and every line of each parsing at HEAD and in
// the working tree (a working-tree file that is gone is the transition
// owner's deletion offence, not a parse failure).
function snapshotOffences(root) {
  const files = [...BENCHMARK_HISTORY_FILES.keys()];
  const blobs = readBlobs(root,
    arrayMap(files, (file) => ({key: file, rev: `${HEAD_REV}:${file}`})));
  const offences = [];
  for (const file of files) {
    const committed = blobs.get(file);
    if (!committed) {
      offences.push({path: file, reason: OFFENCE.UNTRACKED, at: HEAD_REV});
      continue;
    }
    const atHead = parseOffence(file, committed, HEAD_REV);
    if (atHead) offences.push(atHead);
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    const inTree = parseOffence(file, fs.readFileSync(absolute), WORKING_TREE);
    if (inTree) offences.push(inTree);
  }
  return offences;
}

/**
 * Every offence against the benchmark history files: a rewritten, truncated
 * or deleted committed history, an untracked file, or a line that does not
 * parse.
 * @param {{root?: string, base?: string}} [options]
 * @return {Array<{path: string, reason: string, at: string}>}
 */
function benchmarkHistoryOffences(options = {}) {
  const root = options.root || REPO_ROOT;
  const base = options.base || repositoryCheckBase(root);
  return [...appendOnlyRecordOffences({root, base, accepts: isBenchmarkHistoryPath}),
    ...snapshotOffences(root)];
}

function main(argv) {
  const base = baseFromArgv(argv);
  return reportRecordOffences({argv, offences: benchmarkHistoryOffences(base ? {base} : {}),
    cleanMessage: CLEAN_MESSAGE, header: OFFENCE_HEADER, remediation: REMEDIATION});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {OFFENCE, benchmarkHistoryOffences};
