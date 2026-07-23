#!/usr/bin/env node

/**
 * Push-gate variant of `npm run test:unused`.
 *
 * The pre-push hook must judge only the tree being pushed. Knip scans the
 * working tree, so an untracked file (e.g. a concurrent session's in-flight
 * quest work) would block an unrelated push even though untracked files are
 * never part of a push. This wrapper runs the same knip analysis and
 * downgrades unused-file findings for untracked paths to warnings; every
 * finding on a tracked path, and every non-file issue, still fails the gate.
 */

import {execFileSync, spawnSync} from 'node:child_process';

function trackedPaths() {
  const out = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'});
  return new Set(out.split('\0').filter(Boolean));
}

function runKnip() {
  const result = spawnSync('npx', [
    'knip', '--exclude', 'exports,duplicates', '--reporter', 'json',
  ], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (result.error) {
    throw result.error;
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr ?? '');
    throw new Error('knip did not produce parseable JSON output');
  }
  return report;
}

function main() {
  const tracked = trackedPaths();
  const report = runKnip();
  const files = Array.isArray(report.files) ? report.files : [];
  const issues = Array.isArray(report.issues) ? report.issues : [];

  const trackedUnusedFiles = files.filter((file) => tracked.has(file));
  const untrackedUnusedFiles = files.filter((file) => !tracked.has(file));

  for (const file of untrackedUnusedFiles) {
    console.warn(`push-gate: ignoring untracked unused file ${file}`);
  }

  if (trackedUnusedFiles.length === 0 && issues.length === 0) {
    return 0;
  }
  if (trackedUnusedFiles.length > 0) {
    console.error(`Unused tracked files (${trackedUnusedFiles.length})`);
    for (const file of trackedUnusedFiles) {
      console.error(`  ${file}`);
    }
  }
  if (issues.length > 0) {
    console.error(`Knip issues (${issues.length})`);
    for (const issue of issues) {
      console.error(`  ${JSON.stringify(issue)}`);
    }
  }
  return 1;
}

process.exit(main());
