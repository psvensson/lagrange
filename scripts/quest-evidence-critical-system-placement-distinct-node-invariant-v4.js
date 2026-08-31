// Deterministic evidence harness for the
// critical-system-placement-distinct-node-invariant quest: receipt
// declarations only. The shared runtime re-runs each recorded proof command
// and writes the test-receipt probe artifact, so a regression that flips a
// witness red flips its receipt to fail and doneWhen cannot close on stale
// green evidence.
//
// Receipt honesty: the witness file uses raw node:test (not the repo tap
// shim), so --test-name-pattern selects exactly one anchored scenario per
// receipt. Every receipt is green today; the quest's honest RED is recorded
// separately in the attempt: with the evaluator module removed the whole
// witness fails to resolve its import (0 pass / 1 fail), because the deliverable
// of this slice IS the evaluator.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST = 'test/bootstrap/critical-placement-convergence.test.js';
// The control lives in its own file that does NOT import the evaluator, so it
// stays green when the evaluator is absent and reds only on real vocabulary
// drift. In the witness file it would have been an evaluator-absence detector.
const CONTROL_TEST =
  'test/bootstrap/critical-placement-classification-control.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

function scenarioCommand(scenarioPattern, testFile = WITNESS_TEST) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + testFile;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'seed-local-replicas-are-not-converged',
    command: scenarioCommand('^seed-local-replicas-are-not-converged'),
    detail: 'the exact shape system tables are created with — three logical ' +
      'replicas of services-p1 all on the seed — evaluates as NOT converged ' +
      '(distinctNodeCount 1 < requiredReplicaCount 3, reason ' +
      'insufficient_distinct_nodes). This is the defect an RF=3 assertion ' +
      'cannot see: it is already satisfied at t=0 by a single-node cluster',
  }),
  Object.freeze({
    id: 'distinct-nodes-meeting-required-count-are-converged',
    command: scenarioCommand(
      '^distinct-nodes-meeting-required-count-are-converged'),
    detail: 'the same three replicas spread across seed/node-2/node-3 ' +
      'evaluate as converged with a sorted distinct node-id list, so the ' +
      'invariant is satisfiable and not vacuously false — AND a fourth ' +
      'replica on a fourth node still converges, pinning the bound as >= ' +
      'rather than ===. Over-spread is the second input shape reaching ' +
      'convergence and every fixture previously reached it only by ' +
      'distinct === required, so narrowing the bound passed 17/0 green. That ' +
      'narrowing is a LIVENESS defect: on any cluster larger than the ' +
      'replication factor, ordinary rebalancing or learner promotion produces ' +
      'over-spread and formation would never be observable as complete. ' +
      'Mutation-verified: === and an off-by-one spelling both red here',
  }),
  Object.freeze({
    id: 'critical-set-is-the-declared-vocabulary',
    command: scenarioCommand('^critical-set-is-the-declared-vocabulary'),
    detail: 'the evaluated partition set equals CRITICAL_SYSTEM_PARTITION_IDS ' +
      'from system-partition-classification.js exactly; the evaluator holds ' +
      'no local copy of the critical set that could silently drift',
  }),
  Object.freeze({
    id: 'required-count-derives-from-initial-replica-ids',
    command: scenarioCommand(
      '^required-count-derives-from-initial-replica-ids'),
    detail: 'requiredReplicaCount equals getInitialReplicaIds(table).length ' +
      'from the declaring module, so no replication-factor literal is ' +
      'hardcoded in the evaluator and changing the declaration moves the bar. ' +
      'Also pins the fourth reason code, which was asserted NOWHERE: a table ' +
      'with no declared replica IDs has an unreadable requirement and must ' +
      'fail CLOSED — three real rows on three distinct nodes still evaluate ' +
      'not converged with required_replica_count_unknown. The critical set ' +
      'derives from SYSTEM_TABLE_NAME while counts come from ' +
      'INITIAL_REPLICA_IDS, two separate literal tables, so a table added to ' +
      'the first without the second enters with required 0; that gap is empty ' +
      'today, and without this assertion deleting the guard turned the ' +
      'refusal into fail-OPEN at 17/0 green, violating the sealed ' +
      'fail-closed-typed constraint. Also pins the same question ONE LEVEL ' +
      'DEEPER: INITIAL_REPLICA_IDS is a plain object literal, so an inherited ' +
      'key resolves — getInitialReplicaIds(\'constructor\') returns a ' +
      'FUNCTION whose .length is 1. A partition id of constructor-p1 with ' +
      'three distinct voters must still refuse, because the count must come ' +
      'from a declared OWN entry and never from whatever the prototype chain ' +
      'supplies. Mutation-verified: weakening the array type check to ' +
      'truthiness borrows a replica count of 1 from Object itself and reports ' +
      'converged TRUE, and now reds this scenario (was 17/0 green)',
  }),
  Object.freeze({
    id: 'non-serving-service-rows-do-not-count',
    command: scenarioCommand('^non-serving-service-rows-do-not-count'),
    detail: 'stopped replicas contribute no failure domain: two stopped rows ' +
      'on distinct nodes plus one active seed row is distinctNodeCount 1 and ' +
      'not converged',
  }),
  Object.freeze({
    id: 'absent-evidence-is-not-converged',
    command: scenarioCommand('^absent-evidence-is-not-converged'),
    detail: 'undefined, empty and null row sets all evaluate NOT converged ' +
      'with the typed placement_evidence_absent reason; absence is never ' +
      'read as satisfaction and is never skipped (fail-closed). Also pins the ' +
      'ROW-INPUT hardening seam, which a real caller actually reaches because ' +
      'rows arrive from a cache rather than a literal: a Proxy row among two ' +
      'valid ones, an Array-subclass container, a sparse array, an ' +
      'inherited-only row, an accessor-backed node_id, a symbol-keyed row ' +
      'a Proxy over the row CONTAINER, a NULL row, and a row whose node_id is ' +
      'present but NON-ENUMERABLE each evaluate not converged with ' +
      'evidence absent AND must not throw. The non-enumerable row is a ' +
      'distinct shape from the accessor row: it HAS a value and fails only the ' +
      'enumerability test, so the accessor fixture never reaches that guard; ' +
      'the null row is a primitive that must fail closed rather than crash. The container Proxy is a distinct ' +
      'shape from the row Proxy: it is refused by the container check in ' +
      'copyDenseOwnDataArray, not the record check in copyStrictOwnDataRecord, ' +
      'and wrapping rows alone never reaches it — removing only that guard ' +
      'reported converged TRUE at 17/0 green. ' +
      'The accessor is asserted never to execute. Unreadable evidence is not ' +
      'converged, which is why the module copies through strict-own-data ' +
      'before reading. Mutation-verified: replacing that copy with a bare ' +
      'Array.isArray check reds this scenario (was 17/0 green) — without it ' +
      'three of those shapes reported converged TRUE and the sparse one ' +
      'crashed. SCOPE: the inner descriptor read is defence in depth and is ' +
      'NOT pinned here — with the strict copy running first the two reads are ' +
      'byte-identical for every one of these shapes, so no assertion can ' +
      'distinguish them, and none claims to. It IS pinned in COMBINATION: ' +
      'removing both layers together reds this scenario. DELIBERATELY LEFT ' +
      'UNPINNED, with reasons measured rather than assumed: the length-' +
      'descriptor and safe-integer-length guards are unreachable (defining ' +
      'length as an accessor on a real Array throws, and Array length is ' +
      'always a non-negative safe-integer data property); the row-is-an-Array ' +
      'guard is redundant with the canonical-prototype check; the ' +
      'reflectOwnKeys try/catch is dead because only proxies can throw and ' +
      'they are already refused. Fixtures for those would add assertions no ' +
      'defect can move, which is the failure mode this bar exists to avoid',
  }),
  Object.freeze({
    id: 'repeated-node-rows-count-once',
    command: scenarioCommand('^repeated-node-rows-count-once'),
    detail: 'a node holding several replicas of the same partition is one ' +
      'failure domain: five rows across three nodes is distinctNodeCount 3, ' +
      'proving the measure is distinct nodes rather than row count',
  }),
  Object.freeze({
    id: 'evaluator-mints-no-readiness-verdict',
    command: scenarioCommand('^evaluator-mints-no-readiness-verdict'),
    detail: 'neither returned snapshot carries ready/active/phase/verdict/' +
      'status/trafficReady/lifecycle keys and both are frozen: the evaluator ' +
      'is a projection and creates no second cluster-ACTIVE or READY authority. ' +
      'The NESTED arrays are frozen too, not just the outer objects: an outer ' +
      'freeze leaves array values mutable in place, and pendingPartitionIds is ' +
      'exactly the array a formation barrier would hold onto. ' +
      'Mutation-verified: dropping either nested freeze reds this scenario ' +
      '(both were 17/0 green, with the arrays mutable in place while no ' +
      'computed answer changed)',
  }),
  Object.freeze({
    id: 'classification-vocabulary-unchanged',
    command: scenarioCommand('^classification-vocabulary-unchanged',
      CONTROL_TEST),
    detail: 'CONTROL — the existing classification surface is untouched: the ' +
      'critical set still equals first-partition-of-every-system-table and ' +
      'classifySystemPartition still returns its exact six-key shape. This ' +
      'receipt must stay green; a change that reds it is rejected',
  }),
  Object.freeze({
    id: 'foreign-partition-rows-do-not-count',
    command: scenarioCommand('^foreign-partition-rows-do-not-count'),
    detail: 'production input is the WHOLE services table, so the ' +
      'partition_id guard is load-bearing: rows serving a DIFFERENT critical ' +
      'partition on two other nodes leave this partition at ' +
      'distinctNodeCount 1. Deleting the guard reds exactly this scenario ' +
      '(verified by mutation), which the single-partition fixtures could not see',
  }),
  Object.freeze({
    id: 'learner-replicas-are-not-eligible-capacity',
    command: scenarioCommand('^learner-replicas-are-not-eligible-capacity'),
    detail: 'a leader plus two learners on distinct nodes is ONE voting ' +
      'failure domain, not three: learners are catching up and guarantee no ' +
      'quorum, so they are not eligible serving capacity. The voter test is ' +
      'the canonical isVoterRaftRole (raft/replica-voter-readiness.js), not a ' +
      'local copy; dropping the guard reds this scenario',
  }),
  Object.freeze({
    id: 'non-partition-service-rows-do-not-count',
    command: scenarioCommand('^non-partition-service-rows-do-not-count'),
    detail: 'three wasm_service rows on distinct nodes are not partition ' +
      'replicas: distinctNodeCount 0 with the typed evidence-absent reason, ' +
      'so a non-replica service can never be mistaken for spread',
  }),
  Object.freeze({
    id: 'set-iteration-is-ambient-hardened',
    command: scenarioCommand('^set-iteration-is-ambient-hardened'),
    detail: 'Set.prototype.forEach, Set.prototype.values AND ' +
      'Set.prototype[Symbol.iterator] are replaced with ' +
      'ghost-injecting callbacks and seed-local rows still answer ' +
      'distinctNodeCount 1 / not converged: the module drains Sets through a ' +
      'captured iterator (the system-partition-classification.js idiom), so ' +
      'an ambient seam cannot inflate the count and flip the invariant. ' +
      '@@iterator is pinned separately because it is a DIFFERENT slot from ' +
      '.values: they start as the same function object, but assigning a ghost ' +
      'to .values leaves @@iterator untouched, so a rewrite of the drain to ' +
      '[...values] or for..of would otherwise have survived green under a ' +
      'receipt whose name asserts the opposite',
  }),
  Object.freeze({
    id: 'malformed-node-id-rows-do-not-count',
    command: scenarioCommand('^malformed-node-id-rows-do-not-count'),
    detail: 'an empty node_id satisfies SQLite notNull, so such a row is ' +
      'reachable rather than hypothetical: one of them plus two real nodes ' +
      'reports distinctNodeCount 2 and NOT converged, so a malformed row can ' +
      'never manufacture a failure domain. Also pins TYPE before coercion: a ' +
      'numeric node_id must not become a counted node. Values are pinned to ' +
      'string before any coercion because String(x) invokes hostile toString ' +
      'or Symbol.toPrimitive; mutation-verified, dropping the typeof test ' +
      'coerces 3 to \'3\' and reds this scenario (was 17/0 green)',
  }),
  Object.freeze({
    id: 'empty-critical-set-is-not-converged',
    command: scenarioCommand('^empty-critical-set-is-not-converged'),
    detail: 'the convergence decision is a pure predicate over COUNTS, so the ' +
      'empty case is reachable: isConvergedPlacementCount(0, 0) is false, ' +
      'because an empty critical set has no pending partitions and a bare ' +
      'pendingCount === 0 would report convergence over nothing. The earlier ' +
      'form asserted converged === (pending === 0 && partitions > 0), which ' +
      'restated the implementation — under the live 45-partition set the ' +
      'second conjunct is always true, so no data the public API can produce ' +
      'distinguished guarded from unguarded. Mutation-verified: dropping ' +
      'partitionCount > 0 now reds exactly this scenario (was 15/0 green). ' +
      'SCOPE, stated precisely: this pins the DECISION HELPER including its ' +
      'empty case. That the projection uses the helper is established by ' +
      'INSPECTION, not by this test — a call site that inlines ' +
      'pendingCount === 0 and skips the helper is behaviourally identical for ' +
      'every reachable input (the live set is never empty), so no assertion ' +
      'can distinguish them and none here claims to',
  }),
  Object.freeze({
    id: 'whole-set-convergence-is-reachable',
    command: scenarioCommand('^whole-set-convergence-is-reachable'),
    detail: 'rows spreading EVERY declared critical partition across its ' +
      'required distinct voting nodes make the whole-set projection report ' +
      'converged true with no pending partitions. Without this the sealed bar ' +
      'was consistent with an evaluator that is ALWAYS false: every other ' +
      'whole-set assertion checks a negative, or an equality whose two sides ' +
      'go false together. Mutation-verified: transposing the two count ' +
      'arguments at the call site — which makes convergence unobservable for ' +
      'every possible input — now reds exactly this scenario (was 15/0 green)',
  }),
  Object.freeze({
    id: 'per-partition-attribution-is-measured',
    command: scenarioCommand('^per-partition-attribution-is-measured'),
    detail: 'THREE partitions are pending, chosen BY INDEX from the sorted ' +
      'declared set (0, mid, last) rather than by literal name, and for MIXED ' +
      'reasons: two omitted entirely (evidence absent) and one given its full ' +
      'replica set on a single node (present, RF satisfied, one failure ' +
      'domain). Each axis defeats a different survivor measured at 17/0 green: ' +
      'cardinality three defeats a list capped at one or at two; choosing by ' +
      'index defeats an implementation pushing a constant pair, which any ' +
      'assertion whose expected value is fixture literals would accept; and ' +
      'mixed reasons defeat pushing on distinctNodeCount === 0 or on ' +
      'EVIDENCE_ABSENT. That last pair is not diagnostic-only: converged is ' +
      'derived from pendingPartitionIds.length, so under either an ' +
      'under-spread partition never enters the list and the cluster is ' +
      'declared CONVERGED with a seed-local critical partition — the exact ' +
      'RF-only false positive this quest opened against. The scenario also ' +
      'pins the two causes explicitly so it cannot drift back to a ' +
      'single-reason fixture. Mutation-verified: all four now red exactly ' +
      'this scenario',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'the convergence answer is identical for forward, reversed and ' +
      'repeated row order, so the receipt cannot pass by input ordering luck',
  }),
]);

const QUEST_ID = 'critical-system-placement-distinct-node-invariant-v4';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'critical-system-placement-distinct-node-invariant-v4.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
