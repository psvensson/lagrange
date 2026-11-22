// A named control-plane write on the REAL producers settles APPLIED
// (line-regression-causes stage 2, item 1 guard): a lone rs-raft leader
// PartitionService, the real SQLQueryEngine, QueryExecutor, distributed write
// coordinator, CDC integration service and control-plane gateway. The total
// judge must keep every real path settling on its producer's durable commit
// witness: the SQL gateway (joiner startup SQL), CDC routed through the engine
// (a node that does not lead the partition) and CDC on the local leader.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES} from '../../src/constants/index.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {NODE_ID, selectRows, withSurface} from './unknown-outcome-surface-fixture.js';

const TABLE = TABLES.STORAGE_RESERVATIONS;
const TIMEOUT_MS = 120000;
const INSERT = `INSERT INTO ${TABLE} (reservation_id, operation_id, entity_type, ` +
  'entity_id, partition_id, target_node_id, estimated_bytes, amplification_factor, ' +
  'status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
const UPDATE = `UPDATE ${TABLE} SET status = ? WHERE reservation_id = ?`;

function reservation(id) {
  const now = Date.now();
  return {reservation_id: id, operation_id: `op-${id}`, entity_type: 'partition',
    entity_id: 'p-1', partition_id: 'p-1', target_node_id: 'n-1', estimated_bytes: 1,
    amplification_factor: 1, status: 'active', created_at: now, updated_at: now,
    expires_at: now + 60000};
}

function assertApplied(answer, label) {
  assert.equal(answer?.success, true, `${label}: applied (${JSON.stringify({
    error: answer?.error, failureCode: answer?.failureCode,
    pending: answer?.pendingInstance?.outcome})})`);
  assert.equal(answer.pendingInstance ?? null, null, `${label}: nothing left pending`);
}

function statusOf(surface, id) {
  return selectRows(surface.dbPath, `SELECT status FROM ${TABLE} WHERE reservation_id = ?`,
    [id])[0]?.status ?? null;
}

test('named SQL gateway writes settle APPLIED on the real producer', {timeout: TIMEOUT_MS},
  async () => {
    await withSurface([TABLE], async ({gateway, of}) => {
      const row = reservation('real-sql-1');
      assertApplied(await gateway.executeQuery(INSERT, Object.values(row),
        {writeIdentity: 'real-producer:sql:insert'}), 'SQL insert');
      assertApplied(await gateway.executeQuery(UPDATE, ['released', row.reservation_id],
        {writeIdentity: 'real-producer:sql:update'}), 'SQL update');
      assert.equal(statusOf(of(TABLE), row.reservation_id), 'released');
    });
  });

test('named CDC writes routed through the engine settle APPLIED', {timeout: TIMEOUT_MS},
  async () => {
    await withSurface([TABLE], async ({gateway, of}) => {
      const row = reservation('real-cdc-1');
      assertApplied(await gateway.insertSystemTableRow(TABLE, row,
        {writeIdentity: 'real-producer:cdc:insert'}), 'CDC insert');
      assertApplied(await gateway.updateSystemTableRow(TABLE,
        {reservation_id: row.reservation_id}, {status: 'released'},
        {writeIdentity: 'real-producer:cdc:update'}), 'CDC update');
      assert.equal(statusOf(of(TABLE), row.reservation_id), 'released');
    }, {cdc: true});
  });

test('named CDC writes on the local leader settle APPLIED', {timeout: TIMEOUT_MS}, async () => {
  await withSurface([TABLE], async ({engine, messageRouter, of}) => {
    const surface = of(TABLE);
    const cdc = new CDCIntegrationService({nodeId: NODE_ID, sqlQueryEngine: engine,
      partitionServicesProvider: new Map([[surface.partitionId, surface.partition]])});
    cdc.initialize();
    try {
      const gateway = createControlPlaneRuntimeBundle({nodeId: NODE_ID, sqlQueryEngine: engine,
        messageRouter, cdcIntegrationService: cdc}).controlPlaneSystemTableGateway;
      const row = reservation('real-local-1');
      assertApplied(await gateway.insertSystemTableRow(TABLE, row,
        {writeIdentity: 'real-producer:local:insert'}), 'local insert');
      assertApplied(await gateway.updateSystemTableRow(TABLE,
        {reservation_id: row.reservation_id}, {status: 'released'},
        {writeIdentity: 'real-producer:local:update'}), 'local update');
      assert.equal(statusOf(surface, row.reservation_id), 'released');
    } finally {
      cdc.shutdown?.();
    }
  });
});
