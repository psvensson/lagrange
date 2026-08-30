// Deterministic evidence harness for the
// readiness-planning-snapshot-identity-owner quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/readiness-planning-snapshot-identity-owner.receipt.json).
// Each receipt re-executes one focused witness scenario rather than trusting a
// claim, so a regression that flips a witness red flips this receipt to fail
// and the quest's doneWhen cannot close on stale green evidence.
//
// Receipt honesty: the witness file uses raw node:test with anchored top-level
// names, so each scenario is independently selectable with
// --test-name-pattern. No tap shim is involved and the flag is NOT inert.
//
// RED ON HEAD (before the cure): stable-inputs-burst-returns-one-canonical-
// identity, version-key-change-mints-one-fresh-identity,
// source-generation-change-mints-a-fresh-identity,
// identical-counter-cache-swap-drops-the-canonical-identity,
// canonical-identity-retains-no-back-reference and
// formation-shaped-build-rate-after-identity-owner. On HEAD the canonical
// planning snapshot has no identity owner: every producer that re-normalises an
// already-canonical snapshot mints a fresh byte-equal object, so no burst can
// share one identity, no entry exists to inspect, and the measured rate is
// 344.8 heavy planning builds/s rather than 162.4.
//
// GREEN ON HEAD and must stay green: renormalisation-is-a-byte-identical-
// fixed-point, renormalisation-fixed-point-holds-across-the-whole-rig,
// identity-observable-preserved, membership-owner-swap-drops-the-canonical-
// identity, budgets-and-cadence-unchanged and witness-deterministic. The two
// fixed-point receipts are the LICENCE for the cure, not the cure: they hold on
// HEAD because re-normalisation was always content-neutral — the cure only
// stops it minting a new object. The other four are the controls.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/control-plane/readiness-planning-snapshot-identity-owner.test.js';
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
    id: 'renormalisation-is-a-byte-identical-fixed-point',
    command: scenarioCommand(
      '^renormalisation-is-a-byte-identical-fixed-point',
    ),
    detail: 'the LICENCE for the cure: over every publication state a winner ' +
      'row can take (epoch 2/3 x PUBLISHED/ACKNOWLEDGING plus ' +
      'no-membership-row), a FORCED rebuild of an already-canonical planning ' +
      'snapshot is byte-identical to that snapshot — so serving the same ' +
      'object can never present content a rebuild would not have produced',
  }),
  Object.freeze({
    id: 'renormalisation-fixed-point-holds-across-the-whole-rig',
    command: scenarioCommand(
      '^renormalisation-fixed-point-holds-across-the-whole-rig',
    ),
    detail: 'the same claim measured on the production-composition path ' +
      'rather than a directed matrix: every re-normalisation the ' +
      'formation-shaped owner-build sequence performs is byte-identical to ' +
      'its input, with the identity owner forced off so the rebuild runs',
  }),
  Object.freeze({
    id: 'stable-inputs-burst-returns-one-canonical-identity',
    command: scenarioCommand(
      '^stable-inputs-burst-returns-one-canonical-identity',
    ),
    detail: '40 consecutive re-normalisations of one canonical planning ' +
      'snapshot through the REAL owner return that same frozen object and ' +
      'rebuild nothing at all; on HEAD each call mints a fresh byte-equal ' +
      'identity that defeats every downstream identity memo',
  }),
  Object.freeze({
    id: 'version-key-change-mints-one-fresh-identity',
    command: scenarioCommand('^version-key-change-mints-one-fresh-identity'),
    detail: 'the freshness negative: a publications winner that advances ' +
      'WITHOUT a system-table write — the case the floored generation cannot ' +
      'see — still mints a FRESH planning-answer identity through ' +
      'getPriorityRecoveryPlanningAnswerSync and rebuilds exactly once, then ' +
      'holds; the identity owner never absorbs a version-key-forced miss',
  }),
  Object.freeze({
    id: 'source-generation-change-mints-a-fresh-identity',
    command: scenarioCommand(
      '^source-generation-change-mints-a-fresh-identity',
    ),
    detail: 'a source-table write observed in the next floored generation ' +
      're-projects the same canonical snapshot to a fresh identity exactly ' +
      'once, and that new identity is itself the fixed point of the new ' +
      'window: identity rotation tracks the generation, not the call count',
  }),
  Object.freeze({
    id: 'identity-observable-preserved',
    command: scenarioCommand('^identity-observable-preserved'),
    detail: 'CONTROL (green on HEAD, must stay green): the sealed ' +
      'projection-planning identity observable, driven against the ' +
      'production-composition owner — a stable publication row keeps the ' +
      'memoized answer despite a candidate proposing the NEXT epoch, and a ' +
      'genuine publication-row advance still rebuilds immediately',
  }),
  Object.freeze({
    id: 'identical-counter-cache-swap-drops-the-canonical-identity',
    command: scenarioCommand(
      '^identical-counter-cache-swap-drops-the-canonical-identity',
    ),
    detail: 'the staleness negative: a replacement system-table cache ' +
      'presenting IDENTICAL table mutation counters is not separable by the ' +
      'floored generation, so a snapshot retained across the swap must ' +
      're-derive — it does, exactly once, and the retained object is still ' +
      'frozen and unmutated',
  }),
  Object.freeze({
    id: 'canonical-identity-retains-no-back-reference',
    command: scenarioCommand('^canonical-identity-retains-no-back-reference'),
    detail: 'the retention bound: identity entries live in a WeakMap and the ' +
      'SELF entry holds no reference back to its own key, so an entry can ' +
      'never pin the snapshot it describes and retention is bounded by the ' +
      'lifetime of the snapshots themselves',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'CONTROL (green on HEAD, must stay green): the readiness ' +
      'planning drain queue still carries maxConcurrency 1, ' +
      'maxItemsPerDrain 1 and its macrotask-class scheduler; the shipped ' +
      '250ms generation refresh floor — not a new cadence — bounds identity ' +
      'reuse; and the identity owner and the planning memos read ONE ' +
      'generation component. No budget, cadence or scheduler value moves',
  }),
  Object.freeze({
    id: 'formation-shaped-build-rate-after-identity-owner',
    command: scenarioCommand(
      '^formation-shaped-build-rate-after-identity-owner',
    ),
    detail: 'the MEASURED rate claim: the identical 1000-call ' +
      'formation-shaped churn on a virtual clock through the real ' +
      'ControlPlaneReadinessService owner build falls from 1724 heavy ' +
      'planning builds (344.8/s, within 3% of the 355/s measured on the ' +
      'failing five-node GCP seed) to 812 (162.4/s), a 52.9% cut, while ' +
      'publications winner reads stay at 824 — the identity owner adds no ' +
      'read',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'CONTROL: two identical drives of the formation-shaped sequence ' +
      'produce identical heavy build and publications winner read counts, ' +
      'and two identical fixed-point audits produce the identical result',
  }),
]);

const QUEST_ID = 'readiness-planning-snapshot-identity-owner';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'readiness-planning-snapshot-identity-owner.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
