// The SQL engine's system-table contract, as the membership harness needs it:
// one set of cases run twice - against the real SQLQueryEngine on a node
// booted the production way, and against the harness seam that stands in for
// it in test/integration/membership-consistency-integration-test-helpers.js.
// A behaviour change in the engine then fails both runs, or fails the seam's
// conformance run, and the seam cannot drift from the thing it stands in for
// without the gate saying so (formation-harness-model-from-contracts, 2026-09-12).
//
// The cases are the engine surface the membership harness exercises: reads.
// System tables are WRITTEN through the CDC owner (insertSystemTableRow,
// updateSystemTableRow) - never through engine SQL, which is not the
// production write path for them - and READ through the engine; an empty
// table reads as no rows with success, and a malformed statement is a typed
// failure, never a throw. Each leg supplies its engine and the CDC owner that
// writes ahead of it.

import assert from 'node:assert/strict';

import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from '../../src/control-plane/control-plane-publication-merge.js';

const NODE_ID_PREFIX = 'contract-node-';
const STATUS_ACTIVE = 'active';
const STATUS_DRAINING = 'draining';
const MALFORMED_STATEMENT = 'SELEKT * FORM nodes';
const PUBLICATION_ID_PREFIX = 'contract-publication-';
const PUBLICATION_KIND = 'cluster_membership';
// The owner's own vocabulary for a publication's status; the cache
// normalizes what it stores to these.
const STATUS_PENDING = CONTROL_PLANE_PUBLICATION_STATUS.PENDING;
const STATUS_PUBLISHED = CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;

/**
 * Register the contract against one engine factory.
 * @param {Function} test node:test's `test`
 * @param {object} leg
 * @param {string} leg.name which leg this is (real | seam)
 * @param {() => Promise<{engine: object, owner: object, close: () => Promise<void>}>} leg.open
 *   an engine and the CDC owner writing ahead of it, over an empty `nodes`
 *   table; `close` releases everything
 */
export function registerSqlEngineSystemTableContract(test, leg) {
  const named = (title) => `[${leg.name}] ${title}`;

  test(named('an empty system table reads as success with no rows'), async () => {
    const {engine, close} = await leg.open();
    try {
      const result = await engine.executeQuery(
        `SELECT * FROM ${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}`, []);
      assert.equal(result.success, true);
      assert.deepEqual(result.rows, []);
    } finally {
      await close();
    }
  });

  test(named('a row written through the CDC owner is read back through the engine'), async () => {
    const {engine, owner, close} = await leg.open();
    try {
      const nodeId = `${NODE_ID_PREFIX}${leg.name}`;
      const insert = await owner.insertSystemTableRow(
        SYSTEM_TABLE_NAME.NODES, {node_id: nodeId, status: STATUS_ACTIVE});
      assert.equal(insert.success, true, JSON.stringify(insert.error || null));
      const read = await engine.executeQuery(
        `SELECT * FROM ${SYSTEM_TABLE_NAME.NODES} WHERE node_id = ?`, [nodeId]);
      assert.equal(read.success, true, JSON.stringify(read.error || null));
      assert.equal(read.rows.length, 1);
      assert.equal(read.rows[0].node_id, nodeId);
      assert.equal(read.rows[0].status, STATUS_ACTIVE);
      const update = await owner.updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES, {node_id: nodeId}, {status: STATUS_DRAINING});
      assert.equal(update.success, true, JSON.stringify(update.error || null));
      const reread = await engine.executeQuery(
        `SELECT * FROM ${SYSTEM_TABLE_NAME.NODES} WHERE node_id = ?`, [nodeId]);
      assert.equal(reread.rows[0].status, STATUS_DRAINING,
        'the update is visible to the next read');
    } finally {
      await close();
    }
  });

  test(named('a publication upserted twice under one id reads back once, latest wins'), async () => {
    // The membership-publication owner persists control_plane_publications
    // rows through the CDC owner's upsertSystemTableRow, which the emitter
    // renders as INSERT OR REPLACE. Both legs must read back exactly one row
    // carrying the later write.
    const {engine, owner, close} = await leg.open();
    try {
      const publicationId = `${PUBLICATION_ID_PREFIX}${leg.name}`;
      const row = {
        publication_id: publicationId, publication_kind: PUBLICATION_KIND,
        publication_epoch: 1, publisher_node_id: leg.name,
      };
      const first = await owner.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS, {...row, status: STATUS_PENDING});
      assert.equal(first.success, true, JSON.stringify(first.error || null));
      const second = await owner.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS, {...row, status: STATUS_PUBLISHED});
      assert.equal(second.success, true, JSON.stringify(second.error || null));
      const read = await engine.executeQuery(
        `SELECT * FROM ${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS} WHERE publication_id = ?`,
        [publicationId]);
      assert.equal(read.success, true, JSON.stringify(read.error || null));
      assert.equal(read.rows.length, 1, 'one row per publication id');
      assert.equal(read.rows[0].status, STATUS_PUBLISHED, 'the later write wins');
    } finally {
      await close();
    }
  });

  test(named('a malformed statement is a typed failure, never a throw'), async () => {
    const {engine, close} = await leg.open();
    try {
      const result = await engine.executeQuery(MALFORMED_STATEMENT, []);
      assert.equal(result.success, false);
      assert.ok(typeof result.error === 'string' && result.error.length > 0,
        'the failure names itself');
    } finally {
      await close();
    }
  });
}
