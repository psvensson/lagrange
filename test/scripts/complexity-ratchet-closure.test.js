// Guard: neither complexity baseline is raised above the value its closure
// Quest sealed, and the whole-repo sweeps that enforce count <= baseline stay
// owed by the push gate. The sweeps themselves are not re-run here: the gate's
// test stage runs them through test:static:postpush whenever scripts/, src/
// or test/ change, and ci runs them in test:static - a third run inside the
// corpus measured the same tree again for ~22 s (static-test-hygiene).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

const ROOT = process.cwd();
const UTF8 = 'utf8';
const BASELINE_PATTERN = /^const BASELINE_COUNT = (\d+);$/mu;
const STATIC_AUDITS = 'scripts/checks/run-static-audits.js';
const STATIC_AUDIT_LIST_PATTERN =
  /STATIC_AUDIT_SCRIPTS = Object\.freeze\(\[([\s\S]*?)\]\)/u;
const PROOF_OBLIGATIONS = 'test/manifests/proof-obligations.json';
const OWED_INPUTS = Object.freeze(['scripts/**', 'src/**', 'test/**']);
const RATCHETS = Object.freeze([
  {
    key: 'cognitive',
    checker: 'scripts/check-cognitive-complexity.js',
    npmScript: 'test:complexity:cognitive',
    sealedCeiling: 179,
  },
  {
    key: 'cyclomatic',
    checker: 'scripts/check-complexity.js',
    npmScript: 'test:complexity',
    sealedCeiling: 1847,
  },
]);

function readText(relative) {
  return fs.readFileSync(path.join(ROOT, relative), UTF8);
}

for (const ratchet of RATCHETS) {
  test(`${ratchet.key} baseline is not raised above its sealed ceiling`, () => {
    const match = BASELINE_PATTERN.exec(readText(ratchet.checker));
    assert.ok(match, `${ratchet.checker} declares BASELINE_COUNT`);
    // Closure by baseline raise would pass the checker while reducing nothing.
    assert.ok(Number(match[1]) <= ratchet.sealedCeiling,
      `baseline ${match[1]} was not raised above the sealed ceiling ` +
      `${ratchet.sealedCeiling}`);
  });

  test(`${ratchet.key} whole-repo sweep stays owed by the push gate`, () => {
    const list = STATIC_AUDIT_LIST_PATTERN.exec(readText(STATIC_AUDITS));
    assert.ok(list, `${STATIC_AUDITS} declares STATIC_AUDIT_SCRIPTS`);
    assert.ok(list[1].includes(`'${ratchet.npmScript}'`),
      `${ratchet.npmScript} is one of the gate's static audits`);
    const scripts = JSON.parse(readText('package.json')).scripts;
    assert.equal(scripts[ratchet.npmScript], `node ${ratchet.checker}`,
      `${ratchet.npmScript} runs the whole-repo sweep, not a scoped one`);
    const obligation = JSON.parse(readText(PROOF_OBLIGATIONS)).obligations
      .find((entry) => entry.command === `npm run ${ratchet.npmScript}`);
    assert.ok(obligation, `${PROOF_OBLIGATIONS} declares ${ratchet.npmScript}`);
    for (const input of OWED_INPUTS) {
      assert.ok(obligation.inputs.includes(input),
        `a change under ${input} owes the ${ratchet.key} sweep`);
    }
  });
}
