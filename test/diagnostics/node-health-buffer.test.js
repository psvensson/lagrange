import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BoundedHealthSeries,
  NODE_HEALTH_RETENTION,
  NODE_HEALTH_STATE,
  NODE_HEALTH_UNAVAILABLE_REASON,
  NodeHealthBuffer,
  nodeHealthEntryCapacity,
} from '../../src/diagnostics/node-health-buffer.js';
import {
  NODE_HEALTH_COLLECTION_STATE,
  NODE_HEALTH_UNREACHABLE_REASON,
  collectClusterHealth,
  collectNodeHealth,
} from '../../src/diagnostics/node-health-collection.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const START = 10 * MINUTE;

function fakeBuffer() {
  let cpuMicros = 0;
  return new NodeHealthBuffer({
    hostFactsReader: {read: (nowMs) => ({
      capturedAt: nowMs,
      network: {state: NODE_HEALTH_STATE.MEASURED, rxBytes: nowMs, txBytes: 2 * nowMs},
      tcp: {state: NODE_HEALTH_STATE.UNAVAILABLE, reason: 'source_missing'},
    })},
    readProcess: () => {
      cpuMicros += 2_500_000;
      return {cpu: {user: cpuMicros, system: 0}, memory: {rss: 100, heapUsed: 50, external: 5}};
    },
  });
}

function fill(series, count, stepMs = SECOND) {
  for (let index = 0; index < count; index += 1) {
    series.append(START + index * stepMs, {value: index, label: `s${index}`});
  }
}

test('a series keeps the newest raw samples and folds the rest into minute buckets', () => {
  const series = new BoundedHealthSeries({rawCapacity: 10, bucketCapacity: 3});
  fill(series, 130);
  assert.equal(series.raw.length, 10);
  assert.deepEqual(series.raw.map((sample) => sample.value),
    [120, 121, 122, 123, 124, 125, 126, 127, 128, 129]);
  // 120 samples aged out: two whole minutes, each one bucket.
  assert.deepEqual(series.buckets, [
    {startMs: START, samples: 60, sum: {value: 1770}, max: {value: 59}},
    {startMs: START + MINUTE, samples: 60, sum: {value: 5370}, max: {value: 119}},
  ]);
  assert.equal(series.raw[0].label, 's120', 'non-numeric fields survive while raw');
});

test('eviction is by count, oldest bucket first, and identical for identical input', () => {
  const build = () => {
    const series = new BoundedHealthSeries({rawCapacity: 5, bucketCapacity: 3});
    fill(series, 5 + 5 * 60);
    return series;
  };
  const first = build();
  assert.equal(first.buckets.length, 3);
  assert.equal(first.evictedBuckets, 2);
  assert.deepEqual(first.buckets.map((bucket) => bucket.startMs),
    [START + 2 * MINUTE, START + 3 * MINUTE, START + 4 * MINUTE]);
  assert.equal(first.entryCount(), 8);
  assert.deepEqual(build().slice(0), first.slice(0), 'deterministic');
  // A slice keeps a bucket that overlaps the requested time.
  assert.equal(first.slice(START + 4 * MINUTE + 1).downsampled.length, 1);
});

test('the buffer samples the process on its tick cadence and never exceeds its capacity', () => {
  const buffer = fakeBuffer();
  const ticks = 2 * 60 * 60 * 4;
  for (let tick = 0; tick < ticks; tick += 1) buffer.tick(START + tick * 250);
  assert.equal(buffer.process.raw.length, NODE_HEALTH_RETENTION.PROCESS_RAW_CAPACITY);
  assert.equal(buffer.process.buckets.length, NODE_HEALTH_RETENTION.BUCKET_CAPACITY);
  const latest = buffer.process.raw.at(-1);
  // 2.5 CPU-seconds per 5 s sample is half of one core.
  assert.equal(latest.cpuPercentOfOneCore, 50);
  assert.equal(latest.maxTickGapMs, 250);
  assert.equal(latest.hostRxBytes, latest.atMs);
  assert.equal(latest.tcpRetransmittedSegments, null);
  assert.deepEqual(buffer.hostUnavailable, {tcp: 'source_missing'});
  for (let second = 0; second < 3 * 60 * 60; second += 1) {
    for (let peer = 0; peer < 20; peer += 1) {
      buffer.recordPeerTraffic(START + second * SECOND,
        {peerIdentified: true, peerNodeId: `peer-${peer}`, bytesSent: 1, framesSent: {raft: 2}});
    }
    buffer.recordServedQuery(START + second * SECOND,
      {tableName: `t${second % 40}`, queries: 1, responseBytes: 10});
    buffer.recordAckTimeout(START + second * SECOND, {targetNodeId: 'peer-0'});
    if (second % 10 === 0) buffer.recordEventLoopDelay(START + second * SECOND, {delayMaxMs: 1});
  }
  assert.ok(buffer.entryCount() <= nodeHealthEntryCapacity());
  assert.equal(buffer.peerTraffic.byKey.size, NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY);
  assert.ok(buffer.peerTraffic.evictedKeys > 0);
  assert.equal(buffer.ackTimeouts.length, NODE_HEALTH_RETENTION.ACK_TIMEOUT_CAPACITY);
  assert.equal(buffer.peerTraffic.byKey.get('peer-19').raw.at(-1).framesSent_raft, 2);
});

test('a late diagnostics tick is recorded as the tick gap of the next sample', () => {
  const buffer = fakeBuffer();
  buffer.tick(START);
  buffer.tick(START + 250);
  buffer.tick(START + 3250);
  buffer.tick(START + 5000);
  assert.equal(buffer.process.raw.at(-1).maxTickGapMs, 3000);
});

test('collectNodeHealth names why each collector has no data', () => {
  const idle = collectNodeHealth({buffer: fakeBuffer(), nowMs: START});
  for (const collector of Object.values(idle.collectors)) {
    assert.deepEqual(collector, {state: NODE_HEALTH_STATE.UNAVAILABLE,
      reason: NODE_HEALTH_UNAVAILABLE_REASON.FEED_NOT_STARTED});
  }
  const buffer = fakeBuffer();
  buffer.tick(START);
  const started = collectNodeHealth({buffer, nowMs: START});
  assert.equal(started.collectors.process.state, NODE_HEALTH_STATE.MEASURED);
  assert.equal(started.collectors.process.raw.length, 1);
  assert.equal(started.collectors.peerTraffic.reason,
    NODE_HEALTH_UNAVAILABLE_REASON.PRODUCER_NOT_ATTACHED);
  assert.equal(started.collectors.ackTimeouts.reason,
    NODE_HEALTH_UNAVAILABLE_REASON.PRODUCER_NOT_ATTACHED);
  const later = collectNodeHealth({buffer, sinceMs: START + 1, nowMs: START + 2});
  assert.equal(later.collectors.process.reason,
    NODE_HEALTH_UNAVAILABLE_REASON.NOTHING_SINCE);
  buffer.recordPeerTraffic(START, {peerIdentified: true, peerNodeId: 'p', bytesSent: 1});
  const withPeer = collectNodeHealth({buffer, nowMs: START});
  assert.equal(withPeer.collectors.peerTraffic.byKey.p.raw.length, 1);
  assert.deepEqual(withPeer.collectors.ackTimeouts.events, [],
    'no timeout from an attached producer is a measurement');
  assert.equal(withPeer.retention.entryCapacity, nodeHealthEntryCapacity());
});

test('collectClusterHealth returns an explicit unreachable entry, never an omission', async () => {
  const timers = [];
  const cleared = [];
  const answers = {
    'node-a': () => Promise.resolve({collectedAt: 1}),
    'node-silent': () => new Promise(() => {}),
    'node-broken': () => Promise.reject(new Error('connect ECONNREFUSED')),
  };
  const asked = [];
  const pending = collectClusterHealth({
    memberNodeIds: ['node-a', 'node-silent', 'node-broken'],
    timeoutMs: 700,
    sinceMs: 5,
    nowMs: 99,
    requestNodeHealth: (nodeId, bound) => {
      asked.push([nodeId, bound]);
      return answers[nodeId]();
    },
    setTimer: (fire, ms) => timers.push({fire, ms}) - 1,
    clearTimer: (timer) => cleared.push(timer),
  });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  // Only the silent node's bound is still armed; it fires.
  assert.deepEqual(cleared.sort(), [0, 2]);
  timers[1].fire();
  const result = await pending;
  assert.deepEqual(asked, [
    ['node-a', {sinceMs: 5, timeoutMs: 700}],
    ['node-silent', {sinceMs: 5, timeoutMs: 700}],
    ['node-broken', {sinceMs: 5, timeoutMs: 700}],
  ]);
  assert.deepEqual(result, {collectedAt: 99, sinceMs: 5, timeoutMs: 700, nodes: [
    {nodeId: 'node-a', state: NODE_HEALTH_COLLECTION_STATE.COLLECTED,
      health: {collectedAt: 1}},
    {nodeId: 'node-silent', state: NODE_HEALTH_COLLECTION_STATE.UNREACHABLE,
      reason: NODE_HEALTH_UNREACHABLE_REASON.NO_ANSWER_WITHIN_BOUND,
      detail: 'no answer within 700 ms'},
    {nodeId: 'node-broken', state: NODE_HEALTH_COLLECTION_STATE.UNREACHABLE,
      reason: NODE_HEALTH_UNREACHABLE_REASON.REQUEST_FAILED,
      detail: 'connect ECONNREFUSED'},
  ]});
});

test('a late answer never replaces the unreachable entry of a spent bound', async () => {
  let answer = null;
  const timers = [];
  const pending = collectClusterHealth({
    memberNodeIds: ['node-late'],
    timeoutMs: 10,
    requestNodeHealth: () => new Promise((resolvePromise) => {
      answer = resolvePromise;
    }),
    setTimer: (fire) => timers.push(fire),
    clearTimer: () => {},
  });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  timers[0]();
  answer({collectedAt: 1});
  const result = await pending;
  assert.equal(result.nodes[0].state, NODE_HEALTH_COLLECTION_STATE.UNREACHABLE);
});

// The import guard is tested in test/scripts/check-health-hint-imports.test.js.

// --- producers ------------------------------------------------------------

test('a producer sample reaches its series, stamped with the last diagnostics tick', async () => {
  const {NODE_HEALTH_SERIES, recordNodeHealthSample} =
    await import('../../src/diagnostics/node-health-buffer.js');
  const buffer = fakeBuffer();
  recordNodeHealthSample(NODE_HEALTH_SERIES.PEER_TRAFFIC,
    () => ({peerIdentified: true, peerNodeId: 'early', bytesSent: 1}), buffer);
  assert.equal(buffer.recordsBeforeFirstTick, 1, 'nothing feeds the buffer before a tick');
  assert.equal(buffer.peerTraffic.entryCount(), 0);
  buffer.tick(START);
  recordNodeHealthSample(NODE_HEALTH_SERIES.PEER_TRAFFIC,
    () => ({peerIdentified: true, peerNodeId: 'peer-1', bytesSent: 9, framesSent: {raft: 2}}), buffer);
  recordNodeHealthSample(NODE_HEALTH_SERIES.SERVED_QUERIES,
    () => ({tableName: 'replica_operations', queries: 2, responseBytes: 700}), buffer);
  recordNodeHealthSample(NODE_HEALTH_SERIES.ACK_TIMEOUTS,
    () => ({targetNodeId: 'peer-1', boundMs: 5000, payloadBytes: 12}), buffer);
  recordNodeHealthSample(NODE_HEALTH_SERIES.CDC_WAVES,
    () => ({waveMs: 40, sourceApplyMs: 3, eventCount: 5, targets: 2, failedTargets: 1}), buffer);
  recordNodeHealthSample(NODE_HEALTH_SERIES.CDC_APPLIES,
    () => ({tableName: 'services', lagMs: 120, receivedToAppliedMs: 4}), buffer);
  const collectors = collectNodeHealth({buffer, nowMs: START}).collectors;
  assert.deepEqual(collectors.peerTraffic.byKey['peer-1'].raw,
    [{atMs: START, bytesSent: 9, framesSent_raft: 2}]);
  assert.equal(collectors.servedQueries.byKey.replica_operations.downsampled[0].sum
    .responseBytes, 700);
  assert.equal(collectors.ackTimeouts.events[0].payloadBytes, 12);
  assert.deepEqual(collectors.cdcWaves.raw, [{atMs: START, waveMs: 40, sourceApplyMs: 3,
    eventCount: 5, targets: 2, failedTargets: 1}]);
  assert.deepEqual(collectors.cdcApplies.byKey.services.downsampled[0].max,
    {lagMs: 120, receivedToAppliedMs: 4});
});

test('a failing sample or series is counted and never reaches the producer', async () => {
  const {NODE_HEALTH_SERIES, recordNodeHealthSample} =
    await import('../../src/diagnostics/node-health-buffer.js');
  const buffer = fakeBuffer();
  buffer.tick(START);
  assert.doesNotThrow(() => recordNodeHealthSample(NODE_HEALTH_SERIES.CDC_WAVES, () => {
    throw new Error('trace had no targets');
  }, buffer));
  assert.doesNotThrow(() => recordNodeHealthSample('no_such_series', () => ({}), buffer));
  assert.doesNotThrow(() => recordNodeHealthSample(NODE_HEALTH_SERIES.PEER_TRAFFIC,
    () => null, buffer));
  assert.equal(buffer.recordFailures, 3);
  assert.equal(buffer.lastRecordFailure instanceof Error, true);
  assert.equal(collectNodeHealth({buffer, nowMs: START}).recordFailures, 3);
});

test('the real emitters feed the process buffer beside their console lines', async () => {
  const {sharedNodeHealthBuffer} = await import('../../src/diagnostics/node-health-buffer.js');
  const {logRouterDiagnostics} =
    await import('../../src/transport/message-router-peer-traffic-diagnostics.js');
  const {ROUTER_LOG_MSG} = await import('../../src/constants/transport.js');
  const {reportCdcEventAppliedToCache} =
    await import('../../src/message-group/cdc-handler-apply-diagnostics.js');
  const {openDurableWaveTrace, reportDurableWaveFinished, traceWaveLeaf} =
    await import('../../src/topology/cdc-group-propagation-wave-diagnostics.js');
  const {LoggingService} = await import('../../src/logging/logging-service.js');
  const {HLCTimestamp} = await import('../../src/hlc/hlc-timestamp.js');
  const logging = LoggingService.getInstance();
  const original = logging.logConsoleOnly;
  const lines = [];
  logging.logConsoleOnly = (_level, message) => lines.push(message);
  try {
    const atMs = START + 77 * MINUTE;
    sharedNodeHealthBuffer.tick(atMs);
    logRouterDiagnostics(ROUTER_LOG_MSG.PEER_TRAFFIC, {localNodeId: 'n',
      peerIdentified: true, peerNodeId: 'emit-peer',
      intervalMs: 1000, bytesSent: 11, bytesReceived: 12, bufferedAmount: 0,
      framesSent: {raft: 1}, framesReceived: {ack: 1}});
    logRouterDiagnostics(ROUTER_LOG_MSG.REMOTE_QUERY_SERVED, {tableName: 'emit_table',
      operation: 'select', sourceNodeId: 'emit-peer', queries: 1, rows: 3, responseBytes: 99,
      largestResponseBytes: 99, executionMs: 2, maxExecutionMs: 2});
    logRouterDiagnostics(ROUTER_LOG_MSG.ACK_TIMEOUT_DETAIL, {targetNodeId: 'emit-peer',
      boundMs: 5000, elapsedMs: 5001, payloadBytes: 321, bufferedAmountNow: 5, queuePending: 1});
    reportCdcEventAppliedToCache({subsystem: 'cdc-handler', tableName: 'emit_cdc_table',
      operation: 'UPDATE', timestamp: new HLCTimestamp(atMs - 250, 0, 'node-a').toString(),
      receivedAt: atMs - 10, nowMs: atMs});
    const owner = {now: () => atMs + 30, nodeId: 'n', activeDurableDeliveries: new Set()};
    const trace = openDurableWaveTrace({...owner, now: () => atMs});
    traceWaveLeaf(trace, {isSource: true, elapsedMs: 4});
    traceWaveLeaf(trace, {isSource: false, elapsedMs: 9, leaf: {groupId: 'g1'},
      answer: {success: true}});
    traceWaveLeaf(trace, {isSource: false, elapsedMs: 9, leaf: {groupId: 'g2'},
      answer: {success: false}});
    reportDurableWaveFinished(owner, {timestamp: null}, trace);
    assert.equal(lines.includes(ROUTER_LOG_MSG.PEER_TRAFFIC), true, 'the console line is kept');
    const collectors = collectNodeHealth({sinceMs: atMs, nowMs: atMs}).collectors;
    assert.equal(collectors.peerTraffic.byKey['emit-peer'].raw[0].bytesSent, 11);
    assert.equal(collectors.servedQueries.byKey.emit_table.downsampled[0].sum.responseBytes, 99);
    assert.equal(collectors.ackTimeouts.events.at(-1).payloadBytes, 321);
    assert.deepEqual(collectors.cdcApplies.byKey.emit_cdc_table.downsampled[0].max,
      {lagMs: 250, receivedToAppliedMs: 10});
    const wave = collectors.cdcWaves.raw.at(-1);
    assert.equal(wave.waveMs, 30);
    assert.equal(wave.sourceApplyMs, 4);
    assert.equal(wave.targets, 2);
    assert.equal(wave.failedTargets, 1);
    assert.equal(sharedNodeHealthBuffer.recordFailures, 0);
  } finally {
    logging.logConsoleOnly = original;
  }
});

test('with every producer at full rate the buffer still holds at most its capacity', async () => {
  const {NODE_HEALTH_SERIES, recordNodeHealthSample} =
    await import('../../src/diagnostics/node-health-buffer.js');
  const buffer = fakeBuffer();
  for (let second = 0; second < 2 * 60 * 60; second += 1) {
    buffer.tick(START + second * SECOND);
    // Every key a series can hold, each active every second (more keys than
    // that evict the least recently updated; see the keyed-series test).
    for (let key = 0; key < NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY; key += 1) {
      recordNodeHealthSample(NODE_HEALTH_SERIES.PEER_TRAFFIC,
        () => ({peerIdentified: true, peerNodeId: `peer-${key}`, bytesSent: 1}), buffer);
    }
    for (let key = 0; key < NODE_HEALTH_RETENTION.SERVED_TABLE_KEY_CAPACITY; key += 1) {
      recordNodeHealthSample(NODE_HEALTH_SERIES.SERVED_QUERIES,
        () => ({tableName: `t${key}`, queries: 1}), buffer);
      recordNodeHealthSample(NODE_HEALTH_SERIES.CDC_APPLIES,
        () => ({tableName: `t${key}`, lagMs: key}), buffer);
    }
    recordNodeHealthSample(NODE_HEALTH_SERIES.CDC_WAVES, () => ({waveMs: second}), buffer);
    recordNodeHealthSample(NODE_HEALTH_SERIES.ACK_TIMEOUTS,
      () => ({targetNodeId: 'peer-0'}), buffer);
    if (second % 10 === 0) buffer.recordEventLoopDelay(START + second * SECOND, {delayMaxMs: 1});
  }
  assert.equal(buffer.recordFailures, 0);
  assert.equal(buffer.entryCount(), nodeHealthEntryCapacity(),
    'two hours of full-rate input fill the buffer exactly to its capacity');
  assert.equal(nodeHealthEntryCapacity(), 10011);
});

// --- keyed series, peer identity and the response bound ------------------

test('a keyed series keeps the keys updated most recently and counts evictions', () => {
  const buffer = fakeBuffer();
  const capacity = NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY;
  const peer = (name, atMs) => buffer.recordPeerTraffic(atMs,
    {peerIdentified: true, peerNodeId: name, bytesSent: 1});
  for (let index = 0; index < capacity; index += 1) peer(`early-${index}`, START);
  // early-0 keeps reporting; every other early peer goes quiet while one
  // new peer per second appears.
  for (let second = 1; second < capacity; second += 1) {
    peer('early-0', START + second * SECOND);
    peer(`late-${second}`, START + second * SECOND);
  }
  const keys = [...buffer.peerTraffic.byKey.keys()];
  assert.equal(keys.length, capacity);
  assert.ok(keys.includes('early-0'), 'a key still updated is never evicted');
  for (let second = 1; second < capacity; second += 1) {
    assert.ok(keys.includes(`late-${second}`), `late-${second} is kept`);
  }
  assert.equal(keys.filter((key) => key.startsWith('early-')).length, 1,
    'the quiet early keys gave their slots to the active ones');
  assert.equal(buffer.peerTraffic.evictedKeys, capacity - 1);
  assert.equal(collectNodeHealth({buffer, nowMs: START}).collectors.peerTraffic.evictedKeys,
    capacity - 1);
});

test('a socket\'s traffic before IDENTIFY is counted and never takes a peer key', () => {
  const buffer = fakeBuffer();
  for (let index = 0; index < 3 * NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY; index += 1) {
    buffer.recordPeerTraffic(START,
      {peerIdentified: false, peerNodeId: `connection-${index}`, bytesSent: 1});
  }
  buffer.recordPeerTraffic(START, {peerNodeId: 'no-identity-fact', bytesSent: 1});
  buffer.recordPeerTraffic(START, {peerIdentified: true, peerNodeId: 'node-b', bytesSent: 1});
  assert.deepEqual([...buffer.peerTraffic.byKey.keys()], ['node-b']);
  assert.equal(buffer.peerTraffic.evictedKeys, 0);
  assert.equal(buffer.unidentifiedPeerLines, 3 * NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY + 1);
  assert.equal(collectNodeHealth({buffer, nowMs: START}).unidentifiedPeerLines,
    3 * NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY + 1);
});

test('the router names a peer line identified only under the node id its record names',
  async () => {
    const {sharedNodeHealthBuffer} = await import('../../src/diagnostics/node-health-buffer.js');
    const {PeerTrafficDiagnostics, PEER_TRAFFIC_INTERVAL_MS, reportRouterPeerTraffic} =
      await import('../../src/transport/message-router-peer-traffic-diagnostics.js');
    const {LoggingService} = await import('../../src/logging/logging-service.js');
    const logging = LoggingService.getInstance();
    const original = logging.logConsoleOnly;
    const lines = [];
    logging.logConsoleOnly = (_level, _message, context) => lines.push(context);
    try {
      let nowMs = START + 200 * MINUTE;
      const router = {
        nodeId: 'node-a',
        timeSource: {now: () => nowMs},
        peerTrafficDiagnostics: new PeerTrafficDiagnostics(),
        outboundQueues: new Map(),
        nodeConnections: new Map([
          ['node-b', {nodeId: 'node-b', connectionId: 'c-b'}],
          // An incoming socket before IDENTIFY is held under its connection id.
          ['pending-connection-1', {nodeId: null, connectionId: 'pending-connection-1'}],
        ]),
      };
      sharedNodeHealthBuffer.tick(nowMs);
      reportRouterPeerTraffic(router);
      const unidentifiedBefore = sharedNodeHealthBuffer.unidentifiedPeerLines;
      for (const key of ['node-b', 'pending-connection-1', 'closed-connection-2']) {
        router.peerTrafficDiagnostics.recordReceived(key, {}, 10, 'request');
      }
      nowMs += PEER_TRAFFIC_INTERVAL_MS;
      reportRouterPeerTraffic(router);
      const identified = Object.fromEntries(
        lines.map((line) => [line.peerNodeId, line.peerIdentified]));
      assert.deepEqual(identified, {
        'node-b': true, 'pending-connection-1': false, 'closed-connection-2': false,
      });
      assert.ok(sharedNodeHealthBuffer.peerTraffic.byKey.has('node-b'));
      assert.equal(sharedNodeHealthBuffer.peerTraffic.byKey.has('pending-connection-1'), false);
      assert.equal(sharedNodeHealthBuffer.peerTraffic.byKey.has('closed-connection-2'), false);
      assert.equal(sharedNodeHealthBuffer.unidentifiedPeerLines, unidentifiedBefore + 2);
    } finally {
      logging.logConsoleOnly = original;
    }
  });

test('a collection is bounded in bytes and counts the raw samples it withholds', async () => {
  const {NODE_HEALTH_RESPONSE_MAX_BYTES, NODE_HEALTH_RESPONSE_STATE} =
    await import('../../src/diagnostics/node-health-collection.js');
  const buffer = fakeBuffer();
  const peerCount = NODE_HEALTH_RETENTION.PEER_KEY_CAPACITY;
  const frames = {ack: 1, pong: 1, raft: 1, request: 1, response: 1, control: 1};
  for (let second = 0; second < 30 * 60; second += 1) {
    const atMs = START + second * SECOND;
    buffer.tick(atMs);
    for (let peer = 0; peer < peerCount; peer += 1) {
      buffer.recordPeerTraffic(atMs, {peerIdentified: true, peerNodeId: `node-${peer}`,
        intervalMs: 1000, bytesSent: 1, bytesReceived: 2, framesSent: frames,
        framesReceived: frames, largestFrameSentBytes: 1, largestFrameReceivedBytes: 1,
        oneWayLatencyP50Ms: 1, oneWayLatencyMaxMs: 2, oneWayLatencySamples: 3,
        omittedPeers: 0, bufferedAmount: 0, queuePending: 0, queueInFlight: 0,
        connectionState: 'connected', localNodeId: 'node-x'});
    }
  }
  const rawHeld = buffer.process.raw.length + buffer.eventLoop.raw.length +
    buffer.cdcWaves.raw.length +
    [...buffer.peerTraffic.byKey.values()].reduce((sum, series) => sum + series.raw.length, 0);
  const full = collectNodeHealth({buffer, nowMs: START, maxBytes: Number.MAX_SAFE_INTEGER});
  const fullBytes = Buffer.byteLength(JSON.stringify(full));
  assert.ok(fullBytes > NODE_HEALTH_RESPONSE_MAX_BYTES,
    `a full peer series exceeds the default bound (${fullBytes} bytes)`);
  assert.equal(full.response.state, NODE_HEALTH_RESPONSE_STATE.COMPLETE);

  const bounded = collectNodeHealth({buffer, nowMs: START});
  assert.ok(Buffer.byteLength(JSON.stringify(bounded)) <= NODE_HEALTH_RESPONSE_MAX_BYTES);
  assert.equal(bounded.response.state, NODE_HEALTH_RESPONSE_STATE.RAW_WITHHELD);
  assert.equal(bounded.response.withheldRawSamples, rawHeld, 'every withheld sample counted');
  assert.deepEqual(bounded.collectors.peerTraffic.byKey['node-0'].raw, []);
  assert.ok(bounded.collectors.peerTraffic.byKey['node-0'].downsampled.length > 0);

  const tiny = collectNodeHealth({buffer, nowMs: START, maxBytes: 4096});
  assert.equal(tiny.response.state, NODE_HEALTH_RESPONSE_STATE.OVER_BOUND);
  for (const collector of Object.values(tiny.collectors)) {
    assert.deepEqual(collector, {state: NODE_HEALTH_STATE.UNAVAILABLE,
      reason: NODE_HEALTH_UNAVAILABLE_REASON.OVER_RESPONSE_BOUND});
  }
  assert.ok(Buffer.byteLength(JSON.stringify(tiny)) <= 4096);
});
