import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {
  LINK_BASELINE_LIMIT,
  LINK_BASELINE_PHASE,
  PAIR_OUTCOME,
  PAIR_UNAVAILABLE_REASON,
  formatLinkBaselinePhase,
  hostPairs,
  linkProbeCommand,
  measureLinkBaseline,
  publishLinkBaseline,
  recordLinkBaselinePhase,
} from '../../scripts/lab/link-baseline.js';
import {
  PROBE_OUTCOME,
  PROBE_UNAVAILABLE_REASON,
  readTcpSegments,
  runLinkProbeClient,
  runLinkProbeServer,
} from '../distributed/harness/run-health/link-baseline-probe.js';
import {
  RUN_HEALTH_ARTIFACT,
} from '../distributed/harness/run-health/run-health-constants.js';

const NODES = Object.freeze([
  Object.freeze({name: 'tv', ssh: 'lab@tv', ip: '192.168.1.10'}),
  Object.freeze({name: 'adam', ssh: 'lab@adam', ip: '192.168.1.11'}),
  Object.freeze({name: 'gamla', ssh: 'lab@gamla', ip: '192.168.1.12'}),
]);
const LOOPBACK = '127.0.0.1';
const MIB = 1024 * 1024;

// Recorded shape of a client probe's standard output on a host.
function clientOutput(rttP50) {
  return 'some login banner\n' + JSON.stringify({outcome: 'measured',
    roundTripMs: {samples: [rttP50, rttP50 + 1], p50: rttP50, max: rttP50 + 1},
    upload: {bytes: 2 * MIB, elapsedMs: 800, bytesPerSecond: 2_621_440},
    download: {bytes: 2 * MIB, elapsedMs: 1000, bytesPerSecond: 2_097_152},
    tcpSegments: {retransmitted: 2, sent: 1500}}) + '\n';
}

function recordingHost(answer) {
  const calls = [];
  let active = 0;
  const run = async (node, command, options) => {
    active += 1;
    const call = {host: node.name, command, stdin: options.stdin,
      timeoutMs: options.timeoutMs, activeAtStart: active};
    calls.push(call);
    await new Promise((resolvePromise) => setImmediate(resolvePromise));
    try {
      return await answer(node, command);
    } finally {
      active -= 1;
    }
  };
  return {calls, run};
}

test('host pairs are every unordered pair once', () => {
  assert.deepEqual(hostPairs(NODES).map(([from, to]) => `${from.name}-${to.name}`),
    ['tv-adam', 'tv-gamla', 'adam-gamla']);
  assert.equal(hostPairs(NODES.slice(0, 1)).length, 0);
});

test('the probe command activates nvm, reads the probe from stdin and refuses shell text', () => {
  const command = linkProbeCommand(['client', '192.168.1.11', 8179, 5, 2097152, 1500]);
  assert.match(command, /nvm\.sh/u);
  assert.ok(command.endsWith(
    'exec node --input-type=module - client 192.168.1.11 8179 5 2097152 1500'));
  assert.throws(() => linkProbeCommand(['client', '1.2.3.4; rm -rf /', 1]), /unsafe/u);
});

test('pairs are measured one at a time: never more than two hosts busy', async () => {
  const host = recordingHost(async (_node, command) =>
    (command.includes(' server ') ? '{"outcome":"measured","connections":4}' : clientOutput(5)));
  const baseline = await measureLinkBaseline({nodes: NODES, runHostCommand: host.run,
    probeScript: 'PROBE', now: () => 1000});
  assert.equal(baseline.pairs.length, 3);
  assert.ok(baseline.pairs.every((pair) => pair.outcome === PAIR_OUTCOME.MEASURED));
  assert.deepEqual(baseline.pairs.map((pair) => [pair.from, pair.to]),
    [['tv', 'adam'], ['tv', 'gamla'], ['adam', 'gamla']]);
  assert.equal(baseline.pairs[0].upload.bytesPerSecond, 2_621_440);
  // Two commands per pair (server on `to`, client on `from`), never a third
  // host command while a pair is in flight.
  assert.equal(host.calls.length, 6);
  assert.ok(host.calls.every((call) => call.activeAtStart <= 2));
  assert.deepEqual(host.calls.map((call) => call.host),
    ['adam', 'tv', 'gamla', 'tv', 'gamla', 'adam']);
  assert.ok(host.calls.every((call) => call.stdin === 'PROBE' &&
    call.timeoutMs === LINK_BASELINE_LIMIT.COMMAND_TIMEOUT_MS));
  assert.match(host.calls[0].command, / server 192\.168\.1\.11 8179 12000$/u);
  assert.match(host.calls[1].command, / client 192\.168\.1\.11 8179 5 2097152 1500$/u);
});

test('the transfer is bounded for a shared household network', () => {
  assert.ok(2 * LINK_BASELINE_LIMIT.CAP_BYTES <= 4 * MIB, 'at most 4 MiB per pair');
  assert.ok(2 * LINK_BASELINE_LIMIT.CAP_MS + 2000 <= 5000, 'under five seconds per pair');
  assert.ok(LINK_BASELINE_LIMIT.PORT >= 8080 && LINK_BASELINE_LIMIT.PORT <= 8179);
});

test('a pair that cannot be measured is recorded with its reason, and the rest continue',
  async () => {
    const host = recordingHost(async (node, command) => {
      if (command.includes(' server ')) return '{"outcome":"measured"}';
      if (command.includes('192.168.1.11')) throw new Error('ssh failed (255): no route');
      if (command.includes('192.168.1.12') && node.name === 'tv') return 'garbage';
      return JSON.stringify({outcome: 'unavailable', reason: 'connect_failed',
        detail: 'ECONNREFUSED'});
    });
    const baseline = await measureLinkBaseline({nodes: NODES, runHostCommand: host.run,
      probeScript: 'PROBE'});
    assert.deepEqual(baseline.pairs.map((pair) => [pair.outcome, pair.reason]), [
      [PAIR_OUTCOME.UNAVAILABLE, PAIR_UNAVAILABLE_REASON.HOST_COMMAND_FAILED],
      [PAIR_OUTCOME.UNAVAILABLE, PAIR_UNAVAILABLE_REASON.PROBE_OUTPUT_UNREADABLE],
      [PAIR_OUTCOME.UNAVAILABLE, 'connect_failed'],
    ]);
    assert.equal(baseline.pairs[0].detail.client, 'ssh failed (255): no route');
    assert.ok(baseline.pairs.every((pair) => !Object.hasOwn(pair, 'upload')));
    assert.match(formatLinkBaselinePhase(baseline), /tv <-> adam: unavailable/u);
  });

test('both phases land in one file; a failed measurement is a recorded absence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lab-link-baseline-'));
  try {
    const path = join(directory, 'run.link-baseline.json');
    const pre = await recordLinkBaselinePhase({path, phase: LINK_BASELINE_PHASE.PRE_RUN,
      nodes: NODES, measure: async () => ({measuredAt: 1, pairs: [{from: 'tv', to: 'adam',
        outcome: 'measured'}]})});
    assert.deepEqual(pre.hosts[0], {name: 'tv', ip: '192.168.1.10'});
    assert.equal(pre.postRun.reason, PAIR_UNAVAILABLE_REASON.NOT_MEASURED_YET);
    await recordLinkBaselinePhase({path, phase: LINK_BASELINE_PHASE.POST_RUN, nodes: NODES,
      measure: async () => {
        throw new Error('probe source missing');
      }});
    const stored = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(stored.preRun.pairs.length, 1);
    assert.deepEqual(stored.postRun, {state: 'unavailable',
      reason: PAIR_UNAVAILABLE_REASON.MEASUREMENT_FAILED, detail: 'probe source missing',
      pairs: []});
    assert.deepEqual(stored.limits, {...LINK_BASELINE_LIMIT});
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('publishing gives each consuming scenario the complete baseline and reclassifies it',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lab-link-baseline-publish-'));
    try {
      const path = join(directory, 'run.link-baseline.json');
      const scenarioDir = join(directory, 'out', 'scenario-a');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(path, JSON.stringify({schemaVersion: 1, hosts: [],
        preRun: {pairs: []}, postRun: {pairs: []}}));
      await writeFile(`${path}.consumers`, `${scenarioDir}\n${join(directory, 'gone')}\n`);
      assert.deepEqual(await publishLinkBaseline(path), [scenarioDir]);
      assert.equal(JSON.parse(await readFile(
        join(scenarioDir, RUN_HEALTH_ARTIFACT.LINK_BASELINE), 'utf8')).schemaVersion, 1);
      const runHealth = JSON.parse(await readFile(
        join(scenarioDir, RUN_HEALTH_ARTIFACT.JSON), 'utf8'));
      assert.equal(runHealth.inputs.linkBaseline.state, 'measured');
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });

test('the probe measures round trips and bounded transfers over loopback', async () => {
  let address = null;
  const server = runLinkProbeServer({host: LOOPBACK, port: 0, lifetimeMs: 10_000,
    onListening: (listening) => {
      address = listening;
    }});
  while (address === null) await new Promise((resolvePromise) => setImmediate(resolvePromise));
  const capBytes = 300_000;
  const result = await runLinkProbeClient({host: LOOPBACK, port: address.port, pings: 4,
    capBytes, capMs: 1000, readSegments: (() => {
      let reads = 0;
      return () => ({retransmitted: 7 + (reads += 1), sent: 100 * reads});
    })()});
  assert.equal(result.outcome, PROBE_OUTCOME.MEASURED);
  assert.equal(result.roundTripMs.samples.length, 4);
  assert.ok(result.roundTripMs.max >= result.roundTripMs.p50);
  assert.equal(result.upload.bytes, capBytes, 'the upload stops at its byte cap');
  assert.equal(result.download.bytes, capBytes, 'the download stops at its byte cap');
  assert.ok(result.upload.bytesPerSecond > 0);
  assert.deepEqual(result.tcpSegments, {retransmitted: 1, sent: 100});
  // The client's quit stops the server; it does not wait out its lifetime.
  assert.deepEqual(await server, {outcome: PROBE_OUTCOME.MEASURED, reason: null,
    connections: 4});
});

test('the probe stops a transfer at its time cap', async () => {
  let address = null;
  const server = runLinkProbeServer({host: LOOPBACK, port: 0, lifetimeMs: 10_000,
    onListening: (listening) => {
      address = listening;
    }});
  while (address === null) await new Promise((resolvePromise) => setImmediate(resolvePromise));
  const result = await runLinkProbeClient({host: LOOPBACK, port: address.port, pings: 1,
    capBytes: 0xffffffff, capMs: 60, readSegments: () => null});
  assert.equal(result.outcome, PROBE_OUTCOME.MEASURED);
  assert.ok(result.upload.bytes < 0xffffffff);
  assert.ok(result.upload.elapsedMs < 2000);
  assert.equal(result.tcpSegments, null);
  await server;
});

test('the probe reports a typed failure when nothing listens', async () => {
  const free = await new Promise((resolvePromise) => {
    const probe = runLinkProbeServer({host: LOOPBACK, port: 0, lifetimeMs: 1,
      onListening: (listening) => probe.then(() => resolvePromise(listening.port))});
  });
  const result = await runLinkProbeClient({host: LOOPBACK, port: free, pings: 1,
    capBytes: 10, capMs: 10});
  assert.equal(result.outcome, PROBE_OUTCOME.UNAVAILABLE);
  assert.equal(result.reason, PROBE_UNAVAILABLE_REASON.CONNECT_FAILED);
});

test('TCP segment counters are null where the kernel exposes none', () => {
  assert.equal(readTcpSegments(() => {
    throw Object.assign(new Error('missing'), {code: 'ENOENT'});
  }), null);
  assert.deepEqual(readTcpSegments(() =>
    'Tcp: InSegs OutSegs RetransSegs\nTcp: 9 800 12\n'), {retransmitted: 12, sent: 800});
});
