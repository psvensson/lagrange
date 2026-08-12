import fs from 'node:fs';
import path from 'node:path';
import tap from 'tap';

import {auditQuest, commitGate} from '../../scripts/solve/audit.js';
import {landQuestWorkflow} from '../../scripts/solve/operator-workflow.js';
import {projectState} from '../../scripts/solve/store.js';
import {appendEvent, readLog} from '../../scripts/solve/store.js';
import {
  createCoupledPairFixture,
  removeCoupledPairFixture,
} from './coupled-pair-guard-fixture.js';

const SOURCE_AFTER = 'after';
const SOURCE_BEFORE = 'before';
const LEFT_SOURCE = 'scripts/left-a.js';
const LEFT_SIBLING_SOURCE = 'scripts/left-b.js';
const RIGHT_SOURCE = 'scripts/right.js';
const REVIEW_DIRECTORY = 'solve/state/reviews';
const REVIEW_REQUIRED_VERDICT = 'needs-review';
const OPEN_STATUS = 'open';
const ATTEMPT_EVENT = 'attempt';
const PROBLEM_SEPARATOR = '\n';
const PATH_SEPARATOR = ', ';
const ASSERTION = Object.freeze({
  diagnostic: 'audit exposes the exact registry defect',
  landBlocked: 'the registry defect blocks land',
  noReview: 'the terminal refusal happens before an immutable review is minted',
  splitCandidate:
    'the aggregate current diff cannot evade the pair by splitting attempts',
  splitAttribution:
    'the aggregate problem is attributed to its latest selected attempt',
  reverted: 'the terminal aggregate reflects current bytes, not reverted history',
  currentOpen: 'fresh doneWhen failure reopens the projected Quest state',
  commitBlocked: 'commit gate refuses historical terminal readiness',
  unfinishedProblem: 'commit refusal names the active unfinished state',
});
const TEST_NAME = Object.freeze({
  missingProof: 'missing pair proof hard-blocks land before review creation',
  registeredProof: 'registered pair proof admits review minting',
  nonCrossing: 'one endpoint and two files in the same endpoint do not trigger',
  split: 'split attempts are checked as one current candidate',
  invalidEdges: 'invalid registry edges hard-block land before review creation',
  missingRegistry:
    'one-file registry deletion hard-blocks land before review creation',
  reopened:
    'fresh doneWhen failure defeats historical terminal commit readiness',
  revert: 'a later revert removes stale historical pair pressure',
});
const REOPEN_EVENT = Object.freeze({
  type: 'evidence-ingested',
  probeScope: 'doneWhen',
  invalidSample: false,
  done: false,
  evidence: 'fresh-done-when-failure.json',
});

function coupledProblems(audit) {
  return audit.problems.filter((item) =>
    /^coupled[- ]pair /u.test(item.message));
}

function assertLandRefusedBeforeReview(t, fixture, diagnostic) {
  const messages = auditQuest(fixture.root, fixture.quest).problems
    .map((item) => item.message).join(PROBLEM_SEPARATOR);
  t.match(messages, diagnostic, ASSERTION.diagnostic);
  t.throws(
    () => landQuestWorkflow(fixture.root, {id: fixture.id}),
    /terminal audit has non-verification problems/isu,
    ASSERTION.landBlocked,
  );
  t.equal(
    fs.existsSync(path.join(fixture.root, REVIEW_DIRECTORY)),
    false,
    ASSERTION.noReview,
  );
}

tap.test(TEST_NAME.missingProof, (t) => {
  const fixture = createCoupledPairFixture({withContract: false});
  t.teardown(() => removeCoupledPairFixture(fixture));
  fixture.record({[LEFT_SOURCE]: SOURCE_AFTER, [RIGHT_SOURCE]: SOURCE_AFTER}, 0);

  assertLandRefusedBeforeReview(
    t,
    fixture,
    /coupled pair left-right references unknown contract: left-right-contract/u,
  );
  t.end();
});

tap.test(TEST_NAME.registeredProof, (t) => {
  const fixture = createCoupledPairFixture();
  t.teardown(() => removeCoupledPairFixture(fixture));
  fixture.record({[LEFT_SOURCE]: SOURCE_AFTER, [RIGHT_SOURCE]: SOURCE_AFTER}, 0);

  t.same(coupledProblems(auditQuest(fixture.root, fixture.quest)), []);
  const requested = landQuestWorkflow(fixture.root, {id: fixture.id});
  t.equal(requested.verdict, REVIEW_REQUIRED_VERDICT);
  t.match(requested.review.id, /^review-[0-9a-f]{24}$/u);
  t.end();
});

tap.test(TEST_NAME.nonCrossing, (t) => {
  for (const edits of [
    {[LEFT_SOURCE]: SOURCE_AFTER},
    {[LEFT_SOURCE]: SOURCE_AFTER, [LEFT_SIBLING_SOURCE]: SOURCE_AFTER},
  ]) {
    const fixture = createCoupledPairFixture();
    t.teardown(() => removeCoupledPairFixture(fixture));
    fixture.record(edits, 0);
    t.same(coupledProblems(auditQuest(fixture.root, fixture.quest)), [],
      `non-crossing edits stay admitted: ${Object.keys(edits).join(PATH_SEPARATOR)}`);
  }
  t.end();
});

tap.test(TEST_NAME.split, (t) => {
  const fixture = createCoupledPairFixture({withContract: false});
  t.teardown(() => removeCoupledPairFixture(fixture));
  fixture.record({[LEFT_SOURCE]: SOURCE_AFTER}, 1);
  fixture.record({[RIGHT_SOURCE]: SOURCE_AFTER}, 0);

  const [guardProblem] = coupledProblems(auditQuest(fixture.root, fixture.quest));
  const latestAttempt = [...readLog(fixture.root, fixture.id)].reverse()
    .find((event) => event.type === ATTEMPT_EVENT);
  t.ok(guardProblem, ASSERTION.splitCandidate);
  t.equal(guardProblem.ts, latestAttempt.ts, ASSERTION.splitAttribution);
  t.equal(guardProblem.frontier, latestAttempt.frontier);
  assertLandRefusedBeforeReview(
    t,
    fixture,
    /coupled pair left-right references unknown contract: left-right-contract/u,
  );
  t.end();
});

tap.test(TEST_NAME.invalidEdges, (t) => {
  const cases = [
    {
      name: 'malformed endpoints',
      mutate(manifest) {
        manifest.coupledPairs['left-right'].endpoints.length = 1;
      },
      diagnostic: /must declare exactly two endpoints/u,
    },
    {
      name: 'dead endpoint owner',
      mutate(manifest) {
        manifest.coupledPairs['left-right'].endpoints[1].owners =
          ['scripts/dead-right.js'];
      },
      diagnostic: /endpoint right owner has a dead path: scripts\/dead-right\.js/u,
    },
    {
      name: 'incomplete contract owner coverage',
      mutate(manifest) {
        manifest.contracts['left-right-contract'].owners =
          ['scripts/left-a.js', 'scripts/left-b.js'];
      },
      diagnostic: /endpoint right owner is not covered by contract/u,
    },
    {
      name: 'witness is not an exact contract test',
      mutate(manifest) {
        manifest.coupledPairs['left-right'].witnessTests =
          ['test/other-witness.test.js'];
      },
      diagnostic: /witness is not an exact test of contract/u,
    },
  ];
  for (const item of cases) {
    const fixture = createCoupledPairFixture();
    t.teardown(() => removeCoupledPairFixture(fixture));
    fixture.mutateRegistry(item.mutate);
    fixture.record(
      {[LEFT_SOURCE]: SOURCE_AFTER, [RIGHT_SOURCE]: SOURCE_AFTER},
      0,
    );
    assertLandRefusedBeforeReview(t, fixture, item.diagnostic);
    t.pass(item.name);
  }
  t.end();
});

tap.test(TEST_NAME.missingRegistry, (t) => {
  const fixture = createCoupledPairFixture();
  t.teardown(() => removeCoupledPairFixture(fixture));
  fixture.deleteRegistry();
  fixture.record({}, 0);

  assertLandRefusedBeforeReview(
    t,
    fixture,
    /missing impact contract registry: test\/shards\/impact-contracts\.json/u,
  );
  t.end();
});

tap.test(TEST_NAME.reopened, (t) => {
  const fixture = createCoupledPairFixture();
  t.teardown(() => removeCoupledPairFixture(fixture));
  fixture.record({[LEFT_SOURCE]: SOURCE_AFTER, [RIGHT_SOURCE]: SOURCE_AFTER}, 0);
  appendEvent(fixture.root, fixture.id, {
    ...REOPEN_EVENT,
    frontier: fixture.quest.frontiers[0].id,
  });

  const log = readLog(fixture.root, fixture.id);
  const state = projectState(fixture.quest, log);
  const gate = commitGate(fixture.root, fixture.quest);
  t.equal(state.questStatus, OPEN_STATUS, ASSERTION.currentOpen);
  t.equal(gate.ready, false, ASSERTION.commitBlocked);
  t.match(
    gate.problems.map((item) => item.message).join(PROBLEM_SEPARATOR),
    /quest has not finished/u,
    ASSERTION.unfinishedProblem,
  );
  t.end();
});

tap.test(TEST_NAME.revert, (t) => {
  const fixture = createCoupledPairFixture({withContract: false});
  t.teardown(() => removeCoupledPairFixture(fixture));
  fixture.record({[LEFT_SOURCE]: SOURCE_AFTER, [RIGHT_SOURCE]: SOURCE_AFTER}, 1);
  fixture.record({[LEFT_SOURCE]: SOURCE_BEFORE}, 0);

  t.same(coupledProblems(auditQuest(fixture.root, fixture.quest)), [],
    ASSERTION.reverted);
  t.end();
});
