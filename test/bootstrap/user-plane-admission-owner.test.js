// Witness for the user-plane-admission-owner quest.
// Raw node:test (not the tap shim) so --test-name-pattern selects exactly one
// scenario and each receipt is independently honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  USER_PLANE_ADMISSION_REASON,
  USER_PLANE_NOT_READY_CODE,
  buildUserPlaneAdmissionError,
  isUserPlaneAdmitted,
  resolveUserPlaneAdmission,
} from '../../src/bootstrap/user-plane-admission-owner.js';
import {
  getTrafficReadinessSnapshotReadOnly,
  isTrafficReady,
  isTrafficReadySnapshot,
} from '../../src/bootstrap/traffic-readiness-utils.js';
import {
  SQLQueryEngineStatementExecution,
} from '../../src/query/sql-query-engine-statement-execution.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {
  BootstrapReadinessState,
} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {
  createNodeJoiningRuntimeDependencyOwner,
} from '../../src/bootstrap/node-joining-delegate-bundles.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..');

// lastEvaluatedAt is non-null on both: these are snapshots of a lifecycle
// something has actually DRIVEN. An un-driven controller reports null and is
// a separate, admitted case with its own scenario.
const FORMING = Object.freeze({
  ready: false, phase: 'JOIN_READY', retryAfterMs: 250,
  reasons: ['formation_pending'], transitionCount: 1,
});
const READY = Object.freeze({
  ready: true, phase: 'TRAFFIC_READY', transitionCount: 2,
});

// A readiness state as the gate must consume it: getSnapshot only. evaluate()
// ADVANCES the lifecycle state machine, so the gate must never reach for it.
function state(snapshot) {
  return {getSnapshot: () => snapshot, evaluate: () => {
    throw new Error('the admission gate must not advance the lifecycle');
  }};
}

function decide(provider, controlPlaneCapability = false) {
  return resolveUserPlaneAdmission({
    controlPlaneCapability,
    lifecycleReadinessProvider: provider,
  });
}

// Classification is a boundary concern: exercise the real method with a
// minimal receiver rather than standing up a whole engine.
function classify(sql, systemTables = ['services', 'nodes']) {
  // Parse with the REPO'S OWN parser: synthetic ASTs let a classifier pass
  // while reading shapes the parser never emits. SELECT puts its target in
  // `from.name` (an object, not an array), DDL in `tableName`.
  const ast = new SQLParser(sql).parse();
  return SQLQueryEngineStatementExecution.prototype
    .isControlPlaneCapabilityStatement.call(
      {isSystemTable: (name) => systemTables.includes(name)}, ast);
}

// A receiver on the real prototype, so executeQuery reaches the real gate.
function engineWith(snapshot, systemTables = ['services']) {
  return Object.assign(Object.create(SQLQueryEngineStatementExecution.prototype), {
    isSystemTable: (name) => systemTables.includes(name),
    lifecycleReadinessProvider: () => ({getSnapshot: () => snapshot}),
    logger: {debug() {}, warn() {}, error() {}},
    parseCache: {get: () => null, set() {}, cloneAst: (ast) => ast},
    recoverDistributedTransactionStateFromCache() {},
    async authorizeRuntimeServiceStatement() {
      return null;
    },
    evaluateQueryIngressPressure() {
      return null;
    },
    buildCaughtQueryExecutionFailure(error) {
      return {success: false, error: error.message, errorCode: 'PAST_GATE'};
    },
    async executeInsert() {
      return {success: true, errorCode: 'PAST_GATE'};
    },
    async executeSelect() {
      return {success: true, errorCode: 'PAST_GATE'};
    },
  });
}

async function runQuery(snapshot, sql) {
  return SQLQueryEngineStatementExecution.prototype.executeQuery.call(
    engineWith(snapshot), sql);
}

test('traffic-ready-admits-user-work', () => {
  const decision = decide(state(READY));
  assert.equal(decision.admitted, true);
  assert.equal(decision.reasonCode,
    USER_PLANE_ADMISSION_REASON.ADMITTED_TRAFFIC_READY);
  assert.equal(isUserPlaneAdmitted(decision), true);
  assert.equal(decision.lifecycleReadiness.phase, 'TRAFFIC_READY');
});

test('forming-cluster-refuses-user-work', () => {
  const decision = decide(state(FORMING));
  assert.equal(decision.admitted, false,
    'ordinary user work waits while the cluster is still forming');
  assert.equal(decision.reasonCode,
    USER_PLANE_ADMISSION_REASON.REFUSED_TRAFFIC_NOT_READY);
  assert.equal(isUserPlaneAdmitted(decision), false);
});

test('forming-cluster-admits-control-plane-work', () => {
  const decision = decide(state(FORMING), true);
  assert.equal(decision.admitted, true,
    'the control plane must still be able to build the cluster');
  assert.equal(decision.reasonCode,
    USER_PLANE_ADMISSION_REASON.ADMITTED_CONTROL_PLANE);
});

test('unreadable-authority-refuses-user-work', () => {
  // An authority PRESENT but yielding no readable snapshot is a wiring or
  // evaluation fault. Unreadable evidence fails closed; collapsing this with
  // "no authority" would let a wiring regression silently admit everything.
  for (const provider of [() => ({}), () => ({evaluate: () => null}), {}]) {
    const decision = resolveUserPlaneAdmission({
      lifecycleReadinessProvider: provider,
    });
    assert.equal(decision.admitted, false);
    assert.equal(decision.reasonCode,
      USER_PLANE_ADMISSION_REASON.REFUSED_LIFECYCLE_UNREADABLE);
    assert.equal(decision.lifecycleReadiness, null);
  }
});

test('unreadable-authority-admits-control-plane-work', () => {
  // The second cause reaching ADMITTED_CONTROL_PLANE: control-plane work is
  // admitted whether readiness is merely not-yet-ready OR unreadable, because
  // refusing it would deadlock the formation that produces readiness.
  const decision = resolveUserPlaneAdmission({
    controlPlaneCapability: true,
    lifecycleReadinessProvider: () => ({}),
  });
  assert.equal(decision.admitted, true);
  assert.equal(decision.reasonCode,
    USER_PLANE_ADMISSION_REASON.ADMITTED_CONTROL_PLANE);
  assert.equal(decision.lifecycleReadiness, null,
    'admitted without a readable snapshot, and says so');
});

test('absent-authority-admits-typed', () => {
  // No authority at all is an embedded engine with no cluster to form: there
  // is nothing to wait for. Typed, so a wiring regression is nameable.
  for (const provider of [undefined, null, () => null, () => undefined, 0, '']) {
    const decision = resolveUserPlaneAdmission({
      lifecycleReadinessProvider: provider,
    });
    assert.equal(decision.admitted, true);
    assert.equal(decision.reasonCode,
      USER_PLANE_ADMISSION_REASON.ADMITTED_NO_LIFECYCLE_AUTHORITY);
  }
});

test('refusal-is-typed-and-retryable', () => {
  const error = buildUserPlaneAdmissionError(decide(state(FORMING)));
  assert.equal(error.code, USER_PLANE_NOT_READY_CODE);
  assert.equal(error.retryAfterMs, 250,
    'the retry budget comes from the readiness owner, not from this module');
  assert.equal(error.progressContract.nextAction, 'wait_for_traffic_readiness');
  assert.equal(error.progressContract.blockingDependency, 'traffic_readiness');
  assert.equal(error.progressContract.terminalState, 'satisfied');
  assert.match(error.message, /not satisfied/u);
});

test('production-owner-shapes-resolve-the-provider', () => {
  // The gate ran 42 times in a live three-node run and admitted every time,
  // because that test builds its engine directly. A gate that cannot refuse is
  // not a gate. A source regex is NOT enough: the joiner getter previously
  // returned service.joinReadinessState, a property no service ever assigns,
  // so the string existed and the value was undefined.
  const resolve = (owner) =>
    owner?.bootstrapReadinessOwner?.getReadinessState?.() ||
    owner?.readinessState ||
    owner?.bootstrapReadinessState ||
    null;

  // Build the REAL joiner runtime owner over a service carrying readiness.
  const joinerOwner = createNodeJoiningRuntimeDependencyOwner({
    service: {bootstrapReadinessState: state(FORMING)},
    runtimeWiring: {},
  });
  assert.notEqual(resolve(joinerOwner), null,
    'the joiner runtime owner must actually yield a readiness state');
  assert.equal(
    decide(() => resolve(joinerOwner)).reasonCode,
    USER_PLANE_ADMISSION_REASON.REFUSED_TRAFFIC_NOT_READY,
    'a real joiner owner must be able to REFUSE, not admit');

  // The seed shape and the explicit-owner shape must refuse too.
  for (const owner of [
    {bootstrapReadinessState: state(FORMING)},
    {readinessState: state(FORMING)},
    {bootstrapReadinessOwner: {getReadinessState: () => state(FORMING)}},
  ]) {
    const decision = decide(() => resolve(owner));
    assert.equal(decision.admitted, false);
    assert.equal(decision.reasonCode,
      USER_PLANE_ADMISSION_REASON.REFUSED_TRAFFIC_NOT_READY);
  }

  // And the composition must pass a LAZY provider: readiness is wired after
  // the engine is built, so a value captured at construction is always null.
  const composition = fs.readFileSync(path.join(REPO_ROOT,
    'src/entrypoint-runtime-admin-composition.js'), 'utf8');
  assert.match(composition, /lifecycleReadinessProvider:\s*\(\)\s*=>/u);
});

test('hostile-provider-shapes-fail-closed', () => {
  // The provider crosses a module boundary, so its return is untrusted input.
  const revoked = Proxy.revocable({getSnapshot: () => READY}, {});
  revoked.revoke();
  // A Proxy over a genuine readiness state is NOT hostile here and is
  // deliberately admitted: unlike row data, which arrives from a cache, this
  // provider is injected by our own composition. Refusing it would describe a
  // threat model this boundary does not have.
  const proxiedState = new Proxy({getSnapshot: () => READY}, {});
  assert.equal(
    resolveUserPlaneAdmission({lifecycleReadinessProvider: () => proxiedState})
      .reasonCode,
    USER_PLANE_ADMISSION_REASON.ADMITTED_TRAFFIC_READY,
    'a proxied state behaves as the state it wraps');

  const hostile = [
    ['throwing getSnapshot', {getSnapshot: () => {
      throw new Error('boom');
    }}],
    ['getSnapshot returning a primitive', {getSnapshot: () => 'ready'}],
    ['getSnapshot returning a number', {getSnapshot: () => 7}],
    ['no projection method', {ready: true, phase: 'TRAFFIC_READY'}],
    // evaluate-only is UNREADABLE by design: reaching for it would advance
    // the state machine, so a state offering only evaluate is refused.
    ['evaluate-only state', {evaluate: () => READY}],
    ['revoked proxy state', revoked.proxy],
  ];
  for (const [label, provided] of hostile) {
    let decision = null;
    const call = () => {
      decision = resolveUserPlaneAdmission({
        lifecycleReadinessProvider: () => provided,
      });
    };
    if (label === 'throwing getSnapshot' || label === 'revoked proxy state') {
      // A provider that throws must not be swallowed into a silent admit.
      assert.throws(call, `${label} must surface, not admit`);
      continue;
    }
    call();
    assert.equal(decision.admitted, false, `${label} must not admit`);
    assert.equal(decision.reasonCode,
      USER_PLANE_ADMISSION_REASON.REFUSED_LIFECYCLE_UNREADABLE, label);
  }
});

test('statement-classification-holds-only-user-work', () => {
  // Every case is a REAL parsed statement. The previous synthetic fixtures
  // ({type:'SELECT', from:[{table:'ratings'}]}) matched no parser output, so
  // every SELECT and every DDL statement was silently classified
  // control-plane and admitted.
  assert.equal(classify('SELECT * FROM users'), false, 'user SELECT is held');
  assert.equal(classify('SELECT * FROM services'), true);
  assert.equal(classify('SELECT a FROM users u JOIN orders o ON u.id = o.uid'),
    false, 'a user JOIN is held');
  assert.equal(classify('SELECT a FROM services s JOIN nodes n ON 1 = 1'), true);
  // A join mixing a system table with a user table is USER work: one system
  // table must not let user data ride through formation.
  assert.equal(classify('SELECT a FROM services s JOIN users u ON 1 = 1'),
    false);
  assert.equal(classify('INSERT INTO ratings VALUES (1)'), false);
  assert.equal(classify('INSERT INTO services VALUES (1)'), true);
  assert.equal(classify('UPDATE ratings SET a = 1'), false);
  assert.equal(classify('DELETE FROM ratings'), false);
  // DDL carries its target in tableName, a key an ast.table reader never sees.
  assert.equal(classify('CREATE TABLE t (id INT)'), false);
  assert.equal(classify('DROP TABLE services'), true);
  assert.equal(classify('CREATE INDEX i ON ratings (a)'), false);
  // Fail closed: a statement whose tables cannot be identified waits.
  assert.equal(classify('SELECT 1'), false,
    'an unclassifiable statement is treated as user work');
});


test('owner-mints-no-lifecycle-state', () => {
  const decision = decide(state(FORMING));
  const forbidden = ['phase', 'ready', 'active', 'verdict', 'status',
    'trafficReady', 'publish'];
  for (const key of forbidden) {
    assert.equal(Object.hasOwn(decision, key), false,
      `the admission owner must not mint ${key}`);
  }
  assert.equal(Object.isFrozen(decision), true);
  assert.deepEqual(Object.keys(decision).sort(),
    ['admitted', 'lifecycleReadiness', 'reasonCode']);
  // It reports the readiness owner's snapshot unchanged rather than a view.
  assert.equal(decision.lifecycleReadiness.phase, FORMING.phase);
});

test('existing-readiness-predicates-unchanged', () => {
  // CONTROL: the predicates this owner consumes still behave as before, and
  // isTrafficReadySnapshot is exported alongside its two siblings rather than
  // re-derived here.
  assert.equal(typeof isTrafficReadySnapshot, 'function');
  assert.equal(isTrafficReadySnapshot(READY), true);
  assert.equal(isTrafficReadySnapshot(FORMING), false);
  assert.equal(isTrafficReadySnapshot(null), false);
  // isTrafficReady legitimately drives evaluate(); that is the pre-existing
  // contract this control guards, so it gets a state that permits it. The
  // admission gate is the one that must not, which its own state helper traps.
  const drivable = (snapshot) => ({evaluate: () => snapshot});
  assert.equal(isTrafficReady(drivable(READY)), true);
  assert.equal(isTrafficReady(drivable(FORMING)), false);
  assert.equal(getTrafficReadinessSnapshotReadOnly(drivable(READY)), null,
    'the read-only projection never falls back to evaluate');
  assert.equal(getTrafficReadinessSnapshotReadOnly(state(READY)).phase,
    'TRAFFIC_READY');
});

test('witness-deterministic', () => {
  const shape = () => JSON.stringify([
    decide(state(READY)), decide(state(FORMING)), decide(state(FORMING), true),
    resolveUserPlaneAdmission({lifecycleReadinessProvider: () => ({})}),
    resolveUserPlaneAdmission({}),
  ]);
  const first = shape();
  assert.equal(shape(), first);
  assert.equal(shape(), first);
});



test('derived-table-subquery-tables-are-classified', () => {
  // The parser emits {name:null, subquery:{...}} for a derived table, so a
  // classifier that does not recurse sees no names at all and (fail-closed)
  // holds a system-table statement, or (fail-open) admits a user one.
  assert.equal(classify('SELECT * FROM (SELECT * FROM services) s'), true,
    'a derived table over a system table is control-plane');
  assert.equal(classify('SELECT * FROM (SELECT * FROM users) s'), false,
    'a derived table over a user table is user work');
});

test('owner-is-declared-not-wired', () => {
  // The enforcement point was built and WITHDRAWN. Measured on a live
  // three-node formation: the readiness controller is driven by
  // BootstrapReadinessOwner, ends DEGRADED with
  // PRIORITY_CONTROL_PLANE_RECOVERY_PENDING and never reaches TRAFFIC_READY,
  // so a wired gate refuses all ordinary user work permanently. This receipt
  // exists so the withdrawal is deliberate and cannot be undone by accident:
  // wiring must come back with a witness that a node REACHES TRAFFIC_READY on
  // the gated path.
  const statementExecution = fs.readFileSync(path.join(REPO_ROOT,
    'src/query/sql-query-engine-statement-execution.js'), 'utf8');
  const executeQuery = statementExecution.slice(
    statementExecution.indexOf('async executeQuery('));
  assert.equal(executeQuery.includes('enforceUserPlaneAdmission'), false,
    'executeQuery must not call the gate until TRAFFIC_READY is reachable');

  const owner = fs.readFileSync(path.join(REPO_ROOT,
    'src/bootstrap/user-plane-admission-owner.js'), 'utf8');
  assert.match(owner, /NOT WIRED/u,
    'the owner must say plainly that it is not wired, and why');
  // And the decision surface still refuses a driven, not-ready lifecycle, so
  // the owner is ready to be wired the moment the bar is reachable.
  const decision = decide(state(FORMING));
  assert.equal(decision.admitted, false);
  assert.equal(decision.reasonCode,
    USER_PLANE_ADMISSION_REASON.REFUSED_TRAFFIC_NOT_READY);
});
