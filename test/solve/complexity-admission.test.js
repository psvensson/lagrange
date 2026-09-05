import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {git, initializeGitFixtureRoot, writeFile}
  from './git-fixture-helpers.js';
import {
  complexityAdmissionProblems,
  newViolations,
  touchedComplexityOverflow,
} from '../../scripts/solve/complexity-admission.js';

// Witness for the solver-streamlining P3 item: the attempt-time projection of
// the publish-gate complexity ratchets. A function the candidate pushes over
// the cyclomatic threshold blocks at seal; a function that was already over
// at the attempt base stays tolerated (the ratchet only counts), exactly as
// the file-size admission treats legacy oversized files. The REAL checker
// scripts run from the repository root against a temporary git fixture.

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCE = 'src/branchy.js';
const OTHER = 'src/simple.js';
const SIMPLE = 'export function simple(a) {\n  return a ? 1 : 0;\n}\n';

// A function with cyclomatic complexity `branches + 1`.
function branchy(name, branches) {
  const lines = [`export function ${name}(value) {`, '  let total = 0;'];
  for (let index = 0; index < branches; index += 1) {
    lines.push(`  if (value === ${index}) total += ${index};`);
  }
  lines.push('  return total;', '}', '');
  return lines.join('\n');
}

function fixture(t, baseSource) {
  const root = initializeGitFixtureRoot(t, 'complexity-admission-');
  writeFile(root, SOURCE, baseSource);
  writeFile(root, OTHER, SIMPLE);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  return {root, base: git(root, ['rev-parse', 'HEAD'])};
}

const CHECKER = {checkerRoot: REPO_ROOT};

test('new-over-threshold-function-blocks: a function the candidate pushes ' +
  'over the cyclomatic threshold is named as a new violation', (t) => {
  const fx = fixture(t, branchy('grown', 5));
  writeFile(fx.root, SOURCE, branchy('grown', 14));
  const overflow = touchedComplexityOverflow(fx.root, fx.base, [SOURCE], CHECKER);
  assert.ok(overflow.some((entry) => entry.filePath === SOURCE &&
    /grown/u.test(entry.message)), JSON.stringify(overflow));
  const problems = complexityAdmissionProblems(
    fx.root, fx.base, [SOURCE, OTHER], CHECKER);
  assert.equal(problems.length, overflow.length);
  assert.match(problems[0], /complexity admission: cyclomatic complexity/u);
  assert.match(problems[0], /new over threshold/u);
});

test('pre-existing-over-threshold-function-tolerated: editing a function ' +
  'that was already over the threshold at the base is not a violation',
(t) => {
  const fx = fixture(t, branchy('legacy', 14));
  writeFile(fx.root, SOURCE, branchy('legacy', 16));
  assert.deepEqual(touchedComplexityOverflow(fx.root, fx.base, [SOURCE], CHECKER),
    [], 'the ratchet count does not move');
});

test('clean-and-absent-paths-never-gate: files under threshold, deleted ' +
  'files, and a missing base commit produce no problems', (t) => {
  const fx = fixture(t, branchy('fine', 3));
  writeFile(fx.root, SOURCE, branchy('fine', 4));
  assert.deepEqual(complexityAdmissionProblems(
    fx.root, fx.base, [SOURCE, 'src/gone.js'], CHECKER), []);
  assert.deepEqual(complexityAdmissionProblems(
    fx.root, null, [SOURCE], CHECKER), [], 'no base, no admission');
});

test('absent-checkers-skip: a tree without the checker scripts never blocks',
  (t) => {
    const fx = fixture(t, branchy('grown', 5));
    writeFile(fx.root, SOURCE, branchy('grown', 14));
    assert.deepEqual(complexityAdmissionProblems(fx.root, fx.base, [SOURCE]),
      [], 'the fixture root has no scripts/check-complexity.js');
    fs.rmSync(path.join(fx.root, SOURCE));
  });

test('unnamed-violations-count-per-file: a checker whose message names no ' +
  'function (cognitive) still reports a new violation when the count grows',
() => {
  const unnamed = (line) => ({filePath: 'src/x.js', line,
    message: 'Refactor this function to reduce its Cognitive Complexity from 25 to the 20 allowed.'});
  const base = [unnamed(10)];
  assert.deepEqual(newViolations(base, [unnamed(12)]), [],
    'the same single violation moved by two lines is not new');
  assert.deepEqual(newViolations(base, [unnamed(10), unnamed(40)]),
    [unnamed(40)], 'a second unnamed violation in the file is new');
  const named = (name, value) => ({filePath: 'src/y.js', line: 1,
    message: `Function '${name}' has a complexity of ${value}. Maximum allowed is 12.`});
  assert.deepEqual(newViolations([named('a', 13)], [named('a', 15), named('b', 13)]),
    [named('b', 13)], 'named functions key on the name, not the measured value');
});
