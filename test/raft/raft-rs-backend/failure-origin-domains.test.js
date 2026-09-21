// Receipts:
//   three-failure-domains-are-structurally-distinguished-not-inferred-from-error-type
//   the-fatal-classification-boundary-encloses-only-the-wasm-invocation
//   an-ordinary-core-refusal-leaves-the-runtime-and-its-groups-usable
//   a-host-failure-is-never-upgraded-to-a-wasm-fatal
//   a-genuine-rust-trap-is-never-downgraded-to-a-host-failure
//   every-named-failure-shape-is-driven-and-its-consequences-asserted
//
// The prerequisite addendum's D1: three failure domains, structurally
// distinguished. A CORE REFUSAL is a typed outcome of a normal raft-rs
// operation and never retires a runtime. A WASM FATAL is a trap or panic
// originating in the invocation itself. A HOST FAILURE is JavaScript outside
// Rust - a SQLite write, a send hook, an address resolver, an application
// callback - which is neither, and carries its own recovery semantics.
//
// What the binding actually produces, measured (see the report of phase 1):
// its own `Err` crosses as a JavaScript STRING (jserr is
// `JsValue::from_str`), a Rust panic crosses as a `WebAssembly.RuntimeError`
// carrying "unreachable" with the reason on the panic hook's console channel,
// and host JavaScript throws whatever it throws. `error instanceof Error` is
// therefore true for a trap AND for every host failure, which is exactly the
// defect: the discriminator answers "is this an Error", and the boundary that
// asks it encloses the Ready loop's SQLite writes, the send hook, address
// resolution and the application's committed-entry callback.
//
// Every expectation here is a name owned by production or a fact read back
// off the core, the runtime host or the durable store. The failure-origin
// names are read through a namespace import so that a receipt is red because
// the owner does not name the domains yet, rather than unloadable.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import Database from 'better-sqlite3';

import * as runtimeHealthConstants
  from '../../../src/raft/raft-rs-runtime-health-constants.js';
import {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_RUNTIME_HEALTH,
  RaftRsRuntimeHost,
} from '../../../src/raft/raft-rs-runtime-health.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {createRaftRsNodeClass} from '../../../src/raft/raft-rs-node.js';
import {drainReady} from '../../../src/raft/raft-rs-ready-loop.js';
import {
  RaftRsReplicaLifecycle,
} from '../../../src/raft/raft-rs-replica-lifecycle.js';
import {
  instantiateRaftRsCore,
  raftRsBindingPaths,
} from '../../../src/raft/raft-rs-core.js';

const TEMP_PREFIX = 'raft-rs-failure-origin-';
const DB_SUFFIX = '.sqlite';
const SOLE_VOTER = '1';
const ABSENT_PEER = '2';
const GROUP_UNDER_TEST = 'group-under-test';
const UNRELATED_GROUP = 'unrelated-group';
const PAIRED_GROUP = 'paired-group';
const COMMAND = 'a-command';
const NODE_ADDRESS = 'raft-rs://failure-origin';
// A heartbeat whose commit position the receiver's log cannot hold: the
// raft-rs `fatal!` the fork's own build notes name, and the one this corpus
// already uses to produce a genuine panic.
const MSG_HEARTBEAT = 8;
const IMPOSSIBLE_COMMIT = '999999';
const FOLLOWER_TERM = '1';
const ZERO_POSITION = '0';
// wasm-bindgen's own glue reads `.length` off the argument through an
// imported JavaScript function. A value with no length makes THAT function
// throw a TypeError, in JavaScript, with no raft-rs logic involved.
const NO_BYTES_AT_ALL = null;
// A message the binding itself rejects, by shape, before any raft-rs code
// runs: serde cannot read a number as a Message.
const MALFORMED_MESSAGE = 7;
// What production's first real write hands the provider: a JavaScript object
// where the core needs bytes.
const NOT_BYTES_AT_ALL = Object.freeze({entryId: 'an-entry', command: 'write'});
const DRAIN_CYCLES_FOR_ONE_STEP = 8;

const HOST_ERROR = Object.freeze({
  SEND: 'the transport refused this packet',
  RESOLVE: 'no address is registered for this peer identity',
  APPLY: 'the application refused this committed entry',
});

// The discriminator is DERIVED from the binding, so the derivation is checked
// against the binding's own source and breaks loudly if the binding ever
// stops holding to it. Three facts, all of them structural:
//   jserr is JsValue::from_str, so a refusal is a string;
//   every Err the crate constructs goes through jserr;
//   no other JavaScript error value is built anywhere in it.
const TEXT_ENCODING = 'utf8';
const JSERR_BODY =
  /fn\s+jserr\s*\(\s*msg\s*:\s*&str\s*\)\s*->\s*JsValue\s*\{\s*JsValue::from_str\(\s*msg\s*\)\s*\}/u;
const ERR_CONSTRUCTION = /\bErr\s*\(\s*([A-Za-z_:][\w:]*)/gu;
const JSERR_NAME = 'jserr';
const OTHER_ERROR_VALUES = Object.freeze([
  /\bJsError\b/u,
  /\bjs_sys::Error\b/u,
  /\bJsValue::from\s*\(/u,
]);
// JsValue::from_str belongs to jserr alone; anywhere else it is a second
// refusal convention the discriminator does not know about.
const FROM_STR = /JsValue::from_str/gu;
const FROM_STR_OCCURRENCES_IN_JSERR = 1;
const CONVENTION_HELD = 'held';

/**
 * Whether the binding still builds every refusal the one way the
 * discriminator derives from.
 * @param {string} source - The crate source text.
 * @return {string} CONVENTION_HELD, or the reason it no longer does.
 */
function bindingRefusalConvention(source) {
  if (!JSERR_BODY.test(source)) {
    return 'jserr is no longer JsValue::from_str, so a refusal may not be ' +
      'a string at all';
  }
  for (const pattern of OTHER_ERROR_VALUES) {
    if (pattern.test(source)) {
      return `the crate builds a JavaScript error value with ${pattern}, ` +
        'which would reach the boundary as a host failure rather than as a ' +
        'refusal';
    }
  }
  const fromStr = source.match(FROM_STR) || [];
  if (fromStr.length !== FROM_STR_OCCURRENCES_IN_JSERR) {
    return `JsValue::from_str appears ${fromStr.length} times; only jserr ` +
      'may build a refusal';
  }
  for (const [, constructor] of source.matchAll(ERR_CONSTRUCTION)) {
    if (constructor !== JSERR_NAME) {
      return `an Err is constructed from ${constructor}, not jserr`;
    }
  }
  return CONVENTION_HELD;
}

/**
 * The failure-origin names the runtime-health owner publishes.
 *
 * Read through the namespace so a missing owner is a named refusal here
 * rather than an unloadable test file.
 * @return {Object} The origin names.
 */
function failureOrigins() {
  const origins = runtimeHealthConstants.RAFT_RS_FAILURE_ORIGIN;
  assert.ok(origins !== undefined,
    'the runtime-health owner must name the three failure domains; it has ' +
    'no RAFT_RS_FAILURE_ORIGIN, so origin is still inferred from the ' +
    'JavaScript Error type');
  const names = [origins.CORE_REFUSAL, origins.WASM_INVOCATION, origins.HOST];
  for (const name of names) {
    assert.equal(typeof name, 'string',
      `each failure domain must be a name, not ${String(name)}`);
  }
  assert.equal(new Set(names).size, names.length,
    'the three domains must be three distinct names');
  return origins;
}

/**
 * One runtime holding several real groups, each on its own SQLite file.
 * @param {Array<Object>} declarations - {groupId, voters}.
 * @return {Object} The fixture.
 */
function runtimeWithGroups(declarations) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const host = new RaftRsRuntimeHost({instantiate: instantiateRaftRsCore});
  const groups = new Map();
  for (const {groupId, voters} of declarations) {
    const dbFile = path.join(directory, `${groupId}${DB_SUFFIX}`);
    const db = new Database(dbFile);
    const store = new RaftRsDurableStore(db);
    host.openGroup({
      key: groupId, groupId, peerId: SOLE_VOTER, store,
      voters: voters ?? [SOLE_VOTER], learners: [],
    });
    groups.set(groupId, {groupId, dbFile, db, store});
  }
  return {
    directory,
    host,
    group: (groupId) => groups.get(groupId),
    cycle(groupId, {send, applyEntry} = {}) {
      const group = groups.get(groupId);
      return host.run(groupId, (core, handle) => drainReady({
        core, handle, store: group.store, groupId,
        send, applyEntry,
        maxCycles: DRAIN_CYCLES_FOR_ONE_STEP,
      }));
    },
    dispose() {
      for (const group of groups.values()) {
        try {
          group.db.close();
        } catch {
          // Closed by the shape under test; the files still go.
        }
      }
      fs.rmSync(directory, {recursive: true, force: true});
    },
  };
}

/**
 * Elect the sole voter of a group, so the shapes that need a leader have one.
 * @param {Object} fixture - The runtime fixture.
 * @param {string} groupId - The group.
 */
function electSoleVoter(fixture, groupId) {
  const campaigned = fixture.host.run(groupId,
    (core, handle) => core.campaign(handle));
  assert.equal(campaigned.outcome, RAFT_RS_CALL_OUTCOME.COMPLETED,
    'the sole voter must be able to campaign');
  const cycled = fixture.cycle(groupId);
  assert.equal(cycled.outcome, RAFT_RS_CALL_OUTCOME.COMPLETED,
    'and its first Ready cycle must complete');
}

/**
 * Elect the sole voter and leave a proposal the core has not yet made
 * durable, so the host work that follows really has something to persist,
 * send and apply. The core itself is asked whether it does.
 * @param {Object} fixture - The runtime fixture.
 * @param {string} groupId - The group.
 */
function readyWithWorkToDo(fixture, groupId) {
  electSoleVoter(fixture, groupId);
  const proposed = fixture.host.run(groupId,
    (core, handle) => core.propose(handle, commandBytes()));
  assert.equal(proposed.outcome, RAFT_RS_CALL_OUTCOME.COMPLETED,
    'the leader must be able to carry this proposal');
  const ready = fixture.host.run(groupId,
    (core, handle) => core.has_ready(handle));
  assert.equal(ready.value, true,
    'the core itself must say it has work for the host to do, or the shape ' +
    'below would measure a cycle that never ran');
}

/**
 * What the runtime and its groups can still do, measured after a failure.
 * @param {Object} fixture - The runtime fixture.
 * @param {string} groupId - The group the failure happened in.
 * @return {Object} {health, groupOutcome, unrelatedOutcome}.
 */
function consequencesOf(fixture, groupId) {
  return {
    health: fixture.host.health,
    groupOutcome: fixture.host.run(groupId,
      (core, handle) => core.status(handle)).outcome,
    unrelatedOutcome: fixture.host.run(UNRELATED_GROUP,
      (core, handle) => core.status(handle)).outcome,
  };
}

/**
 * The classification production gave one failure.
 * @param {Object} ran - What the trap boundary returned.
 * @return {string} The origin it named, or a description of its absence.
 */
function originOf(ran) {
  return ran.origin;
}

/** @return {Uint8Array} A command's bytes. */
function commandBytes() {
  return new TextEncoder().encode(COMMAND);
}

test('the three failure domains are structurally distinguished, not ' +
  'inferred from the JavaScript error type', async () => {
  const origin = failureOrigins();
  const fixture = runtimeWithGroups([
    {groupId: GROUP_UNDER_TEST}, {groupId: UNRELATED_GROUP},
    {groupId: PAIRED_GROUP, voters: [SOLE_VOTER, ABSENT_PEER]}]);
  try {
    // 1. The core declines a normal operation. The binding returns its Err,
    // which is not a JavaScript Error at all.
    const refused = fixture.host.run(GROUP_UNDER_TEST,
      (core, handle) => core.propose(handle, commandBytes()));
    assert.equal(originOf(refused), origin.CORE_REFUSAL,
      'a raft-rs refusal must be named a core refusal; it said ' +
      `${String(originOf(refused))} (${refused.error})`);

    // 2. Host JavaScript fails. It IS an Error, and it is not the core's.
    readyWithWorkToDo(fixture, GROUP_UNDER_TEST);
    const hostFailed = fixture.cycle(GROUP_UNDER_TEST, {
      send: () => {
        throw new Error(HOST_ERROR.SEND);
      },
    });
    assert.equal(originOf(hostFailed), origin.HOST,
      'a host send hook that throws is host JavaScript, not the core');

    // 3. The core panics. It is an Error too - and a different domain. It
    // has to be a group that will really accept the heartbeat, so it is the
    // untouched follower rather than the leader elected above.
    const trapped = fixture.host.run(PAIRED_GROUP, (core, handle) => {
      core.step(handle, {
        from: ABSENT_PEER, to: SOLE_VOTER, msgType: MSG_HEARTBEAT,
        term: FOLLOWER_TERM, logTerm: ZERO_POSITION, index: ZERO_POSITION,
        commit: IMPOSSIBLE_COMMIT,
      });
    });
    assert.equal(originOf(trapped), origin.WASM_INVOCATION,
      'a genuine panic in the invocation is the WASM domain');

    // The three are distinguished by where the failure came from, not by
    // what JavaScript type carried it: two of the three arrive as an Error
    // and they are still told apart.
    assert.equal(new Set([originOf(refused), originOf(hostFailed),
      originOf(trapped)]).size, [refused, hostFailed, trapped].length,
    'the three failures must land in three domains');

    // And the distinction is DERIVED from the binding, not assumed of it:
    // the crate's own source still builds every refusal through jserr, and
    // jserr is still JsValue::from_str.
    const source = fs.readFileSync(
      raftRsBindingPaths().forkSource, TEXT_ENCODING);
    assert.equal(bindingRefusalConvention(source), CONVENTION_HELD,
      'the discriminator is derived from this convention, so the receipt ' +
      'fails here rather than misclassifying silently');
    // Load-bearing, not decorative: the same check refuses a copy of the
    // binding that breaks the convention in each of the ways that would
    // reclassify a refusal.
    for (const broken of [
      source.replace('JsValue::from_str(msg)', 'js_sys::Error::new(msg).into()'),
      `${source}\nfn extra() -> Result<(), JsValue> { Err(JsValue::from(1)) }`,
      source.replace('.ok_or_else(|| jserr("invalid handle"))?',
        '.ok_or_else(|| JsValue::from_str("invalid handle"))?'),
    ]) {
      assert.notEqual(broken, source, 'each falsifier must really mutate it');
      assert.notEqual(bindingRefusalConvention(broken), CONVENTION_HELD,
        'a binding that broke the convention must be refused by this check');
    }
  } finally {
    fixture.dispose();
  }
});

test('the fatal classification boundary encloses only the WASM invocation',
  async () => {
    const fixture = runtimeWithGroups([
      {groupId: GROUP_UNDER_TEST}, {groupId: UNRELATED_GROUP}]);
    try {
      electSoleVoter(fixture, GROUP_UNDER_TEST);
      fixture.host.run(GROUP_UNDER_TEST,
        (core, handle) => core.propose(handle, commandBytes()));
      // The verifier's own reproduction: the replica's SQLite handle is
      // closed, so the Ready loop's durable write - host JavaScript, after a
      // successful core call - throws inside the boundary.
      fixture.group(GROUP_UNDER_TEST).db.close();
      const ran = fixture.cycle(GROUP_UNDER_TEST);
      const consequences = consequencesOf(fixture, GROUP_UNDER_TEST);

      assert.equal(consequences.health, RAFT_RS_RUNTIME_HEALTH.HEALTHY,
        'a durable-store failure must not retire the WASM runtime; the ' +
        `runtime went to ${consequences.health} (${ran.error})`);
      assert.equal(consequences.unrelatedOutcome,
        RAFT_RS_CALL_OUTCOME.COMPLETED,
        'and an unrelated group in the same runtime must still dispatch');
      assert.equal(consequences.groupOutcome, RAFT_RS_CALL_OUTCOME.COMPLETED,
        'and the group whose store failed still has a usable core');
      assert.equal(originOf(ran), failureOrigins().HOST,
        'the durable write is host JavaScript outside the invocation');
    } finally {
      fixture.dispose();
    }
  });

test('an ordinary core refusal leaves the runtime and its groups usable',
  async () => {
    const origin = failureOrigins();
    const fixture = runtimeWithGroups([
      {groupId: GROUP_UNDER_TEST}, {groupId: UNRELATED_GROUP}]);
    try {
      // A follower with no leader cannot carry a proposal: raft-rs declines
      // and returns, so nothing unwound.
      const refused = fixture.host.run(GROUP_UNDER_TEST,
        (core, handle) => core.propose(handle, commandBytes()));
      assert.equal(refused.outcome, RAFT_RS_CALL_OUTCOME.CORE_REFUSED);
      const consequences = consequencesOf(fixture, GROUP_UNDER_TEST);
      assert.equal(consequences.health, RAFT_RS_RUNTIME_HEALTH.HEALTHY);
      assert.equal(consequences.groupOutcome, RAFT_RS_CALL_OUTCOME.COMPLETED);
      assert.equal(consequences.unrelatedOutcome,
        RAFT_RS_CALL_OUTCOME.COMPLETED);
      assert.equal(originOf(refused), origin.CORE_REFUSAL);

      // And the refusal is retryable in the sense that matters: when the
      // precondition the core named is met, the same call completes.
      electSoleVoter(fixture, GROUP_UNDER_TEST);
      const retried = fixture.host.run(GROUP_UNDER_TEST,
        (core, handle) => core.propose(handle, commandBytes()));
      assert.equal(retried.outcome, RAFT_RS_CALL_OUTCOME.COMPLETED,
        'the same proposal must succeed once the core can carry it');
    } finally {
      fixture.dispose();
    }
  });

test('a host failure is never upgraded to a WASM fatal', async () => {
  const fixture = runtimeWithGroups([
    {groupId: GROUP_UNDER_TEST}, {groupId: UNRELATED_GROUP},
    {groupId: PAIRED_GROUP, voters: [SOLE_VOTER, ABSENT_PEER]}]);
  try {
    electSoleVoter(fixture, GROUP_UNDER_TEST);
    fixture.host.run(GROUP_UNDER_TEST,
      (core, handle) => core.propose(handle, commandBytes()));

    // The application's own committed-entry callback throws.
    const applyFailed = fixture.cycle(GROUP_UNDER_TEST, {
      applyEntry: () => {
        throw new Error(HOST_ERROR.APPLY);
      },
    });
    assert.equal(fixture.host.health, RAFT_RS_RUNTIME_HEALTH.HEALTHY,
      'an application callback that throws must not retire the runtime; ' +
      `it went to ${fixture.host.health}`);

    // The transport's send hook throws, with real messages in hand.
    const sendFailed = fixture.host.run(PAIRED_GROUP, (core, handle) => {
      core.campaign(handle);
      return drainReady({
        core, handle, store: fixture.group(PAIRED_GROUP).store,
        groupId: PAIRED_GROUP,
        maxCycles: DRAIN_CYCLES_FOR_ONE_STEP,
        send: (messages) => {
          assert.ok(messages.length > 0,
            'this shape must have real messages to fail on');
          throw new Error(HOST_ERROR.SEND);
        },
      });
    });
    assert.equal(fixture.host.health, RAFT_RS_RUNTIME_HEALTH.HEALTHY,
      'a send hook that throws must not retire the runtime');

    // And every group in the runtime is still usable after both.
    const consequences = consequencesOf(fixture, GROUP_UNDER_TEST);
    assert.equal(consequences.groupOutcome, RAFT_RS_CALL_OUTCOME.COMPLETED);
    assert.equal(consequences.unrelatedOutcome,
      RAFT_RS_CALL_OUTCOME.COMPLETED);
    // Both are host JavaScript, and both are named as such.
    const origin = failureOrigins();
    assert.equal(originOf(applyFailed), origin.HOST);
    assert.equal(originOf(sendFailed), origin.HOST);
  } finally {
    fixture.dispose();
  }
});

test('a genuine Rust trap is never downgraded to a host failure', async () => {
  const origin = failureOrigins();
  const fixture = runtimeWithGroups([
    {groupId: GROUP_UNDER_TEST}, {groupId: UNRELATED_GROUP}]);
  try {
    const trapped = fixture.host.run(GROUP_UNDER_TEST, (core, handle) => {
      core.step(handle, {
        from: ABSENT_PEER, to: SOLE_VOTER, msgType: MSG_HEARTBEAT,
        term: FOLLOWER_TERM, logTerm: ZERO_POSITION, index: ZERO_POSITION,
        commit: IMPOSSIBLE_COMMIT,
      });
    });
    assert.equal(trapped.outcome, RAFT_RS_CALL_OUTCOME.TRAPPED,
      'the panic must still be a fatal');
    assert.equal(originOf(trapped), origin.WASM_INVOCATION);
    assert.ok(typeof trapped.diagnosis === 'string' &&
      trapped.diagnosis.length > 0,
    'the panic hook\'s reason is the only diagnosis a trap carries');
    // And it is the INVOCATION's own capture window that holds it: the panic
    // channel is listened to for the duration of one core call and no
    // longer, so a diagnosis naming what the core itself refused can only
    // have been recorded there. This is what proves the narrowing did not
    // move the trap's capture somewhere broader.
    assert.ok(trapped.diagnosis.includes(IMPOSSIBLE_COMMIT),
      'the diagnosis must be the panic this call produced, not a later ' +
      `one: ${trapped.diagnosis}`);
    // The policy already recorded applies, unweakened by the narrowing:
    // the runtime is unhealthy and nothing dispatches into it.
    const consequences = consequencesOf(fixture, GROUP_UNDER_TEST);
    assert.equal(consequences.health,
      RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP);
    assert.equal(consequences.groupOutcome,
      RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY);
    assert.equal(consequences.unrelatedOutcome,
      RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY);
    // Recovery is the recorded one: a fresh runtime, groups restored.
    const replaced = fixture.host.replaceRuntime();
    assert.equal(replaced.health, RAFT_RS_RUNTIME_HEALTH.HEALTHY);
    assert.equal(consequencesOf(fixture, GROUP_UNDER_TEST).groupOutcome,
      RAFT_RS_CALL_OUTCOME.COMPLETED);

    // The control that says the boundary really moved, rather than the trap
    // merely surviving a boundary that still catches everything: the SAME
    // shape of work - a core call, then host code that throws - which the
    // old broad boundary classified a fatal, is now a host failure, in the
    // same runtime, immediately after a genuine trap was classified a fatal.
    const hostFailed = fixture.host.run(GROUP_UNDER_TEST, (core, handle) => {
      core.status(handle);
      throw new Error(HOST_ERROR.APPLY);
    });
    assert.equal(originOf(hostFailed), origin.HOST);
    assert.equal(fixture.host.health, RAFT_RS_RUNTIME_HEALTH.HEALTHY,
      'the broad boundary would have retired the runtime for this; only the ' +
      'invocation may do that now');
  } finally {
    fixture.dispose();
  }
});

// The seven shapes the owner named, each driven on the real core, each
// asserting the classification and the four consequences. An eighth is
// driven with them: the argument fault the generated glue itself throws,
// which is the one the verifier measured being called a fatal although no
// raft-rs logic ran.
const SHAPE = Object.freeze([
  {
    name: 'an ordinary raft-rs refusal',
    origin: (origins) => origins.CORE_REFUSAL,
    fatal: false,
    drive: (fixture) => fixture.host.run(GROUP_UNDER_TEST,
      (core, handle) => core.propose(handle, commandBytes())),
  },
  {
    name: 'a malformed argument the binding rejects before Rust runs',
    origin: (origins) => origins.CORE_REFUSAL,
    fatal: false,
    drive: (fixture) => fixture.host.run(GROUP_UNDER_TEST,
      (core, handle) => core.step(handle, MALFORMED_MESSAGE)),
  },
  {
    name: 'an argument fault thrown by the generated glue itself',
    origin: (origins) => origins.HOST,
    fatal: false,
    drive: (fixture) => fixture.host.run(GROUP_UNDER_TEST,
      (core, handle) => core.propose(handle, NO_BYTES_AT_ALL)),
  },
  {
    name: 'a SQLite failure after a successful core call',
    origin: (origins) => origins.HOST,
    fatal: false,
    drive: (fixture) => {
      readyWithWorkToDo(fixture, GROUP_UNDER_TEST);
      fixture.group(GROUP_UNDER_TEST).db.close();
      return fixture.cycle(GROUP_UNDER_TEST);
    },
  },
  {
    name: 'a send hook throwing',
    origin: (origins) => origins.HOST,
    fatal: false,
    drive: (fixture) => {
      readyWithWorkToDo(fixture, GROUP_UNDER_TEST);
      return fixture.cycle(GROUP_UNDER_TEST, {
        send: () => {
          throw new Error(HOST_ERROR.SEND);
        },
      });
    },
  },
  {
    name: 'an address resolver throwing',
    origin: (origins) => origins.HOST,
    fatal: false,
    drive: (fixture) => nodeWithAThrowingResolver(fixture).tickOnce(),
  },
  {
    name: 'an application callback throwing',
    origin: (origins) => origins.HOST,
    fatal: false,
    drive: (fixture) => {
      readyWithWorkToDo(fixture, GROUP_UNDER_TEST);
      return fixture.cycle(GROUP_UNDER_TEST, {
        applyEntry: () => {
          throw new Error(HOST_ERROR.APPLY);
        },
      });
    },
  },
  {
    name: 'a genuine Rust panic',
    origin: (origins) => origins.WASM_INVOCATION,
    fatal: true,
    drive: (fixture) => fixture.host.run(GROUP_UNDER_TEST,
      (core, handle) => core.step(handle, {
        from: ABSENT_PEER, to: SOLE_VOTER, msgType: MSG_HEARTBEAT,
        term: FOLLOWER_TERM, logTerm: ZERO_POSITION, index: ZERO_POSITION,
        commit: IMPOSSIBLE_COMMIT,
      })),
  },
]);

/**
 * The production node class, built on a group already in the runtime, whose
 * address resolver throws the way the real registry throws for a peer
 * identity it has never registered.
 * @param {Object} fixture - The runtime fixture.
 * @return {Object} The node.
 */
function nodeWithAThrowingResolver(fixture) {
  const NodeClass = createRaftRsNodeClass({
    runtimeHost: fixture.host,
    store: fixture.group(PAIRED_GROUP).store,
    groupId: PAIRED_GROUP,
    peerId: SOLE_VOTER,
    voters: [SOLE_VOTER, ABSENT_PEER],
    learners: [],
    lifecycle: new RaftRsReplicaLifecycle({
      store: fixture.group(PAIRED_GROUP).store,
      groupId: PAIRED_GROUP,
      peerId: SOLE_VOTER,
    }),
    resolvePeerAddress: () => {
      throw new Error(HOST_ERROR.RESOLVE);
    },
    deliverPacket: () => undefined,
    scheduleTick: () => undefined,
  });
  const node = new NodeClass(NODE_ADDRESS);
  const campaigned = fixture.host.run(node.key,
    (core, handle) => core.campaign(handle));
  assert.equal(campaigned.outcome, RAFT_RS_CALL_OUTCOME.COMPLETED,
    'this shape needs a node with messages to address');
  return node;
}

/**
 * Drive one shape on a runtime of its own and measure what it did.
 * @param {Object} shape - The shape declaration.
 * @return {Object} What was measured.
 */
function measureShape(shape) {
  const fixture = runtimeWithGroups([
    {groupId: GROUP_UNDER_TEST},
    {groupId: UNRELATED_GROUP},
    {groupId: PAIRED_GROUP, voters: [SOLE_VOTER, ABSENT_PEER]},
  ]);
  try {
    const ran = shape.drive(fixture);
    const consequences = consequencesOf(fixture, GROUP_UNDER_TEST);
    return {
      shape,
      origin: originOf(ran),
      error: String(ran.error),
      ...consequences,
      // Recovery, by domain: a fatal is recovered by replacing the runtime,
      // and nothing else here needs recovering at all.
      recoveredHealth: shape.fatal ?
        fixture.host.replaceRuntime().health : consequences.health,
    };
  } finally {
    fixture.dispose();
  }
}

/**
 * Propose a JavaScript object where the core needs bytes, on a leader, and
 * measure what the core and the application actually got.
 * @return {Object} What was measured.
 */
function measureObjectProposal() {
  const fixture = runtimeWithGroups([
    {groupId: GROUP_UNDER_TEST}, {groupId: UNRELATED_GROUP}]);
  try {
    electSoleVoter(fixture, GROUP_UNDER_TEST);
    const proposed = fixture.host.run(GROUP_UNDER_TEST,
      (core, handle) => core.propose(handle, NOT_BYTES_AT_ALL));
    const delivered = [];
    const cycles = fixture.cycle(GROUP_UNDER_TEST,
      {applyEntry: (entry) => delivered.push(entry)});
    return {
      proposed,
      committed: (cycles.value || [])
        .reduce((total, cycle) => total + cycle.applied.length, 0),
      deliveredToTheApplication: delivered.length,
    };
  } finally {
    fixture.dispose();
  }
}

test('every named failure shape is driven and its consequences asserted',
  async () => {
    // Every shape is driven FIRST, so what one shape's consequence asserts
    // cannot hide another shape's measurement.
    const measured = SHAPE.map((shape) => measureShape(shape));
    assert.equal(measured.length, SHAPE.length,
      'every named shape must be driven, not argued');
    for (const result of measured) {
      const {shape} = result;
      assert.equal(result.health, shape.fatal ?
        RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP :
        RAFT_RS_RUNTIME_HEALTH.HEALTHY,
      `${shape.name}: the runtime's health after it (${result.error})`);
      assert.equal(result.groupOutcome, shape.fatal ?
        RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY :
        RAFT_RS_CALL_OUTCOME.COMPLETED,
      `${shape.name}: whether its own group stayed usable`);
      assert.equal(result.unrelatedOutcome, shape.fatal ?
        RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY :
        RAFT_RS_CALL_OUTCOME.COMPLETED,
      `${shape.name}: whether an unrelated group stayed usable`);
      assert.equal(result.recoveredHealth, RAFT_RS_RUNTIME_HEALTH.HEALTHY,
        `${shape.name}: its recovery must leave a usable runtime`);
    }
    const origins = failureOrigins();
    for (const result of measured) {
      assert.equal(result.origin, result.shape.origin(origins),
        `${result.shape.name}: classified ${String(result.origin)} ` +
        `(${result.error})`);
    }

    // RECORDED, NOT REPAIRED. The owner's shape list calls this one "a
    // malformed argument the binding rejects before Rust runs". For a
    // JavaScript object - which is what production's first real write hands
    // the provider - the binding does NOT reject it: the generated glue
    // reads a length of undefined, uint8_to_vec produces no bytes, and the
    // core accepts an EMPTY command. There is no failure to classify at all,
    // which is worse than the misclassification this shape was found behind.
    // Outbound encoding is the transport quest's, so this receipt records
    // what happens rather than changing it.
    const silent = measureObjectProposal();
    assert.equal(silent.proposed.outcome, RAFT_RS_CALL_OUTCOME.COMPLETED,
      'measured: the binding does not reject an object proposal');
    assert.equal(silent.proposed.origin, null,
      'so no domain is entered and nothing is classified');
    assert.ok(silent.committed > 0,
      'and the core really committed the entry it was given');
    assert.equal(silent.deliveredToTheApplication, 0,
      'while the application was handed nothing, because the entry it ' +
      'committed carries no data at all');
  });
