#!/usr/bin/env node
/**
 * Zero-reference ratchet for the retired consensus runtime (quest
 * zero-liferaft-active-runtime, constraint fixed-zero-reference-scope).
 *
 * Every git-visible file on a fixed active surface is scanned, by filename and
 * by content, case-insensitively, for the retired runtime, its package scope
 * and process-level provider selection. The scope is a pinned constant and its
 * one exclusion is the historical solve record: there is no allowlist, no
 * baseline and no flag that widens either. The target is zero; any reference
 * exits red.
 *
 * The retired names are assembled from fragments so this checker never makes
 * its own target permanently non-zero.
 */

import {spawnSync} from 'node:child_process';
import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import {gitProcessEnvironment} from './git-process-environment.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const bufferIncludes = Function.call.bind(Buffer.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const FIXED_SCAN_SCOPE = Object.freeze([
  'src/',
  'test/',
  'scripts/',
  'examples/',
  'architecture/',
  'docs/current',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'test/distributed/',
]);
const HISTORICAL_EXCLUSION = 'solve/';

const RETIRED_NAME_FRAGMENTS = Object.freeze([
  Object.freeze(['life', '[-_]?', 'raft']),
  Object.freeze(['mark', 'wylde']),
  Object.freeze(['raft', '[-_]?', 'provider']),
]);
const RETIRED_CONSENSUS_REFERENCE = new RegExp(
  arrayMap(RETIRED_NAME_FRAGMENTS, (fragments) => fragments.join('')).join('|'),
  'i');

const FINDING_KIND = Object.freeze({
  FILENAME: 'filename',
  CONTENT: 'content',
});
const AUDIT_TEXT = Object.freeze({
  DIRECTORY_SUFFIX: '/',
  SCOPE_SEPARATOR: ' ',
  LINE_SEPARATOR: '\n',
  NUL_SEPARATOR: '\0',
  UTF8: 'utf8',
  NAME: 'no-legacy-consensus-reference-audit',
});
const GIT_LIST_VISIBLE_FILES = Object.freeze([
  'ls-files', '-z', '--cached', '--others', '--exclude-standard',
]);
const GIT_BINARY = 'git';
const GIT_MAX_BUFFER_BYTES = 256 * 1024 * 1024;
const BINARY_NUL = 0;
const FILENAME_LINE = 0;
const FIRST_LINE_NUMBER = 1;
const EXIT_OK = 0;
const EXIT_REFERENCES_FOUND = 1;
const EXIT_LISTING_FAILED = 2;

function normalize(relativePath) {
  return stringSplit(relativePath, path.sep)
    .join(AUDIT_TEXT.DIRECTORY_SUFFIX);
}

/**
 * Whether a root-relative path lies on a fixed active surface. A directory
 * entry covers its subtree; any other entry covers the root-relative prefix
 * and, for manifests and Dockerfiles, the same file name in any directory.
 * @param {string} relativePath
 * @return {boolean}
 */
function isInFixedScope(relativePath) {
  const normalized = normalize(relativePath);
  if (stringStartsWith(normalized, HISTORICAL_EXCLUSION)) {
    return false;
  }
  const basename = path.posix.basename(normalized);
  return arraySome(FIXED_SCAN_SCOPE, (entry) =>
    stringStartsWith(normalized, entry) ||
    (!stringIncludes(entry, AUDIT_TEXT.DIRECTORY_SUFFIX) &&
      stringStartsWith(basename, entry)));
}

function listVisibleFiles(root) {
  const listing = spawnSync(GIT_BINARY, GIT_LIST_VISIBLE_FILES, {
    cwd: root,
    env: gitProcessEnvironment(),
    encoding: AUDIT_TEXT.UTF8,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (listing.status !== EXIT_OK) {
    throw new Error(`${AUDIT_TEXT.NAME}: git ls-files failed in ${root}: ` +
      `${listing.stderr || listing.error?.message}`);
  }
  return [...new Set(arrayFilter(
    stringSplit(listing.stdout, AUDIT_TEXT.NUL_SEPARATOR),
    (relative) => relative.length > 0))].sort();
}

function contentFindings(relativePath, buffer) {
  if (bufferIncludes(buffer, BINARY_NUL)) {
    return [];
  }
  const findings = [];
  const lines = stringSplit(buffer.toString(AUDIT_TEXT.UTF8),
    AUDIT_TEXT.LINE_SEPARATOR);
  for (let index = 0; index < lines.length; index += 1) {
    if (RETIRED_CONSENSUS_REFERENCE.test(lines[index])) {
      findings.push({
        path: relativePath,
        kind: FINDING_KIND.CONTENT,
        line: index + FIRST_LINE_NUMBER,
      });
    }
  }
  return findings;
}

/**
 * Scan every git-visible file on the fixed scope under `root`.
 * @param {string} root - Repository root (a git work tree).
 * @return {{findings: Array<{path: string, kind: string, line: number}>,
 *   scannedFiles: number, referencingFiles: number}}
 */
function auditRetiredConsensusReferences(root) {
  const findings = [];
  let scannedFiles = 0;
  for (const relativePath of listVisibleFiles(root)) {
    if (!isInFixedScope(relativePath)) {
      continue;
    }
    const stats = fs.lstatSync(path.join(root, relativePath),
      {throwIfNoEntry: false});
    if (!stats?.isFile()) {
      continue;
    }
    scannedFiles += 1;
    if (RETIRED_CONSENSUS_REFERENCE.test(relativePath)) {
      findings.push({
        path: relativePath,
        kind: FINDING_KIND.FILENAME,
        line: FILENAME_LINE,
      });
    }
    findings.push(...contentFindings(relativePath,
      fs.readFileSync(path.join(root, relativePath))));
  }
  const referencingFiles = new Set(arrayMap(findings,
    (finding) => finding.path)).size;
  return {findings, scannedFiles, referencingFiles};
}

function main() {
  let report;
  try {
    report = auditRetiredConsensusReferences(process.cwd());
  } catch (error) {
    process.stderr.write(`${error.message}${AUDIT_TEXT.LINE_SEPARATOR}`);
    return EXIT_LISTING_FAILED;
  }
  for (const finding of report.findings) {
    process.stdout.write(`${finding.path}:${finding.line} ${finding.kind}` +
      AUDIT_TEXT.LINE_SEPARATOR);
  }
  process.stdout.write(`${AUDIT_TEXT.NAME}: ${report.findings.length} ` +
    `retired consensus references in ${report.referencingFiles} of ` +
    `${report.scannedFiles} scanned files (target 0; scope ` +
    `${FIXED_SCAN_SCOPE.join(AUDIT_TEXT.SCOPE_SEPARATOR)}; excluded ` +
    `${HISTORICAL_EXCLUSION})` +
    AUDIT_TEXT.LINE_SEPARATOR);
  return report.findings.length === 0 ? EXIT_OK : EXIT_REFERENCES_FOUND;
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMainModule) {
  process.exitCode = main();
}

export {
  FIXED_SCAN_SCOPE,
  HISTORICAL_EXCLUSION,
  RETIRED_CONSENSUS_REFERENCE,
  auditRetiredConsensusReferences,
  isInFixedScope,
};
