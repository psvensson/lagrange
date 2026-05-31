import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {validateModelCoverageRequirement} from '../../scripts/work-tracker.js';

function closedPackage(dir, name, day, metricDelta, residualCount) {
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
      observablePrediction: {metricDelta},
      representativeResidual: {residualCount},
    }, null, 2)}\n-->\n`,
  );
}

function packageDirWithStall() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-coverage-'));
  closedPackage(dir, 'done-20260520-a.md', '20', 0, 7);
  closedPackage(dir, 'done-20260521-b.md', '21', 0, 7);
  closedPackage(dir, 'done-20260522-c.md', '22', 0, 7);
  return dir;
}

function emptyContractDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'model-coverage-contracts-'));
}

tap.test('model-coverage requirement (R16)', async (t) => {
  t.test('blocks an unmodelled runtime slice after repeated stall', (t) => {
    const dir = packageDirWithStall();
    const contractDir = emptyContractDir();
    const errors = validateModelCoverageRequirement(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {
        phase: 'pre-impl', packageDir: dir, contractDir,
        registryPath: path.join(contractDir, 'no-registry.json'),
      },
    );
    t.ok(
      errors.some((e) => e.includes('model-coverage-required')),
      'unmodelled slice blocked',
    );
    fs.rmSync(dir, {recursive: true, force: true});
    fs.rmSync(contractDir, {recursive: true, force: true});
    t.end();
  });

  t.test('exempts a model-building package', (t) => {
    const dir = packageDirWithStall();
    const contractDir = emptyContractDir();
    const errors = validateModelCoverageRequirement(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'model', modelTheory: true,
      },
      'work/packages/active-model.md',
      {
        phase: 'pre-impl', packageDir: dir, contractDir,
        registryPath: path.join(contractDir, 'no-registry.json'),
      },
    );
    t.equal(errors.length, 0, 'model-building package passes');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.rmSync(contractDir, {recursive: true, force: true});
    t.end();
  });

  t.test('exempts a pair already covered by a proven route', (t) => {
    const dir = packageDirWithStall();
    const contractDir = emptyContractDir();
    fs.writeFileSync(
      path.join(contractDir, 'pair.md'),
      `# c\n\n<!-- system-contract\n${JSON.stringify({
        schema: 'system-contract-record-v1',
        owner: 'owner_a', boundary: 'boundary_x',
        modelProvenRoutes: [
          {
            owner: 'owner_a', boundary: 'boundary_x', selectedLayer: 'observation',
            livenessHolds: true, evidenceArtifact: 'test-output/proof.json',
          },
        ],
      }, null, 2)}\n-->\n`,
    );
    const errors = validateModelCoverageRequirement(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {
        phase: 'pre-impl', packageDir: dir, contractDir,
        registryPath: path.join(contractDir, 'no-registry.json'),
      },
    );
    t.equal(errors.length, 0, 'model-covered pair passes');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.rmSync(contractDir, {recursive: true, force: true});
    t.end();
  });

  t.test('does not fire before the stall threshold', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-coverage-few-'));
    closedPackage(dir, 'done-20260520-a.md', '20', 0, 7);
    const contractDir = emptyContractDir();
    const errors = validateModelCoverageRequirement(
      {
        status: 'active', owner: 'owner_a', boundary: 'boundary_x',
        lane: 'runtime-owner-boundary',
      },
      'work/packages/active-runtime.md',
      {
        phase: 'pre-impl', packageDir: dir, contractDir,
        registryPath: path.join(contractDir, 'no-registry.json'),
      },
    );
    t.equal(errors.length, 0, 'below threshold => no constraint');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.rmSync(contractDir, {recursive: true, force: true});
    t.end();
  });
});
