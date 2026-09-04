import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {TABLES} from '../../src/constants/index.js';
import {
  NODE_LIVENESS_SEMANTIC_STATE,
  NodeLivenessSemanticProjectionOwner,
} from
  '../../src/control-plane/node-liveness-semantic-projection-owner.js';

const NOW_MS = 10_000;

function buildOwnerFixture(options = {}) {
  const timeSource = options.timeSource ||
    new VirtualTimeSource({startMs: NOW_MS});
  const row = {
    node_id: 'node-a',
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: NOW_MS - 22,
    ready_lease_expires_at: NOW_MS + 13,
  };
  const evidence = {
    localReporterLastSuccessAtMs: NOW_MS,
    transportConnected: true,
    transportGraceEligible: true,
    transportGraceStartedAtMs: NOW_MS - 10,
  };
  const changes = [];
  const owner = new NodeLivenessSemanticProjectionOwner({
    localNodeId: 'node-local',
    timeSource,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    readNodeEvidence: () => ({...evidence, nodeRow: {...row}}),
    thresholds: {
      clusterMemberStaleHeartbeatMs: 30,
      derivationGraceMs: 60,
      repairStaleHeartbeatMs: 10,
      transportGraceMs: 15,
    },
    onSemanticChange: (change) => changes.push(change),
  });
  return {changes, evidence, owner, row, timeSource};
}

test('NodeLivenessSemanticProjectionOwner keeps distinct semantic clocks and ' +
  'arms only the earliest transition', (t) => {
  const fixture = buildOwnerFixture();
  const first = fixture.owner.projectNodeLiveness('node-a', NOW_MS);

  t.equal(Object.isFrozen(first), true, 'projection is immutable');
  t.equal(
    first.heartbeatFreshness.clusterMembership,
    NODE_LIVENESS_SEMANTIC_STATE.FRESH,
    'cluster heartbeat uses its own freshness fact',
  );
  t.equal(
    first.heartbeatFreshness.derivationGrace,
    NODE_LIVENESS_SEMANTIC_STATE.FRESH,
    'derivation grace remains a distinct fact',
  );
  t.equal(
    first.leaseSemantics.state,
    NODE_LIVENESS_SEMANTIC_STATE.VALID,
    'lease validity is projected independently',
  );
  t.equal(
    first.transportSemantics.graceState,
    NODE_LIVENESS_SEMANTIC_STATE.ACTIVE,
    'transport grace has its own verdict',
  );
  t.equal(first.nextSemanticChangeAtMs, NOW_MS + 5,
    'the minimum future semantic deadline wins');
  fixture.owner.projectNodeLivenessFromEvidence('node-b', {
    nodeRow: {
      node_id: 'node-b',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: NOW_MS,
      ready_lease_expires_at: NOW_MS + 50,
    },
    transportConnected: true,
  }, NOW_MS);
  const nodeBGeneration = fixture.owner.getNodeLivenessGeneration('node-b');
  t.equal(fixture.timeSource.pendingTimerCount(), 1,
    'all dimensions and nodes share one coalesced timer');

  const generation = fixture.owner.getNodeLivenessGeneration('node-a');
  fixture.timeSource.advance(5);
  t.equal(
    fixture.owner.getNodeLivenessGeneration('node-a'),
    generation + 1,
    'the deadline timer rotates semantic generation before any consumer read',
  );
  t.equal(
    fixture.owner.getNodeLivenessGeneration('node-b'),
    nodeBGeneration,
    'the shared timer leaves unaffected nodes reusable',
  );
  const afterGrace = fixture.owner.projectNodeLiveness('node-a');
  t.equal(
    afterGrace.transportSemantics.graceState,
    NODE_LIVENESS_SEMANTIC_STATE.EXPIRED,
    'time alone expires transport grace',
  );
  t.equal(
    fixture.owner.getNodeLivenessGeneration('node-a'),
    generation + 1,
    'the time-only semantic transition rotates the node generation',
  );
  t.equal(afterGrace.nextSemanticChangeAtMs, NOW_MS + 8,
    'the owner rearms to the next distinct semantic deadline');
  t.equal(fixture.timeSource.pendingTimerCount(), 1,
    'rearming still leaves exactly one timer');

  fixture.owner.shutdown();
  t.equal(fixture.timeSource.pendingTimerCount(), 0,
    'shutdown clears the coalesced timer');
  t.end();
});

test('raw heartbeat mutation moves a deadline without rotating semantic ' +
  'generation', (t) => {
  const fixture = buildOwnerFixture();
  fixture.evidence.transportGraceEligible = false;
  fixture.row.last_heartbeat = NOW_MS - 2;
  const before = fixture.owner.projectNodeLiveness('node-a', NOW_MS);
  const generation = fixture.owner.getNodeLivenessGeneration('node-a');

  fixture.row.last_heartbeat = NOW_MS;
  fixture.owner.recordNodeSourceChange('node-a');
  const after = fixture.owner.projectNodeLiveness('node-a', NOW_MS);

  t.equal(
    fixture.owner.getNodeLivenessGeneration('node-a'),
    generation,
    'unchanged semantic verdicts preserve generation',
  );
  t.not(after.nextSemanticChangeAtMs, before.nextSemanticChangeAtMs,
    'the owner still tracks the later authoritative deadline');
  t.equal(fixture.timeSource.pendingTimerCount(), 1,
    'deadline replacement does not multiply timers');
  fixture.owner.shutdown();
  t.end();
});

test('an overdue consumer read reprojects before a delayed timer callback',
  (t) => {
    let nowMs = NOW_MS;
    const timers = [];
    const cleared = [];
    const fixture = buildOwnerFixture({
      timeSource: {now: () => nowMs},
      setTimeoutFn(callback, delayMs) {
        const handle = {callback, delayMs, unref() {}};
        timers.push(handle);
        return handle;
      },
      clearTimeoutFn: (handle) => cleared.push(handle),
    });
    const before = fixture.owner.projectNodeLiveness('node-a', NOW_MS);
    const generation = fixture.owner.getNodeLivenessGeneration('node-a');
    t.equal(timers.length, 1, 'the deadline callback is armed');

    nowMs = before.nextSemanticChangeAtMs;
    t.equal(
      fixture.owner.getNodeLivenessGeneration('node-a'),
      generation + 1,
      'generation reads catch up semantic state before timer delivery',
    );
    const after = fixture.owner.projectNodeLiveness('node-a');
    t.equal(
      after.transportSemantics.graceState,
      NODE_LIVENESS_SEMANTIC_STATE.EXPIRED,
      'read catches up semantic state before timer delivery',
    );
    t.equal(
      fixture.owner.getNodeLivenessGeneration('node-a'),
      generation + 1,
      'lazy catch-up uses the same semantic generation path',
    );
    t.ok(cleared.includes(timers[0]),
      'lazy catch-up replaces the obsolete timer handle');

    const generationBeforeLateCallback =
      fixture.owner.getNodeLivenessGeneration('node-a');
    timers[0].callback();
    t.equal(
      fixture.owner.getNodeLivenessGeneration('node-a'),
      generationBeforeLateCallback,
      'an obsolete callback cannot update projection state',
    );
    fixture.owner.shutdown();
    t.end();
  });

test('semantic-change callbacks cannot strand timers or return superseded ' +
  'projections', (t) => {
  const throwingFixture = buildOwnerFixture();
  const unsubscribeThrowing = throwingFixture.owner.subscribe(() => {
    throw new Error('semantic listener failed');
  });
  t.throws(
    () => throwingFixture.owner.projectNodeLiveness('node-a', NOW_MS),
    /semantic listener failed/u,
    'listener failure remains visible to the mutation caller',
  );
  t.equal(
    throwingFixture.timeSource.pendingTimerCount(),
    1,
    'a throwing listener cannot interrupt deadline ownership',
  );
  unsubscribeThrowing();
  throwingFixture.owner.shutdown();

  const timerFixture = buildOwnerFixture();
  timerFixture.owner.projectNodeLiveness('node-a', NOW_MS);
  timerFixture.owner.subscribe(() => {
    throw new Error('deadline listener failed');
  });
  t.throws(
    () => timerFixture.timeSource.advance(5),
    /deadline listener failed/u,
    'timer-path listener failure remains visible to the clock driver',
  );
  t.equal(
    timerFixture.timeSource.pendingTimerCount(),
    1,
    'deadline dispatch rearms through listener failure',
  );
  timerFixture.owner.shutdown();

  const reentrantFixture = buildOwnerFixture();
  const observedGenerations = [];
  reentrantFixture.owner.subscribe((change) => {
    if (change.generation !== 1) return;
    reentrantFixture.row.status = 'inactive';
    reentrantFixture.owner.recordNodeSourceChange('node-a', NOW_MS);
  });
  reentrantFixture.owner.subscribe((change) => {
    observedGenerations.push(change.generation);
  });
  const returned = reentrantFixture.owner.projectNodeLiveness(
    'node-a',
    NOW_MS,
  );
  const current = reentrantFixture.owner.projectNodeLiveness(
    'node-a',
    NOW_MS,
  );
  t.equal(returned.statusSemantics.active, false,
    'outer projection reads return the reentrant committed semantics');
  t.equal(returned, current,
    'outer and current reads share the latest immutable projection');
  t.equal(
    reentrantFixture.owner.getNodeLivenessGeneration('node-a'),
    2,
    'reentrant semantic mutation retains monotonic generation order',
  );
  t.same(observedGenerations, [1, 2],
    'all subscribers observe serialized generation order');
  t.equal(reentrantFixture.timeSource.pendingTimerCount(), 1,
    'reentrant mutation still owns one coalesced timer');
  reentrantFixture.owner.shutdown();
  t.end();
});

test('observer failure cannot truncate multi-node source or deadline batches',
  (t) => {
    const sourceTime = new VirtualTimeSource({startMs: NOW_MS});
    const rows = new Map([
      ['node-a', {
        node_id: 'node-a',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: NOW_MS,
        ready_lease_expires_at: NOW_MS + 100,
      }],
      ['node-b', {
        node_id: 'node-b',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: NOW_MS,
        ready_lease_expires_at: NOW_MS + 100,
      }],
    ]);
    const sourceOwner = new NodeLivenessSemanticProjectionOwner({
      timeSource: sourceTime,
      readNodeEvidence: (nodeId) => ({
        nodeRow: {...rows.get(nodeId)},
        transportConnected: true,
      }),
      thresholds: {
        clusterMemberStaleHeartbeatMs: 30,
        derivationGraceMs: 60,
        repairStaleHeartbeatMs: 10,
        transportGraceMs: 15,
      },
    });
    sourceOwner.projectNodeLiveness('node-a');
    sourceOwner.projectNodeLiveness('node-b');
    const sourceChanges = [];
    sourceOwner.subscribe((change) => {
      if (change.nodeId === 'node-a' && change.generation === 2) {
        throw new Error('source batch listener failed');
      }
    });
    sourceOwner.subscribe((change) => {
      sourceChanges.push(`${change.nodeId}:${change.generation}`);
    });
    rows.get('node-a').status = 'inactive';
    rows.get('node-b').status = 'inactive';
    t.throws(
      () => sourceOwner.recordAllSourceChanges(),
      /source batch listener failed/u,
      'source batch surfaces its first observer error after projection',
    );
    t.same(sourceChanges, ['node-a:2', 'node-b:2'],
      'all source-changed nodes complete before the error escapes');
    t.equal(sourceOwner.projectNodeLiveness('node-b')
      .statusSemantics.active, false,
    'the later source-changed node is current');
    t.equal(sourceTime.pendingTimerCount(), 1,
      'source batch rearms one timer');
    sourceOwner.shutdown();

    const deadlineTime = new VirtualTimeSource({startMs: NOW_MS});
    const deadlineOwner = new NodeLivenessSemanticProjectionOwner({
      timeSource: deadlineTime,
      thresholds: {
        clusterMemberStaleHeartbeatMs: 30,
        derivationGraceMs: 60,
        repairStaleHeartbeatMs: 10,
        transportGraceMs: 15,
      },
    });
    for (const nodeId of ['node-a', 'node-b']) {
      deadlineOwner.projectNodeLivenessFromEvidence(nodeId, {
        nodeRow: {
          node_id: nodeId,
          status: 'active',
          connection_state: 'ready',
          last_heartbeat: NOW_MS,
          ready_lease_expires_at: NOW_MS + 100,
        },
        transportConnected: true,
        transportGraceEligible: true,
        transportGraceStartedAtMs: NOW_MS - 10,
      });
    }
    const deadlineChanges = [];
    deadlineOwner.subscribe((change) => {
      if (change.nodeId === 'node-a' && change.generation === 2) {
        throw new Error('deadline batch listener failed');
      }
    });
    deadlineOwner.subscribe((change) => {
      deadlineChanges.push(`${change.nodeId}:${change.generation}`);
    });
    t.throws(
      () => deadlineTime.advance(5),
      /deadline batch listener failed/u,
      'deadline batch surfaces its first observer error after projection',
    );
    t.same(deadlineChanges, ['node-a:2', 'node-b:2'],
      'all co-due nodes complete before the error escapes');
    t.equal(deadlineOwner.projectNodeLiveness('node-b')
      .transportSemantics.graceState,
    NODE_LIVENESS_SEMANTIC_STATE.EXPIRED,
    'the later co-due node is current');
    t.equal(deadlineTime.pendingTimerCount(), 1,
      'deadline batch rearms one timer');
    deadlineOwner.shutdown();
    t.end();
  });

test('shutdown prevents post-shutdown semantic updates', (t) => {
  const timers = [];
  const fixture = buildOwnerFixture({
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs, unref() {}};
      timers.push(handle);
      return handle;
    },
    clearTimeoutFn: () => {},
  });
  fixture.owner.projectNodeLiveness('node-a', NOW_MS);
  const generation = fixture.owner.getNodeLivenessGeneration('node-a');
  fixture.owner.shutdown();
  timers[0].callback();

  t.equal(
    fixture.owner.getNodeLivenessGeneration('node-a'),
    generation,
    'late timer delivery cannot mutate a stopped owner',
  );
  t.equal(fixture.changes.length, 1,
    'only the initial semantic projection was published');
  t.end();
});

test('the real readiness service owns write-driven and time-only liveness ' +
  'projection changes', (t) => {
  const timeSource = new VirtualTimeSource({startMs: 1_000});
  let row = {
    node_id: 'node-a',
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: 1_000,
    ready_lease_expires_at: 20_000,
  };
  const cacheListeners = new Set();
  const routerListenersByEvent = new Map();
  let routerState = 'connected';
  const cache = {
    filter: () => [],
    get: (tableName, nodeId) =>
      tableName === TABLES.NODES && nodeId === 'node-a' ? row : null,
    getAll: (tableName) => tableName === TABLES.NODES ? [row] : [],
    offCacheChange: (listener) => cacheListeners.delete(listener),
    onCacheChange: (listener) => cacheListeners.add(listener),
  };
  const messageRouter = {
    emit(eventName, event) {
      for (const listener of routerListenersByEvent.get(eventName) || []) {
        listener(event);
      }
    },
    getConnectionState: () => routerState,
    getConnectedNodes: () => routerState === 'connected' ? ['node-a'] : [],
    off(eventName, listener) {
      routerListenersByEvent.get(eventName)?.delete(listener);
    },
    on(eventName, listener) {
      const listeners = routerListenersByEvent.get(eventName) || new Set();
      listeners.add(listener);
      routerListenersByEvent.set(eventName, listeners);
    },
  };
  const service = new ControlPlaneReadinessService({
    nodeId: 'node-local',
    systemTableCache: cache,
    timeSource,
    messageRouter,
  });
  const first = service.projectNodeLiveness('node-a');
  const generation = service.getNodeLivenessGeneration('node-a');
  t.type(
    service.nodeLivenessSemanticProjectionOwner,
    NodeLivenessSemanticProjectionOwner,
    'the readiness service hosts the semantic owner',
  );
  t.equal(
    service.buildNodeEvidence('node-a', row)
      .clusterMemberHeartbeatFreshness,
    NODE_LIVENESS_SEMANTIC_STATE.FRESH,
    'real readiness evidence consumes the owner projection',
  );

  row = {...row, last_heartbeat: 1_001, ready_lease_expires_at: 20_001};
  for (const listener of cacheListeners) {
    listener(TABLES.NODES, 'UPDATE', row, null);
  }
  t.equal(
    service.getNodeLivenessGeneration('node-a'),
    generation,
    'a heartbeat write that preserves every verdict does not rotate generation',
  );
  t.not(
    service.projectNodeLiveness('node-a').nextSemanticChangeAtMs,
    first.nextSemanticChangeAtMs,
    'the same write still moves the owner deadline',
  );

  timeSource.advance(10_001);
  t.equal(
    service.projectNodeLiveness('node-a').repairFreshness.state,
    NODE_LIVENESS_SEMANTIC_STATE.STALE,
    'VirtualTimeSource passage changes the real projection without a write',
  );
  t.equal(
    service.getNodeLivenessGeneration('node-a'),
    generation + 1,
    'the real time-only transition advances its per-node generation',
  );
  routerState = 'disconnected';
  messageRouter.emit('connectionClosed', {nodeId: 'node-a'});
  t.equal(
    service.projectNodeLiveness('node-a').connectionSemantics.state,
    NODE_LIVENESS_SEMANTIC_STATE.DISCONNECTED,
    'the transport owner event reprojects without waiting for a row write',
  );
  t.equal(
    service.getNodeLivenessGeneration('node-a'),
    generation + 2,
    'a changed transport verdict rotates the same semantic generation',
  );
  service.shutdown();
  t.equal(timeSource.pendingTimerCount(), 0,
    'readiness shutdown clears the liveness timer');
  t.equal(
    [...routerListenersByEvent.values()]
      .every((listeners) => listeners.size === 0),
    true,
    'readiness shutdown detaches every transport-source listener',
  );
  t.end();
});

test('hostile evidence cannot inject inherited, accessor, boxed, or coercive ' +
  'liveness facts', (t) => {
  const fixture = buildOwnerFixture();
  const validRow = {
    node_id: 'node-hostile',
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: NOW_MS,
    ready_lease_expires_at: NOW_MS + 100,
  };
  const inherited = Object.create({nodeRow: validRow});
  const inheritedProjection = fixture.owner.projectNodeLivenessFromEvidence(
    'node-inherited',
    inherited,
    NOW_MS,
  );
  t.equal(
    inheritedProjection.clusterMembershipSemantics.state,
    NODE_LIVENESS_SEMANTIC_STATE.INVALID,
    'inherited evidence is not semantic input',
  );

  let getterCalls = 0;
  const accessorEvidence = {};
  Object.defineProperty(accessorEvidence, 'nodeRow', {
    enumerable: true,
    get() {
      getterCalls++;
      return validRow;
    },
  });
  const accessorProjection = fixture.owner.projectNodeLivenessFromEvidence(
    'node-accessor',
    accessorEvidence,
    NOW_MS,
  );
  t.equal(getterCalls, 0, 'an evidence accessor is never executed');
  t.equal(
    accessorProjection.clusterMembershipSemantics.state,
    NODE_LIVENESS_SEMANTIC_STATE.INVALID,
    'accessor evidence fails closed',
  );

  let coercionCalls = 0;
  const coerciveTime = {
    [Symbol.toPrimitive]() {
      coercionCalls++;
      return NOW_MS;
    },
  };
  const boxedProjection = fixture.owner.projectNodeLivenessFromEvidence(
    Reflect.construct(String, ['node-boxed']),
    {
      nodeRow: {
        ...validRow,
        last_heartbeat: coerciveTime,
        ready_lease_expires_at: Reflect.construct(Number, [NOW_MS + 100]),
      },
    },
    NOW_MS,
  );
  t.equal(coercionCalls, 0, 'semantic numbers never invoke coercion hooks');
  t.equal(boxedProjection.nodeId, '', 'boxed node identifiers are rejected');
  t.equal(
    boxedProjection.heartbeatFreshness.clusterMembership,
    NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
    'coercive heartbeat values are unknown',
  );
  t.not(
    boxedProjection.leaseSemantics.state,
    NODE_LIVENESS_SEMANTIC_STATE.VALID,
    'boxed lease values cannot become valid',
  );

  for (const invalidNow of [NaN, Infinity, -Infinity, -0,
    Number.MAX_SAFE_INTEGER + 1, Reflect.construct(Number, [NOW_MS])]) {
    t.throws(
      () => fixture.owner.projectNodeLiveness('node-a', invalidNow),
      TypeError,
      'invalid semantic time is rejected',
    );
  }
  const overflowProjection = fixture.owner.projectNodeLivenessFromEvidence(
    'node-overflow',
    {nodeRow: {...validRow, last_heartbeat: Number.MAX_SAFE_INTEGER}},
    NOW_MS,
  );
  t.equal(
    overflowProjection.heartbeatFreshness.clusterMembership,
    NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
    'derived deadline overflow fails closed',
  );
  fixture.owner.shutdown();
  t.end();
});

test('captured intrinsics and indexed arrays keep liveness projection stable ' +
  'under prototype mutation', (t) => {
  const timers = [];
  const fixture = buildOwnerFixture({
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs, unref() {}};
      timers.push(handle);
      return handle;
    },
    clearTimeoutFn: () => {},
  });
  const originals = {
    arrayIncludes: Array.prototype.includes,
    jsonStringify: JSON.stringify,
    mapClear: Map.prototype.clear,
    mapDelete: Map.prototype.delete,
    mapEntries: Map.prototype.entries,
    mapGet: Map.prototype.get,
    mapKeys: Map.prototype.keys,
    mapSet: Map.prototype.set,
    mapValues: Map.prototype.values,
    numberIsFinite: Number.isFinite,
    objectHasOwn: Object.hasOwn,
    setAdd: Set.prototype.add,
    setClear: Set.prototype.clear,
    setDelete: Set.prototype.delete,
    setValues: Set.prototype.values,
    stringToLowerCase: String.prototype.toLowerCase,
  };
  let projected;
  let projections;
  let iteratorCalls = 0;
  const nodeIds = ['node-a'];
  Object.defineProperty(nodeIds, Symbol.iterator, {
    configurable: true,
    get() {
      iteratorCalls++;
      throw new Error('iterator must not be read');
    },
  });
  try {
    /* eslint-disable no-extend-native -- adversarial intrinsic witness */
    Object.prototype.transportConnected = false;
    Array.prototype.pollutedLivenessFact = true;
    Map.prototype.pollutedLivenessFact = true;
    Set.prototype.pollutedLivenessFact = true;
    Array.prototype.includes = () => {
      throw new Error('live Array.includes used');
    };
    JSON.stringify = () => {
      throw new Error('live JSON.stringify used');
    };
    Number.isFinite = () => {
      throw new Error('live Number.isFinite used');
    };
    Object.hasOwn = () => {
      throw new Error('live Object.hasOwn used');
    };
    String.prototype.toLowerCase = () => {
      throw new Error('live String.toLowerCase used');
    };
    Map.prototype.get = Map.prototype.set =
      Map.prototype.delete = Map.prototype.clear =
      Map.prototype.keys = Map.prototype.values = Map.prototype.entries =
        () => {
          throw new Error('live Map method used');
        };
    Set.prototype.add = Set.prototype.delete = Set.prototype.clear =
      Set.prototype.values = () => {
        throw new Error('live Set method used');
      };
    /* eslint-enable no-extend-native */
    projected = fixture.owner.projectNodeLiveness('node-a', NOW_MS);
    projections = fixture.owner.getNodeLivenessProjections(nodeIds, NOW_MS);
    fixture.owner.shutdown();
  } finally {
    /* eslint-disable no-extend-native -- restore adversarial witness */
    delete Object.prototype.transportConnected;
    delete Array.prototype.pollutedLivenessFact;
    delete Map.prototype.pollutedLivenessFact;
    delete Set.prototype.pollutedLivenessFact;
    Array.prototype.includes = originals.arrayIncludes;
    JSON.stringify = originals.jsonStringify;
    Map.prototype.clear = originals.mapClear;
    Map.prototype.delete = originals.mapDelete;
    Map.prototype.entries = originals.mapEntries;
    Map.prototype.get = originals.mapGet;
    Map.prototype.keys = originals.mapKeys;
    Map.prototype.set = originals.mapSet;
    Map.prototype.values = originals.mapValues;
    Number.isFinite = originals.numberIsFinite;
    Object.hasOwn = originals.objectHasOwn;
    Set.prototype.add = originals.setAdd;
    Set.prototype.clear = originals.setClear;
    Set.prototype.delete = originals.setDelete;
    Set.prototype.values = originals.setValues;
    String.prototype.toLowerCase = originals.stringToLowerCase;
    /* eslint-enable no-extend-native */
  }
  t.equal(
    projected.statusSemantics.active,
    true,
    'prototype and intrinsic mutation do not alter the verdict',
  );
  t.equal(
    projections['node-a'].nodeId,
    'node-a',
    'dense own array data is consumed without the iterator protocol',
  );
  t.equal(iteratorCalls, 0, 'the hostile array iterator is never observed');
  t.equal(timers.length, 1, 'intrinsic mutation cannot multiply timers');
  t.end();
});

test('readiness and planning callers contain no former local liveness clocks',
  (t) => {
    const guards = [
      ['src/control-plane/active-node-projection.js',
        /ACTIVE_NODE_HEARTBEAT_GRACE_MS|Date\.now\(\)/u,
        /projectNodeLivenessSemantics|nodeLivenessByNodeId/u],
      ['src/control-plane/control-plane-readiness-snapshot-store.js',
        /readyLeaseExpiresAt\s*<=\s*now|now\s*-\s*lastHeartbeat/u,
        /isStoredNodeLivenessCurrent/u],
      ['src/control-plane/readiness-planning-publication-contract.js',
        /hasLeaseExpired|now\s*-\s*lastHeartbeat/u,
        /captureNodeLivenessSemanticIdentity/u],
      ['src/control-plane/control-plane-readiness-diagnostics-eligibility.js',
        /normalizeDiagnosticTimestampMs|this\.now\(\)\s*-\s*lastSuccessAtMs/u,
        /localReporterSemantics/u],
      ['src/control-plane/control-plane-readiness-evidence-reasons.js',
        /const graceMs\s*=\s*15000/u,
        /recordTransportGraceEvidence/u],
      ['src/control-plane/authoritative-node-evidence-reconciler.js',
        /heartbeatAgeMs\s*>/u,
        /repairFreshness/u],
      ['src/control-plane/node-trust-state.js',
        /capturedAtMs\s*<\s*graceUntilMs/u,
        /livenessProjection/u],
      ['src/control-plane/formation-release-handoff-evidence.js',
        /readyLeaseExpiresAt\s*>\s*observedAt/u,
        /projectNodeLivenessSemantics/u],
      ['src/rebalancer/unified-rebalancer-available-nodes.js',
        /isNodeRecordReady/u,
        /projectNodeLiveness/u],
      ['src/rebalancer/unified-rebalancer-follow-up-move.js',
        /isNodeRecordReady|Date\.now\(\)/u,
        /projectNodeLiveness/u],
      ['src/rebalancer/unified-rebalancer-replica-state.js',
        /leaseExpiry\s*<=\s*Date\.now\(\)/u,
        /leaseSemantics/u],
    ];
    for (const [sourcePath, forbidden, ownerBinding] of guards) {
      const source = readFileSync(sourcePath, 'utf8');
      t.notMatch(source, forbidden,
        `${sourcePath} has no former local liveness predicate`);
      t.match(source, ownerBinding,
        `${sourcePath} binds to the semantic projection owner`);
    }
    for (const sourcePath of [
      'src/control-plane/node-liveness-semantic-projection.js',
      'src/control-plane/node-liveness-semantic-projection-owner.js',
    ]) {
      t.notMatch(readFileSync(sourcePath, 'utf8'), /Date\.now\(\)/u,
        `${sourcePath} receives numeric semantic time`);
    }
    t.end();
  });
