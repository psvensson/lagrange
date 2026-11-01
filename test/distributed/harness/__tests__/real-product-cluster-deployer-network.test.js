// D22/J11: tc/netem impairment is verified with `tc qdisc show` and the
// achieved RTT is measured; failures are typed, never swallowed.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  arrayMap,
  arraySome,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';

const HOSTS = ['10.0.0.1', '10.0.0.2'];
const META = new Map(arrayMap(HOSTS, (ip) => [ip, {primaryIface: 'ens4'}]));
const PING = 'rtt min/avg/max/mdev = 9.801/10.204/10.900/0.300 ms';

function input(sshRun) {
  return {hosts: HOSTS, rttMs: 10, hostMetaByIp: META, sshRun, opts: {}};
}

test('D22: a qdisc that does not show netem is a typed failure', async () => {
  const {sshRun, calls} = createScriptedSsh([
    [/tc qdisc show/u, 'qdisc fq_codel 0: root refcnt 2'],
  ]);
  await assert.rejects(deployers.applyNetworkImpairment(input(sshRun)),
    (error) => error.code === 'impairment_failed');
  assert.equal(arraySome(calls, (call) => stringIncludes(call.command, '|| true')), false);
  assert.ok(arraySome(calls, (call) => /tc qdisc del dev ens4 root/u.test(call.command)),
    'a partially applied impairment is removed');
});

test('D22: a tc command failure propagates as impairment_failed', async () => {
  const {sshRun} = createScriptedSsh([
    [/tc qdisc replace/u, new Error('sudo: a password is required')],
  ]);
  await assert.rejects(deployers.applyNetworkImpairment(input(sshRun)),
    (error) => error.code === 'impairment_failed' && /password/u.test(error.message));
});

test('D22: a verified impairment records configured and achieved RTT', async () => {
  const {sshRun} = createScriptedSsh([
    [/tc qdisc show/u, 'qdisc netem 8001: root refcnt 2 limit 1000 delay 5ms'],
    [/ping/u, PING],
  ]);
  const impairment = await deployers.applyNetworkImpairment(input(sshRun));
  assert.equal(impairment.kind, 'tc-netem');
  assert.equal(impairment.configured.rttMs, 10);
  assert.equal(impairment.configured.oneWayDelayMs, 5);
  assert.equal(impairment.achieved.rttMs, 10.204);
});

test('D22: an RTT that cannot be measured is a typed failure', async () => {
  const {sshRun} = createScriptedSsh([
    [/tc qdisc show/u, 'qdisc netem 8001: root refcnt 2 limit 1000 delay 5ms'],
    [/ping/u, new Error('ping: permission denied')],
  ]);
  await assert.rejects(deployers.applyNetworkImpairment(input(sshRun)),
    (error) => error.code === 'impairment_failed');
});
