/**
 * N0 scenario preflight and network byte accounting, all fixtures:
 * never creates a Docker container, network, or remote process.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  SCENARIO_TOPOLOGY_REQUIREMENT,
  run,
} from '../../scenarios/n0-physical-network-baseline.js';
import {SPREAD_UNIT} from '../scenario-host-topology.js';

const HOSTS = Object.freeze(['host:a', 'host:b', 'host:c']);
const IPS = Object.freeze(['192.168.50.10', '192.168.50.11',
  '192.168.50.12']);
const ROUTE = 'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\t' +
  'Metric\tMask\tMTU\tWindow\tIRTT\n' +
  'eth0\t00000000\t0100000A\t0003\t0\t0\t0\t' +
  '00000000\t0\t0\t0\n';

function dev(rx, tx) {
  const fields = Array(16).fill('0');
  fields[0] = String(rx);
  fields[8] = String(tx);
  return 'Inter-| Receive | Transmit\n' +
    ' face |bytes packets errs drop fifo frame compressed multicast\n' +
    '   lo: ' + Array(16).fill('0').join(' ') + '\n' +
    ' eth0: ' + fields.join(' ') + '\n';
}

function fakeCluster(opts = {}) {
  const reads = Array(3).fill(0);
  const nodes = Array.from({length: 3}, (_, i) => ({
    id: 'n0-' + i,
    role: i === 0 ? 'seed' : 'joiner',
    hostIdentity: opts.sameHost ? HOSTS[0] : HOSTS[i],
    containerId: 'container-' + i,
  }));
  const providers = Array.from({length: 3}, (_, i) => ({
    inspectContainer: async () => ({
      State: {Running: true},
      HostConfig: {NetworkMode: opts.bridgeMode ? 'bridge' : 'host'},
    }),
    execInContainer: async (id, args) => {
      assert.equal(id, 'container-' + i);
      assert.equal(args[0], 'cat');
      if (args[1] === '/proc/net/route') {
        return {exitCode: 0, stdout: opts.ambiguousRoute ?
          ROUTE + ROUTE.slice(ROUTE.indexOf('\n') + 1)
            .replace('eth0', 'wlan0') : ROUTE};
      }
      assert.equal(args[1], '/proc/net/dev');
      const sample = reads[i]++;
      const first = sample === 0;
      const before = BigInt(200 + i * 20);
      const after = opts.counterRegression ? before - 1n : before + 200n;
      return {exitCode: 0, stdout: dev(first ? before : after,
        first ? before * 2n : before * 2n + 400n)};
    },
  }));
  return {
    _providers: providers,
    _hostAssignment: [0, 1, 2],
    _config: {docker: {hostInfo: IPS.map((internalIp) => ({internalIp}))}},
    getNodes: () => nodes,
    waitForConvergence: async ({settleTimeoutMs, quietWindowMs,
      targetVoterCount}) => {
      assert.ok(settleTimeoutMs > 0 && quietWindowMs > 0);
      assert.ok(targetVoterCount >= 1);
      return {settledAfterMs: 3};
    },
  };
}

function testClock() {
  let ms = 1000;
  return {
    now: () => ms,
    sleep: async (duration) => {ms += duration;},
    intervalMs: 1200,
  };
}

test('N0 requires host-level topology authority before any capture', () => {
  assert.deepEqual(SCENARIO_TOPOLOGY_REQUIREMENT, {
    minDistinctHosts: 3,
    spreadUnit: SPREAD_UNIT.HOST,
  });
});

test('N0 measures each physical routed host interface and reports nonexclusive bytes',
  async () => {
    const result = await run(fakeCluster(), testClock());
    assert.equal(result.schema, 'lagrange-n0-physical-host-wire/1');
    assert.equal(result.distinctHosts, 3);
    assert.equal(result.spreadUnit, SPREAD_UNIT.HOST);
    assert.equal(result.includesUnrelatedHostTraffic, true);
    assert.equal(result.appExclusiveBytes, false);
    assert.equal(result.measuresPerPeerRtt, false);
    assert.equal(result.perHost.length, 3);
    assert.deepEqual(result.perHost.map((p) => p.interface),
      ['eth0', 'eth0', 'eth0']);
    assert.deepEqual(result.perHost.map((p) => p.hostId), [...HOSTS]);
    assert.deepEqual(result.perHost.map((p) => p.rxBytes),
      [200, 200, 200]);
    assert.deepEqual(result.perHost.map((p) => p.txBytes),
      [400, 400, 400]);
    assert.equal(result.aggregateHostRxBytes, 600);
    assert.equal(result.aggregateHostTxBytes, 1200);
    assert.equal(result.perHost[0].elapsedMs, 1200);
  });

test('N0 refuses three nodes on one machine rather than claiming three hosts',
  async () => {
    await assert.rejects(run(fakeCluster({sameHost: true}), testClock()),
      /three distinct physical host identities/u);
  });

test('N0 refuses host-mode spoofed by a bridge network',
  async () => {
    await assert.rejects(run(fakeCluster({bridgeMode: true}), testClock()),
      /host network namespace/u);
  });

test('N0 refuses ambiguous NIC routing instead of silently selecting eth0',
  async () => {
    await assert.rejects(run(fakeCluster({ambiguousRoute: true}), testClock()),
      /ambiguous peer interface/u);
  });

test('N0 refuses counter regressions rather than clamping them to zero',
  async () => {
    await assert.rejects(run(fakeCluster({counterRegression: true}),
      testClock()), /counter regressed/u);
  });
