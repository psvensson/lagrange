import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import {parsePackageFile, summarizeLessons, renderTextSummary} from '../../scripts/work-negative-learning.js';

tap.test('work-negative-learning unit tests', async (t) => {
  t.test('parsePackageFile extracts correct fields from package markdown', (t) => {
    const dummyPackagePath = path.resolve('test/scripts/dummy-pkg-negative-learning.md');
    const dummyContent = `
<!-- work-package
{
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "lightweight-maintenance",
    "owner": "test_owner",
    "boundary": "test_boundary",
    "currentState": "Original state explanation here.",
    "nextAction": "Perform first task."
  }
}
-->

## Mechanism Card
- Failure mechanism: transition_gap
- Stable facts: stable invariants here
- Why not the alternatives: observation_gap
- Expected movement: 1/8 to 2/8
- Negative result means: rollback
`;
    fs.writeFileSync(dummyPackagePath, dummyContent, 'utf8');

    const parsed = parsePackageFile(dummyPackagePath);
    t.ok(parsed, 'Successfully parsed package file');
    t.equal(parsed.status, 'done');
    t.equal(parsed.owner, 'test_owner');
    t.equal(parsed.boundary, 'test_boundary');
    t.equal(parsed.currentState, 'Original state explanation here.');
    t.equal(parsed.whyNotAlternatives, 'observation_gap');
    t.equal(parsed.stableFacts, 'stable invariants here');
    t.equal(parsed.expectedMovement, '1/8 to 2/8');
    t.equal(parsed.negativeResultMeans, 'rollback');

    fs.unlinkSync(dummyPackagePath);
    t.end();
  });

  t.test('summarizeLessons filters, sorts, and limits packages', (t) => {
    const packages = [
      {
        fileName: 'done-20260520-first.md',
        dateStr: '20260520',
        status: 'done',
        title: 'first',
        lane: 'lightweight-maintenance',
        owner: 'owner1',
        boundary: 'boundary1',
        currentState: 'lesson 1',
        whyNotAlternatives: 'rejected 1',
        negativeResultMeans: 'means 1',
        stableFacts: 'facts 1',
        expectedMovement: 'movement 1',
      },
      {
        fileName: 'done-20260525-second.md',
        dateStr: '20260525',
        status: 'done',
        title: 'second',
        lane: 'lightweight-maintenance',
        owner: 'owner2',
        boundary: 'boundary2',
        currentState: 'lesson 2',
        whyNotAlternatives: 'rejected 2',
        negativeResultMeans: 'means 2',
        stableFacts: 'facts 2',
        expectedMovement: 'movement 2',
      },
    ];

    const lessons = summarizeLessons(packages, 1);
    t.equal(lessons.length, 1, 'Limit applied correctly');
    t.equal(lessons[0].package, 'done-20260525-second.md', 'Most recent package returned first');
    t.equal(lessons[0].ruledOutMechanisms, 'rejected 2; means 2');
    t.equal(lessons[0].invariantFacts, 'facts 2');
    t.equal(lessons[0].nextMechanismProposed, 'movement 2');
    t.end();
  });

  t.test('renderTextSummary produces expected format', (t) => {
    const lessons = [
      {
        package: 'done-20260525-second.md',
        title: 'second',
        status: 'done',
        owner: 'owner2',
        boundary: 'boundary2',
        lesson: 'lesson 2',
        ruledOutMechanisms: 'rejected 2; means 2',
        invariantFacts: 'facts 2',
        nextMechanismProposed: 'movement 2',
      },
    ];
    const rendered = renderTextSummary(lessons);
    t.match(rendered, 'NEGATIVE LEARNING SUMMARY');
    t.match(rendered, 'Package: done-20260525-second.md [done]');
    t.match(rendered, 'Ruled Out Mechanisms: rejected 2; means 2');
    t.end();
  });
});
