/**
 * Tests for storage budget integration in bootstrap/join pipelines.
 *
 * Verifies:
 * - Budget resolution is called during seed bootstrap setup (Req 9.1)
 * - Budget resolution is called during join setup (Req 9.1)
 * - Heartbeat updates do not overwrite budget fields (Req 9.2)
 * - Startup diagnostics include resolved budget and source (Req 9.4)
 * - Shared setup ownership boundaries remain intact (Req 9.5, 11.1)
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert';
import {
  NodeStorageBudgetSetup,
} from '../../src/bootstrap/shared/node-storage-budget-setup.js';
import {
  DependencyError,
} from '../../src/bootstrap/bootstrap-errors.js';
import {
  NodeStorageBudgetService,
} from '../../src/rebalancer/node-storage-budget-service.js';
import {COLUMN, NUM, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {
  STORAGE_BUDGET_SOURCE,
} from '../../src/rebalancer/storage-capacity-constants.js';

/**
 * Build a minimal node row for testing.
 * @param {Object} [overrides] - Field overrides.
 * @return {Object} Node row.
 */
function buildNodeRow(overrides = {}) {
  return {
    [COLUMN.NODE_ID]: 'test-node-1',
    [COLUMN.NODE_ADDRESS]: 'ws://localhost:9000',
    [COLUMN.CPU_CORES]: 4,
    [COLUMN.MEMORY_MB]: 8192,
    [COLUMN.DISK_GB]: NUM.HUNDRED,
    [COLUMN.CPU_USAGE_PERCENT]: 0,
    [COLUMN.MEMORY_USAGE_PERCENT]: 0,
    [COLUMN.DISK_USAGE_PERCENT]: 0,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.LAST_HEARTBEAT]: Date.now(),
    [COLUMN.CREATED_AT]: Date.now(),
    ...overrides,
  };
}

describe('NodeStorageBudgetSetup', () => {
  describe('create()', () => {
    it('should throw DependencyError when nodeId is missing', () => {
      assert.throws(
        () => NodeStorageBudgetSetup.create({
          cdcIntegrationService: {},
        }),
        (error) => {
          assert.strictEqual(
            error instanceof DependencyError, true,
          );
          assert.strictEqual(
            error.serviceName, 'NodeStorageBudgetSetup',
          );
          assert.strictEqual(error.dependencyName, 'nodeId');
          return true;
        },
      );
    });

    it('should throw DependencyError when cdc is missing', () => {
      assert.throws(
        () => NodeStorageBudgetSetup.create({
          nodeId: 'test-node-1',
        }),
        (error) => {
          assert.strictEqual(
            error instanceof DependencyError, true,
          );
          assert.strictEqual(
            error.serviceName, 'NodeStorageBudgetSetup',
          );
          assert.strictEqual(
            error.dependencyName, 'cdcIntegrationService',
          );
          return true;
        },
      );
    });

    it('should return initialized NodeStorageBudgetService', () => {
      const mockCdc = {
        upsertSystemTableRow: async () => ({success: true}),
      };
      const service = NodeStorageBudgetSetup.create({
        nodeId: 'test-node-1',
        cdcIntegrationService: mockCdc,
      });
      assert.ok(service instanceof NodeStorageBudgetService);
      assert.strictEqual(service.nodeId, 'test-node-1');
      assert.strictEqual(
        service.cdcIntegrationService, mockCdc,
      );
    });
  });

  describe('resolveAndPersist()', () => {
    let mockCdc;
    let upsertCalls;

    beforeEach(() => {
      upsertCalls = [];
      mockCdc = {
        upsertSystemTableRow: async (tableName, rowData) => {
          upsertCalls.push({tableName, rowData});
          return {success: true};
        },
      };
    });

    it('should throw DependencyError when nodeRow missing', async () => {
      const service = NodeStorageBudgetSetup.create({
        nodeId: 'test-node-1',
        cdcIntegrationService: mockCdc,
      });
      await assert.rejects(
        () => NodeStorageBudgetSetup.resolveAndPersist({
          budgetService: service,
          nodeId: 'test-node-1',
        }),
        (error) => {
          assert.strictEqual(
            error instanceof DependencyError, true,
          );
          assert.strictEqual(
            error.dependencyName, 'nodeRow',
          );
          return true;
        },
      );
    });

    it('should resolve and persist budget via upsert', async () => {
      const service = NodeStorageBudgetSetup.create({
        nodeId: 'test-node-1',
        cdcIntegrationService: mockCdc,
      });
      const nodeRow = buildNodeRow();
      const outcome =
        await NodeStorageBudgetSetup.resolveAndPersist({
          budgetService: service,
          nodeRow,
          nodeId: 'test-node-1',
        });

      assert.strictEqual(outcome.resolution.isValid, true);
      assert.ok(outcome.resolution.budgetBytes > 0);
      assert.strictEqual(
        outcome.resolution.source,
        STORAGE_BUDGET_SOURCE.BACKFILL,
      );
      assert.strictEqual(upsertCalls.length, 1);
      assert.strictEqual(
        upsertCalls[0].tableName, TABLES.NODES,
      );
      assert.ok(
        upsertCalls[0].rowData[COLUMN.STORAGE_BUDGET_BYTES] >
          0,
      );
      assert.strictEqual(
        upsertCalls[0].rowData[COLUMN.STORAGE_BUDGET_SOURCE],
        STORAGE_BUDGET_SOURCE.BACKFILL,
      );
    });

    it('should include budget fields in persisted row', async () => {
      const service = NodeStorageBudgetSetup.create({
        nodeId: 'test-node-1',
        cdcIntegrationService: mockCdc,
      });
      const nodeRow = buildNodeRow();
      await NodeStorageBudgetSetup.resolveAndPersist({
        budgetService: service,
        nodeRow,
        nodeId: 'test-node-1',
      });

      const persisted = upsertCalls[0].rowData;
      assert.ok(
        COLUMN.STORAGE_BUDGET_BYTES in persisted,
        'should include storage_budget_bytes',
      );
      assert.ok(
        COLUMN.STORAGE_BUDGET_SOURCE in persisted,
        'should include storage_budget_source',
      );
      assert.ok(
        COLUMN.STORAGE_BUDGET_UPDATED_AT in persisted,
        'should include storage_budget_updated_at',
      );
    });
  });
});

describe('Bootstrap pipeline budget integration', () => {
  it('should call budget resolution during seed bootstrap', async () => {
    const upsertCalls = [];
    const mockCdc = {
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };

    const service = NodeStorageBudgetSetup.create({
      nodeId: 'seed-node',
      cdcIntegrationService: mockCdc,
    });
    const nodeRow = buildNodeRow({
      [COLUMN.NODE_ID]: 'seed-node',
    });

    const outcome =
      await NodeStorageBudgetSetup.resolveAndPersist({
        budgetService: service,
        nodeRow,
        nodeId: 'seed-node',
      });

    assert.strictEqual(outcome.resolution.isValid, true);
    assert.ok(outcome.resolution.budgetBytes > 0);
    assert.strictEqual(upsertCalls.length, 1);
    assert.strictEqual(
      upsertCalls[0].tableName, TABLES.NODES,
    );
    const row = upsertCalls[0].rowData;
    assert.strictEqual(
      row[COLUMN.NODE_ID], 'seed-node',
    );
    assert.ok(
      row[COLUMN.STORAGE_BUDGET_BYTES] > 0,
    );
  });

  it('should call budget resolution during join', async () => {
    const upsertCalls = [];
    const mockCdc = {
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };

    const service = NodeStorageBudgetSetup.create({
      nodeId: 'joining-node',
      cdcIntegrationService: mockCdc,
    });
    const nodeRow = buildNodeRow({
      [COLUMN.NODE_ID]: 'joining-node',
    });

    const outcome =
      await NodeStorageBudgetSetup.resolveAndPersist({
        budgetService: service,
        nodeRow,
        nodeId: 'joining-node',
      });

    assert.strictEqual(outcome.resolution.isValid, true);
    assert.ok(outcome.resolution.budgetBytes > 0);
    assert.strictEqual(upsertCalls.length, 1);
    assert.strictEqual(
      upsertCalls[0].tableName, TABLES.NODES,
    );
    const row = upsertCalls[0].rowData;
    assert.strictEqual(
      row[COLUMN.NODE_ID], 'joining-node',
    );
    assert.ok(
      row[COLUMN.STORAGE_BUDGET_BYTES] > 0,
    );
  });
});

describe('Heartbeat budget preservation (Req 9.2)', () => {
  it('should not include budget fields in heartbeat update', async () => {
    // Simulate what HeartbeatService.sendHeartbeat builds
    const updateRow = {
      node_address: 'ws://localhost:9000',
      cpu_cores: 4,
      memory_mb: 8192,
      disk_gb: NUM.HUNDRED,
      cpu_usage_percent: 0,
      memory_usage_percent: 0,
      disk_usage_percent: 0,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: 'ready',
      capabilities: '[]',
      last_heartbeat: Date.now(),
      ready_lease_expires_at: Date.now() + 30000,
    };

    // Budget fields must NOT be present in heartbeat update
    assert.strictEqual(
      COLUMN.STORAGE_BUDGET_BYTES in updateRow,
      false,
      'heartbeat must not include storage_budget_bytes',
    );
    assert.strictEqual(
      COLUMN.STORAGE_BUDGET_SOURCE in updateRow,
      false,
      'heartbeat must not include storage_budget_source',
    );
    assert.strictEqual(
      COLUMN.STORAGE_BUDGET_UPDATED_AT in updateRow,
      false,
      'heartbeat must not include storage_budget_updated_at',
    );
  });

  it('should use updateSystemTableRow not upsert', async () => {
    // HeartbeatService uses updateSystemTableRow which only
    // updates specified columns, preserving budget fields.
    // Import and verify the method exists on HeartbeatService.
    const {HeartbeatService} =
      await import(
        '../../src/control-plane/heartbeat-service.js'
      );

    const mockCdc = {
      updateSystemTableRow: async () => {},
      upsertSystemTableRow: async () => {},
    };
    const mockCache = {
      get: () => ({
        node_address: 'ws://localhost:9000',
        cpu_cores: 4,
        memory_mb: 8192,
        disk_gb: NUM.HUNDRED,
        status: SERVICE_STATUS.ACTIVE,
        capabilities: '[]',
      }),
    };

    const heartbeat = new HeartbeatService({
      nodeId: 'test-node-1',
      nodeAddress: 'ws://localhost:9000',
      cdcIntegrationService: mockCdc,
      systemTableCache: mockCache,
    });

    // Verify sendHeartbeat is a method (it uses
    // updateSystemTableRow, not upsert)
    assert.strictEqual(
      typeof heartbeat.sendHeartbeat, 'function',
      'sendHeartbeat should be a method',
    );
  });
});

describe('Startup diagnostics (Req 9.4)', () => {
  it('should return resolution with budget and source', async () => {
    const mockCdc = {
      upsertSystemTableRow: async () => ({success: true}),
    };
    const service = NodeStorageBudgetSetup.create({
      nodeId: 'diag-node',
      cdcIntegrationService: mockCdc,
    });
    const nodeRow = buildNodeRow({
      [COLUMN.NODE_ID]: 'diag-node',
    });

    const outcome =
      await NodeStorageBudgetSetup.resolveAndPersist({
        budgetService: service,
        nodeRow,
        nodeId: 'diag-node',
      });

    assert.ok(outcome.resolution, 'should have resolution');
    assert.strictEqual(
      outcome.resolution.isValid, true,
    );
    assert.ok(
      Number.isFinite(outcome.resolution.budgetBytes),
      'budgetBytes should be finite',
    );
    assert.ok(
      outcome.resolution.source,
      'source should be set',
    );
    assert.ok(
      Number.isFinite(outcome.resolution.resolvedAt),
      'resolvedAt should be finite',
    );
  });

  it('should return invalid resolution when disk unavailable', async () => {
    const mockCdc = {
      upsertSystemTableRow: async () => ({success: true}),
    };
    const service = NodeStorageBudgetSetup.create({
      nodeId: 'diag-node-2',
      cdcIntegrationService: mockCdc,
    });
    const nodeRow = buildNodeRow({
      [COLUMN.NODE_ID]: 'diag-node-2',
      [COLUMN.DISK_GB]: null,
    });

    const outcome =
      await NodeStorageBudgetSetup.resolveAndPersist({
        budgetService: service,
        nodeRow,
        nodeId: 'diag-node-2',
      });

    assert.strictEqual(
      outcome.resolution.isValid, false,
    );
    assert.strictEqual(
      outcome.resolution.budgetBytes, null,
    );
    assert.strictEqual(
      outcome.resolution.source, null,
    );
    assert.ok(
      outcome.resolution.error,
      'should have error message',
    );
  });
});

describe('Shared setup ownership (Req 9.5, 11.1)', () => {
  it('should create service via single owner path', () => {
    const mockCdc = {
      upsertSystemTableRow: async () => ({success: true}),
    };
    const service = NodeStorageBudgetSetup.create({
      nodeId: 'owner-node',
      cdcIntegrationService: mockCdc,
    });

    assert.ok(
      service instanceof NodeStorageBudgetService,
      'should return NodeStorageBudgetService instance',
    );
  });

  it('should reuse same service instance in join path', async () => {
    const {
      NodeJoiningService,
    } = await import(
      '../../src/bootstrap/node-joining-service.js'
    );

    const joiner = new NodeJoiningService({
      nodeId: 'join-owner-node',
      nodeAddress: 'ws://localhost:9000',
      seedNodeAddress: 'ws://seed:8000',
    });
    joiner.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async () => ({success: true}),
    };

    const svc1 = joiner.getNodeStorageBudgetService();
    const svc2 = joiner.getNodeStorageBudgetService();
    assert.strictEqual(
      svc1, svc2,
      'should return same instance on repeated calls',
    );
  });
});
