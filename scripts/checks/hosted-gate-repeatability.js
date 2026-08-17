#!/usr/bin/env node
// Hosted-gate repeatability check for the restore-deterministic-cloud-gate
// Quest.
//
// One green run proves nothing after a gate that was itself misreporting test
// timeouts: the old harness silently capped 18 files at 30s, so "it passed"
// and "it was actually exercised" had come apart. The bar is therefore the
// SAME source SHA passing the complete GitHub-hosted blocking gate
// REQUIRED_PASSES times, with no code difference between repetitions.
//
// Exits 0 only when the current HEAD has that many successful hosted `ci`
// conclusions. Any failed run on that SHA fails the check outright — a red run
// followed by three green ones is not repeatability, it is a flake with a
// survivor bias.

import process from 'node:process';
import {spawnSync} from 'node:child_process';

const REQUIRED_PASSES = 3;
const WORKFLOW_NAME = 'ci';
const CONCLUSION_SUCCESS = 'success';
const CONCLUSION_FAILURE = 'failure';
const STATUS_COMPLETED = 'completed';
const RUN_QUERY_LIMIT = '40';
const UTF8 = 'utf8';
const EXIT_FAILURE = 1;
const SHA_DISPLAY_LENGTH = 9;
const CANNOT_READ_PROBLEM =
  'hosted-gate-repeatability: cannot read HEAD or hosted run list\n';

// Ambient-intrinsic hardening (system-guidelines): capture at module load.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringSlice = Function.call.bind(String.prototype.slice);

function headSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {encoding: UTF8});
  return stringTrim(result.stdout || '');
}

function hostedRuns() {
  const result = spawnSync('gh', [
    'run', 'list', '--limit', RUN_QUERY_LIMIT,
    '--json', 'databaseId,headSha,name,status,conclusion',
  ], {encoding: UTF8});
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function main() {
  const sha = headSha();
  const runs = hostedRuns();
  if (!sha || runs === null) {
    process.stdout.write(CANNOT_READ_PROBLEM);
    process.exitCode = EXIT_FAILURE;
    return;
  }
  const onHead = arrayFilter(runs, (run) =>
    run.headSha === sha && run.name === WORKFLOW_NAME &&
    run.status === STATUS_COMPLETED);
  const passes = arrayFilter(
    onHead, (run) => run.conclusion === CONCLUSION_SUCCESS);
  const failures = arrayFilter(
    onHead, (run) => run.conclusion === CONCLUSION_FAILURE);
  process.stdout.write(
    `hosted-gate-repeatability: ${passes.length}/${REQUIRED_PASSES} passing, ` +
    `${failures.length} failing on ${stringSlice(sha, 0, SHA_DISPLAY_LENGTH)}\n`);
  if (failures.length > 0 || passes.length < REQUIRED_PASSES) {
    process.exitCode = EXIT_FAILURE;
  }
}

main();
