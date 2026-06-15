/**
 * Tests for PartitionCDCGenerator.
 * Verifies CDC event generation logic extracted from partition-service.js.
 * Requirements: 6.2, 6.4, 6.6
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import {
  PARTITION_CDC_EVENT_BUILD_STATE,
  PartitionCDCGenerator,
} from '../../src/partition/partition-cdc-generator.js';
import {CDC_OPERATION} from '../../src/constants/index.js';
import {EventEmitter} from 'events';

describe('PartitionCDCGenerator', () => {
  let db;
  let generator;
  let logger;
  let eventEmitter;
  let logMessages;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE test_table (
        id TEXT PRIMARY KEY,
        name TEXT,
        value INTEGER
      )
    `);

    logMessages = [];
    logger = {
      debug: (msg, data) => logMessages.push({level: 'debug', msg, data}),
      info: (msg, data) => logMessages.push({level: 'info', msg, data}),
      warn: (msg, data) => logMessages.push({level: 'warn', msg, data}),
      error: (msg, data) => logMessages.push({level: 'error', msg, data}),
    };

    eventEmitter = new EventEmitter();

    generator = new PartitionCDCGenerator({
      partitionId: 'test-partition',
      replicaId: 'test-replica',
      tableName: 'test_table',
      db,
      logger,
      eventEmitter,
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('subscribe/unsubscribe', () => {
    it('should add and remove subscribers', () => {
      const subscriber = () => {};

      assert.strictEqual(generator.getSubscriberCount(), 0);

      generator.subscribe(subscriber);
      assert.strictEqual(generator.getSubscriberCount(), 1);

      generator.unsubscribe(subscriber);
      assert.strictEqual(generator.getSubscriberCount(), 0);
    });

    it('should support multiple subscribers', () => {
      const subscriber1 = () => {};
      const subscriber2 = () => {};

      generator.subscribe(subscriber1);
      generator.subscribe(subscriber2);
      assert.strictEqual(generator.getSubscriberCount(), 2);

      generator.unsubscribe(subscriber1);
      assert.strictEqual(generator.getSubscriberCount(), 1);
    });
  });

  describe('generateEvent', () => {
    it('should skip event generation when no subscribers', async () => {
      const entry = {
        type: 'INSERT',
        tableName: 'test_table',
        data: {id: '1', name: 'test'},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      // Should log that there are no subscribers
      const noSubsLog = logMessages.find(
        (m) => m.msg === 'No CDC subscribers, skipping event generation',
      );
      assert.ok(noSubsLog);
    });

    it('should generate INSERT event with data object', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'INSERT',
        tableName: 'test_table',
        data: {id: '1', name: 'test', value: 42},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.INSERT);
      assert.strictEqual(receivedEvents[0].tableName, 'test_table');
      assert.strictEqual(receivedEvents[0].data.id, '1');
      assert.strictEqual(receivedEvents[0].data.name, 'test');
      assert.strictEqual(receivedEvents[0].sourcePartition, 'test-partition');
      assert.strictEqual(receivedEvents[0].sourceReplica, 'test-replica');
    });

    it('should generate UPDATE event with merged whereClause', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'UPDATE',
        tableName: 'test_table',
        data: {name: 'updated'},
        whereClause: {id: '1'},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.UPDATE);
      assert.strictEqual(receivedEvents[0].data.id, '1');
      assert.strictEqual(receivedEvents[0].data.name, 'updated');
    });

    it('should generate UPDATE event from the authoritative stored row', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      db.prepare(
        'INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)',
      ).run('upd-direct-1', 'original', 50);
      db.prepare(
        'UPDATE test_table SET name = ? WHERE id = ?',
      ).run('updated', 'upd-direct-1');

      const entry = {
        type: 'UPDATE',
        tableName: 'test_table',
        data: {name: 'updated'},
        whereClause: {id: 'upd-direct-1'},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.UPDATE);
      assert.strictEqual(receivedEvents[0].data.id, 'upd-direct-1');
      assert.strictEqual(receivedEvents[0].data.name, 'updated');
      assert.strictEqual(receivedEvents[0].data.value, 50);
    });

    it('should generate DELETE event with whereClause as data', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'DELETE',
        tableName: 'test_table',
        whereClause: {id: '1'},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.DELETE);
      assert.strictEqual(receivedEvents[0].data.id, '1');
    });

    it('should generate UPSERT event for UPSERT operations', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'UPSERT',
        tableName: 'test_table',
        data: {id: '1', name: 'upserted'},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.UPSERT);
    });

    it('should skip unknown operation types', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'UNKNOWN_OP',
        tableName: 'test_table',
        data: {id: '1'},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 0);
    });

    it('should emit CDC_EVENT on eventEmitter', async () => {
      const emittedEvents = [];
      eventEmitter.on('cdcEvent', (event) => emittedEvents.push(event));
      generator.subscribe(() => {});

      const entry = {
        type: 'INSERT',
        tableName: 'test_table',
        data: {id: '1'},
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(emittedEvents.length, 1);
    });
  });

  describe('shared build contract', () => {
    it('should suppress no-op writes when requested by the caller', () => {
      const envelopeResult = generator.resolveEventEnvelope({
        type: 'UPDATE',
        tableName: 'test_table',
        data: {name: 'updated'},
        whereClause: {id: 'noop-1'},
        changes: 0,
        timestamp: Date.now(),
      }, {
        suppressNoOpWrite: true,
      });

      assert.strictEqual(
        envelopeResult.state,
        PARTITION_CDC_EVENT_BUILD_STATE.SKIPPED,
      );
    });

    it('should attach a supplied sequence number when hydrating an envelope',
      () => {
        const entry = {
          type: 'INSERT',
          tableName: 'test_table',
          data: {id: 'seq-1', name: 'sequenced'},
          timestamp: Date.now(),
        };

        const envelopeResult = generator.resolveEventEnvelope(entry);
        assert.strictEqual(
          envelopeResult.state,
          PARTITION_CDC_EVENT_BUILD_STATE.BUILT,
        );

        const cdcEvent = generator.hydrateEventEnvelope(entry, envelopeResult, {
          sequenceNumber: 7,
        });

        assert.strictEqual(cdcEvent.sequenceNumber, 7);
        assert.strictEqual(cdcEvent.tableName, 'test_table');
        assert.strictEqual(cdcEvent.operation, CDC_OPERATION.INSERT);
      });
  });

  describe('SQL parsing for QUERY type entries', () => {
    it('should detect INSERT operation from SQL', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      // Insert a row first
      db.exec('INSERT INTO test_table (id, name, value) VALUES (\'sql-1\', \'from-sql\', 100)');

      const entry = {
        type: 'QUERY',
        sql: 'INSERT INTO test_table (id, name, value) VALUES (\'sql-1\', \'from-sql\', 100)',
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.INSERT);
      assert.strictEqual(receivedEvents[0].tableName, 'test_table');
    });

    it('should detect UPDATE operation from SQL', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      // Insert a row first
      db.exec('INSERT INTO test_table (id, name, value) VALUES (\'upd-1\', \'original\', 50)');

      const entry = {
        type: 'QUERY',
        sql: 'UPDATE test_table SET name = \'updated\' WHERE id = \'upd-1\'',
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.UPDATE);
    });

    it('should detect DELETE operation from SQL', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'QUERY',
        sql: 'DELETE FROM test_table WHERE id = \'del-1\'',
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].operation, CDC_OPERATION.DELETE);
      assert.strictEqual(receivedEvents[0].data.id, 'del-1');
    });

    it('should extract table name from SQL', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'QUERY',
        sql: 'DELETE FROM other_table WHERE id = \'x\'',
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents[0].tableName, 'other_table');
    });
  });

  describe('parameterized SQL parsing', () => {
    it('should extract data from parameterized INSERT', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'QUERY',
        sql: 'INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)',
        params: ['param-1', 'param-name', 200],
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].data.id, 'param-1');
      assert.strictEqual(receivedEvents[0].data.name, 'param-name');
      assert.strictEqual(receivedEvents[0].data.value, 200);
    });

    it('should fetch the authoritative row for parameterized INSERT', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));
      db.exec(
        'ALTER TABLE test_table ADD COLUMN status TEXT DEFAULT \'ready\'',
      );
      db.prepare(
        'INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)',
      ).run('param-insert-1', 'param-name', 200);

      const entry = {
        type: 'QUERY',
        sql: 'INSERT INTO test_table (id, name, value) VALUES (?, ?, ?)',
        params: ['param-insert-1', 'param-name', 200],
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].data.id, 'param-insert-1');
      assert.strictEqual(receivedEvents[0].data.name, 'param-name');
      assert.strictEqual(receivedEvents[0].data.value, 200);
      assert.strictEqual(receivedEvents[0].data.status, 'ready');
    });

    it('should extract data from parameterized UPDATE', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'QUERY',
        sql: 'UPDATE test_table SET name = ?, value = ? WHERE id = ?',
        params: ['new-name', 300, 'upd-param-1'],
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].data.name, 'new-name');
      assert.strictEqual(receivedEvents[0].data.value, 300);
      assert.strictEqual(receivedEvents[0].data.id, 'upd-param-1');
    });

    it('should extract data from multiline parameterized UPDATE with guarded predicate',
      async () => {
        const receivedEvents = [];
        generator.subscribe((event) => receivedEvents.push(event));

        const entry = {
          type: 'QUERY',
          sql: 'UPDATE test_table\n' +
            'SET value = ?, name = ?\n' +
            'WHERE id = ? AND value = ?',
          params: [300, 'new-name', 'upd-param-3', 250],
          timestamp: Date.now(),
        };

        await generator.generateEvent(entry);

        assert.strictEqual(receivedEvents.length, 1);
        assert.strictEqual(receivedEvents[0].data.value, 300);
        assert.strictEqual(receivedEvents[0].data.name, 'new-name');
        assert.strictEqual(receivedEvents[0].data.id, 'upd-param-3');
      });

    it('should fetch the authoritative row for parameterized UPDATE', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));
      db.exec(
        'ALTER TABLE test_table ADD COLUMN status TEXT DEFAULT \'ready\'',
      );
      db.prepare(
        'INSERT INTO test_table (id, name, value, status) VALUES (?, ?, ?, ?)',
      ).run('upd-param-2', 'original-name', 250, 'kept');
      db.prepare(
        'UPDATE test_table SET name = ?, value = ? WHERE id = ?',
      ).run('new-name', 300, 'upd-param-2');

      const entry = {
        type: 'QUERY',
        sql: 'UPDATE test_table SET name = ?, value = ? WHERE id = ?',
        params: ['new-name', 300, 'upd-param-2'],
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].data.name, 'new-name');
      assert.strictEqual(receivedEvents[0].data.value, 300);
      assert.strictEqual(receivedEvents[0].data.id, 'upd-param-2');
      assert.strictEqual(receivedEvents[0].data.status, 'kept');
    });

    it('should extract data from parameterized DELETE', async () => {
      const receivedEvents = [];
      generator.subscribe((event) => receivedEvents.push(event));

      const entry = {
        type: 'QUERY',
        sql: 'DELETE FROM test_table WHERE id = ?',
        params: ['del-param-1'],
        timestamp: Date.now(),
      };

      await generator.generateEvent(entry);

      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual(receivedEvents[0].data.id, 'del-param-1');
    });

    it('should extract data from parameterized DELETE with nested parentheses',
      async () => {
        const receivedEvents = [];
        generator.subscribe((event) => receivedEvents.push(event));

        const entry = {
          type: 'QUERY',
          sql: 'DELETE FROM services WHERE (((service_id = ?) AND ' +
            '(service_type = ?)) AND (node_id = ?))',
          params: ['svc-1', 'partition', 'node-1'],
          timestamp: Date.now(),
        };

        await generator.generateEvent(entry);

        assert.strictEqual(receivedEvents.length, 1);
        assert.deepStrictEqual(receivedEvents[0].data, {
          service_id: 'svc-1',
          service_type: 'partition',
          node_id: 'node-1',
          // The origin write HLC is stamped onto CDC data so it reaches every
          // replica's cache identically (carried unchanged through propagation).
          updated_at_hlc: String(entry.timestamp),
        });
      });
  });

  describe('subscriber types', () => {
    it('should call function subscribers', async () => {
      let called = false;
      generator.subscribe(() => {
        called = true;
      });

      await generator.generateEvent({
        type: 'INSERT',
        data: {id: '1'},
        timestamp: Date.now(),
      });

      assert.strictEqual(called, true);
    });

    it('should call object subscribers with handleCDCEvent', async () => {
      let called = false;
      const subscriber = {
        handleCDCEvent: () => {
          called = true;
        },
      };
      generator.subscribe(subscriber);

      await generator.generateEvent({
        type: 'INSERT',
        data: {id: '1'},
        timestamp: Date.now(),
      });

      assert.strictEqual(called, true);
    });

    it('should propagate subscriber errors', async () => {
      generator.subscribe(() => {
        throw new Error('Subscriber error');
      });

      await assert.rejects(
        () => generator.generateEvent({
          type: 'INSERT',
          data: {id: '1'},
          timestamp: Date.now(),
        }),
        /Subscriber error/,
      );
    });
  });

  describe('parseValuesFromSQL', () => {
    it('should parse quoted string values', () => {
      const values = generator.parseValuesFromSQL('\'hello\', \'world\'');
      assert.deepStrictEqual(values, ['hello', 'world']);
    });

    it('should parse numeric values', () => {
      const values = generator.parseValuesFromSQL('123, 456.78');
      assert.deepStrictEqual(values, [123, 456.78]);
    });

    it('should parse NULL values', () => {
      const values = generator.parseValuesFromSQL('\'test\', NULL, 123');
      assert.deepStrictEqual(values, ['test', null, 123]);
    });

    it('should handle escaped quotes', () => {
      const values = generator.parseValuesFromSQL('\'it\'\'s a test\'');
      assert.deepStrictEqual(values, ['it\'s a test']);
    });
  });

  describe('extractTableNameFromSQL', () => {
    it('should parse INSERT OR IGNORE statements', () => {
      const tableNameResult = generator.extractTableNameFromSQL(
        'INSERT OR IGNORE INTO test_table (id, name) VALUES (\'1\', \'a\')',
      );

      assert.deepStrictEqual(tableNameResult, {
        state: 'found',
        tableName: 'test_table',
      });
    });
  });
});
