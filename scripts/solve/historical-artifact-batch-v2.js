import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  cleanupWrittenChangeArtifact,
  prepareContentAddressedChangeArtifact,
  readChangeArtifact,
} from './content-addressed-change-artifact.js';
import {
  admitHistoricalBatchStagedScope,
  historicalBatchMigrationPaths,
  historicalBatchStagedPaths,
  inspectHistoricalBatchStagedScope,
  unstageHistoricalBatch,
} from './historical-artifact-batch-scope.js';
import {canonicalMigrationV2Bytes, validateHistoricalMigrationV2Manifest} from
  './historical-artifact-migration-v2.js';
import {HISTORICAL_ARTIFACT_MIGRATION_V2 as CONTRACT} from
  './historical-artifact-migration-v2-constants.js';

const PROBLEM = Object.freeze({
  PLAN_INVALID: 'A2a plan is invalid: ',
  PLAN_UNCOMMITTED: 'A2a plan is not byte-identical to HEAD',
  PLAN_AUTHORITY: 'A2a plan does not match its immutable authority',
  BATCH_MISSING: 'batch is absent from A2a plan: ',
  BATCH_ORDER: 'batch receipts do not match the required ordinal prefix',
  PREVIOUS_UNCOMMITTED: 'previous batch receipt is not byte-identical to HEAD: ',
  RECEIPT_EXISTS: 'batch receipt already exists: ',
  RECEIPT_MISSING: 'batch receipt is missing: ',
  RECEIPT_INVALID: 'batch receipt is invalid: ',
  RECEIPT_JSON: 'batch receipt JSON is unreadable: ',
  RECEIPT_CANONICAL: 'batch receipt bytes are not canonical',
  RECEIPT_CONTENT: 'batch receipt differs from verified storage',
  SOURCE_STATE: 'batch source physical state is invalid: ',
  SOURCE_IDENTITY: 'batch source logical identity changed: ',
  AFTER_STATE: 'migrated artifact physical state is invalid: ',
  AFTER_IDENTITY: 'migrated logical identity changed: ',
  AFTER_PATH: 'migrated storage path is noncanonical: ',
  CONCURRENT: 'another batch migration owns the transaction lock: ',
  JOURNAL_INVALID: 'batch transaction journal is invalid: ',
  TRANSACTION_STATE: 'batch transaction sibling state is invalid: ',
  STAGED_UNEXPECTED: 'staged diff contains a path outside this batch: ',
  HISTORICAL_DRIFT: 'batch migration changed an unrelated historical file',
});
const TEXT_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const INLINE_KIND = 'inline';
const CONTENT_ADDRESSED_KIND = 'content-addressed';
const RECEIPT_SUFFIX = '.receipt.json';
const LOCK_SUFFIX = '.lock';
const JOURNAL_SUFFIX = '.transaction.json';
const TEMPORARY_SUFFIX = '.tmp';
const BACKUP_MARKER = '.a2b-backup-';
const STAGED_MARKER = '.a2b-staged-';
const JOURNAL_KIND = 'solver-historical-artifact-batch-transaction';
const JOURNAL_SCHEMA_VERSION = 1;
const LOCK_KIND = 'solver-historical-artifact-batch-lock';
const GIT_COMMAND = 'git';
const GIT_SUCCESS = 0;
const MAX_GIT_BUFFER = 64 * 1024 * 1024;
const PROBLEM_SEPARATOR = '; ';
const NORMALIZED_PATH_SEPARATOR = '/';
const EXCLUSIVE_CREATE_FLAG = 'wx';
const STDIO_IGNORE = 'ignore';
const LIST_SEPARATOR = ', ';
const HISTORICAL_ROOTS = Object.freeze(['solve/changes', 'solve/artifacts']);
const GIT = Object.freeze({
  ADD: 'add',
  ALL: '-A',
  CACHED: '--cached',
  DIFF: 'diff',
  ERROR_UNMATCH: '--error-unmatch',
  HEAD: 'HEAD',
  LS_FILES: 'ls-files',
  NAME_ONLY: '--name-only',
  PATHS: '--',
  QUIET: '--quiet',
  QUIET_SHORT: '-q',
  RESET: 'reset',
  SHOW: 'show',
  ZERO_TERMINATED: '-z',
  BINARY: '--binary',
});
const RECOVERY = Object.freeze({
  CLEAN: 'clean',
  ROLLED_BACK: 'rolled-back',
  ROLLED_BACK_INVALID_JOURNAL: 'rolled-back-invalid-journal',
  ROLLED_FORWARD: 'rolled-forward',
});
const RESULT_KIND = Object.freeze({
  ABSENT: 'absent',
  AVAILABLE: 'available',
  PRESENT: 'present',
  UNAVAILABLE: 'unavailable',
});
const JOURNAL_ABSENT = Object.freeze({kind: RESULT_KIND.ABSENT});
const EXPECTED_UNAVAILABLE = Object.freeze({kind: RESULT_KIND.UNAVAILABLE});

function hash(content) {
  return createHash(HASH_ALGORITHM).update(content).digest(HASH_ENCODING);
}

function workspacePath(root, relative) {
  return path.resolve(root, relative);
}

function relativePath(root, absolute) {
  return path.relative(root, absolute).replaceAll(
    path.sep,
    NORMALIZED_PATH_SEPARATOR,
  );
}

function receiptRelativePath(questId) {
  return `${CONTRACT.BATCH_RECEIPT_DIRECTORY}/${questId}${RECEIPT_SUFFIX}`;
}

function transactionPaths(questId) {
  const receipt = receiptRelativePath(questId);
  return {
    receipt,
    receiptTemporary: `${receipt}${TEMPORARY_SUFFIX}`,
    lock: `${receipt}${LOCK_SUFFIX}`,
    journal: `${receipt}${JOURNAL_SUFFIX}`,
    journalTemporary: `${receipt}${JOURNAL_SUFFIX}${TEMPORARY_SUFFIX}`,
  };
}

function runGit(root, args, options = {}) {
  const spawnOptions = {
    cwd: root,
    maxBuffer: MAX_GIT_BUFFER,
    stdio: options.stdio,
  };
  if (!options.binary) spawnOptions.encoding = TEXT_ENCODING;
  const result = spawnSync(GIT_COMMAND, args, spawnOptions);
  if (result.status !== GIT_SUCCESS) {
    throw new Error(result.stderr?.toString() || `${GIT_COMMAND} ${args[0]} failed`);
  }
  return result.stdout || (options.binary ? Buffer.alloc(0) : '');
}

function gitTracked(root, relative) {
  return spawnSync(GIT_COMMAND,
    [GIT.LS_FILES, GIT.ERROR_UNMATCH, GIT.PATHS, relative], {
      cwd: root,
      stdio: STDIO_IGNORE,
    }).status === GIT_SUCCESS;
}

function gitHeadIdentical(root, relative) {
  return gitTracked(root, relative) && spawnSync(
    GIT_COMMAND,
    [GIT.DIFF, GIT.QUIET, GIT.HEAD, GIT.PATHS, relative],
    {cwd: root, stdio: STDIO_IGNORE},
  ).status === GIT_SUCCESS;
}

function headBytes(root, relative) {
  return runGit(root, [GIT.SHOW, `${GIT.HEAD}:${relative}`], {binary: true});
}

function syncFile(file) {
  const descriptor = fs.openSync(file, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function syncDirectory(file) {
  const descriptor = fs.openSync(path.dirname(file), 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function writeExclusive(file, bytes) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, bytes, {flag: EXCLUSIVE_CREATE_FLAG});
  syncFile(file);
  syncDirectory(file);
}

function publishExclusive(temporary, destination) {
  fs.linkSync(temporary, destination);
  syncDirectory(destination);
  fs.rmSync(temporary);
  syncDirectory(temporary);
}

function parsePinnedPlan(root) {
  const relative = CONTRACT.MANIFEST_PATH;
  if (!gitHeadIdentical(root, relative)) throw new Error(PROBLEM.PLAN_UNCOMMITTED);
  const bytes = fs.readFileSync(workspacePath(root, relative));
  if (hash(bytes) !== CONTRACT.AUTHORITATIVE_MANIFEST_SHA256) {
    throw new Error(PROBLEM.PLAN_AUTHORITY);
  }
  return {manifest: JSON.parse(bytes.toString(TEXT_ENCODING)), manifestSha256: hash(bytes)};
}

function loadPlan(root) {
  const plan = parsePinnedPlan(root);
  const validation = validateHistoricalMigrationV2Manifest(root);
  if (!validation.valid) {
    throw new Error(PROBLEM.PLAN_INVALID + validation.problems.join(PROBLEM_SEPARATOR));
  }
  return {...plan, manifest: validation.manifest};
}

function selectBatch(manifest, questId) {
  const index = manifest.batches.findIndex((item) => item.questId === questId);
  if (index < 0) throw new Error(PROBLEM.BATCH_MISSING + questId);
  return {batch: manifest.batches[index], index};
}

function assertInlineSource(root, entry) {
  const source = workspacePath(root, entry.sourcePath);
  const descriptor = workspacePath(root, entry.plannedAfter.descriptorPath);
  const object = workspacePath(root, entry.plannedAfter.objectPath);
  if (!fs.existsSync(source) || fs.existsSync(descriptor) ||
    fs.existsSync(object) || fs.existsSync(`${source}.gz`)) {
    throw new Error(PROBLEM.SOURCE_STATE + entry.sourcePath);
  }
  const artifact = readChangeArtifact(root,
    `${CONTRACT.CHANGE_REF_PREFIX}${entry.sourcePath}`);
  if (!artifact.valid || artifact.kind !== INLINE_KIND) {
    throw new Error(PROBLEM.SOURCE_STATE + entry.sourcePath);
  }
  if (artifact.payloadSha256 !== entry.before.payloadSha256 ||
    artifact.payloadBytes !== entry.before.payloadBytes) {
    throw new Error(PROBLEM.SOURCE_IDENTITY + entry.sourcePath);
  }
  return Buffer.from(artifact.payload);
}

function afterRecord(root, entry) {
  const source = workspacePath(root, entry.sourcePath);
  const descriptor = workspacePath(root, entry.plannedAfter.descriptorPath);
  if (fs.existsSync(source) || !fs.existsSync(descriptor) ||
    fs.existsSync(`${source}.gz`)) {
    throw new Error(PROBLEM.AFTER_STATE + entry.sourcePath);
  }
  const artifact = readChangeArtifact(root,
    `${CONTRACT.CHANGE_REF_PREFIX}${entry.sourcePath}`);
  if (!artifact.valid || artifact.kind !== CONTENT_ADDRESSED_KIND) {
    throw new Error(PROBLEM.AFTER_STATE + entry.sourcePath);
  }
  if (artifact.payloadSha256 !== entry.plannedAfter.payloadSha256 ||
    artifact.payloadBytes !== entry.plannedAfter.payloadBytes) {
    throw new Error(PROBLEM.AFTER_IDENTITY + entry.sourcePath);
  }
  const descriptorPath = relativePath(root, artifact.artifactPath);
  const objectPath = relativePath(root, artifact.objectPath);
  if (descriptorPath !== entry.plannedAfter.descriptorPath ||
    objectPath !== entry.plannedAfter.objectPath) {
    throw new Error(PROBLEM.AFTER_PATH + entry.sourcePath);
  }
  return {
    sourcePath: entry.sourcePath,
    descriptorPath,
    descriptorSha256: hash(fs.readFileSync(artifact.artifactPath)),
    objectPath,
    objectStorageSha256: hash(fs.readFileSync(artifact.objectPath)),
    payloadSha256: artifact.payloadSha256,
    payloadBytes: artifact.payloadBytes,
  };
}

function expectedReceipt(root, plan, batch) {
  return {
    schemaVersion: CONTRACT.SCHEMA_VERSION,
    kind: CONTRACT.BATCH_RECEIPT_KIND,
    planManifestSha256: plan.manifestSha256,
    censusSha256: plan.manifest.census.censusSha256,
    batchInventorySha256: batch.inventorySha256,
    questId: batch.questId,
    before: batch.entries.map((entry) => ({
      sourcePath: entry.sourcePath,
      payloadSha256: entry.before.payloadSha256,
      payloadBytes: entry.before.payloadBytes,
    })),
    after: batch.entries.map((entry) => afterRecord(root, entry)),
  };
}

function validateReceiptAgainstPlan(root, plan, batch) {
  const relative = receiptRelativePath(batch.questId);
  const file = workspacePath(root, relative);
  if (!fs.existsSync(file)) {
    return {valid: false, problems: [PROBLEM.RECEIPT_MISSING + batch.questId]};
  }
  let receipt;
  let bytes;
  try {
    bytes = fs.readFileSync(file);
    receipt = JSON.parse(bytes.toString(TEXT_ENCODING));
  } catch (error) {
    return {valid: false, problems: [PROBLEM.RECEIPT_JSON + error.message]};
  }
  const problems = [];
  let expected = EXPECTED_UNAVAILABLE;
  try {
    const value = expectedReceipt(root, plan, batch);
    expected = {kind: RESULT_KIND.AVAILABLE, value};
    if (!bytes.equals(canonicalMigrationV2Bytes(receipt))) {
      problems.push(PROBLEM.RECEIPT_CANONICAL);
    }
    if (!canonicalMigrationV2Bytes(receipt)
      .equals(canonicalMigrationV2Bytes(value))) {
      problems.push(PROBLEM.RECEIPT_CONTENT);
    }
  } catch (error) {
    problems.push(error.message);
  }
  return {valid: problems.length === 0, problems, receipt, expected};
}

function receiptQuestIds(root) {
  const directory = workspacePath(root, CONTRACT.BATCH_RECEIPT_DIRECTORY);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith(RECEIPT_SUFFIX))
    .map((entry) => entry.name.slice(0, -RECEIPT_SUFFIX.length)).sort();
}

function assertOrdinalState(root, plan, targetIndex, includeTarget) {
  const completedCount = targetIndex + (includeTarget ? 1 : 0);
  const expectedIds = plan.manifest.batches.slice(0, completedCount)
    .map((batch) => batch.questId).sort();
  if (JSON.stringify(receiptQuestIds(root)) !== JSON.stringify(expectedIds)) {
    throw new Error(PROBLEM.BATCH_ORDER);
  }
  for (let index = 0; index < plan.manifest.batches.length; index += 1) {
    const batch = plan.manifest.batches[index];
    if (index < completedCount) {
      const validation = validateReceiptAgainstPlan(root, plan, batch);
      if (!validation.valid) {
        throw new Error(PROBLEM.RECEIPT_INVALID +
          validation.problems.join(PROBLEM_SEPARATOR));
      }
      if (index < targetIndex &&
        !gitHeadIdentical(root, receiptRelativePath(batch.questId))) {
        throw new Error(PROBLEM.PREVIOUS_UNCOMMITTED + batch.questId);
      }
      continue;
    }
    for (const entry of batch.entries) assertInlineSource(root, entry);
  }
}

function transactionEntry(questId, entry, payload) {
  const prepared = prepareContentAddressedChangeArtifact(entry.sourcePath, payload);
  if (prepared.descriptorPath !== entry.plannedAfter.descriptorPath ||
    prepared.objectPath !== entry.plannedAfter.objectPath ||
    prepared.payloadSha256 !== entry.before.payloadSha256 ||
    prepared.payloadBytes !== entry.before.payloadBytes) {
    throw new Error(PROBLEM.SOURCE_IDENTITY + entry.sourcePath);
  }
  return {
    ...prepared,
    backupPath: `${entry.sourcePath}${BACKUP_MARKER}${questId}`,
    descriptorTemporary: `${prepared.descriptorPath}${STAGED_MARKER}${questId}`,
    objectTemporary: `${prepared.objectPath}${STAGED_MARKER}${questId}`,
    objectExisted: false,
  };
}

function journalFor(plan, batch, entries) {
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    kind: JOURNAL_KIND,
    questId: batch.questId,
    planManifestSha256: plan.manifestSha256,
    batchInventorySha256: batch.inventorySha256,
    entries: entries.map((entry) => ({
      sourcePath: entry.relativeInlinePath,
      backupPath: entry.backupPath,
      descriptorPath: entry.descriptorPath,
      descriptorTemporary: entry.descriptorTemporary,
      objectPath: entry.objectPath,
      objectTemporary: entry.objectTemporary,
      objectExisted: entry.objectExisted,
    })),
  };
}

function expectedJournalEntry(batch, entry) {
  return {
    sourcePath: entry.sourcePath,
    backupPath: `${entry.sourcePath}${BACKUP_MARKER}${batch.questId}`,
    descriptorPath: entry.plannedAfter.descriptorPath,
    descriptorTemporary:
      `${entry.plannedAfter.descriptorPath}${STAGED_MARKER}${batch.questId}`,
    objectPath: entry.plannedAfter.objectPath,
    objectTemporary:
      `${entry.plannedAfter.objectPath}${STAGED_MARKER}${batch.questId}`,
    objectExisted: false,
  };
}

function journalEntriesMatchBatch(journal, batch) {
  return Array.isArray(journal?.entries) &&
    journal.entries.length === batch.entries.length &&
    journal.entries.every((record, index) =>
      canonicalMigrationV2Bytes(record).equals(canonicalMigrationV2Bytes(
        expectedJournalEntry(batch, batch.entries[index]),
      )));
}

function journalHeaderMatches(journal, plan, batch) {
  return journal?.schemaVersion === JOURNAL_SCHEMA_VERSION &&
    journal?.kind === JOURNAL_KIND && journal?.questId === batch.questId &&
    journal?.planManifestSha256 === plan.manifestSha256 &&
    journal?.batchInventorySha256 === batch.inventorySha256;
}

function parseJournal(root, relative, plan, batch) {
  if (!fs.existsSync(workspacePath(root, relative))) return JOURNAL_ABSENT;
  let bytes;
  let journal;
  try {
    bytes = fs.readFileSync(workspacePath(root, relative));
    journal = JSON.parse(bytes.toString(TEXT_ENCODING));
  } catch (error) {
    throw new Error(PROBLEM.JOURNAL_INVALID + error.message);
  }
  if (!journalHeaderMatches(journal, plan, batch) ||
    !journalEntriesMatchBatch(journal, batch) ||
    !bytes.equals(canonicalMigrationV2Bytes(journal))) {
    throw new Error(PROBLEM.JOURNAL_INVALID + batch.questId);
  }
  return {kind: RESULT_KIND.PRESENT, value: journal};
}

function removeIfPresent(root, relative) {
  fs.rmSync(workspacePath(root, relative), {force: true});
}

function batchTransactionMutablePaths(batch) {
  const paths = transactionPaths(batch.questId);
  return new Set([
    ...historicalBatchMigrationPaths(batch),
    paths.lock,
    `${paths.lock}.takeover`,
    paths.receiptTemporary,
    paths.journal,
    paths.journalTemporary,
    ...batch.entries.flatMap((entry) => [
      `${entry.sourcePath}${BACKUP_MARKER}${batch.questId}`,
      `${entry.plannedAfter.descriptorPath}${STAGED_MARKER}${batch.questId}`,
      `${entry.plannedAfter.objectPath}${STAGED_MARKER}${batch.questId}`,
    ]),
  ]);
}

function historicalFileEntries(root, directory, excluded) {
  const absolute = workspacePath(root, directory);
  if (!fs.existsSync(absolute)) return [];
  const entries = [];
  for (const item of fs.readdirSync(absolute, {withFileTypes: true})) {
    const relative = `${directory}/${item.name}`;
    if (item.isDirectory()) {
      entries.push(...historicalFileEntries(root, relative, excluded));
    } else if (item.isFile() && !excluded.has(relative)) {
      entries.push([relative, hash(fs.readFileSync(workspacePath(root, relative)))]);
    }
  }
  return entries;
}

function unrelatedHistoricalSnapshot(root, batch) {
  const excluded = batchTransactionMutablePaths(batch);
  return JSON.stringify(HISTORICAL_ROOTS.flatMap((directory) =>
    historicalFileEntries(root, directory, excluded)).sort());
}

function restoreBatchEntry(root, batch, entry, records) {
  const record = records.get(entry.sourcePath);
  const descriptorPath = entry.plannedAfter.descriptorPath;
  const objectPath = entry.plannedAfter.objectPath;
  const backupPath = `${entry.sourcePath}${BACKUP_MARKER}${batch.questId}`;
  const backup = workspacePath(root, backupPath);
  const source = workspacePath(root, entry.sourcePath);
  cleanupWrittenChangeArtifact({
    root,
    artifactPath: workspacePath(root, descriptorPath),
    objectPath: workspacePath(root, objectPath),
    objectCreated: record ? true : !gitTracked(root, objectPath),
  });
  removeIfPresent(root, record?.descriptorTemporary ||
    `${descriptorPath}${STAGED_MARKER}${batch.questId}`);
  removeIfPresent(root, record?.objectTemporary ||
    `${objectPath}${STAGED_MARKER}${batch.questId}`);
  fs.mkdirSync(path.dirname(source), {recursive: true});
  if (record && fs.existsSync(backup)) {
    fs.rmSync(source, {force: true});
    fs.renameSync(backup, source);
    return;
  }
  fs.writeFileSync(source, headBytes(root, entry.sourcePath));
  fs.rmSync(backup, {force: true});
}

function restoreBatch(root, batch, journalState = JOURNAL_ABSENT) {
  const entries = journalState.kind === RESULT_KIND.PRESENT ?
    journalState.value.entries : [];
  const records = new Map(entries.map((entry) =>
    [entry.sourcePath, entry]));
  removeIfPresent(root, receiptRelativePath(batch.questId));
  for (const entry of batch.entries) {
    restoreBatchEntry(root, batch, entry, records);
  }
  const paths = transactionPaths(batch.questId);
  removeIfPresent(root, paths.receiptTemporary);
  removeIfPresent(root, paths.journalTemporary);
  removeIfPresent(root, paths.journal);
}

function recoverInterruptedBatch(root, plan, batch) {
  const paths = transactionPaths(batch.questId);
  let journalState = JOURNAL_ABSENT;
  try {
    journalState = parseJournal(root, paths.journal, plan, batch);
  } catch {
    restoreBatch(root, batch);
    return RECOVERY.ROLLED_BACK_INVALID_JOURNAL;
  }
  const hasTransactionFiles = journalState.kind === RESULT_KIND.PRESENT ||
    fs.existsSync(workspacePath(
      root,
      paths.receiptTemporary,
    )) || fs.existsSync(workspacePath(root, paths.journalTemporary));
  if (!hasTransactionFiles) return RECOVERY.CLEAN;
  const validation = validateReceiptAgainstPlan(root, plan, batch);
  if (validation.valid) {
    const entries = journalState.kind === RESULT_KIND.PRESENT ?
      journalState.value.entries : [];
    for (const record of entries) {
      removeIfPresent(root, record.backupPath);
      removeIfPresent(root, record.descriptorTemporary);
      removeIfPresent(root, record.objectTemporary);
    }
    removeIfPresent(root, paths.receiptTemporary);
    removeIfPresent(root, paths.journalTemporary);
    removeIfPresent(root, paths.journal);
    return RECOVERY.ROLLED_FORWARD;
  }
  restoreBatch(root, batch, journalState);
  return RECOVERY.ROLLED_BACK;
}

function assertTransactionSiblingsAbsent(root, batch) {
  const paths = transactionPaths(batch.questId);
  const auxiliary = [
    paths.receiptTemporary,
    paths.journal,
    paths.journalTemporary,
    ...batch.entries.flatMap((entry) => [
      `${entry.sourcePath}${BACKUP_MARKER}${batch.questId}`,
      `${entry.plannedAfter.descriptorPath}${STAGED_MARKER}${batch.questId}`,
      `${entry.plannedAfter.objectPath}${STAGED_MARKER}${batch.questId}`,
    ]),
  ];
  const present = auxiliary.filter((relative) =>
    fs.existsSync(workspacePath(root, relative)));
  if (present.length > 0) {
    throw new Error(PROBLEM.TRANSACTION_STATE + present.join(LIST_SEPARATOR));
  }
}

function processIsLive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function lockOwner(questId) {
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    kind: LOCK_KIND,
    questId,
    pid: process.pid,
    token: randomUUID(),
  };
}

function readLockOwner(file) {
  try {
    return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    return {};
  }
}

function releaseOwnedLock(file, token) {
  if (readLockOwner(file).token !== token) {
    throw new Error(PROBLEM.CONCURRENT + path.basename(file));
  }
  fs.rmSync(file, {force: true});
}

function acquireLock(root, questId) {
  const relative = transactionPaths(questId).lock;
  const file = workspacePath(root, relative);
  const takeover = `${file}.takeover`;
  const owner = lockOwner(questId);
  const ownerBytes = canonicalMigrationV2Bytes(owner);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(takeover)) throw new Error(PROBLEM.CONCURRENT + questId);
  try {
    writeExclusive(file, ownerBytes);
  } catch (_error) {
    if (processIsLive(readLockOwner(file).pid)) {
      throw new Error(PROBLEM.CONCURRENT + questId);
    }
    try {
      writeExclusive(takeover, ownerBytes);
    } catch (_takeoverError) {
      throw new Error(PROBLEM.CONCURRENT + questId);
    }
    try {
      if (processIsLive(readLockOwner(file).pid)) {
        throw new Error(PROBLEM.CONCURRENT + questId);
      }
      fs.rmSync(file, {force: true});
      writeExclusive(file, ownerBytes);
    } finally {
      fs.rmSync(takeover, {force: true});
    }
  }
  return () => releaseOwnedLock(file, owner.token);
}

function writePreparedObject(root, entry) {
  const temporary = workspacePath(root, entry.objectTemporary);
  const destination = workspacePath(root, entry.objectPath);
  writeExclusive(temporary, entry.objectBytes);
  publishExclusive(temporary, destination);
}

function writePreparedDescriptor(root, entry) {
  const temporary = workspacePath(root, entry.descriptorTemporary);
  const destination = workspacePath(root, entry.descriptorPath);
  writeExclusive(temporary, entry.descriptorBytes);
  publishExclusive(temporary, destination);
  const artifact = readChangeArtifact(root,
    `${CONTRACT.CHANGE_REF_PREFIX}${entry.descriptorPath}`);
  if (!artifact.valid || artifact.kind !== CONTENT_ADDRESSED_KIND ||
    artifact.payloadSha256 !== entry.payloadSha256) {
    throw new Error(PROBLEM.AFTER_STATE + entry.descriptorPath);
  }
}

function migrateBatchTransaction(root, plan, batch) {
  const paths = transactionPaths(batch.questId);
  const payloads = batch.entries.map((entry) => assertInlineSource(root, entry));
  const entries = batch.entries.map((entry, index) =>
    transactionEntry(batch.questId, entry, payloads[index]));
  const journal = journalFor(plan, batch, entries);
  writeExclusive(workspacePath(root, paths.journalTemporary),
    canonicalMigrationV2Bytes(journal));
  publishExclusive(workspacePath(root, paths.journalTemporary),
    workspacePath(root, paths.journal));
  try {
    for (const entry of entries) {
      writePreparedObject(root, entry);
      writePreparedDescriptor(root, entry);
    }
    for (const entry of entries) {
      fs.renameSync(workspacePath(root, entry.relativeInlinePath),
        workspacePath(root, entry.backupPath));
      syncDirectory(workspacePath(root, entry.relativeInlinePath));
    }
    const receipt = expectedReceipt(root, plan, batch);
    writeExclusive(workspacePath(root, paths.receiptTemporary),
      canonicalMigrationV2Bytes(receipt));
    publishExclusive(workspacePath(root, paths.receiptTemporary),
      workspacePath(root, paths.receipt));
    const validation = validateReceiptAgainstPlan(root, plan, batch);
    if (!validation.valid) {
      throw new Error(PROBLEM.RECEIPT_INVALID +
        validation.problems.join(PROBLEM_SEPARATOR));
    }
    for (const entry of entries) removeIfPresent(root, entry.backupPath);
    removeIfPresent(root, paths.journal);
    return {receipt, receiptPath: paths.receipt};
  } catch (error) {
    restoreBatch(root, batch, {kind: RESULT_KIND.PRESENT, value: journal});
    throw error;
  }
}

export function executeHistoricalArtifactBatch(root = process.cwd(), questId) {
  const initialPlan = parsePinnedPlan(root);
  const initialBatch = selectBatch(initialPlan.manifest, questId).batch;
  const historicalBefore = unrelatedHistoricalSnapshot(root, initialBatch);
  const release = acquireLock(root, questId);
  try {
    const recoveryPlan = parsePinnedPlan(root);
    const recoveryBatch = selectBatch(recoveryPlan.manifest, questId).batch;
    recoverInterruptedBatch(root, recoveryPlan, recoveryBatch);
    assertTransactionSiblingsAbsent(root, recoveryBatch);
    const plan = loadPlan(root);
    const selected = selectBatch(plan.manifest, questId);
    const batch = selected.batch;
    if (fs.existsSync(workspacePath(root, receiptRelativePath(questId)))) {
      throw new Error(PROBLEM.RECEIPT_EXISTS + questId);
    }
    const initialStaged = historicalBatchStagedPaths(root);
    const questPath = `solve/quests/${questId}.json`;
    const unexpected = initialStaged.filter((item) => item !== questPath);
    if (unexpected.length > 0) {
      throw new Error(PROBLEM.STAGED_UNEXPECTED +
        unexpected.join(LIST_SEPARATOR));
    }
    assertOrdinalState(root, plan, selected.index, false);
    const migrated = migrateBatchTransaction(root, plan, batch);
    try {
      if (unrelatedHistoricalSnapshot(root, batch) !== historicalBefore) {
        throw new Error(PROBLEM.HISTORICAL_DRIFT);
      }
      const scope = admitHistoricalBatchStagedScope(root, batch);
      return {...migrated, scope};
    } catch (error) {
      restoreBatch(root, batch);
      unstageHistoricalBatch(root, batch);
      throw error;
    }
  } finally {
    release();
  }
}

export function validateHistoricalArtifactBatchReceipt(
  root = process.cwd(),
  questId,
) {
  try {
    const plan = loadPlan(root);
    const {batch, index} = selectBatch(plan.manifest, questId);
    assertOrdinalState(root, plan, index, true);
    return validateReceiptAgainstPlan(root, plan, batch);
  } catch (error) {
    return {valid: false, problems: [error.message]};
  }
}

export function validateHistoricalArtifactBatchTooling(root = process.cwd()) {
  try {
    const plan = loadPlan(root);
    return {
      valid: true,
      problems: [],
      manifestSha256: plan.manifestSha256,
      batchCount: plan.manifest.batches.length,
      payloadCount: plan.manifest.batches.reduce((sum, batch) =>
        sum + batch.entries.length, 0),
    };
  } catch (error) {
    return {valid: false, problems: [error.message]};
  }
}

export function inspectHistoricalArtifactBatchScope(
  root = process.cwd(),
  questId,
) {
  try {
    const plan = loadPlan(root);
    const {batch} = selectBatch(plan.manifest, questId);
    return {
      valid: true,
      problems: [],
      ...inspectHistoricalBatchStagedScope(root, batch),
    };
  } catch (error) {
    return {valid: false, problems: [error.message]};
  }
}

export function historicalBatchReceiptPath(questId) {
  return receiptRelativePath(questId);
}
