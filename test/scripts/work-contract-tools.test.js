import tap from 'tap';
import path from 'node:path';

import {validateDecisionTables} from '../../scripts/check-decision-tables.js';
import {validateStatecharts} from '../../scripts/check-statecharts.js';
import {validateSystemContracts} from '../../scripts/work-contract-check.js';
import {buildPackageContent} from '../../scripts/work-package-new.js';

const CONTRACT_FILES = [
  'architecture/contracts/active-gate-convergence.md',
  'architecture/contracts/package-lifecycle.md',
  'architecture/contracts/rolling-restart-rebalancer-handoff.md',
].map((filePath) => path.resolve(filePath));

const DECISION_TABLE_FILES = [
  'docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json',
].map((filePath) => path.resolve(filePath));

const STATECHART_FILES = [
  'docs/specs/statecharts/package-lifecycle.json',
].map((filePath) => path.resolve(filePath));

tap.test('system contract records validate against real bindings', (t) => {
  const result = validateSystemContracts(CONTRACT_FILES);
  t.same(result.errors, []);
  t.equal(result.checkedFiles.length, CONTRACT_FILES.length);
  t.end();
});

tap.test('decision tables prove complete single-outcome coverage', (t) => {
  const result = validateDecisionTables(DECISION_TABLE_FILES);
  t.same(result.errors, []);
  t.equal(result.checkedFiles.length, DECISION_TABLE_FILES.length);
  t.end();
});

tap.test('statecharts validate legal lifecycle transitions', (t) => {
  const result = validateStatecharts(STATECHART_FILES);
  t.same(result.errors, []);
  t.equal(result.checkedFiles.length, STATECHART_FILES.length);
  t.end();
});

tap.test('package generator binds system contract and modelTheory metadata', async (t) => {
  const content = await buildPackageContent({
    'title': 'Generated Contract Package',
    'slug': 'generated-contract-package',
    'lane': 'runtime-owner-boundary',
    'owner': 'operation_workflow_owner',
    'boundary': 'rebalancer_handoff',
    'dominant-reason': 'priority_recovery_event_driven_wait',
    'next-action': 'verify generated contract binding',
    'write-scope': [
      'src/rebalancer/operation-workflow-owner-ports.js',
    ],
    'proof': [
      'falsifier: npm run model:decision-tables',
      'regression: npm run work:contract:check',
    ],
    'system-contract-ref':
      'architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff',
    'model-theory-artifact':
      'docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json',
    'model-theory-property':
      ['every route evidence combination emits one canonical action'],
    'model-theory-assumption': ['none'],
  });

  t.match(
    content,
    '"linkedSystemTheoryRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff"',
  );
  t.match(
    content,
    '"systemContractRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff"',
  );
  t.match(content, '## System Contract Binding');
  t.match(content, '## Model Theory');
  t.match(
    content,
    '"executableArtifact": "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json"',
  );
});
