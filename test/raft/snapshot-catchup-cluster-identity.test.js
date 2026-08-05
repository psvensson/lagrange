/**
 * Snapshot-checkpoint seam identity: the raft snapshot catch-up identity
 * reads the durable cluster identity (replicated CONFIG-row singleton) when
 * one is visible, falling back to deployment configuration and then the
 * pre-identity default only while no durable identity exists. This is the
 * designated seam from the durable-cluster-identity quest — no parallel
 * identity concept may be invented beside it.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildSnapshotCatchupIdentity,
  buildSnapshotCatchupIdentityFromCache,
} from '../../src/raft/snapshot-catchup.js';
import {
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
} from '../../src/raft/snapshot-catchup-constants.js';
import {
  CLUSTER_ID_CONFIG_KEY,
} from '../../src/bootstrap/cluster-identity-constants.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

const PARTITION_ID = 'nodes-p1';
const STATE_TABLE = 'nodes';
const CLUSTER_ID_DURABLE = '33333333-3333-4333-8333-333333333333';

function createCacheWithClusterId(clusterId) {
  return {
    get(table, key) {
      if (table === TABLES.CONFIG && key === CLUSTER_ID_CONFIG_KEY) {
        return clusterId === null ?
          null :
          {[COLUMN.CONFIG_VALUE]: clusterId};
      }
      return null;
    },
    getAll() {
      return [];
    },
  };
}

test('buildSnapshotCatchupIdentity prefers the durable cluster identity',
  async (t) => {
    const identity = buildSnapshotCatchupIdentity({
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      publicationRows: [],
      clusterId: CLUSTER_ID_DURABLE,
    });
    t.equal(
      identity.clusterId,
      CLUSTER_ID_DURABLE,
      'an explicit durable identity wins over the config-pinned default',
    );
  });

test('buildSnapshotCatchupIdentityFromCache reads the CONFIG-row identity',
  async (t) => {
    const identity = buildSnapshotCatchupIdentityFromCache({
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      systemTableCache: createCacheWithClusterId(CLUSTER_ID_DURABLE),
    });
    t.equal(
      identity.clusterId,
      CLUSTER_ID_DURABLE,
      'the production wiring seam reads the replicated CONFIG row',
    );
  });

test('buildSnapshotCatchupIdentityFromCache falls back only while no ' +
  'durable identity is visible', async (t) => {
  const preIdentity = buildSnapshotCatchupIdentityFromCache({
    partitionId: PARTITION_ID,
    tableName: STATE_TABLE,
    systemTableCache: createCacheWithClusterId(null),
  });
  t.equal(
    preIdentity.clusterId,
    RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
    'absent CONFIG row keeps the pre-identity fallback',
  );

  const noCache = buildSnapshotCatchupIdentityFromCache({
    partitionId: PARTITION_ID,
    tableName: STATE_TABLE,
    systemTableCache: null,
  });
  t.equal(
    noCache.clusterId,
    RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
    'a missing cache keeps the pre-identity fallback',
  );
});
