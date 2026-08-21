import fs from 'node:fs';
import path from 'node:path';

import tap from 'tap';

import {
  classifyDebtPath,
  duplicationReportIdentity,
  globPatternToRegex,
  logicalJsonIdentity,
  reconcileAssignments,
  validateInventory,
} from '../../scripts/generate-global-owner-debt-inventory.js';

const ROOT = process.cwd();
const INVENTORY_PATH = path.join(
  ROOT,
  'solve/changes/global-owner-debt-inventory/inventory.json',
);
const EXPECTED_LANES = new Set(['m2', 'm3', 'm4c']);
const inventoryProjection = Promise.resolve(
  JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8')),
);

tap.test('global owner-debt inventory reconciles every existing authority', async (t) => {
  const inventory = await inventoryProjection;
  const {reconciliation, assignment, signalCounts, summary} = inventory;

  t.equal(reconciliation.complexity.declaredCount,
    reconciliation.complexity.observedCount);
  t.equal(reconciliation.complexity.observedCount,
    reconciliation.complexity.assignedCount);
  t.equal(reconciliation.cognitive.declaredCount,
    reconciliation.cognitive.observedCount);
  t.equal(reconciliation.cognitive.observedCount,
    reconciliation.cognitive.assignedCount);
  t.equal(reconciliation.fileSize.observedCount,
    reconciliation.fileSize.assignedCount);
  t.equal(reconciliation.cycles.observedCount,
    reconciliation.cycles.assignedCount);
  t.equal(reconciliation.lintExclusions.observedCount,
    reconciliation.lintExclusions.assignedCount);
  t.equal(assignment.sourceSignalCount, assignment.assignedSignalCount);
  t.equal(assignment.assignedSignalCount, assignment.uniqueAssignmentCount);
  t.ok(signalCounts.complexity > 1000, 'real cyclomatic debt is engaged');
  t.ok(signalCounts.cognitive > 100, 'real cognitive debt is engaged');
  t.ok(signalCounts.duplication > 100, 'real duplication debt is engaged');
  t.ok(summary.filesWithDebt > 1000, 'the repository-wide surface is engaged');
  t.ok(reconciliation.importGraph.moduleCount > 3000,
    'the complete import graph is engaged');
  t.ok(reconciliation.importGraph.edgeCount > 10000,
    'real import edges are counted');

  for (const target of reconciliation.duplication) {
    t.equal(target.sourceCloneTouches,
      target.cloneGroups * target.touchMultiplicity);
    t.equal(target.sourceDuplicatedLineTouches,
      target.duplicatedLines * target.touchMultiplicity);
  }
});

tap.test('rankings distinguish declared semantic owners from honest fallbacks', async (t) => {
  const inventory = await inventoryProjection;
  const semantic = inventory.rankedBoundaries.filter((entry) =>
    entry.classification === 'declared-owner-rule');
  const fallback = inventory.rankedBoundaries.filter((entry) =>
    entry.classification !== 'declared-owner-rule');

  t.ok(semantic.length > 10, 'existing owner rules classify semantic boundaries');
  t.ok(semantic.every((entry) => entry.owner && entry.boundary));
  t.ok(fallback.every((entry) => entry.owner === null),
    'area fallbacks never invent a runtime owner');
  t.same(classifyDebtPath(
    'src/rebalancer/rebalance-coordinator-operation-creation.js'), {
    key: 'semantic:rebalancer_coordinator_owner/replica_operation_coordination',
    owner: 'rebalancer_coordinator_owner',
    boundary: 'replica_operation_coordination',
    classification: 'declared-owner-rule',
    ownerArea: 'src/rebalancer',
  });
  t.equal(classifyDebtPath('src/cache/system-table-cache.js').owner, null,
    'an unmapped source area is explicit rather than fabricated');
});

tap.test('the exact child batch is bounded, unique, and executable by contract', async (t) => {
  const inventory = await inventoryProjection;
  const batch = inventory.childQuestBatch;
  const ids = batch.quests.map((quest) => quest.questId);

  t.equal(batch.sealed, true);
  t.equal(new Set(ids).size, ids.length);
  t.equal(ids.length, inventory.summary.childQuestCount);
  t.same(new Set(batch.quests.map((quest) => quest.lane)), EXPECTED_LANES);
  for (const quest of batch.quests) {
    t.match(quest.exactScenarioCommand,
      new RegExp(`^node scripts/run-${quest.questId}-scenarios\\.js$`, 'u'));
    t.ok(quest.pathscope.length > 2);
    t.ok(quest.pathscope.length <= batch.limits.pathCount);
    t.ok(quest.ownerAreas.length <= batch.limits.ownerAreas);
    t.ok(quest.pathscope.includes(`solve/quests/${quest.questId}.json`));
    t.ok(quest.pathscope.includes(`scripts/run-${quest.questId}-scenarios.js`));
    t.ok(quest.baseline.complexity + quest.baseline.cognitive +
      quest.baseline.oversizedFiles + quest.baseline.duplicatedLines +
      quest.baseline.lintExclusions > 0);
    if (quest.lane === 'm4c') {
      t.ok(quest.engagementPaths.length > 0);
      t.ok(quest.engagementPaths.every((file) => quest.pathscope.includes(file)));
      t.equal(quest.engagementTargets.length, quest.engagementPaths.length);
      t.ok(quest.engagementTargets.every((target) =>
        target.structuralScore > 0 && quest.pathscope.includes(target.path)));
    }
  }
});

tap.test('missing, duplicate, unknown, and unowned assignments fail closed', (t) => {
  const signals = [{id: 'signal-a'}, {id: 'signal-b'}];
  const valid = [
    {id: 'signal-a', boundaryKey: 'owner/a'},
    {id: 'signal-b', boundaryKey: 'owner/b'},
  ];
  t.equal(reconcileAssignments(signals, valid).uniqueAssignmentCount, 2);
  t.throws(() => reconcileAssignments(signals, valid.slice(0, 1)),
    /unassigned/u);
  t.throws(() => reconcileAssignments(signals, [...valid, valid[0]]),
    /assigned more than once/u);
  t.throws(() => reconcileAssignments(signals,
    [...valid, {id: 'signal-c', boundaryKey: 'owner/c'}]), /unknown signal/u);
  t.throws(() => reconcileAssignments(signals,
    [{id: 'signal-a', boundaryKey: ''}, valid[1]]), /missing a boundary/u);
  t.end();
});

tap.test('source-count and child-batch tampering fails validation', async (t) => {
  const inventory = await inventoryProjection;
  const countTamper = structuredClone(inventory);
  countTamper.reconciliation.complexity.declaredCount += 1;
  t.throws(() => validateInventory(countTamper), /reconciliation failed/u);

  const batchTamper = structuredClone(inventory);
  batchTamper.childQuestBatch.quests = [];
  t.throws(() => validateInventory(batchTamper), /reconciliation failed/u);
});

tap.test('lint exclusion glob matching is literal and bounded', (t) => {
  const matcher = globPatternToRegex('test/**/*-part-*.js');
  t.equal(matcher.test('test/rebalancer/example-part-2.js'), true);
  t.equal(matcher.test('test/example-part-2.js'), true);
  t.equal(matcher.test('src/rebalancer/example-part-2.js'), false);
  t.equal(matcher.test('test/rebalancer/example-tail-2.js'), false);
  t.end();
});

tap.test('volatile checker timestamps do not change logical identities', (t) => {
  const first = duplicationReportIdentity('report.json', {
    duplicates: [{firstFile: {start: 1}}],
    statistics: {detectionDate: 'first', total: {clones: 2, sources: 10}},
  });
  const second = duplicationReportIdentity('report.json', {
    duplicates: [{firstFile: {start: 99}}],
    statistics: {
      total: {sources: 10, clones: 2},
      detectionDate: 'second',
    },
  });
  const reordered = duplicationReportIdentity('report.json', {
    statistics: {
      detectionDate: 'third',
      total: {clones: 2, sources: 10},
    },
    duplicates: [],
  });
  t.equal(first.sha256, second.sha256);
  t.equal(second.sha256, reordered.sha256);
  t.same(first.ignoredFields, ['duplicates', 'statistics.detectionDate']);
  t.equal(logicalJsonIdentity('report.json', {value: 1}).identityKind,
    'logical-json');
  t.end();
});

tap.test('checked-in inventory is internally valid and readable', async (t) => {
  const inventory = await inventoryProjection;
  t.ok(fs.existsSync(INVENTORY_PATH));
  t.same(validateInventory(structuredClone(inventory)), inventory);
});
