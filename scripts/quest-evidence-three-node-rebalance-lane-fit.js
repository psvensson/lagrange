// Deterministic evidence harness for the three-node-rebalance-lane-fit quest:
// receipt declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command verbatim and writes the test-receipt probe artifact
// (solve/evidence/three-node-rebalance-lane-fit.receipt.json).
//
// Measured defect (idle 20-core host, file run standalone in its own lane):
// test/integration/three-node-seed-rebalance.integration.test.js fails with
// `node3 join timed out after 12000ms` — 4/4 standalone runs on the branch tip
// plus the recorded attribution (HEAD 6/6, base 833ef1685 5/6, origin/main
// 1/2). The file is ALREADY the serial lane's work: primary class `integration`
// maps to the exclusive resource class (jobs=1) in
// scripts/run-classified-test-files.js, so lane starvation is excluded by
// construction — the red is intrinsic, not co-scheduling.
//
// The avoidable term cured here, measured from the file's own join phase
// telemetry: the join-time priority-placement formation barrier slept out the
// FULL production 5s discovery window on every join before reaching the same
// `bypassed_insufficient_formation_cohort` answer, because a three-node
// cluster can never reach the operation ledger's initial replica count. Cured
// through the barrier's EXISTING config seam, the way TEST_CONFIG already
// compresses election and leadership waits. No test cap was widened and no
// production default moved.
//
// Measured, paired, standalone runs on an idle 20-core host:
//
//   before (5000ms window)   node2 barrier 5062-5210ms  join  9118-9779ms
//                            node3 barrier 5515-6727ms  join 12441-14212ms
//   after  (500ms window)    node2 barrier  811- 935ms  join  3796-4855ms
//                            node3 barrier 2394-3489ms  join 12971-14748ms
//
// So the compression is real for node2 (-4.4s per join, ~-10s of file wall
// clock) and does NOT move node3: node3's barrier was sleeping through cluster
// convergence its join has to wait for anyway, so its join stays convergence-
// bound at 12.4-14.7s against the UNCHANGED 12000ms READY_TIMEOUT_MS. That
// residual is an owner budget/convergence decision, deliberately NOT hidden by
// a widened cap.
//
// Post-cure standalone pass rate: 2/10 (0/10 before). The release blocker is
// therefore NOT cleared by this quest's cure, and the integration receipt
// below stays red on purpose.
//
// Red-before-the-fix receipts: three-node-seed-rebalance-integration-green,
// integration-assertions-unchanged and
// closed-log-commit-slice-stops-without-no-durable-progress.
// Green before AND after (controls that must stay green — a cure that turns
// one red is rejected): configured-discovery-window-bounds-the-unengaged-
// bypass, default-discovery-window-unchanged,
// engaged-cohort-still-latches-under-a-compressed-window and
// witness-deterministic.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const BARRIER_WITNESS_TEST =
  'test/bootstrap/join-formation-discovery-window-budget.test.js';
const INTEGRATION_TEST =
  'test/integration/three-node-seed-rebalance.integration.test.js';
const RAFT_WITNESS_TEST = 'test/raft/liferaft-catchup-batching.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';
const CLASSIFIED_RUNNER_PREFIX = 'npm run test:file -- ';
// The integration file dumps its whole info-level cluster log on a red
// run, which overruns the receipt runner's capture buffer; discarding
// stdout keeps the receipt's verdict the child's exit status.
const DISCARD_STDOUT_SUFFIX = ' >/dev/null';
const INTEGRATION_TIMEOUT_MS = 300_000;

// One verbatim proof command per scenario. node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so a
// green receipt is honest (its scenario exits 0) and a red receipt is honest
// (its scenario exits non-zero).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + BARRIER_WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'three-node-seed-rebalance-integration-green',
    command: CLASSIFIED_RUNNER_PREFIX + INTEGRATION_TEST +
      DISCARD_STDOUT_SUFFIX,
    timeoutMs: INTEGRATION_TIMEOUT_MS,
    detail: 'the release-gate file itself, run through the same classified ' +
      'runner npm run test:ci uses (primary integration -> exclusive lane, ' +
      'jobs=1). This receipt is DELIBERATELY still red at 8/10 standalone ' +
      'runs (0/10 before the cure): the cure removed the barrier sleep but ' +
      'node3\'s join is convergence-bound above the UNCHANGED 12000ms ' +
      'READY_TIMEOUT_MS, so the quest cannot close green until an owner ' +
      'decides the budget or the convergence latency. It is kept in the ' +
      'harness so no stale green can be claimed for the release gate',
  }),
  Object.freeze({
    id: 'configured-discovery-window-bounds-the-unengaged-bypass',
    command: scenarioCommand(
      '^configured-discovery-window-bounds-the-unengaged-bypass',
    ),
    detail: 'the REAL barrier loop on a virtual clock proves the mechanism: ' +
      'an unengaged cohort reaches the identical two-state ' +
      'waiting_for_formation_cohort -> bypassed_insufficient_formation_cohort ' +
      'answer under the production window and under the compressed one, and ' +
      'the configured window bounds the bypass instant exactly, so the whole ' +
      'saving is sleep the barrier no longer performs rather than a decision ' +
      'it no longer makes',
  }),
  Object.freeze({
    id: 'default-discovery-window-unchanged',
    command: scenarioCommand('^default-discovery-window-unchanged'),
    detail: 'control: the production joining budgets ' +
      '(priorityPlacementFormationDiscoveryMs 5000, PollMs 500, TimeoutMs ' +
      '120000) are untouched — the compression lives only in the test\'s own ' +
      'join config',
  }),
  Object.freeze({
    id: 'engaged-cohort-still-latches-under-a-compressed-window',
    command: scenarioCommand(
      '^engaged-cohort-still-latches-under-a-compressed-window',
    ),
    detail: 'control: a genuinely sufficient formation cohort still latches ' +
      'the barrier and waits for the readiness owner\'s startup authority ' +
      'past the compressed discovery window, so compression can never skip ' +
      'a real barrier',
  }),
  Object.freeze({
    id: 'integration-assertions-unchanged',
    command: scenarioCommand('^integration-assertions-unchanged'),
    detail: 'control on the cured file: the exact ordered set of nine ' +
      'assertion messages is unchanged and the assertion count matches, ' +
      'READY_TIMEOUT_MS is still 12000 and TEST_TIMEOUT_MS still 120000 (no ' +
      'cap was widened), both joiners carry the compressed discovery ' +
      'window as a named constant, and the joins still inherit the shared ' +
      'harness bootstrap config',
  }),
  Object.freeze({
    id: 'closed-log-commit-slice-stops-without-no-durable-progress',
    command: CLASSIFIED_RUNNER_PREFIX + RAFT_WITNESS_TEST,
    detail: 'the second observed failure signature of the same file: a log ' +
      'adapter closed by teardown under an already-queued commit slice ' +
      'answers an empty slice, which the scheduler read as a stalled apply ' +
      'loop and threw — escaping as a detached unhandledRejection that TAP ' +
      'charges to the running test. A closed log now stops the loop, while ' +
      'an OPEN log answering an empty slice still fails closed with the ' +
      'unchanged no-durable-progress guard',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'two identical virtual-clock drives of the real barrier loop ' +
      'produce the identical release instant and state sequence, so the ' +
      'mechanism receipts above are reproducible rather than sampled',
  }),
]);

const QUEST_ID = 'three-node-rebalance-lane-fit';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'three-node-rebalance-lane-fit.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
