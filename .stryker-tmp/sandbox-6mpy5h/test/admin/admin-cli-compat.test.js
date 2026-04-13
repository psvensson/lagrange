// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  CLI_COMPAT_ERROR_MSG,
  CLI_MESSAGE_CONTRACT,
  validateIncomingMessage,
  validateOutgoingMessage,
} from '../../src/admin/admin-cli-compat.js';
import {ADMIN_MESSAGE_TYPE} from '../../src/admin/admin-constants.js';

describe('admin-cli-compat', () => {
  describe('validateIncomingMessage', () => {
    it('accepts a valid query message', () => {
      const result = validateIncomingMessage({
        type: ADMIN_MESSAGE_TYPE.QUERY,
        queryId: 'q-1',
        sql: 'SELECT 1',
      });
      assert.deepStrictEqual(result, {
        valid: true,
        messageType: ADMIN_MESSAGE_TYPE.QUERY,
      });
    });

    it('accepts a valid refresh message', () => {
      const result = validateIncomingMessage({
        type: ADMIN_MESSAGE_TYPE.REFRESH,
      });
      assert.deepStrictEqual(result, {
        valid: true,
        messageType: ADMIN_MESSAGE_TYPE.REFRESH,
      });
    });

    it('rejects a message with missing type field', () => {
      const result = validateIncomingMessage({queryId: 'q-1'});
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        CLI_COMPAT_ERROR_MSG.MISSING_TYPE_FIELD,
      ));
    });

    it('rejects a message with unknown type', () => {
      const result = validateIncomingMessage({type: 'bogus'});
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        CLI_COMPAT_ERROR_MSG.UNKNOWN_MESSAGE_TYPE,
      ));
    });

    it('rejects a query missing queryId', () => {
      const result = validateIncomingMessage({
        type: ADMIN_MESSAGE_TYPE.QUERY,
        sql: 'SELECT 1',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(
        (e) => e.includes('queryId'),
      ));
    });

    it('rejects a query missing sql', () => {
      const result = validateIncomingMessage({
        type: ADMIN_MESSAGE_TYPE.QUERY,
        queryId: 'q-1',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(
        (e) => e.includes('sql'),
      ));
    });
  });

  describe('validateOutgoingMessage', () => {
    it('accepts a valid query_result message', () => {
      const result = validateOutgoingMessage({
        type: ADMIN_MESSAGE_TYPE.QUERY_RESULT,
        queryId: 'q-1',
        timestamp: Date.now(),
      });
      assert.deepStrictEqual(result, {
        valid: true,
        messageType: ADMIN_MESSAGE_TYPE.QUERY_RESULT,
      });
    });

    it('accepts a valid cache_dump message', () => {
      const result = validateOutgoingMessage({
        type: ADMIN_MESSAGE_TYPE.CACHE_DUMP,
        timestamp: Date.now(),
        nodeId: 'node-1',
        data: {},
      });
      assert.deepStrictEqual(result, {
        valid: true,
        messageType: ADMIN_MESSAGE_TYPE.CACHE_DUMP,
      });
    });

    it('accepts a valid cdc_event message', () => {
      const result = validateOutgoingMessage({
        type: ADMIN_MESSAGE_TYPE.CDC_EVENT,
        timestamp: Date.now(),
        table: 'nodes',
        operation: 'insert',
        record: {node_id: 'n-1'},
      });
      assert.deepStrictEqual(result, {
        valid: true,
        messageType: ADMIN_MESSAGE_TYPE.CDC_EVENT,
      });
    });

    it('accepts a valid error message', () => {
      const result = validateOutgoingMessage({
        type: ADMIN_MESSAGE_TYPE.ERROR,
        timestamp: Date.now(),
        error: 'something broke',
        errorCode: 'INTERNAL_ERROR',
      });
      assert.deepStrictEqual(result, {
        valid: true,
        messageType: ADMIN_MESSAGE_TYPE.ERROR,
      });
    });

    it('rejects a message with missing type', () => {
      const result = validateOutgoingMessage({
        timestamp: Date.now(),
        error: 'oops',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        CLI_COMPAT_ERROR_MSG.MISSING_TYPE_FIELD,
      ));
    });
  });

  describe('CLI_MESSAGE_CONTRACT', () => {
    it('has entries for all message types', () => {
      const contractTypes = Object.values(CLI_MESSAGE_CONTRACT)
        .map((c) => c.type);
      assert.ok(contractTypes.includes(ADMIN_MESSAGE_TYPE.QUERY));
      assert.ok(contractTypes.includes(ADMIN_MESSAGE_TYPE.REFRESH));
      assert.ok(contractTypes.includes(ADMIN_MESSAGE_TYPE.QUERY_RESULT));
      assert.ok(contractTypes.includes(ADMIN_MESSAGE_TYPE.CACHE_DUMP));
      assert.ok(contractTypes.includes(ADMIN_MESSAGE_TYPE.CDC_EVENT));
      assert.ok(contractTypes.includes(ADMIN_MESSAGE_TYPE.ERROR));
    });
  });
});
