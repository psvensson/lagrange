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
import {errorText, shellWord} from './real-product-remote-shell.js';

const IMPAIRMENT_KIND = 'tc-netem';
const PING_COUNT = 5;
const DELAY_PATTERN = /delay (\d+(?:\.\d+)?)(us|ms|s)\b/u;
const PING_AVG_PATTERN = /= [\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+ ms/u;
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

async function measureRtt({from, to, sshRun, opts}) {
  const out = String(await sshRun(from, opts, `ping -c ${PING_COUNT} -q ${shellWord(to)}`));
  const match = PING_AVG_PATTERN.exec(out);
  if (!match) throw new Error(`no ping summary from ${from} to ${to}: ${out}`);
  return {rttMs: Number(match[1]), from, to, samples: PING_COUNT, summary: match[0]};
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

export {applyNetworkImpairment};
