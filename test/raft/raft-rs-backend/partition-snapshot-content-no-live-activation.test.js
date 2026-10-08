import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {wrapPartitionServiceFactoryWithSnapshotCatchup} from
  '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {CLUSTER_ID_CONFIG_KEY} from
  '../../../src/bootstrap/cluster-identity-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {TABLES} from '../../../src/constants/index.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {CDCOperation, PartitionService} from
  '../../../src/partition/partition-service.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  buildSnapshotCatchupDecision,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {resolveReplicaCheckpointsRoot} from
  '../../../src/raft/snapshot-install.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_CHECKPOINT_CREATION_OUTCOME, RAFT_RS_CHECKPOINT_REASON} from
  '../../../src/raft/snapshot-checkpoint-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../../src/control-plane/control-plane-system-table-gateway.js';
import {withFoundingStamp} from
  '../../partition/partition-founding-stamp.js';

const NODE_ID = 'snapshot-content-no-activation-node';
const PARTITION_ID = 'snapshot_content_no_activation-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const TABLE_NAME = 'snapshot_content_no_activation';
const CLUSTER_ID = 'snapshot-content-no-activation-cluster';
const PUBLICATION_EPOCH = 9;
const TEST_TIMEOUT_MS = 30_000;

async function waitFor(predicate, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function publicationRow() {
  return {publication_id: 'snapshot-content-publication',
    publication_kind: 'cluster_membership',
    publication_epoch: PUBLICATION_EPOCH, status: 'PUBLISHED',
    published_active_node_ids: JSON.stringify([NODE_ID]),
    required_ack_node_ids: JSON.stringify([NODE_ID]),
    acknowledged_node_ids: JSON.stringify([NODE_ID]), updated_at: 9};
}

test('dependency A registered callback cannot seal or dial v2',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    resetEnvironment();
    ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
    LoggingService.getInstance().initialize({level: 'error'});
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-no-live-'));
    const dbPath = path.join(root, `${REPLICA_ID}.db`);
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.CONFIG, CDCOperation.INSERT, {
      config_key: CLUSTER_ID_CONFIG_KEY, config_value: CLUSTER_ID,
    });
    cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
      CDCOperation.INSERT, publicationRow());
    let socketLookups = 0;
    const factory = wrapPartitionServiceFactoryWithSnapshotCatchup({
      createPartitionService: async (options) => new PartitionService({
        ...options,
        cdcIntegrationService: {
          async executeAuthoritativeSystemTableRead(
            tableName, _sql, params, readOptions) {
            assert.equal(tableName, TABLES.CONFIG);
            assert.deepEqual(params, [CLUSTER_ID_CONFIG_KEY]);
            assert.equal(readOptions.readAuthority.authoritativeReadMode,
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED);
            assert.equal(readOptions.readAuthority.leaderMode,
              CONTROL_PLANE_READ_LEADER_MODE.REQUIRED);
            return {success: true, rows: [{config_key: CLUSTER_ID_CONFIG_KEY,
              config_value: CLUSTER_ID}], readAuthorityWitness: {
              state: 'observed',
              partitionId: INITIAL_PARTITION_IDS[TABLES.CONFIG], role: 'leader',
              servingNodeId: NODE_ID, servingReplicaId: 'config-p1-r1',
              observedAtMs: 1,
            }};
          },
        },
      }),
      systemTableCache: cache,
      messageRouter: {nodeId: NODE_ID, nodeAddress: `ws://${NODE_ID}:7000`,
        advertisedAddress: `ws://${NODE_ID}:7000`, bootIncarnation: 1,
        bulkChannelRegistry: {getConnection() {
          socketLookups += 1; return null;
        },
        async dial() {
          socketLookups += 1; return null;
        }}},
    });
    let service;
    let observer;
    try {
      service = await factory(withFoundingStamp({partitionId: PARTITION_ID,
        tableId: TABLE_NAME, tableName: TABLE_NAME, replicaId: REPLICA_ID,
        replicaIds: [REPLICA_ID], nodeId: NODE_ID, dbPath,
        schema: {tableName: TABLE_NAME, columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'payload', type: 'TEXT', notNull: true},
        ], indices: []}}));
      await service.initialize();
      observer = new Database(dbPath, {readonly: true, fileMustExist: true});
      await waitFor(() => service.getRole() === 'leader',
        'single voter did not become leader');
      assert.equal((await service.insertData(TABLE_NAME,
        {id: 'row', payload: 'acknowledged'})).success, true);
      await waitFor(() => observer.prepare(
        `SELECT payload FROM ${TABLE_NAME} WHERE id = ?`).get('row')?.payload ===
        'acknowledged', 'application row did not become durable');
      const record = RaftRsDurableStore.readDurableRecordIn(
        observer, PARTITION_ID);
      const boundary = Number(record.appliedIndex);
      const checkpointsRoot = resolveReplicaCheckpointsRoot(dbPath);
      const before = fs.existsSync(checkpointsRoot) ?
        fs.readdirSync(checkpointsRoot).sort() : [];
      const result = await service.onSnapshotCatchupNeeded(
        buildSnapshotCatchupDecision({
          outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
          followerAddress: 'missing-peer/partition/dependency-a', startIndex: 1,
          failedIndex: boundary, leaderBoundary: boundary,
        }));
      assert.equal(result.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED);
      assert.equal(result.creation.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER);
      assert.deepEqual(result.creation.reasons,
        [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_KIND_REQUIRED],
        'the unchanged missing-kind owner gate, not an unrelated failure');
      const after = fs.existsSync(checkpointsRoot) ?
        fs.readdirSync(checkpointsRoot).sort() : [];
      assert.deepEqual(after, before,
        'registered callback cannot seal under dependency A');
      assert.equal(socketLookups, 0,
        'registered callback cannot dial under dependency A');
    } finally {
      observer?.close();
      await service?.shutdown();
      fs.rmSync(root, {recursive: true, force: true});
      resetEnvironment();
    }
  });
