// Witnesses for critical-spread-overflow-disagreement-replay.
//
// The 2026-09-18 static reproduction produced the learner's refusal only from
// a synthetic input (a joiner node status the live logs do not show). These
// witnesses hold the replacement to a higher bar: the scenario is a committed
// fixture whose every entry cites a live log line, and the replay drives that
// sequence through the real owners on the simulator's node hosts.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {
  PROMOTION_OUTCOME,
  SCENARIO_DIRECTORY,
  extractCriticalSpreadScenario,
  readCriticalSpreadScenario,
  validateCriticalSpreadScenario,
} from './critical-spread-scenario-extraction.js';
import {
  REPLAY_OUTCOME,
  checksAtLiveCountRefusals,
  checksAtLiveGrants,
  plannerDecisionsFor,
  replayCriticalSpreadScenario,
} from './formation-sim-critical-spread-replay.js';

const FAIL_RUN_ID = '35052200699';
const PASS_RUN_ID = '34925405521';
const GUARD_INPUTS_SUFFIX = '.guard-inputs.json';
const RETENTION_DECISION = 'retain_spread_cure_adds';
const REQUIRED_DISTINCT_NODE_COUNT = 3;
const DECISIVE_GUARD_FIELDS = Object.freeze([
  'activeVoterCount', 'learnerCount', 'targetReplicaCount',
  'maxAllowedVotersAfterPromotion',
]);
const NO_GUARD_INPUT_FIXTURE =
  'no failing run with guard-input records is committed yet: ' +
  `${SCENARIO_DIRECTORY}/*${GUARD_INPUTS_SUFFIX} is empty, so the live ` +
  'inputs the learner-side count check decided on cannot be compared. ' +
  'learner-promotion-guard-inputs-observed must land and a failing nightly ' +
  'must run before this receipt can be measured.';
// The extractor is exercised against the live artifact tree only where that
// tree exists (the controller that downloaded the run). A checkout without it
// still gates the committed fixture, which is what the constraint binds.
const ARTIFACT_ROOT_ENV = 'LAGRANGE_FORMATION_ARTIFACT_ROOT';

function listGuardInputFixtures() {
  if (!fs.existsSync(SCENARIO_DIRECTORY)) return [];
  return fs.readdirSync(SCENARIO_DIRECTORY)
    .filter((name) => name.endsWith(GUARD_INPUTS_SUFFIX))
    .map((name) => path.join(SCENARIO_DIRECTORY, name));
}

function reExtractedScenario(runId) {
  const root = process.env[ARTIFACT_ROOT_ENV];
  if (!root) return null;
  const runDirectory = path.join(root, runId, `formation-health-${runId}`);
  if (!fs.existsSync(runDirectory)) return null;
  return extractCriticalSpreadScenario({runDirectory, runId});
}

test('scenario fixtures cite the run they came from', () => {
  for (const runId of [FAIL_RUN_ID, PASS_RUN_ID]) {
    const scenario = readCriticalSpreadScenario(runId);
    const verdict = validateCriticalSpreadScenario(scenario);
    assert.deepEqual(verdict.problems, [], `${runId} citations`);
    assert.equal(scenario.runId, runId);
    const reExtracted = reExtractedScenario(runId);
    if (reExtracted) {
      assert.deepEqual(reExtracted, scenario,
        `${runId} fixture is not what its artifacts extract to`);
    }
  }
  const failing = readCriticalSpreadScenario(FAIL_RUN_ID);
  assert.ok(
    failing.promotionAttempts.some((attempt) => attempt.countRefusal === true),
    'the failing scenario must carry the live count refusal it exists for');
  const passing = readCriticalSpreadScenario(PASS_RUN_ID);
  assert.ok(
    passing.promotionAttempts.some((attempt) =>
      attempt.outcome === PROMOTION_OUTCOME.GRANTED),
    'the passing scenario must carry the promotions live granted');
});

test('the seed planner retains the spread-cure add from replayed state',
  async () => {
    const scenario = readCriticalSpreadScenario(FAIL_RUN_ID);
    const {report} = await replayCriticalSpreadScenario({scenario});
    const partitionId = report.decisionPartitionId;
    assert.ok(partitionId, 'the scenario names no over-target spread cure');
    const live = scenario.plannerRetentions
      .find((entry) => entry.partitionId === partitionId);
    const decisions = plannerDecisionsFor(report, partitionId);
    const retained = decisions.find((entry) =>
      entry.decision === RETENTION_DECISION &&
      entry.activeVoterCount === live.targetReplicaCount + 1 &&
      entry.activeDistinctNodeCount < REQUIRED_DISTINCT_NODE_COUNT);
    assert.ok(retained,
      'the hosts planner never retained the spread-cure ADD for ' +
      `${partitionId} at ${live.activeVoterCount} voters on ` +
      `${live.activeDistinctNodeCount} nodes as run ${FAIL_RUN_ID} did ` +
      `(${live.citation.logTime}); it recorded ` +
      `${JSON.stringify(decisions)}`);
  });

test('the pass scenario grants every promotion live granted', async () => {
  const scenario = readCriticalSpreadScenario(PASS_RUN_ID);
  const {report} = await replayCriticalSpreadScenario({scenario});
  const checks = checksAtLiveGrants(report);
  assert.ok(checks.length > 0,
    `run ${PASS_RUN_ID} granted no priority promotion the replay reached`);
  const refused = checks
    .filter((check) => check.replayOutcome === REPLAY_OUTCOME.REFUSED)
    .map((check) => ({replicaId: check.replicaId, nodeId: check.nodeId,
      atSeconds: check.atSeconds, guardInputs: check.replayGuardInputs}));
  assert.deepEqual(refused, [],
    'the replay refused promotions the live pass granted');
});

test('the fail scenario refuses on the live guard inputs', async () => {
  const fixtures = listGuardInputFixtures();
  assert.ok(fixtures.length > 0, NO_GUARD_INPUT_FIXTURE);
  for (const file of fixtures) {
    const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
    const scenario = readCriticalSpreadScenario(recorded.runId);
    const {report} = await replayCriticalSpreadScenario({scenario});
    const checks = checksAtLiveCountRefusals(report);
    for (const record of recorded.guardInputs) {
      const check = checks.find((entry) =>
        entry.replicaId === record.replicaId &&
        entry.atSeconds === record.atSeconds);
      assert.ok(check,
        `the replay reached no check for ${record.replicaId} at ` +
        `+${record.atSeconds}s of run ${recorded.runId}`);
      assert.equal(check.replayOutcome, REPLAY_OUTCOME.REFUSED,
        `the replay admitted ${record.replicaId} where run ` +
        `${recorded.runId} refused it`);
      for (const field of DECISIVE_GUARD_FIELDS) {
        assert.equal(check.replayGuardInputs[field], record[field],
          `${record.replicaId}: ${field} differs from the live record`);
      }
    }
  }
});
