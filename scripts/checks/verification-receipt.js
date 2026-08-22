// PASS-only, content-addressed verification receipts.
//
// Receipts live under the Git common directory so an exact-tree publisher and
// the hook triggered by its subsequent `git push` see the same result. The key
// binds semantic repository bytes, plan, range, toolchain, and test-affecting
// environment. Inert Solver ledger metadata is excluded; executable
// scripts/solve/** remains included because it does not live under solve/**.

import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  isWorkspaceInjection,
  declaredWorkspaceInjections,
} from './changed-paths.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const SCHEMA_VERSION = 1;
const POLICY_VERSION = 'verification-policy/1';
const RECEIPT_DIRECTORY = 'verification-receipts/v1';
const OUTCOME_PASS = 'PASS';
const UTF8 = 'utf8';
const ZERO_MODE = 0;
const EXECUTABLE_MASK = 0o111;
const TEST_ENVIRONMENT_KEYS = Object.freeze([
  'CI',
  'NODE_OPTIONS',
  'TAP_TIMEOUT',
  'LAGRANGE_USE_LOCAL_WASM',
  'LAGRANGE_WORKSPACE_INJECTIONS',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function git(root, args) {
  const output = execFileSync('git', args, {
    cwd: root,
    encoding: UTF8,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return stringTrim(output);
}

function listedPaths(root, args) {
  const output = execFileSync('git', args, {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return arrayFilter(stringSplit(output.toString(UTF8), '\0'), Boolean);
}

function isSemanticPath(relative, injections) {
  return !stringStartsWith(relative, 'solve/') &&
    !isWorkspaceInjection(relative, injections);
}

function fileProjection(root, relative) {
  const absolute = path.join(root, relative);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    return {path: relative, kind: 'missing', mode: ZERO_MODE, digest: null};
  }
  const mode = stat.mode & EXECUTABLE_MASK;
  const kind = stat.isSymbolicLink() ? 'symlink' :
    (stat.isFile() ? 'file' : 'non-file');
  switch (kind) {
    case 'symlink':
      return {path: relative, kind, mode,
        digest: sha256(fs.readlinkSync(absolute))};
    case 'file':
      return {path: relative, kind, mode,
        digest: sha256(fs.readFileSync(absolute))};
    default:
      return {path: relative, kind, mode, digest: null};
  }
}

export function semanticProjection(root) {
  const injections = declaredWorkspaceInjections();
  const paths = new Set([
    ...listedPaths(root, ['ls-files', '-z']),
    ...listedPaths(root, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  const files = arrayMap(arrayFilter([...paths],
    (relative) => isSemanticPath(relative, injections)).sort(),
    (relative) => fileProjection(root, relative));
  return {files, digest: sha256(JSON.stringify(files))};
}

function commandVersion(command, args) {
  try {
    return stringTrim(execFileSync(command, args, {encoding: UTF8,
      stdio: ['ignore', 'pipe', 'pipe']}));
  } catch (error) {
    throw new Error(`verification toolchain unavailable: ${command}: ` +
      `${error.message}`);
  }
}

function testEnvironment() {
  return Object.fromEntries(arrayMap(TEST_ENVIRONMENT_KEYS, (key) =>
    [key, process.env[key] ?? null]));
}

function provenance(root, base) {
  return {
    head: git(root, ['rev-parse', 'HEAD']),
    tree: git(root, ['write-tree']),
    base: base ? git(root, ['rev-parse', `${base}^{commit}`]) : null,
    baseTree: base ? git(root, ['rev-parse', `${base}^{tree}`]) : null,
  };
}

function revisionSemanticDigest(root, revision) {
  if (!revision) return null;
  const output = execFileSync('git', ['ls-tree', '-rz', '-r', revision], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString(UTF8);
  const entries = arrayMap(arrayFilter(stringSplit(output, '\0'), Boolean),
    (entry) => {
      const [identity, relative] = stringSplit(entry, '\t');
      return {identity, path: relative};
    });
  const semanticEntries = arrayFilter(entries,
    (entry) => !stringStartsWith(entry.path, 'solve/'));
  return sha256(JSON.stringify(semanticEntries));
}

export function verificationInputs(root, plan) {
  const semantic = semanticProjection(root);
  const nodeModulesLock = path.join(root, 'node_modules', '.package-lock.json');
  const provenanceValue = provenance(root, plan.base);
  const inputs = {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    profile: plan.profile,
    planDigest: sha256(JSON.stringify({...plan, base: null})),
    semanticDigest: semantic.digest,
    baseSemanticDigest: revisionSemanticDigest(root, plan.base),
    provenance: provenanceValue,
    toolchain: {
      node: process.version,
      npm: commandVersion('npm', ['--version']),
      git: commandVersion('git', ['--version']),
      platform: process.platform,
      arch: process.arch,
      nodeModulesLock: fs.existsSync(nodeModulesLock) ?
        sha256(fs.readFileSync(nodeModulesLock)) : null,
    },
    environment: testEnvironment(),
  };
  const keyMaterial = {...inputs};
  delete keyMaterial.provenance;
  return {...inputs, key: sha256(JSON.stringify(keyMaterial))};
}

function commonDirectory(root) {
  return path.resolve(root, git(root, ['rev-parse', '--git-common-dir']));
}

export function verificationReceiptPath(root, key) {
  return path.join(commonDirectory(root), RECEIPT_DIRECTORY, `${key}.json`);
}

export function readPassingVerificationReceipt(root, inputs) {
  const receiptPath = verificationReceiptPath(root, inputs.key);
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, UTF8));
    const valid = receipt.schemaVersion === SCHEMA_VERSION &&
      receipt.outcome === OUTCOME_PASS && receipt.key === inputs.key &&
      receipt.profile === inputs.profile &&
      receipt.semanticDigest === inputs.semanticDigest &&
      receipt.planDigest === inputs.planDigest;
    return valid ? {receipt, receiptPath} : null;
  } catch {
    return null;
  }
}

export function writePassingVerificationReceipt(root, inputs, result) {
  const receiptPath = verificationReceiptPath(root, inputs.key);
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    outcome: OUTCOME_PASS,
    key: inputs.key,
    profile: inputs.profile,
    semanticDigest: inputs.semanticDigest,
    planDigest: inputs.planDigest,
    provenance: inputs.provenance,
    toolchain: inputs.toolchain,
    environment: inputs.environment,
    selection: result.selection,
    escalation: result.escalation || null,
    changedPaths: result.changedPaths,
    selectedCount: result.selectedCount,
    runCount: result.runCount,
    deduplicatedCount: result.deduplicatedCount,
    leaves: result.leaves,
    elapsedMs: result.elapsedMs,
    completedAt: new Date().toISOString(),
  };
  const temporary = `${receiptPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`,
    {encoding: UTF8, flag: 'wx'});
  fs.renameSync(temporary, receiptPath);
  return {receipt, receiptPath};
}
