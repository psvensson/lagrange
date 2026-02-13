import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {RegistrationPhase} from
  '../../src/bootstrap/phases/registration-phase.js';
import {SystemTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  META_SERVICE_ID,
  META_SERVICE_RUNTIME_REF,
} from '../../src/constants/index.js';
import {SD_COL} from
  '../../src/wasm-service/wasm-service-models.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_DEFAULT,
} from '../../src/wasm-service/wasm-service-constants.js';

describe('meta-service-bootstrap-seeding', () => {
  let upsertCalls;
  let phase;

  beforeEach(() => {
    upsertCalls = [];

    const mockCdc = {
      upsertSystemTableRow: async (table, row) => {
        upsertCalls.push({table, row});
      },
      setBootstrapMode: () => {},
      clearBootstrapMode: () => {},
      updateSystemTableRow: async () => {},
    };

    const mockPartition = {
      partitionId: 'services-p1',
      isLeader: true,
      executeLocalQuery: async () => ({
        success: true,
        rows: [{name: 'services'}],
      }),
      executeQuery: async () => ({rows: [{count: 1}]}),
      calculatePartitionSize: async () => 0,
      getRole: () => 'leader',
    };

    const partitionServices = new Map();
    partitionServices.set('services-p1-r1', mockPartition);

    const mockMgService = {
      isLeaderReplica: () => true,
      getRole: () => 'leader',
      nodeId: 'seed-node',
    };
    const messageGroupServices = new Map();
    messageGroupServices.set('mg-1-r1', mockMgService);

    phase = new RegistrationPhase({
      nodeId: 'seed-node',
      partitionServices,
      messageGroupServices,
      cdcIntegrationService: mockCdc,
      getLeaderMessageGroupService: () => mockMgService,
      getSystemTableCache: () => ({getAll: () => []}),
    });
  });

  it('should seed sys-wasm-meta definition', async () => {
    const timestamp = Date.now();
    await phase.registerMetaServiceDefinitions(timestamp);

    const wasmMetaCall = upsertCalls.find(
      (c) => c.table === SystemTableName.SERVICE_DEFINITIONS &&
        c.row[SD_COL.SERVICE_ID] === META_SERVICE_ID.WASM_META
    );
    assert.ok(
      wasmMetaCall,
      'Expected upsert call for sys-wasm-meta'
    );
  });

  it('should seed sys-admin-meta definition', async () => {
    const timestamp = Date.now();
    await phase.registerMetaServiceDefinitions(timestamp);

    const adminMetaCall = upsertCalls.find(
      (c) => c.table === SystemTableName.SERVICE_DEFINITIONS &&
        c.row[SD_COL.SERVICE_ID] === META_SERVICE_ID.ADMIN_META
    );
    assert.ok(
      adminMetaCall,
      'Expected upsert call for sys-admin-meta'
    );
  });

  it('should write to service_definitions table', async () => {
    await phase.registerMetaServiceDefinitions(Date.now());

    const defCalls = upsertCalls.filter(
      (c) => c.table === SystemTableName.SERVICE_DEFINITIONS
    );
    assert.equal(defCalls.length, 2);
  });

  it('should set correct consistency modes on wasm-meta row', async () => {
    await phase.registerMetaServiceDefinitions(Date.now());

    const wasmMetaCall = upsertCalls.find(
      (c) => c.row[SD_COL.SERVICE_ID] === META_SERVICE_ID.WASM_META
    );
    assert.equal(
      wasmMetaCall.row[SD_COL.READ_CONSISTENCY],
      READ_CONSISTENCY_MODE.STRONG
    );
    assert.equal(
      wasmMetaCall.row[SD_COL.WRITE_CONSISTENCY],
      WRITE_CONSISTENCY_MODE.STRONG
    );
  });

  it('should set correct replica count on wasm-meta row', async () => {
    await phase.registerMetaServiceDefinitions(Date.now());

    const wasmMetaCall = upsertCalls.find(
      (c) => c.row[SD_COL.SERVICE_ID] === META_SERVICE_ID.WASM_META
    );
    assert.equal(
      wasmMetaCall.row[SD_COL.REPLICA_COUNT],
      WASM_SERVICE_DEFAULT.REPLICA_COUNT
    );
  });

  it('should preserve legacy handler mapping for built-in services',
    async () => {
      await phase.registerMetaServiceDefinitions(Date.now());

      const wasmMetaCall = upsertCalls.find(
        (c) => c.row[SD_COL.SERVICE_ID] === META_SERVICE_ID.WASM_META
      );
      assert.equal(
        wasmMetaCall.row[SD_COL.HANDLER_FUNCTION_ID],
        META_SERVICE_RUNTIME_REF.WASM_META
      );

      const adminMetaCall = upsertCalls.find(
        (c) => c.row[SD_COL.SERVICE_ID] === META_SERVICE_ID.ADMIN_META
      );
      assert.equal(
        adminMetaCall.row[SD_COL.HANDLER_FUNCTION_ID],
        null
      );
    });
});
