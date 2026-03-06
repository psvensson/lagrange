/**
 * Tests for StorageCapacityMigration and admission rollout modes.
 * Requirements: 12.2, 12.4, 12.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {
  COLUMN,
  NUM,
  TABLES,
} from '../../src/constants/index.js';
import {
  ADMISSION_DECISION,
  ADMISSION_MODE,
  ADMISSION_REASON,
  BACKFILL_DEFAULT_RATIO,
  STORAGE_BUDGET_SOURCE,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {
  StorageAdmissionService,
} from '../../src/rebalancer/storage-admission-service.js';
import {
  StorageCapacityMigration,
  MIGRATION_ERROR_MSG,
} from '../../src/rebalancer/storage-capacity-migration.js';

function initializeConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      messageGroupReplicaOverheadBytes: NUM.TWO,
      serviceReplicaOverheadBytes: NUM.ONE,
      storageSoftPressurePercent:
        STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT,
      storageHardPressurePercent:
        STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT,
      storageEmergencyHeadroomPercent:
        STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT,
      ...overrides,
    },
  });
}

function insertRow(cache, tableName, row) {
  cache.applySystemTableChange(
    tableName,
    CDC_OPERATION.INSERT,
    row,
  );
}

function createMockCdc() {
  const upserted = [];
  return {
    upserted,
    upsertSystemTableRow(table, row) {
      upserted.push({table, row});
      return {success: true};
    },
  };
}

function createAdmissionService(accountingService) {
  return new StorageAdmissionService({
    accountingService,
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () => ({
        currentMode: 'grouped',
        reasonCode: null,
        enteredAt: new Date().toISOString(),
        recentTransitions: [],
      }),
    },
  });
}

// --- getBackfillBudget ---

test('getBackfillBudget - computes 80% of disk_gb in bytes', (t) => {
  const migration = new StorageCapacityMigration({});
  const diskGb = NUM.TEN;
  const expected = Math.floor(
    diskGb * NUM.BYTES_PER_GIB * BACKFILL_DEFAULT_RATIO,
  );

  const result = migration.getBackfillBudget({
    [COLUMN.DISK_GB]: diskGb,
  });

  t.equal(result, expected);
  t.end();
});

test('getBackfillBudget - returns null for null disk_gb', (t) => {
  const migration = new StorageCapacityMigration({});

  const result = migration.getBackfillBudget({
    [COLUMN.DISK_GB]: null,
  });

  t.equal(result, null);
  t.end();
});

test('getBackfillBudget - returns null for zero disk_gb', (t) => {
  const migration = new StorageCapacityMigration({});

  const result = migration.getBackfillBudget({
    [COLUMN.DISK_GB]: NUM.ZERO,
  });

  t.equal(result, null);
  t.end();
});

test('getBackfillBudget - returns null for negative disk_gb', (t) => {
  const migration = new StorageCapacityMigration({});

  const result = migration.getBackfillBudget({
    [COLUMN.DISK_GB]: NUM.NEGATIVE_ONE,
  });

  t.equal(result, null);
  t.end();
});

test('getBackfillBudget - returns null for undefined row', (t) => {
  const migration = new StorageCapacityMigration({});

  const result = migration.getBackfillBudget(undefined);

  t.equal(result, null);
  t.end();
});

// --- backfillNodeBudgets ---

test('backfillNodeBudgets - backfills nodes missing budget',
  async (t) => {
    initializeConfig();
    const cdc = createMockCdc();
    const migration = new StorageCapacityMigration({
      cdcIntegrationService: cdc,
    });

    const nodeRows = [
      {[COLUMN.NODE_ID]: 'node-1', [COLUMN.DISK_GB]: NUM.TEN},
      {[COLUMN.NODE_ID]: 'node-2', [COLUMN.DISK_GB]: NUM.FIVE},
    ];

    const summary = await migration.backfillNodeBudgets(nodeRows);

    t.equal(summary.backfilled, NUM.TWO);
    t.equal(summary.skipped, NUM.ZERO);
    t.equal(cdc.upserted.length, NUM.TWO);

    const row1 = cdc.upserted[NUM.ZERO].row;
    t.equal(row1[COLUMN.NODE_ID], 'node-1');
    t.equal(
      row1[COLUMN.STORAGE_BUDGET_BYTES],
      Math.floor(NUM.TEN * NUM.BYTES_PER_GIB * BACKFILL_DEFAULT_RATIO),
    );
    t.equal(
      row1[COLUMN.STORAGE_BUDGET_SOURCE],
      STORAGE_BUDGET_SOURCE.BACKFILL,
    );
    t.end();
  });

test('backfillNodeBudgets - skips nodes that already have budget',
  async (t) => {
    initializeConfig();
    const cdc = createMockCdc();
    const migration = new StorageCapacityMigration({
      cdcIntegrationService: cdc,
    });

    const nodeRows = [
      {
        [COLUMN.NODE_ID]: 'node-1',
        [COLUMN.DISK_GB]: NUM.TEN,
        [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
      },
    ];

    const summary = await migration.backfillNodeBudgets(nodeRows);

    t.equal(summary.backfilled, NUM.ZERO);
    t.equal(summary.skipped, NUM.ONE);
    t.equal(cdc.upserted.length, NUM.ZERO);
    t.end();
  });

test('backfillNodeBudgets - skips nodes with null disk_gb',
  async (t) => {
    initializeConfig();
    const cdc = createMockCdc();
    const migration = new StorageCapacityMigration({
      cdcIntegrationService: cdc,
    });

    const nodeRows = [
      {[COLUMN.NODE_ID]: 'node-1', [COLUMN.DISK_GB]: null},
    ];

    const summary = await migration.backfillNodeBudgets(nodeRows);

    t.equal(summary.backfilled, NUM.ZERO);
    t.equal(summary.skipped, NUM.ONE);
    t.equal(cdc.upserted.length, NUM.ZERO);
    t.end();
  });

test('backfillNodeBudgets - skips nodes with zero disk_gb',
  async (t) => {
    initializeConfig();
    const cdc = createMockCdc();
    const migration = new StorageCapacityMigration({
      cdcIntegrationService: cdc,
    });

    const nodeRows = [
      {[COLUMN.NODE_ID]: 'node-1', [COLUMN.DISK_GB]: NUM.ZERO},
    ];

    const summary = await migration.backfillNodeBudgets(nodeRows);

    t.equal(summary.backfilled, NUM.ZERO);
    t.equal(summary.skipped, NUM.ONE);
    t.end();
  });

test('backfillNodeBudgets - mixed: backfills some, skips others',
  async (t) => {
    initializeConfig();
    const cdc = createMockCdc();
    const migration = new StorageCapacityMigration({
      cdcIntegrationService: cdc,
    });

    const nodeRows = [
      {[COLUMN.NODE_ID]: 'n-1', [COLUMN.DISK_GB]: NUM.TEN},
      {
        [COLUMN.NODE_ID]: 'n-2',
        [COLUMN.DISK_GB]: NUM.FIVE,
        [COLUMN.STORAGE_BUDGET_BYTES]: NUM.HUNDRED,
      },
      {[COLUMN.NODE_ID]: 'n-3', [COLUMN.DISK_GB]: null},
    ];

    const summary = await migration.backfillNodeBudgets(nodeRows);

    t.equal(summary.backfilled, NUM.ONE);
    t.equal(summary.skipped, NUM.TWO);
    t.equal(cdc.upserted.length, NUM.ONE);
    t.equal(cdc.upserted[NUM.ZERO].row[COLUMN.NODE_ID], 'n-1');
    t.end();
  });

test('backfillNodeBudgets - throws when nodeRows is not array',
  async (t) => {
    const migration = new StorageCapacityMigration({
      cdcIntegrationService: createMockCdc(),
    });

    await t.rejects(
      migration.backfillNodeBudgets('not-array'),
      {message: MIGRATION_ERROR_MSG.NODE_ROWS_REQUIRED},
    );
    t.end();
  });

test('backfillNodeBudgets - throws when cdc missing', async (t) => {
  const migration = new StorageCapacityMigration({});

  await t.rejects(
    migration.backfillNodeBudgets([]),
    {message: MIGRATION_ERROR_MSG.CDC_REQUIRED},
  );
  t.end();
});

// --- Observe mode ---

test('observe mode - overrides deny to allow', async (t) => {
  initializeConfig({storageAdmissionMode: ADMISSION_MODE.OBSERVE});
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.HUNDRED,
  });

  const admission = createAdmissionService(accounting);

  // Request exceeds budget -> would be denied in enforce mode
  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.HUNDRED + NUM.ONE,
  });

  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  t.equal(result.reason, ADMISSION_REASON.BUDGET_EXCEEDED);
  t.end();
});

test('observe mode - allows already-allowed decisions unchanged',
  async (t) => {
    initializeConfig({storageAdmissionMode: ADMISSION_MODE.OBSERVE});
    const cache = new SystemTableCache();
    const accounting = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    accounting.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
    });

    const admission = createAdmissionService(accounting);

    const result = await admission.checkAdd({
      targetNodeId: 'node-1',
      estimatedBytes: NUM.TEN,
    });

    t.equal(result.decision, ADMISSION_DECISION.ALLOW);
    t.equal(result.reason, ADMISSION_REASON.CAPACITY_AVAILABLE);
    t.end();
  });

test('enforce mode - default mode is enforce', async (t) => {
  initializeConfig();
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.HUNDRED,
  });

  const admission = createAdmissionService(accounting);

  // Default mode is enforce, so deny should be preserved.
  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.HUNDRED + NUM.ONE,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.end();
});

// --- Enforce mode ---

test('enforce mode - returns actual deny decisions', async (t) => {
  initializeConfig({storageAdmissionMode: ADMISSION_MODE.ENFORCE});
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.HUNDRED,
  });

  const admission = createAdmissionService(accounting);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.HUNDRED + NUM.ONE,
  });

  t.equal(result.decision, ADMISSION_DECISION.DENY);
  t.equal(result.reason, ADMISSION_REASON.BUDGET_EXCEEDED);
  t.end();
});

test('enforce mode - allows when capacity available', async (t) => {
  initializeConfig({storageAdmissionMode: ADMISSION_MODE.ENFORCE});
  const cache = new SystemTableCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
  });

  const admission = createAdmissionService(accounting);

  const result = await admission.checkAdd({
    targetNodeId: 'node-1',
    estimatedBytes: NUM.TEN,
  });

  t.equal(result.decision, ADMISSION_DECISION.ALLOW);
  t.equal(result.reason, ADMISSION_REASON.CAPACITY_AVAILABLE);
  t.end();
});

// --- Mode transition ---

test('mode transition - observe to enforce via refreshConfig',
  async (t) => {
    initializeConfig({storageAdmissionMode: ADMISSION_MODE.OBSERVE});
    const cache = new SystemTableCache();
    const accounting = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    accounting.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.STORAGE_BUDGET_BYTES]: NUM.HUNDRED,
    });

    const admission = createAdmissionService(accounting);

    // In observe mode: deny overridden to allow
    const r1 = await admission.checkAdd({
      targetNodeId: 'node-1',
      estimatedBytes: NUM.HUNDRED + NUM.ONE,
    });
    t.equal(r1.decision, ADMISSION_DECISION.ALLOW);

    // Switch to enforce mode by re-initializing config
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      rebalancer: {
        minimumReplicaBytes: NUM.TEN,
        partitionReplicaOverheadBytes: NUM.FIVE,
        messageGroupReplicaOverheadBytes: NUM.TWO,
        serviceReplicaOverheadBytes: NUM.ONE,
        storageSoftPressurePercent:
          STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT,
        storageHardPressurePercent:
          STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT,
        storageEmergencyHeadroomPercent:
          STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT,
        storageAdmissionMode: ADMISSION_MODE.ENFORCE,
      },
    });
    admission.refreshConfig();

    // In enforce mode: deny is real
    const r2 = await admission.checkAdd({
      targetNodeId: 'node-1',
      estimatedBytes: NUM.HUNDRED + NUM.ONE,
    });
    t.equal(r2.decision, ADMISSION_DECISION.DENY);
    t.end();
  });
