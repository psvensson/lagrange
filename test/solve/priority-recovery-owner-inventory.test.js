import fs from 'node:fs';
import path from 'node:path';

import tap from 'tap';

import {buildInventory} from
  '../../scripts/generate-priority-recovery-owner-inventory.js';

const ROOT = process.cwd();

tap.test('production priority/publication recovery graph is completely inventoried', async (t) => {
  const inventory = await buildInventory(ROOT);
  t.ok(inventory.metrics.moduleCount > 50, 'production target surface engaged');
  t.equal(inventory.modules.length, inventory.metrics.moduleCount);
  t.equal(new Set(inventory.modules.map((module) => module.path)).size,
    inventory.metrics.moduleCount, 'every target has one classification');
  t.equal(inventory.closure.uniqueClassificationRate, 1);
  t.equal(inventory.closure.unparsedImportEdgeCount, 0);
  t.equal(inventory.unparsedImportEdges.length, 0);
  t.ok(inventory.metrics.importEdgeCount > inventory.metrics.moduleCount,
    'real production imports parsed');
  t.same(new Set(inventory.modules.map((module) => module.layer)), new Set([
    'raw_observation',
    'canonical_snapshot_reducer',
    'owner_decision',
    'consumer_presentation',
  ]));
  for (const module of inventory.modules) {
    t.match(module.path,
      /(?:priority-recovery|publication-recovery|recovery-protocol-publication)/u);
    t.ok(module.owner);
    t.ok(module.rationale);
  }
});

tap.test('edges, exports, SCCs, and bounded proposals reconcile', async (t) => {
  const inventory = await buildInventory(ROOT);
  t.equal(inventory.edges.length, inventory.metrics.importEdgeCount);
  t.equal(inventory.modules.reduce((sum, module) =>
    sum + module.exports.length, 0), inventory.metrics.publicExportCount);
  t.equal(inventory.stronglyConnectedComponents.flat().length,
    inventory.metrics.moduleCount, 'SCC partition covers every module');
  t.equal(inventory.stronglyConnectedComponents[0].length,
    inventory.metrics.largestStronglyConnectedComponent);
  t.equal(inventory.closure.proposedDirectionAcyclic, true);
  t.equal(inventory.closure.candidatesUseOneOwnerBoundary, true);
  t.equal(inventory.duplicateAuthorities.length,
    inventory.metrics.duplicateAuthoritySignalCount);
  t.equal(inventory.duplicateAuthorities.filter((item) =>
    item.confirmedDuplicateImplementation).length,
  inventory.metrics.confirmedDuplicateAuthorityCount);
  t.equal(inventory.migrationCandidates.length,
    inventory.metrics.migrationCandidateCount);
  t.equal(inventory.candidateSelection.threshold, 0.7);
  t.equal(inventory.modules.find((module) => module.path.endsWith(
    'priority-recovery-snapshot-actuation.js'))?.layer, 'owner_decision');
  t.equal(inventory.modules.find((module) => module.path.endsWith(
    'publication-recovery-state-machine.js'))?.layer, 'owner_decision');
  t.equal(inventory.closure.proposedDirectionAcyclic,
    inventory.metrics.largestStronglyConnectedComponent === 1,
    'acyclicity is derived from the production graph');
  for (const duplicate of inventory.duplicateAuthorities) {
    t.equal(duplicate.implementations.length, duplicate.modules.length);
    t.ok(duplicate.implementations.every((item) => item.implementationSha256));
  }
  for (const candidate of inventory.migrationCandidates) {
    t.ok(candidate.questId);
    t.ok(candidate.exactScenarioCommand);
    t.ok(candidate.reportPredicate);
    t.ok(candidate.engagementWitness);
    t.ok(candidate.pathscope.length > 1);
    t.ok(candidate.ownerAreas.length <= 2);
    t.same(candidate.verifierTemplates,
      ['recovery-replay.md', 'harness-fidelity.md']);
    t.ok(candidate.pathscope.every((file) => candidate.ownerAreas.includes(
      inventory.modules.find((module) => module.path === file)?.owner,
    )), 'candidate has exactly one owner boundary');
  }
});

tap.test('checked-in inventory is a fresh deterministic projection', async (t) => {
  const expected = await buildInventory(ROOT);
  const file = path.join(ROOT,
    'solve/changes/priority-recovery-owner-inventory/inventory.json');
  t.ok(fs.existsSync(file), 'durable inventory exists');
  t.same(JSON.parse(fs.readFileSync(file, 'utf8')), expected);
});
