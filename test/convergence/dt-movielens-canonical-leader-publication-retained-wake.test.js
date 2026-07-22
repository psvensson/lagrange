import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {RUNTIME_REPLICA_STATUS} from '../../src/constants/runtime.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  RUNTIME_REPLICA_STATE_PROJECTION_EVENT,
  RuntimeReplicaStateProjectionOwner,
} from '../../src/query/runtime-replica-state-projection-owner.js';
import {
  AuthoritativeRowMutationHelper,
} from '../../src/raft/authoritative-row-mutation-helper.js';

const PARTITION_ID = 'services-p1';
const REPLICA_ID = 'services-p1-r1';
const NODE_ID = 'seed-node';
const STOPPED_SERVICE_ID = 'svc-movielens-topn-r1';
const RETRY_AFTER_MS = 10;
const TEST_WAIT_MS = 250;

function waitForEvent(owner, eventName, predicate) {
  return new Promise((resolve) => {
    const listener = (event) => {
      if (!predicate(event)) {
        return;
      }
      owner.removeListener(eventName, listener);
      resolve(event);
    };
    owner.on(eventName, listener);
  });
}

function waitForTimeout() {
  return new Promise((resolve) => {
    setTimeout(() => resolve(false), TEST_WAIT_MS);
  });
}

function waitForTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createPublicationHelper(options = {}) {
  return new AuthoritativeRowMutationHelper({
    tableName: TABLES.PARTITIONS,
    buildWhereClause: () => ({partition_id: PARTITION_ID}),
    buildUpdateData: (value) => ({leader_node_id: value}),
    readValueFromCache: () => null,
    ...options,
  });
}

test(
  'seed hydration wakes the elected services leader publication and lets a ' +
    'retained STOPPED projection delete the stale runtime identity',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
    LoggingService.getInstance().initialize({level: 'error'});

    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      [COLUMN.PARTITION_ID]: PARTITION_ID,
      [COLUMN.TABLE_ID]: TABLES.SERVICES,
      [COLUMN.LEADER_NODE_ID]: null,
      [COLUMN.CREATED_AT]: 1,
      [COLUMN.UPDATED_AT]: 1,
    });

    let durableLeaderNodeId = null;
    let leaderMutationAttempts = 0;
    let guardRefreshAttempts = 0;
    let stoppedDeleteAttempts = 0;
    const cdcIntegrationService = {
      async executeAuthoritativeSystemTableRead(tableName) {
        if (tableName === TABLES.PARTITIONS) {
          return {
            success: true,
            rows: [{
              [COLUMN.PARTITION_ID]: PARTITION_ID,
              [COLUMN.LEADER_NODE_ID]: durableLeaderNodeId,
              [COLUMN.UPDATED_AT]: 1,
            }],
          };
        }
        if (tableName === TABLES.SERVICES) {
          return {
            success: true,
            rows: [{
              [COLUMN.SERVICE_ID]: REPLICA_ID,
              [COLUMN.RAFT_ROLE]: 'follower',
              [COLUMN.UPDATED_AT]: 1,
            }],
          };
        }
        return {success: true, rows: []};
      },
      async updateSystemTableRow(tableName, _whereClause, data) {
        if (
          tableName === TABLES.PARTITIONS &&
          data?.[COLUMN.LEADER_NODE_ID] === NODE_ID
        ) {
          leaderMutationAttempts += 1;
          if (leaderMutationAttempts === 1) {
            return {success: true, partitionResult: {affectedRows: 0}};
          }
          durableLeaderNodeId = NODE_ID;
        }
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      async refreshAuthoritativeCacheRow() {
        guardRefreshAttempts += 1;
        return false;
      },
    };
    const partition = new PartitionService({
      partitionId: PARTITION_ID,
      tableId: TABLES.SERVICES,
      tableName: TABLES.SERVICES,
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_ID,
      dbPath: ':memory:',
      systemTableCache: cache,
    });
    const projectionOwner = new RuntimeReplicaStateProjectionOwner({
      hostNodeId: 'runtime-source-node',
      servicesOwner: {
        async updateService() {
          throw new Error('STOPPED must delete, not update');
        },
        async insertService() {
          throw new Error('STOPPED must delete, not insert');
        },
        async removeService() {
          stoppedDeleteAttempts += 1;
          if (durableLeaderNodeId !== NODE_ID) {
            const error = new Error('canonical services leader unavailable');
            error.deferRetry = true;
            error.retryAfterMs = RETRY_AFTER_MS;
            throw error;
          }
          return {success: true};
        },
      },
    });

    try {
      partition.maybeInitializeRebalancer = () => {};
      await partition.initialize();
      partition.leaderNodeMutationHelper.retryDelayMs = RETRY_AFTER_MS;
      partition.leaderNodeMutationHelper.maxRetryDelayMs = RETRY_AFTER_MS;

      t.equal(partition.isLeader, true, 'the real single-replica election wins');
      t.equal(
        partition.leaderNodeMutationHelper.pendingValue,
        NODE_ID,
        'the leader publication is retained before CDC attachment',
      );

      const projectionRetrying = waitForEvent(
        projectionOwner,
        RUNTIME_REPLICA_STATE_PROJECTION_EVENT.RETRYING,
        (event) => event.serviceId === STOPPED_SERVICE_ID,
      );
      const projectionApplied = waitForEvent(
        projectionOwner,
        RUNTIME_REPLICA_STATE_PROJECTION_EVENT.APPLIED,
        (event) => event.serviceId === STOPPED_SERVICE_ID,
      ).then(() => true);
      projectionOwner.submit(STOPPED_SERVICE_ID, {
        status: RUNTIME_REPLICA_STATUS.STOPPED,
        service_type: 'runtime_service',
        node_id: 'runtime-source-node',
        updated_at: 2,
      });
      await projectionRetrying;

      partition.cdcIntegrationService = cdcIntegrationService;

      t.equal(
        await Promise.race([projectionApplied, waitForTimeout()]),
        true,
        'durable leader publication unblocks the retained STOPPED delete',
      );
      t.equal(leaderMutationAttempts, 2,
        'one CAS miss is refreshed and retried through the existing helper');
      t.equal(guardRefreshAttempts, 1,
        'the empty guard refresh does not discard the retained publication');
      t.equal(durableLeaderNodeId, NODE_ID,
        'canonical leader metadata converges after dependency attachment');
      t.ok(stoppedDeleteAttempts >= 2,
        'the retained delete retries and eventually applies');
      t.equal(
        partition.leaderNodeMutationHelper.pendingValue,
        null,
        'successful authoritative publication clears retained work',
      );
    } finally {
      projectionOwner.shutdown();
      await partition.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  },
);

test(
  'an available CDC replacement preserves an armed publication retry',
  async (t) => {
    const scheduled = [];
    let retryTimerUnrefs = 0;
    let writeReady = false;
    let firstDependencyWrites = 0;
    let replacementDependencyWrites = 0;
    const helper = createPublicationHelper({
      buildUpdateOptions: null,
      isWriteReady: () => writeReady,
      cdcIntegrationService: {
        async updateSystemTableRow() {
          firstDependencyWrites += 1;
          return {success: true};
        },
      },
      setTimeoutFn: (callback) => {
        callback.unref = () => {
          retryTimerUnrefs += 1;
        };
        scheduled.push(callback);
        return callback;
      },
      clearTimeoutFn: () => {},
    });

    helper.queue(NODE_ID);
    await waitForTurn();
    t.equal(scheduled.length, 1, 'owner-not-ready arms one retry');
    t.equal(retryTimerUnrefs, 1, 'background publication retry is unreferenced');

    helper.setCdcIntegrationService({
      async updateSystemTableRow() {
        replacementDependencyWrites += 1;
        return {success: true};
      },
    });
    await waitForTurn();

    t.equal(firstDependencyWrites, 0, 'the unavailable owner never writes');
    t.equal(
      replacementDependencyWrites,
      0,
      'replacement does not bypass the armed retry delay',
    );
    t.equal(helper.retryTimer, scheduled[0], 'the original retry remains armed');

    writeReady = true;
    await scheduled[0]();
    t.equal(
      replacementDependencyWrites,
      1,
      'the armed retry uses the current dependency once it fires',
    );
    t.equal(helper.pendingValue, null, 'the delayed publication converges');
    helper.shutdown();
  },
);

test(
  'an available CDC replacement cannot overlap an in-flight publication',
  async (t) => {
    let releaseFirstWrite;
    let announceFirstWrite;
    const firstWriteStarted = new Promise((resolve) => {
      announceFirstWrite = resolve;
    });
    const firstWriteReleased = new Promise((resolve) => {
      releaseFirstWrite = resolve;
    });
    let activeWrites = 0;
    let maxActiveWrites = 0;
    let firstDependencyWrites = 0;
    let replacementDependencyWrites = 0;
    const helper = createPublicationHelper({
      cdcIntegrationService: {
        async updateSystemTableRow() {
          firstDependencyWrites += 1;
          activeWrites += 1;
          maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
          announceFirstWrite();
          await firstWriteReleased;
          activeWrites -= 1;
          return {success: true};
        },
      },
    });

    helper.queue(NODE_ID);
    await firstWriteStarted;
    helper.queue('successor-node');
    helper.setCdcIntegrationService({
      async updateSystemTableRow() {
        replacementDependencyWrites += 1;
        activeWrites += 1;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
        activeWrites -= 1;
        return {success: true};
      },
    });
    await waitForTurn();

    t.equal(firstDependencyWrites, 1, 'the original publication remains in flight');
    t.equal(
      replacementDependencyWrites,
      0,
      'replacement does not start a concurrent publication',
    );

    releaseFirstWrite();
    await waitForTurn();
    await waitForTurn();

    t.equal(
      replacementDependencyWrites,
      1,
      'the serialized follow-up uses the current dependency',
    );
    t.equal(maxActiveWrites, 1, 'publication writes remain serialized');
    t.equal(helper.persistedValue, 'successor-node', 'the latest value wins');
    t.equal(helper.pendingValue, null, 'the follow-up drains retained work');
    helper.shutdown();
  },
);
