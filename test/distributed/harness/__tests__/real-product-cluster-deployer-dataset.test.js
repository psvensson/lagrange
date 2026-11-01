// D08: the dataset a run measures is the canonical one, loaded by the
// canonical adapters and verified by the workload owner (stream B1) through
// the product's public interface; this layer seeds nothing of its own and
// passes that verification through in stream A's dataset shape; an
// unverified load fails the run (comparative-benchmark-runner-workload-call-site
// and -campaign tests).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import * as deployers from '../real-product-cluster-deployers.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arraySome,
} from '../real-product-captured-intrinsics.js';

test('D08: the deployer seeds no hand-written key set of its own', {timeout: 300000},
  async () => {
    const ledger = createContainerLedger();
    const hosts = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
    const {sshRun, calls} = createScriptedSsh(lagrangeHealthyRules(ledger, {hosts}));
    await deployers.deployLagrangeCluster({hosts, clientIp: '10.0.0.9', sshRun,
      opts: {lagrangeImage: LAGRANGE_IMAGE,
        readiness: {stablePolls: 1, attempts: 2, intervalMs: 0}},
      campaignId: 'camp-dataset', sleep: async () => {}});
    assert.equal(arraySome(calls, (call) => /bench_accounts|acct-0/u.test(call.text)), false);
  });
