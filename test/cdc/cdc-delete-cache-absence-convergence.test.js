import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  createControlPlaneRuntimeBundle,
} from '../../src/control-plane/control-plane-runtime-bundle.js';
import {
  PartitionServiceRowOwner,
} from '../../src/partition/partition-service-row-owner.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  createLocalSystemTablePartitionServices,
} from './cdc-integration-service-test-support.js';
import {cacheRecordChangedDuringAuthoritativeAbsenceRead} from
  '../../src/cdc/cdc-integration-service-cache-visibility-authority.js';

const SOURCE_NODE_ID = 'node-source';
const LEADER_NODE_ID = 'node-leader';
const SERVICES_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];

beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function seedStaleServiceCacheRow(cache, serviceId) {
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.SERVICES,
    CACHE_CDC_OPERATIONS.INSERT,
    {
      service_id: serviceId,
      service_type: 'partition',
      partition_id: SERVICES_PARTITION_ID,
      replica_id: serviceId,
      node_id: SOURCE_NODE_ID,
      address: `${SOURCE_NODE_ID}/partition/${serviceId}`,
      status: 'active',
      raft_role: RAFT_ROLE.FOLLOWER,
      created_at: 100,
      updated_at: 100,
    },
  );
}

function buildRoutingSnapshot() {
  return {
    canonicalLeaderNodeId: LEADER_NODE_ID,
    serviceRowCount: 3,
    routableServiceCount: 3,
    deniedByNodeId: {},
  };
}

function buildReadAuthorityWitness(
  role,
  servingNodeId,
  replicaSuffix,
  observedAtMs = 150,
) {
  return {
    state: 'observed',
    partitionId: SERVICES_PARTITION_ID,
    role,
    servingNodeId,
    servingReplicaId: `${SERVICES_PARTITION_ID}-${replicaSuffix}`,
    observedAtMs,
  };
}

function createLeaderAbsenceReadService(
  cache,
  duringRead = () => {},
  rows = [],
) {
  const queryExecutor = {
    getPartitionRoutingSnapshot: buildRoutingSnapshot,
    async executeOnPartition() {
      duringRead();
      return {
        success: true,
        participantNodeId: LEADER_NODE_ID,
        rows,
        readAuthorityWitness: buildReadAuthorityWitness(
          RAFT_ROLE.LEADER,
          LEADER_NODE_ID,
          'r1',
        ),
      };
    },
  };
  const service = new CDCIntegrationService({
    nodeId: SOURCE_NODE_ID,
    systemTableCache: cache,
    sqlQueryEngine: {queryExecutor},
  });
  service.initialize();
  return service;
}

test(
  'CDCIntegrationService - malformed leader rows cannot authorize absence',
  async (t) => {
    const serviceId = 'services-p1-malformed-leader-absence';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const service = createLeaderAbsenceReadService(cache, () => {}, null);

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );

    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), true,
      'a non-array row set cannot erase a cache row');
    t.notOk(result?.authoritativeVisibilityConfirmed,
      'malformed leader output does not prove absence');
  },
);

test(
  'PartitionServiceRowOwner - zero-row removal still repairs stale cache ' +
    'through the gateway and a witnessed leader owner read',
  async (t) => {
    const serviceId = 'services-p1-stale-replica';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const ownerReads = [];
    const sqlQueryEngine = {
      async executeQuery(sql) {
        t.match(sql, /^DELETE FROM services /,
          'mutation should remain a canonical routed DELETE');
        return {success: true, affectedRows: 0};
      },
      queryExecutor: {
        getPartitionRoutingSnapshot: buildRoutingSnapshot,
        async executeOnPartition(
          observedPartitionId,
          sql,
          params,
          _forRead,
          preferLeader,
          _preferSameLatencyGroup,
          options,
        ) {
          ownerReads.push({
            observedPartitionId,
            sql,
            params,
            preferLeader,
            readAuthority: options?.readAuthority,
          });
          return {
            success: true,
            participantNodeId: LEADER_NODE_ID,
            rows: [],
            readAuthorityWitness: buildReadAuthorityWitness(
              RAFT_ROLE.LEADER,
              LEADER_NODE_ID,
              'r1',
            ),
          };
        },
      },
    };
    const service = new CDCIntegrationService({
      nodeId: SOURCE_NODE_ID,
      sqlQueryEngine,
      systemTableCache: cache,
    });
    service.initialize();
    service.cacheWaitTimeoutMs = 10;
    const gateway = createControlPlaneRuntimeBundle({
      nodeId: SOURCE_NODE_ID,
      cdcIntegrationService: service,
      systemTableCache: cache,
    }).controlPlaneSystemTableGateway;
    const owner = new PartitionServiceRowOwner({
      systemTableWriter: gateway,
    });

    await owner.removeReplica({
      partitionId: SERVICES_PARTITION_ID,
      replicaId: serviceId,
      nodeId: SOURCE_NODE_ID,
    });

    t.equal(ownerReads.length, 1,
      'owner-to-gateway zero-row cleanup should trigger one exact ' +
        'authoritative read despite the owner skipCacheWait option');
    t.equal(ownerReads[0]?.observedPartitionId, SERVICES_PARTITION_ID,
      'repair should read the canonical SERVICES owner partition');
    t.equal(ownerReads[0]?.preferLeader, true,
      'destructive absence confirmation should route to the leader');
    t.equal(
      ownerReads[0]?.readAuthority?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'destructive repair should require the owner RPC lane',
    );
    t.equal(
      ownerReads[0]?.readAuthority?.leaderMode,
      CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      'destructive repair should require a serving-leader witness',
    );
    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), false,
      'leader-confirmed absence should evict the stale cache row');
  },
);

test(
  'CDCIntegrationService - follower owner absence cannot authorize cache deletion',
  async (t) => {
    const serviceId = 'services-p1-follower-absence';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const service = new CDCIntegrationService({
      nodeId: SOURCE_NODE_ID,
      systemTableCache: cache,
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot: buildRoutingSnapshot,
          async executeOnPartition() {
            return {
              success: true,
              participantNodeId: 'node-follower',
              rows: [],
              readAuthorityWitness: buildReadAuthorityWitness(
                RAFT_ROLE.FOLLOWER,
                'node-follower',
                'r2',
              ),
            };
          },
        },
      },
    });
    service.initialize();

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );

    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), true,
      'a follower empty read must preserve the live-looking cache row');
    t.notOk(result?.authoritativeVisibilityConfirmed,
      'a follower empty read must not confirm destructive absence');
  },
);

test(
  'CDCIntegrationService - cache update concurrent with leader absence read ' +
    'cannot be erased',
  async (t) => {
    const serviceId = 'services-p1-concurrent-refresh';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const refreshedRow = {
      ...cache.get(SYSTEM_TABLE_NAME.SERVICES, serviceId),
      status: 'stopping',
      updated_at: 200,
    };
    const service = new CDCIntegrationService({
      nodeId: SOURCE_NODE_ID,
      systemTableCache: cache,
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot: buildRoutingSnapshot,
          async executeOnPartition() {
            cache.applySystemTableChange(
              SYSTEM_TABLE_NAME.SERVICES,
              CACHE_CDC_OPERATIONS.UPDATE,
              refreshedRow,
            );
            return {
              success: true,
              participantNodeId: LEADER_NODE_ID,
              rows: [],
              readAuthorityWitness: buildReadAuthorityWitness(
                RAFT_ROLE.LEADER,
                LEADER_NODE_ID,
                'r1',
              ),
            };
          },
        },
      },
    });
    service.initialize();

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );

    t.same(cache.get(SYSTEM_TABLE_NAME.SERVICES, serviceId), refreshedRow,
      'a same-key cache update during the read must survive');
    t.notOk(result?.authoritativeVisibilityConfirmed,
      'the superseded absence observation must not confirm the postcondition');
  },
);

test(
  'CDCIntegrationService - equal-value same-key mutation concurrent with ' +
    'leader absence read cannot be erased',
  async (t) => {
    const serviceId = 'services-p1-concurrent-equal-refresh';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const rowBeforeRead = cache.get(SYSTEM_TABLE_NAME.SERVICES, serviceId);
    const service = new CDCIntegrationService({
      nodeId: SOURCE_NODE_ID,
      systemTableCache: cache,
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot: buildRoutingSnapshot,
          async executeOnPartition() {
            cache.applySystemTableChange(
              SYSTEM_TABLE_NAME.SERVICES,
              CACHE_CDC_OPERATIONS.UPDATE,
              rowBeforeRead,
            );
            return {
              success: true,
              participantNodeId: LEADER_NODE_ID,
              rows: [],
              readAuthorityWitness: buildReadAuthorityWitness(
                RAFT_ROLE.LEADER,
                LEADER_NODE_ID,
                'r1',
              ),
            };
          },
        },
      },
    });
    service.initialize();

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );

    t.same(cache.get(SYSTEM_TABLE_NAME.SERVICES, serviceId), rowBeforeRead,
      'a same-key apply during the read must survive even when values compare equal');
    t.notOk(result?.authoritativeVisibilityConfirmed,
      'a key mutation must supersede the earlier absence observation');
  },
);

test(
  'CDCIntegrationService - unrelated-key mutation does not block ' +
    'leader-confirmed absence repair',
  async (t) => {
    const serviceId = 'services-p1-stale-target';
    const unrelatedServiceId = 'services-p1-unrelated-refresh';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    seedStaleServiceCacheRow(cache, unrelatedServiceId);
    const unrelatedRow = cache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      unrelatedServiceId,
    );
    const service = new CDCIntegrationService({
      nodeId: SOURCE_NODE_ID,
      systemTableCache: cache,
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot: buildRoutingSnapshot,
          async executeOnPartition() {
            cache.applySystemTableChange(
              SYSTEM_TABLE_NAME.SERVICES,
              CACHE_CDC_OPERATIONS.UPDATE,
              unrelatedRow,
            );
            return {
              success: true,
              participantNodeId: LEADER_NODE_ID,
              rows: [],
              readAuthorityWitness: buildReadAuthorityWitness(
                RAFT_ROLE.LEADER,
                LEADER_NODE_ID,
                'r1',
              ),
            };
          },
        },
      },
    });
    service.initialize();

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );

    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), false,
      'unrelated cache traffic must not prevent target-key convergence');
    t.ok(result?.authoritativeVisibilityConfirmed,
      'the unchanged target key may accept the leader absence observation');
  },
);

test(
  'CDCIntegrationService - authoritative absence fences an older replay but ' +
    'allows a genuinely newer recreate',
  async (t) => {
    const serviceId = 'services-p1-late-replay';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const deletedRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, serviceId);
    const service = createLeaderAbsenceReadService(cache);

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      deletedRow,
    );

    t.ok(result?.authoritativeVisibilityConfirmed,
      'a witnessed leader read should confirm the repair');
    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), false,
      'the authoritative tombstone must fence a late replay of the deleted row');

    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      {
        ...deletedRow,
        status: 'starting',
        updated_at: 200,
      },
    );
    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), true,
      'a causally newer recreate must supersede the authoritative tombstone');
  },
);

test(
  'CDCIntegrationService - concurrent CDC deletion is upgraded to an ' +
    'authoritative replay fence',
  async (t) => {
    const serviceId = 'services-p1-concurrent-delete';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const deletedRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, serviceId);
    const service = createLeaderAbsenceReadService(cache, () => {
      cache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        CACHE_CDC_OPERATIONS.DELETE,
        deletedRow,
      );
    });

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      deletedRow,
    );

    t.ok(result?.authoritativeVisibilityConfirmed,
      'the leader absence remains confirmed after the aligned concurrent delete');
    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), false,
      'the concurrent ordinary tombstone is upgraded before a replay arrives');
  },
);

test(
  'CDCIntegrationService - leader absence establishes a replay fence when ' +
    'the cache was already empty',
  async (t) => {
    const serviceId = 'services-p1-delayed-first-delivery';
    const cache = new SystemTableCache();
    const delayedRow = {
      service_id: serviceId,
      status: 'active',
      updated_at: 100,
    };
    const service = createLeaderAbsenceReadService(cache);

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      delayedRow,
    );
    t.ok(result?.authoritativeVisibilityConfirmed,
      'leader-confirmed pre-existing absence should establish a cache fence');
    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), false,
      'a pre-read delayed delivery must not resurrect the absent key');

    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CACHE_CDC_OPERATIONS.UPDATE,
      {...delayedRow, status: 'starting', updated_at: 200},
    );
    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), true,
      'a write newer than the leader observation may recreate the absent key');
  },
);

test(
  'CDCIntegrationService - local follower absence cannot authorize cache deletion',
  async (t) => {
    const serviceId = 'services-p1-local-follower-absence';
    const cache = new SystemTableCache();
    seedStaleServiceCacheRow(cache, serviceId);
    const service = new CDCIntegrationService({
      nodeId: SOURCE_NODE_ID,
      systemTableCache: cache,
      sqlQueryEngine: {},
      partitionServicesProvider: () =>
        createLocalSystemTablePartitionServices(
          SYSTEM_TABLE_NAME.SERVICES,
          {
            isLeader: false,
            async executeQuery() {
              return {success: true, rows: []};
            },
          },
        ),
    });
    service.initialize();

    const result = await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.SERVICES,
      serviceId,
      false,
    );

    t.equal(cache.has(SYSTEM_TABLE_NAME.SERVICES, serviceId), true,
      'a local follower empty read must preserve the live-looking cache row');
    t.notOk(result?.authoritativeVisibilityConfirmed,
      'a local follower empty read must not confirm destructive absence');
  },
);

test(
  'absence repair fails closed when a reduced cache cannot expose revisions',
  (t) => {
    const record = {service_id: 'revisionless', status: 'active'};
    t.equal(
      cacheRecordChangedDuringAuthoritativeAbsenceRead(
        SYSTEM_TABLE_NAME.SERVICES,
        {record, mutationRevision: null},
        {record: {...record}, mutationRevision: null},
      ),
      true,
      'value equality cannot prove that no same-key mutation occurred',
    );
    t.end();
  },
);
