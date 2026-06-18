import {test} from '../../src/test-helpers/tap.js';
import {
  AUTHORITATIVE_REPAIR_TRIGGER,
  deriveAuthoritativeRepairTables,
  evaluateAuthoritativeRepairPolicy,
} from '../../src/admin/admin-authoritative-repair-policy.js';
import {TABLES} from '../../src/constants/index.js';

test('authoritative repair policy triggers for stale cache watermark',
  async (t) => {
    const result = evaluateAuthoritativeRepairPolicy({
      cacheStalenessMs: 6000,
      staleThresholdMs: 5000,
    });
    t.equal(result.shouldRepair, true);
    t.equal(
      result.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
      ),
      true,
    );
  });

test('authoritative repair policy does not trigger stale-only repair for scoped discovery',
  async (t) => {
    const result = evaluateAuthoritativeRepairPolicy({
      scopedQuery: true,
      cacheStalenessMs: 6000,
      staleThresholdMs: 5000,
      serviceCount: 1,
      replicaCount: 2,
      selectedNodeCount: 1,
      serviceEndpointsCount: 2,
      hasCacheGapReasons: false,
    });

    t.equal(result.shouldRepair, false);
    t.equal(
      result.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
      ),
      false,
    );
  });

test('authoritative repair policy triggers for empty discovery with endpoints',
  async (t) => {
    const result = evaluateAuthoritativeRepairPolicy({
      selectedNodeCount: 0,
      serviceEndpointsCount: 3,
    });
    t.equal(result.shouldRepair, true);
    t.equal(
      result.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER
          .DISCOVERY_EMPTY_WITH_SERVICES_PRESENT,
      ),
      true,
    );
  });

test('authoritative repair policy triggers for shared metadata node coverage gaps',
  async (t) => {
    const result = evaluateAuthoritativeRepairPolicy({
      nodeCoverageGap: true,
    });
    t.equal(result.shouldRepair, true);
    t.equal(
      result.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
      ),
      true,
    );
  });

test('authoritative repair policy triggers for stale in-flight replica operations',
  async (t) => {
    const result = evaluateAuthoritativeRepairPolicy({
      staleReplicaOpsInFlightCount: 2,
    });
    t.equal(result.shouldRepair, true);
    t.equal(
      result.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER
          .STALE_REPLICA_OPERATIONS_IN_FLIGHT,
      ),
      true,
    );
  });

test('authoritative repair policy triggers for control-snapshot topology gaps',
  async (t) => {
    const result = evaluateAuthoritativeRepairPolicy({
      topologyGap: true,
    });
    t.equal(result.shouldRepair, true);
    t.equal(
      result.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER.PARTITION_TOPOLOGY_GAP,
      ),
      true,
    );
  });

test('authoritative repair policy triggers for scoped discovery with zero replicas',
  async (t) => {
    const result = evaluateAuthoritativeRepairPolicy({
      scopedQuery: true,
      serviceCount: 0,
      replicaCount: 0,
    });
    t.equal(result.shouldRepair, true);
    t.equal(
      result.triggerCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_ZERO_SCOPED_REPLICAS,
      ),
      true,
    );
  });

test('authoritative repair policy narrows stale replica-operation repair to replica_operations',
  async (t) => {
    const tables = deriveAuthoritativeRepairTables({
      triggerCodes: [
        AUTHORITATIVE_REPAIR_TRIGGER
          .STALE_REPLICA_OPERATIONS_IN_FLIGHT,
      ],
    });

    t.same(
      tables,
      [TABLES.REPLICA_OPERATIONS],
    );
  });

test('authoritative repair policy keeps full repair for combined stale cache ' +
  'and stale replica operations', async (t) => {
  const tables = deriveAuthoritativeRepairTables({
    triggerCodes: [
      AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
      AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT,
    ],
  });

  t.equal(
    tables.includes(TABLES.PARTITIONS),
    true,
    'combined cache-stale repair must refresh partition leader authority',
  );
  t.equal(
    tables.includes(TABLES.REPLICA_OPERATIONS),
    true,
    'combined cache-stale repair still refreshes stale replica operations',
  );
  t.same(tables, [
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICE_DEFINITIONS,
    TABLES.SERVICE_ENDPOINTS,
    TABLES.REPLICA_OPERATIONS,
  ]);
});

test('authoritative repair policy narrows scoped discovery repair to topology tables',
  async (t) => {
    const tables = deriveAuthoritativeRepairTables({
      scopedQuery: true,
      triggerCodes: [
        AUTHORITATIVE_REPAIR_TRIGGER
          .DISCOVERY_EMPTY_WITH_SERVICES_PRESENT,
      ],
    });

    t.same(
      tables,
      [
        TABLES.NODES,
        TABLES.PARTITIONS,
        TABLES.SERVICES,
        TABLES.TABLES,
        TABLES.SERVICE_DEFINITIONS,
        TABLES.SERVICE_ENDPOINTS,
      ],
    );
  });

test('authoritative repair policy narrows node coverage gap repair to discovery tables',
  async (t) => {
    const tables = deriveAuthoritativeRepairTables({
      triggerCodes: [
        AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
      ],
    });

    t.same(
      tables,
      [
        TABLES.NODES,
        TABLES.PARTITIONS,
        TABLES.SERVICES,
        TABLES.TABLES,
        TABLES.CONTROL_PLANE_PUBLICATIONS,
        TABLES.NODE_ENDPOINTS,
        TABLES.SERVICE_DEFINITIONS,
        TABLES.SERVICE_ENDPOINTS,
      ],
    );
  });
