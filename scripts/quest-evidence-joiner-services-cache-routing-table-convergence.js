// Deterministic evidence harness for the
// joiner-services-cache-routing-table-convergence quest: receipt declarations only.
// The shared runtime (scripts/quest-evidence-harness-runtime.js) re-runs each
// recorded proof command and writes the test-receipt probe artifact
// (solve/evidence/joiner-services-cache-routing-table-convergence.receipt.json).
//
// Receipt honesty (the witness file uses the repo tap shim, so
// --test-name-pattern is inert: every receipt command runs the WHOLE witness
// file and a green receipt means the whole file passed, which includes the
// named scenario — the ids name what the file proves, not an independently
// selected test): on HEAD (before the cure) the steady-state defer tick
// re-reads only control_plane_publications, so the
// late-services-row-converges-after-one-shot-hydration,
// steady-state-hydration-covers-routing-tables and
// propagated-sweep-never-throws receipts are RED; the two publications-scoped
// controls (variant-D convergence and its rate limit) are green on HEAD and
// must stay green — a cure that turns them red is rejected.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/control-plane/membership-publication-deferred-catchup.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario. The witness file uses the repo tap
// shim, so --test-name-pattern is inert: each command runs the whole file and a
// green receipt means the whole witness passed, which includes the named scenario.
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'late-services-row-converges-after-one-shot-hydration',
    command: scenarioCommand('^late-services-row-converges'),
    detail: 'a services row inserted after the joiner\'s one-shot CL-014 ' +
      'hydration whose leader fan-out update was dropped converges on the ' +
      'steady-state defer tick (the witnessed tbl-d915-p1 leader row)',
  }),
  Object.freeze({
    id: 'steady-state-hydration-covers-routing-tables',
    command: scenarioCommand('^steady-state-hydration-covers-routing-tables'),
    detail: 'the sibling sweep asks for the routing-relevant CDC-propagated ' +
      'tables (services, partitions, nodes, message_groups, tables, ' +
      'node_endpoints) with one attempt per table and the catch-up default ' +
      'local-first/owner-fallback read policy (never the publications pin); ' +
      'unbounded-growth tables are unreachable by construction',
  }),
  Object.freeze({
    id: 'propagated-sweep-never-throws',
    command: scenarioCommand('^propagated-sweep-never-throws'),
    detail: 'a rejected authoritative read fails soft: the defer path is ' +
      'unaffected and the sweep returns null',
  }),
  Object.freeze({
    id: 'publications-catchup-unchanged',
    command: scenarioCommand('^CL-001 variant D: a deferring non-write-leader'),
    detail: 'the variant-D publications convergence through the real defer ' +
      'path, the real CL-014 hydrate and the real cache merge is unchanged',
  }),
  Object.freeze({
    id: 'publications-cooldown-and-pin-unchanged',
    command: scenarioCommand('^CL-001 variant D: the deferred catch-up is'),
    detail: 'the publications sweep keeps its 5000 ms cooldown, its exact ' +
      'single-table scope and its owner-RPC leader-pinned authority token',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: NODE_TEST_COMMAND_PREFIX + WITNESS_TEST,
    detail: 'the whole witness file re-runs with the identical outcome (no ' +
      'clock, ordering or cooldown-boundary dependence)',
  }),
]);

const QUEST_ID = 'joiner-services-cache-routing-table-convergence';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'joiner-services-cache-routing-table-convergence.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
