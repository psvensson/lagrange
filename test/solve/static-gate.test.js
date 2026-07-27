import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {staticQualityProblems} from '../../scripts/solve/static-gate.js';

const PASSING_CHECKER = 'process.exit(0);\n';
const FAILING_CHECKER =
  'console.log("src/x.js 1:1 error something machine-checkable");\n' +
  'process.exit(1);\n';

function fixture({eslint, literals}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'static-gate-'));
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src/x.js'), 'export const x = 1;\n');
  if (eslint !== null) {
    const bin = path.join(root, 'node_modules/eslint/bin');
    fs.mkdirSync(bin, {recursive: true});
    fs.writeFileSync(path.join(bin, 'eslint.js'), eslint);
  }
  if (literals !== null) {
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'scripts/check-guideline-literals.js'), literals);
  }
  return root;
}

tap.test('unlinted or missing paths never gate', (t) => {
  const root = fixture({eslint: FAILING_CHECKER, literals: FAILING_CHECKER});
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  t.same(staticQualityProblems(root, []), []);
  t.same(staticQualityProblems(root, ['docs/note.md', 'examples/e.js']), [],
    'trees outside the lint configuration are not gated');
  t.same(staticQualityProblems(root, ['src/missing.js']), [],
    'a deleted path cannot be linted');
  t.end();
});

tap.test('absent checkers skip instead of blocking', (t) => {
  const root = fixture({eslint: null, literals: null});
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  t.same(staticQualityProblems(root, ['src/x.js']), [],
    'a fixture root without dev dependencies is not gated');
  t.end();
});

tap.test('checker failures block with bounded output', (t) => {
  const root = fixture({eslint: FAILING_CHECKER, literals: PASSING_CHECKER});
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const problems = staticQualityProblems(root, ['src/x.js']);
  t.equal(problems.length, 1);
  t.match(problems[0], /static-quality eslint failed/u);
  t.match(problems[0], /machine-checkable/u,
    'the checker output is carried into the problem');
  t.end();
});

tap.test('clean checkers pass', (t) => {
  const root = fixture({eslint: PASSING_CHECKER, literals: PASSING_CHECKER});
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  t.same(staticQualityProblems(root, ['src/x.js']), []);
  t.end();
});
