import tap from 'tap';
import path from 'node:path';

import {validateDecisionTables} from '../../scripts/check-decision-tables.js';
import {validateStatecharts} from '../../scripts/check-statecharts.js';
import {validateSystemContracts} from '../../scripts/check-system-contracts.js';

const CONTRACT_FILES = [
  'architecture/contracts/active-gate-convergence.md',
  'architecture/contracts/quest-lifecycle.md',
  'architecture/contracts/rolling-restart-rebalancer-handoff.md',
].map((filePath) => path.resolve(filePath));

const DECISION_TABLE_FILES = [
  'docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json',
].map((filePath) => path.resolve(filePath));

const STATECHART_FILES = [
  'docs/specs/statecharts/quest-lifecycle.json',
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
