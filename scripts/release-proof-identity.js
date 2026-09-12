#!/usr/bin/env node
// release-proof-identity: what a release proof is a proof OF. A full release
// proof exercises the shipped logic; it does not care which version string
// that logic will carry or what the changelog says about it. The identity is
// therefore the tracked tree minus what cannot change behaviour - Solver
// records (solve/), publication receipts (data/releases/), the changelog -
// with the release version string masked in the version authorities, so a
// version bump alone keeps the identity and the receipt that proved rc.N
// proves the same tree tagged as the release. Any other byte changes it.
//
//   node scripts/release-proof-identity.js          print the identity record
//
// The hash form is owned by src/diagnostics/source-fingerprint.js.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  SOURCE_FINGERPRINT_ALGORITHM,
  computeContentRecordsFingerprint,
} from '../src/diagnostics/source-fingerprint.js';

const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySome = Function.call.bind(Array.prototype.some);

const RELEASE_PROOF_IDENTITY_ALGORITHM =
  `release-proof-identity-v1-${SOURCE_FINGERPRINT_ALGORITHM}`;
const UTF8 = 'utf8';
const NUL_SEPARATOR = '\u0000';
const GIT_BIN = 'git';
const GIT_DIR_FLAG = '-C';
const GIT_LS_FILES_ARGS = Object.freeze(['ls-files', '-z']);
const LS_FILES_MAX_BUFFER = 64 * 1024 * 1024;
const PACKAGE_JSON = 'package.json';
const VERSION_PLACEHOLDER = '<release-version>';
// Paths whose content never reaches the shipped logic.
const EXCLUDED_PREFIXES = Object.freeze(['solve/', 'data/releases/']);
const EXCLUDED_FILES = Object.freeze(['CHANGELOG.md']);
// The version authorities release:preflight keeps in agreement; the release
// version string is masked in exactly these files and nowhere else.
const VERSION_AUTHORITIES = Object.freeze([
  'package.json',
  'package-lock.json',
  'charts/lagrange-node/Chart.yaml',
  'src/cli/cli-constants.js',
  'src/constants/entrypoint.js',
]);

function listIdentityFiles(root) {
  const stdout = execFileSync(GIT_BIN, [GIT_DIR_FLAG, root, ...GIT_LS_FILES_ARGS],
    {encoding: UTF8, maxBuffer: LS_FILES_MAX_BUFFER});
  return arrayFilter(stringSplit(stdout, NUL_SEPARATOR), (relativePath) =>
    relativePath.length > 0 &&
    !arraySome(EXCLUDED_PREFIXES, (prefix) => stringStartsWith(relativePath, prefix)) &&
    !arrayIncludes(EXCLUDED_FILES, relativePath));
}

function readReleaseVersion(root) {
  const packagePath = path.join(root, PACKAGE_JSON);
  if (!fs.existsSync(packagePath)) return null;
  const version = JSON.parse(fs.readFileSync(packagePath, UTF8)).version;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

function readRecordContent(root, relativePath, version) {
  const absolute = path.join(root, relativePath);
  const stats = fs.lstatSync(absolute);
  if (stats.isSymbolicLink()) return Buffer.from(fs.readlinkSync(absolute), UTF8);
  const content = fs.readFileSync(absolute);
  if (version === null || !arrayIncludes(VERSION_AUTHORITIES, relativePath)) {
    return content;
  }
  return Buffer.from(
    stringReplaceAll(content.toString(UTF8), version, VERSION_PLACEHOLDER), UTF8);
}

/**
 * The release proof identity of the tree checked out at root.
 * @param {string} root repository root (working tree)
 * @return {{algorithm: string, digest: string, fileCount: number,
 *   releaseVersion: string|null, maskedFiles: string[]}}
 */
function computeReleaseProofIdentity(root) {
  const version = readReleaseVersion(root);
  const files = listIdentityFiles(root);
  const records = arrayMap(files, (relativePath) => ({
    relativePath,
    content: readRecordContent(root, relativePath, version),
  }));
  return Object.freeze({
    algorithm: RELEASE_PROOF_IDENTITY_ALGORITHM,
    digest: computeContentRecordsFingerprint(records),
    fileCount: files.length,
    releaseVersion: version,
    maskedFiles: arrayFilter(VERSION_AUTHORITIES, (candidate) =>
      arrayIncludes(files, candidate)),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.write(
    `${JSON.stringify(computeReleaseProofIdentity(process.cwd()), null, 2)}\n`);
}

export {
  RELEASE_PROOF_IDENTITY_ALGORITHM,
  VERSION_AUTHORITIES,
  computeReleaseProofIdentity,
};
