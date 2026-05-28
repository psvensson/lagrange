import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import {parsePackageFile, filterAndSummarizeHistory, renderTextHistory} from '../../scripts/work-frontier-history.js';

tap.test('work-frontier-history unit tests', async (t) => {
  t.test('parsePackageFile extracts correct fields from package markdown', (t) => {
    const dummyPackagePath = path.resolve('test/scripts/dummy-pkg-frontier-history.md');
    const dummyContent = `
<!-- work-package
{
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "lightweight-maintenance",
    "owner": "test_owner",
    "boundary": "test_boundary",
    "artifact": "test-artifact.json"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "matched",
    "observedMovement": "summary movement",
    "successorReason": "summary outcome",
    "nextOwnerBoundary": "next_owner / next_boundary",
    "evidenceArtifact": "summary-artifact.json"
  }
}
-->

## Mechanism Card
- Failure mechanism: transition_gap
- Expected movement: 1/8 to 2/8
- Negative result means: rollback
`;
    fs.writeFileSync(dummyPackagePath, dummyContent, 'utf8');

    const parsed = parsePackageFile(dummyPackagePath);
    t.ok(parsed, 'Successfully parsed package file');
    t.equal(parsed.status, 'done');
    t.equal(parsed.owner, 'test_owner');
    t.equal(parsed.boundary, 'test_boundary');
    t.equal(parsed.artifact, 'summary-artifact.json');
    t.equal(parsed.failureMechanism, 'transition_gap');
    t.equal(parsed.expectedMovement, 'summary movement');
    t.equal(parsed.outcome, 'summary outcome');
    t.equal(parsed.resultClassification, 'reduced');
    t.equal(parsed.predictionAccuracy, 'matched');
    t.equal(parsed.nextOwnerBoundary, 'next_owner / next_boundary');

    fs.unlinkSync(dummyPackagePath);
    t.end();
  });

  t.test('filterAndSummarizeHistory filters, sorts, and limits packages', (t) => {
    const packages = [
      {
        fileName: 'done-20260528-early.md',
        dateStr: '20260528',
        status: 'done',
        title: 'early',
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
        artifact: 'artifact-20260528T130000Z.report.json',
        failureMechanism: 'transition_gap',
        expectedMovement: 'movement1',
        outcome: 'outcome1',
        resultClassification: 'reduced',
        predictionAccuracy: 'matched',
        nextOwnerBoundary: 'owner1 / boundary1',
      },
      {
        fileName: 'done-20260528-late.md',
        dateStr: '20260528',
        status: 'done',
        title: 'late',
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
        artifact: 'artifact-20260528T150137Z.report.json',
        failureMechanism: 'transition_gap',
        expectedMovement: 'movement3',
        outcome: 'outcome3',
        resultClassification: 'migrated',
        predictionAccuracy: 'partial',
        nextOwnerBoundary: 'owner3 / boundary3',
      },
      {
        fileName: 'done-20260525-second.md',
        dateStr: '20260525',
        status: 'done',
        title: 'second',
        owner: 'other_owner',
        boundary: 'snapshot_coverage',
        artifact: 'artifact2',
        failureMechanism: 'transition_gap',
        expectedMovement: 'movement2',
        outcome: 'outcome2',
        resultClassification: 'same-frontier',
        predictionAccuracy: 'missed',
        nextOwnerBoundary: 'owner2 / boundary2',
      },
    ];

    const history = filterAndSummarizeHistory(packages, 'startup_active_gate_owner', 'snapshot_coverage', 2);
    t.equal(history.length, 2, 'Owner filter applied correctly');
    t.equal(history[0].package, 'done-20260528-late.md', 'Same-day artifact timestamp sorts first');
    t.equal(history[1].package, 'done-20260528-early.md', 'Earlier same-day artifact sorts second');
    t.end();
  });

  t.test('renderTextHistory produces expected format', (t) => {
    const history = [
      {
        package: 'done-20260520-first.md',
        title: 'first',
        status: 'done',
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
        artifact: 'artifact1',
        failureMechanism: 'transition_gap',
        expectedMovement: 'movement1',
        outcome: 'outcome1',
        resultClassification: 'reduced',
        predictionAccuracy: 'matched',
        nextOwnerBoundary: 'next_owner / next_boundary',
      },
    ];
    const rendered = renderTextHistory(history, 'startup_active_gate_owner', 'snapshot_coverage');
    t.match(rendered, 'FRONTIER HISTORY: startup_active_gate_owner / snapshot_coverage');
    t.match(rendered, 'Package: done-20260520-first.md [done]');
    t.match(rendered, 'Mechanism Class: transition_gap');
    t.match(rendered, 'Result Classification: reduced');
    t.match(rendered, 'Prediction Accuracy: matched');
    t.match(rendered, 'Next Owner / Boundary: next_owner / next_boundary');
    t.end();
  });
});
