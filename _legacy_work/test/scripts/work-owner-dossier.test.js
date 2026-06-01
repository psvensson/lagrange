import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {buildOwnerDossier} from '../../scripts/work-tracker.js';
import {main as dossierMain} from '../../scripts/work-owner-dossier.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-dossier-'));
  const packageDir = path.join(root, 'packages');
  const contractDir = path.join(root, 'contracts');
  fs.mkdirSync(packageDir);
  fs.mkdirSync(contractDir);
  const seq = [
    ['done-20260520-a.md', '20', 0, 5, 'theory-foo'],
    ['done-20260521-b.md', '21', 0, 5, 'theory-bar'],
    ['done-20260522-c.md', '22', 0, 5, 'theory-foo'],
  ];
  for (const [name, day, metricDelta, residualCount, ledger] of seq) {
    fs.writeFileSync(
      path.join(packageDir, name),
      `# t\n\n<!-- work-package\n${JSON.stringify({
        schema: 'work-package-v1', status: 'done', opened: `2026-05-${day}`,
        lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
        artifact: `test/output/${name}.json`,
        mechanismCard: {
          failureMechanism: 'observation_gap', expectedMovement: 'x',
          negativeResultMeans: 'y',
        },
        observablePrediction: {metricDelta},
        representativeResidual: {residualCount},
        theoryLedgerRefs: [ledger],
      }, null, 2)}\n-->\n`,
    );
  }
  fs.writeFileSync(
    path.join(contractDir, 'pair.md'),
    `# c\n\n<!-- system-contract\n${JSON.stringify({
      schema: 'system-contract-record-v1', owner: 'owner_a',
      boundary: 'boundary_x',
      modelProvenRoutes: [
        {
          owner: 'owner_a', boundary: 'boundary_x', selectedLayer: 'observation',
          livenessHolds: true, evidenceArtifact: 'test-output/proof.json',
        },
      ],
    }, null, 2)}\n-->\n`,
  );
  return {root, packageDir, contractDir};
}

tap.test('owner-dossier aggregation (R18)', async (t) => {
  t.test('reports proven model status and ledger trail', (t) => {
    const {root, packageDir, contractDir} = setup();
    const dossier = buildOwnerDossier('owner_a', 'boundary_x', {
      packageDir, contractDir,
      registryPath: path.join(contractDir, 'no-registry.json'),
    });
    t.equal(dossier.modelStatus, 'proven', 'proven via route');
    t.equal(dossier.currentResidual, 5, 'current residual from newest package');
    t.equal(dossier.contractRecord, 'architecture/contracts/pair.md',
      'contract record located');
    t.equal(dossier.provenRoutes.length, 1, 'proven route surfaced');
    t.same(
      [...dossier.ledgerRefs].sort(),
      ['theory-bar', 'theory-foo'],
      'deduplicated ledger trail',
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('locates contract records declared through owners array', (t) => {
    const {root, packageDir, contractDir} = setup();
    fs.writeFileSync(
      path.join(contractDir, 'coupled.md'),
      `# c\n\n<!-- system-contract\n${JSON.stringify({
        schema: 'system-contract-v1',
        owners: [
          {owner: 'owner_a', boundary: 'boundary_x'},
          {owner: 'owner_b', boundary: 'boundary_y'},
        ],
      }, null, 2)}\n-->\n`,
    );
    fs.writeFileSync(
      path.join(contractDir, 'owners-array.md'),
      `# c\n\n<!-- system-contract\n${JSON.stringify({
        schema: 'system-contract-v1',
        owners: [
          {owner: 'owner_b', boundary: 'boundary_y'},
        ],
      }, null, 2)}\n-->\n`,
    );
    const dossier = buildOwnerDossier('owner_b', 'boundary_y', {
      packageDir, contractDir,
      registryPath: path.join(contractDir, 'no-registry.json'),
    });
    t.equal(dossier.contractRecord, 'architecture/contracts/owners-array.md',
      'single-owner contract record preferred from owners array');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reports stalled status with no model coverage', (t) => {
    const {root, packageDir} = setup();
    const emptyContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-empty-'));
    const dossier = buildOwnerDossier('owner_a', 'boundary_x', {
      packageDir, contractDir: emptyContracts,
      registryPath: path.join(emptyContracts, 'no-registry.json'),
    });
    t.equal(dossier.modelStatus, 'stalled', 'stalled without a model');
    fs.rmSync(root, {recursive: true, force: true});
    fs.rmSync(emptyContracts, {recursive: true, force: true});
    t.end();
  });

  t.test('CLI requires owner and boundary', (t) => {
    const code = dossierMain(['node', 'work-owner-dossier.js', '--owner', 'x']);
    t.equal(code, 2, 'missing boundary exits non-zero');
    t.end();
  });

  t.test('CLI prints help', (t) => {
    const code = dossierMain(['node', 'work-owner-dossier.js', '--help']);
    t.equal(code, 0, 'help exits zero');
    t.end();
  });
});
