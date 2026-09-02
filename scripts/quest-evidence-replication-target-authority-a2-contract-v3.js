// Deterministic evidence harness for the
// replication-target-authority-a2-contract-v3 quest (S1.1-A2). The witnesses use raw node:test (not the repo tap shim), so
// --test-name-pattern selects exactly one anchored scenario per receipt.
//
// SCOPE. This quest proves the authority CONTRACT and its CREATION BOUNDARY:
// the decoder's runtime input is the persisted policy row, only accepted own
// data properties of that row can yield a factor, missing or invalid policy
// fails closed, a fixed row decodes the same factor however production identity
// state is varied, the PARTITIONS and MESSAGE_GROUPS creation sites take their
// factor from the owning table's declaration with the write set and count
// pinned, identity containers do not alias declarations, and the decoder's
// import closure holds no identity owner.
//
// It makes NO repo-wide claim about every replica_count assignment in src/.
// The predecessor tried that after a rejection and round 3 measured it dead
// twice over: 3282 computed keys in src/ cannot be statically resolved, and the
// sites it reached are the SERVICE plane - SERVICE_DESCRIPTOR_FIELD.
// REPLICA_COUNT is 'replicaCount' on runtime-service descriptors - not the
// partition and message-group rows this decoder governs. Those leads moved to
// the service-plane replication authority quest rather than being discarded.
//
// It deliberately does NOT claim that the module can never read any other
// possible JavaScript state. That whole-program purity universal is the sealed
// clause the parent quest replication-policy-authority-substrate lost six
// adversarial rounds to; it is recorded there as a verification-infrastructure
// research item. It also states no consumer inventory: whether every
// behaviour-changing desired-RF consumer resolves through this decoder belongs
// to the successor consumer-convergence quest and to S6.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const AUTHORITY_TEST = 'test/bootstrap/replication-target-authority.test.js';
// NOT a bare `node --test --test-name-pattern` run. That exits 0 when the
// pattern matches NOTHING and reports `# tests 1 / # pass 1` (the file-level
// subtest), so a renamed or deleted scenario is indistinguishable from a
// passing one and every receipt in this file would be a shell. The runner
// requires the named top-level `ok <n> - <scenario>` TAP line.
const ANCHORED_RUNNER =
  'node test/bootstrap/run-anchored-scenario-helper.js ';
const SPACE = ' ';

function scenarioCommand(scenarioName, testFile = AUTHORITY_TEST) {
  return ANCHORED_RUNNER + testFile + SPACE + scenarioName;
}

// The one receipt that must NOT be graded by the runner alone. Every other
// receipt trusts the runner, so a neutered runner keeps them all green while
// the witness is genuinely red. Guarding only the ABSENT case was still a
// point fix: a runner that accepts a FAILING scenario satisfied it. The
// control drives a fixture file covering all three outcome classes and demands
// the runner's verdict on each, so a runner that is wrong in ANY direction -
// or keyed to a particular probe NAME - fails this receipt.
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

// Grading the runner ONLY against the fixture file left one bypass open: a
// runner honest for that path and permissive for every other one suppressed
// its own detector, so the harness read green while witness scenarios were red.
// The control therefore ALSO runs the witness file directly, with the runner
// out of the mediating position entirely, and requires it green.
const WITNESS_DIRECT = 'node --test ' + AUTHORITY_TEST;

function runnerVerdictIsTrustworthy(scenarioName) {
  return mustReject(FIXTURE_FAILS) + mustReject(FIXTURE_ABSENT) +
    mustReject(WITNESS_ABSENT_PROBE, AUTHORITY_TEST) +
    scenarioCommand(FIXTURE_PASSES, RUNNER_FIXTURES) + SHELL_AND +
    WITNESS_DIRECT + SHELL_AND +
    scenarioCommand(scenarioName);
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'decoder-input-is-one-positional-policy-row',
    command: scenarioCommand('decoder-input-is-one-positional-policy-row'),
    detail: 'CLAUSE 1, and the structural repair the whole contract rests on. ' +
      'The decoder took an options object, and an options bag is an open ' +
      'channel: what it may read had to be ARGUED about instead of read off ' +
      'the signature, which is precisely how six rounds of adversarial review ' +
      'turned a release proof into a program-analysis problem. It now takes ' +
      'exactly one POSITIONAL parameter - a plain identifier, arity one on the ' +
      'AST and on the function object - so the only runtime value it is handed ' +
      'IS the persisted policy row. A second argument decides nothing. And ' +
      'there is NO bootstrap fallback: because the creation default is a real ' +
      'non-zero 3, failing closed and borrowing the bootstrap default are ' +
      'distinguishable answers, and every undeclared input must decode 0. A ' +
      'formation consumer may separately consult the bootstrap expected RF to ' +
      'remain BLOCKED before persisted policy is observable; that is the ' +
      'consumer\'s own barrier decision and never a value this can return',
  }),
  Object.freeze({
    id: 'only-own-row-data-properties-can-yield-a-factor',
    command: scenarioCommand('only-own-row-data-properties-can-yield-a-factor'),
    detail: 'CLAUSE 2, observed on BOTH decode branches, which is the exact ' +
      'repair to the Round-6 rejection. A recording proxy sees only the path ' +
      'the call it mediates takes: a row declaring 3 exercises the DECLARED ' +
      'branch and a row declaring nothing exercises the UNDECLARED branch, so ' +
      'each left the other unobserved and a branch-conditional read was ' +
      'invisible. Both branches are now driven through a proxy that traps ' +
      'every reflective operation - get, has, ownKeys, getOwnPropertyDescriptor, ' +
      'getPrototypeOf and every mutating trap - and each must probe only ' +
      'replica_count and replicaCount and use exactly ONE operation, an ' +
      'own-descriptor read. A prototype walk, a plain get, an enumeration or ' +
      'any write to the row would each surface as a second trap. Inherited ' +
      'values and accessors are rejected without the accessor ever executing',
  }),
  Object.freeze({
    id: 'missing-or-invalid-policy-is-undeclared-and-fails-closed',
    command: scenarioCommand(
      'missing-or-invalid-policy-is-undeclared-and-fails-closed'),
    detail: 'CLAUSE 3. A partition with no usable persisted policy has an ' +
      'UNREADABLE requirement and must fail closed rather than invent one. ' +
      'Absent, null, non-objects, arrays, and rows with no accepted spelling ' +
      'all decode UNDECLARED with factor 0; so does every present-but-invalid ' +
      'value on either spelling - 0, negatives, fractions, coercible strings, ' +
      'booleans, NaN, the infinities, boxed numbers, BigInt and the ' +
      'unsafe-integer 2**53. The array case is what the shape guard actually ' +
      'protects: an array satisfies typeof object and can carry an OWN ' +
      'replica_count, so without the rejection it decodes as a policy. This ' +
      'is falsifiable only because the creation default is non-zero, so ' +
      'borrowing it would be visible as a 3 where a 0 is required',
  }),
  Object.freeze({
    id: 'identity-state-cannot-move-a-fixed-policy-row',
    command: scenarioCommand('identity-state-cannot-move-a-fixed-policy-row'),
    detail: 'CLAUSE 4, the metamorphic direction and the product invariant ' +
      'this quest exists for. replica_count is held at 3 while the real ' +
      'production identity-bearing state reachable from the fixture is varied ' +
      'CUMULATIVELY: minted replace-replica-<hex> identities appended to every ' +
      'INITIAL_REPLICA_IDS list and to INITIAL_MESSAGE_GROUP_REPLICA_IDS, ' +
      'growth of the live PartitionService and MessageGroupService peer lists, ' +
      'peer ordering reversed everywhere, node identity and replica identity ' +
      'replaced, peer counts collapsed to one, inflated far past the target, ' +
      'and finally emptied. The decode must stay 3 from partition_row_replica_' +
      'count throughout. This is the measured defect the quest lineage started ' +
      'from: the seed phase handed the declaration to PartitionService BY ' +
      'REFERENCE, raft reconciliation pushed a replacement identity onto it, ' +
      'and desired RF read 4 where a fresh process read 3. Non-vacuity is ' +
      'enforced: an identity digest is taken at every step and all of them ' +
      'must differ, so a fixture that failed to perturb anything cannot pass ' +
      'as invariance',
  }),
  Object.freeze({
    id: 'policy-row-alone-moves-the-target',
    command: scenarioCommand('policy-row-alone-moves-the-target'),
    detail: 'CLAUSE 4, the differential direction. Identity state is held ' +
      'fixed - once at baseline and again in the fully perturbed world where ' +
      'every declaration and peer list has been rewritten - and only the row ' +
      'varies: RF 3 decodes 3, RF 5 decodes 5, the camel spelling of 7 decodes ' +
      '7, and a missing column, an absent row or an invalid value decode ' +
      'UNDECLARED. Both worlds must agree. The decoder is also shown not to be ' +
      'a constant function, so "the row decides" is a claim with content ' +
      'rather than one satisfied by always answering the same thing',
  }),
  Object.freeze({
    id: 'decoded-factor-is-a-function-of-the-row-alone',
    command: scenarioCommand('decoded-factor-is-a-function-of-the-row-alone'),
    detail: 'CLAUSE 4 as a single artifact: the full identity-state x row ' +
      'matrix. Down the identity axis every row decodes to exactly one value; ' +
      'across the row axis the answers differ. That IS the direction of ' +
      'authority - policy authors the factor, identity does not - stated as a ' +
      'property of a measured matrix rather than as a list of malicious ' +
      'expressions somebody thought to rule out, which is the enumeration ' +
      'shape that lost rounds 1 through 6. Both non-vacuity guards are ' +
      'asserted here too: the identity states are pairwise distinct, and more ' +
      'than one distinct answer appears across rows',
  }),
  Object.freeze({
    id: 'decoder-closure-excludes-identity-owners',
    command: scenarioCommand('decoder-closure-excludes-identity-owners'),
    detail: 'the cheap STRUCTURAL boundary, computed over the same static ' +
      'import graph the Solver\'s own import-closure projection reads with ' +
      'es-module-lexer. It answers only "can this module reach an identity ' +
      'owner by import at all", which is the question the contract needs and ' +
      'the one an import graph can actually answer; it is explicitly NOT a ' +
      'dataflow analyzer. A runtime identity owner is a module that declares ' +
      'the seed identity lists or keeps a mutable this.replicaIds peer ' +
      'container - 19 modules today. The decoder\'s 43-module closure ' +
      'intersects that set emptily. POSITIVE CONTROL: the same computation is ' +
      'run from seed-registration-phase.js and partition-service.js, which DO ' +
      'reach identity owners, so an empty intersection for the decoder cannot ' +
      'be an artifact of a detector that never fires. Three known owners are ' +
      'asserted present in the owner set, so renaming one empties the set and ' +
      'reds this receipt rather than passing quietly',
  }),
  Object.freeze({
    id: 'creation-writes-declared-policy-not-identity-count',
    command: scenarioCommand('creation-writes-declared-policy-not-identity-count'),
    detail: 'CLAUSE 5, driven through the REAL creation path and then closed ' +
      'universally. A self-hosted group comes up with ONE local replica; ' +
      'writing replicas.length persisted a DECLARED target of 1, and every ' +
      'later reader decodes that row as authority, so an accident of startup ' +
      'timing became policy. The staged row carries the declared default at ' +
      'identity counts straddling it and decodes back through the authority to ' +
      'the same value. The universal half constrains the FORM of every ' +
      'persisted replica_count write at the PARTITIONS and MESSAGE_GROUPS ' +
      'creation sites - the boundary this clause claims and nothing beyond ' +
      'it. The value must BE a declared-default identifier, so no runtime ' +
      'quantity of any kind - identity count, node id, clock, config, or one ' +
      'not yet invented - can be it, whatever it would evaluate to. The write ' +
      'SET is pinned per file with the declared default each site must ' +
      'consume, not just the total: pinning a count alone let a write move ' +
      'between the two files, or be deleted and another added, unnoticed, and ' +
      'the per-file form also catches a site re-pointed at the other table\'s ' +
      'declaration. The total is pinned at three',
  }),
  Object.freeze({
    id: 'creation-default-tracks-schema-declaration',
    command: scenarioCommand('creation-default-tracks-schema-declaration'),
    detail: 'the creation default is READ from the PARTITIONS declaration, not ' +
      'restated as a literal. The property is SEMANTIC, so it is proved by ' +
      'drifting the declaration and re-evaluating: a restated literal cannot ' +
      'follow the drift. A row created with that default then decodes back to ' +
      'it, so what creation persists is what the authority later reads',
  }),
  Object.freeze({
    id: 'message-group-creation-site-follows-its-own-declaration',
    command: scenarioCommand(
      'message-group-creation-site-follows-its-own-declaration'),
    detail: 'THE SITE, not the constant. A review mutation re-pointed the ' +
      'production message-group write at the PARTITIONS authority - the exact ' +
      'cross-table leak this contract closes - and every receipt stayed green, ' +
      'because nothing pinned which constant the site consumes and both ' +
      'schemas declare 3. An in-process re-import cannot prove it either: ESM ' +
      'caches by specifier, so the re-imported phase keeps the original ' +
      'authority module. The drift therefore happens in a FRESH process before ' +
      'the authority is first evaluated, and the REAL creation path is driven ' +
      'at BOTH message-group creation sites: each staged row follows a drifted ' +
      'MESSAGE_GROUPS declaration and does NOT follow a drifted PARTITIONS one',
  }),
  Object.freeze({
    id: 'partitions-creation-site-follows-its-own-declaration',
    command: scenarioCommand(
      'partitions-creation-site-follows-its-own-declaration'),
    detail: 'the PARTITIONS half, which once had NO witness at all: a review ' +
      'mutation replaced the seed-registration write with a literal 1 - a ' +
      'bootstrap persisting a declared target of 1 for every seeded system ' +
      'table - and all receipts stayed green. SeedRegistrationPhase.' +
      'registerSystemTables is now driven under schema drift in a fresh ' +
      'process, proving every seeded partitions row follows the PARTITIONS ' +
      'declaration and not the message-group one',
  }),
  Object.freeze({
    id: 'message-group-policy-comes-from-its-own-schema',
    command: scenarioCommand('message-group-policy-comes-from-its-own-schema'),
    detail: 'do not replace one cross-table authority leak with a shared ' +
      'default. Because the two schemas currently declare the SAME number, the ' +
      'claim needs two arrows: the message-group default must follow a drifted ' +
      'MESSAGE_GROUPS declaration, and must NOT follow a drifted PARTITIONS ' +
      'one. Either arrow alone is satisfied by a shared constant',
  }),
  Object.freeze({
    id: 'declaration-handoffs-return-copies',
    command: scenarioCommand('declaration-handoffs-return-copies'),
    detail: 'CLAUSE 6 on the hand-off ACCESSORS, and the direct repair to ' +
      'round-1 blocking finding identity-container-aliasing. The assertion ' +
      'that getInitialReplicaIds returns a copy lived in the identity-churn ' +
      'receipt, and retiring that receipt in favour of the metamorphic one ' +
      'took the assertion with it: reverting the accessor to the by-reference ' +
      'return then left the ENTIRE bar green while the declaration was live ' +
      'and mutable through it. The copy is load-bearing - ' +
      'critical-placement-convergence derives a required replica count from ' +
      'the LENGTH of that array - so the aliasing is measurable in production, ' +
      'not theoretical. The accessor is now witnessed directly, a missing ' +
      'table is asserted to stay null rather than become an empty list, and ' +
      'the MESSAGE-GROUP equivalent is driven through the real ' +
      'SeedMessageGroupsPhase: what the phase hands each queued service ' +
      'descriptor must not be the declaration, and mutating what consumers ' +
      'received must not move it',
  }),
  Object.freeze({
    id: 'defensive-copies-do-not-disarm-critical-assertions',
    command: scenarioCommand(
      'defensive-copies-do-not-disarm-critical-assertions'),
    detail: 'the regression class round 1 found in this candidate, now pinned. ' +
      'Hardening the hand-off sites by copying introduced ' +
      '[...(INITIAL_REPLICA_IDS[tableName] || [])], which is ALWAYS a truthy ' +
      'array, so the assertCritical on the next line became unreachable: a ' +
      'table with no declared replica set stopped raising the critical ' +
      '"Partition replica set not configured" and fell through to a ' +
      'leader-missing throw on an error key that does not exist in ' +
      'bootstrap-constants, handing the operator an Error with no message and ' +
      'no isCritical. The copy was gratuitous there - the list is only ' +
      'iterated - and has been reverted. The scenario asserts the critical ' +
      'error is raised WITH its isCritical flag and its own message, and that ' +
      'a declared table with no leader still returns null rather than ' +
      'throwing, so the guard is not simply rejecting everything. Round 2 ' +
      'then found the sibling repairs unwitnessed, so the two DECISION sites ' +
      'the same hardening pass touched are pinned by name: phasePartitions and ' +
      'isSeedLocalSystemTableWriteReady must not substitute an empty list for ' +
      'an undeclared replica set. Named methods rather than the whole file, ' +
      'because two OTHER sites - CDC subscription and epoch load - carry that ' +
      'fallback legitimately and always did: there, nothing declared really ' +
      'does mean nothing to do. The pin follows ONE hop, so binding the ' +
      'accessor to a local and defaulting THAT - the same disarm written as ' +
      'two statements - does not escape it',
  }),
  Object.freeze({
    id: 'production-handoff-cannot-mutate-the-declaration',
    command: scenarioCommand('production-handoff-cannot-mutate-the-declaration'),
    detail: 'CLAUSE 6, on the real alias chain rather than a getter. The seed ' +
      'phase reads INITIAL_REPLICA_IDS[table] and hands it to PartitionService ' +
      'as options.replicaIds; the service stored it BY REFERENCE and raft peer ' +
      'reconciliation pushes onto service.replicaIds, which made the service\'s ' +
      'mutable peer list the shared declaration itself. Copying inside ' +
      'getInitialReplicaIds did nothing here, because this path never calls ' +
      'it. The service now copies, so a minted replacement identity grows the ' +
      'service list and leaves the declaration and the next reader untouched',
  }),
  Object.freeze({
    id: 'message-group-handoff-cannot-mutate-the-declaration',
    command: scenarioCommand(
      'message-group-handoff-cannot-mutate-the-declaration'),
    detail: 'the exact sibling of the partition leak, once left open one line ' +
      'short: the seed phase hands INITIAL_MESSAGE_GROUP_REPLICA_IDS to the ' +
      'service by reference and raft lifecycle pushes onto service.replicaIds. ' +
      'The service copies, so the declaration cannot grow by replacement',
  }),
  Object.freeze({
    id: 'every-critical-table-declares-the-same-target',
    command: scenarioCommand('every-critical-table-declares-the-same-target'),
    detail: 'the per-table claim about PERSISTED policy, driven through the ' +
      'real seeding path instead of asserted against rows the test itself ' +
      'built from the constant it was checking. Every seeded partitions row ' +
      'follows the one PARTITIONS declaration and moves with it; the ' +
      'message_groups row follows its own and does not move with PARTITIONS; ' +
      'and lengthening EVERY identity list - not one, which left a cross-table ' +
      'length reaching partitions.replica_count invisible - changes no seeded ' +
      'value. SCOPE: a consumer that computes a requirement from a table\'s ' +
      'identity-list length is not covered here and is not this quest\'s claim',
  }),
  Object.freeze({
    id: 'authority-mints-no-runtime-state',
    command: scenarioCommand('authority-mints-no-runtime-state'),
    detail: 'the projection is frozen and carries EXACTLY replicationFactor ' +
      'and source, checked on both branches and over Reflect.ownKeys so a ' +
      'non-enumerable or symbol key cannot hide. The typed source STRINGS are ' +
      'pinned, not just the symbol names, because comparing a target\'s source ' +
      'to the same constant that produced it cannot detect a rename. The ' +
      'authority mints no holders, replica identities, convergence or readiness',
  }),
  Object.freeze({
    id: 'hostile-policy-rows-cannot-forge-a-target',
    command: scenarioCommand('hostile-policy-rows-cannot-forge-a-target'),
    detail: 'the accepted spelling set is an ALLOWLIST measured at runtime, ' +
      'not a blocklist of guessed names: enumerating eight rejected spellings ' +
      'still let a ninth in, and TARGET_REPLICA_COUNT already exists in this ' +
      'codebase as a placement-policy key, so this is a live forge surface. A ' +
      'proxy row records exactly which keys the decoder probes. Prototype ' +
      'pollution, accessor rows, non-integers, non-positives and the ' +
      'unsafe-integer 2**53 are all rejected, and a row whose two spellings ' +
      'DISAGREE fails closed rather than taking the second opinion - iterating ' +
      'with continue-on-invalid let a rejected snake value be rescued by the ' +
      'alias, so {replica_count: \'9\', replicaCount: 4} decoded to 4',
  }),
  Object.freeze({
    id: 'absent-scenario-cannot-pass-as-a-receipt',
    command: runnerVerdictIsTrustworthy(
      'absent-scenario-cannot-pass-as-a-receipt'),
    detail: 'THE HARNESS-FIDELITY CONTROL, and the reason every receipt in ' +
      'this file runs through test/bootstrap/run-anchored-scenario-helper.js. ' +
      '`node --test --test-name-pattern` exits 0 when the pattern matches ' +
      'NOTHING and prints `# tests 1 / # pass 1` for the file-level subtest, ' +
      'so counts cannot distinguish a match from a miss: a review mutation ' +
      'renamed one scenario and the harness reported a full green with it ' +
      'never run, making every receipt a shell that proved only that the FILE ' +
      'loaded. The runner requires the named top-level `ok <n> - <scenario>` ' +
      'TAP line and clears NODE_TEST_CONTEXT and NODE_OPTIONS from the child. ' +
      'This receipt grades the runner in all three outcome classes against a ' +
      'fixture file AND against the witness, and additionally runs the witness ' +
      'directly with the runner out of the mediating position entirely',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('witness-deterministic'),
    detail: 'repeated resolution of the full policy matrix produces one ' +
      'identical projection, so no receipt passes by evaluation order. The ' +
      'identity walk is replayed too: it mutates real identity declarations ' +
      'and restores them, so a leaked mutation would surface as a second, ' +
      'different matrix rather than as a later scenario passing for free',
  }),
]);

const QUEST_ID = 'replication-target-authority-a2-contract-v3';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'replication-target-authority-a2-contract-v3.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
