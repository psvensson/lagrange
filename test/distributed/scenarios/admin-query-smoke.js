/** Admin marker write and SQL read through the actual logs system partition. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {LOG_MARKER_STATE} from '../../../src/control-plane/owners/log-diagnostic-marker-contract.js';

async function run(cluster) {
  const node = cluster.getNodes()[0];
  const message = 'admin-smoke';
  const answer = await node.appendDiagnosticMarker({markerId: randomUUID(), message});
  assert.equal(answer.success, true, JSON.stringify(answer));
  assert.equal(answer.markerState, LOG_MARKER_STATE.RECORDED);
  const result = await node.query('SELECT * FROM logs WHERE log_id = ?', [answer.logId]);
  const rows = Array.isArray(result) ? result : result.rows;
  assert.equal(rows?.length, 1, 'the owner marker must be readable through admin SQL');
  assert.equal(rows[0].message, message);
  assert.equal(rows[0].node_id, answer.nodeId);
  assert.equal(rows[0].log_id, answer.logId);
  return {queries: 1, ownerOperations: 1};
}

export {run};
