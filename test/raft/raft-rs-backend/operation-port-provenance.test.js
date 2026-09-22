import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';
import {fileURLToPath} from 'node:url';

import {PartitionNodeCluster} from './partition-node-cluster.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('core and host outcomes are separated by execution provenance',
  async () => {
    const hostFault = {armed: false};
    const cluster = new PartitionNodeCluster({
      partitionId: 'provenance-single',
      replicaIds: ['provenance-replica'],
      applyFor: () => {
        if (hostFault.armed) {
          hostFault.armed = false;
          throw new Error('same JavaScript Error class, host provenance');
        }
      },
    });
    try {
      const port = cluster.node('provenance-replica');
      assert.equal((await port.readStatus()).outcome, 'CORE_OK');
      const refused = await port.proposeConfChange({
        transition: 999,
        changes: [],
      });
      assert.equal(refused.outcome, 'CORE_REFUSED');
      assert.equal(refused.phase, 'propose_conf_change_v2');
      assert.equal((await port.readStatus()).runtimeHealth, 'healthy',
        'a tagged refusal does not poison the WASM runtime');

      await port.campaign();
      hostFault.armed = true;
      const hostFailure = await port.propose(
        new TextEncoder().encode('host-origin-failure'));
      assert.equal(hostFailure.outcome, 'HOST_FAILURE');
      assert.equal(hostFailure.phase, 'application');
      assert.equal(hostFailure.recoveryRequired, true);
    } finally {
      cluster.dispose();
    }

    const fatalCluster = new PartitionNodeCluster({
      partitionId: 'provenance-fatal',
      replicaIds: ['fatal-a', 'fatal-b', 'fatal-c'],
    });
    try {
      assert.equal(fatalCluster.settle(() =>
        fatalCluster.leaderReplicaId() !== null), true);
      const leader = fatalCluster.leaderReplicaId();
      const victim = ['fatal-a', 'fatal-b', 'fatal-c']
        .find((replicaId) => replicaId !== leader);
      const victimStatus = fatalCluster.node(victim).readStatus();
      const originalConsoleError = console.error;
      let fatal;
      try {
        console.error = () => undefined;
        const accepted = await fatalCluster.node(victim).step({
          groupId: fatalCluster.partitionId,
          to: victimStatus.peerId,
          message: {
            from: fatalCluster.raftPeerIdOf(leader),
            to: victimStatus.peerId,
            msgType: 8,
            term: String(victimStatus.term),
            logTerm: '0',
            index: '0',
            commit: '999999',
          },
        });
        assert.equal(accepted.reason, 'inbound-enqueued');
        fatal = await fatalCluster.node(victim).tick();
      } finally {
        console.error = originalConsoleError;
      }
      assert.equal(fatal.outcome, 'CORE_FATAL');
      assert.equal(fatal.phase, 'step');
    } finally {
      fatalCluster.dispose();
    }

    const runtime = fs.readFileSync(path.join(
      ROOT, 'src', 'raft', 'raft-rs-runtime-owner.js'), 'utf8');
    assert.doesNotMatch(runtime, /instanceof\s+Error/u,
      'exception class is not used to infer core-versus-host origin');
    const binding = fs.readFileSync(path.join(
      ROOT, 'vendor', 'raft-rs-wasm', 'src', 'lib.rs'), 'utf8');
    assert.match(binding, /kind:\s*"raft-rs-refusal"/u,
      'the smallest binding change tags recoverable core refusals');
  });
