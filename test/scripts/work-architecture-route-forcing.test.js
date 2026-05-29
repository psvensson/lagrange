import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  validateArchitectureRouteImplementation,
  validateLoopExhaustionEscalation,
  validateCompositionalAutoPromoteGate,
} from '../../scripts/work-tracker.js';

const OWNER = 'owner_a';
const BOUNDARY = 'boundary_x';

function writePackage(dir, name, meta) {
  fs.writeFileSync(
    path.join(dir, name),
    `# ${name}\n\n<!-- work-package\n${JSON.stringify(meta, null, 2)}\n-->\n`,
  );
}

function closedBase(name, opened, extra = {}) {
  return {
    schema: 'work-package-v1',
    status: 'done',
    opened,
    lane: 'runtime-owner-boundary',
    owner: OWNER,
    boundary: BOUNDARY,
    scenario: 'rolling-restart',
    artifact: `test/output/${name}.json`,
    mechanismCard: {
      failureMechanism: 'transition_gap',
      expectedMovement: 'x',
      negativeResultMeans: 'y',
    },
    ...extra,
  };
}

function writeLedger(dir, slugs) {
  const body = slugs.map((s) => `## \`${s}\`\n\nbody\n`).join('\n');
  const ledgerPath = path.join(dir, 'theory-ledger.md');
  fs.writeFileSync(ledgerPath, body);
  return ledgerPath;
}

// A package dir whose latest closed package on the pair is an
// architecture-gap analysis and no route implementation has closed since →
// the pair is in `implement-pending` state.
function setupImplementPending() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-route-pending-'));
  writePackage(dir, 'done-20260520-a.md',
    closedBase('a', '2026-05-20', {theoryLoop: {outcome: 'inconclusive'}}));
  writePackage(dir, 'done-20260521-b.md',
    closedBase('b', '2026-05-21', {theoryLoop: {outcome: 'theory-falsified'}}));
  writePackage(dir, 'done-20260522-architecture-gap.md',
    closedBase('architecture-gap', '2026-05-22', {
      architectureGapAnalysis: true,
      theoryLoop: {outcome: 'migrated'},
    }));
  const ledgerPath = writeLedger(dir, ['theory-20260522-snapshot-architecture-gap']);
  return {dir, ledgerPath};
}

function validRouteMarker(overrides = {}) {
  return {
    selectedLayer: 'ownership',
    coupledInvariant: 'snapshot_coverage ⊗ active_gate_owner',
    ledgerRef: 'theory-20260522-snapshot-architecture-gap',
    ...overrides,
  };
}

function runtimeCandidate(routeMarker) {
  const meta = {
    status: 'active',
    owner: OWNER,
    boundary: BOUNDARY,
    lane: 'runtime-owner-boundary',
    writeScope: ['src/foo.js'],
  };
  if (routeMarker !== undefined) {
    meta.theoryLoop = {architectureRoute: routeMarker};
  }
  return meta;
}

tap.test('R13 architecture-route implementation forcing', async (t) => {
  t.test('implement-pending blocks another architecture-gap analysis', (t) => {
    const {dir, ledgerPath} = setupImplementPending();
    const errors = validateArchitectureRouteImplementation(
      {status: 'active', owner: OWNER, boundary: BOUNDARY,
       lane: 'causal-escalation', architectureGapAnalysis: true},
      'work/packages/active-20260523-architecture-gap.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(errors.some((e) =>
      e.includes('architecture-route-implementation-required')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('implement-pending blocks a system-theory rederive', (t) => {
    const {dir, ledgerPath} = setupImplementPending();
    const errors = validateArchitectureRouteImplementation(
      {status: 'active', owner: OWNER, boundary: BOUNDARY,
       lane: 'runtime-owner-boundary', systemTheoryRevision: true},
      'work/packages/active-20260523-system-theory-rederive.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(errors.some((e) =>
      e.includes('architecture-route-implementation-required')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('implement-pending blocks a runtime package without a marker', (t) => {
    const {dir, ledgerPath} = setupImplementPending();
    const errors = validateArchitectureRouteImplementation(
      runtimeCandidate(),
      'work/packages/active-20260523-snapshot.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(errors.some((e) => e.includes('architecture-route-marker-required')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('implement-pending passes a runtime package with a valid marker', (t) => {
    const {dir, ledgerPath} = setupImplementPending();
    const errors = validateArchitectureRouteImplementation(
      runtimeCandidate(validRouteMarker()),
      'work/packages/active-20260523-snapshot.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('state none (no closed gap analysis) is a no-op', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-route-none-'));
    writePackage(dir, 'done-20260520-a.md',
      closedBase('a', '2026-05-20', {theoryLoop: {outcome: 'inconclusive'}}));
    const ledgerPath = writeLedger(dir, ['theory-20260520-foo']);
    const errors = validateArchitectureRouteImplementation(
      {status: 'active', owner: OWNER, boundary: BOUNDARY,
       lane: 'causal-escalation', architectureGapAnalysis: true},
      'work/packages/active-20260523-architecture-gap.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('only fires during pre-impl, not closure', (t) => {
    const {dir, ledgerPath} = setupImplementPending();
    const errors = validateArchitectureRouteImplementation(
      runtimeCandidate(),
      'work/packages/active-20260523-snapshot.md',
      {phase: 'closure', packageDir: dir, ledgerPath},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('R13 marker shape validation', async (t) => {
  function shapeErrors(routeMarker, ledgerSlugs = ['theory-20260522-snapshot-architecture-gap']) {
    const {dir, ledgerPath} = setupImplementPending();
    if (ledgerSlugs) writeLedger(dir, ledgerSlugs);
    const errors = validateArchitectureRouteImplementation(
      runtimeCandidate(routeMarker),
      'work/packages/active-20260523-snapshot.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    fs.rmSync(dir, {recursive: true, force: true});
    return errors;
  }

  t.test('rejects an unknown selected layer', (t) => {
    const errors = shapeErrors(validRouteMarker({selectedLayer: 'frobnicate'}));
    t.ok(errors.some((e) => e.includes('architecture-route-layer-invalid')));
    t.end();
  });

  t.test('rejects a missing selected layer', (t) => {
    const m = validRouteMarker();
    delete m.selectedLayer;
    const errors = shapeErrors(m);
    t.ok(errors.some((e) => e.includes('architecture-route-layer-missing')));
    t.end();
  });

  t.test('rejects a missing coupled invariant', (t) => {
    const m = validRouteMarker();
    delete m.coupledInvariant;
    const errors = shapeErrors(m);
    t.ok(errors.some((e) =>
      e.includes('architecture-route-coupled-invariant-missing')));
    t.end();
  });

  t.test('rejects a ledger ref that is not an architecture-gap entry', (t) => {
    const errors = shapeErrors(
      validRouteMarker({ledgerRef: 'theory-20260522-snapshot-local-patch'}),
      ['theory-20260522-snapshot-local-patch'],
    );
    t.ok(errors.some((e) =>
      e.includes('architecture-route-ledger-ref-not-architecture-gap')));
    t.end();
  });

  t.test('rejects a ledger ref that does not exist', (t) => {
    const errors = shapeErrors(
      validRouteMarker({ledgerRef: 'theory-20990101-ghost-architecture-gap'}),
    );
    t.ok(errors.some((e) =>
      e.includes('architecture-route-ledger-ref-unknown')));
    t.end();
  });

  t.test('rejects a route package that writes no src/ path', (t) => {
    const {dir, ledgerPath} = setupImplementPending();
    const meta = runtimeCandidate(validRouteMarker());
    meta.writeScope = ['work/sprints/active-foo.md'];
    const errors = validateArchitectureRouteImplementation(
      meta,
      'work/packages/active-20260523-snapshot.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(errors.some((e) => e.includes('architecture-route-no-src')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('R5/R7 exit ramp honours a valid architecture-route marker', async (t) => {
  t.test('R5: exhausted pair lets a valid route implementation through', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-route-r5-'));
    const seq = [
      ['done-20260520-a.md', 'migrated'],
      ['done-20260521-b.md', 'inconclusive'],
      ['done-20260522-c.md', 'theory-falsified'],
    ];
    for (const [name, outcome] of seq) {
      writePackage(dir, name, closedBase(name, `2026-05-${name.slice(11, 13)}`,
        {theoryLoop: {outcome}}));
    }
    const ledgerPath = writeLedger(dir,
      ['theory-20260522-snapshot-architecture-gap']);

    const blocked = validateLoopExhaustionEscalation(
      {status: 'active', owner: OWNER, boundary: BOUNDARY,
       lane: 'runtime-owner-boundary'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(blocked.some((e) =>
      e.includes('loop-exhausted-architecture-gap-required')),
    'without a marker the pair is blocked');

    const passed = validateLoopExhaustionEscalation(
      runtimeCandidate(validRouteMarker()),
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.equal(passed.length, 0, 'a valid route marker is the exit ramp');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('R7: a blocking compositional signal is lifted by a valid marker', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-route-r7-'));
    for (const [name, opened] of [
      ['done-20260520-p1.md', '2026-05-20'],
      ['done-20260521-p2.md', '2026-05-21'],
      ['done-20260522-p3.md', '2026-05-22'],
    ]) {
      writePackage(dir, name, closedBase(name, opened,
        {lane: 'scenario-release-gate', theoryLoop: {outcome: 'inconclusive'}}));
    }
    const ledgerPath = writeLedger(dir,
      ['theory-20260522-snapshot-architecture-gap']);

    const blocked = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: OWNER, boundary: BOUNDARY,
       lane: 'scenario-release-gate'},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.ok(blocked.some((e) => e.includes('compositional-gate-blocked')),
      'same-mechanism repeat blocks without a marker');

    const passed = validateCompositionalAutoPromoteGate(
      {status: 'active', owner: OWNER, boundary: BOUNDARY,
       lane: 'scenario-release-gate',
       writeScope: ['src/foo.js'],
       theoryLoop: {architectureRoute: validRouteMarker()}},
      'work/packages/active-new.md',
      {phase: 'pre-impl', packageDir: dir, ledgerPath},
    );
    t.equal(passed.length, 0, 'a valid route marker passes the gate');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
