import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  validateRepresentativeProgressCircuitBreaker,
} from '../../scripts/work-tracker.js';

function closedPackage(dir, name, day, residualCount, extra = {}) {
  fs.writeFileSync(
    path.join(dir, name),
    `# t\n\n<!-- work-package\n${JSON.stringify({
      schema: 'work-package-v1',
      status: 'done',
      opened: `2026-05-${day}`,
      lane: 'runtime-owner-boundary',
      owner: 'owner_a',
      boundary: 'boundary_x',
      artifact: `test/output/${name}.json`,
      mechanismCard: {
        failureMechanism: 'observation_gap',
        expectedMovement: 'x',
        negativeResultMeans: 'y',
      },
      representativeResidual: {residualCount},
      ...extra,
    }, null, 2)}\n-->\n`,
  );
}

function stalledDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-breaker-'));
  closedPackage(dir, 'done-20260520-a.md', '20', 5);
  closedPackage(dir, 'done-20260521-b.md', '21', 5);
  closedPackage(dir, 'done-20260522-c.md', '22', 5);
  return dir;
}

tap.test('representative-progress circuit breaker (R17)', async (t) => {
  t.test('blocks a local slice when residual did not shrink', (t) => {
    const dir = stalledDir();
    const errors = validateRepresentativeProgressCircuitBreaker(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.ok(
      errors.some((e) => e.includes('representative-progress-circuit-breaker')),
      'stalled local slice blocked',
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('passes when residual is shrinking', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-breaker-ok-'));
    closedPackage(dir, 'done-20260520-a.md', '20', 9);
    closedPackage(dir, 'done-20260521-b.md', '21', 7);
    closedPackage(dir, 'done-20260522-c.md', '22', 5);
    const errors = validateRepresentativeProgressCircuitBreaker(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'shrinking residual passes');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('exempts an architecture-gap analysis', (t) => {
    const dir = stalledDir();
    const errors = validateRepresentativeProgressCircuitBreaker(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'architecture-gap-analysis', architectureGapAnalysis: true,
      },
      'work/packages/active-gap.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'gap analysis bypasses breaker');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('exempts an owner-boundary migration', (t) => {
    const dir = stalledDir();
    const errors = validateRepresentativeProgressCircuitBreaker(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary', ownerBoundaryMigration: true,
      },
      'work/packages/active-migrate.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'migration bypasses breaker');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('does not fire below the window', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'circuit-breaker-few-'));
    closedPackage(dir, 'done-20260520-a.md', '20', 5);
    closedPackage(dir, 'done-20260521-b.md', '21', 5);
    const errors = validateRepresentativeProgressCircuitBreaker(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', packageDir: dir},
    );
    t.equal(errors.length, 0, 'below window => no constraint');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
