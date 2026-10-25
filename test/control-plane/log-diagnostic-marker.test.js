import {test} from '../../src/test-helpers/tap.js';
import {LogsOwner} from '../../src/control-plane/owners/logs-owner.js';
import {AdminOwnerOperations} from '../../src/admin/admin-owner-operations.js';

const REQUEST = Object.freeze({markerId: 'probe-one', message: 'partition witness'});
const NODE_ID = 'marker-node';
const NOW = 1700000000000;
const APPLIED = Object.freeze({success: true, outcome: 'applied', affectedRows: 1});
const UNKNOWN = 'LOG_MARKER_OUTCOME_UNCONFIRMED';
const CONFLICT = 'LOG_MARKER_IDENTITY_CONFLICT';

function fixture(writeAnswer = APPLIED, readAnswer = {success: true, rows: []}, options = {}) {
  const writes = [];
  const reads = [];
  const owner = new LogsOwner({now: () => NOW,
    controlPlaneSystemTableGateway: {
      async insertSystemTableRow(table, row, mutationOptions) {
        writes.push({table, row, options: mutationOptions});
        return typeof writeAnswer === 'function' ? writeAnswer(writes.length) : writeAnswer;
      },
      async readAuthoritativeRows(table, sql, params, readOptions) {
        reads.push({table, sql, params, options: readOptions});
        return typeof readAnswer === 'function' ? readAnswer(writes[0]?.row) : readAnswer;
      },
    }, ...options});
  return {owner, writes, reads,
    admin: new AdminOwnerOperations({getLogsOwner: () => owner}, NODE_ID)};
}

test('marker validates a fixed intent and captures the server-owned row', async (t) => {
  const {owner, writes, reads} = fixture();
  for (const body of [null, [], {}, {...REQUEST, nodeId: 'spoof'},
    {...REQUEST, level: 'error'}, {...REQUEST, timestamp: 1},
    {...REQUEST, markerId: ''}, {...REQUEST, message: null}]) {
    await t.rejects(owner.appendDiagnosticMarker(body, NODE_ID),
      {code: 'LOG_MARKER_REQUEST_INVALID'});
  }
  t.equal(writes.length, 0);
  const result = await owner.appendDiagnosticMarker(REQUEST, NODE_ID);
  t.equal(result.markerState, 'recorded');
  t.equal(result.logId, 'diagnostic-marker:probe-one');
  t.same(writes[0].row, {log_id: result.logId, timestamp: NOW, created_at: NOW,
    node_id: NODE_ID, level: 'info', message: REQUEST.message,
    metadata: '{"kind":"diagnostic_marker"}'});
  t.equal(writes[0].table, 'logs');
  t.equal(reads.length, 0, 'no pre-read can mask mutation admission');
  t.ok(Object.isFrozen(writes[0].row));
});

test('gateway retries keep original marker row and write identity', async (t) => {
  let time = 0;
  const request = {...REQUEST};
  const f = fixture((attempt) => attempt === 1 ? {
    success: false, error: 'authoritative_row_source_unavailable', deferRetry: true,
  } : APPLIED, undefined, {controlPlaneWriteRetryNow: () => time,
    controlPlaneWriteRetrySleep: async (delay) => {
      time += delay;
      request.markerId = 'changed';
      request.message = 'changed';
    }});
  await f.owner.appendDiagnosticMarker(request, NODE_ID);
  t.equal(f.writes.length, 2);
  t.same(f.writes[0].row, f.writes[1].row);
  t.equal(f.writes[1].row.log_id, 'diagnostic-marker:probe-one');
  t.equal(f.writes[1].row.message, REQUEST.message);
  t.equal(f.writes[1].row.timestamp, NOW);
  t.equal(f.writes[0].options.writeIdentity, f.writes[1].options.writeIdentity);
  t.ok(f.writes[0].options.writeIdentity);
  t.equal(f.reads.length, 0);
});

test('uncertain effects settle only from explicit successful authoritative identity', async (t) => {
  const ambiguous = {success: true, outcome: 'applied'};
  const matching = fixture(ambiguous, (row) => ({success: true, rows: [row]}));
  t.equal((await matching.owner.appendDiagnosticMarker(REQUEST, NODE_ID)).markerState,
    'recorded');
  t.equal(matching.reads.length, 1);
  t.same(matching.reads[0].params, ['diagnostic-marker:probe-one']);
  for (const read of [{success: true, rows: []}, {rows: []},
    (row) => ({success: false, rows: [row]}),
    () => {
      throw new Error('authoritative read unavailable');
    }]) {
    const f = fixture(ambiguous, read);
    const response = await f.admin.appendDiagnosticMarker(REQUEST);
    t.equal(response.statusCode, 503);
    t.equal(response.body.errorCode, UNKNOWN);
    t.equal(response.body.success, false);
  }
});

test('different recorded node or content is conflict and cannot be overwritten', async (t) => {
  for (const difference of [{node_id: 'other-ingress'}, {message: 'different'},
    {level: 'error'}, {metadata: '{}'}]) {
    const f = fixture({success: true, affectedRows: 0},
      (row) => ({success: true, rows: [{...row, ...difference}]}));
    const response = await f.admin.appendDiagnosticMarker(REQUEST);
    t.equal(response.statusCode, 409);
    t.equal(response.body.errorCode, CONFLICT);
    t.equal(f.writes.length, 1, 'only the fenced insert was attempted');
  }
});
