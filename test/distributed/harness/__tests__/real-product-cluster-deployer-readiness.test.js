// D04/D05/J7: readiness consumes the documented product contracts and fails
// closed. Real entry path: the per-product deployers through the facade the
// runner imports; substituted: the ssh transport (scripted answers).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  dockerRules,
  http,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayFilter,
  arrayMap,
  arraySome,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';

const HOSTS = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
const CLIENT = '10.0.0.9';
const CAMPAIGN = 'camp-readiness';
const FAST = {lagrangeImage: LAGRANGE_IMAGE,
  readiness: {attempts: 3, intervalMs: 0, timeoutMs: 30, pollIntervalMs: 1}};
const noSleep = async () => {};

function baseInput(sshRun) {
  return {hosts: HOSTS, clientIp: CLIENT, sshRun, opts: FAST, campaignId: CAMPAIGN,
    sleep: noSleep};
}

test('D05/J7: Lagrange readiness never reached throws readiness_exhausted with the ' +
  'last diagnostic and measurement never starts', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const notReady = http(503, {ready: false, phase: 'init', reasons: ['seed-contact']});
  const {sshRun, calls} = createScriptedSsh([
    ...dockerRules(ledger),
    [/curl/u, notReady],
  ]);
  await assert.rejects(deployers.deployLagrangeCluster(baseInput(sshRun)), (error) => {
    assert.equal(error.code, 'readiness_exhausted');
    assert.match(JSON.stringify(error.diagnostic), /seed-contact/u);
    return true;
  });
  assert.equal(arraySome(calls, (call) => /sys-postgres-wire\/scale/u.test(call.command)), false,
    'no public data path is opened on an unready cluster');
  assert.equal(arraySome(calls, (call) => /^docker run --rm/u.test(call.command)), false,
    'no workload or proof process starts on an unready cluster');
});

test('D05: PostgreSQL pg_isready exhaustion throws readiness_exhausted', {timeout: 300000},
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      ...dockerRules(ledger),
      [/pg_isready/u, new Error('127.0.0.1:5432 - no response (exit 2)')],
    ]);
    await assert.rejects(
      deployers.deployPostgresCluster({...baseInput(sshRun), targetId: 'pg-single-primary'}),
      (error) => {
        assert.equal(error.code, 'readiness_exhausted');
        assert.match(JSON.stringify(error.diagnostic), /no response/u);
        return true;
      });
  });

test('D05: TiDB that never reports 3 Up stores throws readiness_exhausted',
  {timeout: 300000}, async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([
      ...dockerRules(ledger),
      [/^docker exec \S+ 'mysql'/u, '0\n__exit_code=0'],
      [/curl/u, http(200, {health: true})],
    ]);
    await assert.rejects(deployers.deployTiDbCluster(baseInput(sshRun)), (error) => {
      assert.equal(error.code, 'readiness_exhausted');
      return true;
    });
  });

test('D04: a throwing semantic-proof path never yields a passed count; the deployer ' +
  'runs no ad-hoc proof statements', {timeout: 300000}, async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh([
    [/^docker run --rm[^\n]*eval\(Buffer/u, new Error('proof client failed')],
    ...lagrangeHealthyRules(ledger, {hosts: HOSTS}),
  ]);
  const result = await deployers.deployLagrangeCluster(baseInput(sshRun));
  const claimed = arrayFilter(arrayMap([].concat(result), (node) => node?.semanticProofsPassed),
    (value) => value !== undefined);
  assert.deepEqual(claimed, [], 'semantic evidence comes only from the semantic gate');
  assert.equal(arraySome(calls, (call) => stringIncludes(call.text, 'bench_proof')), false);
});
