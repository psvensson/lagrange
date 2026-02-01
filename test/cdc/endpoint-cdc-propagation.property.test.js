/**
 * Property test for CDC Propagation for Endpoint Changes.
 *
 * Property 7: For any INSERT, UPDATE, or DELETE operation on the `node_endpoints`
 * table, a CDC event SHALL be generated, and when that CDC event is applied to
 * the SystemTableCache, the cache SHALL reflect the change.
 *
 * **Validates: Requirements 6.4, 6.5**
 *
 * **Feature: transport-abstraction-layer, Property 7: CDC Propagation for Endpoint Changes**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES, COLUMN, CDC_OPERATION} from '../../src/constants/index.js';
import {TRANSPORT_TYPE, ENDPOINT_STATUS} from '../../src/constants/transport-types.js';

/**
 * Available transport types for testing.
 */
const TRANSPORT_TYPES = [
  TRANSPORT_TYPE.WEBSOCKET,
  TRANSPORT_TYPE.NATS,
  TRANSPORT_TYPE.VEILID,
];

/**
 * Available endpoint statuses for testing.
 */
const ENDPOINT_STATUSES = [
  ENDPOINT_STATUS.ACTIVE,
  ENDPOINT_STATUS.INACTIVE,
];

/**
 * CDC operations to test.
 */
const CDC_OPERATIONS = [
  CDC_OPERATION.INSERT,
  CDC_OPERATION.UPDATE,
  CDC_OPERATION.DELETE,
];

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

/**
 * Generate a valid endpoint record for testing.
 * @param {Object} overrides - Fields to override in the generated record
 * @return {Object} A valid endpoint record
 */
function _generateEndpointRecord(overrides = {}) {
  const now = Date.now();
  return {
    [COLUMN.ENDPOINT_ID]: overrides[COLUMN.ENDPOINT_ID] || `ep-${Math.random().toString(36)}`,
    [COLUMN.NODE_ID]: overrides[COLUMN.NODE_ID] || `node-${Math.random().toString(36)}`,
    [COLUMN.TRANSPORT_TYPE]: overrides[COLUMN.TRANSPORT_TYPE] || TRANSPORT_TYPE.WEBSOCKET,
    [COLUMN.ADDRESS]: overrides[COLUMN.ADDRESS] || 'ws://localhost:8080',
    [COLUMN.PRIORITY]: overrides[COLUMN.PRIORITY] ?? 0,
    [COLUMN.METADATA]: overrides[COLUMN.METADATA] || JSON.stringify({tls: false}),
    [COLUMN.STATUS]: overrides[COLUMN.STATUS] || ENDPOINT_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: overrides[COLUMN.CREATED_AT] || now,
    [COLUMN.UPDATED_AT]: overrides[COLUMN.UPDATED_AT] || now,
  };
}

/**
 * Arbitrary for generating valid endpoint records.
 */
const endpointRecordArb = fc.record({
  endpointId: fc.uuid(),
  nodeId: fc.uuid(),
  transportType: fc.constantFrom(...TRANSPORT_TYPES),
  address: fc.oneof(
    fc.constant('ws://localhost:8080'),
    fc.constant('ws://192.168.1.1:9000'),
    fc.constant('nats://localhost:4222'),
    fc.constant('veilid://abc123'),
  ),
  priority: fc.integer({min: 0, max: 100}),
  status: fc.constantFrom(...ENDPOINT_STATUSES),
  tlsEnabled: fc.boolean(),
}).map(({endpointId, nodeId, transportType, address, priority, status, tlsEnabled}) => {
  const now = Date.now();
  return {
    [COLUMN.ENDPOINT_ID]: endpointId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.TRANSPORT_TYPE]: transportType,
    [COLUMN.ADDRESS]: address,
    [COLUMN.PRIORITY]: priority,
    [COLUMN.METADATA]: JSON.stringify({tls: tlsEnabled}),
    [COLUMN.STATUS]: status,
    [COLUMN.CREATED_AT]: now,
    [COLUMN.UPDATED_AT]: now,
  };
});

/**
 * Feature: transport-abstraction-layer
 * Property 7: CDC Propagation for Endpoint Changes
 *
 * For any INSERT, UPDATE, or DELETE operation on the `node_endpoints` table,
 * a CDC event SHALL be generated, and when that CDC event is applied to the
 * SystemTableCache, the cache SHALL reflect the change.
 */
test('Property 7: CDC Propagation for Endpoint Changes', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });

  /**
   * Property: INSERT operations add records to cache.
   *
   * For any valid endpoint record, applying an INSERT CDC event SHALL result
   * in the record being retrievable from the cache with all fields intact.
   *
   * **Validates: Requirements 6.4, 6.5**
   */
  t.test('INSERT operations add records to cache', async (t) => {
    await fc.assert(
      fc.property(
        endpointRecordArb,
        (endpointRecord) => {
          const cache = new SystemTableCache();

          // Apply INSERT CDC event
          cache.applySystemTableChange(
            TABLES.NODE_ENDPOINTS,
            CDC_OPERATION.INSERT,
            endpointRecord,
          );

          // Verify record is in cache
          const endpointId = endpointRecord[COLUMN.ENDPOINT_ID];
          const retrieved = cache.get(TABLES.NODE_ENDPOINTS, endpointId);

          if (!retrieved) {
            return false;
          }

          // Verify all fields match
          return retrieved[COLUMN.ENDPOINT_ID] === endpointRecord[COLUMN.ENDPOINT_ID] &&
                 retrieved[COLUMN.NODE_ID] === endpointRecord[COLUMN.NODE_ID] &&
                 retrieved[COLUMN.TRANSPORT_TYPE] === endpointRecord[COLUMN.TRANSPORT_TYPE] &&
                 retrieved[COLUMN.ADDRESS] === endpointRecord[COLUMN.ADDRESS] &&
                 retrieved[COLUMN.PRIORITY] === endpointRecord[COLUMN.PRIORITY] &&
                 retrieved[COLUMN.STATUS] === endpointRecord[COLUMN.STATUS];
        },
      ),
      {numRuns: 10},
    );

    t.pass('INSERT operations add records to cache');
  });

  /**
   * Property: UPDATE operations modify existing records in cache.
   *
   * For any existing endpoint record, applying an UPDATE CDC event SHALL
   * modify the record in the cache while preserving unchanged fields.
   *
   * **Validates: Requirements 6.4, 6.5**
   */
  t.test('UPDATE operations modify existing records in cache', async (t) => {
    await fc.assert(
      fc.property(
        endpointRecordArb,
        fc.constantFrom(...ENDPOINT_STATUSES),
        fc.integer({min: 0, max: 100}),
        (originalRecord, newStatus, newPriority) => {
          const cache = new SystemTableCache();

          // First INSERT the record
          cache.applySystemTableChange(
            TABLES.NODE_ENDPOINTS,
            CDC_OPERATION.INSERT,
            originalRecord,
          );

          // Apply UPDATE CDC event with new status and priority
          const updateData = {
            [COLUMN.ENDPOINT_ID]: originalRecord[COLUMN.ENDPOINT_ID],
            [COLUMN.STATUS]: newStatus,
            [COLUMN.PRIORITY]: newPriority,
            [COLUMN.UPDATED_AT]: Date.now(),
          };

          cache.applySystemTableChange(
            TABLES.NODE_ENDPOINTS,
            CDC_OPERATION.UPDATE,
            updateData,
          );

          // Verify record is updated
          const endpointId = originalRecord[COLUMN.ENDPOINT_ID];
          const retrieved = cache.get(TABLES.NODE_ENDPOINTS, endpointId);

          if (!retrieved) {
            return false;
          }

          // Verify updated fields changed
          if (retrieved[COLUMN.STATUS] !== newStatus) {
            return false;
          }
          if (retrieved[COLUMN.PRIORITY] !== newPriority) {
            return false;
          }

          // Verify unchanged fields preserved
          return retrieved[COLUMN.NODE_ID] === originalRecord[COLUMN.NODE_ID] &&
                 retrieved[COLUMN.TRANSPORT_TYPE] === originalRecord[COLUMN.TRANSPORT_TYPE] &&
                 retrieved[COLUMN.ADDRESS] === originalRecord[COLUMN.ADDRESS];
        },
      ),
      {numRuns: 10},
    );

    t.pass('UPDATE operations modify existing records in cache');
  });

  /**
   * Property: DELETE operations remove records from cache.
   *
   * For any existing endpoint record, applying a DELETE CDC event SHALL
   * remove the record from the cache.
   *
   * **Validates: Requirements 6.4, 6.5**
   */
  t.test('DELETE operations remove records from cache', async (t) => {
    await fc.assert(
      fc.property(
        endpointRecordArb,
        (endpointRecord) => {
          const cache = new SystemTableCache();

          // First INSERT the record
          cache.applySystemTableChange(
            TABLES.NODE_ENDPOINTS,
            CDC_OPERATION.INSERT,
            endpointRecord,
          );

          const endpointId = endpointRecord[COLUMN.ENDPOINT_ID];

          // Verify record exists before delete
          if (!cache.has(TABLES.NODE_ENDPOINTS, endpointId)) {
            return false;
          }

          // Apply DELETE CDC event
          cache.applySystemTableChange(
            TABLES.NODE_ENDPOINTS,
            CDC_OPERATION.DELETE,
            {[COLUMN.ENDPOINT_ID]: endpointId},
          );

          // Verify record is removed
          return !cache.has(TABLES.NODE_ENDPOINTS, endpointId) &&
                 cache.get(TABLES.NODE_ENDPOINTS, endpointId) === undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('DELETE operations remove records from cache');
  });

  /**
   * Property: Arbitrary sequences of CDC operations maintain consistency.
   *
   * For any sequence of INSERT, UPDATE, DELETE operations on endpoint records,
   * the cache SHALL reflect the final state after all operations are applied.
   *
   * **Validates: Requirements 6.4, 6.5**
   */
  t.test('arbitrary CDC operation sequences maintain consistency', async (t) => {
    // Generate a sequence of operations on a single endpoint
    const operationArb = fc.record({
      type: fc.constantFrom(...CDC_OPERATIONS),
      status: fc.constantFrom(...ENDPOINT_STATUSES),
      priority: fc.integer({min: 0, max: 100}),
    });

    await fc.assert(
      fc.property(
        endpointRecordArb,
        fc.array(operationArb, {minLength: 1, maxLength: 10}),
        (initialRecord, operations) => {
          const cache = new SystemTableCache();
          const endpointId = initialRecord[COLUMN.ENDPOINT_ID];

          // Track expected state
          let exists = false;
          let expectedStatus = initialRecord[COLUMN.STATUS];
          let expectedPriority = initialRecord[COLUMN.PRIORITY];

          // Apply operations and track expected state
          for (const op of operations) {
            if (op.type === CDC_OPERATION.INSERT) {
              const record = {
                ...initialRecord,
                [COLUMN.STATUS]: op.status,
                [COLUMN.PRIORITY]: op.priority,
              };
              cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, record);
              exists = true;
              expectedStatus = op.status;
              expectedPriority = op.priority;
            } else if (op.type === CDC_OPERATION.UPDATE && exists) {
              const updateData = {
                [COLUMN.ENDPOINT_ID]: endpointId,
                [COLUMN.STATUS]: op.status,
                [COLUMN.PRIORITY]: op.priority,
                [COLUMN.UPDATED_AT]: Date.now(),
              };
              cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPDATE, updateData);
              expectedStatus = op.status;
              expectedPriority = op.priority;
            } else if (op.type === CDC_OPERATION.DELETE && exists) {
              cache.applySystemTableChange(
                TABLES.NODE_ENDPOINTS,
                CDC_OPERATION.DELETE,
                {[COLUMN.ENDPOINT_ID]: endpointId},
              );
              exists = false;
            }
          }

          // Verify final state matches expected
          const hasRecord = cache.has(TABLES.NODE_ENDPOINTS, endpointId);
          if (hasRecord !== exists) {
            return false;
          }

          if (exists) {
            const retrieved = cache.get(TABLES.NODE_ENDPOINTS, endpointId);
            return retrieved[COLUMN.STATUS] === expectedStatus &&
                   retrieved[COLUMN.PRIORITY] === expectedPriority;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('arbitrary CDC operation sequences maintain consistency');
  });

  /**
   * Property: CDC operations on multiple endpoints are independent.
   *
   * For any set of endpoint records, CDC operations on one endpoint SHALL NOT
   * affect other endpoints in the cache.
   *
   * **Validates: Requirements 6.4, 6.5**
   */
  t.test('CDC operations on multiple endpoints are independent', async (t) => {
    await fc.assert(
      fc.property(
        fc.array(endpointRecordArb, {minLength: 2, maxLength: 5}),
        fc.nat({max: 4}),
        (endpoints, targetIndex) => {
          const cache = new SystemTableCache();
          const safeIndex = targetIndex % endpoints.length;

          // Insert all endpoints
          for (const endpoint of endpoints) {
            cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, endpoint);
          }

          // Delete one endpoint
          const targetEndpoint = endpoints[safeIndex];
          const targetId = targetEndpoint[COLUMN.ENDPOINT_ID];
          cache.applySystemTableChange(
            TABLES.NODE_ENDPOINTS,
            CDC_OPERATION.DELETE,
            {[COLUMN.ENDPOINT_ID]: targetId},
          );

          // Verify target is deleted
          if (cache.has(TABLES.NODE_ENDPOINTS, targetId)) {
            return false;
          }

          // Verify other endpoints are unaffected
          for (let i = 0; i < endpoints.length; i++) {
            if (i === safeIndex) continue;

            const endpoint = endpoints[i];
            const endpointId = endpoint[COLUMN.ENDPOINT_ID];
            const retrieved = cache.get(TABLES.NODE_ENDPOINTS, endpointId);

            if (!retrieved) {
              return false;
            }
            if (retrieved[COLUMN.NODE_ID] !== endpoint[COLUMN.NODE_ID]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CDC operations on multiple endpoints are independent');
  });

  /**
   * Property: getEndpointsForNode reflects CDC changes.
   *
   * For any CDC operations on endpoints for a node, getEndpointsForNode SHALL
   * return the current state of all endpoints for that node.
   *
   * **Validates: Requirements 6.4, 6.5, 6.6**
   */
  t.test('getEndpointsForNode reflects CDC changes', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            endpointId: fc.uuid(),
            transportType: fc.constantFrom(...TRANSPORT_TYPES),
            priority: fc.integer({min: 0, max: 100}),
            status: fc.constantFrom(...ENDPOINT_STATUSES),
          }),
          {minLength: 1, maxLength: 5},
        ),
        (nodeId, endpointConfigs) => {
          const cache = new SystemTableCache();
          const now = Date.now();

          // Insert endpoints for the node
          for (const config of endpointConfigs) {
            const record = {
              [COLUMN.ENDPOINT_ID]: config.endpointId,
              [COLUMN.NODE_ID]: nodeId,
              [COLUMN.TRANSPORT_TYPE]: config.transportType,
              [COLUMN.ADDRESS]: `${config.transportType}://localhost:8080`,
              [COLUMN.PRIORITY]: config.priority,
              [COLUMN.METADATA]: JSON.stringify({}),
              [COLUMN.STATUS]: config.status,
              [COLUMN.CREATED_AT]: now,
              [COLUMN.UPDATED_AT]: now,
            };
            cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.INSERT, record);
          }

          // Get endpoints for node
          const endpoints = cache.getEndpointsForNode(nodeId);

          // Verify count matches
          if (endpoints.length !== endpointConfigs.length) {
            return false;
          }

          // Verify all endpoints belong to the node
          for (const endpoint of endpoints) {
            if (endpoint[COLUMN.NODE_ID] !== nodeId) {
              return false;
            }
          }

          // Verify endpoints are sorted by priority
          for (let i = 1; i < endpoints.length; i++) {
            if (endpoints[i][COLUMN.PRIORITY] < endpoints[i - 1][COLUMN.PRIORITY]) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getEndpointsForNode reflects CDC changes');
  });

  /**
   * Property: Cache notifications are triggered for CDC operations.
   *
   * For any CDC operation on node_endpoints, the cache SHALL notify listeners
   * with the correct table name, operation, and record data.
   *
   * **Validates: Requirements 6.4, 6.5**
   */
  t.test('cache notifications are triggered for CDC operations', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        endpointRecordArb,
        async (endpointRecord) => {
          const cache = new SystemTableCache();
          const notifications = [];

          cache.onCacheChange((tableName, operation, record) => {
            notifications.push({tableName, operation, record});
          });

          // Apply INSERT
          cache.applySystemTableChange(
            TABLES.NODE_ENDPOINTS,
            CDC_OPERATION.INSERT,
            endpointRecord,
          );

          // Wait for setImmediate to fire
          await new Promise((resolve) => setImmediate(resolve));

          // Verify notification was sent
          if (notifications.length !== 1) {
            return false;
          }

          const notification = notifications[0];
          return notification.tableName === TABLES.NODE_ENDPOINTS &&
                 notification.operation === CDC_OPERATION.INSERT &&
                 notification.record[COLUMN.ENDPOINT_ID] ===
                   endpointRecord[COLUMN.ENDPOINT_ID];
        },
      ),
      {numRuns: 10},
    );

    t.pass('cache notifications are triggered for CDC operations');
  });
});
