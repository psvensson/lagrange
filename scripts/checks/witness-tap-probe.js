/**
 * The shared body of a quest probe that measures one witness file.
 *
 * Several quest probes have exactly the same job: start ONE child
 * `node --test` run over a single witness file, read the TAP summary, and
 * print the number of witnesses that do not hold. Nothing in that shape is
 * specific to a quest - the witness file and the noun in the explanation are
 * the whole difference - and a probe that measures anything itself can be
 * satisfied by changing the probe instead of repairing the owner, so the
 * measurement must stay here where there is only one copy of it.
 *
 * @module scripts/checks/witness-tap-probe
 */

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAIL_LINE = /^# fail (\d+)$/m;
const TESTS_LINE = /^# tests (\d+)$/m;
const EXPLAIN_FLAG = '--explain';
// Captured at module load: a replaced Array.prototype.includes must not be
// able to decide whether the probe is explaining itself.
const arrayIncludes = Function.call.bind(Array.prototype.includes);
// The unreadable-run metric, as the one line a probe prints in that case.
const UNREADABLE_METRIC_LINE = '1\n';
const UNREADABLE = 'the witness run produced no TAP summary';

/**
 * Run one witness file and print its unmet count. Never returns.
 * @param {Object} options - {witnessFile, noun}.
 */
function runWitnessTapProbe({witnessFile, noun}) {
  const explain = arrayIncludes(process.argv, EXPLAIN_FLAG);
  const run = spawnSync(
    process.execPath, ['--test', witnessFile],
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
    process.stdout.write(`${unmet} of ${total[1]} ${noun} witnesses unmet\n`);
  }
  process.stdout.write(`${unmet}\n`);
  process.exit(unmet === 0 ? 0 : 1);
}

export {runWitnessTapProbe};
