import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  validateMetricProgressLayerRotation,
  validateMetricDeltaResidualConsistency,
} from '../../scripts/work-tracker.js';

const OWNER = 'owner_a';
const BOUNDARY = 'boundary_x';

function writePackage(dir, name, meta) {
  fs.writeFileSync(
    path.join(dir, name),
    `# ${name}\n\n<!-- work-package\n${JSON.stringify(meta, null, 2)}\n-->\n`,
  );
}

// A closed architecture-route package on the pair, carrying the route marker
// plus the recorded metricDelta and artifact-bound residualCount R14 reads.
function closedRoute(name, opened, {layer, metricDelta, residualCount} = {}) {
  const meta = {
    schema: 'work-package-v1',
    status: 'done',
    opened,
    lane: 'runtime-owner-boundary',
    owner: OWNER,
    boundary: BOUNDARY,
    scenario: 'rolling-restart',
    theoryLoop: {
      architectureRoute: {
        selectedLayer: layer,
        coupledInvariant: 'snapshot_coverage ⊗ active_gate_owner',
        ledgerRef: 'theory-20260522-snapshot-architecture-gap',
      },
    },
  };
  if (metricDelta !== undefined) {
    meta.observablePrediction = {metricDelta};
  }
  if (residualCount !== undefined) {
    meta.representativeResidual = {
      status: 'open',
      scenario: 'rolling-restart',
      artifact: 'test-output/reports/x.report.json',
      frontier: 'edge',
      residualCount,
      owner: OWNER,
      boundary: BOUNDARY,
      dominantReason: 'r',
      nextAction: 'n',
    };
  }
  return meta;
}

function routeCandidate(layer, extra = {}) {
  return {
    status: 'active',
    owner: OWNER,
    boundary: BOUNDARY,
    lane: 'runtime-owner-boundary',
    writeScope: ['src/foo.js'],
    theoryLoop: {
      architectureRoute: {
        selectedLayer: layer,
        coupledInvariant: 'snapshot_coverage ⊗ active_gate_owner',
        ledgerRef: 'theory-20260522-snapshot-architecture-gap',
      },
    },
    ...extra,
  };
}

tap.test('R14 metric-progress layer-rotation gate (pre-impl)', async (t) => {
  t.test('blocks a third same-layer route after two zero-delta closes', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-rot-block-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol', metricDelta: 0}));
    writePackage(dir, 'done-20260521-b.md',
      closedRoute('b', '2026-05-21', {layer: 'protocol', metricDelta: 0}));
    const errors = validateMetricProgressLayerRotation(
      routeCandidate('protocol'),
      'work/packages/active-20260522-c.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(errors.some((e) =>
      e.includes('metric-progress-layer-rotation-required')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('passes when a window route moved the metric > 0', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-rot-moved-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol', metricDelta: 0}));
    writePackage(dir, 'done-20260521-b.md',
      closedRoute('b', '2026-05-21', {layer: 'protocol', metricDelta: 2}));
    const errors = validateMetricProgressLayerRotation(
      routeCandidate('protocol'),
      'work/packages/active-20260522-c.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('passes when the candidate rotates to a different layer', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-rot-rotate-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol', metricDelta: 0}));
    writePackage(dir, 'done-20260521-b.md',
      closedRoute('b', '2026-05-21', {layer: 'protocol', metricDelta: 0}));
    const errors = validateMetricProgressLayerRotation(
      routeCandidate('scheduling'),
      'work/packages/active-20260522-c.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('passes when fewer than the window of routes exist', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-rot-few-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol', metricDelta: 0}));
    const errors = validateMetricProgressLayerRotation(
      routeCandidate('protocol'),
      'work/packages/active-20260522-c.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('unmeasured (null) metricDelta does not count as no-progress', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-rot-null-'));
    // No metricDelta recorded on either closed route.
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol'}));
    writePackage(dir, 'done-20260521-b.md',
      closedRoute('b', '2026-05-21', {layer: 'protocol'}));
    const errors = validateMetricProgressLayerRotation(
      routeCandidate('protocol'),
      'work/packages/active-20260522-c.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('only fires at pre-impl, not closure', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-rot-phase-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol', metricDelta: 0}));
    writePackage(dir, 'done-20260521-b.md',
      closedRoute('b', '2026-05-21', {layer: 'protocol', metricDelta: 0}));
    const errors = validateMetricProgressLayerRotation(
      routeCandidate('protocol'),
      'work/packages/active-20260522-c.md',
      {phase: 'closure', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('a non-route candidate (no marker) is a no-op', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-rot-nomarker-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol', metricDelta: 0}));
    writePackage(dir, 'done-20260521-b.md',
      closedRoute('b', '2026-05-21', {layer: 'protocol', metricDelta: 0}));
    const errors = validateMetricProgressLayerRotation(
      {status: 'active', owner: OWNER, boundary: BOUNDARY,
       lane: 'runtime-owner-boundary', writeScope: ['src/foo.js']},
      'work/packages/active-20260522-c.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});

tap.test('R14 metricDelta/residual consistency gate (closure)', async (t) => {
  function closingRoute(layer, {metricDelta, residualCount}) {
    const meta = routeCandidate(layer, {status: 'done'});
    meta.observablePrediction = {metricDelta};
    meta.representativeResidual = {
      status: 'open',
      scenario: 'rolling-restart',
      artifact: 'test-output/reports/x.report.json',
      frontier: 'edge',
      residualCount,
      owner: OWNER,
      boundary: BOUNDARY,
      dominantReason: 'r',
      nextAction: 'n',
    };
    return meta;
  }

  t.test('passes when metricDelta equals the residual movement', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-con-ok-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20',
        {layer: 'protocol', metricDelta: 0, residualCount: 5}));
    const errors = validateMetricDeltaResidualConsistency(
      closingRoute('protocol', {metricDelta: 2, residualCount: 3}),
      'work/packages/active-20260522-c.md',
      {phase: 'closure', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('rejects a metricDelta that does not match the residual movement', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-con-bad-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20',
        {layer: 'protocol', metricDelta: 0, residualCount: 5}));
    const errors = validateMetricDeltaResidualConsistency(
      closingRoute('protocol', {metricDelta: 4, residualCount: 3}),
      'work/packages/active-20260522-c.md',
      {phase: 'closure', packageDir: dir},
    );
    t.ok(errors.some((e) => e.includes('metric-delta-residual-inconsistent')));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('clamps negative residual movement to zero', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-con-clamp-'));
    // residual grew (3 -> 5): movement clamps to max(0, 3-5)=0.
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20',
        {layer: 'protocol', metricDelta: 0, residualCount: 3}));
    const errors = validateMetricDeltaResidualConsistency(
      closingRoute('protocol', {metricDelta: 0, residualCount: 5}),
      'work/packages/active-20260522-c.md',
      {phase: 'closure', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('skips when the predecessor has no residualCount', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-con-nopred-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20', {layer: 'protocol', metricDelta: 0}));
    const errors = validateMetricDeltaResidualConsistency(
      closingRoute('protocol', {metricDelta: 9, residualCount: 3}),
      'work/packages/active-20260522-c.md',
      {phase: 'closure', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('skips when the closing route has no residualCount', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-con-noself-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20',
        {layer: 'protocol', metricDelta: 0, residualCount: 5}));
    const meta = routeCandidate('protocol', {status: 'done'});
    meta.observablePrediction = {metricDelta: 9};
    const errors = validateMetricDeltaResidualConsistency(
      meta,
      'work/packages/active-20260522-c.md',
      {phase: 'closure', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('only fires at closure, not pre-impl', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r14-con-phase-'));
    writePackage(dir, 'done-20260520-a.md',
      closedRoute('a', '2026-05-20',
        {layer: 'protocol', metricDelta: 0, residualCount: 5}));
    const errors = validateMetricDeltaResidualConsistency(
      closingRoute('protocol', {metricDelta: 4, residualCount: 3}),
      'work/packages/active-20260522-c.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
