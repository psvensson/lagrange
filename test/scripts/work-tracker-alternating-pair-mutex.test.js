import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  validateAlternatingPairMutex,
  validateAlternatingPairActiveLimit,
} from '../../scripts/work-tracker.js';

function pkg(dir, fileName, body) {
  fs.writeFileSync(path.join(dir, fileName), body);
}

function setupAlternatingPair() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alt-pair-mutex-'));
  // Three closed packages on owner_a / boundary_x with transition_gap,
  // three closed packages on owner_b / boundary_y with scheduling_gap,
  // alternating in time — triggers compositional-pair-alternation.
  const seq = [
    ['done-20260520-a.md', 'done', 'owner_a', 'boundary_x', 'transition_gap', 'runtime-owner-boundary'],
    ['done-20260521-b.md', 'done', 'owner_b', 'boundary_y', 'scheduling_gap', 'runtime-owner-boundary'],
    ['done-20260522-c.md', 'done', 'owner_a', 'boundary_x', 'transition_gap', 'runtime-owner-boundary'],
    ['done-20260523-d.md', 'done', 'owner_b', 'boundary_y', 'scheduling_gap', 'runtime-owner-boundary'],
    ['done-20260524-e.md', 'done', 'owner_a', 'boundary_x', 'transition_gap', 'runtime-owner-boundary'],
  ];
  for (const [name, status, owner, boundary, mech, lane] of seq) {
    pkg(dir, name,
      `# t\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1',
        status, opened: `2026-05-${name.slice(11, 13)}`,
        lane, owner, boundary, scenario: 'rolling-restart',
        artifact: `test/output/${name}.json`,
        mechanismCard: {failureMechanism: mech, expectedMovement: 'x', negativeResultMeans: 'y'},
      }, null, 2)}\n-->\n`);
  }
  return dir;
}

tap.test('alternating-pair mutex (R1)', async (t) => {
  t.test('blocks runtime package when a rederive is active on the same pair', (t) => {
    const dir = setupAlternatingPair();
    // Active rederive on owner_a / boundary_x.
    pkg(dir, 'active-20260529-rederive.md',
      `# r\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
        lane: 'system-theory-rederive', owner: 'owner_a', boundary: 'boundary_x',
        systemTheoryRevision: true,
        writeScope: ['work/sprints/active-foo.md', 'work/theory-ledger.md'],
      }, null, 2)}\n-->\n`);
    // Now attempt to activate a runtime package on owner_b / boundary_y (same pair).
    const errors = validateAlternatingPairMutex(
      {status: 'active', owner: 'owner_b', boundary: 'boundary_y',
       lane: 'runtime-owner-boundary',
       writeScope: ['src/foo/bar.js']},
      'work/packages/active-newruntime.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('alternating-pair-rederive-in-progress')),
      'rederive-in-progress error');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('blocks runtime package when another runtime package is active on the same pair', (t) => {
    const dir = setupAlternatingPair();
    pkg(dir, 'active-20260529-other-runtime.md',
      `# o\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
        lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
        writeScope: ['src/foo/x.js'],
      }, null, 2)}\n-->\n`);
    const errors = validateAlternatingPairMutex(
      {status: 'active', owner: 'owner_b', boundary: 'boundary_y',
       lane: 'runtime-owner-boundary',
       writeScope: ['src/foo/y.js']},
      'work/packages/active-newruntime.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('alternating-pair-concurrent-runtime')),
      'concurrent-runtime error');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('exempts rederive packages from the mutex', (t) => {
    const dir = setupAlternatingPair();
    pkg(dir, 'active-20260529-runtime.md',
      `# r\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
        lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
        writeScope: ['src/foo/x.js'],
      }, null, 2)}\n-->\n`);
    const errors = validateAlternatingPairMutex(
      {status: 'active', owner: 'owner_b', boundary: 'boundary_y',
       lane: 'system-theory-rederive', systemTheoryRevision: true,
       writeScope: ['work/sprints/active-foo.md']},
      'work/packages/active-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'rederive bypasses mutex');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('no error when no alternating pair signal exists', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alt-pair-mutex-clean-'));
    pkg(dir, 'done-20260520-a.md',
      `# a\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1', status: 'done', opened: '2026-05-20',
        lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
        artifact: 'test/output/a.json',
        mechanismCard: {failureMechanism: 'observation_gap', expectedMovement: 'x', negativeResultMeans: 'y'},
      }, null, 2)}\n-->\n`);
    const errors = validateAlternatingPairMutex(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
       lane: 'runtime-owner-boundary', writeScope: ['src/foo/x.js']},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('alternating-pair active-package limit (R9)', async (t) => {
  t.test('rejects second active on the same pair', (t) => {
    const dir = setupAlternatingPair();
    pkg(dir, 'active-20260529-first.md',
      `# f\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1', status: 'active', opened: '2026-05-29',
        lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
        writeScope: ['src/foo/x.js'],
      }, null, 2)}\n-->\n`);
    const errors = validateAlternatingPairActiveLimit(
      {status: 'active', owner: 'owner_b', boundary: 'boundary_y'},
      'work/packages/active-second.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('alternating-pair-active-limit-exceeded')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
