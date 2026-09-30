// Deterministic evidence harness for the user-plane-admission-owner quest:
// receipt declarations only. The shared runtime re-runs each recorded proof
// command and writes the test-receipt probe artifact.
//
// Receipt honesty: the witness uses raw node:test (not the repo tap shim), so
// --test-name-pattern selects exactly one anchored scenario per receipt.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST = 'test/bootstrap/user-plane-admission-owner.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'traffic-ready-admits-user-work',
    command: scenarioCommand('^traffic-ready-admits-user-work'),
    detail: 'once the cluster has opened its user plane, ordinary user work ' +
      'is admitted with the typed traffic-ready reason and the snapshot it ' +
      'was decided from, so the gate is satisfiable and not vacuously closed',
  }),
  Object.freeze({
    id: 'forming-cluster-refuses-user-work',
    command: scenarioCommand('^forming-cluster-refuses-user-work'),
    detail: 'the whole point of the slice: while the cluster is still ' +
      'forming, ordinary user work is REFUSED rather than admitted to race ' +
      'the control plane. Mutation-verified: removing the refusal reds this ' +
      'scenario',
  }),
  Object.freeze({
    id: 'forming-cluster-admits-control-plane-work',
    command: scenarioCommand('^forming-cluster-admits-control-plane-work'),
    detail: 'control-plane capability is admitted before TRAFFIC_READY, ' +
      'because refusing the work that BUILDS the cluster would deadlock the ' +
      'formation that produces readiness. Mutation-verified: holding ' +
      'control-plane work too reds this scenario',
  }),
  Object.freeze({
    id: 'unreadable-authority-refuses-user-work',
    command: scenarioCommand('^unreadable-authority-refuses-user-work'),
    detail: 'an authority PRESENT but yielding no readable snapshot is a ' +
      'wiring or evaluation fault, and unreadable evidence fails closed for ' +
      'user work across three shapes (no projection method, a projection ' +
      'answering null, a bare object). Collapsing this with "no authority" ' +
      'would let a wiring regression read as "no cluster" and silently admit ' +
      'everything; mutation-verified, that collapse reds three scenarios',
  }),
  Object.freeze({
    id: 'unreadable-authority-admits-control-plane-work',
    command: scenarioCommand(
      '^unreadable-authority-admits-control-plane-work'),
    detail: 'the SECOND cause reaching admitted_control_plane_capability: ' +
      'control-plane work rides whether readiness is merely not-yet-ready or ' +
      'unreadable, and the decision reports a null snapshot rather than ' +
      'implying it read one. One outcome, two causes, each exercised',
  }),
  Object.freeze({
    id: 'absent-authority-admits-typed',
    command: scenarioCommand('^absent-authority-admits-typed'),
    detail: 'no lifecycle authority at all is an embedded engine with no ' +
      'cluster to form, so there is nothing to wait for and the admit is ' +
      'TYPED rather than a silent default — across six provider shapes ' +
      '(absent, null, functions answering null or undefined, and falsy ' +
      'non-objects). This is what keeps the blast radius at zero for the ' +
      '4666 query-lane tests that build an engine directly',
  }),
  Object.freeze({
    id: 'refusal-is-typed-and-retryable',
    command: scenarioCommand('^refusal-is-typed-and-retryable'),
    detail: 'the refusal carries the readiness owner\'s own retryAfterMs ' +
      '(250, not a number invented here), its progress contract, wake source ' +
      'and blocking dependency, so a caller is told when to retry and what ' +
      'it is waiting for. This slice invents no retry budget and no new ' +
      'error taxonomy',
  }),
  Object.freeze({
    id: 'production-owner-shapes-resolve-the-provider',
    command: scenarioCommand('^production-owner-shapes-resolve-the-provider'),
    detail: 'THE ANTI-INERTNESS RECEIPT, rebuilt on the REAL owner. An instrumented live three-node run ' +
      'showed the gate executing 42 times and admitting every time with ' +
      'no_lifecycle_authority, because that test builds its engine directly ' +
      'and bypasses the composition — a gate that runs but can never refuse, ' +
      'invisible to a fully green suite. This pins that the resolver reads a ' +
      'key BOTH real runtime owners expose (seed via bootstrap-service, ' +
      'joiner via node-joining-delegate-bundles), that the provider is LAZY ' +
      'because readiness is wired after the engine is built, and that all ' +
      'three owner shapes actually produce a REFUSAL. The first version of ' +
      'this receipt was itself inert: it readFileSync-ed the source and ' +
      'regexed for "get bootstrapReadinessState()", which EXISTED while ' +
      'returning undefined, because the getter read service.joinReadinessState ' +
      '— a property no service assigns anywhere in src. The gate was therefore ' +
      'permanently inert on every joining node. It now builds the real owner ' +
      'through createNodeJoiningRuntimeDependencyOwner and asserts it yields a ' +
      'state that REFUSES. Mutation-verified: reverting the getter to the ' +
      'never-assigned property reds this scenario, as does unwiring the ' +
      'composition provider',
  }),
  Object.freeze({
    id: 'hostile-provider-shapes-fail-closed',
    command: scenarioCommand('^hostile-provider-shapes-fail-closed'),
    detail: 'a provider answering with a primitive, or with a projection ' +
      'returning a primitive, is unreadable evidence and refuses — reported ' +
      'as unreadable rather than as not-yet-ready, so a broken provider names ' +
      'itself instead of hiding behind the normal formation reason. A ' +
      'throwing or revoked provider surfaces rather than being swallowed into ' +
      'a silent admit. A Proxy over a genuine state is deliberately ADMITTED ' +
      'and asserted so: unlike row data from a cache, this provider is ' +
      'injected by our own composition, and refusing it would describe a ' +
      'threat model this boundary does not have',
  }),
  Object.freeze({
    id: 'statement-classification-holds-only-user-work',
    command: scenarioCommand(
      '^statement-classification-holds-only-user-work'),
    detail: 'every case is a REAL statement parsed by the repo\'s own ' +
      'SQLParser. The previous synthetic fixtures used shapes the parser never ' +
      'emits: SELECT puts its target in from.name (an OBJECT, not an array of ' +
      '{table}), and DDL uses tableName — so EVERY SELECT and every ' +
      'CREATE/DROP/INDEX was classified control-plane and admitted, leaving ' +
      'the entire read path ungated while 13 receipts stayed green. Now user ' +
      'SELECT, user JOIN, INSERT/UPDATE/DELETE, CREATE TABLE and CREATE INDEX ' +
      'are all held, while system-table statements ride. A join mixing a ' +
      'system table with a user table is USER work (every, not some), so one ' +
      'system table cannot carry user data through formation, and an ' +
      'unclassifiable statement fails CLOSED. Mutation-verified: ignoring ' +
      'ast.from reds this scenario',
  }),
  Object.freeze({
    id: 'execute-query-refuses-user-work-through-the-real-path',
    command: scenarioCommand(
      '^execute-query-refuses-user-work-through-the-real-path'),
    detail: 'drives the REAL executeQuery on the real prototype with a ' +
      'receiver built via Object.create, so the gate is exercised where a ' +
      'query actually arrives: a user INSERT and a user SELECT on a forming ' +
      'cluster both come back with USER_PLANE_TRAFFIC_NOT_READY and ' +
      'retryAfterMs 250, while a system-table write and a traffic-ready ' +
      'cluster both get PAST the gate. Needed because deleting the single ' +
      'wiring line — if (admission.held) return admission.failure — left every ' +
      'owner-level scenario green: the owner can be perfect and the slice ' +
      'still do nothing. Mutation-verified: deleting that line reds this ' +
      'scenario',
  }),
  Object.freeze({
    id: 'transaction-control-is-always-admitted',
    command: scenarioCommand('^transaction-control-is-always-admitted'),
    detail: 'BEGIN, COMMIT and ROLLBACK pass the gate on a forming AND on a ' +
      'degraded cluster. Refusing ROLLBACK is never right: it is the RELEASE ' +
      'path, not new work. The fail-closed rule introduced in the previous ' +
      'round refused all three, which strands application-database.js and the ' +
      'migration coordinator with an open engine transaction and a record ' +
      'stuck in ROLLING_BACK — a node ready at BEGIN that demotes before ' +
      'COMMIT could neither finish nor undo. Mutation-verified: removing the ' +
      'exemption reds this scenario',
  }),
  Object.freeze({
    id: 'undriven-lifecycle-admits-typed',
    command: scenarioCommand('^undriven-lifecycle-admits-typed'),
    detail: 'THE SAFETY RECEIPT. Measured on the real controller: every ' +
      'setDependency path is reachable only through the external probe entry ' +
      'points, and nothing in src/ drives evaluation on a cadence, so a ' +
      'production lifecycle sits at INIT/ready:false indefinitely. A ' +
      'never-evaluated controller is the ABSENCE of a decision, not a ' +
      'decision to hold traffic, and treating it as not-ready would refuse ' +
      'EVERY query forever — a far worse failure than an inert gate. It ' +
      'therefore admits, typed, on lastEvaluatedAt === null; once something ' +
      'drives the controller and it is genuinely not ready, the same input ' +
      'refuses. Mutation-verified both directions: removing the check reds ' +
      'this scenario, and widening it to always-un-driven reds seven',
  }),
  Object.freeze({
    id: 'derived-table-subquery-tables-are-classified',
    command: scenarioCommand('^derived-table-subquery-tables-are-classified'),
    detail: 'the parser emits {name:null, subquery:{...}} for a derived ' +
      'table, so a classifier that does not recurse harvests no names at all: ' +
      'a derived table over a system table would be held and one over a user ' +
      'table admitted. Both directions asserted. Mutation-verified: dropping ' +
      'the subquery recursion reds this scenario, which it did not before',
  }),
  Object.freeze({
    id: 'owner-mints-no-lifecycle-state',
    command: scenarioCommand('^owner-mints-no-lifecycle-state'),
    detail: 'the decision is frozen, carries exactly admitted, reasonCode and ' +
      'lifecycleReadiness, and mints no phase, ready, active, verdict, ' +
      'status, trafficReady or publish key: the owner is a projection and ' +
      'creates no second cluster-ACTIVE or READY authority, reporting the ' +
      'readiness owner\'s snapshot unchanged rather than a view of it',
  }),
  Object.freeze({
    id: 'existing-readiness-predicates-unchanged',
    command: scenarioCommand('^existing-readiness-predicates-unchanged'),
    detail: 'CONTROL — the predicates this owner consumes still behave as ' +
      'before, and isTrafficReadySnapshot is EXPORTED alongside its two ' +
      'already-exported siblings rather than re-derived here, which would ' +
      'have created exactly the second readiness authority this epic exists ' +
      'to remove. Also pins the read-only contract: isTrafficReady still ' +
      'drives evaluate() as it always has, while ' +
      'getTrafficReadinessSnapshotReadOnly returns null for an evaluate-only ' +
      'state and never falls back. That separation matters because ' +
      'LifecycleController.evaluate() ADVANCES the state machine — writing ' +
      '_phase and _consecutiveFailureCount and emitting transitions — so a ' +
      'gate consulting it on every query would demote the node under user ' +
      'traffic and then refuse the traffic it demoted for. Mutation-verified: ' +
      'adding an evaluate fallback reds this scenario. Must stay green',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'three evaluations of the full decision matrix produce one ' +
      'identical projection, so no receipt can pass by evaluation order or ' +
      'retained state',
  }),
]);

const QUEST_ID = 'user-plane-admission-owner';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME = 'user-plane-admission-owner.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
