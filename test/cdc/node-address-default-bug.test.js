/**
 * Test for bug: applyTableInsertDefaults incorrectly sets node_address to node_id.
 *
 * Bug Description:
 * When inserting a row into the nodes table without a node_address,
 * the applyTableInsertDefaults method incorrectly sets node_address = node_id.
 * This is wrong because node_address should be a WebSocket URL (e.g., ws://localhost:8080)
 * not a UUID (e.g., 550e8400-e29b-41d4-a716-446655440001).
 *
 * This causes downstream failures when code tries to use node_address for
 * WebSocket connections or message routing.
 */

import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {COLUMN} from '../../src/constants/index.js';

test('applyTableInsertDefaults should not set node_address to node_id', async (t) => {
  const cdcService = new CDCIntegrationService({nodeId: 'test-node'});

  // Test case: Insert node with node_id but no node_address
  // The bug would set node_address = node_id (a UUID), which is wrong
  const nodeId = '550e8400-e29b-41d4-a716-446655440001';
  const inputData = {
    [COLUMN.NODE_ID]: nodeId,
    // Intentionally omitting node_address to trigger the bug
  };

  // Use prepareInsertData which calls applyTableInsertDefaults internally
  const preparedData = cdcService.prepareInsertData(
    SYSTEM_TABLE_NAME.NODES,
    inputData,
    {generatePrimaryKey: false},
  );

  // The bug: node_address should NOT be set to node_id
  // node_address should either be:
  // 1. Not set at all (let caller provide it)
  // 2. Set to a proper default like 'unknown' or null
  // But NEVER set to node_id which is a UUID

  t.not(
    preparedData[COLUMN.NODE_ADDRESS],
    nodeId,
    'node_address should NOT be set to node_id (UUID)',
  );

  // If node_address is set, it should be a valid address format, not a UUID
  if (preparedData[COLUMN.NODE_ADDRESS]) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(preparedData[COLUMN.NODE_ADDRESS]);
    t.equal(isUUID, false, 'node_address should not be a UUID');
  }
});

test('node_address should be required or have a sensible default', async (t) => {
  const cdcService = new CDCIntegrationService({nodeId: 'test-node'});

  const nodeId = '550e8400-e29b-41d4-a716-446655440002';
  const inputData = {
    [COLUMN.NODE_ID]: nodeId,
  };

  const preparedData = cdcService.prepareInsertData(
    SYSTEM_TABLE_NAME.NODES,
    inputData,
    {generatePrimaryKey: false},
  );

  // node_address should either be undefined/null or a valid address format
  // It should NEVER be a UUID
  const nodeAddress = preparedData[COLUMN.NODE_ADDRESS];

  if (nodeAddress !== undefined && nodeAddress !== null) {
    // If set, should look like an address (contain : for host:port or ws:// for URL)
    const looksLikeAddress = nodeAddress.includes(':') ||
      nodeAddress.startsWith('ws://') ||
      nodeAddress.startsWith('wss://');
    t.ok(
      looksLikeAddress || nodeAddress === 'unknown',
      `node_address should be a valid address format or 'unknown', got: ${nodeAddress}`,
    );
  } else {
    t.pass('node_address is undefined/null which is acceptable');
  }
});
