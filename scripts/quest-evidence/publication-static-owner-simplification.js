#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const questId = 'publication-static-owner-simplification';
const metricChecks = [
  {id: 'cyclomatic-ratchet', command: 'npm run test:complexity',
    detail: 'Actual src/test function complexity count respects the accepted limit.'},
  {id: 'cognitive-ratchet', command: 'npm run test:complexity:cognitive',
    detail: 'Actual src/scripts cognitive complexity count respects the accepted limit.'},
];
const PUBLIC_CONTROL_DETAIL =
  'Existing public owner and discriminating refusal/output controls.';
const publicControls = [
  ['invariant-controls', 'test/scripts/model-invariants.test.js'],
  ['decision-table-controls', 'test/scripts/model-contract-tools.test.js'],
  ['trace-controls', 'test/scripts/check-owner-traces.test.js'],
  ['tooling-evidence-controls', 'test/scripts/agent-tooling-evidence.test.js'],
  ['failure-report-controls', 'test/distributed/harness/__tests__/failure-bundle.test.js'],
  ['serialization-failure-controls', 'test/distributed/harness/__tests__/failure-bundle-fallback.test.js'],
];
runQuestEvidenceHarness({
  questId,
  outputFile: `solve/quests/${questId}/evidence/receipt.json`,
  receipts: [
    ...metricChecks,
    ...publicControls.map(([id, testFile]) => ({
      id, testFile, detail: PUBLIC_CONTROL_DETAIL,
    })),
  ],
});
