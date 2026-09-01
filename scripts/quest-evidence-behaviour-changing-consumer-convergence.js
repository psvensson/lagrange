// Deterministic evidence harness for the
// behaviour-changing-consumer-convergence quest (S1.1-B). The witnesses use
// raw node:test (not the repo tap shim), so the anchored runner selects
// exactly one scenario per receipt.
//
// SCOPE. Quest A (replication-target-authority-a2-contract-v3) proved the
// authority CONTRACT and its CREATION BOUNDARY. This quest proves the
// CONSUMER INVENTORY for the partition/message-group plane: the eleven
// behaviour-changing desired-RF consumers resolve their target through
// resolveDesiredReplicationFactor, an undeclared policy fails closed in each
// consumer's documented non-releasing direction, the recorded move-planner
// divergence is WITNESSED rather than silently repaired (S6b scope), and the
// hand-off recorded on A - the self-hosted message group persisting declared
// replica_count 3 where it once persisted the observed count 1 - is proved
// recovery-convergible.
//
// It makes NO service-plane claim. Service descriptors, the rebalancer
// replicaCount-to-policy path and the join-admission observed-count
// projection belong to the drafted
// service-plane-replication-authority-inventory quest. It also does not
// repair move-planner: constraint planner-exception-not-repaired seals that
// exception open and witnessed until S6b.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/bootstrap/behaviour-changing-consumer-convergence.test.js';
// NOT a bare `node --test --test-name-pattern` run. That exits 0 when the
// pattern matches NOTHING and reports `# tests 1 / # pass 1` (the file-level
// subtest), so a renamed or deleted scenario is indistinguishable from a
// passing one and every receipt in this file would be a shell. The runner
// requires the named top-level `ok <n> - <scenario>` TAP line.
const ANCHORED_RUNNER =
  'node test/bootstrap/run-anchored-scenario-helper.js ';
const SPACE = ' ';

function scenarioCommand(scenarioName, testFile = WITNESS_TEST) {
  return ANCHORED_RUNNER + testFile + SPACE + scenarioName;
}

// The one receipt that must NOT be graded by the runner alone. Every other
// receipt trusts the runner, so a neutered runner keeps them all green while
// the witness is genuinely red. The control drives a fixture file covering
// all three outcome classes and demands the runner's verdict on each, and
// additionally runs the witness directly with the runner out of the
// mediating position entirely.
const RUNNER_FIXTURES = 'test/bootstrap/anchored-runner-fixture-cases.js';
const FIXTURE_PASSES = 'anchored-runner-fixture-passes';
const FIXTURE_FAILS = 'anchored-runner-fixture-fails';
const FIXTURE_ABSENT = 'anchored-runner-fixture-absent-on-purpose';
const SHELL_IF = 'if ';
const SHELL_THEN_FAIL = '; then exit 1; fi; ';
const SHELL_AND = ' && ';

const WITNESS_ABSENT_PROBE = 'witness-absent-probe-that-does-not-exist';

function mustReject(scenarioName, testFile = RUNNER_FIXTURES) {
  return SHELL_IF + scenarioCommand(scenarioName, testFile) +
    SHELL_THEN_FAIL;
}

const WITNESS_DIRECT = 'node --test ' + WITNESS_TEST;

function runnerVerdictIsTrustworthy(scenarioName) {
  return mustReject(FIXTURE_FAILS) + mustReject(FIXTURE_ABSENT) +
    mustReject(WITNESS_ABSENT_PROBE, WITNESS_TEST) +
    scenarioCommand(FIXTURE_PASSES, RUNNER_FIXTURES) + SHELL_AND +
    WITNESS_DIRECT + SHELL_AND +
    scenarioCommand(scenarioName);
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'recovery-partition-target-resolves-through-authority',
    command: scenarioCommand(
      'recovery-partition-target-resolves-through-authority'),
    detail: 'the ACTING consumer with the largest blast radius: recovery ' +
      'CREATES replicas. Its partition targetCount was `replica_count || ' +
      'configured minimum`, so a config knob silently restated policy for ' +
      'every row the authority would refuse. The real ReplicaRecoveryService ' +
      'is driven over a mock cache and a captured control-plane gateway: a ' +
      'declared RF 5 with one healthy replica submits exactly four creation ' +
      'mutations and a declared RF 3 submits exactly two, so the number of ' +
      'replicas recovery mints is a function of the ROW, with identity state ' +
      'and configuration held fixed across both runs',
  }),
  Object.freeze({
    id: 'recovery-message-group-target-resolves-through-authority',
    command: scenarioCommand(
      'recovery-message-group-target-resolves-through-authority'),
    detail: 'the message-group half of the same consumer, which is the half ' +
      'the hand-off recorded on A makes behaviour-changing TODAY: the ' +
      'self-hosted group now persists replica_count 3, and recovery reads ' +
      'that column as its target. Same drive, same proof shape: declared RF ' +
      '5 with one healthy replica creates four, declared RF 3 creates two, ' +
      'through the real checkMessageGroupReplicas path and the captured ' +
      'gateway',
  }),
  Object.freeze({
    id: 'learner-promotion-target-resolves-through-authority',
    command: scenarioCommand(
      'learner-promotion-target-resolves-through-authority'),
    detail: 'promotion ADMITS voters against this target, and its removed ' +
      'ladder was the v2 verifier\'s named finding: getTargetReplicaCountFor' +
      'Promotion fell back to this.replicaCount - replicaIds.length, an ' +
      'IDENTITY-derived count - and then to a restated default, so a ' +
      'promotion could be admitted against a target no declaration stated. ' +
      'The borrowed method now decodes 5 and 3 from the cached row alone, ' +
      'and the poisoned-context probe is the sharp edge: a context carrying ' +
      'a contradictory identity replicaCount of 7 with a declared row of 3 ' +
      'must answer 3',
  }),
  Object.freeze({
    id: 'split-workflow-target-resolves-through-authority',
    command: scenarioCommand('split-workflow-target-resolves-through-authority'),
    detail: 'the split provisions NEW partitions, so its replica count is a ' +
      'policy act. executeInternal is driven to the calculateQuorumReplica' +
      'Count call with a sentinel capturing its argument: a source row ' +
      'declaring 5 hands 5 and a row declaring 3 hands 3, with the previous ' +
      'DEFAULT_QUORUM_REPLICA_COUNT import removed from the workflow and the ' +
      'constant de-exported from its bindings module',
  }),
  Object.freeze({
    id: 'merge-workflow-target-resolves-through-authority',
    command: scenarioCommand('merge-workflow-target-resolves-through-authority'),
    detail: 'the merge sibling, same shape: the merged partition\'s replica ' +
      'count follows the authority decode of the LEFT source row - 5 hands 5, ' +
      '3 hands 3 - captured at the same quorum-count decision point',
  }),
  Object.freeze({
    id: 'table-reconciliation-target-resolves-through-authority',
    command: scenarioCommand(
      'table-reconciliation-target-resolves-through-authority'),
    detail: 'the CREATE TABLE IF NOT EXISTS retry path re-provisions an ' +
      'EXISTING partition, so its replica count is the persisted row\'s ' +
      'declaration, not the creation default the removed defaultReplicaCount ' +
      'fallback restated. The installed prototype method is driven to ' +
      'provisionInitialPartition with a sentinel: an existing row declaring 5 ' +
      'provisions 5, a row declaring 3 provisions 3',
  }),
  Object.freeze({
    id: 'routing-overlay-target-resolves-through-authority',
    command: scenarioCommand('routing-overlay-target-resolves-through-authority'),
    detail: 'coverage of the authoritative routing overlay decides whether a ' +
      'refresh may mask cached rows - an admission-adjacent verdict. The ' +
      'same three observed services must classify INCOMPLETE against a ' +
      'declared RF 5 and COMPLETE against a declared RF 3, so the verdict ' +
      'moves with the row and only the row',
  }),
  Object.freeze({
    id: 'quorum-concentration-target-resolves-through-authority',
    command: scenarioCommand(
      'quorum-concentration-target-resolves-through-authority'),
    detail: 'the operation-ledger concentration predicate feeds the ' +
      'admission hold and the surplus-drain (overTarget) classification. ' +
      'Over a genuinely concentrated three-voter ledger view, a declared RF ' +
      '5 reports targetReplicaCount 5 and NOT over-target, while a declared ' +
      'RF 2 reports 2 and over-target - the drain decision tracks the ' +
      'declaration, not the observed voter count',
  }),
  Object.freeze({
    id: 'control-plane-readiness-target-resolves-through-authority',
    command: scenarioCommand(
      'control-plane-readiness-target-resolves-through-authority'),
    detail: 'the priority control-plane readiness gate sizes its quorum ' +
      'spread target from this count. A declared row of 5 must answer 5 and ' +
      'a declared row of 3 must answer 3 - the bootstrap expected RF of 3 is ' +
      'reachable only on the UNDECLARED branch, where the epic\'s provenance ' +
      'classes permit it to keep formation BLOCKED, never to override a ' +
      'declared row',
  }),
  Object.freeze({
    id: 'rejoin-restore-target-resolves-through-authority',
    command: scenarioCommand('rejoin-restore-target-resolves-through-authority'),
    detail: 'the durable-rejoin planner decides whether a joiner restores ' +
      'its persisted replica by comparing restorable service rows to this ' +
      'target. Driven through the exported plan builder over a full join ' +
      'cache: four restorable rows against a declared RF 5 restore the ' +
      'joiner\'s replica (4 <= 5), the same four rows against a declared RF 3 ' +
      'withhold it (surplus, no active operation owner) - the restore ' +
      'decision is a function of the row',
  }),
  Object.freeze({
    id: 'message-group-assignment-policy-not-identity-count',
    command: scenarioCommand(
      'message-group-assignment-policy-not-identity-count'),
    detail: 'the measured rejoin defect at its origin. A restarting node ' +
      'reusing its group planned existingReplicas.length replicas: a ' +
      'partially formed group reported 1, the plan restated 1, and the ' +
      'odd/minimum validation refused it - the joiner could never come back. ' +
      'The reuse plan now carries the group\'s DECLARED policy (5 plans 5, 3 ' +
      'plans 3, never the observed 1), and a fresh self-hosted plan carries ' +
      'the MESSAGE_GROUPS schema declaration rather than a restated literal',
  }),
  Object.freeze({
    id: 'undeclared-policy-fails-closed-in-consumers',
    command: scenarioCommand('undeclared-policy-fails-closed-in-consumers'),
    detail: 'fail-closed is DIRECTIONAL, and this receipt pins each ' +
      'consumer\'s documented non-releasing branch: recovery SKIPS the row ' +
      '(no deficit invented from a config minimum, zero mutations), ' +
      'promotion answers 0 and DEFERS, split and merge REFUSE with their ' +
      'named errors, reconciliation THROWS instead of provisioning the ' +
      'creation default, the routing overlay reports explicit UNKNOWN, the ' +
      'ledger predicate keeps a null target that can never classify ' +
      'over-target, readiness stays at the CONSERVATIVE bootstrap RF - 0 ' +
      'would shrink the quorum target to 1 and RELEASE on a lone node - the ' +
      'rejoin planner keeps its conservative RESTORE branch, and assignment ' +
      'falls back to the DECLARED schema default, never the identity count. ' +
      'One aggregate scenario, so no single consumer\'s undeclared branch ' +
      'can quietly change direction',
  }),
  Object.freeze({
    id: 'planner-placement-divergence-witnessed-not-repaired',
    command: scenarioCommand(
      'planner-placement-divergence-witnessed-not-repaired'),
    detail: 'constraint planner-exception-not-repaired, enforced as ' +
      'evidence. move-planner still computes `policy.targetReplicaCount || ' +
      'policy.replicaCount || NUM.THREE` from a rebalancer POLICY object - ' +
      'the service-plane-adjacent surface transferred to S6b with the ' +
      'inventory leads. The receipt asserts the divergent expression is ' +
      'still present VERBATIM and that the authority module is NOT imported ' +
      'there, so both a silent repair and a silent widening of this quest\'s ' +
      'claim turn the bar red instead of passing unremarked',
  }),
  Object.freeze({
    id: 'self-hosted-group-declared-policy-recovery-convergible',
    command: scenarioCommand(
      'self-hosted-group-declared-policy-recovery-convergible'),
    detail: 'HAND-OFF DECISION A, discharged. Quest A\'s creation-boundary ' +
      'fix makes the self-hosted message group persist declared ' +
      'replica_count 3 where it persisted the observed count 1, and recovery ' +
      'reads that column as its target - so a one-replica group now reports ' +
      'a deficit of 2 and DRIVES replica creation. This receipt proves that ' +
      'is convergence, not churn: recovery submits exactly two creations on ' +
      'two DISTINCT nodes that avoid the existing replica\'s node, and once ' +
      'those replicas are ACTIVE a second pass submits nothing and reports ' +
      'no deficit. Restoring the observed count of 1 stays sealed as ' +
      'forbidden',
  }),
  Object.freeze({
    id: 'no-consumer-fallback-grammar-outside-authority',
    command: scenarioCommand('no-consumer-fallback-grammar-outside-authority'),
    detail: 'the census that keeps the inventory CLOSED against ' +
      'reintroduction. Over the eleven inventoried consumer files: every ' +
      'value-position `replica_count || x` / `?? x` must have a DECLARED_* ' +
      'authority export as its right operand (declared-default grammar), ' +
      'boolean guards (`!x || x < min`) are distinguished from value ' +
      'fallbacks by the negation, `|| NUM.THREE` is forbidden outright, and ' +
      'every file must import the authority module. SCOPE: this is a census ' +
      'of the eleven NAMED files, not a repo-wide claim - the general census ' +
      'was measured undecidable in A\'s round 3, and a brand-new consumer ' +
      'file outside this list is the recorded residual risk, held by the ' +
      'service-plane inventory quest',
  }),
  Object.freeze({
    id: 'absent-scenario-cannot-pass-as-a-receipt',
    command: runnerVerdictIsTrustworthy(
      'absent-scenario-cannot-pass-as-a-receipt'),
    detail: 'THE HARNESS-FIDELITY CONTROL, inherited from A because the ' +
      'failure it guards is a property of the runner, not of any one quest: ' +
      '`node --test --test-name-pattern` exits 0 when the pattern matches ' +
      'NOTHING, so a renamed scenario reports green having never run. The ' +
      'runner is graded in all three outcome classes against the fixture ' +
      'file, must reject an absent probe against THIS witness file, and the ' +
      'witness is additionally run directly with the runner out of the ' +
      'mediating position entirely',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('witness-deterministic'),
    detail: 'two fresh passes over the same policy-row matrix - declared ' +
      'values, alias spelling, invalid values, missing column, absent row - ' +
      'through the authority decode, the promotion target and the readiness ' +
      'target produce byte-identical projections, so no receipt in this bar ' +
      'passes by evaluation order or leaked state',
  }),
]);

const QUEST_ID = 'behaviour-changing-consumer-convergence';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'behaviour-changing-consumer-convergence.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
