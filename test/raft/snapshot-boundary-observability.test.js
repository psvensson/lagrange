import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';
import {
  createSealedSourceGeneration,
  installSealedGeneration,
} from './snapshot-catchup-fixture.js';

// raft-snapshot-atomic-install (R3): re-checkpointability of a canonical
// raft-rs snapshot-installed replica at its own installed boundary without
// HLC regression.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const TERM = 3;
const SEALED_EPOCH = 2;
const ENTRY_COUNT = 2;
const SEALED_HLC = '1750000009999-7-node-src';
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-b',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

test('an installed raft-rs replica can re-checkpoint at its own boundary',
  async (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-recheck-'));
    let targetDb = null;
    try {
      const checkpointsRoot = path.join(workDir, 'checkpoints');
      const generation = await createSealedSourceGeneration({
        workDir,
        checkpointsRoot,
        partitionId: PARTITION_ID,
        stateTable: STATE_TABLE,
        term: TERM,
        identity: IDENTITY,
        entryCount: ENTRY_COUNT,
        entryTimestamp: SEALED_HLC,
      });
      const targetDbPath = path.join(workDir, 'target.db');
      const installed = await installSealedGeneration({
        replicaDbPath: targetDbPath,
        checkpointsRoot,
        generationIndex: generation.boundaryIndex,
        identity: IDENTITY,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'precondition: raft-rs follower catchup installed');
      targetDb = new Database(targetDbPath);
      const recheck = await createSqliteStateMachineCheckpoint({
        db: targetDb,
        identity: IDENTITY,
        checkpointsRoot: path.join(workDir, 'recheckpoints'),
        raftRsGroupId: PARTITION_ID,
      });
      t.equal(recheck.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        're-checkpointing at the installed raft-rs boundary succeeds');
      t.equal(recheck.descriptor.lastIncludedIndex, generation.boundaryIndex,
        'the re-checkpoint seals the same boundary');
      t.equal(recheck.descriptor.lastIncludedTerm, TERM,
        'the boundary term is sealed from the installed snapshot metadata');
      t.equal(recheck.descriptor.maxCommittedHlc, SEALED_HLC,
        'the sealed max HLC survives via the installed snapshot witness');
    } finally {
      if (targetDb) targetDb.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });
