#!/usr/bin/env node

// release-content-digest: the one machine-generated identity of the release
// candidate's content. Hashes every git-tracked file EXCEPT Solver
// evidence/projections (solve/**), so any shipped source, package, chart,
// workflow, test, or release-metadata change yields a new digest, while Solver
// bookkeeping cannot. Every release gate records this digest; a mismatch at
// replay time proves the gate ran against different release content.
//
//   node scripts/release-content-digest.js            print the digest record
//   node scripts/release-content-digest.js --check <file>
//                                                     verify a frozen record
//                                                     still matches the tree
//
// The content hash itself is owned by src/diagnostics/source-fingerprint.js —
// the same framing the node boot fingerprint uses — so there is exactly one
// hashing form in the codebase. The record also carries the boot-scope
// srcFingerprint (16-hex over src/) so live per-node reports, which stamp
// SRC_FINGERPRINT at boot, can be bound to the same frozen candidate.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  computeFileSetFingerprint,
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ALGORITHM,
} from '../src/diagnostics/source-fingerprint.js';

const DEFAULT_ENCODING = 'utf8';
const RELEASE_CONTENT_DIGEST_ALGORITHM =
  `release-content-${SOURCE_FINGERPRINT_ALGORITHM}`;
const SOLVER_EXCLUDED_PREFIX = 'solve/';
const BOOT_FINGERPRINT_SCOPE = 'src';
const ARG_CHECK = '--check';
const NUL_SEPARATOR = '\u0000';
const USAGE_TEXT =
  'usage: release-content-digest [--check <frozen-record.json>]\n';
const CHECK_MISMATCH_PREFIX = 'release-content digest mismatch: ';
const CHECK_OK_PREFIX = 'release-content digest verified: ';
const GIT_BIN = 'git';
const GIT_DIR_FLAG = '-C';
const GIT_REV_PARSE_HEAD_ARGS = Object.freeze(['rev-parse', 'HEAD']);
const MISMATCH_SEPARATOR = '; ';
// The fields that define candidate identity; headCommit is deliberately absent
// (see compareRecords).
const RECORD_IDENTITY_KEYS = Object.freeze([
  'algorithm', 'releaseContentDigest', 'srcFingerprint', 'fileCount',
]);

function listTrackedReleaseFiles(root) {
  const stdout = execFileSync('git', ['-C', root, 'ls-files', '-z'],
    {encoding: DEFAULT_ENCODING, maxBuffer: 64 * 1024 * 1024});
  return stdout
    .split(NUL_SEPARATOR)
    .filter((relativePath) => relativePath.length > 0)
    .filter((relativePath) => !relativePath.startsWith(SOLVER_EXCLUDED_PREFIX));
}

function resolveHeadCommit(root) {
  return execFileSync(GIT_BIN, [GIT_DIR_FLAG, root, ...GIT_REV_PARSE_HEAD_ARGS],
    {encoding: DEFAULT_ENCODING}).trim();
}

async function buildDigestRecord(root) {
  const files = listTrackedReleaseFiles(root);
  const releaseContentDigest = await computeFileSetFingerprint(root, files);
  const srcFingerprint =
    await computeSourceFingerprint(`${root}/${BOOT_FINGERPRINT_SCOPE}`);
  return {
    algorithm: RELEASE_CONTENT_DIGEST_ALGORITHM,
    releaseContentDigest,
    srcFingerprint,
    fileCount: files.length,
    excludedPrefixes: [SOLVER_EXCLUDED_PREFIX],
    headCommit: resolveHeadCommit(root),
  };
}

// Comparison deliberately ignores headCommit: the digest binds CONTENT, and a
// bookkeeping-only commit (e.g. Solver evidence) must not invalidate a frozen
// record whose release content is byte-identical.
function compareRecords(frozen, current) {
  const mismatches = [];
  for (const key of RECORD_IDENTITY_KEYS) {
    if (frozen[key] !== current[key]) {
      mismatches.push(`${key}: frozen ${frozen[key]} != current ${current[key]}`);
    }
  }
  return mismatches;
}

async function main(argv = process.argv.slice(2), root = process.cwd()) {
  const checkIndex = argv.indexOf(ARG_CHECK);
  const current = await buildDigestRecord(root);
  if (checkIndex === -1) {
    process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
    return 0;
  }
  const frozenPath = argv[checkIndex + 1];
  if (!frozenPath) {
    process.stderr.write(USAGE_TEXT);
    return 2;
  }
  const frozen = JSON.parse(fs.readFileSync(frozenPath, DEFAULT_ENCODING));
  const mismatches = compareRecords(frozen, current);
  if (mismatches.length > 0) {
    process.stderr.write(
      `${CHECK_MISMATCH_PREFIX}${mismatches.join(MISMATCH_SEPARATOR)}\n`);
    return 1;
  }
  process.stdout.write(
    `${CHECK_OK_PREFIX}${current.releaseContentDigest}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}

export {
  buildDigestRecord,
  compareRecords,
};
