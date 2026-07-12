import {spawnSync} from 'node:child_process';

import {HISTORICAL_ARTIFACT_MIGRATION_V2 as CONTRACT} from
  './historical-artifact-migration-v2-constants.js';

const PROBLEM = Object.freeze({
  STAGED_UNEXPECTED: 'staged diff contains a path outside this batch: ',
  SCOPE_PATHS: 'batch Quest exceeds the 25-path limit',
  SCOPE_BYTES: 'batch Quest exceeds the 256-KiB limit',
  BATCH_SCOPE_PATHS: 'batch migration exceeds its A2a path budget',
  BATCH_SCOPE_BYTES: 'batch migration exceeds its A2a byte budget',
});
const GIT_COMMAND = 'git';
const GIT_SUCCESS = 0;
const MAX_GIT_BUFFER = 64 * 1024 * 1024;
const TEXT_ENCODING = 'utf8';
const NULL_SEPARATOR = '\0';
const LIST_SEPARATOR = ', ';
const RECEIPT_SUFFIX = '.receipt.json';
const GIT = Object.freeze({
  ADD: 'add',
  ALL: '-A',
  BINARY: '--binary',
  CACHED: '--cached',
  DIFF: 'diff',
  HEAD: 'HEAD',
  NAME_ONLY: '--name-only',
  PATHS: '--',
  QUIET_SHORT: '-q',
  RESET: 'reset',
  ZERO_TERMINATED: '-z',
});

function runGit(root, args) {
  const result = spawnSync(GIT_COMMAND, args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    maxBuffer: MAX_GIT_BUFFER,
  });
  if (result.status !== GIT_SUCCESS) {
    throw new Error(result.stderr || `${GIT_COMMAND} ${args[0]} failed`);
  }
  return result.stdout || '';
}

export function historicalBatchStagedPaths(root) {
  const output = runGit(root, [
    GIT.DIFF,
    GIT.CACHED,
    GIT.NAME_ONLY,
    GIT.ZERO_TERMINATED,
    GIT.HEAD,
  ]);
  return output.split(NULL_SEPARATOR).filter(Boolean).sort();
}

function stagedDiffBytes(root, paths = []) {
  const args = [GIT.DIFF, GIT.CACHED, GIT.BINARY, GIT.HEAD];
  if (paths.length > 0) args.push(GIT.PATHS, ...paths);
  return Buffer.byteLength(runGit(root, args));
}

export function historicalBatchMigrationPaths(batch) {
  return [
    ...batch.entries.flatMap((entry) => [
      entry.sourcePath,
      entry.plannedAfter.descriptorPath,
      entry.plannedAfter.objectPath,
    ]),
    `${CONTRACT.BATCH_RECEIPT_DIRECTORY}/${batch.questId}${RECEIPT_SUFFIX}`,
  ].sort();
}

export function inspectHistoricalBatchStagedScope(root, batch) {
  const migrationPaths = historicalBatchMigrationPaths(batch);
  const questPath = `solve/quests/${batch.questId}.json`;
  const allowed = [...migrationPaths, questPath].sort();
  const staged = historicalBatchStagedPaths(root);
  const unexpected = staged.filter((item) => !allowed.includes(item));
  if (unexpected.length > 0) {
    throw new Error(PROBLEM.STAGED_UNEXPECTED + unexpected.join(LIST_SEPARATOR));
  }
  const migration = {
    changedPaths: staged.filter((item) => migrationPaths.includes(item)).length,
    changedBytes: stagedDiffBytes(root, migrationPaths),
  };
  const complete = {changedPaths: staged.length, changedBytes: stagedDiffBytes(root)};
  if (migration.changedPaths + CONTRACT.BATCH_EVIDENCE_PATHS > batch.pathCount) {
    throw new Error(PROBLEM.BATCH_SCOPE_PATHS);
  }
  if (migration.changedBytes + CONTRACT.BATCH_EVIDENCE_BYTES >
    batch.conservativeChangeBytes) {
    throw new Error(PROBLEM.BATCH_SCOPE_BYTES);
  }
  if (complete.changedPaths + CONTRACT.COMPLETE_QUEST_RESERVED_PATHS >
    CONTRACT.MAX_BATCH_PATHS) {
    throw new Error(PROBLEM.SCOPE_PATHS);
  }
  if (complete.changedBytes + CONTRACT.COMPLETE_QUEST_RESERVED_BYTES >
    CONTRACT.MAX_BATCH_BYTES) {
    throw new Error(PROBLEM.SCOPE_BYTES);
  }
  return {migration, complete, stagedPaths: staged};
}

export function admitHistoricalBatchStagedScope(root, batch) {
  const questPath = `solve/quests/${batch.questId}.json`;
  runGit(root, [
    GIT.ADD,
    GIT.ALL,
    GIT.PATHS,
    ...historicalBatchMigrationPaths(batch),
    questPath,
  ]);
  return inspectHistoricalBatchStagedScope(root, batch);
}

export function unstageHistoricalBatch(root, batch) {
  runGit(root, [
    GIT.RESET,
    GIT.QUIET_SHORT,
    GIT.HEAD,
    GIT.PATHS,
    ...historicalBatchMigrationPaths(batch),
    `solve/quests/${batch.questId}.json`,
  ]);
}
