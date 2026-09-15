#!/usr/bin/env node
/**
 * Simulator attribution/runner isolation probe
 * (`formation-sim-attribution-runner-isolation` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-sim-attribution-isolation.js [--explain]
 *
 * Prints the number of isolation witnesses that do not hold (the quest probe;
 * target 0). The witnesses live in
 * test/simulation/formation-sim-attribution-isolation.test.js and assert that
 * ambient host async ancestry - the test runner's, a caller's AsyncResource or
 * promise chain, or a resource left from a previous simulation generation -
 * never decides which simulated node production work is charged to, while an
 * active-generation segment that genuinely needs a node still fails closed.
 *
 * The probe starts one child `node --test` run and reads its TAP summary; it
 * measures nothing itself, so a witness can only be satisfied by repairing the
 * attribution boundary.
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WITNESS_FILE =
  'test/simulation/formation-sim-attribution-isolation.test.js';
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
    `${unmet} of ${total[1]} isolation witnesses unmet\n`);
}
process.stdout.write(`${unmet}\n`);
process.exit(unmet === 0 ? 0 : 1);
