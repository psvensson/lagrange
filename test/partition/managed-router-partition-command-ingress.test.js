// Supplemental L0 witness for the managed-router-partition-command-ingress
// interaction. A real MessageRouter registers a real, initialized
// PartitionService handler. Ordinary delivery remains the supported positive;
// calling the raw local-dispatch helper directly must be absent or return one
// exact refusal without changing durable application state.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const NODE_ID = 'managed-router-boundary-node';
const PARTITION_ID = 'managed-router-boundary-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const PARTITION_ADDRESS = `${NODE_ID}/partition/${REPLICA_ID}`;
const TABLE_NAME = 'managed_router_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const SELECT_ROW_SQL = `SELECT id, value FROM ${TABLE_NAME} WHERE id = ?`;
const DIRECT_DISPATCH_REFUSAL_CODE = 'ROUTER_MANAGED_DISPATCH_REQUIRED';
const TEST_TIMEOUT_MS = 30_000;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

async function waitForLeader(partition) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (partition.getRole() === 'leader') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('single-replica partition did not elect its leader');
}

function buildForwardWrite(id, value, entryId) {
  return {
    type: 'FORWARD_WRITE',
    operation: {
      type: 'INSERT',
      entryId,
      tableName: TABLE_NAME,
      data: {id, value},
      sql: INSERT_SQL,
      params: [id, value],
      timestamp: `1000-0-${NODE_ID}`,
      proposedBy: REPLICA_ID,
      proposedAt: 1000,
    },
  };
}

function readRow(observerDb, id) {
  return observerDb.prepare(SELECT_ROW_SQL).get(id) ?? null;
}

function classifyDirectDispatchRefusal(value) {
  const code = value?.code ?? value?.errorCode ??
    value?.result?.code ?? value?.result?.errorCode;
  if (code === DIRECT_DISPATCH_REFUSAL_CODE) {
    return {
      kind: 'typed_direct_dispatch_refusal',
      code: DIRECT_DISPATCH_REFUSAL_CODE,
    };
  }
  return null;
}

async function invokePublicDeliverLocal(router, targetAddress, payload) {
  if (typeof router.deliverLocal !== 'function') {
    return {kind: 'public_method_absent'};
  }
  try {
    const outcome = await router.deliverLocal(
      targetAddress,
      'forged-local-message',
      payload,
      'forged-local-correlation',
    );
    const refusal = classifyDirectDispatchRefusal(outcome);
    if (refusal) return refusal;
    return {
      kind: 'public_method_returned',
      acknowledged: outcome?.result?.acknowledged === true,
      success: outcome?.result?.success === true,
      changes: Number(outcome?.result?.changes ?? 0),
    };
  } catch (error) {
    const refusal = classifyDirectDispatchRefusal(error);
    if (refusal) return refusal;
    throw error;
  }
}

test('ordinary router delivery remains live while direct local dispatch has ' +
  'zero durable effect', {timeout: TEST_TIMEOUT_MS}, async () => {
  initializeEnvironment();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'managed-router-partition-ingress-'),
  );
  const dbPath = path.join(directory, 'partition.sqlite');
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    inProcess: true,
  });
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_ID,
    dbPath,
    transport: router,
    schema: {
      columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'},
      ],
    },
  }));
  let observerDb = null;
  try {
    await router.initialize({startServer: false});
    await partition.initialize();
    await waitForLeader(partition);
    observerDb = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });

    const ordinaryBefore = await router.deliver(
      PARTITION_ADDRESS,
      buildForwardWrite(
        'ordinary-before',
        'routed-through-owner',
        'ordinary-before-entry',
      ),
    );
    assert.equal(ordinaryBefore.success, true,
      'ordinary typed router delivery reaches the registered partition owner');
    assert.deepEqual(readRow(observerDb, 'ordinary-before'), {
      id: 'ordinary-before',
      value: 'routed-through-owner',
    });

    const directOutcome = await invokePublicDeliverLocal(
      router,
      PARTITION_ADDRESS,
      buildForwardWrite(
        'direct-local-copy',
        'must-not-apply',
        'direct-local-entry',
      ),
    );
    const rowAfterDirect = readRow(observerDb, 'direct-local-copy');

    const ordinaryAfter = await router.deliver(
      PARTITION_ADDRESS,
      buildForwardWrite(
        'ordinary-after',
        'owner-still-works',
        'ordinary-after-entry',
      ),
    );
    const allowedBoundaryOutcome = new Set([
      'public_method_absent',
      'typed_direct_dispatch_refusal',
    ]).has(directOutcome.kind);

    assert.deepEqual({
      directOutcome,
      allowedBoundaryOutcome,
      rowAfterDirect,
      ordinaryAfterSuccess: ordinaryAfter.success,
      ordinaryAfterRow: readRow(observerDb, 'ordinary-after'),
    }, {
      directOutcome: directOutcome.kind === 'public_method_absent' ?
        {kind: 'public_method_absent'} : {
          kind: 'typed_direct_dispatch_refusal',
          code: DIRECT_DISPATCH_REFUSAL_CODE,
        },
      allowedBoundaryOutcome: true,
      rowAfterDirect: null,
      ordinaryAfterSuccess: true,
      ordinaryAfterRow: {
        id: 'ordinary-after',
        value: 'owner-still-works',
      },
    }, 'direct local dispatch cannot mint managed router ingress authority, ' +
      'while ordinary delivery remains live');
  } finally {
    observerDb?.close();
    await partition.shutdown();
    await router.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
});

test('direct local dispatch absence and exact typed refusal are valid future ' +
  'outcomes', async () => {
  assert.deepEqual(
    await invokePublicDeliverLocal({}, 'node/partition/r1', {}),
    {kind: 'public_method_absent'},
  );
  assert.deepEqual(await invokePublicDeliverLocal({
    deliverLocal: async () => ({
      result: {errorCode: DIRECT_DISPATCH_REFUSAL_CODE},
    }),
  }, 'node/partition/r1', {}), {
    kind: 'typed_direct_dispatch_refusal',
    code: DIRECT_DISPATCH_REFUSAL_CODE,
  });
  assert.deepEqual(await invokePublicDeliverLocal({
    deliverLocal: () => {
      const error = new Error('private managed dispatch required');
      error.code = DIRECT_DISPATCH_REFUSAL_CODE;
      throw error;
    },
  }, 'node/partition/r1', {}), {
    kind: 'typed_direct_dispatch_refusal',
    code: DIRECT_DISPATCH_REFUSAL_CODE,
  });
});

test('unrelated direct local dispatch failures are never boundary refusal',
  async () => {
    const synchronous = new Error('unrelated synchronous failure');
    await assert.rejects(
      invokePublicDeliverLocal({
        deliverLocal: () => {
          throw synchronous;
        },
      }, 'node/partition/r1', {}),
      (error) => error === synchronous,
    );
    const asynchronous = new Error('unrelated asynchronous failure');
    await assert.rejects(
      invokePublicDeliverLocal({
        deliverLocal: async () => {
          throw asynchronous;
        },
      }, 'node/partition/r1', {}),
      (error) => error === asynchronous,
    );
  });
