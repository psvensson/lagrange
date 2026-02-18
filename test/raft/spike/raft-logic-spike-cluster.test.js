import {test} from '../../../src/test-helpers/tap.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {RaftLogicSpikeCluster} from '../../../src/raft/spike/raft-logic-spike-cluster.js';

test('RaftLogicSpikeCluster elects leader and forwards follower writes', async (t) => {
  const cluster = new RaftLogicSpikeCluster({size: 3});

  try {
    await cluster.start();
    const leaderId = await cluster.waitForStableLeader();
    t.ok(leaderId);

    const statusSnapshots = await cluster.getStatusSnapshots();
    const follower = statusSnapshots.find((snapshot) =>
      snapshot.replicaId !== leaderId,
    );
    t.ok(follower);

    const writeResult = await cluster.proposeFromReplica(
      follower.replicaId,
      {type: 'follower_forward_test', value: 'x'},
      {autoForward: true},
    );
    t.equal(typeof writeResult.index, 'number');
    t.equal(typeof writeResult.term, 'number');
  } finally {
    await cluster.stop();
  }
});

test('RaftLogicSpikeCluster supports leader failover', async (t) => {
  const cluster = new RaftLogicSpikeCluster({size: 3});

  try {
    await cluster.start();
    const beforeLeader = await cluster.waitForStableLeader();
    const failover = await cluster.triggerLeaderFailover();
    t.equal(failover.previousLeaderId, beforeLeader);
    t.not(failover.previousLeaderId, failover.nextLeaderId);
  } finally {
    await cluster.stop();
  }
});

test('RaftLogicSpikeCluster supports sqlite-backed replica restart', async (t) => {
  const tempDir = join(
    tmpdir(),
    `raft-logic-spike-${randomUUID()}`,
  );
  const cluster = new RaftLogicSpikeCluster({
    size: 3,
    storageKind: 'sqlite',
    storageDir: tempDir,
  });

  try {
    await cluster.start();
    await cluster.waitForStableLeader();
    await cluster.proposeFromLeader({type: 'before_restart', value: 1});
    await cluster.restartReplica('replica-2');
    await cluster.waitForStableLeader();
    const restarted = cluster.getAdapter('replica-2');
    const status = restarted ? await restarted.refreshStatus() : null;
    t.ok(status);
    t.equal(typeof status.term, 'number');
  } finally {
    await cluster.stop();
    await rm(tempDir, {recursive: true, force: true});
  }
});

test('RaftLogicSpikeCluster supports sqlite rolling restart', async (t) => {
  const tempDir = join(
    tmpdir(),
    `raft-logic-spike-${randomUUID()}`,
  );
  const cluster = new RaftLogicSpikeCluster({
    size: 3,
    storageKind: 'sqlite',
    storageDir: tempDir,
  });

  try {
    await cluster.start();
    await cluster.waitForStableLeader();
    const rolling = await cluster.rollingRestart();

    t.equal(rolling.order.length, 3);
    t.equal(rolling.steps.length, 3);
    t.ok(rolling.finalLeaderId);

    const proposal = await cluster.proposeFromLeader({
      type: 'rolling_restart_post_write',
      value: 1,
    });
    t.equal(typeof proposal.index, 'number');
    t.equal(typeof proposal.term, 'number');
  } finally {
    await cluster.stop();
    await rm(tempDir, {recursive: true, force: true});
  }
});

test('RaftLogicSpikeCluster supports sqlite leader restart', async (t) => {
  const tempDir = join(
    tmpdir(),
    `raft-logic-spike-${randomUUID()}`,
  );
  const cluster = new RaftLogicSpikeCluster({
    size: 3,
    storageKind: 'sqlite',
    storageDir: tempDir,
  });

  try {
    await cluster.start();
    const stableLeader = await cluster.waitForStableLeader();
    const restart = await cluster.restartLeader();

    t.equal(restart.previousLeaderId, stableLeader);
    t.ok(restart.nextLeaderId);
    t.ok(restart.restart.status);

    const proposal = await cluster.proposeFromLeader({
      type: 'leader_restart_post_write',
      value: 1,
    });
    t.equal(typeof proposal.index, 'number');
    t.equal(typeof proposal.term, 'number');
  } finally {
    await cluster.stop();
    await rm(tempDir, {recursive: true, force: true});
  }
});

test('RaftLogicSpikeCluster supports sqlite crash-style restart', async (t) => {
  const tempDir = join(
    tmpdir(),
    `raft-logic-spike-${randomUUID()}`,
  );
  const cluster = new RaftLogicSpikeCluster({
    size: 3,
    storageKind: 'sqlite',
    storageDir: tempDir,
  });

  try {
    await cluster.start();
    await cluster.waitForStableLeader();

    const restart = await cluster.restartReplica('replica-2', {
      graceful: false,
    });
    t.equal(restart.graceful, false);
    t.ok(restart.status);
    await cluster.waitForStableLeader();

    const proposal = await cluster.proposeFromLeader({
      type: 'crash_restart_post_write',
      value: 1,
    });
    t.equal(typeof proposal.index, 'number');
    t.equal(typeof proposal.term, 'number');
  } finally {
    await cluster.stop();
    await rm(tempDir, {recursive: true, force: true});
  }
});
