/**
 * Controlled network impairment with Linux tc/netem on the hosts' real
 * egress interfaces. Applied, then VERIFIED with `tc qdisc show`, then the
 * achieved round trip is measured with ping; any step that fails is a typed
 * `impairment_failed` (after removing what was applied), never swallowed.
 * The record carries `{kind: 'tc-netem', configured, achieved}`; load
 * variables are the campaign manifest's and never change with the delay.
 */
import {
  arrayEvery,
  arrayMap,
  stringIncludes,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {dockerRunOnceCommand, errorText, shellWord} from './real-product-remote-shell.js';

const IMPAIRMENT_KIND = 'tc-netem';
const PING_COUNT = 20;
const DELAY_PATTERN = /delay (\d+(?:\.\d+)?)(us|ms|s)\b/u;
// iputils: `rtt min/avg/max/mdev = a/b/c/d ms`; busybox has no mdev and the
// statistics are then taken from the per-packet `time=` lines.
const PING_RTT_PATTERN = /min\/avg\/max(?:\/mdev)? = ([\d.]+)\/([\d.]+)\/([\d.]+)(?:\/([\d.]+))? ms/u;
const PING_COUNTS_PATTERN =
  /(\d+) packets transmitted, (\d+)(?: packets)? received.*?(\d+(?:\.\d+)?)% packet loss/u;
const PING_TIME_PATTERN = /time=([\d.]+) ms/gu;
const ROUND_TRIP_SAMPLE_PRECISION = 1000;
const UNIT_TO_MS = Object.freeze({us: 0.001, ms: 1, s: 1000});
const DELAY_TOLERANCE = 0.01;

function ifaceOf(hostMetaByIp, host) {
  const iface = hostMetaByIp.get(host)?.primaryIface;
  if (!iface) throw new Error(`no primary interface recorded for ${host}`);
  return iface;
}

function verifiedDelayMs(qdisc) {
  if (!stringIncludes(String(qdisc), 'netem')) return null;
  const match = DELAY_PATTERN.exec(String(qdisc));
  return match ? Number(match[1]) * UNIT_TO_MS[match[2]] : null;
}

async function applyOnHost({host, iface, oneWayDelayMs, sshRun, opts}) {
  await sshRun(host, opts,
    `sudo -n tc qdisc replace dev ${shellWord(iface)} root netem delay ${oneWayDelayMs}ms`);
  const qdisc = String(await sshRun(host, opts, `tc qdisc show dev ${shellWord(iface)}`));
  const delayMs = verifiedDelayMs(qdisc);
  if (delayMs === null ||
      Math.abs(delayMs - oneWayDelayMs) > oneWayDelayMs * DELAY_TOLERANCE) {
    throw new Error(`tc qdisc show on ${host} does not show netem delay ` +
      `${oneWayDelayMs}ms: ${qdisc}`);
  }
  return {host, iface, qdisc};
}

function summaryOfTimes(out) {
  const times = arrayMap([...String(out).matchAll(PING_TIME_PATTERN)], (match) => Number(match[1]));
  if (times.length === 0) return null;
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  const variance = times.reduce((sum, value) => sum + (value * value), 0) / times.length -
    (mean * mean);
  return [Math.min(...times), mean, Math.max(...times), Math.sqrt(Math.max(0, variance))];
}

function roundMs(value) {
  return Math.round(value * ROUND_TRIP_SAMPLE_PRECISION) / ROUND_TRIP_SAMPLE_PRECISION;
}

function parsePing(out, {from, to}) {
  const counts = PING_COUNTS_PATTERN.exec(out);
  const rtt = PING_RTT_PATTERN.exec(out);
  const stats = rtt && rtt[4] !== undefined ? arrayMap([rtt[1], rtt[2], rtt[3], rtt[4]], Number) :
    summaryOfTimes(out);
  if (!counts || !stats) throw new Error(`no ping summary from ${from} to ${to}: ${out}`);
  const [minMs, avgMs, maxMs, mdevMs] = arrayMap(stats, roundMs);
  return {from, to, transmitted: Number(counts[1]), received: Number(counts[2]),
    lossPercent: Number(counts[3]), minMs, avgMs, maxMs, mdevMs, samples: PING_COUNT};
}

/**
 * Round trip from `from` to `to`: PING_COUNT packets, answered as transmitted,
 * received, loss and min/avg/max/mdev. The one measurement; `shell` only moves where
 * ping runs, from `from` itself to a command built from the ping arguments on `shell.host`
 * (a helper container in a node's network namespace).
 * @param {{from: string, to: string, sshRun: Function, opts: Object,
 *   shell?: ({host: string, wrap: Function}|null)}} input
 * @return {Promise<Object>}
 */
async function measureRtt({from, to, sshRun, opts, shell = null}) {
  const argv = ['ping', '-c', String(PING_COUNT), to];
  const out = String(await sshRun(shell ? shell.host : from, opts,
    shell ? shell.wrap(argv) : arrayMap(argv, shellWord).join(' ')));
  return parsePing(out, {from, to});
}

/**
 * Where a node's pings run on the campaign bridge: a campaign-labelled, throwaway
 * helper container in the node's own network namespace (the product image has no
 * shell and no ping), started on the node's Docker host.
 * @param {{campaignId: string, image: string, host: string, containerId: string}} input
 * @return {{host: string, wrap: Function}} the `shell` of measureRtt
 */
function nodeNamespaceShell({campaignId, image, host, containerId}) {
  return {host, wrap: (argv) => dockerRunOnceCommand({campaignId, image,
    network: `container:${containerId}`, commandArgs: argv})};
}

/**
 * The round trips of one measurement moment: every ordered pair of the three
 * nodes' addresses and the load generator to the endpoint, in this order, one
 * after the other, or all at once with `parallel` (never during a measurement window, which
 * the caller owns).
 * @param {{dataHosts: Array<string>, loadGenerator: string, endpointHost: string,
 *   sshRun: Function, opts: Object, shellOf?: Function, now?: Function}} input
 * @return {Promise<{startedAt: string, endedAt: string, entries: Array<Object>}>}
 */
async function measureRoundTripMatrix({dataHosts, loadGenerator, endpointHost, sshRun, opts,
  shellOf = () => null, now = Date.now, parallel = false}) {
  const startedAt = new Date(now()).toISOString();
  // One chain of probes per source address (a source's pings share one network namespace and
  // would answer each other's ICMP identifiers if they ran at once); the chains of different
  // sources run at once under `parallel`.
  const chains = dataHosts.map((from) => dataHosts.filter((to) => to !== from).map((to) => () =>
    measureRtt({from, to, sshRun, opts, shell: shellOf(from)})));
  chains.push([() => measureRtt({from: loadGenerator, to: endpointHost, sshRun, opts})]);
  const runChain = async (chain) => {
    const done = [];
    for (const probe of chain) done.push(await probe());
    return done;
  };
  const entries = parallel ?
    (await Promise.all(chains.map(runChain))).flat() : (await runChain(chains.flat()));
  return {startedAt, endedAt: new Date(now()).toISOString(), entries};
}

/**
 * Remove netem from every host; returns what it could and could not remove.
 */
async function removeNetworkImpairment({hosts, hostMetaByIp, sshRun, opts}) {
  const outcomes = await Promise.all(arrayMap(hosts, async (host) => {
    try {
      const iface = ifaceOf(hostMetaByIp, host);
      await sshRun(host, opts, `sudo -n tc qdisc del dev ${shellWord(iface)} root`);
      const qdisc = String(await sshRun(host, opts, `tc qdisc show dev ${shellWord(iface)}`));
      return stringIncludes(qdisc, 'netem') ? {host, removed: false, qdisc} :
        {host, removed: true, qdisc};
    } catch (error) {
      return {host, removed: false, error: errorText(error)};
    }
  }));
  return {complete: arrayEvery(outcomes, (one) => one.removed), hosts: outcomes};
}

/**
 * @param {{hosts: Array<string>, rttMs: number, hostMetaByIp: Map,
 *   sshRun: Function, opts: Object, now?: Function}} input
 * @return {Promise<Object>} the record's networkImpairment section
 */
async function applyNetworkImpairment({hosts, rttMs, hostMetaByIp, sshRun, opts,
  now = Date.now}) {
  if (!Number.isFinite(rttMs) || rttMs <= 0 || hosts.length < 2) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IMPAIRMENT_FAILED,
      'tc-netem impairment needs a positive RTT and at least two hosts', {rttMs, hosts});
  }
  const oneWayDelayMs = Number((rttMs / 2).toFixed(3));
  const appliedAt = new Date(now()).toISOString();
  try {
    const verified = [];
    for (const host of hosts) {
      verified.push(await applyOnHost({host, iface: ifaceOf(hostMetaByIp, host),
        oneWayDelayMs, sshRun, opts}));
    }
    const achieved = await measureRtt({from: hosts[0], to: hosts[1], sshRun, opts});
    return {kind: IMPAIRMENT_KIND, appliedAt,
      configured: {rttMs, oneWayDelayMs, ifaces: arrayMap(verified,
        ({host, iface}) => ({host, iface}))},
      verified, achieved};
  } catch (error) {
    const removal = await removeNetworkImpairment({hosts, hostMetaByIp, sshRun, opts});
    throw deploymentFailure(DEPLOYMENT_FAILURE.IMPAIRMENT_FAILED,
      `tc-netem impairment failed: ${errorText(error)}`, {rttMs, removal});
  }
}

export {applyNetworkImpairment, measureRoundTripMatrix, measureRtt, nodeNamespaceShell};
