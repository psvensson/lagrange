// Guard: both complexity ratchets pass at their recorded baselines, and the
// closure is real — measured from the checkers' own reports, with neither
// baseline raised above the values this Quest sealed against.

import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const ROOT = process.cwd();
const SEALED_CEILINGS = Object.freeze({
  cognitive: 179,
  cyclomatic: 1847,
});
const RATCHETS = Object.freeze([
  {
    key: 'cognitive',
    command: 'scripts/check-cognitive-complexity.js',
    report: 'test-output/analysis/cognitive-complexity-src-scripts.json',
  },
  {
    key: 'cyclomatic',
    command: 'scripts/check-complexity.js',
    report: 'test-output/analysis/complexity-src-test.json',
  },
]);

function runRatchet(command) {
  try {
    execFileSync(process.execPath, [command], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 0;
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1;
  }
}

// Two whole-repo complexity sweeps run serially here; the cyclomatic pass
// alone exceeds tap's 30s default as the tree grows, so declare the real
// budget explicitly at the root (the file-level timeout is what fires).
tap.setTimeout(120000);

tap.test('complexity ratchets are closed at their baselines',
  {timeout: 120000}, async (t) => {
    for (const ratchet of RATCHETS) {
      t.test(`${ratchet.key} ratchet passes with no baseline raise`, (t) => {
        const exitCode = runRatchet(ratchet.command);
        t.equal(exitCode, 0, `${ratchet.command} exits 0`);

        const report = JSON.parse(
          fs.readFileSync(path.join(ROOT, ratchet.report), 'utf8'));
        t.ok(report.count <= report.baselineCount,
          `count ${report.count} is within baseline ${report.baselineCount}`);
        // Closure by baseline raise would pass the checker while reducing
        // nothing; pin the baseline to the value sealed by the Quest.
        t.ok(report.baselineCount <= SEALED_CEILINGS[ratchet.key],
          `baseline ${report.baselineCount} was not raised above the sealed ` +
        `ceiling ${SEALED_CEILINGS[ratchet.key]}`);
        t.end();
      });
    }
  });
