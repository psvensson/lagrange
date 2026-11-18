import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  HOST_FACT_SOURCE,
  HOST_FACT_STATE,
  HOST_FACT_UNAVAILABLE_REASON,
  HOST_FACTS_READING_INTERVAL_MS,
  HostResourceFactsReader,
  parseCpuTicks,
  parseNetworkInterfaceCounters,
  parsePressure,
  parseTcpSegmentCounters,
  parseWirelessLinks,
  sharedHostResourceFactsReader,
} from '../../src/diagnostics/host-resource-facts.js';
import {ResourceDiagnosticsSampler} from
  '../../src/diagnostics/resource-diagnostics-sampler.js';

// Synthetic /proc text in the kernel's format (a Wi-Fi lab host shape).
const NET_DEV = [
  'Inter-|   Receive                                                |  Transmit',
  ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets ' +
    'errs drop fifo colls carrier compressed',
  '    lo: 900 9 0 0 0 0 0 0 900 9 0 0 0 0 0 0',
  'wlp2s0: 1000 10 1 2 0 0 0 0 2000 20 3 4 0 0 0 0',
  'docker0: 5000 50 0 0 0 0 0 0 5000 50 0 0 0 0 0 0',
  'veth1a2b: 7000 70 0 0 0 0 0 0 7000 70 0 0 0 0 0 0',
  '  eno1: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
  '',
].join('\n');
const NET_SNMP = [
  'Ip: Forwarding DefaultTTL',
  'Ip: 1 64',
  'Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails ' +
    'EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts InCsumErrors',
  'Tcp: 1 200 120000 -1 10 20 1 2 3 5000 4000 40 7 9 0',
  '',
].join('\n');
const NET_WIRELESS = [
  'Inter-| sta-|   Quality        |   Discarded packets               | Missed | WE',
  ' face | tus | link level noise |  nwid  crypt   frag  retry   misc | beacon | 22',
  'wlp2s0: 0000   36.  -74.  -256        0      0      0     12      0        0',
  '',
].join('\n');
const NET_WIRELESS_HEADERS_ONLY = NET_WIRELESS.split('\n').slice(0, 2).join('\n') + '\n';
const STAT = [
  'cpu  100 5 50 800 30 2 3 10 0 0',
  'cpu0 50 2 25 400 15 1 1 5 0 0',
  'cpu1 50 3 25 400 15 1 2 5 0 0',
  'intr 1 2 3',
  '',
].join('\n');
const PRESSURE = 'some avg10=1.50 avg60=0.20 avg300=0.00 total=1234\n' +
  'full avg10=0.25 avg60=0.00 avg300=0.00 total=99\n';

function missing(path) {
  return Object.assign(new Error(`ENOENT: ${path}`), {code: 'ENOENT'});
}

test('network counters sum the physical interfaces and name them', () => {
  const fact = parseNetworkInterfaceCounters(NET_DEV);
  assert.equal(fact.state, HOST_FACT_STATE.MEASURED);
  assert.deepEqual(fact.interfaces, ['wlp2s0', 'eno1']);
  assert.equal(fact.rxBytes, 1000);
  assert.equal(fact.txBytes, 2000);
  assert.equal(fact.rxErrorsAndDrops, 3);
  assert.equal(fact.txErrorsAndDrops, 7);
});

test('an idle interface is a measured zero, a broken row is unavailable', () => {
  const idle = parseNetworkInterfaceCounters(
    NET_DEV.split('\n').filter((line) => !line.startsWith('wlp2s0')).join('\n'));
  assert.equal(idle.state, HOST_FACT_STATE.MEASURED);
  assert.equal(idle.rxBytes, 0);
  const broken = parseNetworkInterfaceCounters(NET_DEV.replace('1000 10 1 2', 'x y'));
  assert.equal(broken.state, HOST_FACT_STATE.UNAVAILABLE);
  assert.equal(broken.reason, HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
  assert.equal(Object.hasOwn(broken, 'rxBytes'), false);
});

test('TCP segment counters are read by column name', () => {
  const fact = parseTcpSegmentCounters(NET_SNMP);
  assert.equal(fact.retransmittedSegments, 40);
  assert.equal(fact.outSegments, 4000);
  assert.equal(fact.inSegments, 5000);
  assert.equal(fact.inErrors, 7);
  assert.equal(parseTcpSegmentCounters('Ip: a\nIp: 1\n').reason,
    HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
});

test('wireless link quality and signal, or the named absence of a wireless link', () => {
  const fact = parseWirelessLinks(NET_WIRELESS);
  assert.deepEqual(fact.links, [{interface: 'wlp2s0', linkQuality: 36,
    signalLevelDbm: -74, retryDiscards: 12}]);
  const wired = parseWirelessLinks(NET_WIRELESS_HEADERS_ONLY);
  assert.equal(wired.state, HOST_FACT_STATE.UNAVAILABLE);
  assert.equal(wired.reason, HOST_FACT_UNAVAILABLE_REASON.NO_WIRELESS_INTERFACE);
});

test('CPU ticks separate steal and iowait; pressure reads some and full', () => {
  const cpu = parseCpuTicks(STAT);
  assert.equal(cpu.stealTicks, 10);
  assert.equal(cpu.iowaitTicks, 30);
  assert.equal(cpu.totalTicks, 1000);
  assert.equal(cpu.cpuCount, 2);
  const pressure = parsePressure(HOST_FACT_SOURCE.PRESSURE_MEMORY, PRESSURE);
  assert.equal(pressure.someAvg10Percent, 1.5);
  assert.equal(pressure.fullAvg10Percent, 0.25);
  assert.equal(pressure.fullStalledMicroseconds, 99);
});

test('the reader gives every fact a state and never a zero for a missing source', () => {
  const files = new Map([
    [HOST_FACT_SOURCE.NET_DEV, NET_DEV],
    [HOST_FACT_SOURCE.STAT, STAT],
    ['/sys/devices/system/cpu/cpu0/thermal_throttle/core_throttle_count', '3\n'],
    ['/sys/devices/system/cpu/cpu1/thermal_throttle/core_throttle_count', '4\n'],
    ['/sys/devices/system/cpu/cpu0/thermal_throttle/package_throttle_count', '9\n'],
    ['/sys/devices/system/cpu/cpu1/thermal_throttle/package_throttle_count', '9\n'],
  ]);
  const reader = new HostResourceFactsReader({
    readText: (path) => {
      if (path === HOST_FACT_SOURCE.NET_SNMP) {
        throw Object.assign(new Error('EACCES'), {code: 'EACCES'});
      }
      if (!files.has(path)) throw missing(path);
      return files.get(path);
    },
    listDirectory: (path) => {
      if (path === HOST_FACT_SOURCE.CPU_DIRECTORY) return ['cpu0', 'cpu1', 'cpufreq'];
      throw missing(path);
    },
  });
  const facts = reader.read(1000);
  assert.equal(facts.network.rxBytes, 1000);
  assert.deepEqual(facts.thermalThrottle, {
    state: HOST_FACT_STATE.MEASURED, source: HOST_FACT_SOURCE.CPU_DIRECTORY,
    coreThrottleEvents: 7, packageThrottleEvents: 9,
  });
  assert.equal(facts.tcp.reason, HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNREADABLE);
  assert.equal(facts.wireless.reason, HOST_FACT_UNAVAILABLE_REASON.SOURCE_MISSING);
  assert.equal(facts.load.reason, HOST_FACT_UNAVAILABLE_REASON.SOURCE_MISSING);
  assert.equal(facts.thermalZones.reason, HOST_FACT_UNAVAILABLE_REASON.NO_THERMAL_ZONE);
  for (const [name, fact] of Object.entries(facts)) {
    if (name === 'capturedAt') continue;
    assert.ok(Object.values(HOST_FACT_STATE).includes(fact.state), name);
    if (fact.state === HOST_FACT_STATE.UNAVAILABLE) {
      assert.deepEqual(Object.keys(fact).sort(), ['reason', 'source', 'state'], name);
    }
  }
  // A second reading inside the reading interval reuses the first.
  assert.equal(reader.read(1000 + HOST_FACTS_READING_INTERVAL_MS - 1), facts);
  const next = reader.read(1000 + HOST_FACTS_READING_INTERVAL_MS);
  assert.notEqual(next, facts);
  // A clock that stepped back reads again instead of reusing until it catches up.
  assert.notEqual(reader.read(500), next);
});

test('the process has one host-facts reader: health buffer and samplers share its reading',
  async () => {
    const {NodeHealthBuffer, NODE_HEALTH_RETENTION} =
      await import('../../src/diagnostics/node-health-buffer.js');
    const sampler = new ResourceDiagnosticsSampler({nodeId: 'shared-reader-node'});
    const otherSampler = new ResourceDiagnosticsSampler({nodeId: 'shared-reader-node'});
    const buffer = new NodeHealthBuffer();
    assert.equal(sampler.hostFactsReader, sharedHostResourceFactsReader);
    assert.equal(otherSampler.hostFactsReader, sharedHostResourceFactsReader);
    assert.equal(buffer.hostFactsReader, sharedHostResourceFactsReader);
    // The buffer's process cadence is the reading interval, so each process
    // sample costs at most one physical reading, shared with every sampler.
    assert.equal(NODE_HEALTH_RETENTION.PROCESS_SAMPLE_INTERVAL_MS,
      HOST_FACTS_READING_INTERVAL_MS);
    const reading = sharedHostResourceFactsReader.read(Date.now());
    assert.equal(sampler.getReport().latest.host, reading,
      'a sampler inside the interval answers the same reading, not a second one');
  });

test('the resource sampler carries the host facts in its latest sample', () => {
  const host = {capturedAt: 1, network: {state: HOST_FACT_STATE.MEASURED, rxBytes: 5}};
  const sampler = new ResourceDiagnosticsSampler({
    nodeId: 'host-facts-node', hostFactsReader: {read: () => host},
  });
  assert.equal(sampler.getReport().latest.host, host);
});
