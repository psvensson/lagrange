/**
 * CL-031: the control snapshot grows unbounded and only surfaces as a
 * >100MB admin websocket frame. The dispatch's serialization point must
 * attribute oversized payloads to their top-level members (largest first)
 * with a WARN, must stay silent for under-threshold payloads (no hot-path
 * measurement cost), and must rate-limit the warn so a polling oracle
 * cannot warn-storm (project lesson CL-009).
 */

import {test} from '../../src/test-helpers/tap.js';
import {ADMIN_WEBSOCKET_MESSAGE_DISPATCH_METHODS} from
  '../../src/admin/admin-websocket-message-dispatch-methods.js';

const THRESHOLD_BYTES = 8 * 1024 * 1024;
const OVER_THRESHOLD_MEMBER_BYTES = 9 * 1024 * 1024;
const TOP_MEMBER_LIMIT = 8;
const WARN_INTERVAL_MS = 30 * 1000;
const EXPIRED_WINDOW_OFFSET_MS = WARN_INTERVAL_MS + 1000;
const MEMBER_BYTES_UNAVAILABLE = -1;
const TEST_CLIENT_ID = 'payload-attribution-client';
const TEST_CLIENT_LANE = 'snapshot';
const TEST_MESSAGE_TYPE = 'query_result';

function buildDispatchHarness() {
  const warns = [];
  const sent = [];
  const dispatch = Object.create(ADMIN_WEBSOCKET_MESSAGE_DISPATCH_METHODS);
  dispatch.logger = {
    debug: () => {},
    info: () => {},
    warn: (message, fields) => warns.push({message, fields}),
    error: () => {},
  };
  const clientInfo = {
    id: TEST_CLIENT_ID,
    lane: TEST_CLIENT_LANE,
    socket: {
      send: (json) => sent.push(json.length),
    },
  };
  return {dispatch, clientInfo, warns, sent};
}

function buildOversizedMessage() {
  return {
    type: TEST_MESSAGE_TYPE,
    queryId: 'query-attribution-1',
    result: {
      controlSnapshot: 'x'.repeat(OVER_THRESHOLD_MEMBER_BYTES),
      mediumMember: 'y'.repeat(1024),
      tinyMember: 1,
    },
  };
}

test('under-threshold messages log nothing', async (t) => {
  const {dispatch, clientInfo, warns, sent} = buildDispatchHarness();

  dispatch.sendToClient(clientInfo, {
    type: TEST_MESSAGE_TYPE,
    queryId: 'query-attribution-small',
    result: {rows: ['small']},
  });

  t.equal(sent.length, 1, 'should send the message');
  t.equal(warns.length, 0, 'should not warn for under-threshold payloads');
});

test('an over-threshold message logs exactly one warn naming the largest ' +
  'member', async (t) => {
  const {dispatch, clientInfo, warns, sent} = buildDispatchHarness();

  dispatch.sendToClient(clientInfo, buildOversizedMessage());

  t.equal(sent.length, 1, 'should still send the oversized message');
  t.equal(warns.length, 1, 'should warn exactly once');
  const fields = warns[0].fields;
  t.ok(
    fields.totalBytes > THRESHOLD_BYTES,
    'should report the total serialized byte size',
  );
  t.equal(fields.type, TEST_MESSAGE_TYPE, 'should name the message type');
  t.equal(fields.lane, TEST_CLIENT_LANE, 'should name the client lane');
  t.equal(
    fields.payloadMember,
    'result',
    'should name the biggest top-level message member',
  );
  t.ok(
    Array.isArray(fields.topLevelMemberBytes),
    'should attribute member byte sizes',
  );
  t.equal(
    fields.topLevelMemberBytes[0].key,
    'controlSnapshot',
    'should name the largest payload member first',
  );
  t.ok(
    fields.topLevelMemberBytes[0].bytes >= OVER_THRESHOLD_MEMBER_BYTES,
    'should report the largest member byte size',
  );
  t.ok(
    fields.topLevelMemberBytes.length <= TOP_MEMBER_LIMIT,
    'should cap the attribution list',
  );
  const sizes = fields.topLevelMemberBytes.map((member) => member.bytes);
  t.same(
    sizes,
    [...sizes].sort((a, b) => b - a),
    'should list members in descending byte order',
  );
});

test('a second over-threshold message within the rate window logs nothing',
  async (t) => {
    const {dispatch, clientInfo, warns, sent} = buildDispatchHarness();
    const message = buildOversizedMessage();

    dispatch.sendToClient(clientInfo, message);
    dispatch.sendToClient(clientInfo, message);

    t.equal(sent.length, 2, 'should send both messages');
    t.equal(warns.length, 1, 'should warn only once within the rate window');

    dispatch._payloadSizeAttributionLastWarnAtMs =
      Date.now() - EXPIRED_WINDOW_OFFSET_MS;
    dispatch.sendToClient(clientInfo, message);
    t.equal(warns.length, 2, 'should warn again after the window expires');
  });

test('a member that fails to stringify is attributed -1 bytes', async (t) => {
  const {dispatch, clientInfo, warns} = buildDispatchHarness();

  // BigInt members make JSON.stringify throw; the whole message can never
  // reach the socket, but attribution itself must degrade member-by-member.
  dispatch._warnOversizedAdminPayload(
    clientInfo,
    {
      type: TEST_MESSAGE_TYPE,
      result: 'x'.repeat(OVER_THRESHOLD_MEMBER_BYTES),
      unserializableMember: BigInt(1),
    },
    OVER_THRESHOLD_MEMBER_BYTES,
  );

  t.equal(warns.length, 1, 'should warn');
  const fields = warns[0].fields;
  const unserializable = fields.topLevelMemberBytes.find(
    (member) => member.key === 'unserializableMember',
  );
  t.equal(
    unserializable.bytes,
    MEMBER_BYTES_UNAVAILABLE,
    'should report -1 for members that fail to stringify',
  );
});
