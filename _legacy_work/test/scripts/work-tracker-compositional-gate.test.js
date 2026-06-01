import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {validateCompositionalAutoPromoteGate} from '../../scripts/work-tracker.js';

function makeClosedPackage(dir, slug, owner, boundary, mechanism, opened) {
  const content =
`# ${slug}

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "${opened}",
  "lane": "scenario-release-gate",
  "owner": "${owner}",
  "boundary": "${boundary}",
  "scenario": "test-scenario",
  "artifact": "test/output/${slug}.json",
  "mechanismCard": {
    "failureMechanism": "${mechanism}",
    "expectedMovement": "reduce",
    "negativeResultMeans": "next escalation"
  }
}
-->
`;
  fs.writeFileSync(path.join(dir, `done-${opened.replace(/-/g, '')}-${slug}.md`), content);
}

function setupPackageDir(triples) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-gate-'));
  triples.forEach(([slug, owner, boundary, mech, opened], idx) => {
    const d = opened || `2026-05-${String(20 + idx).padStart(2, '0')}`;
    makeClosedPackage(dir, slug, owner, boundary, mech, d);
  });
  return dir;
}

tap.test('compositional auto-promote gate', async (t) => {
  t.test('no error when no compositional signal fires', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'observation_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'selection_gap', '2026-05-21'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x', lane: 'scenario-release-gate'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('blocks when same-mechanism repeats 3x on same boundary', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x', lane: 'scenario-release-gate'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 1);
    t.match(errors[0], /compositional-gate-blocked/);
    t.match(errors[0], /transition_gap/);
    t.match(errors[0], /owner=owner_a/);
    t.match(errors[0], /boundary=boundary_x/);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('allows promotion when package is a system-theory revision (lane)', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x', lane: 'system-theory-rederive'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('allows promotion when slug names a system-theory revision', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x', lane: 'scenario-release-gate'},
      'work/packages/active-20260528-owner_a-boundary_x-system-theory-rederive.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('allows promotion when explicit systemTheoryRevision flag is set', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'scenario-release-gate', systemTheoryRevision: true,
      },
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('only fires during pre-impl phase, not closure', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x', lane: 'scenario-release-gate'},
      'work/packages/active-new.md',
      {phase: 'closure', packageDir: dir},
    );
    t.equal(errors.length, 0, 'closure phase is exempt');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('skips silently when owner or boundary is missing', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', lane: 'scenario-release-gate'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('only fires for active/todo packages, not done', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'done', owner: 'owner_a', boundary: 'boundary_x', lane: 'scenario-release-gate'},
      'work/packages/done-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('does not fire for unrelated owner/boundary even when other boundary saturates', (t) => {
    const dir = setupPackageDir([
      ['p1', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-20'],
      ['p2', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-21'],
      ['p3', 'owner_a', 'boundary_x', 'transition_gap', '2026-05-22'],
    ]);
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: 'owner_b', boundary: 'boundary_y', lane: 'scenario-release-gate'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('missing package dir does not crash', (t) => {
    const errors = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: 'owner_a', boundary: 'boundary_x', lane: 'scenario-release-gate'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: '/nonexistent/path/that/does/not/exist'},
    );
    t.equal(errors.length, 0);
    t.end();
  });
});
