import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {validateModelProvenRouteForcing} from '../../scripts/work-tracker.js';

function contractDirWithProvenRoute(layer = 'observation') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proven-route-'));
  const contract = {
    schema: 'system-contract-record-v1',
    owner: 'owner_a',
    boundary: 'boundary_x',
    modelProvenRoutes: [
      {
        owner: 'owner_a',
        boundary: 'boundary_x',
        selectedLayer: layer,
        livenessHolds: true,
        evidenceArtifact: 'test-output/reports/proof.json',
        ledgerRef: 'theory-20260101-proof',
      },
    ],
  };
  fs.writeFileSync(
    path.join(dir, 'pair.md'),
    `# c\n\n<!-- system-contract\n${JSON.stringify(contract, null, 2)}\n-->\n`,
  );
  return dir;
}

function routePackage(layer) {
  return {
    status: 'active',
    owner: 'owner_a',
    boundary: 'boundary_x',
    lane: 'runtime-owner-boundary',
    theoryLoop: {
      architectureRoute: {
        selectedLayer: layer,
        coupledInvariant: 'inv-x',
        ledgerRef: 'theory-20260101-architecture-gap',
      },
    },
  };
}

tap.test('model-proven-route forcing (R15)', async (t) => {
  t.test('blocks architecture-gap analysis on a proven pair', (t) => {
    const dir = contractDirWithProvenRoute();
    const errors = validateModelProvenRouteForcing(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'architecture-gap-analysis', architectureGapAnalysis: true,
      },
      'work/packages/active-gap.md',
      {phase: 'pre-impl', contractDir: dir},
    );
    t.ok(
      errors.some((e) => e.includes('model-proven-route-forces-implementation')),
      'gap analysis blocked',
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('requires an architecture-route marker on a proven pair', (t) => {
    const dir = contractDirWithProvenRoute();
    const errors = validateModelProvenRouteForcing(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', contractDir: dir},
    );
    t.ok(
      errors.some((e) => e.includes('model-proven-route-marker-required')),
      'marker required',
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('rejects a route that does not match the proven layer', (t) => {
    const dir = contractDirWithProvenRoute('observation');
    const errors = validateModelProvenRouteForcing(
      routePackage('protocol'),
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', contractDir: dir},
    );
    t.ok(
      errors.some((e) => e.includes('model-proven-route-layer-mismatch')),
      'layer mismatch blocked',
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('accepts a route bound to the proven layer', (t) => {
    const dir = contractDirWithProvenRoute('observation');
    const errors = validateModelProvenRouteForcing(
      routePackage('observation'),
      'work/packages/active-runtime.md',
      {phase: 'pre-impl', contractDir: dir},
    );
    t.equal(errors.length, 0, 'proven-layer route passes');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('no-op when no proven route exists for the pair', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proven-route-empty-'));
    const errors = validateModelProvenRouteForcing(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'architecture-gap-analysis', architectureGapAnalysis: true,
      },
      'work/packages/active-gap.md',
      {phase: 'pre-impl', contractDir: dir},
    );
    t.equal(errors.length, 0, 'no proven route => no constraint');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('only fires at pre-impl', (t) => {
    const dir = contractDirWithProvenRoute();
    const errors = validateModelProvenRouteForcing(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'architecture-gap-analysis', architectureGapAnalysis: true,
      },
      'work/packages/active-gap.md',
      {phase: 'closure', contractDir: dir},
    );
    t.equal(errors.length, 0, 'closure phase exempt');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
