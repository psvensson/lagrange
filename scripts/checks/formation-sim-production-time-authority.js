#!/usr/bin/env node
/**
 * Production time-authority closure probe
 * (`formation-sim-production-time-authority-closure` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-sim-production-time-authority.js [--explain]
 *
 * Prints the number of time-authority witnesses that do not hold (the quest
 * probe; target 0). The witnesses live in
 * test/simulation/formation-sim-production-time-authority.test.js and assert
 * that hosted production reads time only from the owning node or subsystem
 * TimeSource, and that the one deterministic-owner ambient-seam guard refuses
 * an ambient read from tagged production execution however many continuations
 * it took to reach it.
 *
 * The probe starts one child `node --test` run and reads its TAP summary; it
 * measures nothing itself.
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WITNESS_FILE =
  'test/simulation/formation-sim-production-time-authority.test.js';
const FAIL_LINE = /^# fail (\d+)$/m;
const TESTS_LINE = /^# tests (\d+)$/m;
const EXPLAIN_FLAG = '--explain';
// Captured at module load: a replaced Array.prototype.includes must not be
// able to decide whether the probe is explaining itself.
const arrayIncludes = Function.call.bind(Array.prototype.includes);
// The unreadable-run metric, as the one line this probe prints in that case.
const UNREADABLE_METRIC_LINE = '1\n';
const UNREADABLE = 'the witness run produced no TAP summary';

const explain = arrayIncludes(process.argv, EXPLAIN_FLAG);
const run = spawnSync(
  process.execPath, ['--test', WITNESS_FILE],
  {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 26},
);
const output = `${run.stdout || ''}${run.stderr || ''}`;
const failed = FAIL_LINE.exec(output);
const total = TESTS_LINE.exec(output);
if (failed === null || total === null) {
  process.stdout.write(`${UNREADABLE}\n`);
  if (explain) process.stdout.write(output);
  process.stdout.write(UNREADABLE_METRIC_LINE);
  process.exit(1);
}
const unmet = Number(failed[1]);
if (explain) {
  process.stdout.write(output);
  process.stdout.write(
    `${unmet} of ${total[1]} time-authority witnesses unmet\n`);
}
process.stdout.write(`${unmet}\n`);
process.exit(unmet === 0 ? 0 : 1);
