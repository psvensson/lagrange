import {test} from '../../src/test-helpers/tap.js';
import {
  AUTHORITATIVE_REPAIR_TRIGGER,
  evaluateAuthoritativeRepairPolicy,
} from '../../src/admin/admin-authoritative-repair-policy.js';

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
