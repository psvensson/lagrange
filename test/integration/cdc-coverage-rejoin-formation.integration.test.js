import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {CDCIntegrationService} from
  '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {createPartitionServiceCdcCoverageMethods} from
  '../../src/partition/partition-service-cdc-coverage-methods.js';
import {readCompleteCdcCoverage} from
  '../../src/partition/partition-cdc-source-coverage.js';
import {handleCoverageTransferRequest} from
  '../../src/partition/partition-cdc-coverage-transfer.js';
import {readCdcCoverageTransferDiagnostics,
  retireCdcCoverageTransferOwner} from
  '../../src/cdc/cdc-coverage-transfer-owner.js';
import {generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {NODES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const SOURCE_NODE = 'cdc-source-node';
const TARGET_NODE = 'cdc-recipient-node';
const SOURCE_PORT = 29471;
const TARGET_PORT = 29472;
const SOURCE_ADDRESS = `ws://127.0.0.1:${SOURCE_PORT}`;
const TARGET_ADDRESS = `ws://127.0.0.1:${TARGET_PORT}`;
const NODE_PARTITION = INITIAL_PARTITION_IDS[TABLES.NODES];
const TABLE_PARTITION = INITIAL_PARTITION_IDS[TABLES.TABLES];
const PARTITION_PARTITION = INITIAL_PARTITION_IDS[TABLES.PARTITIONS];

function tableRow() {
  return {table_id: 'nodes-table', table_name: TABLES.NODES,
    active_partition_version: 1, pending_partition_version: null,
    partition_transition_state: null, partition_transition_generation: 1};
}

function partitionRow() {
  return {partition_id: NODE_PARTITION, table_id: 'nodes-table',
    table_name: TABLES.NODES, partition_key_start: null,
    partition_key_end: null, partition_version: 1, state: 'NORMAL'};
}

function witness(partitionId, replicaId) {
  return {state: 'observed', partitionId, role: RAFT_ROLE.LEADER,
    servingNodeId: SOURCE_NODE, servingReplicaId: replicaId,
    observedAtMs: Date.now()};
}

function installRoute(cache, partitionId, replicaId) {
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPSERT,
    {partition_id: partitionId, table_id: `${partitionId}-table`,
      partition_key_start: null, partition_key_end: null,
      partition_version: 1, state: 'NORMAL', leader_node_id: SOURCE_NODE});
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT,
    {service_id: replicaId, service_type: 'partition', partition_id: partitionId,
      replica_id: replicaId, node_id: SOURCE_NODE,
      address: `${SOURCE_NODE}/partition/${replicaId}`, status: 'active',
      raft_role: 'leader'});
}

function metadataHandler(partitionId, replicaId, row) {
  return () => ({success: true, rows: [row], changes: 0,
    readAuthorityWitness: witness(partitionId, replicaId)});
}

async function settle(turns = 12) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('C17 fresh recipient routes >16MiB hydration, interruption and recovery',
  {timeout: 20000}, async (t) => {
    const keepAlive = setInterval(() => {}, 1000);
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT,
      {node_id: SOURCE_NODE, node_address: SOURCE_ADDRESS, status: 'active',
        connection_state: 'ready', ready_lease_expires_at: Date.now() + 60000,
        created_at: 1, updated_at: 1});
    installRoute(cache, NODE_PARTITION, `${NODE_PARTITION}-r1`);
    installRoute(cache, TABLE_PARTITION, `${TABLE_PARTITION}-r1`);
    installRoute(cache, PARTITION_PARTITION, `${PARTITION_PARTITION}-r1`);

    const sourceRouter = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: SOURCE_NODE, nodeAddress: SOURCE_ADDRESS, wsPort: SOURCE_PORT,
      inProcess: true, resolveNodeAddress: (nodeId) =>
        nodeId === TARGET_NODE ? TARGET_ADDRESS : null});
    const targetRouter = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: TARGET_NODE, nodeAddress: TARGET_ADDRESS, wsPort: TARGET_PORT,
      inProcess: true, resolveNodeAddress: (nodeId) =>
        nodeId === SOURCE_NODE ? SOURCE_ADDRESS : null});
    const db = new Database(':memory:');
    let target = null;
    let source = null;
    let sourceCdc = null;
    try {
      await sourceRouter.initialize({startServer: true});
      await targetRouter.initialize({startServer: true});
      targetRouter.setQueryMessageGroupServiceResolver(() => ({
        sendMessage: (address, message, options = {}) => sourceRouter.deliver(
          address, message, options.transportDeliveryOptions),
      }));
      sourceRouter.register(`${SOURCE_NODE}/partition/${TABLE_PARTITION}-r1`,
        metadataHandler(TABLE_PARTITION, `${TABLE_PARTITION}-r1`, tableRow()));
      sourceRouter.register(`${SOURCE_NODE}/partition/${PARTITION_PARTITION}-r1`,
        metadataHandler(PARTITION_PARTITION, `${PARTITION_PARTITION}-r1`,
          partitionRow()));

      const sourceExecutor = new QueryExecutor({nodeId: SOURCE_NODE,
        messageRouter: sourceRouter, systemCache: cache});
      sourceCdc = new CDCIntegrationService({nodeId: SOURCE_NODE,
        messageRouter: sourceRouter, systemTableCache: cache,
        cacheMutationTarget: cache, sqlQueryEngine: {queryExecutor: sourceExecutor}});
      const sourceGateway = new ControlPlaneSystemTableGateway({nodeId: SOURCE_NODE,
        messageRouter: sourceRouter, systemTableCache: cache,
        cdcIntegrationService: sourceCdc,
        sqlQueryEngine: {queryExecutor: sourceExecutor}});

      db.exec(generateCreateTableSQL(NODES_SCHEMA));
      const largeAddress = 'v'.repeat(16 * 1024 * 1024 + 4096);
      db.prepare('INSERT INTO nodes (node_id, node_address, cpu_cores, memory_mb, ' +
        'disk_gb, last_heartbeat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('large-node', largeAddress, 1, 1024, 10, 1, 1);
      new RaftRsDurableStore(db).putAppliedState(NODE_PARTITION, '23',
        {voters: [], learners: [], votersOutgoing: [], learnersNext: [],
          autoLeave: false});
      let lifecycleIncarnation = 'source-life-1';
      source = {db, nodeId: SOURCE_NODE, partitionId: NODE_PARTITION,
        tableId: 'nodes-table', tableName: TABLES.NODES,
        keyRange: {start: null, end: null}, cdcSourceScopeEvidence: null,
        cdcCoverageTransferCapacityBytes: 128 * 1024 * 1024,
        timeSource: {now: () => Date.now(), setTimeout, clearTimeout},
        controlPlaneSystemTableGateway: sourceGateway,
        raft: {readStatus: () => ({outcome: 'CORE_OK',
          lifecycleIncarnation, role: RAFT_ROLE.LEADER})},
        isWriteQuery: () => false,
        buildRemoteReadAuthorityWitness: () =>
          witness(NODE_PARTITION, `${NODE_PARTITION}-r1`)};
      const methods = createPartitionServiceCdcCoverageMethods();
      Object.assign(source, methods);
      source.readCompleteCdcCoverage = (options) =>
        readCompleteCdcCoverage(source, options);
      source.handleCdcCoverageTransferRequest = (options) =>
        handleCoverageTransferRequest(source, options);
      let interrupted = false;
      const transferIds = [];
      sourceRouter.register(`${SOURCE_NODE}/partition/${NODE_PARTITION}-r1`,
        async (envelope) => {
          if (envelope.payload.cdcCoverageMode === 'chunk' && !interrupted) {
            interrupted = true;
            retireCdcCoverageTransferOwner(source);
            lifecycleIncarnation = 'source-life-2';
          }
          const answer = await PartitionService.prototype.handleRemoteQuery.call(
            source, envelope.payload);
          if (answer.state === 'offer') transferIds.push(answer.transferId);
          return answer;
        });

      await targetRouter.connectToNode(SOURCE_NODE, SOURCE_ADDRESS);
      await settle();
      const targetExecutor = new QueryExecutor({nodeId: TARGET_NODE,
        messageRouter: targetRouter, systemCache: cache});
      target = new CDCIntegrationService({nodeId: TARGET_NODE,
        messageRouter: targetRouter, systemTableCache: cache,
        cacheMutationTarget: cache, sqlQueryEngine: {queryExecutor: targetExecutor}});
      let largeRowPublications = 0;
      cache.onCacheApplyChange((tableName, _operation, record, metadata) => {
        if (tableName === TABLES.NODES && record?.node_id === 'large-node' &&
            typeof metadata?.cdcCoverageScopeId === 'string') {
          largeRowPublications += 1;
        }
      });
      const summary = await target.hydrateCdcPropagatedTablesFromAuthority({
        tables: [TABLES.NODES], windowMs: 15000});
      t.equal(summary.tablesHydrated, 1,
        'production hydration owner completes after interrupted transfer');
      t.equal(new Set(transferIds).size, 2,
        'recovery captures a new volatile source identity');
      t.equal(cache.get(TABLES.NODES, 'large-node').node_address,
        largeAddress, 'the real route publishes exact committed content');
      t.equal(largeRowPublications, 1,
        'interrupted fragments produce exactly one cache publication');
      t.equal(readCdcCoverageTransferDiagnostics(source).retainedBytes, 0,
        'source releases all bounded bytes');
      t.equal(readCdcCoverageTransferDiagnostics(target).retainedBytes, 0,
        'recipient releases all bounded bytes');
      t.equal(target.resolvePartitionServices(), null,
        'recipient hosts no source partition service');
    } finally {
      clearInterval(keepAlive);
      target?.markShuttingDown();
      sourceCdc?.markShuttingDown();
      if (source) retireCdcCoverageTransferOwner(source);
      db.close();
      await targetRouter.shutdown();
      await sourceRouter.shutdown();
    }
    t.end();
  });
