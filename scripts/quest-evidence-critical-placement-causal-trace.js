// Deterministic evidence harness for the critical-placement-causal-trace
// quest (S6a): receipt declarations only. The live three-node trace runs
// ONCE through the classified runner (first receipt) and regenerates
// solve/report/critical-placement-causal-trace-live.json; the trace-shape
// receipts then validate the artifact THAT RUN just produced, so a stale
// artifact can never satisfy them. The classifier and divergence-probe
// receipts anchor top-level node:test scenarios by name, one each.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const CLASSIFIER_WITNESS_TEST =
  'test/bootstrap/critical-placement-trace-classifier.test.js';
const DIVERGENCE_PROBE_TEST =
  'test/rebalancer/planner-target-authority-divergence-probe.test.js';
const LIVE_TRACE_TEST =
  'test/integration/critical-replica-placement-causal-trace.integration.test.js';
const TRACE_ARTIFACT =
  'solve/report/critical-placement-causal-trace-live.json';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';
const CLASSIFIED_RUNNER_PREFIX = 'npm run test:file -- ';
// The integration file dumps its whole cluster log on a red run, which
// overruns the receipt runner's capture buffer; discarding stdout keeps the
// receipt's verdict the child's exit status.
const DISCARD_STDOUT_SUFFIX = ' >/dev/null';
const INTEGRATION_TIMEOUT_MS = 360_000;

function scenarioCommand(scenarioPattern, witnessFile) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + witnessFile;
}

function artifactValidator(expression) {
  return `node -e "const a=require('./${TRACE_ARTIFACT}'); ${expression}"`;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'fresh-formation-critical-baseline-measured',
    command: CLASSIFIED_RUNNER_PREFIX + LIVE_TRACE_TEST +
      DISCARD_STDOUT_SUFFIX,
    timeoutMs: INTEGRATION_TIMEOUT_MS,
    detail: 'the LIVE RUN: a real three-node in-process formation through ' +
      'the production join path, whose fresh-formation subtest asserts the ' +
      'whole declared critical set is inspected with zero unknown policy ' +
      'partitions, and which regenerates the trace artifact every receipt ' +
      'below validates - a stale artifact cannot satisfy this bar',
  }),
  Object.freeze({
    id: 'one-critical-partition-traced-stage-by-stage',
    command: artifactValidator(
      'const c=a.critical;' +
      'if(!c||c.sampleCount<3)throw new Error(\'undersampled\');' +
      'if(c.stages.length!==9)throw new Error(\'stage table incomplete\');' +
      'for(const s of c.stages){if(!s.owner)throw new Error(s.stage)}'),
    detail: 'the traced critical partition (chosen from the measured ' +
      'baseline, never by habit) carries a nine-stage table, each stage ' +
      'with reached/first-reached-at/owner, sampled repeatedly on one clock',
  }),
  Object.freeze({
    id: 'ordinary-control-traced-beside-critical',
    command: artifactValidator(
      'const c=a.control;' +
      'if(!c||c.sampleCount<3)throw new Error(\'undersampled\');' +
      'if(!a.comparison||!a.comparison.shape)' +
      'throw new Error(\'comparison unresolved\');'),
    detail: 'a real user table created through the production engine is ' +
      'traced beside the critical lane on the same clock, and the A/B ' +
      'comparison resolves one of the declared diagnostic shapes ' +
      '(both_complete / common_stage_stall / critical_stops_earlier / ...)',
  }),
  Object.freeze({
    id: 'first-missing-transition-named-with-owner-and-predicate',
    command: artifactValidator(
      'const ans=a.firstMissingTransitionAnswer;' +
      'if(!ans||!ans.finding)throw new Error(\'no terminal answer\');' +
      'if(ans.finding!==\'all-transitions-complete\'&&!ans.owner)' +
      'throw new Error(\'missing transition without owner\');' +
      'if(!ans.predicate||typeof ans.predicate.sampleCount!==\'number\')' +
      'throw new Error(\'answer without measured predicate\');'),
    detail: 'the terminal deliverable is brutally specific: the named first ' +
      'missing transition with its owning module AND the measured predicate ' +
      '(the observed absence of any add-like ledger row across the sampled ' +
      'budget, the hold-engagement timeline shape - stated as run facts ' +
      'because hold engagement is run-dependent - and the active probe ' +
      'outcome), or the explicit all-transitions-complete finding',
  }),
  Object.freeze({
    id: 'planner-target-authority-divergence-probe',
    command: scenarioCommand('^planner-target-authority-divergence-probe',
      DIVERGENCE_PROBE_TEST),
    detail: 'the two authorities forced apart (persisted replica_count 5, ' +
      'table-policy fallback 3): the REAL TablePolicyService reads and ' +
      'discards the authoritative row, and the REAL planner then emits NO ' +
      'spread-restoring move for a partition the authority proves two ' +
      'replicas short with free active nodes available, while the agreeing ' +
      'control (persisted 3) is genuinely at target. The S6b wedge, ' +
      'witnessed with no behaviour change',
  }),
  Object.freeze({
    id: 'trace-changes-no-behaviour',
    command: scenarioCommand('^trace-changes-no-behaviour',
      CLASSIFIER_WITNESS_TEST),
    detail: 'S6a repairs nothing: the candidate carries no src/ delta - the ' +
      'trace lives in test/ and scripts/ and reads persisted evidence only',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic',
      CLASSIFIER_WITNESS_TEST),
    detail: 'the live run is timing-dependent; the CLASSIFIER is not: ' +
      'replayed fixtures produce byte-identical stage tables and the ' +
      'nine-stage vocabulary is pinned, with the stall-at-every-depth and ' +
      'flapping-tail scenarios red on any first-missing rewrite',
  }),
]);

const QUEST_ID = 'critical-placement-causal-trace';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'critical-placement-causal-trace.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
