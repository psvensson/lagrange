// Frozen ingress authority must be owned data before request identity,
// admission or owner execution. Downstream owner answers are controlled;
// these controls do not claim native leader or transport proof.
import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {AuthoritativeControlPlaneView} from
  '../../src/control-plane/authoritative-control-plane-view.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER, GATEWAY_ERROR_MSG} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE as SCOPE} from
  '../../src/control-plane/control-plane-cache-reconcile-constants.js';

const NODE_ID = 'owned-read-authority-node';
const SQL = 'SELECT * FROM nodes WHERE node_id = ?';
const ROW = Object.freeze({node_id: NODE_ID, status: 'active'});
const TOKEN_REQUIRED = GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED;
const UNSUPPORTED_LEADER = 'unsupported_control_plane_read_leader_mode';
const UNSUPPORTED_MODE = 'unsupported_control_plane_authoritative_read_mode';
const CONTRADICTION = 'contradictory_control_plane_authoritative_read_authority';

function selectedAuthority() {
  return buildControlPlaneReadAuthority({authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
    leaderMode: LEADER.REQUIRED, localReadConsistency: 'local_leader'});
}

function ingressFixture(ingress) {
  const calls = {identities: 0, admissions: 0, owner: [], cache: 0,
    getters: 0, proxyTraps: 0, serializations: 0};
  const options = {nodeId: NODE_ID, now: () => 1000,
    pressureGovernor: {configure() {}, async admit() {
      calls.admissions += 1;
      return {action: 'allow'};
    }},
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(tableName, sql, params, requestOptions) {
        calls.owner.push({tableName, sql, params, requestOptions});
        return {success: true, rows: [ROW], rowSetComplete: true, source: 'owner_rpc_lane'};
      },
    },
  };
  if (ingress === 'gateway') {
    const gateway = new ControlPlaneSystemTableGateway({...options,
      systemTableCache: {getAll() {calls.cache += 1; return [ROW];}},
    });
    const buildKey = gateway.buildReadRequestKey;
    gateway.buildReadRequestKey = function(...args) {
      calls.identities += 1;
      return Reflect.apply(buildKey, this, args);
    };
    return {calls, inFlight: gateway.inFlightReadRequestsByKey,
      read: (readAuthority) => gateway.readAuthoritativeRows(TABLES.NODES, SQL, [NODE_ID],
        {readAuthority})};
  }
  const view = new AuthoritativeControlPlaneView(options);
  const hasKey = view.inFlightReadsByKey.has;
  view.inFlightReadsByKey.has = function(key) {
    calls.identities += 1;
    return Reflect.apply(hasKey, this, [key]);
  };
  return {calls, inFlight: view.inFlightReadsByKey,
    read: (readAuthority) => view.readRows(TABLES.NODES, SQL, [NODE_ID], {readAuthority})};
}

function frozenAccessorToken(valid, calls) {
  const candidate = {...valid};
  Object.defineProperty(candidate, 'authoritativeReadMode', {
    enumerable: true, configurable: true,
    get() {calls.getters += 1; return MODE.OWNER_RPC_REQUIRED;},
  });
  return Object.freeze(candidate);
}

function frozenInheritedToken(valid) {
  const mutablePrototype = {...valid};
  const candidate = Object.freeze(Object.create(mutablePrototype));
  mutablePrototype.authoritativeReadMode = MODE.OWNER_LOCAL_ONLY;
  return candidate;
}

function frozenProxyToken(valid, calls) {
  // Freeze the target, not the proxy: fixture construction engages no trap.
  return new Proxy(Object.freeze({...valid}), {
    get(target, key, receiver) {
      calls.proxyTraps += 1;
      if (key === 'toJSON') return () => {calls.serializations += 1; return valid;};
      return Reflect.get(target, key, receiver);
    },
    getPrototypeOf(target) {calls.proxyTraps += 1; return Reflect.getPrototypeOf(target);},
    isExtensible(target) {calls.proxyTraps += 1; return Reflect.isExtensible(target);},
    ownKeys(target) {calls.proxyTraps += 1; return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target, key) {
      calls.proxyTraps += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
}

function frozenNonEnumerableToken(valid) {
  const candidate = {...valid};
  Object.defineProperty(candidate, 'authoritativeReadMode', {enumerable: false});
  return Object.freeze(candidate);
}

function frozenMissingLeaderToken(valid) {
  const candidate = {...valid};
  delete candidate.leaderMode;
  return Object.freeze(candidate);
}

const INVALID_TOKENS = [
  {name: 'accessor mode', create: frozenAccessorToken, expected: {message: TOKEN_REQUIRED}},
  {name: 'inherited mutable fields', create: frozenInheritedToken,
    expected: {message: TOKEN_REQUIRED}},
  {name: 'proxy and serialization trap', create: frozenProxyToken,
    expected: {message: TOKEN_REQUIRED}},
  {name: 'own serialization hook', create: (valid, calls) => Object.freeze({...valid,
    toJSON() {calls.serializations += 1; return valid;}}), expected: {message: TOKEN_REQUIRED}},
  {name: 'non-enumerable authority field', create: frozenNonEnumerableToken,
    expected: {message: TOKEN_REQUIRED}},
  {name: 'missing leader field', create: frozenMissingLeaderToken,
    expected: {message: TOKEN_REQUIRED}},
  {name: 'unknown leader field', create: (valid) => Object.freeze({...valid,
    leaderMode: 'unknown-leader-mode'}), expected: {message: UNSUPPORTED_LEADER}},
  {name: 'null leader field', create: (valid) => Object.freeze({...valid,
    leaderMode: null}), expected: {message: UNSUPPORTED_LEADER}},
  {name: 'unknown mode before unknown leader', create: (valid) => Object.freeze({...valid,
    authoritativeReadMode: 'unknown-owner-mode', leaderMode: 'unknown-leader-mode'}),
  expected: {message: UNSUPPORTED_MODE}},
  {name: 'complete local contradiction', create: (valid) => Object.freeze({...valid,
    authoritativeReadMode: MODE.OWNER_LOCAL_ONLY,
    authoritativeObservationScope: SCOPE.COMPLETE_TABLE}), expected: {code: CONTRADICTION}},
];

for (const ingress of ['gateway', 'view']) {
  for (const control of INVALID_TOKENS) {
    test(`${ingress} refuses frozen ${control.name} before callbacks or owner work`, async (t) => {
      const f = ingressFixture(ingress);
      const authority = control.create(selectedAuthority(), f.calls);
      await t.rejects(f.read(authority), control.expected);
      t.equal(f.calls.getters, 0, 'authority validation does not invoke an accessor');
      t.equal(f.calls.proxyTraps, 0, 'authority validation does not interrogate a proxy');
      t.equal(f.calls.serializations, 0, 'the rejected carrier never participates in identity');
      t.equal(f.calls.identities, 0);
      t.equal(f.calls.admissions, 0);
      t.equal(f.calls.owner.length, 0);
      t.equal(f.calls.cache, 0);
      t.equal(f.inFlight.size, 0);
    });
  }
  for (const representation of ['ordinary', 'null prototype']) {
    test(`${ingress} executes the exact complete ${representation} owned-data token`, async (t) => {
      const f = ingressFixture(ingress);
      const original = selectedAuthority();
      const authority = representation === 'ordinary' ? original :
        Object.freeze(Object.assign(Object.create(null), original));
      const result = await f.read(authority);
      t.equal(result.success, true);
      t.same(result.rows, [ROW]);
      t.equal(f.calls.owner.length, 1);
      t.equal(f.calls.owner[0].requestOptions.readAuthority, authority,
        'validation returns the selected object, not a replacement token');
      t.same(f.calls.owner[0].params, [NODE_ID]);
      t.equal(f.calls.identities, 1);
      t.equal(f.calls.admissions, 1);
      t.equal(f.calls.cache, 0);
      t.equal(f.inFlight.size, 0);
    });
  }
}

for (const leaderMode of ['unknown-leader-mode', null]) {
  test(`authority construction refuses explicit ${String(leaderMode)} leader intent`, (t) => {
    t.throws(() => buildControlPlaneReadAuthority({
      authoritativeReadMode: MODE.OWNER_RPC_REQUIRED, leaderMode,
    }), {message: UNSUPPORTED_LEADER});
    t.end();
  });
}

test('authority construction defaults only absent leader intent', (t) => {
  const ordinary = buildControlPlaneReadAuthority({
    authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
  });
  const complete = buildControlPlaneReadAuthority({
    authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
    authoritativeObservationScope: SCOPE.COMPLETE_TABLE,
  });
  t.equal(ordinary.leaderMode, LEADER.ANY);
  t.equal(complete.leaderMode, LEADER.REQUIRED);
  t.equal(Object.isFrozen(ordinary), true);
  t.equal(Object.isFrozen(complete), true);
  t.end();
});
