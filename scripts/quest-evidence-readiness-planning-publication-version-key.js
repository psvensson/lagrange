// Deterministic evidence harness for the
// readiness-planning-publication-version-key quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/readiness-planning-publication-version-key.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting a
// claim, so a regression that flips a witness red flips this receipt to fail
// and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test, so each scenario is
// independently selectable with --test-name-pattern by its anchored name.
//
// On HEAD (f8e161599, before the cure) the version-key-equals-removed-veto-
// matrix, version-key-names-probe-unavailable-state,
// version-key-carries-generation-and-publication, stable-epoch-burst-builds-
// once, epoch-advance-rebuilds-once, moved-publication-never-served-from-memo,
// merge-memo-shares-one-version-key and witness-deterministic receipts are RED:
// planning freshness there is probe-derived (a live publication epoch/status
// VETO applied after the key comparison had already passed), so there is no
// version key to derive, store or compare, and the memo entry carries a raw
// probe snapshot instead.
//
// formation-shaped-build-rate-at-pre-change-bound is GREEN on HEAD and must
// stay green. It is the control, not the cure: key equality is exactly as
// strong as the veto it replaces, so the measured heavy planning build rate is
// unchanged by construction. Its bound (1724 heavy planning builds = 344.8/s,
// and 824 publications winner reads, over a 1000-call formation-shaped churn
// on a virtual clock) is the PRE-change measurement, so a cure that raises the
// rate is rejected. Read together with budgets-and-cadence-unchanged, these
// two receipts are the "no cadence, budget or rate movement" control pair.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/control-plane/readiness-planning-publication-version-key.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and a red receipt is honest
// (its scenario exits non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'version-key-equals-removed-veto-matrix',
    command: scenarioCommand('^version-key-equals-removed-veto-matrix'),
    detail: 'over all 25 ordered pairs of publication states (epoch 2/3 x ' +
      'PUBLISHED/ACKNOWLEDGING plus no-membership-row), key inequality ' +
      'agrees with the removed live epoch/status veto on every pair, and is ' +
      'never weaker: the veto predicate is restored verbatim in the witness ' +
      'as the equivalence oracle',
  }),
  Object.freeze({
    id: 'version-key-carries-generation-and-publication',
    command: scenarioCommand(
      '^version-key-carries-generation-and-publication',
    ),
    detail: 'the memo version key is a frozen {sourceGeneration, ' +
      'publicationComponent} record carrying both the floored planning ' +
      'generation and the live publication (epoch, status); a rotated ' +
      'generation fails the key even while the publication holds, and the ' +
      'probe-unavailable service state renders one named component instead ' +
      'of a raw null',
  }),
  Object.freeze({
    id: 'stable-epoch-burst-builds-once',
    command: scenarioCommand('^stable-epoch-burst-builds-once'),
    detail: '40 consecutive routing calls under a stable publication and a ' +
      'stable planning generation perform exactly ONE heavy projection ' +
      'build and return that same frozen projection identity every time',
  }),
  Object.freeze({
    id: 'epoch-advance-rebuilds-once',
    command: scenarioCommand('^epoch-advance-rebuilds-once'),
    detail: 'a publication epoch advance rebuilds exactly once, the rebuilt ' +
      'projection carries the advanced epoch, and the post-advance entry is ' +
      'then served with no further rebuild; the sibling scenario ' +
      'status-transition-rebuilds-once pins the same bound for a status ' +
      'transition inside one epoch',
  }),
  Object.freeze({
    id: 'multi-node-interleave-no-cross-caller-thrash',
    command: scenarioCommand('^multi-node-interleave-no-cross-caller-thrash'),
    detail: 'five publisher nodes interleaved over 40 calls build once each ' +
      'and never invalidate one another: the memo slot is keyed per ' +
      'publisher and every publisher derives the same cluster-winner ' +
      'publication component (requireNodeInclusion false), so the shared ' +
      'component cannot become a cross-caller thrash dimension',
  }),
  Object.freeze({
    id: 'moved-publication-never-served-from-memo',
    command: scenarioCommand('^moved-publication-never-served-from-memo'),
    detail: 'the correctness negative: for all 20 ordered pairs of DISTINCT ' +
      'publication states, a projection derived under the stored state is ' +
      'NEVER served after the live (epoch, status) moves — each pair forces ' +
      'a rebuild through the real memo',
  }),
  Object.freeze({
    id: 'merge-memo-shares-one-version-key',
    command: scenarioCommand('^merge-memo-shares-one-version-key'),
    detail: 'the CL-034 merge memo ' +
      '(resolveMemoizedMembershipPublicationPlanningSnapshotSync) is ' +
      'governed by the same version key with byte-identical reuse and ' +
      'invalidation semantics: stable publication serves, an epoch advance ' +
      're-merges once, and a planning-source generation change re-merges ' +
      'independently of the publication component',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'CONTROL (green on HEAD, must stay green): the floored planning ' +
      'generation still invalidates both memos, the 15s wall-time stale ' +
      'grace bound is unchanged for the projection memo and the merge memo, ' +
      'and the grace is still read from the owner-configured budget — no ' +
      'budget, cadence or scheduler value moves',
  }),
  Object.freeze({
    id: 'formation-shaped-build-rate-at-pre-change-bound',
    command: scenarioCommand(
      '^formation-shaped-build-rate-at-pre-change-bound',
    ),
    detail: 'CONTROL (green on HEAD, must stay green): a 1000-call ' +
      'formation-shaped churn on a virtual clock through the real ' +
      'ControlPlaneReadinessService owner build measures 1724 heavy ' +
      'planning builds (344.8/s) and 824 publications winner reads, the ' +
      'pre-change values — the key fold is rate-neutral by construction and ' +
      'must never raise either count',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical drives of the formation-shaped sequence produce ' +
      'identical heavy build and publication read counts, and two identical ' +
      'memo drives produce the identical build sequence',
  }),
]);

const QUEST_ID = 'readiness-planning-publication-version-key';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'readiness-planning-publication-version-key.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
