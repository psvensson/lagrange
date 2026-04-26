import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetaServiceEndpoints,
  buildMetaServiceRoutingMetadata,
} from '../../src/admin/admin-meta-endpoint-builder.js';
import {
  META_SERVICE_ID,
  WASM_META_ACTION,
} from '../../src/constants/index.js';
import {
  ADMIN_META_ACTION,
} from '../../src/admin/admin-meta-command-handlers.js';
import {
  EP_COL,
} from '../../src/wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_HEALTH_STATUS,
} from '../../src/wasm-service/wasm-service-constants.js';

const TEST_NODE_ID = 'node-test-1';
const TEST_ADDRESS = '127.0.0.1';
const TEST_PORT = 8080;

describe('admin-meta-endpoint-builder', () => {
  describe('buildMetaServiceEndpoints', () => {
    it('returns both endpoint records', () => {
      const result = buildMetaServiceEndpoints(
        TEST_NODE_ID, TEST_ADDRESS, TEST_PORT,
      );
      assert.ok(result.wasmMetaEndpoint);
      assert.ok(result.adminMetaEndpoint);
    });

    it('has correct service_id for wasm meta', () => {
      const {wasmMetaEndpoint} = buildMetaServiceEndpoints(
        TEST_NODE_ID, TEST_ADDRESS, TEST_PORT,
      );
      assert.equal(
        wasmMetaEndpoint[EP_COL.SERVICE_ID],
        META_SERVICE_ID.WASM_META,
      );
    });

    it('has correct service_id for admin meta', () => {
      const {adminMetaEndpoint} = buildMetaServiceEndpoints(
        TEST_NODE_ID, TEST_ADDRESS, TEST_PORT,
      );
      assert.equal(
        adminMetaEndpoint[EP_COL.SERVICE_ID],
        META_SERVICE_ID.ADMIN_META,
      );
    });

    it('has correct node_id on both endpoints', () => {
      const {wasmMetaEndpoint, adminMetaEndpoint} =
        buildMetaServiceEndpoints(
          TEST_NODE_ID, TEST_ADDRESS, TEST_PORT,
        );
      assert.equal(
        wasmMetaEndpoint[EP_COL.NODE_ID], TEST_NODE_ID,
      );
      assert.equal(
        adminMetaEndpoint[EP_COL.NODE_ID], TEST_NODE_ID,
      );
    });

    it('has correct address and port', () => {
      const {wasmMetaEndpoint, adminMetaEndpoint} =
        buildMetaServiceEndpoints(
          TEST_NODE_ID, TEST_ADDRESS, TEST_PORT,
        );
      assert.equal(
        wasmMetaEndpoint[EP_COL.ADDRESS], TEST_ADDRESS,
      );
      assert.equal(
        wasmMetaEndpoint[EP_COL.PORT], TEST_PORT,
      );
      assert.equal(
        adminMetaEndpoint[EP_COL.ADDRESS], TEST_ADDRESS,
      );
      assert.equal(
        adminMetaEndpoint[EP_COL.PORT], TEST_PORT,
      );
    });

    it('has health_status set to healthy', () => {
      const {wasmMetaEndpoint, adminMetaEndpoint} =
        buildMetaServiceEndpoints(
          TEST_NODE_ID, TEST_ADDRESS, TEST_PORT,
        );
      assert.equal(
        wasmMetaEndpoint[EP_COL.HEALTH_STATUS],
        WASM_SERVICE_HEALTH_STATUS.HEALTHY,
      );
      assert.equal(
        adminMetaEndpoint[EP_COL.HEALTH_STATUS],
        WASM_SERVICE_HEALTH_STATUS.HEALTHY,
      );
    });

    it('has metadata JSON with service_name', () => {
      const {wasmMetaEndpoint, adminMetaEndpoint} =
        buildMetaServiceEndpoints(
          TEST_NODE_ID, TEST_ADDRESS, TEST_PORT,
        );
      const wasmMeta = JSON.parse(
        wasmMetaEndpoint[EP_COL.METADATA],
      );
      const adminMeta = JSON.parse(
        adminMetaEndpoint[EP_COL.METADATA],
      );
      assert.equal(
        wasmMeta.service_name, META_SERVICE_ID.WASM_META,
      );
      assert.equal(
        adminMeta.service_name, META_SERVICE_ID.ADMIN_META,
      );
    });
  });

  describe('buildMetaServiceRoutingMetadata', () => {
    it('returns a frozen object', () => {
      const metadata = buildMetaServiceRoutingMetadata();
      assert.ok(Object.isFrozen(metadata));
    });

    it('has correct serviceId for wasmMeta', () => {
      const metadata = buildMetaServiceRoutingMetadata();
      assert.equal(
        metadata.wasmMeta.serviceId,
        META_SERVICE_ID.WASM_META,
      );
    });

    it('has correct serviceId for adminMeta', () => {
      const metadata = buildMetaServiceRoutingMetadata();
      assert.equal(
        metadata.adminMeta.serviceId,
        META_SERVICE_ID.ADMIN_META,
      );
    });

    it('wasmMeta actions match WASM_META_ACTION values', () => {
      const metadata = buildMetaServiceRoutingMetadata();
      const expected = Object.values(WASM_META_ACTION);
      assert.deepEqual(metadata.wasmMeta.actions, expected);
    });

    it('adminMeta actions match ADMIN_META_ACTION values', () => {
      const metadata = buildMetaServiceRoutingMetadata();
      const expected = Object.values(ADMIN_META_ACTION);
      assert.deepEqual(metadata.adminMeta.actions, expected);
    });
  });
});
