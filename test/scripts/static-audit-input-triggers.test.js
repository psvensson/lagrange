// Which static audits a push owes, decided from the proof-obligation
// registry (gate-work-consolidation). The rule that matters is the one that
// keeps the registry honest: skipping is admissible ONLY when every changed
// path is declared by some obligation, so an undeclared path or an empty
// range runs everything. Under-running is the failure this registry must
// never cause; over-running costs minutes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {
  COMPOSITE_SUBTASKS,
  PRIORITY_AUDIT_SCRIPTS,
  PROOF_OBLIGATIONS_JSON_SCHEMA,
  SERIAL_FIRST_AUDIT_SCRIPTS,
  STATIC_AUDIT_SCRIPTS,
  auditIsOwed,
  inputMatches,
  loadProofObligationsRegistry,
  skippingIsAdmissible,
  validateProofObligationsSchema,
} from '../../scripts/checks/run-static-audits.js';
import {
  logicalOwnerAndAmbiguitySummary,
} from '../../scripts/generate-global-owner-debt-inventory.js';

const REGISTRY_PATH = 'test/manifests/proof-obligations.json';
const UTF8 = 'utf8';

function registry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, UTF8));
}

function inputsByCommand() {
  const byCommand = new Map();
  for (const obligation of registry().obligations) {
    byCommand.set(obligation.command, {
      inputs: obligation.inputs,
      wholeTree: obligation.wholeTree === true,
    });
  }
  return byCommand;
}

function owedFor(changedPaths) {
  const byCommand = inputsByCommand();
  const maySkip = skippingIsAdmissible(changedPaths, byCommand);
  const owed = [];
  for (const [command, obligation] of byCommand) {
    if (maySkip && !auditIsOwed(obligation, changedPaths)) continue;
    owed.push(command);
  }
  return {maySkip, owed, total: byCommand.size};
}

test('a directory pattern matches by path segment, an exact one by path', () => {
  assert.equal(inputMatches('src/**', 'src/raft/log.js'), true);
  assert.equal(inputMatches('src/**', 'srcfile.js'), false,
    'a prefix without the separator is a different path');
  assert.equal(inputMatches('package.json', 'package.json'), true);
  assert.equal(inputMatches('package.json', 'package-lock.json'), false);
});

test('an undeclared changed path runs every audit', () => {
  const undeclared = owedFor(['.github/workflows/ci.yml', 'RELEASE.md']);
  assert.equal(undeclared.maySkip, false,
    'the registry cannot speak for a path no obligation declares');
  assert.equal(undeclared.owed.length, undeclared.total);
});

test('an empty range runs every audit: a stale base is not an unchanged tree', () => {
  for (const range of [[], null]) {
    const verdict = owedFor(range);
    assert.equal(verdict.maySkip, false);
    assert.equal(verdict.owed.length, verdict.total);
  }
});

test('a declared change skips only the audits that do not govern it', () => {
  const docs = owedFor(['CLAUDE.md']);
  assert.equal(docs.maySkip, true);
  assert.ok(docs.owed.length < docs.total, 'something is skipped');
  for (const command of ['npm run audit:doc-audience',
    'npm run audit:documentation-current']) {
    assert.ok(docs.owed.includes(command),
      `${command} governs CLAUDE.md and must run`);
  }
  assert.ok(!docs.owed.includes('npm run test:deps'),
    'a dependency graph audit owes nothing to a documentation change');
});

test('a source change still owes the source audits', () => {
  const source = owedFor(['src/raft/raft-rs-operation-port.js']);
  for (const command of ['npm run audit:file-size', 'npm run test:complexity',
    'npm run test:deps', 'npm run audit:guidelines']) {
    assert.ok(source.owed.includes(command), `${command} governs src/`);
  }
});

test('a whole-tree grep is never skipped, whatever the change', () => {
  // check-no-kiro-refs and check-no-legacy-naming grep every tracked file, so
  // no input list could be complete for them; the quest-note push is the
  // repository's commonest shape and used to skip them.
  for (const changed of [['solve/quests/x/log.ndjson'], ['architecture/x.md'],
    ['charts/lagrange-node/values.yaml'], ['CLAUDE.md']]) {
    const verdict = owedFor(changed);
    for (const command of ['npm run audit:no-kiro',
      'npm run audit:no-legacy-naming']) {
      assert.ok(verdict.owed.includes(command),
        `${command} greps the tree and must run for ${changed[0]}`);
    }
  }
});

test('an audit whose scan roots exceed its declaration is owed for those roots', () => {
  for (const [changed, command] of [
    [['solve/quests/x/log.ndjson'], 'npm run audit:documentation-current'],
    [['architecture/x.md'], 'npm run audit:documentation-current'],
    [['solve/specs/x/design.md'], 'npm run audit:roadmap-authority'],
    // The registry's contract owners are not all under src/: two live in
    // architecture/ and one under wit/, and the audit checks every owner path
    // exists, so a moved model must not slip through on an architecture-only
    // push.
    [['architecture/models/alloy/x.als'], 'npm run audit:impact-contracts'],
    [['wit/x.wit'], 'npm run audit:impact-contracts'],
    [['solve/quests/x/quest.json'], 'npm run audit:roadmap-authority'],
  ]) {
    assert.ok(owedFor(changed).owed.includes(command),
      `${command} scans ${changed[0]} and must run for it`);
  }
});

test('every obligation declares the checkers directory, because a checker decides what it proves', () => {
  for (const obligation of registry().obligations) {
    assert.ok(obligation.inputs.includes('scripts/**'),
      `${obligation.command} must re-run when its own implementation changes`);
  }
});

test('proof-obligations.json validates against PROOF_OBLIGATIONS_JSON_SCHEMA and drives static audit configuration', () => {
  const data = registry();
  assert.equal(PROOF_OBLIGATIONS_JSON_SCHEMA.additionalProperties, false);
  assert.equal(validateProofObligationsSchema(data), true);
  assert.equal(validateProofObligationsSchema({...data, extraTopField: true}), false);
  const loaded = loadProofObligationsRegistry();
  assert.equal(STATIC_AUDIT_SCRIPTS.length, 23);
  assert.deepEqual(loaded.staticAuditScripts, STATIC_AUDIT_SCRIPTS);
  assert.deepEqual(SERIAL_FIRST_AUDIT_SCRIPTS, ['steering:check']);
  assert.ok(PRIORITY_AUDIT_SCRIPTS.includes('test:unused:prod'));
  assert.ok(PRIORITY_AUDIT_SCRIPTS.includes('test:deps'));
  assert.ok(PRIORITY_AUDIT_SCRIPTS.includes('test:complexity'));
  assert.ok(PRIORITY_AUDIT_SCRIPTS.includes('test:complexity:cognitive'));
  assert.equal(COMPOSITE_SUBTASKS['audit:guidelines'].length, 9);
  assert.equal(COMPOSITE_SUBTASKS['test:metrics'].length, 4);
});

test('logicalOwnerAndAmbiguitySummary aggregates logical-owner footprint and unowned source fallbacks', () => {
  const summary = logicalOwnerAndAmbiguitySummary([
    {
      key: 'semantic:priority_recovery_owner/priority_recovery_snapshot_projection',
      owner: 'priority_recovery_owner',
      boundary: 'priority_recovery_snapshot_projection',
      classification: 'declared-owner-rule',
      ownerAreas: ['src/control-plane'],
      fileCount: 2,
      signalCount: 4,
      complexity: 2,
      cognitive: 1,
      oversizedFiles: 1,
      duplicatedLines: 0,
      cycleGroups: 0,
      lintExclusions: 0,
      importIn: 5,
      importOut: 3,
      score: 28,
      topPaths: ['src/control-plane/priority-recovery-snapshot.js'],
    },
    {
      key: 'semantic:priority_recovery_owner/priority_recovery_observation_snapshot',
      owner: 'priority_recovery_owner',
      boundary: 'priority_recovery_observation_snapshot',
      classification: 'declared-owner-rule',
      ownerAreas: ['src/control-plane'],
      fileCount: 1,
      signalCount: 1,
      complexity: 1,
      cognitive: 0,
      oversizedFiles: 0,
      duplicatedLines: 0,
      cycleGroups: 0,
      lintExclusions: 0,
      importIn: 2,
      importOut: 1,
      score: 4,
      topPaths: ['src/control-plane/priority-recovery-observation-snapshot.js'],
    },
    {
      key: 'area:src/raft',
      owner: null,
      boundary: 'src/raft',
      classification: 'owner-area-fallback',
      ownerAreas: ['src/raft'],
      fileCount: 3,
      signalCount: 5,
      complexity: 3,
      cognitive: 2,
      oversizedFiles: 0,
      duplicatedLines: 10,
      cycleGroups: 0,
      lintExclusions: 0,
      importIn: 8,
      importOut: 4,
      score: 29,
      topPaths: ['src/raft/log.js'],
    },
  ]);
  assert.equal(summary.declaredLogicalOwnerCount, 1);
  assert.equal(summary.multiBoundaryLogicalOwnerCount, 1);
  assert.equal(summary.declaredOwnerFileCount, 3);
  assert.equal(summary.declaredOwnerSignalCount, 5);
  assert.equal(summary.declaredOwnerScore, 32);
  assert.equal(summary.logicalOwners[0].owner, 'priority_recovery_owner');
  assert.equal(summary.logicalOwners[0].boundaryCount, 2);
  assert.equal(summary.contractAmbiguity.unownedSourceBoundaryCount, 1);
  assert.equal(summary.contractAmbiguity.unownedSourceFileCount, 3);
  assert.equal(summary.contractAmbiguity.unownedSourceSignalCount, 5);
  assert.equal(summary.contractAmbiguity.unownedSourceScore, 29);
});
